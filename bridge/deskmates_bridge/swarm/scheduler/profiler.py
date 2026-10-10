"""
Startup capacity profiler.
Probes providers/models, measures latency and headers, populates CapacityMap.
"""
from __future__ import annotations
import asyncio
import time
from typing import Any, Dict, List, Optional
from .planner_capacity import CapacityBucket, CapacityMap


class CapacityProfiler:
    def __init__(self, capacity_map: Optional[CapacityMap] = None) -> None:
        self.capacity_map = capacity_map or CapacityMap()

    async def profile_bucket(self, bucket: CapacityBucket, probe_func: Optional[Any] = None) -> CapacityBucket:
        """Sends lightweight probe or tests endpoint."""
        t0 = time.time()
        if probe_func:
            try:
                res = await probe_func(bucket)
                latency = time.time() - t0
                bucket.p50_latency_s = max(0.1, latency)
                if isinstance(res, dict):
                    if "rpm" in res:
                        bucket.rpm = float(res["rpm"])
                    if "tpm" in res:
                        bucket.tpm = float(res["tpm"])
            except Exception:
                bucket.state = "degraded"
        else:
            # Simulated probe calibration
            await asyncio.sleep(0.01)
            bucket.p50_latency_s = 2.5

        return bucket

    async def run_full_profile(
        self,
        buckets: List[CapacityBucket],
        probe_func: Optional[Any] = None
    ) -> CapacityMap:
        tasks = [self.profile_bucket(b, probe_func) for b in buckets]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, CapacityBucket):
                self.capacity_map.add_bucket(r)
        self.capacity_map.last_profiled_ts = time.time()
        return self.capacity_map
