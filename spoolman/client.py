"""Functions for providing the client interface."""

import logging
import mimetypes
import os
from collections.abc import MutableMapping
from pathlib import Path
from typing import Any, Union

from fastapi.staticfiles import StaticFiles
from starlette.datastructures import Headers
from starlette.responses import FileResponse, Response
from starlette.staticfiles import NotModifiedResponse

logger = logging.getLogger(__name__)

# StaticFiles picks the Content-Type from the stdlib mimetypes registry, whose built-in
# table only learned about .webmanifest in newer Pythons and which otherwise depends on
# the host's /etc/mime.types — absent in slim container images. Without this the web app
# manifest would be served as text/plain on some of the interpreters we support, so
# register it ourselves rather than leaving installability to the environment.
mimetypes.add_type("application/manifest+json", ".webmanifest")

PathLike = Union[str, "os.PathLike[str]"]
Scope = MutableMapping[str, Any]


def _require_client_build(directory: str) -> None:
    """Fail with an actionable message when the client bundle hasn't been built.

    Both clients are build artifacts that are not committed. The Docker images and the
    ``spoolman.zip`` release both ship them pre-built, so this only bites people running
    from a source checkout — where a ``git pull`` brings new client sources but no
    bundle, and Spoolman then refuses to start. StaticFiles' own error for this
    ("Directory 'client_v2/build' does not exist") gives them nothing to act on.
    """
    if Path(directory).is_dir():
        return

    source_dir = Path(directory).parts[0]
    msg = (
        f"The web client has not been built: '{directory}' does not exist. Spoolman serves a "
        f"pre-built client bundle, which is not committed to the repository, so an install from "
        f"source has to build it once after every upgrade:\n"
        f"    cd {source_dir} && npm ci && npm run build\n"
        f"The Docker images and the spoolman.zip release asset already contain it."
    )
    raise RuntimeError(msg)


class SinglePageApplication(StaticFiles):
    """Serve a single page application.

    Handles both the legacy React client and the new Svelte (SvelteKit) client:

    - The legacy client references its assets with ``"./..."`` paths that must be
      rewritten server-side to include the configured base path. Its SPA fallback
      document is ``index.html``. Enable this with ``rewrite_asset_paths=True``.
    - The Svelte client's prerendered per-route documents (e.g. ``index.html``,
      ``locations.html``) use relative asset paths and compute the deploy base at
      runtime, so the browser resolves everything against the current URL and they
      are served verbatim under any base path. Its SPA fallback document
      (``200.html``), however, is emitted with *absolute* asset paths (``/_app/...``)
      and a hardcoded ``base: ""`` — SvelteKit cannot know the deploy base path at
      build time. When a base path is configured we rewrite that fallback so direct
      loads of non-prerendered routes (e.g. ``/spool/show/<id>``, the target of
      printed QR labels) boot correctly. This uses ``rewrite_asset_paths=False`` (the
      fallback fixup is applied automatically when a base path is set).
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
        _require_client_build(directory)
        super().__init__(directory=directory, packages=None, html=True, check_dir=True)
        self.base_path = base_path.removeprefix("/")
        self.fallback_document = fallback_document
        self.rewrite_asset_paths = rewrite_asset_paths

        # NB: don't touch self.html — StaticFiles uses it as the HTML-mode boolean flag.
        self.tweaked_html = ""
        if self.rewrite_asset_paths:
            self.load_and_tweak_index_file()
        elif self.base_path:
            # Svelte client: the prerendered documents already work under any base
            # path; only the SPA fallback needs its absolute asset paths fixed up.
            self.load_and_rewrite_fallback_base_path()

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

    def load_and_rewrite_fallback_base_path(self) -> None:
        """Rewrite the SvelteKit SPA fallback so it boots under a base path.

        SvelteKit's adapter-static emits the fallback document (``200.html``) with
        absolute asset references (``/_app/...``, ``/favicon...``) and a hardcoded
        ``base: ""`` — it cannot know the operator's base path at build time. The
        prerendered per-route documents use relative paths and a runtime-computed
        base, so they work unchanged; only this fallback needs fixing up so that
        direct loads of non-prerendered routes (e.g. ``/spool/show/<id>``, the target
        of printed QR labels) resolve their assets and API base under the base path.

        Only called when a base path is configured (``self.base_path`` non-empty);
        without one the fallback is served verbatim.
        """
        if not self.directory:
            return

        with (Path(self.directory) / self.fallback_document).open() as f:
            html = f.read()

        prefix = f"/{self.base_path}"
        # `"/_app/` covers module preloads, stylesheets and the inline `import("/_app/...")`
        # bootstrap calls; `"/favicon` covers the icon link; `"/manifest.webmanifest` and
        # `"/apple-touch-icon` cover the PWA install metadata (the manifest's own contents
        # are base-path agnostic — every URL in it is relative to the manifest itself — so
        # only the link that points at it needs fixing). `base: ""` is SvelteKit's runtime
        # base, which drives client-side routing and the derived API URL.
        #
        # These are blind string replacements against adapter-static's output. If a
        # SvelteKit upgrade changes how it emits any of them, the replacement silently
        # becomes a no-op and we ship a fallback document that 404s its assets or routes
        # against the wrong base — a failure only visible to operators running under a
        # base path. So require each pattern to actually match, and say which one didn't.
        replacements = [
            ('"/_app/', f'"{prefix}/_app/'),
            ('"/favicon', f'"{prefix}/favicon'),
            ('"/apple-touch-icon', f'"{prefix}/apple-touch-icon'),
            ('"/manifest.webmanifest', f'"{prefix}/manifest.webmanifest'),
            ('base: ""', f'base: "{prefix}"'),
        ]
        missing = [old for old, _ in replacements if old not in html]
        if missing:
            msg = (
                f"Could not rewrite the SPA fallback document ({self.fallback_document}) for base path "
                f"{prefix!r}: expected pattern(s) {missing} not found. The client build is likely from an "
                f"incompatible SvelteKit version; Spoolman would serve a broken page under a base path."
            )
            raise RuntimeError(msg)

        for old, new in replacements:
            html = html.replace(old, new)
        self.tweaked_html = html

    def file_response(
        self,
        full_path: PathLike,
        stat_result: os.stat_result,
        scope: Scope,
        status_code: int = 200,
    ) -> Response:
        """Overriden default file_response.

        Works the same way, but when the requested file is the fallback document and
        we hold a rewritten version of it, we return that instead of the on-disk file.
        That covers the legacy client (all asset paths rewritten with the base path)
        and the Svelte client under a base path (fallback asset paths and runtime base
        fixed up). The Svelte client's prerendered per-route documents are not the
        fallback document, so they are always served verbatim.
        """
        request_headers = Headers(scope=scope)

        # If full_path points to the fallback document and we have a rewritten
        # version of it, return that instead of the raw file.
        if self.tweaked_html and Path(full_path).name == self.fallback_document:
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
