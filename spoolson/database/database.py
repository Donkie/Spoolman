from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

SQLALCHEMY_DATABASE_URL = "sqlite:///./sql_app.db"
# SQLALCHEMY_DATABASE_URL = "postgresql://user:password@postgresserver/db"

engine = create_async_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = async_sessionmaker(engine, autocommit=False, autoflush=False)
