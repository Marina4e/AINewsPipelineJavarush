from app.models import SourceType


# Каталог показується у frontend як швидкий старт для RSS і Telegram-джерел.
SOURCE_SUGGESTIONS = [
    {
        "type": SourceType.site,
        "name": "BBC Technology",
        "url": "https://feeds.bbci.co.uk/news/technology/rss.xml",
        "topic_slug": "technology",
        "description": "Міжнародні технологічні новини у форматі RSS.",
    },
    {
        "type": SourceType.site,
        "name": "The Guardian Technology",
        "url": "https://www.theguardian.com/uk/technology/rss",
        "topic_slug": "technology",
        "description": "Технологічні матеріали The Guardian.",
    },
    {
        "type": SourceType.site,
        "name": "NASA Breaking News",
        "url": "https://www.nasa.gov/news-release/feed/",
        "topic_slug": "science",
        "description": "Офіційні новинні релізи NASA.",
    },
    {
        "type": SourceType.site,
        "name": "BBC Business",
        "url": "https://feeds.bbci.co.uk/news/business/rss.xml",
        "topic_slug": "business",
        "description": "Бізнес та економіка у форматі RSS.",
    },
    {
        "type": SourceType.tg,
        "name": "DOU",
        "url": "@doucommunity",
        "topic_slug": "it-ukraine",
        "description": "Українська IT-спільнота, вакансії, події та новини DOU.",
    },
    {
        "type": SourceType.tg,
        "name": "dev.ua",
        "url": "@devua",
        "topic_slug": "it-ukraine",
        "description": "Новини українського IT, стартапів, бізнесу й технологій.",
    },
    {
        "type": SourceType.tg,
        "name": "IT Ukraine Association",
        "url": "@itukraine",
        "topic_slug": "it-ukraine",
        "description": "Офіційні новини та анонси IT Ukraine Association.",
    },
    {
        "type": SourceType.tg,
        "name": "Джун в IT",
        "url": "@junior_it",
        "topic_slug": "career",
        "description": "Приклад Telegram-джерела для junior-friendly IT-контенту.",
    },
    {
        "type": SourceType.tg,
        "name": "Я нейромережа, я так бачу",
        "url": "@neural_network_ua",
        "topic_slug": "ai",
        "description": "Приклад каналу про AI, генеративні інструменти та нейромережі.",
    },
    {
        "type": SourceType.tg,
        "name": "IT-двіж",
        "url": "@it_dvizh",
        "topic_slug": "it-ukraine",
        "description": "Приклад каналу для IT-анонсів, новин і подій.",
    },
    {
        "type": SourceType.tg,
        "name": "ШІ-двіж",
        "url": "@ai_dvizh",
        "topic_slug": "ai",
        "description": "Приклад Telegram-джерела для новин про штучний інтелект.",
    },
]
