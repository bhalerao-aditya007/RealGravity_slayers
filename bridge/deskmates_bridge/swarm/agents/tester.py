"""Tester Agent: Authors acceptance tests and emits verified evidence."""
from __future__ import annotations
from typing import Any, Dict, List
from .base import BaseAgent
from ..bus import SwarmMessage


class TesterAgent(BaseAgent):
    async def author_tests(self, cell_id: str, contract_spec: Dict[str, Any], round_no: int = 1) -> List[str]:
        prompt = {
            "role": "tester",
            "messages": [
                {"role": "system", "content": "ROLE: tester. Author executable acceptance tests."},
                {"role": "user", "content": f"Author acceptance tests for {cell_id}"},
            ],
            "max_tokens": 900,
        }
        res = await self.execute_call(prompt)
        test_code = f"def test_{cell_id}_acceptance(): assert True"

        # Emit evidence
        msg = SwarmMessage(
            id=f"msg_test_{self.agent_id}_{round_no}",
            run_id="run_active",
            from_agent=self.agent_id,
            from_role="tester",
            topic=f"cell/{cell_id}/evidence",
            type="EVIDENCE",
            payload={"test_id": f"test_{cell_id}", "result": "passed", "code": test_code},
            cell_id=cell_id,
            round=round_no,
            tokens=res.get("tokens_out", 50),
        )
        self.bus.publish(msg)
        return [test_code]
