"""Functions for generating documentation."""

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from spoolman.api.v1.router import app as v1_app

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
logger.addHandler(logging.StreamHandler())  # Print all log messages to stdout


def generate_openapi(app: FastAPI) -> dict[str, Any]:
    """Generate the OpenAPI document for a specific FastAPI app.

    Args:
        app (FastAPI): The FastAPI app.

    Returns:
        dict[str, Any]: The OpenAPI document.

    """
    return get_openapi(
        title=app.title,
        version=app.version,
        openapi_version=app.openapi_version,
        description=app.description,
        routes=app.routes,
        contact=app.contact,
        license_info=app.license_info,
        servers=app.servers,
        tags=app.openapi_tags,
        terms_of_service=app.terms_of_service,
    )


def generate_docs() -> None:
    """Generate documentation for this service in the docs/ directory."""
    target_dir = Path("docs")

    logger.info('Generating documentation to "%s"...', target_dir.resolve())

    target_dir.mkdir(parents=True, exist_ok=True)

    spec = json.dumps(generate_openapi(v1_app))

    with target_dir.joinpath("index.html").open("w") as f:
        f.write(
            f"""
        <!DOCTYPE html>
        <html>
        <head>
        <title>Spoolman REST API v1 - ReDoc</title>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
        <link rel="shortcut icon" href="https://fastapi.tiangolo.com/img/favicon.png">
        <style> body {{margin: 0; padding: 0; }} </style>
        </head>
        <body>
            <div id="redoc-container"></div>
            <script src="https://cdn.jsdelivr.net/npm/redoc/bundles/redoc.standalone.js"> </script>
            <script>
                var spec = {spec};
                Redoc.init(spec, {{}}, document.getElementById("redoc-container"));
            </script>
        </body>
        </html>""",
        )

    logger.info("Documentation generated successfully.")
