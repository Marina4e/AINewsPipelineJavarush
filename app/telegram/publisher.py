import logging

import requests

from app.config import get_settings

logger = logging.getLogger(__name__)


async def publish_to_telegram(text: str, read_url: str | None = None, site_url: str | None = None) -> None:
    """Публікує текст у Telegram-канал.

    Для звичайного користувача найпростіший шлях - TELEGRAM_BOT_TOKEN.
    Якщо токена немає, використовуємо Telethon-сесію, як в умовах проєкту.
    """

    settings = get_settings()
    if not settings.telegram_target_channel:
        raise RuntimeError("TELEGRAM_TARGET_CHANNEL is not configured")

    if settings.telegram_bot_token:
        buttons = []
        if read_url:
            buttons.append({"text": "Читати", "url": read_url})
        if site_url and site_url != read_url:
            buttons.append({"text": "Відкрити сайт", "url": site_url})

        payload = {
            "chat_id": settings.telegram_target_channel,
            "text": f"📰 Нова новина\n\n{text}",
            "disable_web_page_preview": False,
        }
        if buttons:
            # Це URL-кнопки для читачів каналу, вони не викликають bot-команди.
            payload["reply_markup"] = {"inline_keyboard": [buttons]}

        response = requests.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
            json=payload,
            timeout=20,
        )
        response.raise_for_status()
        logger.info("Published post with Telegram Bot API to %s", settings.telegram_target_channel)
        return

    if not settings.telegram_api_id or not settings.telegram_api_hash:
        raise RuntimeError("TELEGRAM_BOT_TOKEN or TELEGRAM_API_ID/TELEGRAM_API_HASH are required for publishing")

    from telethon import TelegramClient

    client = TelegramClient(
        settings.telegram_session_name,
        settings.telegram_api_id,
        settings.telegram_api_hash,
    )

    async with client:
        await client.send_message(settings.telegram_target_channel, f"📰 Нова новина\n\n{text}")
        logger.info("Published post to Telegram channel %s", settings.telegram_target_channel)
