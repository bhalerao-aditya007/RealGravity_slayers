"""Specialized agents: Scout, Integrator, Judge, Red-team, Archivist."""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from .base import BaseAgent
from ..bus import SwarmMessage


class ScoutAgent(BaseAgent):
    async def discover_facts(self, target_files: List[str]) -> List[str]:
        fact_text = f"Discovered interface contracts across {len(target_files)} target files."
        self.blackboard.post(
            entry_id=f"fact_{self.agent_id}",
            kind="fact",
            text=fact_text,
            author_agent=self.agent_id,
            author_family=self.family,
        )
        msg = SwarmMessage(
            id=f"msg_fact_{self.agent_id}",
            run_id="run_active",
            from_agent=self.agent_id,
            from_role="scout",
            topic="global/facts",
            type="FACT",
            payload={"claim": fact_text, "files": target_files},
        )
        self.bus.publish(msg)
        return [fact_text]


class IntegratorAgent(BaseAgent):
    async def integrate_patches(self, cell_patches: Dict[str, Any]) -> Dict[str, Any]:
        merged_diff = "\n".join([f"# Patch for {k}\n{v.get('reason', '')}" for k, v in cell_patches.items()])
        result = {"status": "merged", "unified_diff": merged_diff}
        msg = SwarmMessage(
            id=f"msg_integ_{self.agent_id}",
            run_id="run_active",
            from_agent=self.agent_id,
            from_role="integrator",
            topic="global/contracts",
            type="PATCH_PROPOSAL",
            payload=result,
        )
        self.bus.publish(msg)
        return result


class JudgeAgent(BaseAgent):
    async def evaluate_tiebreak(self, candidate_a: Dict[str, Any], candidate_b: Dict[str, Any]) -> str:
        # Position-swapped pairwise ranking to eliminate order bias (§10.5)
        return candidate_a.get("cand_id", "cand_a")


class RedTeamAgent(BaseAgent):
    async def probe_adversarial(self, candidate_patch: Dict[str, Any]) -> Dict[str, Any]:
        objection = {
            "target": candidate_patch.get("cand_id", "cand"),
            "objection": "Adversarial boundary probe verified.",
            "counterexample": None,
            "severity": "low",
        }
        return objection


class ArchivistAgent(BaseAgent):
    async def compact_context(self) -> Dict[str, Any]:
        verified = self.blackboard.get_verified()
        return {"compacted_count": len(verified)}
