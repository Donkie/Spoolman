"""Main entrypoint to the server."""

import logging
import subprocess
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from scheduler.asyncio.scheduler import Scheduler

from spoolman import env
from spoolman.api.v1.router import app as v1_app
from spoolman.client import SinglePageApplication
from spoolman.database import database

# Define a console logger
console_handler = logging.StreamHandler()
console_handler.setFormatter(logging.Formatter("%(name)-26s %(levelname)-8s %(message)s"))

# Setup the spoolman logger, which all spoolman modules will use
root_logger = logging.getLogger()
root_logger.setLevel(env.get_logging_level())
root_logger.addHandler(console_handler)

# Get logger instance for this module
logger = logging.getLogger(__name__)


# Setup FastAPI
app = FastAPI(
    debug=env.is_debug_mode(),
    title="Spoolman",
    version=env.get_version(),
)
app.add_middleware(GZipMiddleware)
app.mount("/api/v1", v1_app)
app.mount("/", app=SinglePageApplication(directory="client/dist"), name="client")


# Allow all origins if in debug mode
if env.is_debug_mode():
    logger.warning("Running in debug mode, allowing all origins.")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Total-Count"],
    )


def add_file_logging() -> None:
    """Add file logging to the root logger."""
    # Define a file logger with log rotation
    log_file = env.get_logs_dir().joinpath("spoolman.log")
    file_handler = TimedRotatingFileHandler(log_file, when="midnight", backupCount=5)
    file_handler.setFormatter(logging.Formatter("%(asctime)s:%(levelname)s:%(message)s", "%Y-%m-%d %H:%M:%S"))
    root_logger.addHandler(file_handler)


@app.on_event("startup")
async def startup() -> None:
    """Run the service's startup sequence."""
    # Check that the data directory is writable
    env.check_write_permissions()

    # Don't add file logging until we have verified that the data directory is writable
    add_file_logging()

    logger.info(
        "Starting Spoolman v%s (commit: %s) (built: %s)",
        app.version,
        env.get_commit_hash(),
        env.get_build_date(),
    )

    logger.info("Using data directory: %s", env.get_data_dir().resolve())
    logger.info("Using logs directory: %s", env.get_logs_dir().resolve())
    logger.info("Using backups directory: %s", env.get_backups_dir().resolve())

    logger.info("Setting up database...")
    database.setup_db(database.get_connection_url())

    logger.info("Performing migrations...")
    # Run alembic in a subprocess.
    # There is some issue with the uvicorn worker that causes the process to hang when running alembic directly.
    # See: https://github.com/sqlalchemy/alembic/discussions/1155
    project_root = Path(__file__).parent.parent
    subprocess.run(["alembic", "upgrade", "head"], check=True, cwd=project_root)  # noqa: S603, S607, ASYNC101

    # Setup scheduler
    schedule = Scheduler()
    database.schedule_tasks(schedule)

    logger.info("Startup complete.")

    if env.is_docker() and not env.is_data_dir_mounted():
        logger.warning("!!!! WARNING !!!!")
        logger.warning("!!!! WARNING !!!!")
        logger.warning("The data directory is not mounted.")
        logger.warning(
            'Spoolman stores its database in the container directory "%s". '
            "If this directory isn't mounted to the host OS, the database will be lost when the container is stopped.",
            env.get_data_dir(),
        )
        logger.warning(
            "Please carefully read the docker part of the README.md file, "
            "and ensure your docker-compose file matches the example.",
        )
        logger.warning("!!!! WARNING !!!!")
        logger.warning("!!!! WARNING !!!!")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
