import pytest
from deskmates_bridge.swarm.bus import MessageBus, SwarmMessage


def test_bus_phase_gating():
    bus = MessageBus()
    delivered = []
    bus.subscribe("cell/*", lambda m: delivered.append(m))

    # Phase is 'diverge': only PROPOSAL or STATUS is allowed
    bus.set_phase("diverge")

    valid_proposal = SwarmMessage(
        id="m1", run_id="r1", from_agent="c1", from_role="coder",
        topic="cell/1", type="PROPOSAL", payload={"title": "Proposal 1"}
    )
    assert bus.publish(valid_proposal) is True
    assert len(delivered) == 1

    # Disallowed type in Diverge phase: e.g. PATCH_PROPOSAL or CRITIQUE
    invalid_critique = SwarmMessage(
        id="m2", run_id="r1", from_agent="cr1", from_role="critic",
        topic="cell/1", type="CRITIQUE", payload={"objection": "Premature"}
    )
    assert bus.publish(invalid_critique) is False
    assert len(delivered) == 1  # Not delivered!


def test_bus_deduplication():
    bus = MessageBus()
    bus.set_phase("build")

    m1 = SwarmMessage(
        id="m1", run_id="r1", from_agent="c1", from_role="coder",
        topic="cell/1", type="PATCH_PROPOSAL", payload={"code": "duplicate_check"}
    )
    assert bus.publish(m1) is True

    # Duplicate payload hash is rejected
    m2 = SwarmMessage(
        id="m2", run_id="r1", from_agent="c1", from_role="coder",
        topic="cell/1", type="PATCH_PROPOSAL", payload={"code": "duplicate_check"}
    )
    assert bus.publish(m2) is False


def test_bus_role_acl():
    bus = MessageBus()
    bus.set_phase("build")

    # Critic trying to publish PATCH_PROPOSAL is blocked by ACL
    m_critic_patch = SwarmMessage(
        id="m3", run_id="r1", from_agent="cr1", from_role="critic",
        topic="cell/1", type="PATCH_PROPOSAL", payload={"code": "unauthorized"}
    )
    assert bus.publish(m_critic_patch) is False
