"""
Key & Provider Pool management.
Bucket key = (provider, model, quota_group).
Key states: healthy -> degraded -> cooling -> quarantined -> dead.
"""
from __future__ import annotations
import random
import time
from typing import Dict, List, Optional
from .planner_capacity import CapacityBucket, CapacityMap


class KeyPool:
    def __init__(self, capacity_map: Optional[CapacityMap] = None) -> None:
        self.capacity_map = capacity_map or CapacityMap()
        self.rng = random.Random(42)

    def register_bucket(self, bucket: CapacityBucket) -> None:
        self.capacity_map.add_bucket(bucket)

    def record_success(self, bucket_key: str) -> None:
        b = self.capacity_map.get_bucket(bucket_key)
        if b:
            b.consecutive_failures = 0
            if b.state in ("degraded", "cooling"):
                b.state = "healthy"

    def record_rate_limit(self, bucket_key: str, retry_after: Optional[float] = None) -> float:
        b = self.capacity_map.get_bucket(bucket_key)
        if not b:
            return 5.0
        b.consecutive_failures += 1
        cooldown = retry_after if retry_after is not None else min(60.0, 2.0 ** min(b.consecutive_failures, 6))
        cooldown *= (1.0 + 0.15 * self.rng.random())
        b.cooling_until = time.time() + cooldown
        b.state = "cooling" if cooldown > 0 else "degraded"
        return cooldown

    def record_server_failure(self, bucket_key: str) -> None:
        b = self.capacity_map.get_bucket(bucket_key)
        if not b:
            return
        b.consecutive_failures += 1
        if b.consecutive_failures >= 5:
            b.state = "quarantined"
        else:
            b.state = "degraded"

    def record_auth_dead(self, bucket_key: str) -> None:
        b = self.capacity_map.get_bucket(bucket_key)
        if b:
            b.state = "dead"

    def find_route(
        self,
        required_tier: str = "B",
        excluded_families: Optional[List[str]] = None,
        preferred_family: Optional[str] = None,
    ) -> Optional[CapacityBucket]:
        """Finds the best available bucket matching tier and diversity constraints."""
        now = time.time()
        candidates: List[CapacityBucket] = []

        for b in self.capacity_map.buckets.values():
            if b.state == "dead" or b.state == "quarantined":
                continue
            if b.state == "cooling" and b.cooling_until > now:
                continue
            # Tier compatibility: S requires S; A requires S or A; B requires S, A, or B
            tier_rank = {"S": 4, "A": 3, "B": 2, "C": 1}
            if tier_rank.get(b.tier, 1) < tier_rank.get(required_tier, 1):
                continue
            candidates.append(b)

        if not candidates:
            return None

        # Prioritize preferred family if given
        if preferred_family:
            family_matches = [c for c in candidates if c.family == preferred_family]
            if family_matches:
                return family_matches[0]

        # Avoid excluded families if possible
        if excluded_families:
            diverse = [c for c in candidates if c.family not in excluded_families]
            if diverse:
                return diverse[0]

        return candidates[0]
