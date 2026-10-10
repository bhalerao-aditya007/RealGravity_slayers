"""Token estimation. Same chars/3.5 estimator RealGravity's quota.py uses; learns a per-model ratio from real usage."""
from __future__ import annotations
import math


class TokenEstimator:
    def __init__(self, default_chars_per_token: float = 3.5) -> None:
        self.default = default_chars_per_token
        self.ratio: dict[str, float] = {}

    def estimate_text(self, text: str, model: str | None = None) -> int:
        r = self.ratio.get(model or "", self.default)
        return max(1, math.ceil(len(text) / r))

    def estimate_messages(self, messages: list[dict], model: str | None = None) -> int:
        chars = 0
        for m in messages:
            c = m.get("content", "")
            chars += len(c) if isinstance(c, str) else len(str(c))
            chars += 16  # role / framing overhead
        r = self.ratio.get(model or "", self.default)
        return max(1, math.ceil(chars / r))

    def learn(self, model: str, chars: int, real_tokens: int) -> None:
        """Exponential moving average of chars-per-token from provider-reported usage."""
        if real_tokens <= 0 or chars <= 0:
            return
        obs = chars / real_tokens
        old = self.ratio.get(model, self.default)
        self.ratio[model] = 0.8 * old + 0.2 * obs
