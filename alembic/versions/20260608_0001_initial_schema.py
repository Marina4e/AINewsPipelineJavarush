"""Initial schema for AI Telegram news pipeline.

Revision ID: 20260608_0001
Revises:
Create Date: 2026-06-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260608_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


source_type = postgresql.ENUM("site", "tg", name="sourcetype", create_type=False)
post_status = postgresql.ENUM(
    "new",
    "generated",
    "pending_approval",
    "published",
    "failed",
    "rejected",
    name="poststatus",
    create_type=False,
)


def upgrade() -> None:
    postgresql.ENUM("site", "tg", name="sourcetype").create(op.get_bind(), checkfirst=True)
    postgresql.ENUM(
        "new",
        "generated",
        "pending_approval",
        "published",
        "failed",
        "rejected",
        name="poststatus",
    ).create(op.get_bind(), checkfirst=True)

    op.create_table(
        "topics",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_topics_slug", "topics", ["slug"])

    op.create_table(
        "sources",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("type", source_type, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("topic_id", sa.String(length=36), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sources_topic_id", "sources", ["topic_id"])

    op.create_table(
        "keywords",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("word", sa.String(length=80), nullable=False),
        sa.Column("topic_id", sa.String(length=36), nullable=True),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_keywords_word", "keywords", ["word"], unique=True)
    op.create_index("ix_keywords_topic_id", "keywords", ["topic_id"])

    op.create_table(
        "news_items",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("url", sa.String(length=800), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=120), nullable=False),
        sa.Column("source_id", sa.String(length=36), nullable=True),
        sa.Column("topic_id", sa.String(length=36), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"]),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("url", name="uq_news_items_url"),
    )
    op.create_index("ix_news_items_source", "news_items", ["source"])
    op.create_index("ix_news_items_source_id", "news_items", ["source_id"])
    op.create_index("ix_news_items_topic_id", "news_items", ["topic_id"])

    op.create_table(
        "posts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("news_id", sa.String(length=64), nullable=False),
        sa.Column("generated_text", sa.Text(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", post_status, nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["news_id"], ["news_items.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("news_id"),
    )
    op.create_index("ix_posts_status", "posts", ["status"])


def downgrade() -> None:
    op.drop_index("ix_posts_status", table_name="posts")
    op.drop_table("posts")
    op.drop_index("ix_news_items_topic_id", table_name="news_items")
    op.drop_index("ix_news_items_source_id", table_name="news_items")
    op.drop_index("ix_news_items_source", table_name="news_items")
    op.drop_table("news_items")
    op.drop_index("ix_keywords_topic_id", table_name="keywords")
    op.drop_index("ix_keywords_word", table_name="keywords")
    op.drop_table("keywords")
    op.drop_index("ix_sources_topic_id", table_name="sources")
    op.drop_table("sources")
    op.drop_index("ix_topics_slug", table_name="topics")
    op.drop_table("topics")
    post_status.drop(op.get_bind(), checkfirst=True)
    source_type.drop(op.get_bind(), checkfirst=True)
