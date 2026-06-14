# AI News Pipeline

AI News Pipeline збирає новини з RSS і Telegram, зберігає їх у PostgreSQL, готує матеріали через AI або ручне редагування та публікує погоджений контент у Telegram.

Проєкт побудований так, щоб AI був необов'язковим:

- платформа працює без `OPENAI_API_KEY`
- demo-режим доступний скрізь, де це важливо
- `.env` читається з кореня репозиторію, тому VS Code, Docker і термінал використовують однакову конфігурацію

## Документація

- [README.md](README.md)
- [README_EN.md](README_EN.md)

## Швидкий старт

### 1. Створи `.env`

```powershell
Copy-Item .env.example .env
```

### 2. Заповни змінні середовища

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

## Важливо про `ADMIN_API_KEY`

`ADMIN_API_KEY` зберігається тільки в `.env` у корені проєкту.

Frontend:

- не містить ключа в коді
- тимчасово зберігає його лише в `sessionStorage` браузера
- передає його в заголовку `X-API-Key`

Backend:

- читає ключ з `.env`
- порівнює його з заголовком `X-API-Key`
- повертає людяні повідомлення, якщо ключ не збігається або не налаштований

### Як правильно створити `ADMIN_API_KEY`

Рекомендовано використовувати довгий випадковий секрет.

PowerShell:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Альтернативно через Python:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Де зберігати `ADMIN_API_KEY`

1. Додай значення у `.env` у корені репозиторію.
2. Перезапусти backend:

```powershell
docker compose up -d
```

3. Увійди у dashboard і встав цей же ключ у поле доступу.

Якщо ключ змінився у `.env`, браузерний `sessionStorage` не оновиться автоматично, тому старий ключ у dashboard треба замінити вручну.

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

### Поведінка конвеєра

- `AUTO_PUBLISH_POSTS`
- `PARSER_INTERVAL_MINUTES`
- `SITE_REQUEST_TIMEOUT`
- `DEFAULT_NEWS_LIMIT`
- `ALLOWED_LANGUAGES`

## Архітектура проєкту

- `app/main.py` - FastAPI entrypoint і dashboard
- `app/config.py` - читання `.env`
- `app/api/endpoints.py` - API для dashboard
- `app/tasks.py` - Celery pipeline
- `app/news_parser/` - RSS і Telegram парсери
- `app/ai/` - OpenAI клієнт і demo fallback
- `app/telegram/` - Telegram bot і публікація
- `app/frontend/` - UI dashboard
- `alembic/` - міграції бази даних

## Сервіси та порти

### AI News Frontend

- URL: `http://localhost:8000/`
- Порт: `8000`
- Призначення: панель керування, перегляд новин, тем, джерел, черги публікації та статусів
- Команда запуску:

```powershell
docker compose up -d app
```

- Команда перевірки:

```powershell
Invoke-WebRequest -Uri http://localhost:8000/ -UseBasicParsing
```

### FastAPI Backend

- URL: `http://localhost:8000/`
- Порт: `8000`
- Призначення: REST API, dashboard, перевірка ключів, керування конвеєром
- Команда запуску:

```powershell
docker compose up -d app
```

- Команда перевірки:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
Invoke-RestMethod http://localhost:8000/api/public-status
```

### PostgreSQL

- URL: `postgresql://localhost:5432`
- Порт: `5432`
- Призначення: основна база даних
- Команда запуску:

```powershell
docker compose up -d postgres
```

- Команда перевірки:

```powershell
docker compose exec postgres pg_isready -U $env:POSTGRES_USER -d $env:POSTGRES_DB
```

### Redis

- URL: `redis://localhost:6379`
- Порт: `6379`
- Призначення: брокер і сховище результатів Celery
- Команда запуску:

```powershell
docker compose up -d redis
```

- Команда перевірки:

```powershell
docker compose exec redis redis-cli ping
```

### Celery Worker

