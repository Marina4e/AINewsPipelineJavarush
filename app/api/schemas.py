from datetime import datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import PostStatus, SourceType


class SourceBase(BaseModel):
    type: SourceType
    name: str = Field(min_length=2, max_length=120)
    url: str = Field(min_length=2, max_length=500)
    topic_id: str | None = None
    enabled: bool = True


class SourceCreate(SourceBase):
    pass


class SourceUpdate(BaseModel):
    type: SourceType | None = None
    name: str | None = Field(default=None, min_length=2, max_length=120)
    url: str | None = Field(default=None, min_length=2, max_length=500)
    topic_id: str | None = None
    enabled: bool | None = None


class SourceRead(SourceBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    last_error: str | None = None
    last_checked_at: datetime | None = None
    last_success_at: datetime | None = None
    created_at: datetime


class TopicBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = None
    enabled: bool = True


class TopicCreate(TopicBase):
    pass


class TopicUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    slug: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = None
    enabled: bool | None = None


class TopicRead(TopicBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


class KeywordCreate(BaseModel):
    word: str = Field(min_length=2, max_length=80)
    topic_id: str | None = None


class KeywordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    word: str
    topic_id: str | None


class NewsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    url: str | None
    summary: str
    source: str
    source_id: str | None
    topic_id: str | None
    published_at: datetime
    raw_text: str | None


class PostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    news_id: str
    news: NewsRead | None = None
    generated_text: str
    published_at: datetime | None
    status: PostStatus
    error: str | None
    created_at: datetime
    updated_at: datetime


class GenerateRequest(BaseModel):
    text: str = Field(min_length=10)
    title: str | None = None
    mode: Literal["demo", "openai"] = "openai"


class GenerateResponse(BaseModel):
    generated_text: str


class OpenAICheckResponse(BaseModel):
    ok: bool
    status: str
    message: str
    generated_text: str | None = None


class TelegramCheckResponse(BaseModel):
    ok: bool
    status: str
    message: str
    bot_ok: bool = False
    channel_ok: bool = False
    target_channel: str | None = None


class ManualNewsCreate(BaseModel):
    title: str = Field(min_length=3, max_length=500)
    summary: str = Field(min_length=10)
    url: str | None = Field(default=None, max_length=800)
    source: str = Field(default="Manual dashboard", min_length=2, max_length=120)
    topic_id: str | None = None


class TaskResponse(BaseModel):
    task_id: str
    message: str


class PipelineControlRequest(BaseModel):
    task_id: str | None = None


# Схеми dashboard-статусів віддають frontend тільки безпечні прапорці без секретів.
class DashboardPublicStatus(BaseModel):
    openai_configured: bool
    telegram_target_channel: str
    telegram_connected: bool
    telegram_bot_configured: bool
    telegram_reader_configured: bool
    last_successful_delivery_at: datetime | None = None


class DashboardSettingsRead(BaseModel):
    auto_publish_posts: bool
    openai_configured: bool
    telegram_target_channel: str
    telegram_connected: bool
    telegram_bot_configured: bool
    telegram_reader_configured: bool
    last_successful_delivery_at: datetime | None = None


class DashboardSettingsUpdate(BaseModel):
    auto_publish_posts: bool


class ApprovePostRequest(BaseModel):
    generated_text: str | None = Field(default=None, min_length=1)


class RejectPostRequest(BaseModel):
    reason: str = Field(default="Rejected from dashboard", min_length=2, max_length=500)


class SourceSuggestion(BaseModel):
    type: SourceType
    name: str
    url: str
    topic_slug: str
    description: str
