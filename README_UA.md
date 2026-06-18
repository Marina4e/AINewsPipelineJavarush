# AI News Pipeline

AI News Pipeline - навчальний сервіс для збору новин з RSS і Telegram, AI/demo-підготовки Telegram-постів, ручного рев'ю та публікації в канал.

## Що реалізовано

- FastAPI backend з адмінським API та Swagger.
- Dashboard без окремого frontend build step: `app/frontend/`.
- Celery worker + beat для pipeline-задач.
- PostgreSQL для основних даних, Redis для черг.
- RSS parser, Telegram parser через Telethon, Telegram publishing через Bot API або Telethon.
- OpenAI generation з безпечним demo fallback, якщо ключ не задано.
- Теми, джерела, ключові слова, черга новин, черга постів, logs/status panels.
- Alembic migrations, Docker Compose, тести `pytest`.
- API та UI для запуску й зупинки pipeline.

## Звіт команди

Під час підготовки проєкту до здачі команда:

- зібрала повний Docker Compose stack;
- винесла секрети в `.env` і `.env.example`;
- додала перевірки OpenAI, Telegram, health і public status;
- зробила ручний сценарій без обов'язкового OpenAI ключа;
- додала demo generation для перевірки pipeline на екзамені;
- покрила базові API, parser і utility сценарії тестами;
- перевірила запуск через термінал, а не тільки через dashboard.

## Швидкий старт

```powershell
Copy-Item .env.example .env
docker compose build
docker compose up -d
docker compose ps
```

Після зміни Python-коду або frontend:

```powershell
docker compose build app
docker compose up -d app
```

Відкрити:

- Dashboard: `http://localhost:8000/`
- Swagger: `http://localhost:8000/docs`
- Flower: `http://localhost:5555/`
- Redis Commander: `http://localhost:8081/`
- Adminer: `http://localhost:8082/`

## Мінімальна конфігурація

Створи `.env` з `.env.example` і заміни:

- `POSTGRES_PASSWORD`
- `ADMIN_API_KEY`

Опційно:

- `OPENAI_API_KEY` - реальна AI-генерація;
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_TARGET_CHANNEL` - публікація;
- `TELEGRAM_API_ID` + `TELEGRAM_API_HASH` - читання Telegram-джерел.

Згенерувати `ADMIN_API_KEY`:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Перевірка через термінал

```powershell
.\\.venv\\Scripts\\python.exe -m pytest -q
docker compose ps
docker compose logs --tail=80 app
Invoke-WebRequest http://localhost:8000/api/health
Invoke-WebRequest http://localhost:8000/api/public-status
```

Адмінські API:

```powershell
$headers = @{ 'X-API-Key' = 'PASTE_ADMIN_API_KEY_HERE' }
Invoke-RestMethod -Headers $headers http://localhost:8000/api/settings
Invoke-RestMethod -Headers $headers -Method Post http://localhost:8000/api/openai/check
Invoke-RestMethod -Headers $headers -Method Post http://localhost:8000/api/telegram/check
Invoke-RestMethod -Headers $headers -Method Post http://localhost:8000/api/pipeline/run
Invoke-RestMethod -Headers $headers -Method Post http://localhost:8000/api/pipeline/stop
Invoke-RestMethod -Headers $headers http://localhost:8000/api/pipeline/status
Invoke-RestMethod -Headers $headers http://localhost:8000/api/logs/errors
```

## Ручний сценарій у dashboard

1. Відкрити `http://localhost:8000/`.
2. У Settings вставити `ADMIN_API_KEY`.
3. Додати тему, джерело і ключові слова.
4. Натиснути `Start Pipeline` або `Fetch News`.
5. Відкрити знайдену новину і згенерувати draft.
6. Відредагувати текст і натиснути `Send to Telegram`.

OpenAI ключ не обов'язковий: demo-режим дозволяє показати роботу без платних зовнішніх викликів.

## Архітектура

- `app/main.py` - FastAPI entrypoint і dashboard.
- `app/api/` - REST endpoints, auth, schemas.
- `app/tasks.py` - Celery pipeline.
- `app/news_parser/` - RSS і Telegram збір.
- `app/ai/` - OpenAI client і demo fallback.
- `app/telegram/` - bot і publishing.
- `app/services/` - business logic.
- `app/frontend/` - HTML/CSS/JS dashboard.
- `alembic/` - migrations.
- `tests/` - pytest перевірки.

## Корисні команди

```powershell
docker compose up -d
docker compose down
docker compose logs --tail=80 app
docker compose logs --tail=80 flower
docker compose exec app alembic upgrade head
docker compose exec app python -m pytest -q
```

## Типові проблеми

- `401`: неправильний або відсутній `ADMIN_API_KEY`.
- `500 ADMIN_API_KEY не налаштовано`: у `.env` залишився placeholder.
- Немає Telegram-публікації: перевірити bot token, channel username і права бота в каналі.
- Telegram parsing не працює: потрібні `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` і Telethon session.
- OpenAI не працює: можна здати demo-сценарій без ключа, але перевірити `/api/openai/check`.

## Готовність до здачі

Проєкт можна показувати двома способами:

- через dashboard для демонстрації UX;
- через PowerShell/API для технічної перевірки викладачем.

Перед здачею достатньо виконати:

```powershell
.\\.venv\\Scripts\\python.exe -m pytest -q
docker compose up -d
Invoke-WebRequest http://localhost:8000/api/health
```
