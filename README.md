# AI News Pipeline

Compact project docs:

- [Українська документація](README_UA.md)
- [English documentation](README_EN.md)

[![CI](https://github.com/<your-github-username>/<your-repo-name>/actions/workflows/ci.yml/badge.svg)](https://github.com/<your-github-username>/<your-repo-name>/actions/workflows/ci.yml)

AI News Pipeline is a FastAPI + Celery dashboard for collecting RSS and Telegram news, preparing AI or demo Telegram posts, reviewing drafts, and publishing approved content.

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

Included assets:

- GitHub CI workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
- Screenshots: [`docs/screenshots/`](docs/screenshots/)

Terminal check:

```powershell
.\\.venv\\Scripts\\python.exe -m pytest -q
docker compose logs --tail=80 app
docker compose logs --tail=80 celery
docker compose logs --tail=80 flower
Invoke-WebRequest http://localhost:8000/api/health
```

Generate `ADMIN_API_KEY`:

```powershell
.\\.venv\\Scripts\\python.exe -c "import secrets; print(secrets.token_urlsafe(32))"
```

Note: replace `<your-github-username>` and `<your-repo-name>` in the badge URL after publishing the repository.
