

import json
import logging
import os
import time
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)


# ── In-process TTLCache (original implementation, unchanged) ──────────────────

class TTLCache:
    """Thread-safe in-process TTL cache.  Falls back to this when Redis is unavailable."""

    def __init__(self, ttl: int = 30, name: str = "cache"):
        self._data:   dict = {}
        self._lock:   Lock = Lock()
        self._ttl:    int  = ttl
        self._name:   str  = name
        self._hits:   int  = 0
        self._misses: int  = 0

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
        """Delete all keys starting with *prefix*. Returns number deleted."""
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
                "name":     self._name,
                "backend":  "in-process",
                "size":     len(self._data),
                "hits":     self._hits,
                "misses":   self._misses,
                "hit_rate": round(self._hits / total, 3) if total else 0,
                "ttl_secs": self._ttl,
            }


# ── Redis-backed cache ─────────────────────────────────────────────────────────

class RedisCache:


    def __init__(self, client, ttl: int = 30, name: str = "cache"):
        self._r    = client
        self._ttl  = ttl
        self._name = name

    def _k(self, key: str) -> str:
        return f"traceability:{self._name}:{key}"

    def get(self, key: str) -> Any | None:
        try:
            raw = self._r.get(self._k(key))
            if raw is None:
                return None
            return json.loads(raw)
        except Exception as exc:
            logger.warning("RedisCache.get failed (%s) — returning None", exc)
            return None

    def set(self, key: str, value: Any) -> None:
        try:
            self._r.setex(self._k(key), self._ttl, json.dumps(value))
        except Exception as exc:
            logger.warning("RedisCache.set failed (%s) — skipping", exc)

    def delete(self, key: str) -> None:
        try:
            self._r.delete(self._k(key))
        except Exception as exc:
            logger.warning("RedisCache.delete failed (%s) — skipping", exc)

    def invalidate_prefix(self, prefix: str) -> int:
        """Delete all keys matching traceability:{name}:{prefix}*."""
        pattern = self._k(prefix) + "*"
        deleted = 0
        try:
            cursor = 0
            while True:
                cursor, keys = self._r.scan(cursor, match=pattern, count=100)
                if keys:
                    self._r.delete(*keys)
                    deleted += len(keys)
                if cursor == 0:
                    break
        except Exception as exc:
            logger.warning("RedisCache.invalidate_prefix failed (%s) — skipping", exc)
        return deleted

    def clear(self) -> None:
        self.invalidate_prefix("")

    @property
    def stats(self) -> dict:
        try:
            info = self._r.info("stats")
            return {
                "name":    self._name,
                "backend": "redis",
                "hits":    info.get("keyspace_hits",   0),
                "misses":  info.get("keyspace_misses", 0),
                "ttl_secs": self._ttl,
            }
        except Exception:
            return {"name": self._name, "backend": "redis", "ttl_secs": self._ttl}


# ── Factory: resolve Redis or fall back to TTLCache ───────────────────────────

def _make_cache(ttl: int, name: str) -> TTLCache | RedisCache:
    """
    Try to connect to Redis.  Return a RedisCache on success,
    or a TTLCache (with a warning) on any failure.
    """
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        logger.info(
            "Cache '%s': REDIS_URL not set — using in-process TTLCache. "
            "Set REDIS_URL for a shared cache across Gunicorn workers.",
            name,
        )
        return TTLCache(ttl=ttl, name=name)

    try:
        import redis  # type: ignore
        client = redis.from_url(redis_url, socket_connect_timeout=2, decode_responses=True)
        # Ping to verify the connection is live before committing to Redis.
        client.ping()
        logger.info("Cache '%s': connected to Redis at %s", name, redis_url)
        return RedisCache(client=client, ttl=ttl, name=name)
    except ImportError:
        logger.warning(
            "Cache '%s': 'redis' package not installed — falling back to in-process TTLCache. "
            "Add redis to requirements.txt to enable shared caching.",
            name,
        )
    except Exception as exc:
        logger.warning(
            "Cache '%s': Redis connection failed (%s) — falling back to in-process TTLCache.",
            name, exc,
        )

    return TTLCache(ttl=ttl, name=name)


# ── Global cache instances ─────────────────────────────────────────────────────

# Pipeline config — read on every authenticated request, changes rarely
pipeline_cache   = _make_cache(ttl=60,  name="pipeline_config")

# Stats — dashboard polls every 30 s
stats_cache      = _make_cache(ttl=20,  name="stats")

# Stage load — alerts dashboard
stage_load_cache = _make_cache(ttl=15,  name="stage_load")