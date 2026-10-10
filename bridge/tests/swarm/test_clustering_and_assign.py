import pytest
from deskmates_bridge.swarm.rounds.assign import CritiqueAssignmentSolver
from deskmates_bridge.swarm.rounds.cluster_local import LocalClusterer
from deskmates_bridge.swarm.rounds.personas import PersonaSeatAllocator


def test_clustering_and_outlier_tray():
    clusterer = LocalClusterer(tau=0.45, k_max=4)
    proposals = [
        {"proposal_id": "p1", "title": "Tree Sitter Ast", "approach": "ast parser with tree sitter query", "assumptions": ["ast"]},
        {"proposal_id": "p2", "title": "Tree Sitter Ast 2", "approach": "ast parser with tree sitter syntax", "assumptions": ["ast"]},
        {"proposal_id": "p3", "title": "Regex Quick Scan", "approach": "regex pattern matcher on tokens", "assumptions": ["regex"]},
        {"proposal_id": "p4", "title": "Regex Quick Scan 2", "approach": "regex pattern matcher on lines", "assumptions": ["regex"]},
        {"proposal_id": "p5", "title": "Quantum Hybrid", "approach": "unusual quantum state simulation", "assumptions": ["unique_unshared"]},
    ]
    seat_families = {"seat_1": "qwen", "seat_2": "llama", "seat_3": "qwen", "seat_4": "gpt-oss", "seat_5": "mistral"}
    for idx, p in enumerate(proposals):
        p["seat_id"] = f"seat_{idx+1}"

    clusters = clusterer.cluster_proposals(proposals, seat_families)
    assert len(clusters) >= 2

    # Verify outlier tray was created for p5
    has_outlier_tray = any(c.is_outlier_tray for c in clusters)
    assert has_outlier_tray


def test_critique_assignment_solver_constraints():
    allocator = PersonaSeatAllocator()
    seats = allocator.allocate_seats("run_assign", 10)

    clusterer = LocalClusterer()
    proposals = []
    seat_to_prop = {}
    for s in seats:
        p_id = f"p_{s.seat_id}"
        proposals.append({
            "proposal_id": p_id,
            "seat_id": s.seat_id,
            "title": f"Plan by {s.persona_name}",
            "approach": f"Approach for {s.persona_name}",
            "assumptions": ["test"],
        })
        seat_to_prop[s.seat_id] = p_id

    seat_families = {s.seat_id: s.family for s in seats}
    clusters = clusterer.cluster_proposals(proposals, seat_families)

    prop_to_cluster = {}
    for c in clusters:
        for pid in c.member_ids:
            prop_to_cluster[pid] = c.id

    assignments = CritiqueAssignmentSolver.solve(seats, clusters, prop_to_cluster, seat_to_prop)

    for c in clusters:
        critics = assignments[c.id]
        # At least 3 critics
        assert len(critics) >= 3

        # At least 2 families
        crit_fams = set(s.family for s in critics)
        assert len(crit_fams) >= 2

        # At least 2 personas
        crit_personas = set(s.persona_id for s in critics)
        assert len(crit_personas) >= 2

        # No self-cluster critique
        for critic in critics:
            c_prop = seat_to_prop[critic.seat_id]
            assert c_prop not in c.member_ids
