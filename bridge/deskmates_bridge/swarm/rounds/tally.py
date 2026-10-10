"""
Vote Tally, Borda counting, veto rule evaluation, and Early-Decision checking.
"""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple


@dataclass
class SwarmBallot:
    seat_id: str
    ranking: List[str]  # cluster_ids in ranked order (up to 3)
    confidence: float   # 0.0 to 1.0
    veto_cluster: Optional[str] = None
    veto_objection: Optional[str] = None
    reliability_weight: float = 1.0


@dataclass
class TallyResult:
    cluster_scores: Dict[str, float]
    winning_cluster_id: Optional[str]
    margin: float
    decided_early: bool
    vetoed_clusters: Dict[str, str]  # cluster_id -> objection_id


class VoteTallyEngine:
    BORDA_POINTS = {0: 3.0, 1: 2.0, 2: 1.0}

    def __init__(self, cluster_ids: List[str], total_seats_expected: int) -> None:
        self.cluster_ids = cluster_ids
        self.total_seats_expected = total_seats_expected
        self.ballots: List[SwarmBallot] = []

    def add_ballot(self, ballot: SwarmBallot) -> None:
        self.ballots.append(ballot)

    def current_scores(self) -> Dict[str, float]:
        scores = {c: 0.0 for c in self.cluster_ids}
        for b in self.ballots:
            w = max(0.5, min(1.5, b.reliability_weight))
            for rank_idx, c_id in enumerate(b.ranking[:3]):
                if c_id in scores:
                    pts = self.BORDA_POINTS.get(rank_idx, 0.0)
                    scores[c_id] += pts * b.confidence * w
        return scores

    def can_decide_early(self) -> Tuple[bool, Optional[str], float]:
        """
        Computes whether the current leader's margin cannot be overturned
        by outstanding ballots even under worst-case scenario.
        Returns (can_decide, winning_cluster_id, margin).
        """
        scores = self.current_scores()
        if not scores:
            return False, None, 0.0

        sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        leader_id, leader_score = sorted_scores[0]
        runner_up_score = sorted_scores[1][1] if len(sorted_scores) > 1 else 0.0
        current_margin = leader_score - runner_up_score

        remaining_ballots = max(0, self.total_seats_expected - len(self.ballots))
        if remaining_ballots == 0:
            return True, leader_id, current_margin

        # Maximum points any single cluster could gain from remaining ballots:
        # 3 points * max_conf (1.0) * max_weight (1.5) = 4.5 points per remaining ballot
        max_possible_gain = remaining_ballots * 4.5

        if current_margin > max_possible_gain:
            return True, leader_id, current_margin

        return False, leader_id, current_margin

    def finalize(self, active_high_objections: Optional[Set[str]] = None) -> TallyResult:
        scores = self.current_scores()
        vetoed: Dict[str, str] = {}

        # Evaluate vetoes citing active high/blocker objections
        for b in self.ballots:
            if b.veto_cluster and b.veto_objection:
                if not active_high_objections or b.veto_objection in active_high_objections:
                    vetoed[b.veto_cluster] = b.veto_objection

        sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        winner = None
        margin = 0.0

        for c_id, sc in sorted_scores:
            if c_id not in vetoed:
                winner = c_id
                margin = sc - (sorted_scores[1][1] if len(sorted_scores) > 1 else 0.0)
                break

        # Fallback if all vetoed
        if not winner and sorted_scores:
            winner = sorted_scores[0][0]
            margin = sorted_scores[0][1]

        decided_early, _, _ = self.can_decide_early()

        return TallyResult(
            cluster_scores={k: round(v, 2) for k, v in scores.items()},
            winning_cluster_id=winner,
            margin=round(margin, 2),
            decided_early=decided_early and (len(self.ballots) < self.total_seats_expected),
            vetoed_clusters=vetoed,
        )
