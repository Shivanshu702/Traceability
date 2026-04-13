"""
scheduler_service.py
────────────────────
Background job scheduler (APScheduler).
Mirrors the time-triggered functions from the GAS implementation:
  • checkStuckTrays  → runs every hour
  • sendDailySummary → runs once per day at configured hour

In multi-tenant production you would iterate over all tenants in each job.
For single-tenant / self-hosted deployments the "default" tenant is used.
"""
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger    = logging.getLogger(__name__)
scheduler = BackgroundScheduler(timezone="UTC")


# ── Job definitions ───────────────────────────────────────────────────────────

def _check_stuck_trays():
    """Hourly: detect bottlenecks and send alert emails for all active tenants."""
    try:
        from database import SessionLocal
        from models import EmailSettings
        from services.analytics_service import detect_bottlenecks
        from services.email_service import send_stuck_alert, get_email_settings

        db = SessionLocal()
        try:
            # Collect all tenants that have email settings configured
            all_settings = db.query(EmailSettings).all()
            tenant_ids   = [s.tenant_id for s in all_settings] or ["default"]

            for tid in tenant_ids:
                settings = get_email_settings(db, tid)
                if not settings.stuck_alert_enabled:
                    continue

                stuck = detect_bottlenecks(db, tid)
                if stuck:
                    send_stuck_alert(db, stuck, settings.stuck_hours, tid)
                    logger.info(f"[{tid}] Stuck alert sent — {len(stuck)} trays")
        finally:
            db.close()

    except Exception as exc:
        logger.error(f"_check_stuck_trays error: {exc}", exc_info=True)


def _send_daily_summary():
    """Daily: compute production stats and send summary emails."""
    try:
        from database import SessionLocal
        from models import Tray, EmailSettings
        from services.analytics_service import detect_bottlenecks
        from services.email_service import send_daily_summary, get_email_settings
        from datetime import date

        db = SessionLocal()
        try:
            all_settings = db.query(EmailSettings).all()
            tenant_ids   = [s.tenant_id for s in all_settings] or ["default"]

            for tid in tenant_ids:
                settings = get_email_settings(db, tid)
                if not settings.daily_summary_enabled:
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
                logger.info(f"[{tid}] Daily summary sent")
        finally:
            db.close()

    except Exception as exc:
        logger.error(f"_send_daily_summary error: {exc}", exc_info=True)


# ── Lifecycle ─────────────────────────────────────────────────────────────────

def start_scheduler():
    """Start the background scheduler. Called on app startup."""
    if scheduler.running:
        return

    scheduler.add_job(
        _check_stuck_trays,
        trigger       = "interval",
        hours         = 1,
        id            = "check_stuck_trays",
        replace_existing = True,
        misfire_grace_time = 300,
    )

    scheduler.add_job(
        _send_daily_summary,
        trigger          = CronTrigger(hour=8, minute=0),
        id               = "send_daily_summary",
        replace_existing = True,
        misfire_grace_time = 600,
    )

    scheduler.start()
    logger.info("APScheduler started — stuck-tray check (hourly) + daily summary (08:00 UTC)")


def stop_scheduler():
    """Gracefully stop the scheduler. Called on app shutdown."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
