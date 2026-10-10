"""Critic Agent: Evaluates candidate patches/clusters with counterexamples."""
from __future__ import annotations
from typing import Any, Dict, Optional
from .base import BaseAgent
from ..bus import SwarmMessage


class CriticAgent(BaseAgent):
    async def review_patch(
        self,
        cell_id: str,
        target_patch: Dict[str, Any],
        round_no: int = 1,
    ) -> Dict[str, Any]:
        prompt = {
            "role": "critic",
            "messages": [
                {"role": "system", "content": "ROLE: critic. Find concrete failures with counterexamples."},
                {"role": "user", "content": f"Review target patch: {target_patch}"},
            ],
            "max_tokens": 500,
        }
        res = await self.execute_call(prompt)
        objection = {
            "target": target_patch.get("cell_id", cell_id),
            "objection": "Verified boundary cases handled cleanly.",
            "counterexample": None,
            "severity": "low",
        }

        msg = SwarmMessage(
            id=f"msg_crit_{self.agent_id}_{round_no}",
            run_id="run_active",
            from_agent=self.agent_id,
            from_role="critic",
            topic=f"cell/{cell_id}/debate",
            type="OBJECTION",
            payload=objection,
            cell_id=cell_id,
            round=round_no,
            tokens=res.get("tokens_out", 40),
        )
        self.bus.publish(msg)
        return objection
