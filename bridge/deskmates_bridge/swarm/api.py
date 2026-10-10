"""
FastAPI REST and WebSocket Router for Swarm Mode API additions (§15).
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from pathlib import Path
import time
from typing import Any, Dict, List, Literal, Optional
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from .controller import SwarmController
from .rounds.estimator import RunEstimator
from .scheduler.admission import AdmissionController
from .scheduler.planner_capacity import CapacityMap
from .store.repo import SwarmRepository

api_router = APIRouter()

# In-memory controllers and repo
GLOBAL_REPO = SwarmRepository()
GLOBAL_CAPACITY_MAP = CapacityMap()
ACTIVE_RUNS: Dict[str, SwarmController] = {}
WS_CLIENTS: List[WebSocket] = []


# Request Models
class SwarmRunRequest(BaseModel):
    mode: Literal["monolithic", "swarm", "office"] = "swarm"
    goal: str = "Decompose and execute objective."
    swarm_size: Optional[int] = None
    swarm: Optional[Dict[str, Any]] = None
    model: Optional[str] = None
    profile: Optional[str] = None
    options: Optional[Dict[str, Any]] = None


class ConsentRequest(BaseModel):
    accepted_providers: List[str]


class SteerRequest(BaseModel):
    type: Literal["pause", "resume", "cancel", "hint", "kill_agent", "raise_n_cell", "reduce_active"]
    args: Optional[Dict[str, Any]] = None


class FrameApproveRequest(BaseModel):
    approved: bool = True
    edits: Optional[Dict[str, Any]] = None


# Endpoints
@api_router.get("/api/swarm/estimate")
def get_swarm_estimate(
    n: int = Query(10, ge=10, le=50),
    kind: str = Query("deliberative"),
    cells: int = Query(0, ge=0),
    privacy: str = Query("free_with_redaction"),
):
    estimate = RunEstimator.calculate_estimate(
        n=n,
        task_kind=kind,
        cells_count=cells,
        capacity_map=GLOBAL_CAPACITY_MAP,
    )
    return estimate.to_dict()


@api_router.get("/api/models")
def get_models():
    """Return catalog of available models loaded dynamically from config/models.yaml."""
    models_path = Path(__file__).resolve().parents[3] / "config" / "models.yaml"
    catalog: List[Dict[str, Any]] = []
    if models_path.is_file():
        try:
            import yaml
            with open(models_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            for m in data.get("models", []):
                mid = m.get("id", "")
                prov = m.get("provider", "openrouter")
                ctx = m.get("context", 32768)
                catalog.append({
                    "id": mid,
                    "label": f"{prov.capitalize()} · {mid.split('/')[-1]}",
                    "provider": prov,
                    "context_tokens": ctx,
                })
        except Exception:
            pass
    if not catalog:
        catalog = [
            {"id": "openrouter/google/gemma-4-31b-it:free", "label": "OpenRouter · Gemma 4 31B (manager default)", "provider": "openrouter", "context_tokens": 128000},
            {"id": "openrouter/qwen/qwen3.8-27b:free", "label": "OpenRouter · Qwen 3.8 27B (coder)", "provider": "openrouter", "context_tokens": 128000},
            {"id": "openrouter/cohere/north-mini-code:free", "label": "OpenRouter · Cohere North Mini Code", "provider": "openrouter", "context_tokens": 32000},
            {"id": "openrouter/nvidia/nemotron-3.5-lightning:free", "label": "OpenRouter · Nemotron 3.5 Lightning", "provider": "openrouter", "context_tokens": 128000},
            {"id": "groq/openai/gpt-oss-120b", "label": "Groq · GPT-OSS 120B", "provider": "groq", "context_tokens": 8000},
            {"id": "groq/qwen/qwen3.8-27b", "label": "Groq · Qwen 3.8 27B", "provider": "groq", "context_tokens": 8000},
            {"id": "groq/openai/gpt-oss-20b", "label": "Groq · GPT-OSS 20B (fast)", "provider": "groq", "context_tokens": 8000},
            {"id": "nvidia/llama-3.1-nemotron-70b-instruct", "label": "NVIDIA NIM · Nemotron 70B", "provider": "nvidia", "context_tokens": 128000},
            {"id": "nvidia/mistralai/codestral-22b-instruct-v0.1", "label": "NVIDIA NIM · Codestral 22B", "provider": "nvidia", "context_tokens": 32000},
            {"id": "nvidia/deepseek-ai/deepseek-v4.1-flash", "label": "NVIDIA NIM · DeepSeek V4.1 Flash", "provider": "nvidia", "context_tokens": 128000},
            {"id": "go/deepseek-v4-flash", "label": "OpenCode Go · DeepSeek V4 Flash", "provider": "go", "context_tokens": 128000},
            {"id": "go/glm-5.3-flash", "label": "OpenCode Go · GLM 5.3 Flash", "provider": "go", "context_tokens": 128000},
        ]
    return catalog


@api_router.post("/api/tasks")
@api_router.post("/runs")
@api_router.post("/api/runs")
async def create_task(req: SwarmRunRequest):
    run_id = f"run_{int(time.time() * 1000)}"
    swarm_opts = req.swarm or (req.options.get("swarm", {}) if req.options else {})
    size = req.swarm_size or (req.options.get("swarm_size") if req.options else None) or int(swarm_opts.get("size", 10))
    kind = str(swarm_opts.get("task_kind", "deliberative"))
    privacy = str(swarm_opts.get("privacy_mode", "free_with_redaction"))
    root = str(swarm_opts.get("root", "."))
    effective_mode = (req.options.get("mode") if req.options else None) or req.mode

    controller = SwarmController(
        run_id=run_id,
        n=size,
        task_kind=kind,
        privacy_mode=privacy,
        root_path=root,
        repo=GLOBAL_REPO,
        capacity_map=GLOBAL_CAPACITY_MAP,
        on_event=broadcast_event,
    )
    ACTIVE_RUNS[run_id] = controller
    controller.initialize(topic=req.goal)

    # Pre-record estimate
    est = RunEstimator.calculate_estimate(n=size, task_kind=kind, capacity_map=GLOBAL_CAPACITY_MAP)
    GLOBAL_REPO.record_estimate(
        run_id=run_id,
        n=size,
        task_kind=kind,
        calls_planned=est.planned_calls,
        tokens_planned=est.planned_tokens,
        time_low_s=est.time_low_s,
        time_high_s=est.time_high_s,
        cooldown_pressure=est.cooldown_pressure,
        profile_age_s=est.profile_age_s,
    )

    if effective_mode == "swarm":
        asyncio.create_task(controller.run_deliberation(req.goal))

    return {"task_id": run_id, "run_id": run_id, "mode": effective_mode, "status": controller.state}


@api_router.get("/api/swarm/{run_id}/admission")
def get_admission(run_id: str):
    ctrl = ACTIVE_RUNS.get(run_id)
    n = ctrl.n if ctrl else 10
    admit_ctrl = AdmissionController(GLOBAL_CAPACITY_MAP)
    res = admit_ctrl.evaluate(n=n)
    return res.__dict__


@api_router.post("/api/swarm/{run_id}/consent")
def submit_consent(run_id: str, consent: ConsentRequest):
    broadcast_event("swarm.consent", {"run_id": run_id, "accepted": consent.accepted_providers})
    return {"status": "ok", "accepted": consent.accepted_providers}


@api_router.post("/api/swarm/{run_id}/steer")
def steer_swarm(run_id: str, steer: SteerRequest):
    ctrl = ACTIVE_RUNS.get(run_id)
    if not ctrl:
        raise HTTPException(status_code=404, detail="Run not found")
    ctrl.steer(steer.type, steer.args)
    return {"status": "ok", "state": ctrl.state}


@api_router.get("/api/swarm/{run_id}/board")
def get_board(run_id: str):
    ctrl = ACTIVE_RUNS.get(run_id)
    cells = GLOBAL_REPO.get_cells(run_id)
    seats = GLOBAL_REPO.get_seats(run_id)
    facts = GLOBAL_REPO.get_facts(run_id)
    return {
        "run_id": run_id,
        "state": ctrl.state if ctrl else "UNKNOWN",
        "cells": cells,
        "seats": seats,
        "facts": facts,
    }


@api_router.get("/api/swarm/{run_id}/egress")
def get_egress_audit(run_id: str):
    audits = GLOBAL_REPO.get_egress_audits(run_id)
    return {"run_id": run_id, "audits": audits}


@api_router.get("/api/providers/health")
def get_providers_health():
    buckets = []
    for b in GLOBAL_CAPACITY_MAP.buckets.values():
        buckets.append({
            "provider": b.provider,
            "model": b.model,
            "state": b.state,
            "rpm": b.rpm,
            "tpm": b.tpm,
            "quota_group": b.quota_group,
        })
    return {"buckets": buckets}


@api_router.post("/api/providers/profile")
async def trigger_profile():
    return {"status": "profiled", "ts": time.time()}


@api_router.post("/api/swarm/{run_id}/frame/approve")
def approve_frame(run_id: str, app: FrameApproveRequest):
    broadcast_event("swarm.frame", {"run_id": run_id, "approved": app.approved})
    return {"status": "ok", "approved": app.approved}


@api_router.get("/api/swarm/{run_id}/phase")
def get_phase_state(run_id: str):
    phases = GLOBAL_REPO.get_phases(run_id)
    est = GLOBAL_REPO.get_estimate(run_id)
    return {"run_id": run_id, "phases": phases, "estimate": est}


@api_router.get("/api/swarm/{run_id}/ideas")
def get_ideas(run_id: str):
    proposals = GLOBAL_REPO.get_proposals(run_id)
    clusters = GLOBAL_REPO.get_clusters(run_id)
    critiques = GLOBAL_REPO.get_critiques(run_id)
    votes = GLOBAL_REPO.get_votes(run_id)
    return {
        "run_id": run_id,
        "proposals": proposals,
        "clusters": clusters,
        "critiques": critiques,
        "votes": votes,
    }


# WebSockets fan-out
@api_router.websocket("/ws/events")
async def websocket_events(websocket: WebSocket, run_id: Optional[str] = None):
    await websocket.accept()
    WS_CLIENTS.append(websocket)
    try:
        while True:
            # Keep-alive receive
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in WS_CLIENTS:
            WS_CLIENTS.remove(websocket)


GLOBAL_SEQ = 0
GLOBAL_EVENT_BUFFER: Dict[str, List[Dict[str, Any]]] = {}


def broadcast_event(event_name: str, payload: dict):
    global GLOBAL_SEQ
    GLOBAL_SEQ += 1
    run_id = str(payload.get("run_id") or "run")
    now_iso = datetime.now(timezone.utc).isoformat()
    envelope = {
        "seq": GLOBAL_SEQ,
        "run_id": run_id,
        "ts_real": now_iso,
        "ts_sim": "09:00",
        "type": event_name,
        "agent_id": payload.get("agent_id") or payload.get("moderator_id"),
        "task_id": payload.get("task_id"),
        "payload": payload,
    }
    if run_id not in GLOBAL_EVENT_BUFFER:
        GLOBAL_EVENT_BUFFER[run_id] = []
    GLOBAL_EVENT_BUFFER[run_id].append(envelope)
    if len(GLOBAL_EVENT_BUFFER[run_id]) > 500:
        GLOBAL_EVENT_BUFFER[run_id].pop(0)

    for client in list(WS_CLIENTS):
        try:
            asyncio.create_task(client.send_json(envelope))
        except Exception:
            pass


@api_router.get("/api/runs/{run_id}/events")
def get_run_events(run_id: str, since_seq: int = 0, limit: int = 100):
    events = GLOBAL_EVENT_BUFFER.get(run_id, [])
    filtered = [e for e in events if e.get("seq", 0) > since_seq][:limit]
    next_seq = filtered[-1]["seq"] if filtered else since_seq
    return {"events": filtered, "next_seq": next_seq}

