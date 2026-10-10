"""
Admission control before run launches.
Verdicts: FITS | FITS_WITH_THROTTLE | DOES_NOT_FIT.
"""
from __future__ import annotations
import math
from dataclasses import dataclass
from typing import Dict, List, Literal, Tuple
from .planner_capacity import CapacityMap

AdmissionVerdict = Literal["FITS", "FITS_WITH_THROTTLE", "DOES_NOT_FIT"]


@dataclass
class AdmissionResult:
    verdict: AdmissionVerdict
    planned_calls: int
    planned_tokens: int
    eta_seconds: int
    daily_quota_share_pct: float
    warnings: List[str]
    max_fitting_n: int


class AdmissionController:
    def __init__(self, capacity_map: CapacityMap) -> None:
        self.capacity_map = capacity_map

    def evaluate(
        self,
        n: int,
        task_kind: str = "deliberative",
        cells_count: int = 0,
        wallclock_cap_min: float = 90.0,
    ) -> AdmissionResult:
        # Base calls formula: 3N + ceil(N/10) + 6
        base_delib_calls = 3 * n + math.ceil(n / 10.0) + 6
        planned_delib_calls = round(1.15 * base_delib_calls)

        # Build task calls
        build_calls = 0
        if task_kind == "build" and cells_count > 0:
            # build_calls ≈ 1.2 * cells * (3 coders + 1 tester + 2 critics) + 4 integration
            build_calls = round(1.2 * cells_count * 6 + 4)

        total_calls = planned_delib_calls + build_calls

        # Token estimation: average ~2.5k tokens per call
        tokens_per_call = 2500
        planned_tokens = total_calls * tokens_per_call

        usable_tpm = self.capacity_map.total_usable_tpm
        usable_rpm = self.capacity_map.total_usable_rpm

        # Time estimate in seconds
        est_time_s = max(
            round((planned_tokens / max(usable_tpm, 100.0)) * 60),
            round((total_calls / max(usable_rpm, 1.0)) * 60)
        )

        # Daily budget check across buckets (after 15% supervisor reserve)
        total_tpd = sum(b.tpd_remaining for b in self.capacity_map.buckets.values())
        if total_tpd == 0:
            total_tpd = 5_000_000
        usable_tpd_net = total_tpd * 0.85

        daily_share_pct = round((planned_tokens / max(total_tpd, 1.0)) * 100, 1)

        warnings: List[str] = []
        # Check shared quota groups
        groups_seen = set()
        for b in self.capacity_map.buckets.values():
            key = (b.provider, b.quota_group)
            if key in groups_seen:
                warnings.append(f"Provider '{b.provider}' shares quota group '{b.quota_group}' — no extra capacity.")
            groups_seen.add(key)

        # Check verdict
        if planned_tokens > usable_tpd_net:
            verdict: AdmissionVerdict = "DOES_NOT_FIT"
            warnings.append(f"Planned {planned_tokens:,} tokens exceeds available daily reserve ({usable_tpd_net:,.0f}).")
        elif est_time_s > (wallclock_cap_min * 60):
            verdict = "FITS_WITH_THROTTLE"
            warnings.append(f"Estimated time ({est_time_s//60}m) approaches or exceeds wall-clock cap ({wallclock_cap_min}m).")
        else:
            verdict = "FITS"

        # Calculate max fitting N
        max_n = 10
        for test_n in [50, 40, 30, 20, 10]:
            calls = round(1.15 * (3 * test_n + math.ceil(test_n / 10.0) + 6))
            if calls * tokens_per_call <= usable_tpd_net:
                max_n = test_n
                break

        return AdmissionResult(
            verdict=verdict,
            planned_calls=total_calls,
            planned_tokens=planned_tokens,
            eta_seconds=est_time_s,
            daily_quota_share_pct=daily_share_pct,
            warnings=list(set(warnings)),
            max_fitting_n=max_n,
        )
