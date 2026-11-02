

import os
from slowapi import Limiter
from slowapi.util import get_remote_address


def client_ip(request) -> str:
    """Key requests by real client IP.

    Behind Render/Vercel/nginx every request arrives from the proxy, so
    get_remote_address() would put ALL users in one bucket. Set TRUST_PROXY=true
    only when a trusted proxy sets X-Forwarded-For (it must overwrite any
    client-supplied value, as Render does).
    """
    if os.getenv("TRUST_PROXY", "false").lower() == "true":
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            return xff.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(
    key_func       = client_ip,
    default_limits = ["200/minute"],   # global fallback per IP
)

# ── Per-endpoint limits (apply as decorator) ───────────────────────────────────
#
# Usage in route files:
#   from core.rate_limit import limiter
#   from fastapi import Request
#
#   @router.post("/login")
#   @limiter.limit("10/minute")
#   def login(request: Request, payload: dict, ...):
#       ...
#
# Limit strings:
#   "10/minute"   — 10 calls per minute per IP
#   "100/hour"    — 100 calls per hour per IP
#   "5/second"    — 5 calls per second per IP
#
# Pre-defined limits for common endpoint categories:
AUTH_LIMIT   = "10/minute"     # login, register, forgot-password
SCAN_LIMIT   = "120/minute"    # scan endpoint — factory floor may be fast
EXPORT_LIMIT = "10/minute"     # exports are expensive
DEV_LIMIT    = "20/minute"     # dev panel


