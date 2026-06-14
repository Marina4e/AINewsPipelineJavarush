import hashlib
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.ai.openai_client import OpenAIPostClient
from app.api.auth import require_api_key
from app.api.schemas import (
    ApprovePostRequest,
    DashboardPublicStatus,
    DashboardSettingsRead,
    DashboardSettingsUpdate,
    GenerateRequest,
    GenerateResponse,
    KeywordCreate,
    KeywordRead,
    ManualNewsCreate,
    NewsRead,
    OpenAICheckResponse,
    PostRead,
    RejectPostRequest,
    SourceCreate,
    SourceRead,
    SourceSuggestion,
    SourceUpdate,
    TaskResponse,
    TopicCreate,
    TopicRead,
    TopicUpdate,
)
from app.config import get_settings
from app.database import get_db
from app.models import Keyword, NewsItem, Post, PostStatus, Source, Topic, utc_now
from app.services.settings_service import get_auto_publish_posts, set_auto_publish_posts
from app.services.source_catalog import SOURCE_SUGGESTIONS
from app.tasks import celery_app, generate_post_task, parse_all_sources_task, publish_post_task
from app.utils import normalize_text

router = APIRouter()
AdminOnly = Depends(require_api_key)


def _slugify(value: str) -> str:
    """Мінімальний slug без додаткових залежностей."""

    return normalize_text(value).replace(" ", "-")


def _ensure_topic_exists(db: Session, topic_id: str | None) -> None:
    if topic_id and not db.get(Topic, topic_id):
        raise HTTPException(status_code=404, detail="Topic not found")


async def _create_demo_post_for_news(news: NewsItem, db: Session) -> Post:
    """Створює короткий демо-пост без OpenAI, щоб ручний режим завжди можна було перевірити."""

    existing = db.query(Post).filter(Post.news_id == news.id).one_or_none()
    generated_text = await OpenAIPostClient().generate_post(
        text=news.raw_text or news.summary,
        title=news.title,
        force_demo=True,
    )
    post = existing or Post(news_id=news.id, generated_text=generated_text)
    post.generated_text = generated_text
    post.status = PostStatus.pending_approval
    post.error = None
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


def _dashboard_status_payload(db: Session | None = None, settings=None) -> DashboardPublicStatus:
    settings = settings or get_settings()
    last_delivery = (
        db.query(Post).filter(Post.status == PostStatus.published).order_by(Post.published_at.desc()).first()
        if db
        else None
    )
    return DashboardPublicStatus(
        openai_configured=bool(settings.openai_api_key),
        telegram_target_channel=settings.telegram_target_channel,
        telegram_connected=bool(settings.telegram_bot_token and settings.telegram_target_channel),
        telegram_bot_configured=bool(settings.telegram_bot_token),
        telegram_reader_configured=bool(settings.telegram_api_id and settings.telegram_api_hash),
        last_successful_delivery_at=last_delivery,
    )


def _dashboard_settings_payload(db: Session, settings=None) -> DashboardSettingsRead:
    settings = settings or get_settings()
    last_delivery = (
        db.query(Post).filter(Post.status == PostStatus.published).order_by(Post.published_at.desc()).first()
    )
    return DashboardSettingsRead(
        auto_publish_posts=get_auto_publish_posts(db),
        openai_configured=bool(settings.openai_api_key),
        telegram_target_channel=settings.telegram_target_channel,
        telegram_connected=bool(settings.telegram_bot_token and settings.telegram_target_channel),
        telegram_bot_configured=bool(settings.telegram_bot_token),
        telegram_reader_configured=bool(settings.telegram_api_id and settings.telegram_api_hash),
        last_successful_delivery_at=last_delivery.published_at if last_delivery else None,
    )


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/source-suggestions/", response_model=list[SourceSuggestion])
def source_suggestions() -> list[dict]:
    """Публічний каталог прикладів, щоб користувачу було зрозуміло, звідки брати новини."""

    return SOURCE_SUGGESTIONS


@router.get("/public-status", response_model=DashboardPublicStatus)
def read_public_dashboard_status(db: Session = Depends(get_db)) -> DashboardPublicStatus:
    """Публічний статус без секретів, щоб можна було перевірити Telegram навіть без ADMIN_API_KEY."""

    return _dashboard_status_payload(db=db)


