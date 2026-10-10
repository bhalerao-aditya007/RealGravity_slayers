"""
Behavioral clustering (AlphaCode-style) on shared inputs.
Groups surviving candidates by identical test execution output vectors.
"""
from __future__ import annotations
from typing import Any, Dict, List, Set, Tuple


class BehavioralClusterer:
    @staticmethod
    def cluster_candidates(
        candidate_outputs: Dict[str, Tuple[Any, ...]],  # cand_id -> tuple of outputs on shared inputs
        candidate_families: Dict[str, str],            # cand_id -> family
    ) -> Dict[str, float]:
        """
        Computes cluster support per candidate:
        cluster_support = 0.6 * family_coverage + 0.4 * candidate_share.
        """
        if not candidate_outputs:
            return {}

        total_candidates = len(candidate_outputs)
        all_families = set(candidate_families.values())
        total_families_count = max(len(all_families), 1)

        # Group by output signature
        clusters: Dict[Tuple[Any, ...], List[str]] = {}
        for c_id, out_vec in candidate_outputs.items():
            clusters.setdefault(out_vec, []).append(c_id)

        candidate_support: Dict[str, float] = {}
        for out_vec, members in clusters.items():
            member_families = set(candidate_families.get(m, "") for m in members)
            fam_coverage = len(member_families) / total_families_count
            cand_share = len(members) / total_candidates

            support_score = round(0.60 * fam_coverage + 0.40 * cand_share, 3)
            for m in members:
                candidate_support[m] = support_score

        return candidate_support
