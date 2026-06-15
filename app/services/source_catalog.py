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
        "name": "NEXTA Live",
        "url": "https://t.me/nexta_live",
        "topic_slug": "technology",
        "description": "Оперативні новини та суспільно-політичні оновлення.",
    },
    {
        "type": SourceType.tg,
        "name": "Ukraine Online",
        "url": "https://t.me/UaOnlii",
        "topic_slug": "technology",
        "description": "Українські новини, оперативні оновлення та соціальні теми.",
    },
    {
        "type": SourceType.tg,
        "name": "Sota.Vision",
        "url": "https://t.me/sotavisionmedia",
        "topic_slug": "science",
        "description": "Незалежні новини та аналітика про суспільні події.",
    },
    {
        "type": SourceType.tg,
        "name": "Abu Ali Express",
        "url": "https://t.me/abualiexpress",
        "topic_slug": "business",
        "description": "Швидкі новини й оновлення про події на Близькому Сході.",
    },
    {
        "type": SourceType.tg,
        "name": "Sovetskaya Belorussiya",
        "url": "https://t.me/sovbelarussia",
        "topic_slug": "technology",
        "description": "Сатиричний новинний канал із політичними та медійними темами.",
    },
]
