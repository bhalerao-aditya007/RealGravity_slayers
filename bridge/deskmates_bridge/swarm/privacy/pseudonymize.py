"""
In-memory stable pseudonymization and de-pseudonymization.
Keeps secret and identifier mapping strictly in local RAM.
"""
from __future__ import annotations
import re
from typing import Dict, Tuple


class Pseudonymizer:
    def __init__(self) -> None:
        self._fwd_map: Dict[str, str] = {}
        self._rev_map: Dict[str, str] = {}
        self._counts: Dict[str, int] = {}

    def _next_placeholder(self, category: str) -> str:
        idx = self._counts.get(category, 0) + 1
        self._counts[category] = idx
        return f"<{category.upper()}_{idx}>"

    def pseudonymize(self, text: str) -> Tuple[str, Dict[str, str]]:
        """Replaces identifiable tokens (e.g. org names, hostnames, emails) with stable placeholders."""
        result = text

        # Emails
        email_pattern = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
        for match in email_pattern.findall(result):
            if match not in self._fwd_map:
                placeholder = self._next_placeholder("EMAIL")
                self._fwd_map[match] = placeholder
                self._rev_map[placeholder] = match
            result = result.replace(match, self._fwd_map[match])

        # URLs / hostnames (excluding api endpoints of known LLM providers)
        host_pattern = re.compile(r"\b(?:https?://)?([a-zA-Z0-9-]+\.(?:[a-zA-Z0-9-]+\.)*(?:corp|internal|local|com|org|net|io|ai|dev))\b")
        for match in host_pattern.findall(result):
            if any(p in match for p in ("groq.com", "cerebras.ai", "nvidia.com", "openrouter.ai", "mistral.ai", "googleapis.com")):
                continue
            if match not in self._fwd_map:
                placeholder = self._next_placeholder("HOST")
                self._fwd_map[match] = placeholder
                self._rev_map[placeholder] = match
            result = result.replace(match, self._fwd_map[match])

        return result, dict(self._fwd_map)

    def de_pseudonymize(self, text: str) -> str:
        """Restores original tokens from placeholders in model output."""
        result = text
        for placeholder, original in self._rev_map.items():
            result = result.replace(placeholder, original)
        return result
