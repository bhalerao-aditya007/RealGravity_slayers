import asyncio
import pytest
from deskmates_bridge.swarm.rounds.wave_dispatcher import WaveDispatcher
from deskmates_bridge.swarm.scheduler.planner_capacity import CapacityBucket, CapacityMap
from deskmates_bridge.swarm.scheduler.pool import KeyPool


def test_pool_rate_limiting_and_failover():
    cmap = CapacityMap()
    cmap.add_bucket(CapacityBucket("groq", "m1", "g1", tier="B", family="qwen", rpm=30))
    cmap.add_bucket(CapacityBucket("nvidia", "m2", "g2", tier="B", family="llama", rpm=30))
    pool = KeyPool(cmap)

    # Rate limit bucket 1
    cooldown = pool.record_rate_limit("groq:m1:g1", retry_after=10.0)
    assert cooldown >= 10.0

    b1 = cmap.get_bucket("groq:m1:g1")
    assert b1.state == "cooling"

    # Routing failover picks the healthy bucket
    next_bucket = pool.find_route(required_tier="B")
    assert next_bucket is not None
    assert next_bucket.provider == "nvidia"


@pytest.mark.asyncio
async def test_wave_dispatcher_pacing_and_completion():
    cmap = CapacityMap()
    cmap.add_bucket(CapacityBucket("groq", "m1", "g1", rpm=60, tpm=20000))
    dispatcher = WaveDispatcher(cmap, slow_start_fraction=0.5, jitter=0.0)

    dispatched = []

    async def sample_call(idx):
        dispatched.append(idx)
        return idx

    call_factories = [lambda i=i: sample_call(i) for i in range(5)]
    results = await dispatcher.dispatch_waves(call_factories)

    assert len(results) == 5
    assert set(results) == {0, 1, 2, 3, 4}
