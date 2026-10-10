"""
Deterministic Layer 1 Watchdogs (No LLM, zero token cost).
Monitors runs for stalls, duplication, scope violations, budget limits, and protocol issues.
"""
from __future__ import annotations
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Set


@dataclass
class WatchdogIncident:
    incident_type: str
    subject: str
    evidence: str
    severity: str = "warning"  # warning | critical
    ts: float = 0.0

    def __post_init__(self) -> None:
        if not self.ts:
            self.ts = time.time()


class WatchdogManager:
    def __init__(
        self,
        stall_timeout_s: float = 120.0,
        budget_warn_ratio: float = 0.80,
        on_incident: Optional[Callable[[WatchdogIncident], None]] = None,
    ) -> None:
        self.stall_timeout_s = stall_timeout_s
        self.budget_warn_ratio = budget_warn_ratio
        self.on_incident = on_incident or (lambda inc: None)
        self.last_activity_ts = time.time()
        self.incidents: List[WatchdogIncident] = []

    def record_activity(self) -> None:
        self.last_activity_ts = time.time()

    def check_stall(self) -> Optional[WatchdogIncident]:
        idle_time = time.time() - self.last_activity_ts
        if idle_time > self.stall_timeout_s:
            inc = WatchdogIncident(
                incident_type="STALL",
                subject="swarm_engine",
                evidence=f"No progress event for {idle_time:.1f}s (threshold {self.stall_timeout_s:.1f}s).",
                severity="critical",
            )
            self._trigger(inc)
            return inc
        return None

    def check_budget(self, used_tokens: int, max_tokens: int) -> Optional[WatchdogIncident]:
        if max_tokens > 0 and (used_tokens / max_tokens) >= self.budget_warn_ratio:
            inc = WatchdogIncident(
                incident_type="BUDGET_WARN",
                subject="token_budget",
                evidence=f"Tokens used {used_tokens:,} reached {self.budget_warn_ratio*100:.0f}% of budget {max_tokens:,}.",
                severity="warning",
            )
            self._trigger(inc)
            return inc
        return None

    def check_scope_violation(self, touched_files: List[str], write_set: List[str], cell_id: str) -> Optional[WatchdogIncident]:
        out_of_bounds = [f for f in touched_files if f not in write_set]
        if out_of_bounds:
            inc = WatchdogIncident(
                incident_type="SCOPE_VIOLATION",
                subject=cell_id,
                evidence=f"Patch modified files outside write-set: {out_of_bounds}.",
                severity="critical",
            )
            self._trigger(inc)
            return inc
        return None

    def check_duplicate_work(self, output_hashes: List[str], agent_id: str) -> Optional[WatchdogIncident]:
        if len(output_hashes) >= 3 and len(set(output_hashes)) == 1:
            inc = WatchdogIncident(
                incident_type="DUPLICATE_WORK",
                subject=agent_id,
                evidence="Identical output hashes produced across >=3 attempts.",
                severity="warning",
            )
            self._trigger(inc)
            return inc
        return None

    def check_unverified_premise(self, hypothesis_id: str, relying_agents_count: int) -> Optional[WatchdogIncident]:
        if relying_agents_count > 3:
            inc = WatchdogIncident(
                incident_type="UNVERIFIED_PREMISE",
                subject=hypothesis_id,
                evidence=f"Hypothesis {hypothesis_id} used as premise by {relying_agents_count} agents without tool/dual confirmation.",
                severity="warning",
            )
            self._trigger(inc)
            return inc
        return None

    def check_unaddressed_objections(self, high_objection_ids: Set[str], addressed_ids: Set[str]) -> Optional[WatchdogIncident]:
        unaddressed = high_objection_ids - addressed_ids
        if unaddressed:
            inc = WatchdogIncident(
                incident_type="UNADDRESSED_OBJECTION",
                subject="synthesis_review",
                evidence=f"High/blocker objection IDs missing from coverage checklist: {list(unaddressed)}.",
                severity="critical",
            )
            self._trigger(inc)
            return inc
        return None

    def _trigger(self, inc: WatchdogIncident) -> None:
        self.incidents.append(inc)
        self.on_incident(inc)
