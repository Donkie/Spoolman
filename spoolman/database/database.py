"""SQLAlchemy database setup."""

from collections.abc import AsyncGenerator
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from spoolman.database.models import Base


class Database:
    connection_url: str
    engine: AsyncEngine
    session_maker: async_sessionmaker[AsyncSession]

    def __init__(self: "Database", connection_url: str) -> None:
        """Construct the Database wrapper and set config parameters."""
        self.connection_url = connection_url

    def connect(self: "Database") -> None:
        """Connect to the database."""
        self.engine = create_async_engine(self.connection_url, connect_args={"check_same_thread": False})
        self.session_maker = async_sessionmaker(self.engine, autocommit=False, autoflush=True)

    async def create_tables(self: "Database") -> None:
        """Create tables for all defined models."""
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)


__db: Optional[Database] = None


async def setup_db(connection_url: str) -> None:
    """Connect the singleton DB object."""
    global __db  # noqa: PLW0603
    __db = Database(connection_url)
    __db.connect()
    await __db.create_tables()


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Get a DB session to be used with FastAPI's dependency system."""
    if __db is None:
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
