"""
services/scheduler_service.py
──────────────────────────────
Background job scheduler (APScheduler).

Fixes in this version:
  1. SQLAlchemy job store — jobs survive server restarts/deploys.
     Previously, the in-process BackgroundScheduler lost all jobs on any
     crash or redeploy within the misfire_grace_time window.

  2. Stuck alert deduplication — each tray now carries last_stuck_alert_at.
     An alert is only sent if the tray hasn't been alerted in the last
     (stuck_hours * 2) period. This prevents hourly flood emails for
     the same stuck tray.

  3. Per-tenant daily summary hour — previously the cron was hardcoded to
     08:00 UTC for every tenant. The job now runs every hour at :00 and
     checks whether the current UTC hour matches each tenant's configured
     daily_summary_hour, respecting per-tenant preferences.

Requires: pip install apscheduler[sqlalchemy]
"""
import logging
import os
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.executors.pool import ThreadPoolExecutor

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./mes.db")

# ── Scheduler setup with persistent SQLAlchemy job store ────────────────────
jobstores  = {"default": SQLAlchemyJobStore(url=DATABASE_URL, tablename="apscheduler_jobs")}
executors  = {"default": ThreadPoolExecutor(max_workers=2)}
job_defaults = {"coalesce": True, "max_instances": 1}

scheduler = BackgroundScheduler(
    jobstores    = jobstores,
    executors    = executors,
    job_defaults = job_defaults,
    timezone     = "UTC",
)


# ── Stuck tray check (hourly) ────────────────────────────────────────────────

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
                cutoff         = datetime.utcnow() - timedelta(hours=cooldown_hours)

                all_stuck = detect_bottlenecks(db, tid)

                # Filter to only trays not recently alerted.
                to_alert = []
                for item in all_stuck:
                    tray = db.query(Tray).filter(
                        Tray.tenant_id == tid,
                        Tray.id        == item["tray_id"],
                    ).first()
                    if tray and (
                        tray.last_stuck_alert_at is None
                        or tray.last_stuck_alert_at < cutoff
                    ):
                        to_alert.append(item)

                if not to_alert:
                    logger.debug(f"[{tid}] No new stuck trays to alert (all within cooldown)")
                    continue

                send_stuck_alert(db, to_alert, settings.stuck_hours, tid)

                # Stamp last_stuck_alert_at on alerted trays.
                now = datetime.utcnow()
                for item in to_alert:
                    tray = db.query(Tray).filter(
                        Tray.tenant_id == tid,
                        Tray.id        == item["tray_id"],
                    ).first()
                    if tray:
                        tray.last_stuck_alert_at = now

                db.commit()
                logger.info(f"[{tid}] Stuck alert sent — {len(to_alert)} trays")

        finally:
            db.close()

    except Exception as exc:
        logger.error(f"_check_stuck_trays error: {exc}", exc_info=True)


# ── Daily summary (runs every hour, fires when hour matches tenant pref) ──────

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

        current_hour = datetime.utcnow().hour
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

                today     = date.today()
                all_trays = db.query(Tray).filter(Tray.tenant_id == tid).all()

                stage_counts: dict = {}
                for t in all_trays:
                    if t.stage not in ("COMPLETE", "SPLIT"):
                        stage_counts[t.stage] = stage_counts.get(t.stage, 0) + 1

                stats = {
                    "total_active":    sum(1 for t in all_trays if t.stage not in ("COMPLETE", "SPLIT")),
                    "total_complete":  sum(1 for t in all_trays if t.stage == "COMPLETE"),
                    "fifo_violated":   sum(1 for t in all_trays if t.fifo_violated),
                    "completed_today": sum(
                        1 for t in all_trays
                        if t.stage == "COMPLETE"
                        and t.completed_at
                        and t.completed_at.date() == today
                    ),
                    "stuck_count":  len(detect_bottlenecks(db, tid)),
                    "stage_counts": stage_counts,
                }

                send_daily_summary(db, stats, tid)
                logger.info(f"[{tid}] Daily summary sent (hour={current_hour})")

        finally:
            db.close()

    except Exception as exc:
        logger.error(f"_send_daily_summary error: {exc}", exc_info=True)


# ── Lifecycle ────────────────────────────────────────────────────────────────

def start_scheduler():
    """Start the background scheduler. Called on app startup."""
    if scheduler.running:
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

    scheduler.start()
    logger.info(
        "APScheduler started with SQLAlchemy job store — "
        "stuck-tray check (hourly) + daily summary (per-tenant hour)"
    )


def stop_scheduler():
    """Gracefully stop the scheduler. Called on app shutdown."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")