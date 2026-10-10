"""
Digest builder: per-agent context assembly under strict token budgets.
Enforces stable system prefixes, contract specs, verified facts, and code slices.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional, Set
from .blackboard import BlackboardEntry

ROLE_TOKEN_BUDGETS: Dict[str, int] = {
    "scout": 3000,
    "coder": 6000,
    "tester": 5000,
    "critic": 5000,
    "judge": 3000,
    "archivist": 4000,
    "supervisor": 8000,
}


class DigestBuilder:
    @staticmethod
    def approx_tokens(text: str) -> int:
        return max(1, len(text) // 4)

    @classmethod
    def build_context(
        cls,
        role: str,
        system_prefix: str,
        cell_contract: Optional[Dict[str, Any]] = None,
        verified_facts: Optional[List[BlackboardEntry]] = None,
        unresolved_objections: Optional[List[Dict[str, Any]]] = None,
        previous_attempt_summary: Optional[str] = None,
        code_slices: Optional[Dict[str, str]] = None,
    ) -> List[Dict[str, str]]:
        budget = ROLE_TOKEN_BUDGETS.get(role.lower(), 5000)
        messages: List[Dict[str, str]] = []

        # 1. System prefix (byte-stable)
        messages.append({"role": "system", "content": system_prefix.strip()})
        used = cls.approx_tokens(system_prefix)

        user_parts: List[str] = []

        # 2. Cell spec
        if cell_contract:
            c_text = (
                f"### CELL CONTRACT\n"
                f"Title: {cell_contract.get('title', 'Untitled')}\n"
                f"Write Set: {cell_contract.get('write_set', [])}\n"
                f"Acceptance Tests: {cell_contract.get('acceptance_tests', [])}\n"
            )
            user_parts.append(c_text)
            used += cls.approx_tokens(c_text)

        # 3. Verified facts
        if verified_facts:
            facts_lines = ["### VERIFIED FACTS"]
            for f in verified_facts[:5]:
                facts_lines.append(f"- [{f.id}] {f.text}")
            facts_text = "\n".join(facts_lines) + "\n"
            user_parts.append(facts_text)
            used += cls.approx_tokens(facts_text)

        # 4. Unresolved objections (max 3)
        if unresolved_objections:
            obj_lines = ["### UNRESOLVED OBJECTIONS (Action required)"]
            for o in unresolved_objections[:3]:
                obj_lines.append(f"- ({o.get('severity', 'med')}) {o.get('objection', '')}")
            obj_text = "\n".join(obj_lines) + "\n"
            user_parts.append(obj_text)
            used += cls.approx_tokens(obj_text)

        # 5. Own previous attempt summary
        if previous_attempt_summary:
            prev_text = f"### PREVIOUS ATTEMPT SUMMARY\n{previous_attempt_summary[:800]}\n"
            user_parts.append(prev_text)
            used += cls.approx_tokens(prev_text)

        # 6. Code slices (fit within remaining budget)
        if code_slices:
            slices_lines = ["### RELEVANT CODE SLICES"]
            for file_path, slice_content in code_slices.items():
                remaining = max(500, budget - used)
                slice_str = slice_content[:remaining * 4]
                slices_lines.append(f"#### File: {file_path}\n```\n{slice_str}\n```\n")
                used += cls.approx_tokens(slice_str)
                if used >= budget:
                    break
            user_parts.append("\n".join(slices_lines))

        messages.append({"role": "user", "content": "\n".join(user_parts)})
        return messages
