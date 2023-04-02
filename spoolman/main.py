"""Main entrypoint to the server."""


import uvicorn
from fastapi import FastAPI

from spoolman.api.v1.router import app as v1_app
from spoolman.database.database import setup_db

app = FastAPI(debug=True)
app.mount("/api/v1", v1_app)


@app.on_event("startup")
async def startup() -> None:
    """Run the service's startup sequence."""
    await setup_db("sqlite+aiosqlite:///./sql_app.db")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
