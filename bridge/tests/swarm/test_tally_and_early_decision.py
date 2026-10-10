import pytest
from deskmates_bridge.swarm.rounds.tally import SwarmBallot, VoteTallyEngine


def test_borda_and_early_decision():
    # 10 seats total
    tally = VoteTallyEngine(cluster_ids=["c1", "c2", "c3"], total_seats_expected=10)

    # First 6 ballots vote overwhelmingly for c1 with confidence 1.0
    for i in range(7):
        tally.add_ballot(SwarmBallot(
            seat_id=f"seat_{i+1}",
            ranking=["c1", "c2", "c3"],
            confidence=1.0,
            reliability_weight=1.0,
        ))

    # c1 has 7 * 3.0 = 21 points
    # c2 has 7 * 2.0 = 14 points
    # Margin is 7 points.
    # Remaining ballots = 10 - 7 = 3.
    # Max possible points c2 can gain = 3 * 4.5 = 13.5 (cannot overtake if margin > max gain)
    # Let's add 2 more ballots for c1
    for i in range(7, 9):
        tally.add_ballot(SwarmBallot(
            seat_id=f"seat_{i+1}",
            ranking=["c1", "c2", "c3"],
            confidence=1.0,
            reliability_weight=1.0,
        ))

    # Now 9 ballots for c1. Remaining = 1.
    # Margin = (9 * 3) - (9 * 2) = 9 points.
    # 1 remaining ballot can gain at most 4.5 points -> Early decision guaranteed!
    can_decide, winner, margin = tally.can_decide_early()
    assert can_decide is True
    assert winner == "c1"
    assert margin > 4.5

    res = tally.finalize()
    assert res.winning_cluster_id == "c1"
    assert res.decided_early is True


def test_veto_blocks_cluster_selection():
    tally = VoteTallyEngine(cluster_ids=["c1", "c2"], total_seats_expected=3)

    # c1 has higher score
    tally.add_ballot(SwarmBallot("s1", ranking=["c1", "c2"], confidence=1.0))
    tally.add_ballot(SwarmBallot("s2", ranking=["c1", "c2"], confidence=1.0))

    # s3 casts a veto against c1 citing blocker objection 'crit_blocker_1'
    tally.add_ballot(SwarmBallot(
        "s3", ranking=["c2", "c1"], confidence=1.0,
        veto_cluster="c1", veto_objection="crit_blocker_1"
    ))

    # If 'crit_blocker_1' is in active high objections, c1 is vetoed and c2 wins!
    res = tally.finalize(active_high_objections={"crit_blocker_1"})
    assert res.winning_cluster_id == "c2"
    assert "c1" in res.vetoed_clusters
