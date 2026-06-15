# AI News Pipeline

AI News Pipeline collects news from RSS and Telegram, prepares materials with AI or manual editing, and publishes approved content to Telegram.

Docs:

- [README_UA.md](README_UA.md)
- [README_EN.md](README_EN.md)

Quick start:

```powershell
Copy-Item .env.example .env
docker compose build
docker compose up -d
```

Recommended frontend approach for a fast deadline:

- keep the dashboard as a single static page served by FastAPI
- avoid a separate React/Vue build step
- use one Docker Compose stack so the whole project starts together

This project already follows that approach through `app/frontend/` and the main `app` service.

Frontend concept:

- main screen is product-oriented for a Telegram content manager
- technical tools are hidden in `Developer Tools`
- source, AI, Telegram, posts, and logs are organized as accordion sections

Main links:

- Dashboard: `http://localhost:8000/`
- Swagger: `http://localhost:8000/docs`
- Public status: `http://localhost:8000/api/public-status`
- Flower: `http://localhost:5555/`
- Adminer: `http://localhost:8082/`
- Redis Commander: `http://localhost:8081/`

Useful commands:

```powershell
docker compose ps
docker compose logs --tail=80 app
docker compose logs --tail=80 flower
Invoke-WebRequest http://localhost:8000/api/health
Invoke-WebRequest http://localhost:8000/api/public-status
Invoke-WebRequest http://localhost:8000/docs
```

Admin checks:

```powershell
$headers = @{ 'X-API-Key' = 'PASTE_ADMIN_API_KEY_HERE' }
Invoke-RestMethod -Headers $headers -Uri http://localhost:8000/api/settings
Invoke-RestMethod -Headers $headers -Method Post -Uri http://localhost:8000/api/openai/check
Invoke-RestMethod -Headers $headers -Method Post -Uri http://localhost:8000/api/pipeline/run
Invoke-RestMethod -Headers $headers -Uri http://localhost:8000/api/logs/errors
```

Telegram and background flow:

- open the dashboard at `http://localhost:8000/`
- save `ADMIN_API_KEY` in the dashboard once per browser session
- use the pipeline button to run parsing
- use OpenAI check to verify AI mode or demo mode
- use the delivery section to verify Telegram configuration and queue publishing
- watch `docker compose logs --tail=80 app` for the Telegram bot, Celery worker and FastAPI output
