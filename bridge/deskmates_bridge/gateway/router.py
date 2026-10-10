"""Model router + the resilient call engine. Every LLM call in the system goes through `Gateway.call`."""
from __future__ import annotations
import itertools, random
from dataclasses import dataclass
from typing import Any, Callable, Protocol
from .breaker import CircuitBreaker
from .clock import Clock
from .estimator import TokenEstimator
from .lane import GatewayBusy, Hub, LaneConfig, ProviderLane


class ContextTooLong(Exception):
    """No model in the chain can hold this prompt. The caller must compress (map-reduce) or fail clearly."""


class AllModelsFailed(Exception):
    def __init__(self, last: Exception | None, tried: list[str]) -> None:
        super().__init__(f"all models failed: {tried} (last: {last})")
        self.last, self.tried = last, tried


class UpstreamError(Exception):
    """kind: rate | server | timeout | context | auth | notfound | stream"""
    def __init__(self, kind: str, status: int | None = None, retry_after: float | None = None, msg: str = "") -> None:
        super().__init__(msg or f"{kind} {status}")
        self.kind, self.status, self.retry_after = kind, status, retry_after


@dataclass
class UpstreamResponse:
    content: str
    tokens_in: int
    tokens_out: int
    raw: Any = None


@dataclass(frozen=True)
class ModelSpec:
    id: str            # fully qualified, e.g. "openrouter/google/gemma-4-31b-it:free"
    provider: str      # lane family, e.g. "openrouter"
    context: int       # EFFECTIVE context window in tokens
    upstream_id: str = ""
    scope: str = "per_key"   # "per_key" -> one lane per provider; "per_model" -> one lane per model


class Upstream(Protocol):
    async def send(self, model: ModelSpec, request: dict) -> UpstreamResponse: ...


class ModelRouter:
    def __init__(self, models: list[ModelSpec], aliases: dict[str, list[str]]) -> None:
        self.models = {m.id: m for m in models}
        self.aliases = aliases
        for a, chain in aliases.items():
            for mid in chain:
                if mid not in self.models:
                    raise ValueError(f"alias {a!r} references unknown model {mid!r}")

    def chain(self, alias: str) -> list[ModelSpec]:
        if alias in self.aliases:
            return [self.models[m] for m in self.aliases[alias]]
        if alias in self.models:               # allow a concrete model id too
            return [self.models[alias]]
        raise KeyError(f"unknown alias or model: {alias}")


