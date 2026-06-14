# AI News Pipeline

AI News Pipeline collects news from RSS feeds and Telegram channels, stores the data in PostgreSQL, prepares materials with AI or manual editing, and publishes them to Telegram after dashboard approval.

The project is designed so that AI is optional:

- the platform works without `OPENAI_API_KEY`
- demo mode is available everywhere it matters
- `.env` is loaded from the repository root, so VS Code and Docker use the same configuration

## Stack

- FastAPI
- PostgreSQL
- Redis
- Celery
- Flower
- Telegram Bot
- OpenAI
- Docker

## Quick Start

### 1. Create `.env`

```powershell
Copy-Item .env.example .env
```

### 2. Fill in the environment variables

Minimum:

- `POSTGRES_PASSWORD`
- `ADMIN_API_KEY`

Optional but commonly needed:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_TARGET_CHANNEL`
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `OPENAI_API_KEY`

### 3. Start the project

```powershell
docker compose build
docker compose up -d
docker compose ps
```

### 4. Open the dashboard

- `http://localhost:8000/`

## `.env` and VS Code

If a key is real but is not being read, the usual cause is the process working directory.

This repository already fixes that with:

- an absolute `.env` path in `app/config.py`
- `python.envFile` in [.vscode/settings.json](./.vscode/settings.json)
- a launch profile in [.vscode/launch.json](./.vscode/launch.json)

So the usual setup is:

1. place `.env` in the repository root
2. run the app from the root folder or from the VS Code profile

## Environment Variables

### Required

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `REDIS_URL`
- `ADMIN_API_KEY`

### Telegram

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_TARGET_CHANNEL`
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_SESSION_NAME`

### OpenAI

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

### Pipeline behavior

- `AUTO_PUBLISH_POSTS`
- `PARSER_INTERVAL_MINUTES`
- `SITE_REQUEST_TIMEOUT`
- `DEFAULT_NEWS_LIMIT`
- `ALLOWED_LANGUAGES`

## Start, Stop, Reset

```powershell
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=80 app
docker compose logs -f app
docker compose down
docker compose down -v
```

## API Checks

```powershell
Invoke-RestMethod http://localhost:8000/api/health
Invoke-RestMethod http://localhost:8000/api/public-status
```

## Verify `ADMIN_API_KEY`

```powershell
$headers = @{ "X-API-Key" = "your_ADMIN_API_KEY" }
Invoke-RestMethod -Uri http://localhost:8000/api/settings -Headers $headers
```

## Project Structure

- `app/main.py` - FastAPI entrypoint and dashboard
- `app/config.py` - `.env` loading
- `app/api/endpoints.py` - dashboard API
- `app/tasks.py` - Celery pipeline
- `app/news_parser/` - RSS and Telegram parsers
- `app/ai/` - OpenAI client and demo fallback
- `app/telegram/` - Telegram bot and publishing
- `app/frontend/` - dashboard UI
- `alembic/` - database migrations

## Dashboard

The dashboard is organized into these blocks:

- Access
- OpenAI
- AI Test
- Topics
- Keywords
- News Sources
- News Pipeline
- Collected News
- Publishing Queue
- Telegram Bot

### News Sources

There are two separate catalogs:

- RSS Sources
- Telegram Sources

The Telegram catalog uses the `Add News Channel` button.

Each source card shows:

- name
- URL
- status
- last error
- last checked time
- last success time

### Topics and Keywords

Topics and keywords are separated.

Topic:

- name
- description

Keywords:

- comma-separated
- optional
- can be saved without attaching them to a topic

### News Pipeline

The pipeline displays these stages:

- Pipeline Started
- RSS Processing
- Telegram Processing
- AI Processing
- Post Generation
- Publishing
- Completed

The status area shows:

- `🟢 Pipeline Running`
- `🔴 Pipeline Stopped`

`News Collection Completed` appears only after all stages finish.

### Collected News

Each news card shows:

- Title
- Source
- Date
- Summary

Clicking the title opens the full article.

Available actions:

- Edit Manually
- Improve with AI
- Publish to Website
- Publish to Telegram

### Publishing Queue

The queue contains:

- AI-generated posts
- manually edited posts

Filters:

- Pending Approval
- Published
- Errors
- All

Empty state:

`No materials available. Check sources or start news collection.`

### Telegram Bot

After `/start`, the bot shows:

- Status
- Latest News
- Latest Material
- Approve Publication
- Return for Editing

Status includes:

- Bot Online / Offline
- Channel Available / Unavailable
- Publishing Available / Unavailable
- Last Successful Delivery

### OpenAI

The OpenAI section shows:

- OpenAI API Key
- 🟢 OpenAI Connected
- 🔴 OpenAI Not Connected

### AI Test

Fields:

- AI Prompt
- Mode

Modes:

- Demo
- OpenAI

Button:

- `🤖 Test AI`

Demo mode works without a real API key.

## AI Without OpenAI

The platform does not depend on OpenAI:

- `generate-demo` creates a local draft
- `generate` falls back to demo output when the key is missing
- the AI test works in Demo mode without `OPENAI_API_KEY`

## Telegram Workflow

### Publishing

1. create a bot with `@BotFather`
2. add the bot as an administrator to your channel
3. set `TELEGRAM_BOT_TOKEN`
4. set `TELEGRAM_TARGET_CHANNEL`

The app does not create Telegram channels for you. Create the channel in Telegram and then point `TELEGRAM_TARGET_CHANNEL` to it.

### Reading channels

To read Telegram sources, configure:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`

Then authenticate once:

```powershell
docker compose run --rm app python -m app.telegram_login
```

## Pipeline Flow

1. add sources
2. start `Start News Collection`
3. Celery collects RSS and Telegram sources
4. news items are filtered
5. materials are created
6. materials move into `Publishing Queue`
7. materials are approved or returned for editing
8. the Telegram bot reports the latest state and actions

## AI Processing Flow

1. a news item enters generation
2. `OpenAIPostClient` checks the configured key
3. if a key exists, OpenAI is used
4. if no key exists, the demo fallback is used
5. the material is placed in the publishing queue

## Useful Commands

```powershell
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=80 app
docker compose exec app alembic upgrade head
docker compose run --rm app pytest -q
docker compose run --rm app python -m app.telegram_login
docker compose down
docker compose down -v
```

## Flower

- `http://localhost:5555/`

## Adminer

- `http://localhost:8082/`

## Redis Commander

- `http://localhost:8081/`
