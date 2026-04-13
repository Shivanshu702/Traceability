"""
email_service.py
────────────────
Sends HTML emails for three event types mirroring the GAS implementation:
  1. FIFO violation alert (immediate, on scan)
  2. Stuck tray alert (hourly, via scheduler)
  3. Daily production summary (daily, via scheduler)

SMTP credentials are loaded from the EmailSettings DB row for the tenant,
falling back to environment variables for zero-config deployments.
"""
import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List
from sqlalchemy.orm import Session
from models import EmailSettings
from datetime import date as _date

logger = logging.getLogger(__name__)


# ── Settings loader ───────────────────────────────────────────────────────────

def get_email_settings(db: Session, tenant_id: str = "default") -> EmailSettings:
    """Load email settings from DB; populate from env vars if not found."""
    row = db.query(EmailSettings).filter(
        EmailSettings.tenant_id == tenant_id
    ).first()

    if row:
        return row

    # No DB row yet — build a transient object from env vars
    return EmailSettings(
        tenant_id              = tenant_id,
        smtp_host              = os.getenv("SMTP_HOST", ""),
        smtp_port              = int(os.getenv("SMTP_PORT", "587")),
        smtp_user              = os.getenv("SMTP_USER", ""),
        smtp_password          = os.getenv("SMTP_PASSWORD", ""),
        smtp_use_tls           = os.getenv("SMTP_USE_TLS", "true").lower() != "false",
        from_email             = os.getenv("FROM_EMAIL", ""),
        alert_recipients       = os.getenv("ALERT_EMAILS", ""),
        stuck_alert_enabled    = os.getenv("STUCK_ALERT_ENABLED", "").lower() == "true",
        stuck_hours            = int(os.getenv("STUCK_HOURS", "1")),
        daily_summary_enabled  = os.getenv("DAILY_SUMMARY_ENABLED", "").lower() == "true",
        daily_summary_hour     = int(os.getenv("DAILY_SUMMARY_HOUR", "8")),
        fifo_alert_enabled     = os.getenv("FIFO_ALERT_ENABLED", "true").lower() != "false",
    )


# ── Core send function ────────────────────────────────────────────────────────

def send_email(settings: EmailSettings, to: List[str], subject: str, html_body: str) -> bool:
    """Send an HTML email via SMTP. Returns True on success."""
    if not settings.smtp_host or not to:
        logger.debug("Email skipped — no SMTP host or recipients configured")
        return False

    try:
        msg             = MIMEMultipart("alternative")
        msg["Subject"]  = subject
        msg["From"]     = settings.from_email or settings.smtp_user
        msg["To"]       = ", ".join(to)
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.ehlo()
            if settings.smtp_use_tls:
                server.starttls()
                server.ehlo()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(msg["From"], to, msg.as_string())

        logger.info(f"Email sent: {subject} → {to}")
        return True

    except Exception as exc:
        logger.error(f"Email send error: {exc}")
        return False


# ── Email template wrapper ────────────────────────────────────────────────────

