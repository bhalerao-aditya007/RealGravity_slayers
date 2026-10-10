import asyncio
import pytest
from deskmates_bridge.gateway.breaker import CircuitBreaker
from deskmates_bridge.gateway.clock import FakeClock
from deskmates_bridge.gateway.estimator import TokenEstimator
from deskmates_bridge.gateway.lane import GatewayBusy, Hub, LaneConfig, ProviderLane
from deskmates_bridge.gateway.router import (AllModelsFailed, ContextTooLong, Gateway, ModelRouter, ModelSpec, UpstreamError)
from .fakes import FakeUpstream

REQ = {"messages": [{"role": "user", "content": "hello"}], "max_tokens": 100}


def make(clock, *, rpm=None, lane_rpm=60, concurrency=2, max_conc=4, max_wait=180, latency=1.0, poll=0.05, events=None):
    models = [
        ModelSpec("a/small", "a", 8_000), ModelSpec("a/big", "a", 128_000),
        ModelSpec("b/main", "b", 128_000), ModelSpec("b/alt", "b", 128_000),
    ]
    router = ModelRouter(models, {"manager": ["a/big", "b/main"], "fast": ["a/small", "b/alt"], "x": ["a/small", "a/big"]})
    lanes = {"a": LaneConfig("a", rpm=lane_rpm, concurrency=concurrency), "b": LaneConfig("b", rpm=lane_rpm, concurrency=concurrency)}
    up = FakeUpstream(clock, rpm=rpm, latency=latency)
    ev = events if events is not None else []
    gw = Gateway(router, lanes, up, clock, max_concurrency=max_conc, max_wait_s=max_wait,
                 on_event=lambda t, p: ev.append((t, p)), poll_s=poll)
    return gw, up, ev


async def run(clock, coro_or_tasks, seconds, step=0.05):
    await clock.advance(seconds, step=step)


# ---------------------------------------------------------------- limiter ----------------------------
async def test_token_bucket_paces_requests_exactly():
    clock = FakeClock()
    hub = Hub(clock, 10)
    lane = ProviderLane(LaneConfig("l", rpm=60, concurrency=10, safety=1.0), clock, hub, poll_s=0.05)
    times = []

    async def one():
        lease = await lane.acquire(3, 10, 1000)
        times.append(round(clock.now(), 1))
        lease.release()
    tasks = [asyncio.create_task(one()) for _ in range(5)]
    await clock.advance(6.0)
    await asyncio.gather(*tasks)
    # rate 60/min = 1/s, burst 1  ->  first immediately, then one per second
    assert times[0] == 0.0
    gaps = [b - a for a, b in zip(times, times[1:])]
    assert len(times) == 5 and all(0.95 <= g <= 1.15 for g in gaps)   # one per second (poll granularity 0.05 s)


async def test_safety_factor_keeps_rate_below_configured_limit():
    clock = FakeClock()
    hub = Hub(clock, 10)
    lane = ProviderLane(LaneConfig("l", rpm=60, concurrency=10, safety=0.5), clock, hub, poll_s=0.05)
    assert lane.rate_per_s == pytest.approx(0.5)


async def test_priority_order_manager_before_worker_when_saturated():
    clock = FakeClock()
    hub = Hub(clock, 10)
    lane = ProviderLane(LaneConfig("l", rpm=60, concurrency=1, safety=1.0), clock, hub, poll_s=0.05)
    order = []
    first = await lane.acquire(3, 10, 1000)          # occupies the only slot

    async def waiter(name, prio):
        lease = await lane.acquire(prio, 10, 1000)
        order.append(name)
        lease.release()
    t1 = asyncio.create_task(waiter("worker", 3))
    await clock.advance(0.2)
    t2 = asyncio.create_task(waiter("manager", 0))   # arrives later but is more important
    await clock.advance(0.2)
    first.release()
    await clock.advance(5.0)
    await asyncio.gather(t1, t2)
    assert order == ["manager", "worker"]


