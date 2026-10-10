"""
High-precision regex and entropy-based redaction of secrets, API keys, and PII.
"""
from __future__ import annotations
import math
import re
from typing import List, Tuple

# Known secret prefixes and patterns
SECRET_PATTERNS = [
    (re.compile(r"gsk_[a-zA-Z0-9]{20,}", re.IGNORECASE), "<GROQ_KEY_REDACTED>"),
    (re.compile(r"nvapi-[a-zA-Z0-9_\-]{20,}", re.IGNORECASE), "<NVIDIA_KEY_REDACTED>"),
    (re.compile(r"sk-[a-zA-Z0-9_\-]{20,}", re.IGNORECASE), "<API_KEY_REDACTED>"),
    (re.compile(r"csk-[a-zA-Z0-9_\-]{20,}", re.IGNORECASE), "<CEREBRAS_KEY_REDACTED>"),
    (re.compile(r"AKIA[0-9A-Z]{16}", re.ASCII), "<AWS_KEY_REDACTED>"),
    (re.compile(r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[^-]+-----END (?:RSA |EC )?PRIVATE KEY-----", re.DOTALL), "<PRIVATE_KEY_REDACTED>"),
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"), "<EMAIL_REDACTED>"),
    (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "<IP_REDACTED>"),
    (re.compile(r"(?:Bearer|Token)\s+[A-Za-z0-9_\-\.]{25,}", re.IGNORECASE), "<BEARER_TOKEN_REDACTED>"),
    (re.compile(r"(?:api[_-]?key|secret|password|token)\s*[:=]\s*['\"]([^'\"]{8,})['\"]", re.IGNORECASE), "<CONFIG_SECRET_REDACTED>"),
]


def shannon_entropy(data: str) -> float:
    if not data:
        return 0.0
    entropy = 0.0
    for x in set(data):
        p_x = float(data.count(x)) / len(data)
        entropy += - p_x * math.log2(p_x)
    return entropy


def is_high_entropy_secret(token: str) -> bool:
    if len(token) < 20 or len(token) > 128:
        return False
    # If alphanumeric / hex / base64 without spaces
    if not re.match(r"^[A-Za-z0-9+/=_~-]+$", token):
        return False
    return shannon_entropy(token) > 4.2


def redact_text(text: str) -> Tuple[str, List[str]]:
    """Redacts secrets and PII from text, returning (redacted_text, list_of_redactions)."""
    redactions: List[str] = []
    result = text

    for pattern, replacement in SECRET_PATTERNS:
        matches = pattern.findall(result)
        if matches:
            redactions.append(replacement.strip("<>"))
            result = pattern.sub(replacement, result)

    # Check words for high entropy secrets
    words = result.split()
    for w in words:
        clean = w.strip("'\":,;()[]{}")
        if is_high_entropy_secret(clean) and not clean.startswith("<") and not clean.endswith(">"):
            result = result.replace(clean, "<HIGH_ENTROPY_SECRET_REDACTED>")
            redactions.append("HIGH_ENTROPY_SECRET")

    return result, list(set(redactions))
