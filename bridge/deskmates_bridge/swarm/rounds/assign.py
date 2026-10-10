"""
Bipartite Critique Assignment Solver.
Enforces constraints: >=3 critics, >=3 distinct personas, >=2 families, no self-cluster critique.
"""
from __future__ import annotations
from typing import Dict, List, Set, Tuple
from .cluster_local import SwarmClusterGroup
from .personas import SwarmSeat


class CritiqueAssignmentSolver:
    @staticmethod
    def solve(
        seats: List[SwarmSeat],
        clusters: List[SwarmClusterGroup],
        proposal_to_cluster: Dict[str, str],   # proposal_id -> cluster_id
        seat_to_proposal: Dict[str, str],      # seat_id -> proposal_id
    ) -> Dict[str, List[SwarmSeat]]:
        """Returns mapping: cluster_id -> list of assigned seats."""
        assignments: Dict[str, List[SwarmSeat]] = {c.id: [] for c in clusters}
        if not clusters or not seats:
            return assignments

        # Prioritize clusters by seat_share descending
        sorted_clusters = sorted(clusters, key=lambda c: c.seat_share, reverse=True)

        # Persona affinity priority
        adversarial_personas = {"skeptic", "devils_advocate", "risk_analyst", "security_auditor"}

        for cluster in sorted_clusters:
            assigned: List[SwarmSeat] = []
            assigned_families: Set[str] = set()
            assigned_personas: Set[str] = set()

            # Eligible candidates: seat cannot be author of proposal in this cluster
            eligible = []
            for s in seats:
                prop_id = seat_to_proposal.get(s.seat_id)
                if prop_id and prop_id in cluster.member_ids:
                    continue  # Self-cluster excluded
                eligible.append(s)

            # 1. Prefer adversarial personas for the largest clusters & outliers
            if cluster.seat_share >= 0.3 or cluster.is_outlier_tray:
                adv_seats = [s for s in eligible if s.persona_id in adversarial_personas]
                for s in adv_seats:
                    if len(assigned) < 3 or len(assigned_families) < 2:
                        assigned.append(s)
                        assigned_families.add(s.family)
                        assigned_personas.add(s.persona_id)

            # 2. Fill remaining slots to reach >=3 critics, >=3 personas, >=2 families
            for s in eligible:
                if s in assigned:
                    continue
                needs_more = len(assigned) < 3
                needs_family = len(assigned_families) < 2 and s.family not in assigned_families
                needs_persona = len(assigned_personas) < 3 and s.persona_id not in assigned_personas

                if needs_more or needs_family or needs_persona:
                    assigned.append(s)
                    assigned_families.add(s.family)
                    assigned_personas.add(s.persona_id)

                if len(assigned) >= 3 and len(assigned_families) >= 2 and len(assigned_personas) >= 3:
                    break

            # If still < 3 due to small N, take whatever eligible seats remain
            for s in eligible:
                if len(assigned) >= 3:
                    break
                if s not in assigned:
                    assigned.append(s)

            assignments[cluster.id] = assigned

        return assignments