async def test_aging_prevents_starvation():
    clock = FakeClock()
    hub = Hub(clock, 10)
    lane = ProviderLane(LaneConfig("l", rpm=6000, concurrency=1, safety=1.0, aging_step_s=30), clock, hub, poll_s=0.05)
    first = await lane.acquire(3, 1, 10_000)
    order = []

    async def w(name, prio):
        lease = await lane.acquire(prio, 1, 10_000)
        order.append(name)
        lease.release()
    old = asyncio.create_task(w("old-worker", 3))
    await clock.advance(100.0)                        # waited 100 s  -> 3 aging levels -> priority 0
    new = asyncio.create_task(w("new-lead", 1))
    await clock.advance(0.2)
    first.release()
    await clock.advance(2.0)
    await asyncio.gather(old, new)
    assert order[0] == "old-worker"


async def test_tpm_window_blocks_until_tokens_expire():
    clock = FakeClock()
    hub = Hub(clock, 10)
    lane = ProviderLane(LaneConfig("l", rpm=6000, tpm=1000, concurrency=10, safety=1.0), clock, hub, poll_s=0.5)
    l1 = await lane.acquire(3, 800, 1000)
    l1.release(800)
    got = []

    async def second():
        lease = await lane.acquire(3, 800, 1000)
        got.append(clock.now())
        lease.release()
    t = asyncio.create_task(second())
    await clock.advance(30.0, step=0.5)
    assert got == []                                   # 800 + 800 > 1000/min
    await clock.advance(40.0, step=0.5)
    await t
    assert got and got[0] >= 60.0


# ---------------------------------------------------------------- breaker ---------------------------
async def test_breaker_opens_then_half_open_probe_then_closes():
    clock = FakeClock()
    b = CircuitBreaker(clock, failures=5, window_s=60, cooldown_s=30)
    for _ in range(5):
        assert b.allow()
        b.record_failure()
    assert b.state == "open" and not b.allow()
    clock.t += 31
    assert b.state == "half_open" and b.allow() and not b.allow()   # exactly one probe
    b.record_success()
    assert b.state == "closed" and b.allow()


# ---------------------------------------------------------------- gateway: resilience ----------------
async def test_429_with_retry_after_is_absorbed_caller_sees_success():
    clock = FakeClock()
    ev = []
    gw, up, _ = make(clock, events=ev)
    up.plan("a/big", UpstreamError("rate", 429, retry_after=20.0))
    t = asyncio.create_task(gw.call("manager", REQ, priority=0, agent_id="M0", role="manager"))
    await clock.advance(10.0)
    assert not t.done()                                # waiting out Retry-After, no error surfaced
    assert any(e[0] == "gate.state" and e[1]["backoff_active"] for e in ev)
    await clock.advance(40.0)
    resp = await t
    assert resp.content == "ok"
    assert [m for _, m in up.calls].count("a/big") == 2   # exactly one retry, same model
    assert up.calls[1][0] >= 20.0                         # nothing was sent before Retry-After elapsed


async def test_429_without_header_backs_off_exponentially_and_halves_rate():
    clock = FakeClock()
    gw, up, _ = make(clock)
    up.plan("a/big", UpstreamError("rate", 429), UpstreamError("rate", 429))
    t = asyncio.create_task(gw.call("manager", REQ))
    await clock.advance(120.0)
    await t
    lane = gw.hub.lanes["a"]
    assert lane.scale < 0.5                              # AIMD cut twice, only slightly regrown
    gaps = [b[0] - a[0] for a, b in zip(up.calls, up.calls[1:])]
    assert gaps[1] > gaps[0]                              # backoff grows


async def test_5xx_retries_same_model_twice_then_falls_back_to_next_model():
    clock = FakeClock()
    gw, up, _ = make(clock)
    up.plan("a/big", *[UpstreamError("server", 503)] * 3)
    t = asyncio.create_task(gw.call("manager", REQ))
    await clock.advance(120.0)
    resp = await t
    models = [m for _, m in up.calls]
    assert models[:3] == ["a/big"] * 3 and models[3] == "b/main" and resp.content == "ok"