def _wrap(title: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/>
<style>
body{{font-family:'Segoe UI',system-ui,sans-serif;background:#F4F5F7;color:#111827;margin:0;padding:0}}
.wrap{{max-width:600px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E5E7EB}}
.hdr{{background:#185FA5;color:#fff;padding:24px 28px}}
.hdr h1{{margin:0;font-size:20px;font-weight:700;line-height:1.3}}
.body{{padding:24px 28px;font-size:14px;line-height:1.6}}
.ftr{{background:#F9FAFB;padding:14px 28px;font-size:11px;color:#9CA3AF;border-top:1px solid #E5E7EB}}
table{{width:100%;border-collapse:collapse;margin-bottom:16px}}
th{{padding:9px 10px;text-align:left;background:#F9FAFB;font-size:11px;color:#6B7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #E5E7EB}}
td{{padding:9px 10px;border-bottom:1px solid #F3F4F6;font-size:13px;color:#374151}}
.kpi-grid{{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px}}
.kpi{{flex:1;min-width:110px;background:#F3F4F6;border-radius:8px;padding:14px 18px}}
.kpi-val{{font-size:26px;font-weight:700;line-height:1}}
.kpi-lbl{{font-size:11px;color:#6B7280;margin-top:4px}}
code{{background:#F3F4F6;padding:2px 6px;border-radius:4px;font-size:12px;font-family:monospace}}
.badge-red{{display:inline-block;background:#FEE2E2;color:#B91C1C;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:700}}
.badge-amber{{display:inline-block;background:#FEF3C7;color:#92400E;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:700}}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr"><h1>{title}</h1></div>
  <div class="body">{body}</div>
  <div class="ftr">Traceability System — automated notification. Do not reply to this email.</div>
</div>
</body>
</html>"""


# ── Alert senders ─────────────────────────────────────────────────────────────

def send_fifo_alert(
    db: Session,
    tray_id: str,
    stage: str,
    operator: str,
    older_tray_ids: list,
    tenant_id: str = "default",
):
    """Send an immediate email when a FIFO violation is detected on scan."""
    settings = get_email_settings(db, tenant_id)
    if not settings.fifo_alert_enabled:
        return

    recipients = _parse_recipients(settings.alert_recipients)
    if not recipients:
        return

    older_rows = "".join(
        f"<tr><td><code>{t}</code></td></tr>" for t in older_tray_ids
    ) or "<tr><td style='color:#9CA3AF'>None returned</td></tr>"

    body = f"""
    <p>A <strong>FIFO violation</strong> was detected during a scan.</p>
    <table>
      <tr><th>Tray ID</th><th>Stage</th><th>Operator</th></tr>
      <tr>
        <td><code>{tray_id}</code></td>
        <td>{stage}</td>
        <td>{operator}</td>
      </tr>
    </table>
    <p><strong>Older trays waiting at the same stage:</strong></p>
    <table><tr><th>Tray ID</th></tr>{older_rows}</table>
    <p style="color:#6B7280;font-size:12px">
      These trays entered <strong>{stage}</strong> before <code>{tray_id}</code>
      and should have been processed first.
    </p>
    """

    send_email(
        settings, recipients,
        f"⚠ FIFO Violation — {tray_id} at {stage}",
        _wrap("⚠ FIFO Violation Detected", body),
    )


def send_stuck_alert(
    db: Session,
    stuck_trays: list,
    stuck_hours: int = 1,
    tenant_id: str = "default",
):
    """Send a stuck-tray alert email (called from the hourly scheduler job)."""
    settings = get_email_settings(db, tenant_id)
    if not settings.stuck_alert_enabled or not stuck_trays:
        return

    recipients = _parse_recipients(settings.alert_recipients)
    if not recipients:
        return

    rows = "".join(
        f"""<tr>
          <td><code>{t['tray_id']}</code></td>
          <td>{t['stage']}</td>
          <td>{t.get('project') or '—'}</td>
          <td><span class="badge-red">{t['delay_hours']}h</span></td>
        </tr>"""
        for t in stuck_trays
    )
    count = len(stuck_trays)
    body = f"""
    <p>
      <strong>{count}</strong> tray{'s' if count != 1 else ''} ha{'ve' if count != 1 else 's'}
      not moved for more than <strong>{stuck_hours} hour{'s' if stuck_hours != 1 else ''}</strong>.
    </p>
    <table>
      <tr><th>Tray ID</th><th>Stage</th><th>Project</th><th>Stuck for</th></tr>
      {rows}
    </table>
    """

    send_email(
        settings, recipients,
        f"🕐 {count} Stuck Tray{'s' if count != 1 else ''} — {stuck_hours}h+ overdue",
        _wrap("🕐 Stuck Tray Alert", body),
    )


def send_daily_summary(
    db: Session,
    stats: dict,
    tenant_id: str = "default",
):
    """Send the daily production summary email (called from the daily scheduler job)."""
    settings = get_email_settings(db, tenant_id)
    if not settings.daily_summary_enabled:
        return

    recipients = _parse_recipients(settings.alert_recipients)
    if not recipients:
        return

    date_str = _date.today().strftime("%A, %d %B %Y")

    stage_rows = "".join(
        f"<tr><td>{stage}</td><td style='text-align:right;font-weight:700'>{count}</td></tr>"
        for stage, count in (stats.get("stage_counts") or {}).items()
        if count > 0
    )

    completed_today = stats.get("completed_today", 0)
    total_active    = stats.get("total_active", 0)
    fifo_violated   = stats.get("fifo_violated", 0)
    stuck_count     = stats.get("stuck_count", 0)

    body = f"""
    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-val" style="color:#16A34A">{completed_today}</div>
        <div class="kpi-lbl">Completed today</div>
      </div>
      <div class="kpi">
        <div class="kpi-val" style="color:#185FA5">{total_active}</div>
        <div class="kpi-lbl">Active in pipeline</div>
      </div>
      <div class="kpi">
        <div class="kpi-val" style="color:{'#DC2626' if fifo_violated > 0 else '#16A34A'}">{fifo_violated}</div>
        <div class="kpi-lbl">FIFO violations</div>
      </div>
      <div class="kpi">
        <div class="kpi-val" style="color:{'#D97706' if stuck_count > 0 else '#16A34A'}">{stuck_count}</div>
        <div class="kpi-lbl">Stuck trays</div>
      </div>
    </div>
    {f'<h3 style="margin:0 0 10px;font-size:14px">Active trays by stage</h3><table><tr><th>Stage</th><th style="text-align:right">Count</th></tr>{stage_rows}</table>' if stage_rows else ''}
    """

    send_email(
        settings, recipients,
        f"📊 Daily Summary — {date_str}",
        _wrap(f"📊 Daily Production Summary<br><span style='font-size:13px;font-weight:400;color:#CBD5E0'>{date_str}</span>", body),
    )


# ── Internal helper ───────────────────────────────────────────────────────────

def _parse_recipients(raw: str) -> List[str]:
    if not raw:
        return []
    return [r.strip() for r in raw.split(",") if r.strip()]
