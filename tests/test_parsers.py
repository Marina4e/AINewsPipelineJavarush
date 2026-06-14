from dataclasses import dataclass

from app.news_parser.sites import fetch_site_news


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