async def test_context_error_does_not_retry_and_advances_chain():
    clock = FakeClock()
    gw, up, _ = make(clock)
    up.plan("a/big", UpstreamError("context", 400))
    t = asyncio.create_task(gw.call("manager", REQ))
    await clock.advance(30.0)
    await t
    assert [m for _, m in up.calls] == ["a/big", "b/main"]


async def test_auth_failure_kills_the_provider_for_the_run_and_reports_it():
    clock = FakeClock()
    ev = []
    gw, up, _ = make(clock, events=ev)
    up.plan("a/big", UpstreamError("auth", 401))
    t = asyncio.create_task(gw.call("manager", REQ))
    await clock.advance(30.0)
    await t
    assert "a" in gw.dead_providers
    assert any(e[0] == "run.error" and "key" in e[1]["message"] and "sk-" not in e[1]["message"] for e in ev)
    t2 = asyncio.create_task(gw.call("x", REQ))        # chain a/small -> a/big : both dead -> must fail, not hang
    await clock.advance(5.0)
    with pytest.raises(AllModelsFailed):
        await t2


async def test_over_context_prompt_is_never_routed_to_small_model():
    clock = FakeClock()
    gw, up, _ = make(clock)
    big = {"messages": [{"role": "user", "content": "x" * 60_000}], "max_tokens": 100}   # ~17k tokens > 8k
    t = asyncio.create_task(gw.call("x", big))          # chain: a/small (8k) -> a/big (128k)
    await clock.advance(5.0)
    await t
    assert [m for _, m in up.calls] == ["a/big"]


async def test_context_too_long_for_every_model_raises_clear_error():
    clock = FakeClock()
    gw, up, _ = make(clock)
    huge = {"messages": [{"role": "user", "content": "x" * 60_000}], "max_tokens": 100}
    with pytest.raises(ContextTooLong):
        await gw.call("fast", huge) if False else await _call_small_only(gw, huge)


async def _call_small_only(gw, req):
    gw.router.aliases["tiny"] = ["a/small"]
    return await gw.call("tiny", req)


async def test_queue_wait_beyond_max_wait_raises_gateway_busy_with_retry_after():
    clock = FakeClock()
    gw, up, _ = make(clock, lane_rpm=1, concurrency=1, max_wait=10, latency=100)
    t1 = asyncio.create_task(gw.call("manager", REQ))
    await clock.advance(0.5)
    t2 = asyncio.create_task(gw.call("manager", REQ))
    await clock.advance(20.0)
    with pytest.raises(GatewayBusy) as ei:
        await t2
    assert ei.value.retry_after >= 1.0
    t1.cancel()


# ---------------------------------------------------------------- gateway: load -----------------------
async def test_load_50_concurrent_requests_rpm20_never_trips_the_provider_limit():
    clock = FakeClock()
    ev = []
    gw, up, _ = make(clock, rpm={"a": 20, "b": 20}, lane_rpm=20, concurrency=3, max_conc=3, latency=2.0, poll=0.25, events=ev)
    # every call targets provider a only
    gw.router.aliases["only_a"] = ["a/big"]
    tasks = [asyncio.create_task(gw.call("only_a", REQ, priority=3, agent_id=f"W{i}")) for i in range(50)]
    await clock.advance(400.0, step=0.25)
    results = await asyncio.gather(*tasks)
    assert len(results) == 50
    assert up.violations == 0                              # provider never answered 429: we stayed inside the limit
    assert up.max_in_flight <= 3                           # concurrency cap honoured
    finish = max(t for t, _ in up.calls)
    assert 130 <= finish <= 200                            # ~50 calls / (20*0.9 per min) ~ 167 s
    gate = [p for t, p in ev if t == "gate.state"]
    assert gate and all(g["in_flight"] <= g["limit"] for g in gate)
    started = [p for t, p in ev if t == "llm.call_started"]
    finished = [p for t, p in ev if t == "llm.call_finished"]
    assert len(started) == len(finished) == 50 and finished[0]["tokens_in"] == 100


async def test_estimator_learns_chars_per_token():
    est = TokenEstimator()
    for _ in range(30):
        est.learn("m", chars=4000, real_tokens=1000)       # 4 chars/token
    assert 3.9 < est.ratio["m"] < 4.05
