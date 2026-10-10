"""
SQLite Repository for Swarm Mode.
Persists runs, seats, phases, proposals, clusters, critiques, votes, facts,
candidates, messages, directives, and egress audit records.
"""
from __future__ import annotations
import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional


class SwarmRepository:
    def __init__(self, db_path: str | Path = ":memory:") -> None:
        self.db_path = str(db_path)
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self) -> None:
        schema_path = Path(__file__).resolve().parent / "schema.sql"
        if schema_path.exists():
            with open(schema_path, "r", encoding="utf-8") as f:
                schema_sql = f.read()
            self.conn.executescript(schema_sql)
            self.conn.commit()

    # ---- Swarm Run ----
    def create_run(
        self,
        run_id: str,
        mode: str,
        n: int,
        privacy_mode: str,
        root_path: str,
        supervisor_policy: str = "balanced",
        task_kind: str = "deliberative",
        budget: Optional[dict] = None,
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO swarm_run 
                (run_id, mode, n, privacy_mode, root_path, supervisor_policy, task_kind, state, started_at, budget_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATED', ?, ?)
                """,
                (
                    run_id, mode, n, privacy_mode, root_path, supervisor_policy, task_kind,
                    time.time(), json.dumps(budget or {})
                )
            )

    def update_run_state(self, run_id: str, state: str) -> None:
        ended_at = time.time() if state in ("DONE", "FAILED", "CANCELLED") else None
        with self.conn:
            if ended_at:
                self.conn.execute(
                    "UPDATE swarm_run SET state = ?, ended_at = ? WHERE run_id = ?",
                    (state, ended_at, run_id)
                )
            else:
                self.conn.execute(
                    "UPDATE swarm_run SET state = ? WHERE run_id = ?",
                    (state, run_id)
                )

    def get_run(self, run_id: str) -> Optional[dict]:
        cur = self.conn.execute("SELECT * FROM swarm_run WHERE run_id = ?", (run_id,))
        row = cur.fetchone()
        return dict(row) if row else None

    # ---- Seats ----
    def create_seat(
        self,
        seat_id: str,
        run_id: str,
        seat_no: int,
        persona: str,
        function_role: str,
        model: str,
        family: str,
        temperature: float,
        color: str,
        ring: int = 1,
        angle: float = 0.0,
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO swarm_seat
                (seat_id, run_id, seat_no, persona, function_role, model, family, temperature, color, ring, angle)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (seat_id, run_id, seat_no, persona, function_role, model, family, temperature, color, ring, angle)
            )

    def get_seats(self, run_id: str) -> List[dict]:
        cur = self.conn.execute("SELECT * FROM swarm_seat WHERE run_id = ? ORDER BY seat_no ASC", (run_id,))
        return [dict(r) for r in cur.fetchall()]

    # ---- Phases ----
    def set_phase(
        self,
        run_id: str,
        phase: str,
        state: str,
        calls_planned: int = 0,
        tokens_planned: int = 0,
        quorum: float = 1.0,
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO swarm_phase (run_id, phase, state, calls_planned, tokens_planned, quorum, started_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(run_id, phase) DO UPDATE SET
                    state = excluded.state,
                    started_at = CASE WHEN excluded.state = 'active' THEN excluded.started_at ELSE swarm_phase.started_at END
                """,
                (run_id, phase, state, calls_planned, tokens_planned, quorum, time.time())
            )

    def update_phase_progress(
        self,
        run_id: str,
        phase: str,
        state: Optional[str] = None,
        calls_inc: int = 0,
        tokens_inc: int = 0,
    ) -> None:
        ended_at = time.time() if state == "done" else None
        with self.conn:
            sql = """
                UPDATE swarm_phase SET
                    calls_done = calls_done + ?,
                    tokens_used = tokens_used + ?
            """
            params: list[Any] = [calls_inc, tokens_inc]
            if state:
                sql += ", state = ?"
                params.append(state)
            if ended_at:
                sql += ", ended_at = ?"
                params.append(ended_at)
            sql += " WHERE run_id = ? AND phase = ?"
            params.extend([run_id, phase])
            self.conn.execute(sql, tuple(params))

    def get_phases(self, run_id: str) -> List[dict]:
        cur = self.conn.execute("SELECT * FROM swarm_phase WHERE run_id = ?", (run_id,))
        return [dict(r) for r in cur.fetchall()]

    # ---- Proposals ----
    def record_proposal(
        self,
        proposal_id: str,
        run_id: str,
        seat_id: str,
        title: str,
        body: str,
        assumptions: list[str],
        risks: list[str],
        confidence: float,
        cluster_id: Optional[str] = None,
        is_outlier: bool = False,
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO swarm_proposal
                (proposal_id, run_id, seat_id, title, body, assumptions_json, risks_json, confidence, cluster_id, is_outlier)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    proposal_id, run_id, seat_id, title, body,
                    json.dumps(assumptions), json.dumps(risks), confidence,
                    cluster_id, 1 if is_outlier else 0
                )
            )

    def get_proposals(self, run_id: str) -> List[dict]:
        cur = self.conn.execute("SELECT * FROM swarm_proposal WHERE run_id = ?", (run_id,))
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r["assumptions"] = json.loads(r.get("assumptions_json") or "[]")
            r["risks"] = json.loads(r.get("risks_json") or "[]")
        return rows

    # ---- Clusters ----
    def record_cluster(
        self,
        cluster_id: str,
        run_id: str,
        name: str,
        summary: str,
        member_ids: list[str],
        family_coverage: float,
        seat_share: float,
        is_outlier_tray: bool = False,
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO swarm_cluster
                (cluster_id, run_id, name, summary, member_ids_json, family_coverage, seat_share, is_outlier_tray)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    cluster_id, run_id, name, summary,
                    json.dumps(member_ids), family_coverage, seat_share,
                    1 if is_outlier_tray else 0
                )
            )

    def get_clusters(self, run_id: str) -> List[dict]:
        cur = self.conn.execute("SELECT * FROM swarm_cluster WHERE run_id = ?", (run_id,))
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r["member_ids"] = json.loads(r.get("member_ids_json") or "[]")
        return rows

    # ---- Critiques ----
    def record_critique(
        self,
        critique_id: str,
        run_id: str,
        seat_id: str,
        cluster_id: str,
        objection: str,
        severity: str,
        counterexample: Optional[str] = None,
        evidence: Optional[str] = None,
        fix: Optional[str] = None,
        weight: float = 1.0,
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO swarm_critique
                (critique_id, run_id, seat_id, cluster_id, objection, evidence, severity, fix, weight)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (critique_id, run_id, seat_id, cluster_id, objection, evidence or counterexample, severity, fix, weight)
            )

    def get_critiques(self, run_id: str) -> List[dict]:
        cur = self.conn.execute("SELECT * FROM swarm_critique WHERE run_id = ?", (run_id,))
        return [dict(r) for r in cur.fetchall()]

    # ---- Votes ----
    def record_vote(
        self,
        vote_id: str,
        run_id: str,
        seat_id: str,
        ranking: list[str],
        confidence: float,
        veto_cluster: Optional[str] = None,
        veto_objection: Optional[str] = None,
        cancelled: bool = False,
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO swarm_vote
                (vote_id, run_id, seat_id, ranking_json, confidence, veto_cluster, veto_objection, cancelled)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    vote_id, run_id, seat_id, json.dumps(ranking), confidence,
                    veto_cluster, veto_objection, 1 if cancelled else 0
                )
            )

    def get_votes(self, run_id: str) -> List[dict]:
        cur = self.conn.execute("SELECT * FROM swarm_vote WHERE run_id = ?", (run_id,))
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r["ranking"] = json.loads(r.get("ranking_json") or "[]")
        return rows

    # ---- Estimate ----
    def record_estimate(
        self,
        run_id: str,
        n: int,
        task_kind: str,
        calls_planned: int,
        tokens_planned: int,
        time_low_s: int,
        time_high_s: int,
        cooldown_pressure: str,
        profile_age_s: int,
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO swarm_estimate
                (run_id, n, task_kind, calls_planned, tokens_planned, time_low_s, time_high_s, cooldown_pressure, profile_age_s)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (run_id, n, task_kind, calls_planned, tokens_planned, time_low_s, time_high_s, cooldown_pressure, profile_age_s)
            )

    def update_estimate_actuals(self, run_id: str, calls_actual: int, tokens_actual: int, time_actual_s: int) -> None:
        with self.conn:
            self.conn.execute(
                """
                UPDATE swarm_estimate
                SET calls_actual = ?, tokens_actual = ?, time_actual_s = ?
                WHERE run_id = ?
                """,
                (calls_actual, tokens_actual, time_actual_s, run_id)
            )

    def get_estimate(self, run_id: str) -> Optional[dict]:
        cur = self.conn.execute("SELECT * FROM swarm_estimate WHERE run_id = ?", (run_id,))
        row = cur.fetchone()
        return dict(row) if row else None

    # ---- Egress Audit ----
    def record_egress_audit(
        self,
        run_id: str,
        provider: str,
        model: str,
        key_id: str,
        bytes_count: int,
        payload_sha256: str,
        labels: list[str],
        redactions: list[str],
        consent_id: str,
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT INTO egress_audit
                (run_id, ts, provider, model, key_id, bytes, payload_sha256, labels_json, redactions_json, consent_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id, time.time(), provider, model, key_id, bytes_count, payload_sha256,
                    json.dumps(labels), json.dumps(redactions), consent_id
                )
            )

    def get_egress_audits(self, run_id: str) -> List[dict]:
        cur = self.conn.execute("SELECT * FROM egress_audit WHERE run_id = ? ORDER BY seq ASC", (run_id,))
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r["labels"] = json.loads(r.get("labels_json") or "[]")
            r["redactions"] = json.loads(r.get("redactions_json") or "[]")
        return rows

    # ---- Facts & Blackboard ----
    def record_fact(
        self,
        fact_id: str,
        run_id: str,
        kind: str,
        text: str,
        evidence: list[str],
        author_family: str,
        status: str = "hypothesis",
        version: int = 1,
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO swarm_fact
                (fact_id, run_id, kind, text, evidence_json, author_family, confirmations_json, status, version)
                VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?)
                """,
                (fact_id, run_id, kind, text, json.dumps(evidence), author_family, status, version)
            )

    def promote_fact(self, fact_id: str, status: str = "verified") -> None:
        with self.conn:
            self.conn.execute(
                "UPDATE swarm_fact SET status = ? WHERE fact_id = ?",
                (status, fact_id)
            )

    def get_facts(self, run_id: str) -> List[dict]:
        cur = self.conn.execute("SELECT * FROM swarm_fact WHERE run_id = ?", (run_id,))
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r["evidence"] = json.loads(r.get("evidence_json") or "[]")
            r["confirmations"] = json.loads(r.get("confirmations_json") or "[]")
        return rows

    # ---- Cells & Candidates ----
    def record_cell(
        self,
        cell_id: str,
        run_id: str,
        title: str,
        difficulty: float,
        verifiable: bool,
        write_set: list[str],
        contract: dict,
        token_cap: int = 150000,
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO swarm_cell
                (cell_id, run_id, title, difficulty, verifiable, write_set_json, contract_json, state, token_cap)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
                """,
                (cell_id, run_id, title, difficulty, 1 if verifiable else 0, json.dumps(write_set), json.dumps(contract), token_cap)
            )

    def get_cells(self, run_id: str) -> List[dict]:
        cur = self.conn.execute("SELECT * FROM swarm_cell WHERE run_id = ?", (run_id,))
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r["write_set"] = json.loads(r.get("write_set_json") or "[]")
            r["contract"] = json.loads(r.get("contract_json") or "{}")
        return rows

    def record_candidate(
        self,
        cand_id: str,
        cell_id: str,
        agent_id: str,
        round_no: int,
        patch: str,
        reason: str,
        linked_check: str,
        l0: int = 0,
        l1: int = 0,
        l2: int = 0,
        cross_pass: float = 0.0,
        cluster_id: Optional[str] = None,
        critic_score: float = 0.0,
        score: float = 0.0,
        status: str = "proposed",
    ) -> None:
        with self.conn:
            self.conn.execute(
                """
                INSERT OR REPLACE INTO swarm_candidate
                (cand_id, cell_id, agent_id, round, patch, reason, linked_check, l0, l1, l2, cross_pass, cluster_id, critic_score, score, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (cand_id, cell_id, agent_id, round_no, patch, reason, linked_check, l0, l1, l2, cross_pass, cluster_id, critic_score, score, status)
            )

    def get_candidates(self, cell_id: str) -> List[dict]:
        cur = self.conn.execute("SELECT * FROM swarm_candidate WHERE cell_id = ?", (cell_id,))
        return [dict(r) for r in cur.fetchall()]

    # ---- Messages ----
    def record_msg(
        self,
        msg_id: str,
        run_id: str,
        from_agent: str,
        to_agent: Optional[str],
        topic: str,
        msg_type: str,
        cell_id: Optional[str],
        round_no: int,
        refs: list[str],
        payload: dict,
        trust: str = "unverified",
        tokens: int = 0,
    ) -> int:
        with self.conn:
            cur = self.conn.execute(
                """
                INSERT INTO swarm_msg
                (msg_id, run_id, ts, from_agent, to_agent, topic, type, cell_id, round, refs_json, payload_json, trust, tokens)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    msg_id, run_id, time.time(), from_agent, to_agent, topic, msg_type,
                    cell_id, round_no, json.dumps(refs), json.dumps(payload), trust, tokens
                )
            )
            return cur.lastrowid or 0

    def get_msgs(self, run_id: str, topic: Optional[str] = None, limit: int = 100) -> List[dict]:
        if topic:
            cur = self.conn.execute(
                "SELECT * FROM swarm_msg WHERE run_id = ? AND topic = ? ORDER BY seq ASC LIMIT ?",
                (run_id, topic, limit)
            )
        else:
            cur = self.conn.execute(
                "SELECT * FROM swarm_msg WHERE run_id = ? ORDER BY seq ASC LIMIT ?",
                (run_id, limit)
            )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r["refs"] = json.loads(r.get("refs_json") or "[]")
            r["payload"] = json.loads(r.get("payload_json") or "{}")
        return rows
