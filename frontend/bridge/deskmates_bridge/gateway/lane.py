"""
Provider lane = one rate-limit bucket (per provider-key, or per provider+model when the provider enforces it that way).

Owns: token bucket (RPM, smoothed), sliding TPM window, daily budget, concurrency, 429 pause, AIMD rate scaling,
and a PRIORITY queue with aging. Callers `await lane.acquire(priority, est_tokens, max_wait)` and get a Lease.
"""
from __future__ import annotations
import asyncio, random
from collections import deque
from dataclasses import dataclass, field
from typing import Callable
from .clock import Clock


class GatewayBusy(Exception):
    """Could not get a slot within max_wait. Callers translate this into HTTP 429 + Retry-After."""
    def __init__(self, retry_after: float, msg: str = "gateway busy") -> None:
        super().__init__(msg)
        self.retry_after = retry_after


@dataclass
class LaneConfig:
    name: str
    rpm: float                       # configured requests/minute
    tpm: float | None = None         # tokens/minute (None = unlimited)
    daily: int | None = None         # requests/day (None = unlimited)
    concurrency: int = 2
    burst: int = 1                   # bucket capacity (1 = perfectly smoothed)
    safety: float = 0.9              # use only 90 % of the configured rate: never ride the limit
    aging_step_s: float = 30.0       # a waiter gains one priority level per this many seconds


@dataclass(order=False)
class _Waiter:
    priority: int
    seq: int
    est: int
    enq: float
    fut: asyncio.Future = field(repr=False, default=None)  # type: ignore[assignment]
    max_wait_s: float = 180.0


class Lease:
    def __init__(self, lane: "ProviderLane", est: int, tpm_slot: list | None) -> None:
        self.lane, self.est, self._slot, self._done = lane, est, tpm_slot, False

    def release(self, actual_tokens: int | None = None) -> None:
        if self._done:
            return
        self._done = True
        if actual_tokens is not None and self._slot is not None:
            self._slot[1] = actual_tokens          # reconcile estimate with provider-reported usage
        self.lane._release()


class Hub:
    """Shared across lanes: global concurrency + gate.state snapshot."""
    def __init__(self, clock: Clock, max_concurrency: int = 4) -> None:
        self.clock, self.limit, self.in_flight = clock, max_concurrency, 0
        self.lanes: dict[str, ProviderLane] = {}

    def gate_state(self) -> dict:
        now = self.clock.now()
        return {
            "in_flight": self.in_flight,
            "limit": self.limit,
            "queue_depth": sum(len(l.waiters) for l in self.lanes.values()),
            "backoff_active": any(l.paused_until > now for l in self.lanes.values()),
        }


