from __future__ import annotations

from datetime import timezone

from app.config import get_settings
from app.news_parser.sites import ParsedNews


async def fetch_telegram_news(source_name: str, channel_username: str, limit: int | None = None) -> list[ParsedNews]:
    """Забирає останні повідомлення з публічного Telegram-каналу через Telethon."""

    settings = get_settings()
    if not settings.telegram_api_id or not settings.telegram_api_hash:
        raise RuntimeError("TELEGRAM_API_ID and TELEGRAM_API_HASH are required for Telegram parsing")

    from telethon import TelegramClient

    client = TelegramClient(
        settings.telegram_session_name,
        settings.telegram_api_id,
        settings.telegram_api_hash,
    )

    result: list[ParsedNews] = []
    async with client:
        async for message in client.iter_messages(channel_username, limit=limit or settings.default_news_limit):
            text = (message.message or "").strip()
            if not text:
                continue

            first_line = text.splitlines()[0][:120]
            result.append(
                ParsedNews(
                    title=first_line,
                    url=None,
                    summary=text[:600],
                    source=source_name,
                    published_at=message.date.astimezone(timezone.utc),
                    raw_text=text,
                )
            )

    return result

