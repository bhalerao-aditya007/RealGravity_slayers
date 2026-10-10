"""
Swarm event definitions and contract v4 event envelope helpers.
Additive to existing gateway / deskmates bridge event stream.
"""
from __future__ import annotations
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Optional


@dataclass
class SwarmEvent:
    event: str
    data: dict[str, Any]
    seq: int = 0
    ts: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "event": self.event,
            "data": self.data,
            "seq": self.seq,
            "ts": self.ts,
        }


class SwarmEventStream:
    """Helper to emit monotonic sequence events across the Swarm harness."""
    def __init__(self, callback: Optional[Callable[[str, dict[str, Any]], None]] = None) -> None:
        self.callback = callback or (lambda event, data: None)
        self._seq = 0

    def emit(self, event_name: str, payload: dict[str, Any]) -> SwarmEvent:
        self._seq += 1
        ev = SwarmEvent(event=event_name, data=payload, seq=self._seq, ts=time.time())
        try:
            self.callback(event_name, payload)
        except Exception:
            pass
        return ev
