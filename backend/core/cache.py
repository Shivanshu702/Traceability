"""
core/cache.py
─────────────
Simple thread-safe in-memory TTL cache.

Why not Redis yet?
  At 50 customers with a single-server deployment, Redis adds infrastructure
  cost and ops complexity for marginal gain. This in-memory cache is safe
  because we have one Uvicorn process (WEB_CONCURRENCY=1 on Render free tier).
  When you scale to multiple workers or multiple servers, swap this for Redis.

What's cached:
  - Pipeline config per tenant   (60s TTL) — read on EVERY authenticated request
  - Stats per tenant+project     (20s TTL) — hit on every dashboard load
  - Pipeline definition          (300s TTL) — near-static data
"""
import time
from threading import Lock
from typing import Any


class TTLCache:
    def __init__(self, ttl: int = 30, name: str = "cache"):
        self._data:  dict = {}
        self._lock:  Lock = Lock()
        self._ttl:   int  = ttl
        self._name:  str  = name
        self._hits:  int  = 0
        self._misses:int  = 0

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                self._misses += 1
                return None
            value, expires_at = entry
            if time.monotonic() > expires_at:
                del self._data[key]
                self._misses += 1
                return None
            self._hits += 1
            return value

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._data[key] = (value, time.monotonic() + self._ttl)

    def delete(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def invalidate_prefix(self, prefix: str) -> int:
        """Delete all keys starting with prefix. Returns number deleted."""
        with self._lock:
            keys = [k for k in self._data if k.startswith(prefix)]
            for k in keys:
                del self._data[k]
            return len(keys)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    @property
    def stats(self) -> dict:
        with self._lock:
            total = self._hits + self._misses
            return {
                "name":      self._name,
                "size":      len(self._data),
                "hits":      self._hits,
                "misses":    self._misses,
                "hit_rate":  round(self._hits / total, 3) if total else 0,
                "ttl_secs":  self._ttl,
            }


# ── Global cache instances ────────────────────────────────────────────────────

# Pipeline config — read on every authenticated request, changes rarely
pipeline_cache = TTLCache(ttl=60, name="pipeline_config")

# Stats — dashboard polls every 30s
stats_cache = TTLCache(ttl=20, name="stats")

# Stage load — alerts dashboard
stage_load_cache = TTLCache(ttl=15, name="stage_load")
