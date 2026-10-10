"""Injectable clock so every timing behaviour of the gateway is unit-testable without real waiting."""
from __future__ import annotations
import asyncio, heapq, itertools, time
from typing import Protocol


class Clock(Protocol):
    def now(self) -> float: ...
    async def sleep(self, dt: float) -> None: ...


class RealClock:
    def now(self) -> float:
        return time.monotonic()

    async def sleep(self, dt: float) -> None:
        await asyncio.sleep(max(0.0, dt))


class FakeClock:
    """Deterministic virtual time. Sleepers wake only when `advance()` moves time past them."""

    def __init__(self) -> None:
        self.t = 0.0
        self._sleepers: list[tuple[float, int, asyncio.Future]] = []
        self._ids = itertools.count()

    def now(self) -> float:
        return self.t

    async def sleep(self, dt: float) -> None:
        if dt <= 0:
            await asyncio.sleep(0)
            return
        fut = asyncio.get_running_loop().create_future()
        heapq.heappush(self._sleepers, (self.t + dt, next(self._ids), fut))
        await fut

    async def settle(self, rounds: int = 40) -> None:
        for _ in range(rounds):
            await asyncio.sleep(0)

    async def advance(self, dt: float, step: float = 0.05) -> None:
        end = self.t + dt
        await self.settle()
        while self.t < end:
            nxt = min(end, self.t + step)
            self.t = nxt
            while self._sleepers and self._sleepers[0][0] <= self.t + 1e-9:
                _, _, fut = heapq.heappop(self._sleepers)
                if not fut.done():
                    fut.set_result(None)
            await self.settle()
