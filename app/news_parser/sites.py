from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import feedparser
import requests

from app.config import get_settings
from app.models import NewsItem
from app.utils import make_news_id


@dataclass(frozen=True)
class ParsedNews:
    """Легка DTO-модель для парсерів до перетворення у SQLAlchemy модель."""

    title: str
    url: str | None
    summary: str
    source: str
    published_at: datetime
    raw_text: str | None = None

    def to_model(self) -> NewsItem:
        return NewsItem(
            id=make_news_id(self.title, self.url, self.raw_text or self.summary),
            title=self.title,
            url=self.url,
            summary=self.summary,
            source=self.source,
            published_at=self.published_at,
            raw_text=self.raw_text,
        )


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)

    try:
        parsed = parsedate_to_datetime(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)


def fetch_site_news(source_name: str, feed_url: str, limit: int | None = None) -> list[ParsedNews]:
    """Парсить RSS/Atom стрічку сайту.

    RSS обрано спеціально: це простіше і стабільніше, ніж HTML scraping, а для
    новинних сайтів RSS часто доступний офіційно.
    """

    settings = get_settings()
    response = requests.get(feed_url, timeout=settings.site_request_timeout)
    response.raise_for_status()

    feed = feedparser.parse(response.text)
    items: list[ParsedNews] = []

    for entry in feed.entries[: limit or settings.default_news_limit]:
        title = entry.get("title", "Без назви")
        url = entry.get("link")
        summary = entry.get("summary") or entry.get("description") or title
        published_at = _parse_datetime(entry.get("published") or entry.get("updated"))

        items.append(
            ParsedNews(
                title=title,
                url=url,
                summary=summary,
                source=source_name,
                published_at=published_at,
                raw_text=summary,
            )
        )

    return items

