"""Functions for providing the client interface."""

# ruff: noqa: PTH118

import os
from typing import Union

from fastapi.staticfiles import StaticFiles


class SinglePageApplication(StaticFiles):
    """Serve a single page application."""

    def __init__(self, directory: str) -> None:
        """Construct."""
        super().__init__(directory=directory, packages=None, html=True, check_dir=True)

    def lookup_path(self, path: str) -> tuple[str, Union[os.stat_result, None]]:
        """Return index.html if the requested file cannot be found."""
        full_path, stat_result = super().lookup_path(path)

        if stat_result is None:
            return super().lookup_path("index.html")

        return (full_path, stat_result)