- URL: немає окремого URL
- Порт: немає окремого порту
- Призначення: обробка задач конвеєра, генерація постів, публікація
- Команда запуску:

```powershell
docker compose up -d app
```

- Команда перевірки:

```powershell
docker compose logs --tail=80 app
```

### Celery Beat

- URL: немає окремого URL
- Порт: немає окремого порту
- Призначення: планувальник періодичних задач
- Команда запуску:

```powershell
docker compose up -d app
```

- Команда перевірки:

```powershell
docker compose logs --tail=80 app
```

### Flower

- URL: `http://localhost:5555/`
- Порт: `5555`
- Призначення: веб-інтерфейс для черги Celery
- Команда запуску:

```powershell
docker compose up -d flower
```

- Команда перевірки:

```powershell
Invoke-WebRequest -Uri http://localhost:5555/ -UseBasicParsing
```

### Adminer

- URL: `http://localhost:8082/`
- Порт: `8082`
- Призначення: веб-клієнт для PostgreSQL
- Команда запуску:

```powershell
docker compose up -d adminer
```

- Команда перевірки:

```powershell
Invoke-WebRequest -Uri http://localhost:8082/ -UseBasicParsing
```

### Redis Commander

- URL: `http://localhost:8081/`
- Порт: `8081`
- Призначення: веб-інтерфейс для Redis
- Команда запуску:

```powershell
docker compose up -d redis-commander
```

- Команда перевірки:

```powershell
Invoke-WebRequest -Uri http://localhost:8081/ -UseBasicParsing
```

### Telegram Bot

- URL: немає окремого URL
- Порт: немає окремого порту
- Призначення: публікація погоджених матеріалів у Telegram і показ останнього стану
- Команда запуску:

```powershell
docker compose up -d app
```

- Команда перевірки:

```powershell
docker compose logs --tail=80 app
Invoke-RestMethod http://localhost:8000/api/public-status
```

### OpenAI

- URL: `https://api.openai.com/`
- Порт: `443`
- Призначення: генерація матеріалів ШІ
- Команда запуску:

```powershell
docker compose up -d app
```

- Команда перевірки:

```powershell
Invoke-RestMethod -Uri http://localhost:8000/api/openai/check -Headers @{ "X-API-Key" = "твій_ADMIN_API_KEY" } -Method Post
```

### Docker Compose

- URL: не застосовується
- Порт: не застосовується
- Призначення: оркестрація всіх контейнерів
- Команда запуску:

```powershell
docker compose build
docker compose up -d
```

- Команда перевірки:

```powershell
docker compose ps
docker compose logs --tail=80 app
```

## Dashboard

Dashboard складається з таких блоків:

- Конфігурація
- Новини
- Доставка в Telegram
- Статус системи
- Публікація і ручний режим

### Конфігурація

Блок має окремий колір, а підблоки мають власне візуальне виділення:

- Admin API - синій
- OpenAI - фіолетовий
- Telegram - блакитний

### Тема новин

Один спрощений блок:

- Назва теми
- Опис
- Ключові слова
- Випадаючий список прикладів тем
- Кнопка `Зберегти тему`

Після збереження показується:

- `Тему активовано`
- `Тему не активовано`

### Джерела новин

Два окремі каталоги:

- Перелік RSS джерел
- Перелік Telegram джерел

Щонайменше 5 прикладів у кожному каталозі.

Після вибору прикладу автоматично заповнюються:

- назва
- адреса
- тема

Після додавання назва та адреса джерела підсвічуються зеленим.

Для Telegram-джерел статус показує:

- `Канал запущено`
- `Канал недоступний`

### Новини

Якщо новини відсутні, показується зрозуміле повідомлення:

`Новини не знайдено. Перевірте джерела або запустіть збір новин.`

На картці новини доступні дії:

- `Створити чернетку`
- `Покращити ШІ`
- `На підтвердження`
- `У Telegram`

