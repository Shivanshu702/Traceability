#!/bin/bash
# Production startup — runs DB migrations then starts Gunicorn.
# For single-process dev use:  uvicorn main:app --reload --port 8001

set -e   # abort immediately if any command fails

echo "Running database migrations..."
alembic upgrade head
echo "Migrations complete."

exec gunicorn main:app \
  --workers ${WORKERS:-2} \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:${PORT:-10000} \
  --timeout 120