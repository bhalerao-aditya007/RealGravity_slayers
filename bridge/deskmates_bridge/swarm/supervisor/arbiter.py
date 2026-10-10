"""
Supervisor Arbiter: Layer 2 LLM Arbiter (Tier S, event-driven).
Receives structured incident reports and issues schema-validated directives.
Includes graceful degraded mode when Tier-S is unavailable.
"""
from __future__ import annotations
import json
from typing import Any, Callable, Dict, List, Optional
from .directives import SwarmDirective
from .watchdogs import WatchdogIncident


class SupervisorArbiter:
    def __init__(
        self,
        llm_caller: Optional[Callable[[dict], Any]] = None,
        policy: str = "balanced",
    ) -> None:
        self.llm_caller = llm_caller
        self.policy = policy
        self.is_degraded = False

    async def arbitrate_incident(
        self,
        incident: WatchdogIncident,
        context_report: Dict[str, Any],
        known_agents: set[str],
        known_cells: set[str],
    ) -> SwarmDirective:
        """Evaluates an incident and returns a closed-schema directive."""
        # Check if Tier-S LLM is available
        if not self.llm_caller:
            return self._degraded_fallback(incident, known_agents, known_cells)

        prompt_payload = {
            "incident": {
                "type": incident.incident_type,
                "subject": incident.subject,
                "evidence": incident.evidence,
                "severity": incident.severity,
            },
            "context": context_report,
            "options": [
                "RESPAWN_WITH_HINT", "PIVOT_CELL", "RAISE_N_CELL", "ESCALATE_TIER",
                "FREEZE", "REQUEST_USER_INPUT", "ACCEPT", "REJECT_AND_REWORK"
            ],
        }

        try:
            resp = await self.llm_caller(prompt_payload)
            directive_dict = resp if isinstance(resp, dict) else json.loads(str(resp))
            directive = SwarmDirective(**directive_dict)
            if directive.validate_executable(known_agents, known_cells):
                return directive
            return self._degraded_fallback(incident, known_agents, known_cells)
        except Exception:
            self.is_degraded = True
            return self._degraded_fallback(incident, known_agents, known_cells)

    def _degraded_fallback(
        self,
        incident: WatchdogIncident,
        known_agents: set[str],
        known_cells: set[str],
    ) -> SwarmDirective:
        """Deterministic conservative fallback when Tier S model is unavailable (§9.4)."""
        t = incident.incident_type
        if t == "SCOPE_VIOLATION":
            return SwarmDirective(
                type="REJECT_AND_REWORK",
                args={"cell": incident.subject, "reason": "Scope violation: file outside write-set"},
                rationale="Deterministic watchdog rejection of out-of-scope patch.",
            )
        if t == "PRIVACY_INCIDENT":
            return SwarmDirective(
                type="FREEZE",
                args={"run": True, "reason": "Potential privacy canary leak"},
                rationale="Freezing run to protect user data privacy.",
            )
        if t == "STALL":
            return SwarmDirective(
                type="REQUEST_USER_INPUT",
                args={"question": "Run stalled on capacity or queue. Extend timeout or switch to Monolithic?"},
                rationale="Stall watchdog fallback: soliciting user steering.",
            )
        if t == "DUPLICATE_WORK":
            return SwarmDirective(
                type="RESPAWN_WITH_HINT",
                args={"agent": incident.subject, "hint": "Explore alternate algorithmic structure; avoid redundant attempts."},
                rationale="Deterministic anti-duplication respawn.",
            )

        return SwarmDirective(
            type="REQUEST_USER_INPUT",
            args={"question": f"Incident {t} occurred in degraded supervisor mode. Proceed?"},
            rationale="Degraded mode conservative hold.",
        )
