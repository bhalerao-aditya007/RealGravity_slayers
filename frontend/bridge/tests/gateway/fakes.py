from __future__ import annotations
from collections import deque
from deskmates_bridge.gateway.clock import FakeClock
from deskmates_bridge.gateway.router import ModelSpec, UpstreamError, UpstreamResponse


class FakeUpstream:
    """A provider that STRICTLY enforces its own sliding-window rpm limit (so a correct gateway never sees a 429 from it)."""

    def __init__(self, clock: FakeClock, rpm: dict[str, int] | None = None, latency: float = 1.0) -> None:
        self.clock, self.rpm, self.latency = clock, rpm or {}, latency
        self.script: dict[str, deque] = {}          # model id -> queue of outcomes (UpstreamError | None=ok)
        self.calls: list[tuple[float, str]] = []
        self.window: dict[str, deque] = {}
        self.violations = 0
        self.in_flight = 0
        self.max_in_flight = 0

    def plan(self, model_id: str, *outcomes) -> None:
        self.script.setdefault(model_id, deque()).extend(outcomes)

    async def send(self, model: ModelSpec, request: dict) -> UpstreamResponse:
        now = self.clock.now()
        self.calls.append((now, model.id))
        self.in_flight += 1
        self.max_in_flight = max(self.max_in_flight, self.in_flight)
        try:
            limit = self.rpm.get(model.provider)
            if limit is not None:
                w = self.window.setdefault(model.provider, deque())
                while w and now - w[0] > 60.0:
                    w.popleft()
                if len(w) >= limit:
                    self.violations += 1
                    raise UpstreamError("rate", 429, retry_after=5.0)
                w.append(now)
            await self.clock.sleep(self.latency)
            q = self.script.get(model.id)
            if q:
                out = q.popleft()
                if out is not None:
                    raise out
            return UpstreamResponse(content="ok", tokens_in=100, tokens_out=50)
        finally:
            self.in_flight -= 1
