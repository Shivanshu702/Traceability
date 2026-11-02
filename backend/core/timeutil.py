"""Time helpers. DB columns are naive-UTC (SQLite strips tz), so queries compare naive UTC."""
from datetime import datetime, timezone


def utc_today_start() -> datetime:
    """Midnight today (UTC) as a naive datetime — safe to compare with naive DB columns."""
    n = datetime.now(timezone.utc)
    return datetime(n.year, n.month, n.day)


def as_aware(dt):
    """Return dt as timezone-aware UTC (naive values are assumed to be UTC)."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def shift_for(dt) -> str:
    """Map a timestamp to Morning / Afternoon / Night.

    Boundaries come from SHIFT_STARTS ("6,14,22" = morning 06-14, afternoon 14-22,
    night 22-06) evaluated in the plant's timezone SHIFT_TZ (IANA name, default UTC).
    """
    import os
    from zoneinfo import ZoneInfo
    if dt is None:
        return "Unknown"
    try:
        tz = ZoneInfo(os.getenv("SHIFT_TZ", "UTC"))
        m, a, n = (int(x) for x in os.getenv("SHIFT_STARTS", "6,14,22").split(","))
    except Exception:
        tz, (m, a, n) = timezone.utc, (6, 14, 22)
    h = as_aware(dt).astimezone(tz).hour
    if m <= h < a:
        return "Morning"
    if a <= h < n:
        return "Afternoon"
    return "Night"
