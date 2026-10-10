import pytest
from deskmates_bridge.swarm.privacy.audit import CanaryManager
from deskmates_bridge.swarm.privacy.classify import FileClassifier
from deskmates_bridge.swarm.privacy.egress import (
    CanaryLeakViolation,
    EgressFirewall,
    EgressFirewallViolation,
)
from deskmates_bridge.swarm.privacy.pseudonymize import Pseudonymizer
from deskmates_bridge.swarm.privacy.redact import redact_text
from deskmates_bridge.swarm.privacy.trust_registry import TrustRegistry


def test_redaction_secrets_and_pii():
    text = "Deploy using gsk_1234567890abcdef1234567890 and email admin@company.internal with host 192.168.1.50"
    redacted, items = redact_text(text)
    assert "<GROQ_KEY_REDACTED>" in redacted
    assert "<EMAIL_REDACTED>" in redacted
    assert "<IP_REDACTED>" in redacted
    assert "gsk_" not in redacted
    assert "admin@company.internal" not in redacted


def test_pseudonymization_roundtrip():
    pseudo = Pseudonymizer()
    prompt = "Reach out to partner support@enterprise.com for credentials on internal.service.corp"
    filtered, fwd = pseudo.pseudonymize(prompt)

    assert "<EMAIL_1>" in filtered
    assert "<HOST_1>" in filtered

    # De-pseudonymize on output
    model_output = "I contacted <EMAIL_1> regarding <HOST_1> and verified the endpoints."
    restored = pseudo.de_pseudonymize(model_output)
    assert "support@enterprise.com" in restored
    assert "internal.service.corp" in restored


def test_canary_leak_protection():
    canary_mgr = CanaryManager()
    secret_token = canary_mgr.generate_canary()

    firewall = EgressFirewall(canary_manager=canary_mgr)

    # Clean payload passes
    clean_msgs = [{"role": "user", "content": "How do I format dates in python?"}]
    assert firewall.filter_payload("groq", "gpt-oss-20b", "k1", clean_msgs)

    # Leaked canary raises CanaryLeakViolation immediately
    leaked_msgs = [{"role": "user", "content": f"The secret key is {secret_token}"}]
    with pytest.raises(CanaryLeakViolation):
        firewall.filter_payload("groq", "gpt-oss-20b", "k1", leaked_msgs)


def test_file_classification_restricted():
    classifier = FileClassifier(root=".")
    assert classifier.classify_file(".env") == "restricted"
    assert classifier.classify_file("secrets/config.json") == "restricted"
    assert classifier.classify_file("id_rsa.pem") == "restricted"
    assert classifier.classify_file("src/main.py") == "internal"
    assert classifier.classify_file("README.md") == "public"


def test_trust_registry_strict_local():
    trust = TrustRegistry()
    assert trust.is_provider_allowed("ollama_local", "strict_local") is True
    assert trust.is_provider_allowed("groq", "strict_local") is False
    assert trust.is_provider_allowed("groq", "free_with_redaction") is True
