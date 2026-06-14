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
