"""Swarm privacy and egress protection module."""
from .audit import CanaryManager
from .classify import FileClassifier, FileClassification
from .egress import EgressFirewall, EgressFirewallViolation, CanaryLeakViolation
from .pseudonymize import Pseudonymizer
from .redact import redact_text
from .trust_registry import TrustRegistry, PrivacyMode, ProviderTrust

__all__ = [
    "CanaryManager",
    "FileClassifier",
    "FileClassification",
    "EgressFirewall",
    "EgressFirewallViolation",
    "CanaryLeakViolation",
    "Pseudonymizer",
    "redact_text",
    "TrustRegistry",
    "PrivacyMode",
    "ProviderTrust",
]
