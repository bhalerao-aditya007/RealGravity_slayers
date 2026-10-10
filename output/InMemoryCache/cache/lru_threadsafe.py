# cache/lru_threadsafe.py
"""Thread‑safe LRU cache with optional TTL support.

This module provides :class:`Cache` – an in‑memory key‑value store that:

* Enforces a maximum number of entries (`max_size`).  When the capacity is
  exceeded the *least‑recently used* (LRU) entry is evicted automatically.
* Optionally expires entries after a configurable *time‑to‑live* (TTL) in
  seconds.
* Guarantees consistency across multiple threads by protecting all public
  operations with a re‑entrant lock (:class:`threading.RLock`).

The implementation builds on the generic :class:`cache.core.Cache` error type
(`KeyNotFoundError`) but provides its own storage logic using
:class:`collections.OrderedDict` to keep track of usage order.

Typical usage
-------------
>>> from cache.lru_threadsafe import Cache, KeyNotFoundError
>>> c = Cache(max_size=2)
>>> c.set('a', 1)
>>> c.set('b', 2)
>>> c.get('a')          # 'a' becomes most‑recently used
1
>>> c.set('c', 3)       # capacity exceeded → 'b' (LRU) is evicted
>>> 'b' in c
False
>>> c.delete('a')
>>> try:
...     c.get('a')
... except KeyNotFoundError as e:
...     print(e)
Key 'a' not found or expired
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Any, Optional

from .core import KeyNotFoundError


class Cache:
    """Thread‑safe LRU cache with optional TTL.

    Parameters
    ----------
    max_size : int, optional
        Maximum number of entries the cache may hold.  When the limit is
        exceeded the least‑recently used entry is evicted.  Defaults to ``128``.
    default_ttl : float or ``None``, optional
        If provided, entries created without an explicit ``ttl`` inherit this
        value (seconds).  ``None`` means entries never expire by default.
    """

    __slots__ = (
        "_max_size",
        "_default_ttl",
        "_store",
        "_lock",
    )

    def __init__(self, max_size: int = 128, default_ttl: Optional[float] = None) -> None:
        if max_size <= 0:
            raise ValueError("max_size must be a positive integer")
        if default_ttl is not None and default_ttl <= 0:
            raise ValueError("default_ttl must be positive or None")

        self._max_size: int = max_size
        self._default_ttl: Optional[float] = default_ttl
        # OrderedDict preserves insertion order; we treat the *front* (left)
        # as the most‑recently used element.
        self._store: OrderedDict[Any, tuple[Any, Optional[float]]] = OrderedDict()
        self._lock = threading.RLock()

    # --------------------------------------------------------------------- #
    # Internal helpers
    # --------------------------------------------------------------------- #
    def _now(self) -> float:
        """Return the current monotonic time."""
        return time.monotonic()

    def _expire_at(self, ttl: Optional[float]) -> Optional[float]:
        """Convert a TTL (seconds) into an absolute expiration timestamp."""
        if ttl is None:
            return None
        return self._now() + ttl

    def _is_expired(self, expire_at: Optional[float]) -> bool:
        """Return ``True`` if the supplied expiration timestamp is in the past."""
        return expire_at is not None and expire_at <= self._now()

    def _purge_expired(self) -> None:
        """Remove all expired entries from the cache.

        This method is called under the lock by public operations to keep the
        store tidy.  It iterates over a snapshot of keys to avoid mutation
        during iteration.
        """
        expired_keys = [k for k, (_, exp) in self._store.items() if self._is_expired(exp)]
        for key in expired_keys:
            self._store.pop(key, None)

    def _ensure_capacity(self) -> None:
        """Evict LRU items until the cache size respects ``_max_size``."""
        while len(self._store) > self._max_size:
            # ``popitem(last=True)`` removes the *last* item, i.e. the LRU.
            self._store.popitem(last=True)

    def _touch(self, key: Any) -> None:
        """Mark ``key`` as most‑recently used.

        The OrderedDict stores most‑recent items at the *front* (left).  Moving
        a key to the front is therefore ``move_to_end(key, last=False)``.
        """
        self._store.move_to_end(key, last=False)

    # --------------------------------------------------------------------- #
    # Public API
    # --------------------------------------------------------------------- #
    def set(self, key: Any, value: Any, ttl: Optional[float] = None) -> None:
        """Store ``value`` under ``key`` with an optional TTL.

        If ``ttl`` is ``None`` the cache's ``default_ttl`` is used.  Passing
        ``ttl=0`` or a negative number raises :class:`ValueError`.

        The entry becomes the most‑recently used item.  If the cache exceeds
        ``max_size`` after insertion, the LRU entry is evicted.
        """
        if ttl is None:
            ttl = self._default_ttl
        if ttl is not None and ttl <= 0:
            raise ValueError("ttl must be positive or None")

        expire_at = self._expire_at(ttl)

        with self._lock:
            # Insert or replace the entry.
            self._store[key] = (value, expire_at)
            # Mark as most‑recently used.
            self._touch(key)
            # Clean up any stale entries before enforcing capacity.
            self._purge_expired()
            self._ensure_capacity()

    def get(self, key: Any) -> Any:
        """Retrieve the value associated with ``key``.

        Raises
        ------
        KeyNotFoundError
            If the key does not exist or its TTL has expired.

        The accessed entry becomes the most‑recently used item.
        """
        with self._lock:
            try:
                value, expire_at = self._store[key]
            except KeyError:
                raise KeyNotFoundError(key) from None

            if self._is_expired(expire_at):
                # Remove the stale entry and report missing.
                self._store.pop(key, None)
                raise KeyNotFoundError(key)

            # Refresh usage order.
            self._touch(key)
            return value

    def delete(self, key: Any) -> None:
        """Remove ``key`` from the cache.

        Raises
        ------
        KeyNotFoundError
            If the key is not present (or already expired).
        """
        with self._lock:
            if key not in self._store:
                raise KeyNotFoundError(key)

            _, expire_at = self._store[key]
            if self._is_expired(expire_at):
                # Treat expired entries as missing.
                self._store.pop(key, None)
                raise KeyNotFoundError(key)

            self._store.pop(key, None)

    # --------------------------------------------------------------------- #
    # Convenience dunder methods
    # --------------------------------------------------------------------- #
    def __len__(self) -> int:
        """Return the number of *non‑expired* entries currently stored."""
        with self._lock:
            self._purge_expired()
            return len(self._store)

    def __contains__(self, key: Any) -> bool:
        """Return ``True`` if ``key`` exists and has not expired."""
        with self._lock:
            if key not in self._store:
                return False
            _, expire_at = self._store[key]
            if self._is_expired(expire_at):
                # Clean up lazily.
                self._store.pop(key, None)
                return False
            return True

    def keys(self) -> list[Any]:
        """Return a list of all non‑expired keys, ordered from most‑ to least‑recent."""
        with self._lock:
            self._purge_expired()
            # OrderedDict stores most‑recent at the front (left).
            return list(self._store.keys())

    def clear(self) -> None:
        """Remove **all** entries from the cache."""
        with self._lock:
            self._store.clear()

    # --------------------------------------------------------------------- #
    # Representation helpers
    # --------------------------------------------------------------------- #
    def __repr__(self) -> str:
        with self._lock:
            cls_name = self.__class__.__name__
            return f"<{cls_name} size={len(self)} max_size={self._max_size}>"

    def __str__(self) -> str:
        with self._lock:
            items = ", ".join(f"{k!r}: {v!r}" for k, (v, _) in self._store.items())
            return f"{{{items}}}"