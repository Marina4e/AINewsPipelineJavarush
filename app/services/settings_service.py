from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AppSetting

AUTO_PUBLISH_KEY = "auto_publish_posts"
PIPELINE_CURRENT_TASK_ID_KEY = "pipeline_current_task_id"


def _to_bool(value: str | bool | None) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _get_setting(db: Session, key: str) -> AppSetting | None:
    return db.get(AppSetting, key)


def _set_setting(db: Session, key: str, value: str) -> AppSetting:
    setting = db.get(AppSetting, key)
    if not setting:
        setting = AppSetting(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value
    db.commit()
    db.refresh(setting)
    return setting


def get_auto_publish_posts(db: Session) -> bool:
    """Читає live-перемикач dashboard або бере значення з .env під час першого старту."""

    setting = _get_setting(db, AUTO_PUBLISH_KEY)
    if setting:
        return _to_bool(setting.value)
    return get_settings().auto_publish_posts


def set_auto_publish_posts(db: Session, enabled: bool) -> AppSetting:
    return _set_setting(db, AUTO_PUBLISH_KEY, str(enabled).lower())


def get_pipeline_current_task_id(db: Session) -> str:
    setting = _get_setting(db, PIPELINE_CURRENT_TASK_ID_KEY)
    return setting.value.strip() if setting and setting.value else ""


def set_pipeline_current_task_id(db: Session, task_id: str | None) -> AppSetting:
    return _set_setting(db, PIPELINE_CURRENT_TASK_ID_KEY, str(task_id or "").strip())
