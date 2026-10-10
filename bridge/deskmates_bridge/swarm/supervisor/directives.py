"""
Closed Directive set and schema validation for the Supervisor.
The controller executes directives; the LLM never executes commands or touches the OS directly.
"""
from __future__ import annotations
from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, Field

DirectiveType = Literal[
    "REASSIGN",
    "KILL",
    "RESPAWN_WITH_HINT",
    "PIVOT_CELL",
    "RAISE_N_CELL",
    "LOWER_N_CELL",
    "ESCALATE_TIER",
    "FREEZE",
    "REQUEST_USER_INPUT",
    "ACCEPT",
    "REJECT_AND_REWORK",
]


class SwarmDirective(BaseModel):
    type: DirectiveType
    args: Dict[str, Any] = Field(default_factory=dict)
    rationale: str = Field(..., max_length=500)

    def validate_executable(self, known_agents: set[str], known_cells: set[str]) -> bool:
        """Validates that the directive arguments reference actual known entities."""
        t = self.type
        if t in ("REASSIGN", "KILL", "RESPAWN_WITH_HINT"):
            agent = self.args.get("agent")
            if agent and agent not in known_agents:
                return False
            if t == "RESPAWN_WITH_HINT":
                hint = self.args.get("hint", "")
                if len(hint) > 800:
                    return False

        if t in ("PIVOT_CELL", "RAISE_N_CELL", "LOWER_N_CELL", "ESCALATE_TIER"):
            cell = self.args.get("cell")
            if cell and cell not in known_cells:
                return False

        if t == "REQUEST_USER_INPUT":
            if not self.args.get("question"):
                return False

        return True
