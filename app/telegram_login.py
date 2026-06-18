import asyncio

from app.config import get_settings


async def main() -> None:
    """Створює Telethon session-файл для читання Telegram-каналів.

    Запускається вручну командою з README. Telethon попросить номер телефону,
    код підтвердження і, якщо увімкнено, 2FA-пароль.
    """

    settings = get_settings()
    if not settings.telegram_api_id or not settings.telegram_api_hash:
        raise RuntimeError("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env first")

    from telethon import TelegramClient

    async with TelegramClient(
        settings.telegram_reader_session_name,
        settings.telegram_api_id,
        settings.telegram_api_hash,
    ) as client:
        me = await client.get_me()
        print(f"Telethon session is ready for: {getattr(me, 'username', None) or me.id}")


if __name__ == "__main__":
    asyncio.run(main())

