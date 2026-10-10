"""
Wave Dispatcher for paced releases within structured rounds.
Avoids thundering herds and burst-induced 429s with slow-start, jitter, and weighted bucket spreads.
"""
from __future__ import annotations
import asyncio
import random
import time
from typing import Any, Callable, Coroutine, List, Optional
from ..scheduler.planner_capacity import CapacityMap


class WaveDispatcher:
    def __init__(
        self,
        capacity_map: CapacityMap,
        slow_start_fraction: float = 0.25,
        jitter: float = 0.10,
        rng: Optional[random.Random] = None,
    ) -> None:
        self.capacity_map = capacity_map
        self.slow_start_fraction = slow_start_fraction
        self.jitter = jitter
        self.rng = rng or random.Random(42)

    def calculate_release_rate(self, tokens_per_call: int = 2500) -> float:
        """Calls per second release rate."""
        rpm_eff = self.capacity_map.total_usable_rpm
        tpm_eff = self.capacity_map.total_usable_tpm
        calls_from_tpm = tpm_eff / max(tokens_per_call, 1)
        r_per_min = min(rpm_eff, calls_from_tpm)
        return max(0.2, r_per_min / 60.0)

    async def dispatch_waves(
        self,
        tasks: List[Callable[[], Coroutine[Any, Any, Any]]],
        tokens_per_call: int = 2500,
        on_wave_progress: Optional[Callable[[int, int], None]] = None,
    ) -> List[Any]:
        if not tasks:
            return []

        # Shuffle execution order
        shuffled = list(tasks)
        self.rng.shuffle(shuffled)

        base_rate = self.calculate_release_rate(tokens_per_call)
        current_rate = base_rate * self.slow_start_fraction

        results: List[Any] = []
        running_tasks: List[asyncio.Task] = []
        total = len(shuffled)

        for i, item in enumerate(shuffled):
            # Launch async call
            t = asyncio.create_task(item())
            running_tasks.append(t)

            # Ramp up rate additively
            current_rate = min(base_rate, current_rate + (base_rate * 0.10))

            # Interval with jitter
            base_interval = 1.0 / max(current_rate, 0.1)
            jitter_factor = 1.0 + self.rng.uniform(-self.jitter, self.jitter)
            sleep_s = base_interval * jitter_factor

            await asyncio.sleep(min(sleep_s, 2.0))

            # Periodic progress notify
            if on_wave_progress:
                on_wave_progress(i + 1, total)

        # Await completion
        results = await asyncio.gather(*running_tasks, return_exceptions=True)
        return results