### Конвеєр

Кнопки:

- `Почати збір новин`
- `Оновити статус`

Статус показує:

- `🟢 Конвеєр працює`
- `🔴 Конвеєр зупинено`

І етапи виконання:

- Pipeline Started
- RSS Processing
- Telegram Processing
- AI Processing
- Post Generation
- Publishing
- Completed

### Telegram

Якщо Telegram уже налаштований через `.env`, поля `Bot Token` і `Target Channel` не показуються.

Показуються:

- `🟢 Telegram підключено`
- `🔴 Telegram не підключено`

Якщо підключення відсутнє, показується людська причина:

- токен бота не задано
- цільовий канал не задано
- бот не має доступу до каналу

### OpenAI

Секція OpenAI показує:

- `OpenAI API Key`
- `🟢 OpenAI підключено`
- `🔴 OpenAI не підключено`

Кнопка перевірки не потребує логів, а повертає текстовий результат.

### AI Test

Поля:

- AI Prompt
- Mode

Режими:

- Demo
- OpenAI

Кнопка:

- `Перевірити ШІ`

Demo mode працює без ключа.

## Як працює конвеєр

1. Користувач додає джерела.
2. Запускає `Почати збір новин`.
3. Celery збирає RSS і Telegram.
4. Новини проходять фільтрацію.
5. Створюються матеріали.
6. Матеріали потрапляють у чергу підтвердження.
7. Матеріали можна відредагувати вручну або через AI.
8. Після підтвердження матеріал відправляється в Telegram.

## Як працює Telegram workflow

### Публікація

1. Створи бота через `@BotFather`.
2. Додай бота адміністратором у канал.
3. Задай `TELEGRAM_BOT_TOKEN`.
4. Задай `TELEGRAM_TARGET_CHANNEL`.

### Читання каналів

Для читання Telegram-джерел задай:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`

Після цього авторизуйся:

```powershell
docker compose run --rm app python -m app.telegram_login
```

## Як працює AI processing flow

1. Новина потрапляє до генерації.
2. `OpenAIPostClient` перевіряє ключ.
3. Якщо ключ є, використовується OpenAI.
4. Якщо ключа немає, використовується demo fallback.
5. Матеріал потрапляє в чергу публікації.

## `.env` і VS Code

Якщо реальний ключ не читається, найчастіша причина - неправильна робоча директорія запуску.

У цьому проєкті вже налаштовано:

- абсолютний шлях до `.env` у `app/config.py`
- `python.envFile` у [.vscode/settings.json](./.vscode/settings.json)
- окремий launch-профіль у [.vscode/launch.json](./.vscode/launch.json)

Рекомендований порядок:

1. Поклади `.env` у корінь репозиторію.
2. Запусти backend з кореня проєкту або через VS Code profile.
3. Якщо змінив `ADMIN_API_KEY`, очисти старий ключ у браузері.

## Корисні команди

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

## Перевірка API

```powershell
Invoke-RestMethod http://localhost:8000/api/health
Invoke-RestMethod http://localhost:8000/api/public-status
```

## Перевірка `ADMIN_API_KEY`

```powershell
$headers = @{ "X-API-Key" = "твій_ADMIN_API_KEY" }
Invoke-RestMethod -Uri http://localhost:8000/api/settings -Headers $headers
```

## Структура проєкту

- `app/main.py` - FastAPI і dashboard
- `app/config.py` - читання `.env`
- `app/api/endpoints.py` - API для dashboard
- `app/tasks.py` - Celery pipeline
- `app/news_parser/` - RSS і Telegram парсери
- `app/ai/` - OpenAI клієнт і demo fallback
- `app/telegram/` - Telegram bot і публікація
- `app/frontend/` - dashboard UI
- `alembic/` - міграції бази

## Примітка про README

Основний файл `README.md` лишається як короткий вхід, а повні інструкції збережені тут і в англійській версії.
