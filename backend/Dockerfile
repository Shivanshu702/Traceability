# ── Build stage ───────────────────────────────────────────────────────────────
# Pin Python 3.11 (stable LTS). Render was defaulting to 3.14 (bleeding edge).
# Using slim to minimise image size and attack surface.
FROM python:3.11-slim AS base

# Security: don't run as root inside the container
RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app

# Install system deps needed by psycopg2-binary and Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# ── Dependencies ──────────────────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── App code ──────────────────────────────────────────────────────────────────
COPY . .

# Switch to non-root user
RUN chown -R app:app /app
USER app

# ── Runtime ───────────────────────────────────────────────────────────────────
EXPOSE 10000

# Gunicorn with 2 Uvicorn workers.
# Adjust --workers based on Render instance size:
#   Starter (512MB RAM): 1 worker
#   Standard (2GB RAM):  2-4 workers
ENV PORT=10000
ENV WORKERS=2

CMD gunicorn main:app \
    --workers ${WORKERS} \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:${PORT} \
    --timeout 120 \
    --keep-alive 5 \
    --access-logfile - \
    --error-logfile -
