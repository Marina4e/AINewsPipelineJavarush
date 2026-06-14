from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import NewsItem


def save_news_if_new(db: Session, news: NewsItem) -> bool:
    """Зберігає новину тільки якщо такого id/url ще немає.

    Повертає True для нової новини і False для дубліката. IntegrityError
    страхує нас від гонок, коли два worker-и одночасно побачили той самий URL.
    """

    existing = db.get(NewsItem, news.id)
    if existing:
        return False

    try:
        db.add(news)
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False

