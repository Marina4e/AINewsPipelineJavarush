# AI News Pipeline

Compact project docs:

- [Українська документація](README_UA.md)
- [English documentation](README_EN.md)

AI News Pipeline is a FastAPI + Celery dashboard for collecting RSS/Telegram news, preparing AI or demo Telegram posts, reviewing drafts, and publishing approved content.

Quick start:

```powershell
Copy-Item .env.example .env
docker compose build
docker compose up -d
docker compose ps
```

Main links:

- Dashboard: `http://localhost:8000/`
- API docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/api/health`
- Flower: `http://localhost:5555/`
- Redis Commander: `http://localhost:8081/`
- Adminer: `http://localhost:8082/`

Terminal check:

```powershell
.\\.venv\\Scripts\\python.exe -m pytest -q
docker compose logs --tail=80 app
Invoke-WebRequest http://localhost:8000/api/health
```
