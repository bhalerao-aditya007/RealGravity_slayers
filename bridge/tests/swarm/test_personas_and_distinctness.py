import pytest
from deskmates_bridge.swarm.rounds.personas import (
    PERSONA_COUNTS_BY_N,
    PersonaSeatAllocator,
    compute_distinctness,
)


def test_persona_seat_counts_and_adversarial_share():
    allocator = PersonaSeatAllocator()
    for n in [10, 20, 30, 40, 50]:
        seats = allocator.allocate_seats("run_test", n)
        assert len(seats) == n

        # Verify against PERSONA_COUNTS_BY_N
        expected_counts = PERSONA_COUNTS_BY_N[n]
        assert sum(expected_counts.values()) == n

    # N=50 adversarial share: Skeptic(6) + Risk(5) + Devil's Advocate(4) + Security(4) = 19 / 50 = 38%
    counts_50 = PERSONA_COUNTS_BY_N[50]
    adversarial = (
        counts_50["skeptic"]
        + counts_50["risk_analyst"]
        + counts_50["devils_advocate"]
        + counts_50["security_auditor"]
    )
    assert adversarial / 50.0 >= 0.38


def test_persona_distinctness_detects_collapse():
    # 1. Diverse proposals
    diverse_proposals = [
        {"title": "Zero-copy Buffer Parser", "approach": "Using memoryview and ctypes byte slicing.", "assumptions": ["C-extensions allowed"]},
        {"title": "Monadic Error Envelope", "approach": "Functional railway-oriented validation without exceptions.", "assumptions": ["Immutable data structures"]},
        {"title": "Event-Driven Actor Pipeline", "approach": "Async queues with backpressure and actor mailboxes.", "assumptions": ["Asyncio runtime"]},
    ]
    mean_sim, is_collapsed = compute_distinctness(diverse_proposals)
    assert not is_collapsed
    assert mean_sim < 0.60

    # 2. Collapsed (near-identical) proposals
    identical_proposals = [
        {"title": "Standard Parser", "approach": "We should parse the input with regex pattern.", "assumptions": ["Standard regex engine"]},
        {"title": "Standard Parser", "approach": "We should parse the input with regex pattern.", "assumptions": ["Standard regex engine"]},
        {"title": "Standard Parser", "approach": "We should parse the input with regex pattern.", "assumptions": ["Standard regex engine"]},
    ]
    sim_col, is_collapsed_true = compute_distinctness(identical_proposals)
    assert is_collapsed_true
    assert sim_col > 0.80
