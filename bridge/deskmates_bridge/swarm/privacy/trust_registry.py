"""
Provider trust levels and privacy mode validations.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, Literal

PrivacyMode = Literal["strict_local", "no_train_only", "free_with_redaction"]


@dataclass(frozen=True)
class ProviderTrust:
    provider: str
    retention_days: int | None
    trains_on_prompts: bool  # False only if explicitly verified by terms


# Default provider trust registry (unknown => treated as trains_on_prompts=True per §3.1)
DEFAULT_TRUST_REGISTRY: Dict[str, ProviderTrust] = {
    "groq": ProviderTrust("groq", retention_days=30, trains_on_prompts=True),
    "cerebras": ProviderTrust("cerebras", retention_days=30, trains_on_prompts=True),
    "nvidia": ProviderTrust("nvidia", retention_days=30, trains_on_prompts=True),
    "openrouter": ProviderTrust("openrouter", retention_days=30, trains_on_prompts=True),
    "mistral": ProviderTrust("mistral", retention_days=30, trains_on_prompts=True),
    "gemini": ProviderTrust("gemini", retention_days=30, trains_on_prompts=True),
    "ollama_local": ProviderTrust("ollama_local", retention_days=0, trains_on_prompts=False),
}


class TrustRegistry:
    def __init__(self, registry: Dict[str, ProviderTrust] | None = None) -> None:
        self.registry = dict(registry or DEFAULT_TRUST_REGISTRY)

    def is_provider_allowed(self, provider: str, mode: PrivacyMode) -> bool:
        if mode == "strict_local":
            return provider in ("ollama_local", "local")
        if mode == "no_train_only":
            trust = self.registry.get(provider)
            return trust is not None and not trust.trains_on_prompts
        if mode == "free_with_redaction":
            return True
        return False
