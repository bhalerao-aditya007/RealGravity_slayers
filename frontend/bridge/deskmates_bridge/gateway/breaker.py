"""Per-model circuit breaker: opens after N failures in a window, half-open probe after a cool-down."""
from __future__ import annotations
from collections import deque
from .clock import Clock


class CircuitBreaker:
    def __init__(self, clock: Clock, failures: int = 5, window_s: float = 60.0, cooldown_s: float = 30.0) -> None:
        self.clock, self.failures, self.window_s, self.cooldown_s = clock, failures, window_s, cooldown_s
        self._fail_times: deque[float] = deque()
        self._opened_at: float | None = None
        self._probing = False
        self.dead_for_run = False  # set on auth failure / model-not-found

    @property
    def state(self) -> str:
        if self.dead_for_run:
            return "dead"
        if self._opened_at is None:
            return "closed"
        if self.clock.now() - self._opened_at >= self.cooldown_s:
            return "half_open"
        return "open"

    def allow(self) -> bool:
        s = self.state
        if s == "closed":
            return True
        if s == "half_open" and not self._probing:
            self._probing = True  # exactly one probe request
            return True
        return False

    def record_success(self) -> None:
        self._fail_times.clear()
        self._opened_at = None
        self._probing = False

    def record_failure(self) -> None:
        now = self.clock.now()
        self._probing = False
        self._fail_times.append(now)
        while self._fail_times and now - self._fail_times[0] > self.window_s:
            self._fail_times.popleft()
        if len(self._fail_times) >= self.failures or self._opened_at is not None:
            self._opened_at = now
