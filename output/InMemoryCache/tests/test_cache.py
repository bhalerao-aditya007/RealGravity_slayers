# tests/test_cache.py
"""Comprehensive unit tests for the in-memory key-value cache system.

Covers:
- Basic set/get functionality
- TTL expiration (including zero/negative TTL edge cases)
- LRU eviction when capacity is exceeded
- Thread-safety under concurrent access
- Proper cleanup of background threads
- Error handling for missing keys

Uses freezegun for deterministic time-based tests.
"""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from unittest.mock import patch

import pytest
from freezegun import freeze_time

from cache.core import Cache as CoreCache, KeyNotFoundError
from cache.ttl import TTLCache
from cache.lru_threadsafe import Cache as LRUCache


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def core_cache() -> CoreCache:
    """Provide a fresh CoreCache instance for each test."""
    return CoreCache()


@pytest.fixture
def ttl_cache() -> TTLCache:
    """Provide a fresh TTLCache instance for each test."""
    cache = TTLCache(cleanup_interval=0.1)
    yield cache
    cache.close()


@pytest.fixture
def lru_cache() -> LRUCache:
    """Provide a fresh LRU Cache instance for each test."""
    return LRUCache(max_size=3)


# ---------------------------------------------------------------------------
# Tests: Basic set/get functionality (CoreCache)
# ---------------------------------------------------------------------------

class TestCoreCacheBasic:
    """Tests for basic set/get operations on CoreCache."""

    def test_set_and_get(self, core_cache: CoreCache) -> None:
        """Setting a key and retrieving it returns the stored value."""
        core_cache.set("key1", "value1")
        assert core_cache.get("key1") == "value1"

    def test_set_overwrites_existing_key(self, core_cache: CoreCache) -> None:
        """Setting an existing key overwrites the previous value."""
        core_cache.set("key1", "old")
        core_cache.set("key1", "new")
        assert core_cache.get("key1") == "new"

    def test_get_missing_key_raises(self, core_cache: CoreCache) -> None:
        """Getting a non-existent key raises KeyNotFoundError."""
        with pytest.raises(KeyNotFoundError) as exc_info:
            core_cache.get("nonexistent")
        assert exc_info.value.key == "nonexistent"

    def test_set_with_various_value_types(self, core_cache: CoreCache) -> None:
        """Cache supports various Python value types."""
        core_cache.set("int", 42)
        core_cache.set("float", 3.14)
        core_cache.set("str", "hello")
        core_cache.set("list", [1, 2, 3])
        core_cache.set("dict", {"a": 1})
        core_cache.set("none", None)
        core_cache.set("tuple", (1, 2))

        assert core_cache.get("int") == 42
        assert core_cache.get("float") == 3.14
        assert core_cache.get("str") == "hello"
        assert core_cache.get("list") == [1, 2, 3]
        assert core_cache.get("dict") == {"a": 1}
        assert core_cache.get("none") is None
        assert core_cache.get("tuple") == (1, 2)

    def test_set_with_various_key_types(self, core_cache: CoreCache) -> None:
        """Cache supports various hashable key types."""
        core_cache.set("string_key", "v1")
        core_cache.set(123, "v2")
        core_cache.set((1, 2), "v3")
        core_cache.set(True, "v4")

        assert core_cache.get("string_key") == "v1"
        assert core_cache.get(123) == "v2"
        assert core_cache.get((1, 2)) == "v3"
        assert core_cache.get(True) == "v4"

    def test_delete_key(self, core_cache: CoreCache) -> None:
        """Deleting a key removes it from the cache."""
        core_cache.set("key1", "value1")
        core_cache.delete("key1")
        with pytest.raises(KeyNotFoundError):
            core_cache.get("key1")

    def test_delete_nonexistent_key(self, core_cache: CoreCache) -> None:
        """Deleting a non-existent key does not raise an error."""
        core_cache.delete("nonexistent")  # Should not raise

    def test_contains_operator(self, core_cache: CoreCache) -> None:
        """The 'in' operator works correctly."""
        core_cache.set("key1", "value1")
        assert "key1" in core_cache
        assert "key2" not in core_cache

    def test_len(self, core_cache: CoreCache) -> None:
        """len() returns the number of entries in the cache."""
        assert len(core_cache) == 0
        core_cache.set("key1", "value1")
        core_cache.set("key2", "value2")
        assert len(core_cache) == 2

    def test_clear(self, core_cache: CoreCache) -> None:
        """clear() removes all entries from the cache."""
        core_cache.set("key1", "value1")
        core_cache.set("key2", "value2")
        core_cache.clear()
        assert len(core_cache) == 0
        with pytest.raises(KeyNotFoundError):
            core_cache.get("key1")


# ---------------------------------------------------------------------------
# Tests: TTL expiration (CoreCache)
# ---------------------------------------------------------------------------

class TestCoreCacheTTL:
    """Tests for TTL expiration behavior in CoreCache."""

    @freeze_time("2024-01-01 00:00:00")
    def test_ttl_expiration(self, core_cache: CoreCache) -> None:
        """Entry expires after TTL seconds."""
        core_cache.set("key1", "value1", ttl=5)
        assert core_cache.get("key1") == "value1"

        with freeze_time("2024-01-01 00:00:06"):
            with pytest.raises(KeyNotFoundError):
                core_cache.get("key1")

    @freeze_time("2024-01-01 00:00:00")
    def test_ttl_not_expired_before_deadline(self, core_cache: CoreCache) -> None:
        """Entry is still valid before TTL expires."""
        core_cache.set("key1", "value1", ttl=10)
        with freeze_time("2024-01-01 00:00:09"):
            assert core_cache.get("key1") == "value1"

    @freeze_time("2024-01-01 00:00:00")
    def test_ttl_exactly_at_deadline(self, core_cache: CoreCache) -> None:
        """Entry expires exactly at the TTL deadline."""
        core_cache.set("key1", "value1", ttl=5)
        with freeze_time("2024-01-01 00:00:05"):
            # At exactly the deadline, the entry should be expired
            with pytest.raises(KeyNotFoundError):
                core_cache.get("key1")

    @freeze_time("2024-01-01 00:00:00")
    def test_zero_ttl_expires_immediately(self, core_cache: CoreCache) -> None:
        """Zero TTL means the entry expires immediately."""
        core_cache.set("key1", "value1", ttl=0)
        with pytest.raises(KeyNotFoundError):
            core_cache.get("key1")

    @freeze_time("2024-01-01 00:00:00")
    def test_negative_ttl_expires_immediately(self, core_cache: CoreCache) -> None:
        """Negative TTL means the entry expires immediately."""
        core_cache.set("key1", "value1", ttl=-5)
        with pytest.raises(KeyNotFoundError):
            core_cache.get("key1")

    @freeze_time("2024-01-01 00:00:00")
    def test_no_ttl_never_expires(self, core_cache: CoreCache) -> None:
        """Entry without TTL never expires."""
        core_cache.set("key1", "value1")
        with freeze_time("2024-12-31 23:59:59"):
            assert core_cache.get("key1") == "value1"

    @freeze_time("2024-01-01 00:00:00")
    def test_ttl_update_on_set(self, core_cache: CoreCache) -> None:
        """Setting a key