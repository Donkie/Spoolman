"""Main entrypoint to the server."""

import hmac
import logging
import subprocess
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import PlainTextResponse, RedirectResponse, Response
from prometheus_client import generate_latest
from scheduler.asyncio.scheduler import Scheduler

from spoolman import env, externaldb
from spoolman.api.v1.router import app as v1_app
from spoolman.auth import audit, secret
from spoolman.auth.levels import Level
from spoolman.client import SinglePageApplication
from spoolman.database import database
from spoolman.prometheus.metrics import registry

# Define a console logger
console_handler = logging.StreamHandler()
console_handler.setFormatter(logging.Formatter("%(name)-26s %(levelname)-8s %(message)s"))

# Setup the spoolman logger, which all spoolman modules will use
log_level = env.get_logging_level()
root_logger = logging.getLogger()
root_logger.setLevel(log_level)
root_logger.addHandler(console_handler)

# Fix uvicorn logging
logging.getLogger("uvicorn").setLevel(log_level)
if logging.getLogger("uvicorn").handlers:
    logging.getLogger("uvicorn").removeHandler(logging.getLogger("uvicorn").handlers[0])
logging.getLogger("uvicorn").addHandler(console_handler)

logging.getLogger("uvicorn.error").setLevel(log_level)

access_handlers = logging.getLogger("uvicorn.access").handlers
if access_handlers:
    logging.getLogger("uvicorn.access").setLevel(log_level)
    logging.getLogger("uvicorn.access").removeHandler(access_handlers[0])
    logging.getLogger("uvicorn.access").addHandler(console_handler)

# Get logger instance for this module
logger = logging.getLogger(__name__)


# Setup FastAPI
app = FastAPI(
    debug=env.is_debug_mode(),
    title="Spoolman",
    version=env.get_version(),
)
app.add_middleware(GZipMiddleware)
app.mount(env.get_base_path() + "/api/v1", v1_app)


async def metrics_access_permitted(request: Request) -> bool:
    """Check whether a caller may read the metrics endpoint.

    Metrics stay public while authentication is off, so existing Prometheus scrape
    configs keep working untouched. With authentication on, a caller needs either the
    shared SPOOLMAN_METRICS_TOKEN or an API key, unless the operator opts back out with
    SPOOLMAN_METRICS_PUBLIC.

    Both, rather than one or the other. The shared token is a deployment-level secret
    that needs no database and no account, which is what an operator scraping their own
    instance wants and what survives the database being down. An API key is attributable
    and revocable through the interface, which is what you want when the scraper belongs
    to somebody else. Neither is checked before the other for any security reason; the
    token is simply free to check.

    Only API keys are accepted, not session cookies, so that a signed-in browser tab
    does not silently make the endpoint readable. See
    :func:`spoolman.auth.dependencies.api_key_principal`.

    Args:
        request: The incoming request.

    Returns:
        bool: Whether to serve the metrics.

    """
    if not env.is_auth_enabled() or env.is_metrics_public():
        return True

    presented = request.headers.get("x-api-key", "")
    if not presented:
        authorization = request.headers.get("authorization", "")
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer":
            presented = value.strip()
    if not presented:
        return False

    expected = env.get_metrics_token()
    if expected and hmac.compare_digest(presented, expected):
        return True

    from spoolman.auth.dependencies import api_key_principal  # noqa: PLC0415

    principal = await api_key_principal(request)
    return principal is not None and principal.covers(Level.READ)


# WA for prometheus /metrics bind with SinglePageApp at root
@app.get(
    env.get_base_path() + "/metrics",
    response_class=PlainTextResponse,
    name="Get metrics for prometheus",
    description=(
        "Get app metrics for prometheusIf enabled SPOOLMAN_METRICS_ENABLED returned metrics by Spools and Filaments"
    ),
)
async def get_metrics(request: Request) -> Response:
    """Return prometheus metrics."""
    if not await metrics_access_permitted(request):
        return PlainTextResponse("Unauthorized", status_code=401)
    return PlainTextResponse(generate_latest(registry))


base_path = env.get_base_path()
if base_path != "":
    logger.info("Base path is: %s", base_path)

    # If base path is set, add a redirect from non-slash suffix to slash
    # suffix. Otherwise it won't work.
    @app.get(base_path)
    def root_redirect() -> Response:
        """Redirect to base path."""
        return RedirectResponse(base_path + "/")


# Return a dynamic js config file
# This is so that the client side can access the base path variable.
@app.get(env.get_base_path() + "/config.js")
def get_configjs() -> Response:
    """Return a dynamic js config file."""
    if '"' in base_path:
        raise ValueError("Base path contains quotes, which are not allowed.")

    return Response(
        content=f"""
window.SPOOLMAN_BASE_PATH = "{base_path}";
""",
        media_type="text/javascript",
    )


