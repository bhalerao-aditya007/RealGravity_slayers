"""
Audit trail and canary token verification for the egress firewall.
"""
from __future__ import annotations
import secrets
from typing import Set


class CanaryManager:
    def __init__(self) -> None:
        self.canaries: Set[str] = set()

    def generate_canary(self, prefix: str = "CANARY_SECRET_") -> str:
        token = f"{prefix}{secrets.token_hex(16)}"
        self.canaries.add(token)
        return token

    def check_leak(self, text: str) -> str | None:
        """Returns the leaked canary token if present in text, else None."""
        for c in self.canaries:
            if c in text:
                return c
        return None
