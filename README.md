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

Main links:

- Dashboard: `http://localhost:8000/`
- Swagger: `http://localhost:8000/docs`
- Public status: `http://localhost:8000/api/public-status`
- Flower: `http://localhost:5555/`
- Adminer: `http://localhost:8082/`
- Redis Commander: `http://localhost:8081/`
