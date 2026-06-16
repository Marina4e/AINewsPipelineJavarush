import asyncio
import logging

from celery import Celery
from sqlalchemy.orm import Session

from app.ai.generator import generate_post_sync
from app.config import get_settings
from app.database import SessionLocal, init_db
from app.models import NewsItem, Post, PostStatus, Source, SourceType, utc_now
from app.news_parser.sites import fetch_site_news
from app.news_parser.telegram import fetch_telegram_news
from app.services.filtering import is_relevant_news
from app.services.news_service import save_news_if_new
from app.services.settings_service import set_pipeline_current_task_id
from app.telegram.publisher import publish_to_telegram
from app.utils import configure_logging

configure_logging()
logger = logging.getLogger(__name__)
settings = get_settings()

PIPELINE_STAGES = [
    "Pipeline Started",
    "RSS Processing",
    "Telegram Processing",
    "Completed",
]

celery_app = Celery(
    "aibot",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.timezone = "UTC"
celery_app.conf.beat_schedule = {
    "parse-news-every-configured-interval": {
        "task": "app.tasks.parse_all_sources_task",
        "schedule": settings.parser_interval_minutes * 60,
    }
}


def _session() -> Session:
    """Окремий helper, щоб Celery tasks не залежали від FastAPI dependency."""

    init_db()
    return SessionLocal()


def _pipeline_meta(stats: dict, stage_key: str, stage_state: str, stage_label: str | None = None) -> dict:
    stages = {name: "pending" for name in PIPELINE_STAGES}
    stages.update(stats.get("stages", {}))
    stages[stage_key] = stage_state
    payload = {
        **stats,
        "stage_key": stage_key,
        "stage_label": stage_label or stage_key,
        "stages": stages,
        "pipeline_running": stage_state in {"running", "queued"},
    }
    return payload


def _build_news_text(news: NewsItem) -> str:
    """Повертає текст новини для Telegram, навіть якщо AI-пост ще не створено."""

    text = (news.raw_text or news.summary or news.title or "").strip()
    if text:
        return text
    return news.title


@celery_app.task(name="app.tasks.parse_all_sources_task", bind=True)
def parse_all_sources_task(self) -> dict:
    """Перший крок pipeline: зібрати новини з усіх увімкнених джерел."""

    db = _session()
    stats = {
        "sources": 0,
        "rss_sources": 0,
        "telegram_sources": 0,
        "new_items": 0,
        "duplicates": 0,
        "ready_for_generation": 0,
        "queued_for_ai": 0,
        "waiting_approval": 0,
        "errors": 0,
        "stage_key": "Pipeline Started",
        "stage_label": "Pipeline Started",
        "pipeline_running": True,
        "stages": {name: "pending" for name in PIPELINE_STAGES},
    }

    try:
        sources = db.query(Source).filter(Source.enabled.is_(True)).all()
        stats["sources"] = len(sources)
        set_pipeline_current_task_id(db, getattr(self.request, "id", ""))
        # Frontend читає Celery progress meta, щоб показувати стан конвеєра без перезавантаження.
        self.update_state(state="PROGRESS", meta=_pipeline_meta(stats, "Pipeline Started", "running"))

        for source in sources:
            try:
                source.last_checked_at = utc_now()
                if source.type == SourceType.site:
                    stats["stage_key"] = "RSS Processing"
                    stats["stage_label"] = "RSS Processing"
                    self.update_state(state="PROGRESS", meta=_pipeline_meta(stats, "RSS Processing", "running"))
                    parsed_items = fetch_site_news(source.name, source.url)
                    stats["rss_sources"] += 1
                else:
                    stats["stage_key"] = "Telegram Processing"
                    stats["stage_label"] = "Telegram Processing"
                    self.update_state(state="PROGRESS", meta=_pipeline_meta(stats, "Telegram Processing", "running"))
                    parsed_items = asyncio.run(fetch_telegram_news(source.name, source.url))
                    stats["telegram_sources"] += 1

                for parsed in parsed_items:
                    news = parsed.to_model()
                    news.source_id = source.id
                    news.topic_id = source.topic_id
                    is_new = save_news_if_new(db, news)
                    if not is_new:
                        stats["duplicates"] += 1
                        continue

                    stats["new_items"] += 1
                    decision = is_relevant_news(db, news)
                    if decision.accepted:
                        stats["ready_for_generation"] += 1
                        stats["queued_for_ai"] = stats["ready_for_generation"]
                        self.update_state(state="PROGRESS", meta=_pipeline_meta(stats, stats["stage_key"], "running"))
                    else:
                        logger.info("News skipped by filters: %s | %s", news.title, decision.reason)
                source.last_error = None
                source.last_success_at = utc_now()
                db.commit()
            except Exception as exc:
                stats["errors"] += 1
                source.last_error = str(exc)
                db.commit()
                logger.exception("Не вдалося обробити джерело %s: %s", source.name, exc)

        stats["stage_key"] = "Completed"
        stats["stage_label"] = "Completed"
        stats["pipeline_running"] = False
        stats["stages"]["Pipeline Started"] = "completed"
        stats["stages"]["RSS Processing"] = "completed" if stats["rss_sources"] else "pending"
        stats["stages"]["Telegram Processing"] = "completed" if stats["telegram_sources"] else "pending"
        stats["stages"]["Completed"] = "completed"
        self.update_state(state="SUCCESS", meta=_pipeline_meta(stats, "Completed", "completed"))
        return stats
    finally:
        set_pipeline_current_task_id(db, "")
        db.close()


@celery_app.task(name="app.tasks.generate_post_task")
def generate_post_task(news_id: str) -> dict:
    """Другий крок pipeline: згенерувати Telegram-пост через AI."""

    db = _session()
    try:
        news = db.get(NewsItem, news_id)
        if not news:
            return {"status": "failed", "reason": "news not found"}

        existing = db.query(Post).filter(Post.news_id == news_id).one_or_none()
        if existing and existing.status == PostStatus.published:
            return {"status": "skipped", "reason": "already published", "post_id": existing.id}

        try:
            generated_text = generate_post_sync(text=_build_news_text(news), title=news.title)
            post = existing or Post(news_id=news.id, generated_text=generated_text)
            post.generated_text = generated_text
            post.status = PostStatus.pending_approval
            post.error = None
            db.add(post)
            db.commit()

            return {"status": "pending_approval", "post_id": post.id}
        except Exception as exc:
            logger.exception("AI не зміг згенерувати пост для новини %s: %s", news_id, exc)
            post = existing or Post(news_id=news.id, generated_text="")
            post.status = PostStatus.failed
            post.error = str(exc)
            db.add(post)
            db.commit()
            return {"status": "failed", "reason": str(exc)}
    finally:
        db.close()


@celery_app.task(name="app.tasks.publish_post_task")
def publish_post_task(post_id: str) -> dict:
    """Третій крок pipeline: опублікувати готовий пост у Telegram."""

    db = _session()
    try:
        post = db.get(Post, post_id)
        if not post:
            return {"status": "failed", "reason": "post not found"}

        if post.status == PostStatus.published:
            return {"status": "skipped", "reason": "already published"}
        if post.status == PostStatus.rejected:
            return {"status": "skipped", "reason": "post was rejected"}

        try:
            read_url = post.news.url if post.news else None
            if not (post.generated_text or "").strip() and post.news:
                post.generated_text = generate_post_sync(text=_build_news_text(post.news), title=post.news.title)
                db.add(post)
                db.commit()
            asyncio.run(publish_to_telegram(post.generated_text, read_url=read_url, site_url=read_url))
            post.status = PostStatus.published
            post.published_at = utc_now()
            post.error = None
            db.commit()
            return {"status": "published", "post_id": post.id}
        except Exception as exc:
            logger.exception("Telegram не зміг опублікувати пост %s: %s", post_id, exc)
            post.status = PostStatus.failed
            post.error = str(exc)
            db.commit()
            return {"status": "failed", "reason": str(exc)}
    finally:
        db.close()


@celery_app.task(name="app.tasks.run_pipeline_task")
def run_pipeline_task() -> dict:
    """Ручний запуск pipeline з API або CLI."""

    return parse_all_sources_task()
