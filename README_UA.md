# AI News Pipeline

AI News Pipeline збирає новини з RSS і Telegram, зберігає їх у PostgreSQL, формує матеріали через AI або ручне редагування та публікує їх у Telegram після підтвердження.

Ключова ідея проєкту:

- dashboard керує джерелами, темами, ключовими словами та чергою публікації
- AI не є обов'язковим: платформа працює й без `OPENAI_API_KEY`
- `.env` читається з кореня проєкту, тому ключі працюють у Docker, терміналі та VS Code

## Стек

- FastAPI
- PostgreSQL
- Redis
- Celery
- Flower
- Telegram Bot
- OpenAI
- Docker

## Швидкий старт

### 1. Створи `.env`

```powershell
Copy-Item .env.example .env
```

### 2. Заповни ключові змінні

Мінімум:

- `POSTGRES_PASSWORD`
- `ADMIN_API_KEY`

За потреби:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_TARGET_CHANNEL`
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `OPENAI_API_KEY`

### 3. Запусти проєкт

```powershell
docker compose build
docker compose up -d
docker compose ps
```

### 4. Відкрий dashboard

- `http://localhost:8000/`

## Важливо про `.env` і VS Code

Якщо ключ є реальним, але не читається, причина майже завжди в робочій директорії запуску.

Щоб прибрати цю проблему, у проєкті вже налаштовано:

- абсолютний шлях до `.env` у `app/config.py`
- `python.envFile` у [.vscode/settings.json](./.vscode/settings.json)
- окремий launch-профіль у [.vscode/launch.json](./.vscode/launch.json)

Тому достатньо:

1. покласти `.env` у корінь репозиторію
2. запустити app з кореня проєкту або через VS Code profile

## Змінні середовища

### Обов'язкові

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

### Поведінка пайплайна

- `AUTO_PUBLISH_POSTS`
- `PARSER_INTERVAL_MINUTES`
- `SITE_REQUEST_TIMEOUT`
- `DEFAULT_NEWS_LIMIT`
- `ALLOWED_LANGUAGES`

## Запуск і зупинка

```powershell
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=80 app
docker compose logs -f app
docker compose down
docker compose down -v
```

## Перевірка API

```powershell
Invoke-RestMethod http://localhost:8000/api/health
Invoke-RestMethod http://localhost:8000/api/public-status
```
## Створення адмін ключа 
```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
``` 
## Перевірка `ADMIN_API_KEY`

```powershell
$headers = @{ "X-API-Key" = "твій_ADMIN_API_KEY" }
Invoke-RestMethod -Uri http://localhost:8000/api/settings -Headers $headers
```

## Структура проєкту

- `app/main.py` - вхід FastAPI і dashboard
- `app/config.py` - читання `.env`
- `app/api/endpoints.py` - API для dashboard
- `app/tasks.py` - Celery pipeline
- `app/news_parser/` - RSS і Telegram парсери
- `app/ai/` - OpenAI клієнт і demo fallback
- `app/telegram/` - Telegram Bot і публікація
- `app/frontend/` - dashboard UI
- `alembic/` - міграції бази

## Dashboard

Dashboard має такі блоки:

- Доступ
- OpenAI
- AI Test
- Теми
- Ключові слова
- News Sources
- News Pipeline
- Collected News
- Publishing Queue
- Telegram Bot

### News Sources

Два окремі каталоги:

- RSS Sources
- Telegram Sources

Для Telegram використовується кнопка `Add News Channel`.

Кожна картка джерела показує:

- назву
- URL
- статус
- останню помилку
- час останньої перевірки
- час останнього успіху

### Topics and Keywords

Теми і ключові слова розділені.

Тема:

- name
- description

Ключові слова:

- вводяться через кому
- можуть бути без прив'язки до теми

### News Pipeline

Пайплайн показує такі етапи:

- Pipeline Started
- RSS Processing
- Telegram Processing
- AI Processing
- Post Generation
- Publishing
- Completed

Статус відображається як:

- `🟢 Pipeline Running`
- `🔴 Pipeline Stopped`

Повідомлення `News Collection Completed` з'являється тільки після завершення всіх етапів.

### Collected News

У блоці новин видно:

- Title
- Source
- Date
- Summary

Назва веде на повну статтю.

Дії:

- Edit Manually
- Improve with AI
- Publish to Website
- Publish to Telegram

### Publishing Queue

Це черга матеріалів:

- AI-generated posts
- manually edited posts

Фільтри:

- Pending Approval
- Published
- Errors
- All

Порожній стан:

`No materials available. Check sources or start news collection.`

### Telegram Bot

Після `/start` бот показує:

- Status
- Latest News
- Latest Material
- Approve Publication
- Return for Editing

Стан показує:

- Bot Online / Offline
- Channel Available / Unavailable
- Publishing Available / Unavailable
- Last Successful Delivery

### OpenAI

Секція OpenAI показує:

- OpenAI API Key
- 🟢 OpenAI Connected
- 🔴 OpenAI Not Connected

### AI Test

Поле:

- AI Prompt

Режими:

- Demo
- OpenAI

Кнопка:

- `🤖 Test AI`

Demo mode працює без ключа.

## AI без OpenAI

Платформа не залежить від реального OpenAI:

- `generate-demo` створює матеріал локально
- `generate` також повертає demo-резерв, якщо ключ відсутній
- `AI Test` у режимі Demo працює без `OPENAI_API_KEY`

## Telegram workflow

### Публікація

1. створи бота через `@BotFather`
2. додай бота адміністратором у канал
3. задай `TELEGRAM_BOT_TOKEN`
4. задай `TELEGRAM_TARGET_CHANNEL`

### Читання каналів

Для читання Telegram-джерел задай:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`

Після цього авторизуйся:

```powershell
docker compose run --rm app python -m app.telegram_login
```

## Pipeline flow

1. користувач додає джерела
2. запускає `Start News Collection`
3. Celery збирає RSS і Telegram
4. новини проходять фільтрацію
5. створюються матеріали
6. матеріали потрапляють у `Publishing Queue`
7. матеріали підтверджуються або повертаються на редагування
8. Telegram bot показує останній стан і дії

## AI processing flow

1. новина потрапляє до генерації
2. `OpenAIPostClient` перевіряє ключ
3. якщо ключ є - використовується OpenAI
4. якщо ключа немає - використовується demo fallback
5. матеріал потрапляє в чергу публікації

## Корисні команди

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

Чергу Celery можна дивитися тут:

- `http://localhost:5555/`

## Adminer

- `http://localhost:8082/`

## Redis Commander

- `http://localhost:8081/`
