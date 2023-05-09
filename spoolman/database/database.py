"""SQLAlchemy database setup."""

import logging
from collections.abc import AsyncGenerator
from typing import Optional

from sqlalchemy import URL
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from spoolman.database.models import Base
from spoolman.env import get_logging_level


class Database:
    connection_url: URL
    engine: Optional[AsyncEngine]
    session_maker: Optional[async_sessionmaker[AsyncSession]]

    def __init__(self: "Database", connection_url: URL) -> None:
        """Construct the Database wrapper and set config parameters."""
        self.connection_url = connection_url

    def connect(self: "Database") -> None:
        """Connect to the database."""
        if get_logging_level() == logging.DEBUG:
            logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO)

        connect_args = {}
        if self.connection_url.drivername == "sqlite":
            connect_args["check_same_thread"] = False
        elif self.connection_url.drivername == "postgresql":
            connect_args["options"] = "-c timezone=utc"
            connect_args["max_inactive_connection_lifetime"] = 3

        self.engine = create_async_engine(
            self.connection_url,
            connect_args=connect_args,
        )
        self.session_maker = async_sessionmaker(self.engine, autocommit=False, autoflush=True)

    async def create_tables(self: "Database") -> None:
        """Create tables for all defined models."""
        if self.engine is None:
            raise RuntimeError("DB is not connected.")
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)


__db: Optional[Database] = None


async def setup_db(connection_url: URL) -> None:
    """Connect to the database.

    Args:
        connection_url: The URL to connect to the database.
    """
    global __db  # noqa: PLW0603
    __db = Database(connection_url)
    __db.connect()
    await __db.create_tables()


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Get a DB session to be used with FastAPI's dependency system."""
    if __db is None or __db.session_maker is None:
        raise RuntimeError("DB is not setup.")
    async with __db.session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception as exc:
            await session.rollback()
            raise exc
        finally:
            await session.close()
