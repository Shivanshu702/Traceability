
# C:\SHIVANSH\Traceability\backend\services\scheduler_service.py

import asyncio
import logging
from core.timeutil import as_aware
import os
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.executors.pool import ThreadPoolExecutor

logger = logging.getLogger(__name__)

from database import engine

# ── Scheduler setup with persistent SQLAlchemy job store ──────────────────────
# Reuse the app's engine: same normalised URL/driver (postgres:// → psycopg2) and the
# same connection pool — no second pool competing for the database's connection limit.
jobstores    = {"default": SQLAlchemyJobStore(engine=engine, tablename="apscheduler_jobs")}
executors    = {"default": ThreadPoolExecutor(max_workers=2)}
job_defaults = {"coalesce": True, "max_instances": 1}

scheduler = BackgroundScheduler(
    jobstores    = jobstores,
    executors    = executors,
    job_defaults = job_defaults,
    timezone     = "UTC",
)


# ── Stuck tray check (hourly) ──────────────────────────────────────────────────

def _check_stuck_trays():
    """
    Hourly job: detect bottlenecks and send alert emails for all active tenants.

    Deduplication: only alert on trays that have NOT been alerted in the last
    (stuck_hours * 2) hours. On alert, write last_stuck_alert_at = now.
    """
    try:
        from database import SessionLocal
        from models import Tray, EmailSettings
        from services.analytics_service import detect_bottlenecks
        from services.email_service import send_stuck_alert, get_email_settings

        db = SessionLocal()
        try:
            all_settings = db.query(EmailSettings).all()
            tenant_ids   = [s.tenant_id for s in all_settings] or ["default"]

            for tid in tenant_ids:
                settings = get_email_settings(db, tid)
                if not settings.stuck_alert_enabled:
                    continue

                cooldown_hours = max(settings.stuck_hours * 2, 2)
                cutoff         = datetime.now(timezone.utc) - timedelta(hours=cooldown_hours)

                all_stuck = detect_bottlenecks(db, tid)

                # Filter to only trays not recently alerted.
                to_alert = []
                for item in all_stuck:
                    tray = db.query(Tray).filter(
                        Tray.tenant_id == tid,
                        Tray.id        == item["tray_id"],
                    ).first()
                    if tray:
                        alert_at = tray.last_stuck_alert_at
                        # Normalise naive timestamps from pre-migration rows.
                        if alert_at is not None and alert_at.tzinfo is None:
                            alert_at = alert_at.replace(tzinfo=timezone.utc)
                        if alert_at is None or alert_at < cutoff:
                            to_alert.append(item)

                if not to_alert:
                    logger.debug("[%s] No new stuck trays to alert (all within cooldown)", tid)
                    continue

                send_stuck_alert(db, to_alert, settings.stuck_hours, tid)

                # Stamp last_stuck_alert_at on alerted trays.
                now = datetime.now(timezone.utc)
                for item in to_alert:
                    tray = db.query(Tray).filter(
                        Tray.tenant_id == tid,
                        Tray.id        == item["tray_id"],
                    ).first()
                    if tray:
                        tray.last_stuck_alert_at = now

                db.commit()
                logger.info("[%s] Stuck alert sent — %d trays", tid, len(to_alert))

        finally:
            db.close()

    except Exception as exc:
        logger.error("_check_stuck_trays error: %s", exc, exc_info=True)


# ── Daily summary (runs every hour, fires when hour matches tenant pref) ───────

def _send_daily_summary():
    """
    Hourly cron job that fires when the current UTC hour matches each tenant's
    configured daily_summary_hour. This honours per-tenant time preferences
    rather than forcing all tenants to the same fixed hour.
    """
    try:
        from database import SessionLocal
        from models import Tray, EmailSettings
        from services.analytics_service import detect_bottlenecks
        from services.email_service import send_daily_summary, get_email_settings
        from datetime import date

        current_hour = datetime.now(timezone.utc).hour
        db = SessionLocal()
        try:
            all_settings = db.query(EmailSettings).all()
            tenant_ids   = [s.tenant_id for s in all_settings] or ["default"]

            for tid in tenant_ids:
                settings = get_email_settings(db, tid)

                if not settings.daily_summary_enabled:
                    continue

                # Only fire if the current UTC hour matches this tenant's preference.
                if settings.daily_summary_hour != current_hour:
                    continue

                today     = datetime.now(timezone.utc).date()
                all_trays = db.query(Tray).filter(Tray.tenant_id == tid).all()

                stage_counts: dict = {}
                for t in all_trays:
                    if not t.is_done and t.stage != "SPLIT":
                        stage_counts[t.stage] = stage_counts.get(t.stage, 0) + 1

                stats = {
                    "total_active":    sum(1 for t in all_trays if not t.is_done and t.stage != "SPLIT"),
                    "total_complete":  sum(1 for t in all_trays if t.is_done),
                    "fifo_violated":   sum(1 for t in all_trays if t.fifo_violated),
                    "completed_today": sum(
                        1 for t in all_trays
                        if t.is_done
                        and t.completed_at
                        and t.completed_at.date() == today
                    ),
                    "stuck_count":  len(detect_bottlenecks(db, tid)),
                    "stage_counts": stage_counts,
                }

                send_daily_summary(db, stats, tid)
                logger.info("[%s] Daily summary sent (hour=%d)", tid, current_hour)

        finally:
            db.close()

    except Exception as exc:
        logger.error("_send_daily_summary error: %s", exc, exc_info=True)


