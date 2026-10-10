"""
Typed pub/sub Message Bus with topic ACLs, TTL, deduplication, size limits, and phase-gating.
"""
from __future__ import annotations
import fnmatch
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

# Allowed message types per phase during deliberation (§7.7)
PHASE_ALLOWED_TYPES: Dict[str, Set[str]] = {
    "frame": {"FRAME", "FRAME_CHECK", "STATUS"},
    "diverge": {"PROPOSAL", "STATUS"},
    "cluster": {"CLUSTER_SUMMARY", "STATUS"},
    "critique": {"CRITIQUE", "STATUS"},
    "vote": {"VOTE", "STATUS"},
    "synthesize": {"SYNTHESIS_DRAFT", "COVERAGE_REVIEW", "SIGNOFF", "STATUS"},
    "contracting": {"CONTRACT", "STATUS"},
    "build": {"PATCH_PROPOSAL", "EVIDENCE", "OBJECTION", "ASK", "VERDICT", "STATUS", "FACT"},
    "integrating": {"PATCH_PROPOSAL", "EVIDENCE", "OBJECTION", "VERDICT", "STATUS"},
    "final_verify": {"EVIDENCE", "VERDICT", "STATUS"},
    "reporting": {"STATUS"},
}

# ACL rules: Role -> allowed published message types
ROLE_PUBLISH_ACLS: Dict[str, Set[str]] = {
    "scout": {"FACT", "STATUS"},
    "coder": {"PATCH_PROPOSAL", "ASK", "STATUS", "PROPOSAL"},
    "tester": {"EVIDENCE", "STATUS", "PROPOSAL"},
    "critic": {"OBJECTION", "VERDICT", "STATUS", "CRITIQUE"},
    "redteam": {"OBJECTION", "EVIDENCE", "STATUS", "CRITIQUE"},
    "integrator": {"PATCH_PROPOSAL", "VERDICT", "STATUS"},
    "judge": {"VERDICT", "STATUS", "VOTE"},
    "archivist": {"FACT", "STATUS"},
    "planner": {"CONTRACT", "STATUS"},
    "supervisor": {"CONTRACT", "DIRECTIVE", "FRAME", "SIGNOFF", "STATUS"},
}


@dataclass
class SwarmMessage:
    id: str
    run_id: str
    from_agent: str
    from_role: str
    topic: str
    type: str
    payload: Dict[str, Any]
    to: Optional[str] = None
    cell_id: Optional[str] = None
    round: int = 1
    refs: List[str] = field(default_factory=list)
    ttl_rounds: int = 2
    trust: str = "unverified"
    tokens: int = 0
    seq: int = 0
    ts: float = field(default_factory=time.time)

    @property
    def payload_hash(self) -> str:
        s = json.dumps(self.payload, sort_keys=True)
        return hashlib.sha256(s.encode("utf-8")).hexdigest()


class MessageBus:
    def __init__(self, on_message: Optional[Callable[[SwarmMessage], None]] = None) -> None:
        self.on_message = on_message or (lambda msg: None)
        self.subscribers: Dict[str, List[Callable[[SwarmMessage], None]]] = {}
        self.seen_payload_hashes: Set[str] = set()
        self.outbound_counts_per_round: Dict[Tuple[str, int], int] = {}
        self.current_phase: str = "diverge"
        self._seq = 0

    def set_phase(self, phase: str) -> None:
        self.current_phase = phase.lower()

    def subscribe(self, topic_pattern: str, handler: Callable[[SwarmMessage], None]) -> None:
        self.subscribers.setdefault(topic_pattern, []).append(handler)

    def publish(self, msg: SwarmMessage) -> bool:
        """Publishes a message after ACL, phase-gate, size, dedupe, and rate-limit checks."""
        # 1. Phase gating check (§7.7)
        allowed_types = PHASE_ALLOWED_TYPES.get(self.current_phase)
        if allowed_types and msg.type not in allowed_types:
            # Drop silently or log protocol violation
            return False

        # 2. Role ACL check
        allowed_for_role = ROLE_PUBLISH_ACLS.get(msg.from_role.lower())
        if allowed_for_role and msg.type not in allowed_for_role:
            return False

        # 3. Payload size check
        max_tokens = 500 if msg.type in ("STATUS", "VERDICT") else 1500
        if msg.tokens > max_tokens:
            return False

        # 4. Outbound limit: <= 6 msgs per agent round
        key = (msg.from_agent, msg.round)
        cnt = self.outbound_counts_per_round.get(key, 0)
        if cnt >= 6:
            return False
        self.outbound_counts_per_round[key] = cnt + 1

        # 5. Deduplication
        p_hash = msg.payload_hash
        if p_hash in self.seen_payload_hashes:
            return False
        self.seen_payload_hashes.add(p_hash)

        # 6. Monotonic sequence & dispatch
        self._seq += 1
        msg.seq = self._seq
        self.on_message(msg)

        # Route to subscribers matching topic
        for pat, handlers in self.subscribers.items():
            if fnmatch.fnmatch(msg.topic, pat):
                for h in handlers:
                    try:
                        h(msg)
                    except Exception:
                        pass

        return True
