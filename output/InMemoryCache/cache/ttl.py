# cache/ttl.py
"""TTL‑aware cache with background cleanup.

This module extends :class:`cache.core.Cache` to automatically purge entries
whose *time‑to‑live* (TTL) has elapsed.  A daemon thread runs at a configurable
interval (default 1 second) and removes expired items.  The thread is started
when the cache is instantiated and can be stopped cleanly via :meth:`close`.

Typical usage
-------------
>>> from cache.ttl import TTLCache, KeyNotFoundError
>>> c = TTLCache()
>>> c.set('a', 123, ttl=2)          # expires after ~2 seconds
>>> c.get('a')
123
>>> import time; time.sleep(2.1)
>>> try:
...     c.get('a')
... except KeyNotFoundError as e:
...     print(e)
Key 'a' not found or expired
>>> c.close()                       # stop background thread
"""

from __future__ import annotations

import threading
import time
from typing import Any

from .core import Cache, KeyNotFoundError


class TTLCache(Cache):
    """Thread‑safe cache with automatic TTL expiration.

    In addition to the functionality provided by :class:`cache.core.Cache`,
    this subclass launches a daemon thread that periodically scans the internal
    store and removes entries whose TTL has passed.

    Parameters
    ----------
    cleanup_interval: float, optional
        Seconds between successive cleanup passes.  The default is ``1.0``.
    """

    def __init__(self, cleanup_interval: float = 1.0) -> None:
        super().__init__()
        self._cleanup_interval = max(cleanup_interval, 0.0)
        self._stop_event = threading.Event()
        self._cleaner_thread = threading.Thread(
            target=self._run_cleanup,
            name="TTLCache-Cleaner",
            daemon=True,
        )
        self._cleaner_thread.start()

    # --------------------------------------------------------------------- #
    # Internal helpers
    # --------------------------------------------------------------------- #
    def _is_expired(self, entry: tuple[Any, float | None, float]) -> bool:
        """Return ``True`` if *entry* has passed its expiration time.

        ``entry`` is a three‑tuple ``(value, expire_at, inserted_at)`` as stored
        by :class:`cache.core.Cache`.  ``expire_at`` is ``None`` for entries
        without a TTL.
        """
        _, expire_at, _ = entry
        if expire_at is None:
            return False
        return time.time() >= expire_at

    def _run_cleanup(self) -> None:
        """Background loop that removes expired keys at regular intervals."""
        # ``Event.wait`` returns ``True`` when the event is set, ``False`` on
        # timeout.  Loop continues while the stop flag has *not* been set.
        while not self._stop_event.wait(self._cleanup_interval):
            with self._lock:
                # Build a list first to avoid mutating the dict during iteration.
                expired_keys = [
                    key for key, entry in self._store.items()
                    if self._is_expired(entry)
                ]
                for key in expired_keys:
                    del self._store[key]

    # --------------------------------------------------------------------- #
    # Public API overrides
    # --------------------------------------------------------------------- #
    def get(self, key: Any) -> Any:
        """Retrieve *key*'s value, raising :class:`KeyNotFoundError` if missing
        or expired.

        The method first checks for expiration; if the entry is stale it is
        removed before the exception is raised.
        """
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                raise KeyNotFoundError(key)

            if self._is_expired(entry):
                # Lazily purge the stale entry.
                del self._store[key]
                raise KeyNotFoundError(key)

            value, _, _ = entry
            return value

    def close(self) -> None:
        """Stop the background cleanup thread and wait for it to finish.

        After calling ``close`` the cache instance should no longer be used.
        """
        self._stop_event.set()
        self._cleaner_thread.join()


    # --------------------------------------------------------------------- #
    # Context‑manager support (optional but convenient)
    # --------------------------------------------------------------------- #
    def __enter__(self) -> "TTLCache":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()