class ProviderLane:
    def __init__(self, cfg: LaneConfig, clock: Clock, hub: Hub, rng: random.Random | None = None, poll_s: float = 0.05) -> None:
        self.cfg, self.clock, self.hub, self.poll_s = cfg, clock, hub, poll_s
        self.rng = rng or random.Random(7)
        self.tokens = float(cfg.burst)
        self._last = clock.now()
        self.scale = 1.0                 # AIMD multiplier on the rate
        self.paused_until = 0.0
        self._backoff_n = 0
        self.in_flight = 0
        self.daily_used = 0
        self._tpm: deque[list] = deque()  # [time, tokens]
        self.waiters: list[_Waiter] = []
        self._seq = 0
        self._task: asyncio.Task | None = None
        self._nonempty = asyncio.Event()
        self.on_change: Callable[[], None] | None = None
        hub.lanes[cfg.name] = self

    # ---- rate maths -------------------------------------------------------------------------
    @property
    def rate_per_s(self) -> float:
        return self.cfg.rpm * self.cfg.safety * self.scale / 60.0

    def _refill(self) -> None:
        now = self.clock.now()
        self.tokens = min(float(self.cfg.burst), self.tokens + (now - self._last) * self.rate_per_s)
        self._last = now

    def _tpm_used(self) -> float:
        now = self.clock.now()
        while self._tpm and now - self._tpm[0][0] > 60.0:
            self._tpm.popleft()
        return sum(t[1] for t in self._tpm)

    def _time_until_ready(self, est: int) -> float:
        """0 if a request of `est` tokens may be dispatched now, else seconds to wait (poll granularity applies)."""
        now = self.clock.now()
        if self.paused_until > now:
            return self.paused_until - now
        if self.cfg.daily is not None and self.daily_used >= self.cfg.daily:
            return float("inf")          # exhausted: waiters time out into GatewayBusy (budget pre-check should have caught it)
        if self.in_flight >= self.cfg.concurrency or self.hub.in_flight >= self.hub.limit:
            return self.poll_s
        self._refill()
        if self.tokens < 1.0:
            return (1.0 - self.tokens) / max(self.rate_per_s, 1e-9)
        if self.cfg.tpm is not None and self._tpm_used() + est > self.cfg.tpm * self.cfg.safety:
            oldest = self._tpm[0][0] if self._tpm else now
            return max(self.poll_s, 60.0 - (now - oldest))
        return 0.0

    # ---- queue ------------------------------------------------------------------------------
    def _effective(self, w: _Waiter, now: float) -> tuple[int, int]:
        return (w.priority - int((now - w.enq) / self.cfg.aging_step_s), w.seq)

    async def acquire(self, priority: int, est_tokens: int, max_wait_s: float) -> Lease:
        loop = asyncio.get_running_loop()
        w = _Waiter(priority, self._seq, est_tokens, self.clock.now(), loop.create_future(), max_wait_s)
        self._seq += 1
        self.waiters.append(w)
        self._nonempty.set()
        if self._task is None or self._task.done():
            self._task = loop.create_task(self._run())
        self._changed()
        try:
            return await w.fut
        except asyncio.CancelledError:
            if w in self.waiters:
                self.waiters.remove(w)
            raise

    async def _run(self) -> None:
        while True:
            if not self.waiters:
                self._nonempty.clear()
                await self._nonempty.wait()
                continue
            now = self.clock.now()
            for w in list(self.waiters):                       # expire anyone who waited too long
                if now - w.enq >= w.max_wait_s and not w.fut.done():
                    self.waiters.remove(w)
                    w.fut.set_exception(GatewayBusy(retry_after=max(1.0, self._retry_hint())))
            self.waiters = [w for w in self.waiters if not w.fut.done()]
            if not self.waiters:
                continue
            best = min(self.waiters, key=lambda w: self._effective(w, now))
            wait = self._time_until_ready(best.est)
            if wait > 0:
                await self.clock.sleep(min(wait, self.poll_s) if wait != float("inf") else self.poll_s)
                continue
            self.waiters.remove(best)
            self.tokens -= 1.0
            self.daily_used += 1
            self.in_flight += 1
            self.hub.in_flight += 1
            slot = [self.clock.now(), best.est]
            self._tpm.append(slot)
            best.fut.set_result(Lease(self, best.est, slot))
            self._changed()
            await asyncio.sleep(0)

    def _retry_hint(self) -> float:
        return max(self.paused_until - self.clock.now(), 1.0 / max(self.rate_per_s, 1e-9))

    def _release(self) -> None:
        self.in_flight = max(0, self.in_flight - 1)
        self.hub.in_flight = max(0, self.hub.in_flight - 1)
        self._changed()

    def _changed(self) -> None:
        if self.on_change:
            self.on_change()

    # ---- resilience hooks (called by the Gateway) ---------------------------------------------
    def on_rate_limited(self, retry_after: float | None) -> float:
        """429: honour Retry-After (+0-20 % jitter) or exponential backoff 2,4,8..60 s (+-25 %); AIMD: halve the rate."""
        if retry_after is not None:
            delay = retry_after * (1.0 + 0.2 * self.rng.random())
        else:
            base = min(60.0, 2.0 * (2 ** self._backoff_n))
            delay = base * (0.75 + 0.5 * self.rng.random())
        self._backoff_n += 1
        self.paused_until = max(self.paused_until, self.clock.now() + delay)
        self.scale = max(0.1, self.scale * 0.5)
        self.tokens = 0.0
        self._changed()
        return delay

    def on_success(self) -> None:
        self._backoff_n = 0
        self.scale = min(1.0, self.scale + 0.02)

    def learn_limits(self, *, rpm: float | None = None, remaining: int | None = None, reset_s: float | None = None) -> None:
        """Overwrite configured numbers from x-ratelimit-* response headers."""
        if rpm:
            self.cfg.rpm = float(rpm)
        if remaining is not None and remaining <= 0 and reset_s:
            self.paused_until = max(self.paused_until, self.clock.now() + reset_s)
        self._changed()
