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
    """Serve a single page application.

    Handles both the legacy React client and the new Svelte (SvelteKit) client:

    - The legacy client references its assets with ``"./..."`` paths that must be
      rewritten server-side to include the configured base path. Its SPA fallback
      document is ``index.html``. Enable this with ``rewrite_asset_paths=True``.
    - The Svelte client is built with relative asset paths (SvelteKit
      ``paths.relative``), so the browser resolves them against the current URL and
      no rewriting is needed. Its SPA fallback document is ``200.html``, and it also
      ships prerendered per-route documents (e.g. ``locations.html``).
    """

    def __init__(
        self,
        directory: str,
        base_path: str,
        *,
        fallback_document: str = "index.html",
        rewrite_asset_paths: bool = True,
    ) -> None:
        """Construct."""
        super().__init__(directory=directory, packages=None, html=True, check_dir=True)
        self.base_path = base_path.removeprefix("/")
        self.fallback_document = fallback_document
        self.rewrite_asset_paths = rewrite_asset_paths

        # NB: don't touch self.html — StaticFiles uses it as the HTML-mode boolean flag.
        self.tweaked_html = ""
        if self.rewrite_asset_paths:
            self.load_and_tweak_index_file()

    def load_and_tweak_index_file(self) -> None:
        """Load the fallback document and tweak it by replacing all asset paths."""
        # Open the fallback document located in self.directory
        if not self.directory:
            return

        with (Path(self.directory) / self.fallback_document).open() as f:
            html = f.read()

        # Replace all paths that start with "./" with f"/{self.base_path}"
        base_path = "/" if len(self.base_path.strip()) == 0 else f"/{self.base_path}/"
        self.tweaked_html = html.replace('"./', f'"{base_path}')

    def file_response(
        self,
        full_path: PathLike,
        stat_result: os.stat_result,
        scope: Scope,
        status_code: int = 200,
    ) -> Response:
        """Overriden default file_response.

        Works the same way, but for the legacy client, when it requests the fallback
        document we return our tweaked version with all asset paths updated with the
        base path. The Svelte client uses relative asset paths, so its documents are
        served verbatim.
        """
        request_headers = Headers(scope=scope)

        # If full_path points to the fallback document, return our tweaked version
        if self.rewrite_asset_paths and Path(full_path).name == self.fallback_document:
            return Response(self.tweaked_html, status_code=status_code, media_type="text/html")

        # Starlette >=1.x dropped the `method` kwarg from FileResponse; it now derives
        # HEAD handling from the request scope internally when the response is called.
        response = FileResponse(full_path, status_code=status_code, stat_result=stat_result)
        if self.is_not_modified(response.headers, request_headers):
            return NotModifiedResponse(response.headers)
        return response

    def lookup_path(self, path: str) -> tuple[str, os.stat_result | None]:
        """Return the fallback document if the requested file cannot be found."""
        # The ASGI mount (app.mount(base_path, ...)) already strips the base path
        # from the request, so `path` arrives base-relative. Do NOT strip base_path
        # again here as a raw string prefix — that corrupts asset names that merely
        # start with it (e.g. "spoolman.svg" under base "spool" -> "man.svg").
        path = path.removeprefix("/")

        full_path, stat_result = super().lookup_path(path)

        if stat_result is None:
            ext = Path(path).suffix
            # Check if user is looking for some specific non-document file
            if len(ext) > 1 and ext != ".html":
                # If so, return 404
                return ("", None)
            # The Svelte client prerenders a document per route (e.g. "/locations" ->
            # "locations.html"). Serve that if it exists so the initial paint is correct.
            if path and not path.endswith(".html"):
                route_full, route_stat = super().lookup_path(path + ".html")
                if route_stat is not None:
                    return (route_full, route_stat)
            # Otherwise, they did look for a document, lead them to the fallback document
            return super().lookup_path(self.fallback_document)

        return (full_path, stat_result)
