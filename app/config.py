from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    """Єдине місце, де проєкт читає налаштування з .env.

    Такий підхід зручний для Docker: користувач змінює тільки .env,
    а код залишається однаковим для локального запуску і продакшну.
    """

    # Абсолютний шлях до .env гарантує читання ключів навіть тоді,
    # коли uvicorn або VS Code запускає процес з іншої робочої директорії.
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    app_name: str = "AI Telegram News Pipeline"
    api_prefix: str = "/api"

    database_url: str = "sqlite:///./data/aibot.db"
    redis_url: str = "redis://redis:6379/0"
    admin_api_key: str = "change-me-local-admin-key"
    auto_publish_posts: bool = False

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    telegram_api_id: int | None = None
    telegram_api_hash: str = ""
    telegram_bot_token: str = ""
    telegram_session_name: str = "./data/aibot_session"
    telegram_reader_session_name: str = "./data/aibot_reader_session"
    telegram_target_channel: str = ""

    parser_interval_minutes: int = 30
    site_request_timeout: int = 15
    default_news_limit: int = 10

    allowed_languages: list[str] = Field(default_factory=lambda: ["uk", "en"])

    log_dir: Path = Path("logs")
    data_dir: Path = Path("data")

    @field_validator("telegram_api_id", mode="before")
    @classmethod
    def empty_telegram_api_id_to_none(cls, value: object) -> object:
        """Дозволяє залишати TELEGRAM_API_ID порожнім у .env."""

        if value == "":
            return None
        return value


@lru_cache
def get_settings() -> Settings:
    """Кешуємо Settings, щоб не перечитувати .env на кожен запит."""

    settings = Settings()
    settings.log_dir.mkdir(parents=True, exist_ok=True)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    return settings
