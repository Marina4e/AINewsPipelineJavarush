import asyncio

from app.ai.openai_client import OpenAIPostClient


def generate_post_sync(text: str, title: str | None = None) -> str:
    """Синхронний фасад для Celery tasks, які не працюють напряму з async."""

    return asyncio.run(OpenAIPostClient().generate_post(text=text, title=title))

