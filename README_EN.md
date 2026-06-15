# AI News Pipeline

AI News Pipeline collects news from RSS and Telegram, stores it in PostgreSQL, prepares materials through AI or manual editing, and publishes approved content to Telegram.

The project is designed so that AI is optional:

- the platform works without `OPENAI_API_KEY`
- demo mode is available wherever it matters
- `.env` is loaded from the repository root, so VS Code, Docker, and the terminal use the same configuration

## Documentation

- [README.md](README.md)
- [README_UA.md](README_UA.md)

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

### Fastest frontend choice for a same-day delivery

The quickest and safest option for this project is:

- a single static dashboard in `app/frontend/`
- no separate React/Vue build step
- no per-request Jinja rendering
- one `docker compose up -d` for the whole stack

This is already wired through the main `app` service, which serves both the API and the dashboard.

### Quick verification commands

```powershell
docker compose ps
docker compose logs --tail=80 app
docker compose logs --tail=80 flower
Invoke-WebRequest http://localhost:8000/api/health
Invoke-WebRequest http://localhost:8000/api/public-status
```

Admin checks:

```powershell
$headers = @{ 'X-API-Key' = 'PASTE_ADMIN_API_KEY_HERE' }
Invoke-RestMethod -Headers $headers -Uri http://localhost:8000/api/settings
Invoke-RestMethod -Headers $headers -Method Post -Uri http://localhost:8000/api/openai/check
Invoke-RestMethod -Headers $headers -Method Post -Uri http://localhost:8000/api/pipeline/run
Invoke-RestMethod -Headers $headers -Uri http://localhost:8000/api/logs/errors
```

## Important: `ADMIN_API_KEY`

`ADMIN_API_KEY` is stored only in `.env` at the repository root.

Frontend:

- does not hardcode the key
- stores it only temporarily in browser `sessionStorage`
- sends it in the `X-API-Key` header

Backend:

- reads the key from `.env`
- compares it with the `X-API-Key` header
- returns human-readable messages if the key is missing or invalid

### How to generate `ADMIN_API_KEY`

Use a long random secret.

PowerShell:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Alternative with Python:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Where to store `ADMIN_API_KEY`

1. Put the value into `.env` in the repository root.
2. Restart the backend:

```powershell
docker compose up -d
```

3. Open the dashboard and paste the same key into the access field.

If you change the key in `.env`, the browser `sessionStorage` will not update automatically, so the old dashboard key must be replaced manually.

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

## Project Architecture

- `app/main.py` - FastAPI entrypoint and dashboard
- `app/config.py` - `.env` loading
- `app/api/endpoints.py` - dashboard API
- `app/tasks.py` - Celery pipeline
- `app/news_parser/` - RSS and Telegram parsers
- `app/ai/` - OpenAI client and demo fallback
- `app/telegram/` - Telegram bot and publishing
- `app/frontend/` - dashboard UI
- `alembic/` - database migrations

## Services and Ports

### AI News Frontend

- URL: `http://localhost:8000/`
- Port: `8000`
- Purpose: dashboard UI, source management, news review, publishing queue, and status overview
- Start command:

```powershell
docker compose up -d app
```

- Check command:

```powershell
Invoke-WebRequest -Uri http://localhost:8000/ -UseBasicParsing
```

### FastAPI Backend

- URL: `http://localhost:8000/`
- Port: `8000`
- Purpose: REST API, dashboard backend, key checks, pipeline control
- Start command:

```powershell
docker compose up -d app
```

- Check command:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
Invoke-RestMethod http://localhost:8000/api/public-status
```

### PostgreSQL

- URL: `postgresql://localhost:5432`
- Port: `5432`
- Purpose: primary data store
- Start command:

```powershell
docker compose up -d postgres
```

- Check command:

```powershell
docker compose exec postgres pg_isready -U $env:POSTGRES_USER -d $env:POSTGRES_DB
```

### Redis

- URL: `redis://localhost:6379`
- Port: `6379`
- Purpose: Celery broker and result backend
- Start command:

```powershell
docker compose up -d redis
```

- Check command:

```powershell
docker compose exec redis redis-cli ping
```

### Celery Worker

- URL: no separate URL
- Port: no separate port
- Purpose: executes pipeline tasks, generation, and publishing jobs
- Start command:

```powershell
docker compose up -d app
```

- Check command:

```powershell
docker compose logs --tail=80 app
```

### Celery Beat

- URL: no separate URL
- Port: no separate port
- Purpose: scheduled task runner
- Start command:

```powershell
docker compose up -d app
```

- Check command:

```powershell
docker compose logs --tail=80 app
```

### Flower

- URL: `http://localhost:5555/`
- Port: `5555`
- Purpose: web UI for Celery queues and tasks
- Start command:

```powershell
docker compose up -d flower
```

- Check command:

```powershell
Invoke-WebRequest -Uri http://localhost:5555/ -UseBasicParsing
```

### Adminer

- URL: `http://localhost:8082/`
- Port: `8082`
- Purpose: web client for PostgreSQL
- Start command:

```powershell
docker compose up -d adminer
```

- Check command:

```powershell
Invoke-WebRequest -Uri http://localhost:8082/ -UseBasicParsing
```

### Redis Commander

- URL: `http://localhost:8081/`
- Port: `8081`
- Purpose: web UI for Redis
- Start command:

```powershell
docker compose up -d redis-commander
```

