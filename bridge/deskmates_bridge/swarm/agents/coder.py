"""Coder Agent: Generates candidate patches with reasons and linked test checks."""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from .base import BaseAgent
from ..bus import SwarmMessage


class CoderAgent(BaseAgent):
    async def propose_patch(
        self,
        cell_id: str,
        files: List[str],
        contract_spec: Dict[str, Any],
        round_no: int = 1,
    ) -> Dict[str, Any]:
        prompt = {
            "role": "coder",
            "messages": [
                {"role": "system", "content": "ROLE: coder in a verified-patch swarm. Edit only files in write-set."},
                {"role": "user", "content": f"Propose patch for cell {cell_id}. Contract: {contract_spec}"},
            ],
            "max_tokens": 1500,
        }
        res = await self.execute_call(prompt)
        content = res.get("content", "")

        proposal = {
            "cell_id": cell_id,
            "edits": [{"path": files[0] if files else "main.py", "search": "pass", "replace": "# implemented"}],
            "files": files,
            "reason": f"Implements contract requirements for {cell_id}. {content}" if content else f"Implements contract requirements for {cell_id}",
            "linked_check": contract_spec.get("acceptance_tests", ["test_default"])[0],
        }

        # Publish to bus
        msg = SwarmMessage(
            id=f"msg_patch_{self.agent_id}_{round_no}",
            run_id="run_active",
            from_agent=self.agent_id,
            from_role="coder",
            topic=f"cell/{cell_id}/proposals",
            type="PATCH_PROPOSAL",
            payload=proposal,
            cell_id=cell_id,
            round=round_no,
            tokens=res.get("tokens_out", 100),
        )
        self.bus.publish(msg)
        return proposal
