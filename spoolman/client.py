"""Functions for providing the client interface."""


import logging
import os
from collections.abc import MutableMapping
from pathlib import Path
from typing import Any, Union

from fastapi.staticfiles import StaticFiles
from starlette.datastructures import Headers
from starlette.responses import FileResponse, Response
from starlette.staticfiles import NotModifiedResponse

logger = logging.getLogger(__name__)

PathLike = Union[str, "os.PathLike[str]"]
Scope = MutableMapping[str, Any]


class SinglePageApplication(StaticFiles):
    """Serve a single page application."""

    def __init__(self, directory: str, base_path: str) -> None:
        """Construct."""
        super().__init__(directory=directory, packages=None, html=True, check_dir=True)
        self.base_path = base_path.removeprefix("/")

        self.load_and_tweak_index_file()

    def load_and_tweak_index_file(self) -> None:
        """Load index.html and tweak it by replacing all asset paths."""
        # Open index.html located in self.directory/index.html
        if not self.directory:
            return

        with (Path(self.directory) / "index.html").open() as f:
            html = f.read()

        # Replace all paths that start with "./" with f"/{self.base_path}"
        base_path = "/" if len(self.base_path.strip()) == 0 else f"/{self.base_path}/"
        self.html = html.replace('"./', f'"{base_path}')

    def file_response(
        self,
        full_path: PathLike,
        stat_result: os.stat_result,
        scope: Scope,
        status_code: int = 200,
    ) -> Response:
        """Overriden default file_response.

        Works the same way, but if the client requests any index.html, we will return our tweaked index.html.
        The tweaked index.html has all asset paths updated with the base path.
        """
        method = scope["method"]
        request_headers = Headers(scope=scope)

        # If full_path points to a index.html, return our tweaked index.html
        if Path(full_path).name == "index.html":
            return Response(self.html, status_code=status_code, media_type="text/html")

        response = FileResponse(full_path, status_code=status_code, stat_result=stat_result, method=method)
        if self.is_not_modified(response.headers, request_headers):
            return NotModifiedResponse(response.headers)
        return response

    def lookup_path(self, path: str) -> tuple[str, os.stat_result | None]:
        """Return index.html if the requested file cannot be found."""
        path = path.removeprefix(self.base_path).removeprefix("/")

        full_path, stat_result = super().lookup_path(path)

        if stat_result is None:
            ext = Path(path).suffix
            # Check if user is looking for some specific non-document file
            if len(ext) > 1 and ext != ".html":
                # If so, return 404
                return ("", None)
            # Otherwise, they did look for a document, lead them to index.html
            return super().lookup_path("index.html")

        return (full_path, stat_result)
