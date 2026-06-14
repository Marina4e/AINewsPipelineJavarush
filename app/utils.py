import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings


def configure_logging() -> None:
    """Налаштовуємо логування і в консоль Docker, і у файл logs/app.log."""

    settings = get_settings()
    log_path = Path(settings.log_dir) / "app.log"

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        handlers=[
            logging.StreamHandler(),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def normalize_text(value: str | None) -> str:
    """Зводимо текст до стабільного вигляду для пошуку і дедуплікації."""

    return " ".join((value or "").strip().lower().split())


def make_news_id(title: str, url: str | None, raw_text: str | None) -> str:
    """Створює стабільний SHA-256 id для новини.

    Якщо URL є, він має найбільшу вагу. Якщо URL немає, наприклад для постів
    Telegram, використовуємо title + raw_text.
    """

    fingerprint = normalize_text(url) or f"{normalize_text(title)}::{normalize_text(raw_text)}"
    return hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()

