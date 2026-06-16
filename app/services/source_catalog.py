from app.models import SourceType


# Каталог показується у frontend як швидкий старт для RSS і Telegram-джерел.
# Telegram-приклади нижче - реальні публічні канали для демо та перевірки UX.
SOURCE_SUGGESTIONS = [
    {
        "type": SourceType.site,
        "name": "OpenAI News",
        "url": "https://openai.com/news/rss.xml",
        "topic_slug": "ai",
        "description": "Новини OpenAI, моделі, API та релізи продуктів.",
    },
    {
        "type": SourceType.site,
        "name": "Anthropic",
        "url": "https://www.anthropic.com/news",
        "topic_slug": "ai",
        "description": "Офіційні новини Anthropic про Claude та AI-дослідження.",
    },
    {
        "type": SourceType.site,
        "name": "Google DeepMind",
        "url": "https://deepmind.google/discover/blog/",
        "topic_slug": "ai",
        "description": "Дослідження, моделі та публікації DeepMind.",
    },
    {
        "type": SourceType.site,
        "name": "Hugging Face",
        "url": "https://huggingface.co/blog/feed.xml",
        "topic_slug": "ai",
        "description": "Оновлення open-source AI та ML-екосистеми.",
    },
    {
        "type": SourceType.site,
        "name": "VentureBeat AI",
        "url": "https://venturebeat.com/category/ai/feed/",
        "topic_slug": "ai",
        "description": "Швидкі новини про AI, стартапи й корпоративні запуски.",
    },
    {
        "type": SourceType.tg,
        "name": "Telegram News",
        "url": "https://t.me/telegram",
        "topic_slug": "technology",
        "description": "Офіційний канал Telegram з новинами платформи.",
    },
    {
        "type": SourceType.tg,
        "name": "BotNews",
        "url": "https://t.me/BotNews",
        "topic_slug": "technology",
        "description": "Офіційні новини Telegram Bot API та бот-платформи.",
    },
    {
        "type": SourceType.tg,
        "name": "Telegram Tips",
        "url": "https://t.me/TelegramTips",
        "topic_slug": "technology",
        "description": "Поради та нові функції Telegram.",
    },
    {
        "type": SourceType.tg,
        "name": "BBC News",
        "url": "https://t.me/bbc_nws",
        "topic_slug": "news",
        "description": "Світові новини та міжнародні події.",
    },
    {
        "type": SourceType.tg,
        "name": "NHK World",
        "url": "https://t.me/nhkworld",
        "topic_slug": "news",
        "description": "Міжнародні новини та аналітика.",
    },
    {
        "type": SourceType.tg,
        "name": "Ukraine NOW",
        "url": "https://t.me/UkraineNow",
        "topic_slug": "news",
        "description": "Українські новини та офіційні повідомлення.",
    },
]
