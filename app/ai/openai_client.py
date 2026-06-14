import asyncio
import logging

from openai import (
    APIError,
    APITimeoutError,
    AsyncOpenAI,
    AuthenticationError,
    BadRequestError,
    PermissionDeniedError,
    RateLimitError,
)

from app.config import get_settings

logger = logging.getLogger(__name__)


class OpenAIPostClient:
    """Невелика обгортка над OpenAI SDK.

    Її легко замінити на іншого AI-провайдера, бо решта коду викликає тільки
    метод generate_post().
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = AsyncOpenAI(api_key=self.settings.openai_api_key) if self.settings.openai_api_key else None

    async def generate_post(self, text: str, title: str | None = None, force_demo: bool = False) -> str:
        # Тестовий режим примусово обходить OpenAI і повертає локальний демо-текст.
        if force_demo or not self.client:
            return self._demo_post(text=text, title=title)

        prompt = (
            "Зроби короткий, цікавий опис новини для Telegram-каналу. "
            "Додай 1-3 emoji, живий стиль, call to action і не вигадуй фактів. "
            "Відповідь має бути українською мовою, максимум 900 символів."
        )

        last_error: Exception | None = None
        for attempt in range(3):
            try:
                response = await self.client.chat.completions.create(
                    model=self.settings.openai_model,
                    messages=[
                        {"role": "system", "content": prompt},
                        {
                            "role": "user",
                            "content": f"Заголовок: {title or 'немає'}\n\nТекст новини:\n{text}",
                        },
                    ],
                    temperature=0.7,
                    max_tokens=350,
                )
                return response.choices[0].message.content or ""
            except (AuthenticationError, PermissionDeniedError) as exc:
                raise RuntimeError(
                    "OpenAI API Key недійсний. Перевірте правильність ключа, доступ до OpenAI та баланс акаунта."
                ) from exc
            except BadRequestError as exc:
                raise RuntimeError(
                    "Запит до OpenAI відхилено. Перевірте модель, налаштування акаунта та правильність ключа."
                ) from exc
            except RateLimitError as exc:
                raise RuntimeError(
                    "OpenAI тимчасово обмежив запити. Спробуйте ще раз трохи пізніше."
                ) from exc
            except APITimeoutError as exc:
                raise RuntimeError(
                    "OpenAI не відповів вчасно. Перевірте інтернет-з'єднання або повторіть спробу пізніше."
                ) from exc
            except APIError as exc:
                last_error = exc
                delay = 2**attempt
                logger.warning("OpenAI error, retrying in %s seconds: %s", delay, exc)
                await asyncio.sleep(delay)

        raise RuntimeError(
            "Сервіс OpenAI тимчасово недоступний. Перевірте доступ до сервісу та спробуйте ще раз."
        ) from last_error

    @staticmethod
    def _demo_post(text: str, title: str | None = None) -> str:
        """Демо-режим дозволяє перевірити весь pipeline без AI-ключа."""

        short_text = " ".join(text.split())[:500]
        headline = title or "Нова важлива новина"
        return (
            f"📰 {headline}\n\n"
            f"{short_text}\n\n"
            "👉 Стежте за оновленнями в каналі. "
            "#AI #News"
        )
