"""Main entrypoint to the server."""

import logging
import os
import subprocess
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from platformdirs import user_data_dir

from spoolman import env
from spoolman.api.v1.router import app as v1_app
from spoolman.database.database import get_connection_url, setup_db

# Get the data directory
data_dir = Path(user_data_dir("spoolman"))
data_dir.mkdir(parents=True, exist_ok=True)

# Setup file logger
logging.basicConfig(
    filename=data_dir.joinpath("spoolman.log"),
    filemode="w",
    format="%(asctime)s:%(levelname)s:%(message)s",
    datefmt="%Y-%m-%d %I:%M:%S%p",
)

# Setup the base logger
spoolman_logger = logging.getLogger("spoolman")
spoolman_logger.setLevel(env.get_logging_level())

# Log all messages to console
formatter = logging.Formatter("%(name)-12s: %(levelname)-8s %(message)s")
console = logging.StreamHandler()
console.setLevel(env.get_logging_level())
console.setFormatter(formatter)
root_logger = logging.getLogger("")
root_logger.addHandler(console)

# Get logger instance
logger = logging.getLogger(__name__)


# Setup FastAPI
class SinglePageApplication(StaticFiles):
    """Serve a single page application."""

    def __init__(self, directory: str) -> None:
        """Construct."""
        super().__init__(directory=directory, packages=None, html=True, check_dir=True)

    def lookup_path(self, path: str) -> tuple[str, os.stat_result | None]:
        """Return index.html if the requested file cannot be found."""
        full_path, stat_result = super().lookup_path(path)

        if stat_result is None:
            return super().lookup_path("index.html")

        return (full_path, stat_result)


app = FastAPI(debug=env.is_debug_mode())
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
    )


@app.on_event("startup")
async def startup() -> None:
    """Run the service's startup sequence."""
    logger.info("Setting up database...")
    setup_db(get_connection_url())

    logger.info("Performing migrations...")
    # Run alembic in a subprocess.
    # There is some issue with the uvicorn worker that causes the process to hang when running alembic directly.
    # See: https://github.com/sqlalchemy/alembic/discussions/1155
    project_root = Path(__file__).parent.parent
    subprocess.run(["alembic", "upgrade", "head"], check=True, cwd=project_root)  # noqa: S603, S607, ASYNC101

    logger.info("Startup complete.")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
