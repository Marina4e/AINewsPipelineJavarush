# AI News Pipeline

AI News Pipeline is an educational FastAPI service for collecting RSS/Telegram news, preparing AI or demo Telegram posts, reviewing drafts, and publishing approved content to a channel.

## Implemented

- FastAPI backend with admin API and Swagger.
- Static dashboard in `app/frontend/`, no separate frontend build step.
- Celery worker + beat for background pipeline jobs.
- PostgreSQL for application data, Redis for queues.
- RSS parser, Telegram parser through Telethon, Telegram publishing through Bot API or Telethon.
- OpenAI generation with a safe demo fallback when no key is configured.
- Topics, sources, keywords, news queue, post queue, logs and status panels.
- Alembic migrations, Docker Compose, and `pytest` tests.
- API and UI controls for starting and stopping the pipeline.

## Team Report

During exam preparation the team:

- assembled a complete Docker Compose stack;
- moved secrets to `.env` and documented `.env.example`;
- added OpenAI, Telegram, health, and public status checks;
- made the project demonstrable without a paid OpenAI key;
- added demo generation for a reliable exam scenario;
- covered core API, parser, and utility behavior with tests;
- verified terminal workflows, not only the dashboard.

## Quick Start

```powershell
Copy-Item .env.example .env
docker compose build
docker compose up -d
docker compose ps
```

After Python or frontend changes:

```powershell
docker compose build app
docker compose up -d app
```

Open:

- Dashboard: `http://localhost:8000/`
- Swagger: `http://localhost:8000/docs`
- Flower: `http://localhost:5555/`
- Redis Commander: `http://localhost:8081/`
- Adminer: `http://localhost:8082/`

## Minimal Configuration

Create `.env` from `.env.example` and replace:

- `POSTGRES_PASSWORD`
- `ADMIN_API_KEY`

Optional:

- `OPENAI_API_KEY` - real AI generation;
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_TARGET_CHANNEL` - publishing;
- `TELEGRAM_API_ID` + `TELEGRAM_API_HASH` - reading Telegram sources.

Generate `ADMIN_API_KEY`:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## Terminal Verification

```powershell
.\\.venv\\Scripts\\python.exe -m pytest -q
docker compose ps
docker compose logs --tail=80 app
Invoke-WebRequest http://localhost:8000/api/health
Invoke-WebRequest http://localhost:8000/api/public-status
```

Admin API checks:

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

## Dashboard Flow

1. Open `http://localhost:8000/`.
2. Paste `ADMIN_API_KEY` in Settings.
3. Add a topic, source, and keywords.
4. Click `Start Pipeline` or `Fetch News`.
5. Open a collected news item and generate a draft.
6. Edit the text and click `Send to Telegram`.

The OpenAI key is optional: demo mode lets the project be demonstrated without paid external calls.

## Architecture

- `app/main.py` - FastAPI entrypoint and dashboard.
- `app/api/` - REST endpoints, auth, schemas.
- `app/tasks.py` - Celery pipeline.
- `app/news_parser/` - RSS and Telegram collection.
- `app/ai/` - OpenAI client and demo fallback.
- `app/telegram/` - bot and publishing.
- `app/services/` - business logic.
- `app/frontend/` - HTML/CSS/JS dashboard.
- `alembic/` - migrations.
- `tests/` - pytest checks.

## Useful Commands

```powershell
docker compose up -d
docker compose down
docker compose logs --tail=80 app
docker compose logs --tail=80 flower
docker compose exec app alembic upgrade head
docker compose exec app python -m pytest -q
```

## Common Issues

- `401`: missing or wrong `ADMIN_API_KEY`.
- `500 ADMIN_API_KEY is not configured`: `.env` still contains a placeholder.
- No Telegram publishing: check bot token, channel username, and bot admin rights.
- Telegram parsing fails: configure `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, and a Telethon session.
- OpenAI fails: the project can still be demonstrated in demo mode; check `/api/openai/check`.

## Submission Readiness

The project can be presented in two ways:

- through the dashboard for the user-facing workflow;
- through PowerShell/API commands for technical inspection.

Before submission, run:

```powershell
.\\.venv\\Scripts\\python.exe -m pytest -q
docker compose up -d
Invoke-WebRequest http://localhost:8000/api/health
```
