# cache/core.py
"""In‑memory key‑value cache with optional TTL and thread‑safety.

The module provides a :class:`Cache` class that stores arbitrary Python objects
under hashable keys.  Each entry may have an optional *time‑to‑live* (TTL)
specified in seconds.  When the TTL expires the entry is automatically
removed and subsequent accesses raise :class:`KeyNotFoundError`.

The implementation is deliberately lightweight and suitable for use in
single‑process, multi‑threaded environments.  All public operations acquire a
single :class:`threading.Lock` to guarantee consistency.

Typical usage
-------------
>>> from cache.core import Cache, KeyNotFoundError
>>> c = Cache()
>>> c.set('foo', 42, ttl=1)   # expires after ~1 second
>>> c.get('foo')
42
>>> import time; time.sleep(1.1)
>>> c.get('foo')
Traceback (most recent call last):
    ...
KeyNotFoundError: Key 'foo' not found or expired
"""

from __future__ import annotations

import threading
import time
from typing import Any, Dict, Iterable, List, Optional, Tuple


class KeyNotFoundError(KeyError):
    """Raised when a key is missing from the cache or its TTL has expired."""

    def __init__(self, key: Any) -> None:
        super().__init__(f"Key {repr(key)} not found or expired")
        self.key = key


class Cache:
    """Thread‑safe in‑memory cache supporting optional TTL per entry.

    The cache stores values in a plain ``dict`` keyed by the user‑provided key.
    Each entry is a tuple ``(value, expire_at, inserted_at)`` where:

    * ``value`` – the stored object.
    * ``expire_at`` – absolute monotonic time at which the entry expires,
      or ``None`` if the entry never expires.
    * ``inserted_at`` – monotonic timestamp when the entry was added (useful
      for future LRU extensions).

    All public methods acquire an internal lock to protect the underlying
    dictionary from concurrent modifications.
    """

    _Entry = Tuple[Any, Optional[float], float]

    def __init__(self) -> None:
        """Create an empty cache."""
        self._store: Dict[Any, Cache._Entry] = {}
        self._lock = threading.Lock()

    def set(self, key: Any, value: Any, ttl: Optional[float] = None) -> None:
        """Store *value* under *key* with an optional TTL.

        Parameters
        ----------
        key:
            Hashable identifier for the entry.
        value:
            Any Python object to be cached.
        ttl:
            Time‑to‑live in seconds.  If ``None`` the entry never expires.
            Negative or zero values are treated as already expired and the
            entry will not be stored.

        Raises
        ------
        ValueError
            If ``ttl`` is not ``None`` and is not a non‑negative number.
        """
        if ttl is not None:
            if not isinstance(ttl, (int, float)):
                raise ValueError("ttl must be a number or None")
            if ttl < 0:
                # Negative TTL means the entry is already expired; we simply ignore it.
                return
        now = time.monotonic()
        expire_at = now + ttl if ttl is not None else None
        with self._lock:
            self._store[key] = (value, expire_at, now)

    def get(self, key: Any) -> Any:
        """Retrieve the value associated with *key*.

        If the key does not exist or its TTL has elapsed, a
        :class:`KeyNotFoundError` is raised.

        Returns
        -------
        Any
            The cached value.

        Raises
        ------
        KeyNotFoundError
            If the key is missing or the entry has expired.
        """
        now = time.monotonic()
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                raise KeyNotFoundError(key)

            value, expire_at, _ = entry
            if expire_at is not None and now >= expire_at:
                # Expired – remove it and raise.
                del self._store[key]
                raise KeyNotFoundError(key)

            return value

    def __len__(self) -> int:
        """Return the number of *non‑expired* entries currently stored."""
        self._purge_expired()
        with self._lock:
            return len(self._store)

    def keys(self) -> List[Any]:
        """Return a list of all non‑expired keys in the cache.

        The order reflects the insertion order (Python 3.7+ dict preserves order).
        """
        self._purge_expired()
        with self._lock:
            return list(self._store.keys())

    def _purge_expired(self) -> None:
        """Remove all entries whose TTL has elapsed.

        This helper is called by ``__len__`` and ``keys`` to keep the public
        view consistent.  It acquires the lock internally.
        """
        now = time.monotonic()
        with self._lock:
            expired_keys = [
                key for key, (_, expire_at, _) in self._store.items()
                if expire_at is not None and now >= expire_at
            ]
            for key in expired_keys:
                del self._store[key]

    # --------------------------------------------------------------------- #
    # Convenience methods for debugging / introspection (not required but
    # useful in unit tests and interactive sessions).
    # --------------------------------------------------------------------- #
    def __contains__(self, key: Any) -> bool:
        """Return ``True`` if *key* exists and is not expired."""
        try:
            self.get(key)
            return True
        except KeyNotFoundError:
            return False

    def __repr__(self) -> str:
        with self._lock:
            items = ", ".join(f"{k!r}: {v!r}" for k, (v, _, _) in self._store.items())
        return f"{self.__class__.__name__}({{{items}}})"

    # --------------------------------------------------------------------- #
    # Optional: expose a clear method for test setup/teardown.
    # --------------------------------------------------------------------- #
    def clear(self) -> None:
        """Remove all entries from the cache."""
        with self._lock:
            self._store.clear()