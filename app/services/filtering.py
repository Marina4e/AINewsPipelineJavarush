from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Keyword, NewsItem
from app.utils import normalize_text


@dataclass(frozen=True)
class FilterDecision:
    """Результат фільтрації: пропускаємо новину чи пояснюємо причину відмови."""

    accepted: bool
    reason: str = ""


def detect_language_soft(text: str) -> str:
    """Пробує визначити мову, але не ламає pipeline, якщо бібліотека помилилась.

    langdetect не ідеальний на коротких заголовках, тому unknown не відкидаємо
    автоматично. Це навчальний баланс між корисністю і простотою.
    """

    try:
        from langdetect import detect

        return detect(text)
    except Exception:
        return "unknown"


def is_relevant_news(db: Session, news: NewsItem) -> FilterDecision:
    settings = get_settings()
    searchable_text = normalize_text(f"{news.title} {news.summary} {news.raw_text or ''}")

    language = detect_language_soft(searchable_text)
    if language != "unknown" and language not in settings.allowed_languages:
        return FilterDecision(False, f"language '{language}' is not allowed")

    keyword_query = db.query(Keyword)
    if news.topic_id:
        # Беремо глобальні ключі + ключі конкретної теми. Так можна мати
        # загальні фільтри ("AI") і тематичні ("startup" тільки для business).
        keyword_query = keyword_query.filter(
            (Keyword.topic_id.is_(None)) | (Keyword.topic_id == news.topic_id)
        )

    keywords = [normalize_text(item.word) for item in keyword_query.all()]
    if not keywords:
        return FilterDecision(True, "no keywords configured")

    if any(keyword in searchable_text for keyword in keywords):
        return FilterDecision(True, "matched keyword")

    return FilterDecision(False, "no keyword matched")
