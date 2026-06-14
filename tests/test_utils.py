from app.utils import make_news_id


def test_make_news_id_is_stable_for_same_url() -> None:
    first = make_news_id("Title A", "https://example.com/news/1", "text")
    second = make_news_id("Another title", "https://example.com/news/1", "another text")

    assert first == second


def test_make_news_id_uses_content_when_url_is_missing() -> None:
    first = make_news_id("Title A", None, "same text")
    second = make_news_id("Title A", None, "same text")

    assert first == second

