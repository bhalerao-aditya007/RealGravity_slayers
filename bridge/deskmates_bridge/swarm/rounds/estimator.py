"""
Run estimation model: calls, tokens, time ranges, and cooldown pressure.
Used by the pre-launch Landing card and live progress tracker.
"""
from __future__ import annotations
import math
import time
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional
from ..scheduler.planner_capacity import CapacityMap


@dataclass
class RoundEstimate:
    name: str
    calls: int
    tokens_in: int
    tokens_out: int
    est_duration_s: int


@dataclass
class SwarmRunEstimate:
    n: int
    task_kind: str
    planned_calls: int
    planned_tokens: int
    time_low_s: int
    time_high_s: int
    cooldown_pressure: str  # LOW, MEDIUM, HIGH
    daily_quota_share_pct: float
    rounds_breakdown: List[RoundEstimate]
    profile_age_s: int
    build_calls: int = 0
    warnings: List[str] = None  # type: ignore[assignment]

    def to_dict(self) -> dict:
        return {
            "n": self.n,
            "task_kind": self.task_kind,
            "planned_calls": self.planned_calls,
            "planned_tokens": self.planned_tokens,
            "time_low_s": self.time_low_s,
            "time_high_s": self.time_high_s,
            "cooldown_pressure": self.cooldown_pressure,
            "daily_quota_share_pct": self.daily_quota_share_pct,
            "profile_age_s": self.profile_age_s,
            "build_calls": self.build_calls,
            "warnings": self.warnings or [],
            "rounds_breakdown": [r.__dict__ for r in self.rounds_breakdown],
        }


class RunEstimator:
    @staticmethod
    def calculate_estimate(
        n: int,
        task_kind: str = "deliberative",
        cells_count: int = 0,
        capacity_map: Optional[CapacityMap] = None,
        now_ts: Optional[float] = None,
    ) -> SwarmRunEstimate:
        now = now_ts or time.time()
        cmap = capacity_map or CapacityMap()

        # 1. Six-round deliberation protocol planning values (§4.6)
        # Frame: 2 calls, 1.5k in / 0.8k out
        # Diverge: N calls, 1.2k in / 0.7k out
        # Cluster: ceil(N/10) calls, 5k in / 0.5k out
        # Critique: N calls, 2.5k in / 0.35k out
        # Vote: N calls, 2k in / 0.08k out
        # Synthesize: 4 calls, 6k in / 1.2k out
        cluster_calls = math.ceil(n / 10.0)

        rounds_info = [
            RoundEstimate("Frame", 2, 2 * 1500, 2 * 800, 8),
            RoundEstimate("Diverge", n, n * 1200, n * 700, max(15, round(n * 1.5))),
            RoundEstimate("Cluster", cluster_calls, cluster_calls * 5000, cluster_calls * 500, 18),
            RoundEstimate("Critique", n, n * 2500, n * 350, max(20, round(n * 1.8))),
            RoundEstimate("Vote", n, n * 2000, n * 80, max(10, round(n * 1.2))),
            RoundEstimate("Synthesize", 4, 4 * 6000, 4 * 1200, 36),
        ]

        base_calls = 3 * n + cluster_calls + 6
        planned_delib_calls = round(1.15 * base_calls)  # 15% allowance for format repairs/retries

        # Total tokens for deliberation
        base_delib_tokens = sum(r.tokens_in + r.tokens_out for r in rounds_info)
        planned_tokens = round(1.15 * base_delib_tokens)

        # Build task additions
        build_calls = 0
        if task_kind == "build" and cells_count > 0:
            build_calls = round(1.2 * cells_count * 6 + 4)
            build_tokens = build_calls * 3500
            planned_calls = planned_delib_calls + build_calls
            planned_tokens += build_tokens
        else:
            planned_calls = planned_delib_calls

        # Capacity and timing
        usable_tpm = cmap.total_usable_tpm
        usable_rpm = cmap.total_usable_rpm

        # Time ranges
        t_low = max(
            round(sum(r.est_duration_s for r in rounds_info) * 0.8),
            round((planned_tokens / max(usable_tpm, 100.0)) * 60)
        )
        # Time high includes cooldowns & retry penalty
        t_high = max(
            round(t_low * 2.2),
            round(t_low + (planned_calls * 4.0))
        )

        planned_tpm = planned_tokens / max((t_low / 60.0), 1.0)
        cooldown_pressure = cmap.calculate_cooldown_pressure(planned_tpm)

        total_tpd = sum(b.tpd_remaining for b in cmap.buckets.values()) or 5_000_000
        daily_quota_share_pct = round((planned_tokens / total_tpd) * 100, 1)

        profile_age_s = int(now - cmap.last_profiled_ts)

        warnings = []
        if usable_rpm < 15 and n >= 40:
            warnings.append("Needs 3+ providers for a smooth run")
        if cooldown_pressure == "HIGH":
            warnings.append("High cooldown pressure: expect seats to pause or take coffee breaks.")
        if profile_age_s > 1800:
            warnings.append("Capacity profile is older than 30 minutes. Consider re-profiling.")

        return SwarmRunEstimate(
            n=n,
            task_kind=task_kind,
            planned_calls=planned_calls,
            planned_tokens=planned_tokens,
            time_low_s=t_low,
            time_high_s=t_high,
            cooldown_pressure=cooldown_pressure,
            daily_quota_share_pct=daily_quota_share_pct,
            rounds_breakdown=rounds_info,
            profile_age_s=profile_age_s,
            build_calls=build_calls,
            warnings=warnings,
        )
