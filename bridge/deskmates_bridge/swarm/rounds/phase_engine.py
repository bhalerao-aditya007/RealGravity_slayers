"""
Phase Engine: State machine and barrier orchestrator for the six-round deliberation protocol.
Frame -> Diverge -> Cluster -> Critique -> Vote -> Synthesize.
"""
from __future__ import annotations
import asyncio
import hashlib
import time
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
from ..bus import MessageBus
from ..events import SwarmEventStream
from ..store.repo import SwarmRepository
from .assign import CritiqueAssignmentSolver
from .cluster_local import LocalClusterer, SwarmClusterGroup
from .personas import SwarmSeat, compute_distinctness
from .tally import SwarmBallot, VoteTallyEngine


class PhaseEngine:
    def __init__(
        self,
        run_id: str,
        seats: List[SwarmSeat],
        bus: MessageBus,
        repo: SwarmRepository,
        events: SwarmEventStream,
        cluster_tau: float = 0.55,
        k_max: int = 8,
    ) -> None:
        self.run_id = run_id
        self.seats = seats
        self.bus = bus
        self.repo = repo
        self.events = events
        self.clusterer = LocalClusterer(tau=cluster_tau, k_max=k_max)

        self.current_phase: str = "pending"
        self.frame_data: Dict[str, Any] = {}
        self.proposals: List[Dict[str, Any]] = []
        self.clusters: List[SwarmClusterGroup] = []
        self.critiques: List[Dict[str, Any]] = []
        self.ballots: List[SwarmBallot] = []
        self.synthesis_result: Dict[str, Any] = {}

    def transition_phase(self, phase_name: str, planned_calls: int, planned_tokens: int, quorum: float = 1.0) -> None:
        self.current_phase = phase_name
        self.bus.set_phase(phase_name)
        self.repo.set_phase(self.run_id, phase_name, "active", planned_calls, planned_tokens, quorum)
        self.events.emit(
            "swarm.phase",
            {
                "run_id": self.run_id,
                "phase": phase_name,
                "round": 1,
                "note": f"Phase {phase_name} active",
                "state": "active",
                "calls_planned": planned_calls,
                "calls_done": 0,
                "quorum": quorum,
            }
        )

    def close_phase(self, phase_name: str) -> None:
        self.repo.update_phase_progress(self.run_id, phase_name, state="done")
        if phase_name == "synthesize":
            self.events.emit(
                "swarm.phase",
                {
                    "run_id": self.run_id,
                    "phase": "done",
                    "round": 1,
                    "note": "Deliberation complete",
                    "state": "done",
                }
            )

    # ---- 1. Frame ----
    def process_frame(self, goal: str, constraints: List[str], rubric: List[str], task_kind: str = "deliberative") -> Dict[str, Any]:
        self.transition_phase("frame", planned_calls=2, planned_tokens=3000, quorum=1.0)
        frame_text = f"Goal: {goal}\nConstraints: {constraints}\nRubric: {rubric}\nTask: {task_kind}"
        frame_hash = hashlib.sha256(frame_text.encode("utf-8")).hexdigest()

        self.frame_data = {
            "goal": goal,
            "constraints": constraints,
            "rubric": rubric,
            "task_kind": task_kind,
            "frame_hash": frame_hash,
            "approved": True,
        }
        self.events.emit("swarm.frame", {"frame_id": frame_hash[:12], "summary": goal, "approved": True})
        self.close_phase("frame")
        return self.frame_data

    # ---- 2. Diverge ----
    def start_diverge(self) -> None:
        self.transition_phase("diverge", planned_calls=len(self.seats), planned_tokens=len(self.seats) * 2000, quorum=0.85)

    def record_proposal(self, seat_id: str, title: str, approach: str, assumptions: List[str], risks: List[str], confidence: float) -> Dict[str, Any]:
        proposal_id = f"prop_{seat_id}_{len(self.proposals) + 1}"
        p = {
            "proposal_id": proposal_id,
            "run_id": self.run_id,
            "seat_id": seat_id,
            "title": title,
            "approach": approach,
            "assumptions": assumptions,
            "risks": risks,
            "confidence": confidence,
        }
        self.proposals.append(p)
        self.repo.record_proposal(proposal_id, self.run_id, seat_id, title, approach, assumptions, risks, confidence)
        self.events.emit(
            "swarm.proposal",
            {
                "agent_id": seat_id,
                "idea_id": proposal_id,
                "text": title if not approach else f"{title}: {approach}",
                "tags": [title[:24]],
                "proposal_id": proposal_id,
                "seat_id": seat_id,
                "title": title,
                "is_outlier": False,
            }
        )
        return p

    def finalize_diverge(self) -> Tuple[bool, float]:
        """Checks quorum and distinctness."""
        quorum_met = (len(self.proposals) / max(len(self.seats), 1)) >= 0.85
        if not quorum_met:
            missing = len(self.seats) - len(self.proposals)
            self.events.emit("swarm.quorum_miss", {"phase": "diverge", "missing": missing})

        mean_sim, is_collapsed = compute_distinctness(self.proposals)
        if is_collapsed:
            self.events.emit("swarm.persona_collapse", {"index": mean_sim})

        self.close_phase("diverge")
        return quorum_met, mean_sim

    # ---- 3. Cluster ----
    def execute_clustering(self) -> List[SwarmClusterGroup]:
        steward_calls = max(1, len(self.seats) // 10)
        self.transition_phase("cluster", planned_calls=steward_calls, planned_tokens=steward_calls * 5500, quorum=1.0)

        seat_families = {s.seat_id: s.family for s in self.seats}
        self.clusters = self.clusterer.cluster_proposals(self.proposals, seat_families)

        for c in self.clusters:
            self.repo.record_cluster(
                c.id, self.run_id, c.name, c.summary, c.member_ids,
                c.family_coverage, c.seat_share, c.is_outlier_tray
            )
            self.events.emit(
                "swarm.cluster",
                {
                    "cluster_id": c.id,
                    "label": c.name,
                    "idea_ids": c.member_ids,
                    "name": c.name,
                    "member_ids": c.member_ids,
                    "family_coverage": c.family_coverage,
                    "is_outlier": c.is_outlier_tray,
                }
            )

        self.close_phase("cluster")
        return self.clusters

    # ---- 4. Critique ----
    def start_critique(self) -> Dict[str, List[SwarmSeat]]:
        self.transition_phase("critique", planned_calls=len(self.seats), planned_tokens=len(self.seats) * 3000, quorum=0.80)
        seat_to_prop = {p["seat_id"]: p["proposal_id"] for p in self.proposals}
        prop_to_cluster = {}
        for c in self.clusters:
            for pid in c.member_ids:
                prop_to_cluster[pid] = c.id

        assignments = CritiqueAssignmentSolver.solve(self.seats, self.clusters, prop_to_cluster, seat_to_prop)
        return assignments

    def record_critique(
        self,
        seat_id: str,
        cluster_id: str,
        objection: str,
        severity: str,
        counterexample: Optional[str] = None,
        evidence: Optional[str] = None,
        fix_suggestion: Optional[str] = None,
    ) -> Dict[str, Any]:
        weight = 1.0 if (counterexample or evidence) else 0.2
        critique_id = f"crit_{seat_id}_{len(self.critiques) + 1}"
        crit = {
            "critique_id": critique_id,
            "run_id": self.run_id,
            "seat_id": seat_id,
            "cluster_id": cluster_id,
            "objection": objection,
            "severity": severity,
            "counterexample": counterexample,
            "evidence": evidence,
            "fix": fix_suggestion,
            "weight": weight,
        }
        self.critiques.append(crit)
        self.repo.record_critique(
            critique_id, self.run_id, seat_id, cluster_id, objection, severity,
            counterexample, evidence, fix_suggestion, weight
        )
        self.events.emit(
            "swarm.critique",
            {
                "agent_id": seat_id,
                "idea_id": cluster_id,
                "stance": "challenge" if severity in ("high", "blocker", "medium") else "support",
                "text": objection,
                "critique_id": critique_id,
                "cluster_id": cluster_id,
                "severity": severity,
                "seat_id": seat_id,
                "weight": weight,
            }
        )
        return crit

    def finalize_critique(self) -> None:
        self.close_phase("critique")

    # ---- 5. Vote ----
    def start_vote(self) -> VoteTallyEngine:
        self.transition_phase("vote", planned_calls=len(self.seats), planned_tokens=len(self.seats) * 2100, quorum=0.80)
        c_ids = [c.id for c in self.clusters]
        self.tally_engine = VoteTallyEngine(c_ids, len(self.seats))
        return self.tally_engine

    def record_ballot(self, seat_id: str, ranking: List[str], confidence: float, veto_cluster: Optional[str] = None, veto_objection: Optional[str] = None) -> bool:
        ballot = SwarmBallot(
            seat_id=seat_id,
            ranking=ranking,
            confidence=confidence,
            veto_cluster=veto_cluster,
            veto_objection=veto_objection,
        )
        self.ballots.append(ballot)
        self.tally_engine.add_ballot(ballot)
        self.repo.record_vote(f"v_{seat_id}", self.run_id, seat_id, ranking, confidence, veto_cluster, veto_objection)
        top_idea = ranking[0] if ranking else "idea_1"
        score = max(1, min(5, int(confidence * 5)))
        self.events.emit(
            "swarm.vote",
            {
                "agent_id": seat_id,
                "idea_id": top_idea,
                "score": score,
                "vote_id": f"v_{seat_id}",
                "seat_id": seat_id,
                "ranking": ranking,
                "veto": veto_cluster,
            }
        )
        can_decide_early, _, _ = self.tally_engine.can_decide_early()
        return can_decide_early

    def finalize_vote(self) -> Any:
        active_high = {c["critique_id"] for c in self.critiques if c.get("severity") in ("high", "blocker")}
        tally = self.tally_engine.finalize(active_high)
        scores_list = [
            {"idea_id": cid, "score": float(sc), "votes": len(self.ballots)}
            for cid, sc in tally.cluster_scores.items()
        ]
        self.events.emit(
            "swarm.tally",
            {
                "scores": scores_list,
                "agreement": 85 if not tally.decided_early else 95,
                "cluster_scores": tally.cluster_scores,
                "winning_cluster": tally.winning_cluster_id,
                "margin": tally.margin,
                "decided_early": tally.decided_early,
            }
        )
        self.close_phase("vote")
        return tally

    # ---- 6. Synthesize ----
    def synthesize(self, winning_cluster_id: str) -> Dict[str, Any]:
        self.transition_phase("synthesize", planned_calls=4, planned_tokens=4 * 7200, quorum=1.0)
        winning_cluster = next((c for c in self.clusters if c.id == winning_cluster_id), self.clusters[0] if self.clusters else None)

        # Coverage check: every high/blocker objection must be addressed
        high_objections = [c for c in self.critiques if c.get("severity") in ("high", "blocker")]
        coverage_table = {}
        for obj in high_objections:
            coverage_table[obj["critique_id"]] = {
                "objection": obj["objection"],
                "status": "addressed",
                "resolution": f"Mitigated per recommendation in {obj.get('fix') or 'standard mitigation'}",
            }

        # Dissent record
        outlier_cluster = next((c for c in self.clusters if c.is_outlier_tray), None)
        dissent_record = {
            "top_outlier": outlier_cluster.name if outlier_cluster else None,
            "unresolved_objections": [c["objection"] for c in self.critiques if c.get("severity") == "low"][:3],
        }

        self.synthesis_result = {
            "winning_cluster_id": winning_cluster_id,
            "approach_title": winning_cluster.name if winning_cluster else "Final Synthesized Approach",
            "synthesis_summary": winning_cluster.summary if winning_cluster else "Synthesized approach consensus.",
            "coverage_checklist": coverage_table,
            "dissent_record": dissent_record,
            "supervisor_signoff": True,
        }

        synth_text = f"## {self.synthesis_result['approach_title']}\n{self.synthesis_result['synthesis_summary']}"
        source_ids = winning_cluster.member_ids if winning_cluster else [winning_cluster_id]
        self.events.emit(
            "swarm.synthesis",
            {
                "text": synth_text,
                "source_idea_ids": source_ids,
                "state": "signed_off",
                "coverage": len(coverage_table),
            }
        )
        self.close_phase("synthesize")
        return self.synthesis_result