# Mount the client side app. The new Svelte client is served by default; set
# SPOOLMAN_LEGACY_CLIENT to fall back to the old React client.
if env.is_legacy_client_enabled():
    logger.info("Serving the legacy (React) client.")
    app.mount(
        base_path,
        app=SinglePageApplication(
            directory="client/dist",
            base_path=env.get_base_path(),
            fallback_document="index.html",
            rewrite_asset_paths=True,
        ),
    )
else:
    app.mount(
        base_path,
        app=SinglePageApplication(
            directory="client_v2/build",
            base_path=env.get_base_path(),
            fallback_document="200.html",
            rewrite_asset_paths=False,
        ),
    )


def add_cors_middleware() -> None:
    """Add CORS middleware to the FastAPI app based on environment settings."""
    origins: list[str] = []
    origin_regex: str | None = None
    if env.is_debug_mode():
        # Reflect whatever Origin asked, rather than sending a literal "*".
        #
        # allow_credentials=True below makes Starlette emit "*" verbatim, and browsers
        # reject that outright for any request carrying credentials. Nothing noticed
        # while the API was anonymous, but it silently breaks cookie-authenticated
        # requests from the Vite dev server on port 5174 to the backend on 8000, which
        # is the whole point of debug mode. Echoing the origin is what the wildcard was
        # already trying to express.
        logger.warning("Running in debug mode, reflecting all origins.")
        origin_regex = ".*"
    elif env.is_cors_defined():
        cors_origins = env.get_cors_origin()
        if cors_origins:
            logger.info("CORS origins defined: %s", cors_origins)
            origins = cors_origins
        else:
            logger.warning("CORS origins are not defined, no CORS will be applied.")

    if not origins and origin_regex is None:
        return

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_origin_regex=origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Total-Count"],
    )


add_cors_middleware()


def log_auth_status() -> None:
    """Report the authentication configuration, and warn about combinations that surprise."""
    if not env.is_auth_enabled():
        return

    from collections import Counter  # noqa: PLC0415

    from spoolman.api.v1.router import ROUTE_LEVELS  # noqa: PLC0415

    counts = Counter(str(level) for level in ROUTE_LEVELS.values())
    logger.info(
        "Authentication is enabled. %d API routes are gated (read: %d, edit: %d, manage: %d).",
        len(ROUTE_LEVELS),
        counts.get("read", 0),
        counts.get("edit", 0),
        counts.get("manage", 0),
    )

    if env.is_legacy_client_enabled():
        # The React client has no sign-in screen and no cookie or CSRF handling, so it
        # will fail every request with no way for the user to authenticate.
        logger.warning(
            "SPOOLMAN_LEGACY_CLIENT is set together with authentication. The legacy client "
            "does not support signing in and will not work. Unset one of the two.",
        )

    if env.is_metrics_enabled() and not env.is_metrics_public() and not env.get_metrics_token():
        logger.warning(
            "Metrics are enabled but no SPOOLMAN_METRICS_TOKEN is set, so /metrics will "
            "reject every scrape. Set a token, or set SPOOLMAN_METRICS_PUBLIC=TRUE.",
        )


def add_file_logging() -> None:
    """Add file logging to the root logger."""
    # Define a file logger with log rotation
    log_file = env.get_logs_dir().joinpath("spoolman.log")
    file_handler = TimedRotatingFileHandler(log_file, when="midnight", backupCount=5)
    file_handler.setFormatter(logging.Formatter("%(asctime)s:%(levelname)s:%(message)s", "%Y-%m-%d %H:%M:%S"))
    root_logger.addHandler(file_handler)

    logging.getLogger("uvicorn").addHandler(file_handler)
    access_handlers = logging.getLogger("uvicorn.access").handlers
    if access_handlers:
        logging.getLogger("uvicorn.access").addHandler(file_handler)


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

    # Resolve the secret key before the database work. It needs a writable data
    # directory but no schema, so failing here gives an actionable error ahead of the
    # migration subprocess. Guarded so an auth-disabled instance never grows the file.
    if env.is_auth_enabled():
        secret.ensure_secret_key()

    logger.info("Setting up database...")
    database.setup_db(database.get_connection_url())

    logger.info("Performing migrations...")
    # Run alembic in a subprocess.
    # There is some issue with the uvicorn worker that causes the process to hang when running alembic directly.
    # See: https://github.com/sqlalchemy/alembic/discussions/1155
    project_root = Path(__file__).parent.parent
    subprocess.run(["alembic", "upgrade", "head"], check=True, cwd=project_root)  # noqa: ASYNC221, S607

    # Setup scheduler
    schedule = Scheduler()
    database.schedule_tasks(schedule)
    externaldb.schedule_tasks(schedule)
    audit.schedule_tasks(schedule)

    log_auth_status()

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
