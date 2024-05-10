"""Functions for providing the client interface."""

# ruff: noqa: PTH118

import logging
import os
from pathlib import Path
from typing import Union

from fastapi.staticfiles import StaticFiles

logger = logging.getLogger(__name__)


class SinglePageApplication(StaticFiles):
    """Serve a single page application."""

    def __init__(self, directory: str, base_path: str) -> None:
        """Construct."""
        super().__init__(directory=directory, packages=None, html=True, check_dir=True)
        self.base_path = base_path.removeprefix("/")

    def lookup_path(self, path: str) -> tuple[str, Union[os.stat_result, None]]:
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
