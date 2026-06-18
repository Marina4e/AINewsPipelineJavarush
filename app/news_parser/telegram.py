from __future__ import annotations

import html
import re
from datetime import timezone
from urllib.parse import urlparse

import requests

from app.config import get_settings
from app.news_parser.sites import ParsedNews
from app.news_parser.sites import _parse_datetime


TG_MESSAGE_RE = re.compile(r'(<div class="tgme_widget_message_wrap.*?)(?=<div class="tgme_widget_message_wrap|\Z)', re.DOTALL)
TG_TEXT_RE = re.compile(r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', re.DOTALL)
TG_DATE_RE = re.compile(r'<time[^>]*datetime="([^"]+)"', re.DOTALL)
TG_LINK_RE = re.compile(r'<a class="tgme_widget_message_date" href="([^"]+)"', re.DOTALL)
TG_TAG_RE = re.compile(r"<[^>]+>")


def normalize_telegram_peer(value: str) -> str:
    """Приводить @username або t.me URL до peer, який стабільно читає Telethon."""

    text = (value or "").strip()
    if not text:
        return text
    if text.startswith("@"):
        return text
    if "://" not in text and text.startswith("t.me/"):
        text = f"https://{text}"
    if "://" not in text and text.startswith("telegram.me/"):
        text = f"https://{text}"
    if text.startswith("http://") or text.startswith("https://"):
        parsed = urlparse(text)
        path = parsed.path.strip("/")
        if path:
            return f"@{path.split('/')[0]}"
    return f"@{text.lstrip('@').strip('/')}"


def telegram_public_web_url(value: str) -> str:
    peer = normalize_telegram_peer(value).lstrip("@")
    return f"https://t.me/s/{peer}"


def _html_to_text(value: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    text = TG_TAG_RE.sub("", text)
    text = html.unescape(text)
    return "\n".join(line.strip() for line in text.splitlines() if line.strip()).strip()


def fetch_telegram_news_from_web(source_name: str, channel_username: str, limit: int | None = None) -> list[ParsedNews]:
    """Fallback для публічних каналів через web-view Telegram, якщо Telethon недоступний."""

    settings = get_settings()
    response = requests.get(telegram_public_web_url(channel_username), timeout=settings.site_request_timeout)
    response.raise_for_status()

    items: list[ParsedNews] = []
    blocks = TG_MESSAGE_RE.findall(response.text)
    for block in blocks[: limit or settings.default_news_limit]:
        text_match = TG_TEXT_RE.search(block)
        if not text_match:
            continue
        text = _html_to_text(text_match.group(1))
        if not text:
            continue
        date_match = TG_DATE_RE.search(block)
        link_match = TG_LINK_RE.search(block)
        first_line = text.splitlines()[0][:120]
        items.append(
            ParsedNews(
                title=first_line,
                url=link_match.group(1) if link_match else None,
                summary=text[:600],
                source=source_name,
                published_at=_parse_datetime(date_match.group(1) if date_match else None),
                raw_text=text,
            )
        )

    return items


async def fetch_telegram_news(source_name: str, channel_username: str, limit: int | None = None) -> list[ParsedNews]:
    """Забирає останні повідомлення з публічного Telegram-каналу через Telethon."""

    settings = get_settings()
    if not settings.telegram_api_id or not settings.telegram_api_hash:
        return fetch_telegram_news_from_web(source_name, channel_username, limit=limit)

    from telethon import TelegramClient

    client = TelegramClient(
        settings.telegram_reader_session_name,
        settings.telegram_api_id,
        settings.telegram_api_hash,
    )

    result: list[ParsedNews] = []
    peer = normalize_telegram_peer(channel_username)
    try:
        async with client:
            me = await client.get_me()
            if getattr(me, "bot", False):
                raise RuntimeError(
                    "Telegram reader session is authorized as a bot. "
                    "Create a separate user Telethon session for parsing public channels."
                )
            async for message in client.iter_messages(peer, limit=limit or settings.default_news_limit):
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
    except Exception:
        return fetch_telegram_news_from_web(source_name, channel_username, limit=limit)

    return result

