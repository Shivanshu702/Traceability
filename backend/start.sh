#!/bin/bash
# Production startup — Gunicorn with multiple Uvicorn workers.
# For single-process dev use:  uvicorn main:app --reload --port 8001

exec gunicorn main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:${PORT:-10000} \
  --timeout 120 \
  --keep-alive 5 \
  --access-logfile - \
  --error-logfile -
