from dataclasses import dataclass

from app.news_parser.sites import fetch_site_news
from app.news_parser.telegram import fetch_telegram_news_from_web, normalize_telegram_peer


@dataclass
class FakeResponse:
    text: str

    def raise_for_status(self) -> None:
        return None


def test_fetch_site_news_reads_rss(monkeypatch) -> None:
    rss = """<?xml version="1.0" encoding="UTF-8" ?>
    <rss version="2.0">
      <channel>
        <title>Test feed</title>
        <item>
          <title>AI news</title>
          <link>https://example.com/ai</link>
          <description>Short summary</description>
          <pubDate>Mon, 08 Jun 2026 10:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>
    """

    def fake_get(url: str, timeout: int) -> FakeResponse:
        assert url == "https://example.com/rss.xml"
        assert timeout > 0
        return FakeResponse(text=rss)

    monkeypatch.setattr("app.news_parser.sites.requests.get", fake_get)

    items = fetch_site_news("Example", "https://example.com/rss.xml")

    assert len(items) == 1
    assert items[0].title == "AI news"
    assert items[0].source == "Example"


def test_normalize_telegram_peer_accepts_frontend_links() -> None:
    assert normalize_telegram_peer("https://t.me/aipost") == "@aipost"
    assert normalize_telegram_peer("http://t.me/hackernews/") == "@hackernews"
    assert normalize_telegram_peer("t.me/techcrunchcom") == "@techcrunchcom"
    assert normalize_telegram_peer("@hiaimediaen") == "@hiaimediaen"


def test_fetch_telegram_news_from_web_reads_public_channel(monkeypatch) -> None:
    html = """
    <div class="tgme_widget_message_wrap">
      <div class="tgme_widget_message">
        <div class="tgme_widget_message_text">AI launch<br>Fresh update</div>
        <a class="tgme_widget_message_date" href="https://t.me/aipost/10">
          <time datetime="2026-06-18T10:00:00+00:00"></time>
        </a>
      </div>
    </div>
    """

    class FakeResponse:
        text = html

        def raise_for_status(self) -> None:
            return None

    def fake_get(url: str, timeout: int) -> FakeResponse:
        assert url == "https://t.me/s/aipost"
        assert timeout > 0
        return FakeResponse()

    monkeypatch.setattr("app.news_parser.telegram.requests.get", fake_get)

    items = fetch_telegram_news_from_web("AI Post", "https://t.me/aipost", limit=5)

    assert len(items) == 1
    assert items[0].title == "AI launch"
    assert items[0].url == "https://t.me/aipost/10"
    assert "Fresh update" in items[0].summary
