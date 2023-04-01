"""Main entrypoint to the server."""

from fastapi import FastAPI

import spoolson.api.v1.router

app = FastAPI()

app.include_router(spoolson.api.v1.router.router)