- Check command:

```powershell
Invoke-WebRequest -Uri http://localhost:8081/ -UseBasicParsing
```

### Telegram Bot

- URL: no separate URL
- Port: no separate port
- Purpose: publishes approved materials to Telegram and reports latest status
- Start command:

```powershell
docker compose up -d app
```

- Check command:

```powershell
docker compose logs --tail=80 app
Invoke-RestMethod http://localhost:8000/api/public-status
```

### OpenAI

- URL: `https://api.openai.com/`
- Port: `443`
- Purpose: AI-based material generation
- Start command:

```powershell
docker compose up -d app
```

- Check command:

```powershell
Invoke-RestMethod -Uri http://localhost:8000/api/openai/check -Headers @{ "X-API-Key" = "your_ADMIN_API_KEY" } -Method Post
```

### Docker Compose

- URL: not applicable
- Port: not applicable
- Purpose: orchestrates all containers
- Start command:

```powershell
docker compose build
docker compose up -d
```

- Check command:

```powershell
docker compose ps
docker compose logs --tail=80 app
```

## Dashboard

The dashboard is organized into these blocks:

- Configuration
- News
- Telegram Delivery
- System Status
- Publishing and Manual Mode

### Configuration

The block has its own color, and the subblocks are visually separated:

- Admin API - blue
- OpenAI - purple
- Telegram - light blue

### News Topic

Single simplified block:

- Topic name
- Description
- Keywords
- A dropdown with topic examples
- `Save Topic` button

After saving, the UI shows:

- `Тему активовано`
- `Тему не активовано`

### News Sources

Two separate catalogs:

- RSS Sources
- Telegram Sources

Each catalog has at least 5 examples.

After selecting an example, the following fields are filled automatically:

- name
- address
- topic

After adding a source, the name and address are highlighted in green.

For Telegram sources the status shows:

- `Канал запущено`
- `Канал недоступний`

### News

If no news exists, the UI shows a clear message:

`Новини не знайдено. Перевірте джерела або запустіть збір новин.`

Each news card includes these actions:

- `Створити чернетку`
- `Покращити ШІ`
- `На підтвердження`
- `У Telegram`

### Pipeline

Buttons:

- `Почати збір новин`
- `Оновити статус`

The status area shows:

- `🟢 Конвеєр працює`
- `🔴 Конвеєр зупинено`

And these execution stages:

- Pipeline Started
- RSS Processing
- Telegram Processing
- AI Processing
- Post Generation
- Publishing
- Completed

### Telegram

If Telegram is already configured through `.env`, the `Bot Token` and `Target Channel` fields are not shown.

Only these statuses remain visible:

- `🟢 Telegram підключено`
- `🔴 Telegram не підключено`

If the connection is missing, the UI shows a human-readable reason:

- bot token is not set
- target channel is not set
- the bot has no access to the channel

### OpenAI

The OpenAI section shows:

- `OpenAI API Key`
- `🟢 OpenAI підключено`
- `🔴 OpenAI не підключено`

The check button does not require logs and returns a plain-language result.

### AI Test

Fields:

- AI Prompt
- Mode

Modes:

- Demo
- OpenAI

Button:

- `Перевірити ШІ`

Demo mode works without a key.

## Pipeline Flow

1. The user adds sources.
2. The user starts `Почати збір новин`.
3. Celery collects RSS and Telegram items.
4. News items are filtered.
5. Materials are created.
6. Materials move into the approval queue.
7. Materials can be edited manually or with AI.
8. After approval, the material is sent to Telegram.

## Telegram Workflow

### Publishing

1. Create a bot with `@BotFather`.
2. Add the bot as an administrator to your channel.
3. Set `TELEGRAM_BOT_TOKEN`.
4. Set `TELEGRAM_TARGET_CHANNEL`.

### Reading channels

For Telegram source reading, set:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`

Then authenticate once:

```powershell
docker compose run --rm app python -m app.telegram_login
```

## AI Processing Flow

1. A news item enters generation.
2. `OpenAIPostClient` checks the configured key.
3. If a key exists, OpenAI is used.
4. If no key exists, the demo fallback is used.
5. The material is placed in the publishing queue.

## `.env` and VS Code

If a real key is not being read, the most common cause is the process working directory.

This project already fixes that with:

- an absolute `.env` path in `app/config.py`
- `python.envFile` in [.vscode/settings.json](./.vscode/settings.json)
- a launch profile in [.vscode/launch.json](./.vscode/launch.json)

Recommended setup:

1. Put `.env` in the repository root.
2. Run the backend from the repository root or through the VS Code profile.
3. If you changed `ADMIN_API_KEY`, clear the old key in the browser.

## Useful Commands

```powershell
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=80 app
docker compose logs -f app
docker compose exec app alembic upgrade head
docker compose run --rm app pytest -q
docker compose run --rm app python -m app.telegram_login
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

- `app/main.py` - FastAPI and dashboard
- `app/config.py` - `.env` loading
- `app/api/endpoints.py` - dashboard API
- `app/tasks.py` - Celery pipeline
- `app/news_parser/` - RSS and Telegram parsers
- `app/ai/` - OpenAI client and demo fallback
- `app/telegram/` - Telegram bot and publishing
- `app/frontend/` - dashboard UI
- `alembic/` - database migrations

## Note About README

The main `README.md` remains the short entry point, while the full instructions are preserved here and in the Ukrainian version.
