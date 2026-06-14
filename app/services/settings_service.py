from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AppSetting

AUTO_PUBLISH_KEY = "auto_publish_posts"


def _to_bool(value: str | bool | None) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def get_auto_publish_posts(db: Session) -> bool:
    """Читає live-перемикач dashboard або бере значення з .env під час першого старту."""

    setting = db.get(AppSetting, AUTO_PUBLISH_KEY)
    if setting:
        return _to_bool(setting.value)
    return get_settings().auto_publish_posts


def set_auto_publish_posts(db: Session, enabled: bool) -> AppSetting:
    setting = db.get(AppSetting, AUTO_PUBLISH_KEY)
    if not setting:
        setting = AppSetting(key=AUTO_PUBLISH_KEY, value=str(enabled).lower())
        db.add(setting)
    else:
        setting.value = str(enabled).lower()
    db.commit()
    db.refresh(setting)
    return setting
