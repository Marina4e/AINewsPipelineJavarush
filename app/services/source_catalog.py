from app.models import SourceType


# Каталог показується у frontend як швидкий старт для RSS і Telegram-джерел.
# Telegram-приклади нижче обмежені набором AI/tech-джерел, який використовується у dashboard.
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
        "name": "AI Post",
        "url": "https://t.me/aipost",
        "topic_slug": "ai",
        "description": "Artificial intelligence news, research breakthroughs, and AI industry updates.",
    },
    {
        "type": SourceType.tg,
        "name": "Hi, AI • Tech News",
        "url": "https://t.me/hiaimediaen",
        "topic_slug": "ai",
        "description": "Global AI, OpenAI, Anthropic, Google AI, and technology news.",
    },
    {
        "type": SourceType.tg,
        "name": "TechCrunch",
        "url": "https://t.me/techcrunchcom",
        "topic_slug": "technology",
        "description": "Startup ecosystem, venture capital, AI, and technology news.",
    },
    {
        "type": SourceType.tg,
        "name": "Tech, Science & Innovation",
        "url": "https://t.me/tech_science_innovation",
        "topic_slug": "technology",
        "description": "Science, AI, biotech, space, and future technology news.",
    },
    {
        "type": SourceType.tg,
        "name": "Artificial Intelligence | AI",
        "url": "https://t.me/ai_artificial_inteligence",
        "topic_slug": "ai",
        "description": "AI news, tools, funding, and product launches.",
    },
    {
        "type": SourceType.tg,
        "name": "Hacker News",
        "url": "https://t.me/hackernews",
        "topic_slug": "technology",
        "description": "Programming, startups, open source, and engineering discussions.",
    },
]
