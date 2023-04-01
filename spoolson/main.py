"""Main entrypoint to the server."""

import uvicorn
from fastapi import FastAPI

import spoolson.api.v1.router

app = FastAPI()

app.mount("/api/v1", spoolson.api.v1.router.app)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
