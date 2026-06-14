#!/bin/sh
set -eu

echo "Starting AI News Pipeline app stack..."
echo "Running database migrations..."
alembic upgrade head

# Запускаємо фонові процеси окремо, але в одному Docker-контейнері.
# Так Docker Compose збирає один Python image, а термінал не висить після `up -d`.
echo "Starting Celery worker..."
celery -A celery_worker.celery_app worker --loglevel=info &
worker_pid="$!"

echo "Starting Celery beat scheduler..."
celery -A celery_worker.celery_app beat --loglevel=info &
beat_pid="$!"

echo "Starting Telegram bot..."
python -m app.telegram.bot &
bot_pid="$!"

echo "Starting FastAPI dashboard and API..."
uvicorn app.main:app --host 0.0.0.0 --port 8000 &
api_pid="$!"

stop_stack() {
  # Якщо контейнер зупиняється, акуратно вимикаємо всі внутрішні процеси.
  echo "Stopping AI News Pipeline app stack..."
  kill -TERM "$api_pid" "$worker_pid" "$beat_pid" "$bot_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}

trap stop_stack INT TERM

while true; do
  # Якщо будь-який головний процес впав, контейнер теж завершується з помилкою.
  # Це допомагає швидко побачити проблему через `docker compose ps` і logs.
  for pid in "$api_pid" "$worker_pid" "$beat_pid" "$bot_pid"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "Process $pid stopped. Shutting down app container."
      stop_stack
      exit 1
    fi
  done
  sleep 5
done
