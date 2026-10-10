"""
Capacity map, bucket quota models, and token utilization mathematics.
"""
from __future__ import annotations
import time
from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional

BucketState = Literal["healthy", "degraded", "cooling", "quarantined", "dead"]


@dataclass
class CapacityBucket:
    provider: str
    model: str
    quota_group: str
    tier: str = "B"           # S, A, B, C
    family: str = "generic"   # gpt-oss, qwen, llama, mistral, deepseek, gemini, etc.
    rpm: float = 30.0
    tpm: float = 6000.0
    rpd_remaining: int = 14400
    tpd_remaining: int = 1_000_000
    p50_latency_s: float = 3.5
    state: BucketState = "healthy"
    cooling_until: float = 0.0
    consecutive_failures: int = 0
    quota_scope: str = "organization"  # organization or key

    @property
    def bucket_key(self) -> str:
        return f"{self.provider}:{self.model}:{self.quota_group}"

    @property
    def usable_tpm(self) -> float:
        if self.state in ("quarantined", "dead"):
            return 0.0
        return self.tpm * 0.90

    @property
    def usable_rpm(self) -> float:
        if self.state in ("quarantined", "dead"):
            return 0.0
        return self.rpm * 0.90


@dataclass
class CapacityMap:
    buckets: Dict[str, CapacityBucket] = field(default_factory=dict)
    last_profiled_ts: float = field(default_factory=time.time)

    def add_bucket(self, b: CapacityBucket) -> None:
        self.buckets[b.bucket_key] = b

    def get_bucket(self, key: str) -> Optional[CapacityBucket]:
        return self.buckets.get(key)

    @property
    def total_usable_tpm(self) -> float:
        # Avoid double-counting shared quota groups on the same provider
        seen_groups = set()
        total = 0.0
        for b in self.buckets.values():
            group_key = (b.provider, b.quota_group)
            if group_key not in seen_groups:
                seen_groups.add(group_key)
                total += b.usable_tpm
        return max(total, 1000.0)

    @property
    def total_usable_rpm(self) -> float:
        seen_groups = set()
        total = 0.0
        for b in self.buckets.values():
            group_key = (b.provider, b.quota_group)
            if group_key not in seen_groups:
                seen_groups.add(group_key)
                total += b.usable_rpm
        return max(total, 5.0)

    def calculate_cooldown_pressure(self, planned_tokens_per_min: float) -> str:
        """Low (<0.7), Medium (0.7-1.0), High (>1.0)."""
        utilization = planned_tokens_per_min / max(self.total_usable_tpm, 1.0)
        if utilization < 0.7:
            return "LOW"
        elif utilization <= 1.0:
            return "MEDIUM"
        else:
            return "HIGH"
