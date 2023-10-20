"""Functions for providing the client interface."""

# ruff: noqa: PTH118

import os
import secrets
import logging
import json

from typing import Union
from fastapi import FastAPI, Request, Response, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles

from spoolman import env


http_basic_auth = HTTPBasic()

# Get logger instance for this module
logger = logging.getLogger(__name__)


async def is_valid_basic_auth_or_raise(request: Request, username: str, password: str) -> HTTPBasicCredentials:

    credentials = await http_basic_auth(request)
    username_is_valid = secrets.compare_digest(credentials.username, username)
    password_is_valid = secrets.compare_digest(credentials.password, password)

    if not username_is_valid or not password_is_valid:
        logger.warning("Invalid basic-auth")

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid auth",
            headers={"WWW-Authenticate": "Basic"},
        )


class SinglePageApplication(StaticFiles):
    """Serve a single page application."""

    def __init__(self, directory: str) -> None:
        """Construct."""
        super().__init__(directory=directory, packages=None, html=True, check_dir=True)

        self.basic_auth_username = env.get_basic_auth_username()
        self.basic_auth_password = env.get_basic_auth_password()
        self.basic_auth_activated = bool(self.basic_auth_username) and bool(self.basic_auth_password)

        logger.info("basic-auth activated: %s", self.basic_auth_activated)


    async def __call__(self, scope, receive, send) -> None:

        assert scope["type"] == "http"

        request = Request(scope, receive)

        if self.basic_auth_activated:
            await is_valid_basic_auth_or_raise(
                request,
                self.basic_auth_username,
                self.basic_auth_password,
            )

        await super().__call__(scope, receive, send)


    def lookup_path(self, path: str) -> tuple[str, Union[os.stat_result, None]]:
        """Return index.html if the requested file cannot be found."""
        full_path, stat_result = super().lookup_path(path)

        if stat_result is None:
            return super().lookup_path("index.html")

        return (full_path, stat_result)
