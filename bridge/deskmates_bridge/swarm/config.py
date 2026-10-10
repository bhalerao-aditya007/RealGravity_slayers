"""
Configuration loaders and schema validation for Swarm Mode.
Loads swarm.yaml, personas.yaml, and providers.yaml.
"""
from __future__ import annotations
import os
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
import yaml
from pydantic import BaseModel, Field


class PersonaCard(BaseModel):
    id: str
    name: str
    initials: str
    icon: str
    color: str
    lens: str
    output_rubric: str
    preferred_build_role: Literal["coder", "tester", "critic", "redteam", "integrator", "judge", "scout", "archivist"] = "coder"


class SupervisorConfig(BaseModel):
    chain: List[str] = Field(default_factory=lambda: ["mistral/large", "openrouter/qwen/qwen3.8-27b:free", "groq/openai/gpt-oss-120b"])
    reserve_pct: int = 15
    policy: Literal["balanced", "strict", "light"] = "balanced"


class RoundsConfig(BaseModel):
    order: List[str] = Field(default_factory=lambda: ["frame", "diverge", "cluster", "critique", "vote", "synthesize"])
    max_repair: int = 3
    initial_candidates: int = 3
    escalate: List[int] = Field(default_factory=lambda: [3, 6, 10])
    overhead_allowance: float = 0.15
    quorum: Dict[str, float] = Field(default_factory=lambda: {
        "frame": 1.0,
        "diverge": 0.85,
        "cluster": 1.0,
        "critique": 0.80,
        "vote": 0.80,
        "synthesize": 1.0,
    })
    timeouts_x_estimate: Dict[str, float] = Field(default_factory=lambda: {"soft": 2.0, "hard": 3.0})
    cluster: Dict[str, Any] = Field(default_factory=lambda: {
        "tau": 0.55,
        "k_max": 8,
        "outlier_tray": True,
        "steward_every": 10,
    })
    critique: Dict[str, Any] = Field(default_factory=lambda: {
        "min_critics": 3,
        "min_personas": 3,
        "min_families": 2,
        "no_self_cluster": True,
    })
    vote: Dict[str, Any] = Field(default_factory=lambda: {
        "top_k": 3,
        "anonymize": True,
        "shuffle": True,
        "early_decision": True,
        "reliability_clamp": [0.5, 1.5],
    })
    synthesize: Dict[str, Any] = Field(default_factory=lambda: {
        "calls": 4,
        "require_coverage": True,
    })


class BudgetsConfig(BaseModel):
    run_tokens: int = 2_000_000
    cell_tokens: int = 150_000
    agent_calls: int = 40
    wallclock_min: int = 90


class MessagingConfig(BaseModel):
    max_payload_tokens: int = 1500
    max_msgs_per_agent_round: int = 6
    fanout: int = 8
    max_debate_exchanges: int = 2


class DiversityConfig(BaseModel):
    min_families_per_cell: int = 3
    temps: List[float] = Field(default_factory=lambda: [0.2, 0.5, 0.8])
    min_families_per_persona: int = 2
    collapse_threshold: float = 0.80


class SelectionConfig(BaseModel):
    weights: Dict[str, float] = Field(default_factory=lambda: {
        "cross": 0.40,
        "cluster": 0.25,
        "critic": 0.20,
        "prior": 0.10,
    })
    tie_epsilon: float = 0.03


class WatchdogsConfig(BaseModel):
    stall_s: float = 120.0
    dup_threshold: int = 3
    budget_warn: float = 0.80
    tick_s: float = 2.0


class WaveConfig(BaseModel):
    slow_start_fraction: float = 0.25
    jitter: float = 0.10
    shuffle_each_round: bool = True


class VisualsConfig(BaseModel):
    wait_to_break_threshold_s: float = 8.0
    coffee_corner_capacity: int = 12
    cosmetic_chatter: str = "templated"


class PrivacySettings(BaseModel):
    default_mode: Literal["strict_local", "no_train_only", "free_with_redaction"] = "free_with_redaction"
    restricted_globs: List[str] = Field(default_factory=lambda: [
        "**/.env*", "**/*.pem", "**/*.key", "**/secrets/**", "**/*credential*", "**/id_rsa*"
    ])
    pseudonymize: bool = True
    egress_allowlist_hosts: List[str] = Field(default_factory=lambda: [
        "api.groq.com", "api.cerebras.ai", "integrate.api.nvidia.com",
        "openrouter.ai", "api.mistral.ai", "generativelanguage.googleapis.com"
    ])


class SwarmSettings(BaseModel):
    sizes: List[int] = Field(default_factory=lambda: [10, 20, 30, 40, 50])
    supervisor: SupervisorConfig = Field(default_factory=SupervisorConfig)
    rounds: RoundsConfig = Field(default_factory=RoundsConfig)
    budgets: BudgetsConfig = Field(default_factory=BudgetsConfig)
    sandbox_slots: int = 3
    messaging: MessagingConfig = Field(default_factory=MessagingConfig)
    diversity: DiversityConfig = Field(default_factory=DiversityConfig)
    selection: SelectionConfig = Field(default_factory=SelectionConfig)
    watchdogs: WatchdogsConfig = Field(default_factory=WatchdogsConfig)
    wave: WaveConfig = Field(default_factory=WaveConfig)
    visuals: VisualsConfig = Field(default_factory=VisualsConfig)


class AppSwarmConfig(BaseModel):
    swarm: SwarmSettings = Field(default_factory=SwarmSettings)
    privacy: PrivacySettings = Field(default_factory=PrivacySettings)


def get_config_dir() -> Path:
    base = Path(__file__).resolve().parent.parent.parent
    cfg_dir = base / "config"
    if cfg_dir.is_dir():
        return cfg_dir
    return Path("config")


def load_personas(path: Optional[Path | str] = None) -> List[PersonaCard]:
    if path is None:
        path = get_config_dir() / "personas.yaml"
    p = Path(path)
    if not p.exists():
        return []
    with open(p, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    items = data.get("personas", [])
    return [PersonaCard(**item) for item in items]


def load_swarm_config(path: Optional[Path | str] = None) -> AppSwarmConfig:
    if path is None:
        path = get_config_dir() / "swarm.yaml"
    p = Path(path)
    if not p.exists():
        return AppSwarmConfig()
    with open(p, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return AppSwarmConfig(**data)