# ── NEW: Cogiscan poll ─────────────────────────────────────────────────────────
# FIX: sync wrapper — BackgroundScheduler uses ThreadPoolExecutor (no async).
# FIX: local imports to avoid circular import at module load time.
# FIX: use SessionLocal (not get_db generator) for background tasks.

def _cogiscan_poll_task():
    """Runs every 30 s; polls each tenant whose interval has elapsed."""
    from database import SessionLocal
    from models.integration import IntegrationConfig
    from services.cogiscan import run_sync as cogiscan_sync
    db = SessionLocal()
    try:
        configs = db.query(IntegrationConfig).filter(
            IntegrationConfig.cogiscan_enabled == True      # noqa: E712
        ).all()
        for cfg in configs:
            try:
                if cfg.cogiscan_poll_sec <= 0 or not cfg.cogiscan_url:
                    continue
                if cfg.cogiscan_last_sync:
                    elapsed = (datetime.now(timezone.utc) - as_aware(cfg.cogiscan_last_sync)).total_seconds()
                    if elapsed < cfg.cogiscan_poll_sec:
                        continue
                asyncio.run(cogiscan_sync(db, cfg))
            except Exception as exc:
                db.rollback()
                logger.error("Cogiscan poll error (tenant=%s): %s", cfg.tenant_id, exc, exc_info=True)
    finally:
        db.close()


# ── WATS hourly sync ───────────────────────────────────────────────────────────

def _wats_scheduled_task():
    """Runs every hour; syncs each tenant whose WATS mode is scheduled."""
    from database import SessionLocal
    from models.integration import IntegrationConfig
    from services.wats import run_sync as wats_sync

    db = SessionLocal()
    try:
        configs = db.query(IntegrationConfig).filter(
            IntegrationConfig.wats_enabled == True,         # noqa: E712
            IntegrationConfig.wats_sync_mode.in_(("scheduled", "auto")),
        ).all()
        for cfg in configs:
            try:
                asyncio.run(wats_sync(db, cfg))
            except Exception as exc:
                db.rollback()
                logger.error("WATS scheduled sync error (tenant=%s): %s", cfg.tenant_id, exc, exc_info=True)
    finally:
        db.close()

# ── Lifecycle ──────────────────────────────────────────────────────────────────

_lock_handle = None


def _secure_jobstore_table() -> None:
    """APScheduler creates `apscheduler_jobs` itself (not via Alembic). On Supabase, enable
    Row Level Security on it too so the public REST API cannot read it. No-op elsewhere."""
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            if conn.dialect.name != "postgresql":
                return
            if conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname = 'anon'")).first():
                conn.execute(text("ALTER TABLE public.apscheduler_jobs ENABLE ROW LEVEL SECURITY"))
    except Exception as exc:          # never block startup on a hardening step
        logger.warning("Could not enable RLS on apscheduler_jobs: %s", exc)


def _acquire_scheduler_lock() -> bool:
    global _lock_handle
    if os.getenv("RUN_SCHEDULER", "true").lower() == "false":
        return False
    try:
        import fcntl, tempfile
        path = os.path.join(tempfile.gettempdir(), "mes_scheduler.lock")
        _lock_handle = open(path, "w")
        fcntl.flock(_lock_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except ImportError:          # Windows / no fcntl — single-process dev
        return True
    except OSError:              # lock held by another worker
        return False


def start_scheduler():
    """Start the background scheduler. Called on app startup."""
    if scheduler.running:
        return

    # Several gunicorn workers each import the app. Only ONE may run the scheduler,
    # otherwise alerts / summaries / syncs fire once per worker. An OS file lock
    # elects the owner (released automatically when that process exits).
    if not _acquire_scheduler_lock():
        logger.info("Scheduler owned by another worker — not starting here")
        return

    scheduler.add_job(
        _check_stuck_trays,
        trigger            = "interval",
        hours              = 1,
        id                 = "check_stuck_trays",
        replace_existing   = True,
        misfire_grace_time = 300,
    )

    # Run every hour at :00; the job itself checks per-tenant preferred hour.
    scheduler.add_job(
        _send_daily_summary,
        trigger            = "cron",
        minute             = 0,
        id                 = "send_daily_summary",
        replace_existing   = True,
        misfire_grace_time = 600,
    )
    
    # FIX: both new jobs registered HERE, not at module level.
    # Cogiscan poll runs every 30 s; the task checks configured interval itself.
    scheduler.add_job(
        _cogiscan_poll_task,
        trigger            = "interval",
        seconds            = 30,
        id                 = "cogiscan_poll",
        replace_existing   = True,
        misfire_grace_time = 60,
    )

    # WATS hourly sync; the task checks wats_sync_mode itself.
    scheduler.add_job(
        _wats_scheduled_task,
        trigger            = "interval",
        hours              = 1,
        id                 = "wats_hourly_sync",
        replace_existing   = True,
        misfire_grace_time = 300,
    )

    scheduler.start()
    _secure_jobstore_table()
    logger.info(
        "APScheduler started with SQLAlchemy job store — "
        "stuck-tray check (hourly) + daily summary (per-tenant hour)"
        "+ Cogiscan poll (30 s) + WATS hourly sync"
    )


def stop_scheduler():
    """Gracefully stop the scheduler. Called on app shutdown."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")

