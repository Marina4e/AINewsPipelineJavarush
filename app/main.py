from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.api.endpoints import router
from app.config import get_settings
from app.database import init_db
from app.utils import configure_logging

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = PROJECT_ROOT / "app" / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan: стартова ініціалізація без зайвих global side effects."""

    configure_logging()
    init_db()
    yield


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    description="AI-сервіс для збору новин, генерації Telegram-постів і публікації за розкладом.",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(router, prefix=settings.api_prefix)
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR / "static")), name="static")


@app.get("/", response_class=HTMLResponse)
def dashboard() -> str:
    """Віддає admin dashboard як перший екран проєкту."""

    return (FRONTEND_DIR / "index.html").read_text(encoding="utf-8")
