import os
from pathlib import Path
from tempfile import gettempdir

os.environ["ADMIN_API_KEY"] = "test-secret-key"
TEST_DB_PATH = Path(gettempdir()) / "aibot_test_api.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


def setup_module() -> None:
    TEST_DB_PATH.unlink(missing_ok=True)
    TEST_DB_PATH.with_name(f"{TEST_DB_PATH.name}-journal").unlink(missing_ok=True)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_admin_endpoint_requires_api_key() -> None:
    with TestClient(app) as client:
        response = client.get("/api/topics/")

    assert response.status_code == 401


def test_can_create_topic_with_api_key() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/topics/",
            headers={"X-API-Key": "test-secret-key"},
            json={
                "name": "Technology",
                "slug": "technology",
                "description": "Tech news",
                "enabled": True,
            },
        )

    assert response.status_code == 201
    assert response.json()["slug"] == "technology"


def test_can_delete_post_with_api_key() -> None:
    with TestClient(app) as client:
        news_response = client.post(
            "/api/news/manual",
            headers={"X-API-Key": "test-secret-key"},
            json={
                "title": "Manual test news",
                "summary": "This is a manual test news item for the dashboard.",
                "source": "Manual dashboard",
            },
        )
        assert news_response.status_code == 201

        news_id = news_response.json()["id"]
        post_response = client.post(
            f"/api/news/{news_id}/generate-demo",
            headers={"X-API-Key": "test-secret-key"},
        )
        assert post_response.status_code == 200

        delete_response = client.delete(
            f"/api/posts/{post_response.json()['id']}",
            headers={"X-API-Key": "test-secret-key"},
        )

    assert delete_response.status_code == 204


def test_can_stop_pipeline_with_api_key() -> None:
    with TestClient(app) as client:
        response = client.post("/api/pipeline/stop", headers={"X-API-Key": "test-secret-key"})

    assert response.status_code == 200
    assert "зупин" in response.json()["message"].lower()
