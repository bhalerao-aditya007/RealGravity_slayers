"""
Two-tier Blackboard: Verified Facts vs Hypotheses.
Requires dual family confirmation or tool evidence to promote.
"""
from __future__ import annotations
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set


@dataclass
class BlackboardEntry:
    id: str
    kind: str  # fact, contract, test, constraint
    text: str
    evidence_refs: List[str]
    author_agent: str
    author_family: str
    confirmations: Set[str] = field(default_factory=set)  # set of confirming families
    status: str = "hypothesis"  # hypothesis | verified
    version: int = 1
    updated_at: float = field(default_factory=time.time)


class Blackboard:
    def __init__(self) -> None:
        self.entries: Dict[str, BlackboardEntry] = {}

    def post(
        self,
        entry_id: str,
        kind: str,
        text: str,
        author_agent: str,
        author_family: str,
        evidence_refs: Optional[List[str]] = None,
        tool_verified: bool = False,
    ) -> BlackboardEntry:
        status = "verified" if tool_verified or (evidence_refs and len(evidence_refs) > 0) else "hypothesis"
        entry = BlackboardEntry(
            id=entry_id,
            kind=kind,
            text=text,
            evidence_refs=evidence_refs or [],
            author_agent=author_agent,
            author_family=author_family,
            status=status,
        )
        self.entries[entry_id] = entry
        return entry

    def confirm(self, entry_id: str, confirming_agent: str, confirming_family: str) -> bool:
        """Confirms an entry. If confirmed by a different family, promotes to verified."""
        entry = self.entries.get(entry_id)
        if not entry:
            return False

        if confirming_family != entry.author_family:
            entry.confirmations.add(confirming_family)
            if entry.status == "hypothesis" and len(entry.confirmations) >= 1:
                entry.status = "verified"
                entry.version += 1
                entry.updated_at = time.time()
                return True
        return False

    def get_verified(self, kind: Optional[str] = None) -> List[BlackboardEntry]:
        items = [e for e in self.entries.values() if e.status == "verified"]
        if kind:
            items = [e for e in items if e.kind == kind]
        return items

    def get_hypotheses(self) -> List[BlackboardEntry]:
        return [e for e in self.entries.values() if e.status == "hypothesis"]
