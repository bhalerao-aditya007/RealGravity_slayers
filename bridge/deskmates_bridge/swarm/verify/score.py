"""
Selection scoring formula for patch candidates (§10.4).
Applies only among L0-L2 survivors.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class CandidateScores:
    cand_id: str
    cross_exam_pass_rate: float
    cluster_support: float
    critic_score: float
    reliability_prior: float
    diff_size_penalty: float
    scope_violation: float
    total_score: float


class SelectionScorer:
    def __init__(
        self,
        w_cross: float = 0.40,
        w_cluster: float = 0.25,
        w_critic: float = 0.20,
        w_prior: float = 0.10,
        w_diff_penalty: float = 0.05,
    ) -> None:
        self.w_cross = w_cross
        self.w_cluster = w_cluster
        self.w_critic = w_critic
        self.w_prior = w_prior
        self.w_diff_penalty = w_diff_penalty

    def score_candidate(
        self,
        cand_id: str,
        cross_exam_pass_rate: float,
        cluster_support: float,
        critic_score: float = 1.0,
        reliability_prior: float = 1.0,
        diff_lines: int = 10,
        has_scope_violation: bool = False,
    ) -> CandidateScores:
        # Diff penalty: small penalty if diff > 50 lines
        penalty = min(1.0, max(0.0, (diff_lines - 50) / 200.0)) if diff_lines > 50 else 0.0
        scope_penalty = 1.0 if has_scope_violation else 0.0

        total = (
            self.w_cross * cross_exam_pass_rate
            + self.w_cluster * cluster_support
            + self.w_critic * critic_score
            + self.w_prior * reliability_prior
            - self.w_diff_penalty * penalty
            - 1.0 * scope_penalty
        )

        return CandidateScores(
            cand_id=cand_id,
            cross_exam_pass_rate=cross_exam_pass_rate,
            cluster_support=cluster_support,
            critic_score=critic_score,
            reliability_prior=reliability_prior,
            diff_size_penalty=penalty,
            scope_violation=scope_penalty,
            total_score=round(total, 4),
        )