class Gateway:
    CONTEXT_USE = 0.85            # admit a prompt only if prompt + max_tokens <= 85 % of the window
    RATE_RETRIES_PER_MODEL = 6
    SERVER_RETRIES_PER_MODEL = 2

    def __init__(self, router: ModelRouter, lanes: dict[str, LaneConfig], upstream: Upstream, clock: Clock,
                 *, max_concurrency: int = 4, max_wait_s: float = 180.0, estimator: TokenEstimator | None = None,
                 on_event: Callable[[str, dict], None] | None = None, rng: random.Random | None = None,
                 poll_s: float = 0.05) -> None:
        self.router, self.upstream, self.clock = router, upstream, clock
        self.max_wait_s = max_wait_s
        self.estimator = estimator or TokenEstimator()
        self.on_event = on_event or (lambda t, p: None)
        self.rng = rng or random.Random(11)
        self.hub = Hub(clock, max_concurrency)
        self.lane_cfgs, self._poll = lanes, poll_s
        self.breakers: dict[str, CircuitBreaker] = {}
        self.dead_providers: set[str] = set()
        self._ids = itertools.count(1)
        self._last_gate = (0.0, None)

    # ---- lanes ------------------------------------------------------------------------------
    def lane_for(self, model: ModelSpec) -> ProviderLane:
        key = f"{model.provider}:{model.id}" if model.scope == "per_model" else model.provider
        lane = self.hub.lanes.get(key)
        if lane is None:
            base = self.lane_cfgs[model.provider]
            cfg = LaneConfig(**{**base.__dict__, "name": key})
            lane = ProviderLane(cfg, self.clock, self.hub, self.rng, self._poll)
            lane.on_change = self._emit_gate
        return lane

    def _breaker(self, model: ModelSpec) -> CircuitBreaker:
        return self.breakers.setdefault(model.id, CircuitBreaker(self.clock))

    def _emit_gate(self, force: bool = False) -> None:
        now = self.clock.now()
        st = self.hub.gate_state()
        if not force and now - self._last_gate[0] < 0.25 and st == self._last_gate[1]:
            return
        if st != self._last_gate[1] and (force or now - self._last_gate[0] >= 0.25):
            self._last_gate = (now, st)
            self.on_event("gate.state", st)

    # ---- the call ---------------------------------------------------------------------------
    async def call(self, alias: str, request: dict, *, priority: int = 3, agent_id: str | None = None,
                   role: str = "worker") -> UpstreamResponse:
        est_in = self.estimator.estimate_messages(request.get("messages", []))
        max_out = int(request.get("max_tokens", 1024))
        started = self.clock.now()
        tried: list[str] = []
        last: Exception | None = None
        skipped_for_context = 0
        chain = self.router.chain(alias)

        for model in chain:
            if model.provider in self.dead_providers or self._breaker(model).state == "dead":
                continue
            if est_in + max_out > model.context * self.CONTEXT_USE:
                skipped_for_context += 1               # never route an over-budget prompt to a small-context model
                continue
            br = self._breaker(model)
            if not br.allow():
                continue
            tried.append(model.id)
            lane = self.lane_for(model)
            rate_tries = server_tries = 0
            prio = priority
            while True:
                remaining = self.max_wait_s - (self.clock.now() - started)
                if remaining <= 0:
                    raise GatewayBusy(retry_after=lane._retry_hint())
                lease = await lane.acquire(prio, est_in + max_out, remaining)      # may raise GatewayBusy
                call_id = f"c{next(self._ids)}"
                self.on_event("llm.call_started", {"call_id": call_id, "agent_id": agent_id or "", "model": model.id, "role": role})
                self._emit_gate()
                t0 = self.clock.now()
                try:
                    resp = await self.upstream.send(model, request)
                except UpstreamError as e:
                    lease.release(0)
                    last = e
                    self._emit_gate()
                    if e.kind == "rate":
                        lane.on_rate_limited(e.retry_after)
                        self._emit_gate(force=True)
                        prio = min(prio, 1)                                          # retries first: don't waste paid-for work
                        rate_tries += 1
                        if rate_tries > self.RATE_RETRIES_PER_MODEL:
                            break
                        continue
                    if e.kind in ("server", "timeout", "stream"):
                        br.record_failure()
                        server_tries += 1
                        prio = min(prio, 1)
                        if server_tries > self.SERVER_RETRIES_PER_MODEL:
                            break
                        await self.clock.sleep(min(30.0, 2.0 ** server_tries) * (0.75 + 0.5 * self.rng.random()))
                        continue
                    if e.kind == "context":
                        break                                                         # do not retry: next (bigger) model
                    if e.kind == "auth":
                        self.dead_providers.add(model.provider)
                        self.on_event("run.error", {"message": f"provider '{model.provider}' rejected the key (check its env var)", "recoverable": True})
                        break
                    if e.kind == "notfound":
                        br.dead_for_run = True
                        break
                    break
                else:
                    lease.release(resp.tokens_in + resp.tokens_out)
                    lane.on_success()
                    br.record_success()
                    chars = sum(len(str(m.get("content", ""))) for m in request.get("messages", []))
                    self.estimator.learn(model.id, chars, resp.tokens_in)
                    self.on_event("llm.call_finished", {"call_id": call_id, "tokens_in": resp.tokens_in,
                                                        "tokens_out": resp.tokens_out,
                                                        "latency_ms": int((self.clock.now() - t0) * 1000)})
                    self._emit_gate()
                    return resp
        if skipped_for_context and not tried:
            raise ContextTooLong(f"prompt ~{est_in}+{max_out} tokens exceeds every model in '{alias}'")
        raise AllModelsFailed(last, tried)
