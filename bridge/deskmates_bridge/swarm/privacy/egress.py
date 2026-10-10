"""
Single choke point Egress Firewall.
Enforces provider trust, data classification, secret/PII redaction,
pseudonymization, minimization, canary checks, and local audit logging.
"""
from __future__ import annotations
import hashlib
import json
from typing import Any, Dict, List, Optional
from .audit import CanaryManager
from .classify import FileClassifier
from .pseudonymize import Pseudonymizer
from .redact import redact_text
from .trust_registry import PrivacyMode, TrustRegistry


class EgressFirewallViolation(Exception):
    """Raised when an outbound payload violates trust or security policies."""


class CanaryLeakViolation(EgressFirewallViolation):
    """Raised when a canary token is detected in outbound traffic."""


class EgressFirewall:
    def __init__(
        self,
        privacy_mode: PrivacyMode = "free_with_redaction",
        trust_registry: Optional[TrustRegistry] = None,
        file_classifier: Optional[FileClassifier] = None,
        canary_manager: Optional[CanaryManager] = None,
        pseudonymize: bool = True,
        on_audit: Optional[Any] = None,
    ) -> None:
        self.privacy_mode = privacy_mode
        self.trust_registry = trust_registry or TrustRegistry()
        self.file_classifier = file_classifier
        self.canary_manager = canary_manager or CanaryManager()
        self.pseudonymizer = Pseudonymizer() if pseudonymize else None
        self.on_audit = on_audit or (lambda rec: None)

    def filter_payload(
        self,
        provider: str,
        model: str,
        key_id: str,
        messages: List[Dict[str, Any]],
        run_id: str = "run_0",
        consent_id: str = "consent_default",
        source_files: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        # 1. Trust check
        if not self.trust_registry.is_provider_allowed(provider, self.privacy_mode):
            raise EgressFirewallViolation(
                f"Provider '{provider}' is not allowed in privacy mode '{self.privacy_mode}'."
            )

        # 2. Classification check on referenced source files
        if self.file_classifier and source_files:
            for f in source_files:
                classification = self.file_classifier.classify_file(f)
                if classification == "restricted":
                    raise EgressFirewallViolation(
                        f"Attempted to send restricted file '{f}' to external provider."
                    )

        # Process messages
        filtered_messages: List[Dict[str, Any]] = []
        all_redactions: List[str] = []
        labels: List[str] = []
        full_content_str = ""

        for m in messages:
            content = str(m.get("content", ""))
            full_content_str += "\n" + content

            # 3. Canary leak check
            leaked_canary = self.canary_manager.check_leak(content)
            if leaked_canary:
                raise CanaryLeakViolation(
                    f"Canary secret leak detected in outbound payload: {leaked_canary}"
                )

            # 4. Redact secrets & PII
            redacted, redaction_types = redact_text(content)
            all_redactions.extend(redaction_types)

            # 5. Pseudonymize if enabled
            if self.pseudonymizer:
                pseudo_text, _ = self.pseudonymizer.pseudonymize(redacted)
            else:
                pseudo_text = redacted

            new_m = dict(m)
            new_m["content"] = pseudo_text
            filtered_messages.append(new_m)

        # 6. Audit record
        payload_bytes = len(json.dumps(filtered_messages).encode("utf-8"))
        payload_sha256 = hashlib.sha256(full_content_str.encode("utf-8")).hexdigest()

        audit_entry = {
            "run_id": run_id,
            "provider": provider,
            "model": model,
            "key_id": key_id,
            "bytes": payload_bytes,
            "payload_sha256": payload_sha256,
            "labels": list(set(labels)),
            "redactions": list(set(all_redactions)),
            "consent_id": consent_id,
        }
        self.on_audit(audit_entry)

        return filtered_messages