@router.get("/settings", response_model=DashboardSettingsRead, dependencies=[AdminOnly])
def read_dashboard_settings(db: Session = Depends(get_db)) -> DashboardSettingsRead:
    # Frontend бачить тільки статуси підключення, але не самі секретні ключі.
    return _dashboard_settings_payload(db)


@router.patch("/settings", response_model=DashboardSettingsRead, dependencies=[AdminOnly])
def update_dashboard_settings(
    payload: DashboardSettingsUpdate,
    db: Session = Depends(get_db),
) -> DashboardSettingsRead:
    set_auto_publish_posts(db, payload.auto_publish_posts)
    return _dashboard_settings_payload(db)


@router.get("/topics/", response_model=list[TopicRead], dependencies=[AdminOnly])
def list_topics(db: Session = Depends(get_db)) -> list[Topic]:
    return db.query(Topic).order_by(Topic.name.asc()).all()


@router.post("/topics/", response_model=TopicRead, status_code=201, dependencies=[AdminOnly])
def create_topic(payload: TopicCreate, db: Session = Depends(get_db)) -> Topic:
    slug = payload.slug or payload.name
    topic = Topic(
        name=payload.name,
        slug=_slugify(slug),
        description=payload.description,
        enabled=payload.enabled,
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic


@router.patch("/topics/{topic_id}", response_model=TopicRead, dependencies=[AdminOnly])
def update_topic(topic_id: str, payload: TopicUpdate, db: Session = Depends(get_db)) -> Topic:
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    data = payload.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"]:
        data["slug"] = _slugify(data["slug"])

    for field, value in data.items():
        setattr(topic, field, value)

    db.commit()
    db.refresh(topic)
    return topic


@router.delete("/topics/{topic_id}", status_code=204, dependencies=[AdminOnly])
def delete_topic(topic_id: str, db: Session = Depends(get_db)) -> None:
    topic = db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    db.delete(topic)
    db.commit()


@router.get("/sources/", response_model=list[SourceRead], dependencies=[AdminOnly])
def list_sources(db: Session = Depends(get_db)) -> list[Source]:
    return db.query(Source).order_by(Source.created_at.desc()).all()


@router.post("/sources/", response_model=SourceRead, status_code=201, dependencies=[AdminOnly])
def create_source(payload: SourceCreate, db: Session = Depends(get_db)) -> Source:
    _ensure_topic_exists(db, payload.topic_id)
    source = Source(**payload.model_dump())
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


@router.patch("/sources/{source_id}", response_model=SourceRead, dependencies=[AdminOnly])
def update_source(source_id: str, payload: SourceUpdate, db: Session = Depends(get_db)) -> Source:
    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    data = payload.model_dump(exclude_unset=True)
    _ensure_topic_exists(db, data.get("topic_id"))
    for field, value in data.items():
        setattr(source, field, value)

    db.commit()
    db.refresh(source)
    return source


@router.delete("/sources/{source_id}", status_code=204, dependencies=[AdminOnly])
def delete_source(source_id: str, db: Session = Depends(get_db)) -> None:
    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    db.delete(source)
    db.commit()


@router.get("/keywords/", response_model=list[KeywordRead], dependencies=[AdminOnly])
def list_keywords(db: Session = Depends(get_db)) -> list[Keyword]:
    return db.query(Keyword).order_by(Keyword.word.asc()).all()


@router.post("/keywords/", response_model=KeywordRead, status_code=201, dependencies=[AdminOnly])
def create_keyword(payload: KeywordCreate, db: Session = Depends(get_db)) -> Keyword:
    _ensure_topic_exists(db, payload.topic_id)
    word = normalize_text(payload.word)
    existing = db.query(Keyword).filter(Keyword.word == word).one_or_none()
    if existing:
        return existing

    keyword = Keyword(word=word, topic_id=payload.topic_id)
    db.add(keyword)
    db.commit()
    db.refresh(keyword)
    return keyword


@router.delete("/keywords/{keyword_id}", status_code=204, dependencies=[AdminOnly])
def delete_keyword(keyword_id: int, db: Session = Depends(get_db)) -> None:
    keyword = db.get(Keyword, keyword_id)
    if not keyword:
        raise HTTPException(status_code=404, detail="Keyword not found")

    db.delete(keyword)
    db.commit()


@router.get("/news/", response_model=list[NewsRead], dependencies=[AdminOnly])
def list_news(
    limit: int = Query(default=50, ge=1, le=200),
    topic_id: str | None = None,
    source_id: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
) -> list[NewsItem]:
    query = db.query(NewsItem)
    if topic_id:
        query = query.filter(NewsItem.topic_id == topic_id)
    if source_id:
        query = query.filter(NewsItem.source_id == source_id)
    if search:
        pattern = f"%{search}%"
        query = query.filter(or_(NewsItem.title.ilike(pattern), NewsItem.summary.ilike(pattern)))

    return query.order_by(NewsItem.published_at.desc()).limit(limit).all()


@router.get("/posts/", response_model=list[PostRead], dependencies=[AdminOnly])
def list_posts(
    limit: int = Query(default=50, ge=1, le=200),
    status: PostStatus | None = None,
    topic_id: str | None = None,
    db: Session = Depends(get_db),
) -> list[Post]:
    query = db.query(Post)
    if status:
        query = query.filter(Post.status == status)
    if topic_id:
        query = query.join(NewsItem).filter(NewsItem.topic_id == topic_id)

    return query.order_by(Post.created_at.desc()).limit(limit).all()


@router.post("/generate/", response_model=GenerateResponse, dependencies=[AdminOnly])
async def generate_manually(payload: GenerateRequest) -> GenerateResponse:
    try:
        generated = await OpenAIPostClient().generate_post(
            text=payload.text,
            title=payload.title,
            force_demo=payload.mode == "demo",
        )
        return GenerateResponse(generated_text=generated)
    except Exception as exc:
        # Frontend має показувати зрозумілу причину, а не Internal Server Error.
        raise HTTPException(status_code=502, detail=f"AI generation failed: {exc}") from exc


@router.post("/openai/check", response_model=OpenAICheckResponse, dependencies=[AdminOnly])
async def check_openai_key() -> OpenAICheckResponse:
    settings = get_settings()
    if not settings.openai_api_key:
        return OpenAICheckResponse(
            ok=False,
            status="missing",
            message="OpenAI API key не знайдено в environment.",
        )

    try:
        generated = await OpenAIPostClient().generate_post(
            text="Коротка тестова новина для перевірки OpenAI API key.",
            title="OpenAI key check",
            force_demo=False,
        )
        return OpenAICheckResponse(
            ok=True,
            status="verified",
            message="OpenAI API key успішно перевірено реальним запитом.",
            generated_text=generated,
        )
    except Exception as exc:
        return OpenAICheckResponse(
            ok=False,
            status="error",
            message=f"OpenAI API key знайдено, але тестовий запит не пройшов: {exc}",
        )


@router.post("/news/manual", response_model=NewsRead, status_code=201, dependencies=[AdminOnly])
def create_manual_news(payload: ManualNewsCreate, db: Session = Depends(get_db)) -> NewsItem:
    _ensure_topic_exists(db, payload.topic_id)
    raw_identity = f"manual:{payload.title}:{payload.url or payload.summary}"
    news_id = hashlib.sha256(raw_identity.encode("utf-8")).hexdigest()
    existing = db.get(NewsItem, news_id)
    if existing:
        return existing

    news = NewsItem(
        id=news_id,
        title=payload.title,
        url=payload.url,
        summary=payload.summary,
        raw_text=payload.summary,
        source=payload.source,
        topic_id=payload.topic_id,
        published_at=utc_now(),
    )
    db.add(news)
    db.commit()
    db.refresh(news)
    return news


@router.post("/news/{news_id}/generate", response_model=TaskResponse, dependencies=[AdminOnly])
def queue_generation(news_id: str, db: Session = Depends(get_db)) -> TaskResponse:
    if not db.get(NewsItem, news_id):
        raise HTTPException(status_code=404, detail="News item not found")

    task = generate_post_task.delay(news_id)
    return TaskResponse(task_id=task.id, message="AI-пост поставлено в чергу генерації")


@router.post("/news/{news_id}/generate-demo", response_model=PostRead, dependencies=[AdminOnly])
async def generate_demo_post_for_news(news_id: str, db: Session = Depends(get_db)) -> Post:
    news = db.get(NewsItem, news_id)
    if not news:
        raise HTTPException(status_code=404, detail="Новину не знайдено")

    return await _create_demo_post_for_news(news, db)


@router.post("/news/{news_id}/publish-site", response_model=TaskResponse, dependencies=[AdminOnly])
async def mark_news_visible_on_site(news_id: str, db: Session = Depends(get_db)) -> TaskResponse:
    news = db.get(NewsItem, news_id)
    if not news:
        raise HTTPException(status_code=404, detail="Новину не знайдено")

    post = await _create_demo_post_for_news(news, db)
    return TaskResponse(task_id=post.id, message="Новину додано в ленту сайту після AI-редакції")


@router.post("/news/{news_id}/publish-telegram", response_model=TaskResponse, dependencies=[AdminOnly])
async def queue_news_for_telegram(news_id: str, db: Session = Depends(get_db)) -> TaskResponse:
    news = db.get(NewsItem, news_id)
    if not news:
        raise HTTPException(status_code=404, detail="Новину не знайдено")

    post = db.query(Post).filter(Post.news_id == news_id).one_or_none()
    if not post:
        post = await _create_demo_post_for_news(news, db)

    task = publish_post_task.delay(post.id)
    return TaskResponse(task_id=task.id, message="Відредагований текст новини поставлено в чергу Telegram")


@router.post("/posts/{post_id}/approve", response_model=TaskResponse, dependencies=[AdminOnly])
def approve_post(post_id: str, payload: ApprovePostRequest, db: Session = Depends(get_db)) -> TaskResponse:
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.status == PostStatus.published:
        raise HTTPException(status_code=409, detail="Post is already published")

    if payload.generated_text:
        post.generated_text = payload.generated_text
    post.status = PostStatus.generated
    post.error = None
    db.commit()

    task = publish_post_task.delay(post.id)
    return TaskResponse(task_id=task.id, message="Post approved and publishing task queued")


@router.post("/posts/{post_id}/reject", response_model=PostRead, dependencies=[AdminOnly])
def reject_post(post_id: str, payload: RejectPostRequest, db: Session = Depends(get_db)) -> Post:
    post = db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    post.status = PostStatus.rejected
    post.error = payload.reason
    db.commit()
    db.refresh(post)
    return post


@router.post("/posts/{post_id}/publish", response_model=TaskResponse, dependencies=[AdminOnly])
def queue_publishing(post_id: str, db: Session = Depends(get_db)) -> TaskResponse:
    if not db.get(Post, post_id):
        raise HTTPException(status_code=404, detail="Post not found")

    task = publish_post_task.delay(post_id)
    return TaskResponse(task_id=task.id, message="Публікацію в Telegram поставлено в чергу")


@router.post("/pipeline/run", response_model=TaskResponse, dependencies=[AdminOnly])
def run_pipeline() -> TaskResponse:
    task = parse_all_sources_task.delay()
    return TaskResponse(task_id=task.id, message="Збір новин запущено")


@router.get("/tasks/{task_id}", dependencies=[AdminOnly])
def read_task_status(task_id: str) -> dict:
    # Celery result backend дає dashboard стан задачі без ручного читання логів.
    result = celery_app.AsyncResult(task_id)
    return {
        "task_id": task_id,
        "state": result.state,
        "ready": result.ready(),
        "meta": result.info if isinstance(result.info, dict) else {},
        "result": result.result if result.ready() and isinstance(result.result, dict) else {},
    }


@router.get("/pipeline/status", dependencies=[AdminOnly])
def read_pipeline_status(task_id: str | None = None, db: Session = Depends(get_db)) -> dict:
    # Узагальнений статус потрібен для прогресу конвеєра без перезавантаження сторінки.
    task_state = None
    task_meta = {}
    task_result = {}
    if task_id:
        result = celery_app.AsyncResult(task_id)
        task_state = result.state
        task_meta = result.info if isinstance(result.info, dict) else {}
        task_result = result.result if result.ready() and isinstance(result.result, dict) else {}

    posts_by_status = {
        status.value: db.query(Post).filter(Post.status == status).count()
        for status in PostStatus
    }
    return {
        "task_state": task_state,
        "task_meta": task_meta,
        "task_result": task_result,
        "news_count": db.query(NewsItem).count(),
        "posts_by_status": posts_by_status,
        "telegram_delivered": posts_by_status.get(PostStatus.published.value, 0),
    }


@router.get("/logs/errors", dependencies=[AdminOnly])
def read_error_logs(limit: int = Query(default=30, ge=1, le=200)) -> dict[str, list[str]]:
    settings = get_settings()
    log_path = Path(settings.log_dir) / "app.log"
    if not log_path.exists():
        return {"errors": []}

    lines = log_path.read_text(encoding="utf-8").splitlines()
    errors = [line for line in lines if "ERROR" in line or "CRITICAL" in line]
    return {"errors": errors[-limit:]}
