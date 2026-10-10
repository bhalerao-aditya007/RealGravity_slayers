"""
Base Agent runtime loop and state management.
Virtual asyncio task; does not hold long-lived connections.
"""
from __future__ import annotations
import asyncio
import time
from typing import Any, Callable, Dict, List, Optional
from ..blackboard import Blackboard
from ..bus import MessageBus, SwarmMessage
from ..events import SwarmEventStream


class BaseAgent:
    def __init__(
        self,
        agent_id: str,
        role: str,
        tier: str,
        model: str,
        family: str,
        temperature: float,
        bus: MessageBus,
        blackboard: Blackboard,
        events: SwarmEventStream,
        call_fn: Optional[Callable[[Dict[str, Any]], Any]] = None,
    ) -> None:
        self.agent_id = agent_id
        self.role = role
        self.tier = tier
        self.model = model
        self.family = family
        self.temperature = temperature
        self.bus = bus
        self.blackboard = blackboard
        self.events = events
        self.call_fn = call_fn

        self.tokens_in = 0
        self.tokens_out = 0
        self.calls_count = 0
        self.state: str = "IDLE"  # IDLE, THINKING, TYPING, WAITING, BREAK

    def set_state(self, new_state: str) -> None:
        self.state = new_state
        self.events.emit(
            "swarm.agent_state",
            {"agent_id": self.agent_id, "state": new_state}
        )

    async def execute_call(self, request_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Dispatches an LLM inference call through the scheduler / call_fn."""
        self.set_state("THINKING")
        self.calls_count += 1
        t0 = time.time()
        try:
            if self.call_fn:
                resp = await self.call_fn(request_payload)
            else:
                await asyncio.sleep(0.01)
                resp = {"content": "Simulated agent response", "tokens_in": 100, "tokens_out": 50}

            t_in = resp.get("tokens_in", 0)
            t_out = resp.get("tokens_out", 0)
            self.tokens_in += t_in
            self.tokens_out += t_out
            resp["latency_ms"] = int((time.time() - t0) * 1000)
            self.set_state("IDLE")
            return resp
        except Exception as e:
            self.set_state("IDLE")
            raise e
