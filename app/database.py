from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    """Базовий клас для всіх SQLAlchemy моделей."""


settings = get_settings()

# check_same_thread=False потрібен для SQLite у FastAPI/Celery сценаріях,
# де різні потоки можуть відкривати сесії до однієї бази.
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db() -> None:
    """Створює таблиці тільки для локального SQLite/test режиму.

    Для PostgreSQL схема керується Alembic. Це не дає FastAPI або Celery
    випадково створити частину таблиць/enum-типів раніше за міграції.
    """

    from app import models  # noqa: F401  # Імпорт реєструє моделі в Base.metadata.

    if settings.database_url.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: відкриває і гарантовано закриває DB-сесію."""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
