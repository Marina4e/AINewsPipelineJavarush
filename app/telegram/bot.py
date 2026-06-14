import logging
import time
from dataclasses import dataclass

import requests
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.models import NewsItem, Post, PostStatus
from app.tasks import publish_post_task
from app.utils import configure_logging

configure_logging()
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BotAction:
    label: str
    callback_data: str


MAIN_ACTIONS = [
    BotAction("Статус", "status"),
    BotAction("Останні новини", "latest_news"),
    BotAction("Останній матеріал", "latest_material"),
    BotAction("Підтвердити публікацію", "approve_latest"),
    BotAction("Повернути на редагування", "return_latest"),
]


class TelegramDashboardBot:
    """Малий Bot API інтерфейс для швидкого контролю проєкту.

    Коментар для девелопера: dashboard залишається основним місцем редагування.
    Бот тільки показує останній стан і запускає прості дії, щоб Telegram-частина
    не дублювала всю адміністративну панель.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        if not self.settings.telegram_bot_token:
            raise RuntimeError("TELEGRAM_BOT_TOKEN is required to run the bot")
        self.api_url = f"https://api.telegram.org/bot{self.settings.telegram_bot_token}"
        self.offset = 0

    def run_forever(self) -> None:
        logger.info("Telegram dashboard bot started")
        while True:
            try:
                for update in self._get_updates():
                    self.offset = update["update_id"] + 1
                    self._handle_update(update)
            except Exception as exc:
                logger.exception("Telegram bot loop failed: %s", exc)
                time.sleep(5)

    def _get_updates(self) -> list[dict]:
        response = requests.get(
            f"{self.api_url}/getUpdates",
            params={"offset": self.offset, "timeout": 25},
            timeout=35,
        )
        response.raise_for_status()
        return response.json().get("result", [])

    def _handle_update(self, update: dict) -> None:
        callback = update.get("callback_query")
        if callback:
            self._answer_callback(callback)
            return

        message = update.get("message") or {}
        chat_id = message.get("chat", {}).get("id")
        text = (message.get("text") or "").strip()
        if not chat_id:
            return

        if text in {"/start", "/help"}:
            self._send_message(
                chat_id,
                "AI News Pipeline: швидкий контроль новин, черги публікації та Telegram-доставки. Основне редагування відкривайте в dashboard.",
                reply_markup=self._keyboard(),
            )
        elif text == "/status":
            self._send_message(chat_id, self._status_text(), reply_markup=self._keyboard())
        elif text == "/latest":
            self._send_message(chat_id, self._latest_material_text(), reply_markup=self._keyboard())
        else:
            self._send_message(chat_id, "Оберіть дію кнопкою або використайте /status чи /latest.", reply_markup=self._keyboard())

    def _answer_callback(self, callback: dict) -> None:
        chat_id = callback.get("message", {}).get("chat", {}).get("id")
        action = callback.get("data")
        if not chat_id:
            return

        if action == "status":
            text = self._status_text()
        elif action == "latest_news":
            text = self._latest_news_text()
        elif action == "latest_material":
            text = self._latest_material_text()
        elif action == "approve_latest":
            text = self._approve_latest_post()
        elif action == "return_latest":
            text = self._return_latest_post()
        else:
            text = "Невідома дія."

        requests.post(f"{self.api_url}/answerCallbackQuery", json={"callback_query_id": callback["id"]}, timeout=10)
        self._send_message(chat_id, text, reply_markup=self._keyboard())

    def _session(self) -> Session:
        init_db()
        return SessionLocal()

    def _status_text(self) -> str:
        db = self._session()
        try:
            news_count = db.query(NewsItem).count()
            pending_count = db.query(Post).filter(Post.status == PostStatus.pending_approval).count()
            published_count = db.query(Post).filter(Post.status == PostStatus.published).count()
            latest_delivery = db.query(Post).filter(Post.status == PostStatus.published).order_by(Post.published_at.desc()).first()
            bot_ok = self._bot_available()
            channel_ok = self._channel_available()
            delivery_ready = bot_ok and channel_ok and bool(self.settings.telegram_target_channel)
            last_delivery_text = latest_delivery.published_at.isoformat(sep=" ", timespec="minutes") if latest_delivery and latest_delivery.published_at else "немає"
            return (
                f"Bot Online / Offline: {'🟢 Online' if bot_ok else '🔴 Offline'}\n"
                f"Channel Available / Unavailable: {'🟢 Available' if channel_ok else '🔴 Unavailable'}\n"
                f"Publishing Available / Unavailable: {'🟢 Available' if delivery_ready else '🔴 Unavailable'}\n"
                f"Last Successful Delivery: {last_delivery_text}\n"
                f"Новин у базі: {news_count}\n"
                f"Матеріалів на підтвердження: {pending_count}\n"
                f"Опубліковано: {published_count}\n"
                f"Канал: {self.settings.telegram_target_channel or 'не задано'}"
            )
        finally:
            db.close()

    def _latest_news_text(self) -> str:
        db = self._session()
        try:
            news = db.query(NewsItem).order_by(NewsItem.published_at.desc()).first()
            if not news:
                return "Новин ще немає. Запустіть pipeline на сайті."
            return f"Останні новини:\n{news.title}\n\n{news.summary[:700]}"
        finally:
            db.close()

    def _latest_material_text(self) -> str:
        db = self._session()
        try:
            post = db.query(Post).order_by(Post.created_at.desc()).first()
            if not post:
                return "Матеріалів ще немає. Створіть матеріал із новини на сайті."
            return f"Останній матеріал {post.id[:8]} · {post.status.value}\n\n{post.generated_text[:1200]}"
        finally:
            db.close()

    def _approve_latest_post(self) -> str:
        db = self._session()
        try:
            post = (
                db.query(Post)
                .filter(Post.status.in_([PostStatus.pending_approval, PostStatus.generated, PostStatus.failed]))
                .order_by(Post.created_at.desc())
                .first()
            )
            if not post:
                return "Немає матеріалу, який можна підтвердити."
            post.status = PostStatus.generated
            post.error = None
            db.commit()
            task = publish_post_task.delay(post.id)
            return f"Публікацію поставлено в чергу Telegram: матеріал {post.id[:8]}, task {task.id}."
        finally:
            db.close()

    def _return_latest_post(self) -> str:
        db = self._session()
        try:
            post = db.query(Post).order_by(Post.created_at.desc()).first()
            if not post:
                return "Немає AI-поста для повернення на редагування."
            post.status = PostStatus.pending_approval
            post.error = "Повернуто на редагування через Telegram-бот"
            db.commit()
            return f"Матеріал {post.id[:8]} повернуто на редагування в dashboard."
        finally:
            db.close()

    def _bot_available(self) -> bool:
        try:
            response = requests.get(f"{self.api_url}/getMe", timeout=10)
            return bool(response.ok and response.json().get("ok"))
        except requests.RequestException:
            return False

    def _channel_available(self) -> bool:
        if not self.settings.telegram_target_channel:
            return False
        try:
            response = requests.post(
                f"{self.api_url}/getChat",
                json={"chat_id": self.settings.telegram_target_channel},
                timeout=10,
            )
            return bool(response.ok and response.json().get("ok"))
        except requests.RequestException:
            return False

    def _keyboard(self) -> dict:
        rows = [[{"text": action.label, "callback_data": action.callback_data}] for action in MAIN_ACTIONS]
        return {"inline_keyboard": rows}

    def _send_message(self, chat_id: int, text: str, reply_markup: dict | None = None) -> None:
        payload = {"chat_id": chat_id, "text": text[:3900]}
        if reply_markup:
            payload["reply_markup"] = reply_markup
        response = requests.post(f"{self.api_url}/sendMessage", json=payload, timeout=20)
        response.raise_for_status()


def main() -> None:
    settings = get_settings()
    if not settings.telegram_bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN порожній; bot-контейнер чекає налаштування .env")
        while True:
            time.sleep(300)
    TelegramDashboardBot().run_forever()


if __name__ == "__main__":
    main()
