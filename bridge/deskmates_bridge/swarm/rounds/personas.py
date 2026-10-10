"""
Persona catalog, seat allocations per N, ring geometry, and local distinctness checking.
"""
from __future__ import annotations
import math
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from ..config import PersonaCard, load_personas


@dataclass
class SwarmSeat:
    seat_id: str
    run_id: str
    seat_no: int
    persona_id: str
    persona_name: str
    initials: str
    icon: str
    color: str
    lens: str
    output_rubric: str
    function_role: str
    model: str
    family: str
    temperature: float
    ring: int = 1
    angle: float = 0.0


# Exact seat counts by N from §6.4 (verified sum = N)
PERSONA_COUNTS_BY_N: Dict[int, Dict[str, int]] = {
    10: {
        "domain_expert": 1, "skeptic": 1, "risk_analyst": 1, "user_advocate": 1,
        "pragmatic_engineer": 1, "security_auditor": 1, "systems_architect": 1,
        "test_engineer": 1, "devils_advocate": 1, "cost_latency_hawk": 1,
        "prior_art_researcher": 0, "maintainer": 0
    },
    20: {
        "domain_expert": 3, "skeptic": 3, "risk_analyst": 2, "user_advocate": 2,
        "pragmatic_engineer": 2, "security_auditor": 2, "systems_architect": 1,
        "test_engineer": 1, "devils_advocate": 1, "cost_latency_hawk": 1,
        "prior_art_researcher": 1, "maintainer": 1
    },
    30: {
        "domain_expert": 4, "skeptic": 4, "risk_analyst": 3, "user_advocate": 3,
        "pragmatic_engineer": 3, "security_auditor": 2, "systems_architect": 2,
        "test_engineer": 2, "devils_advocate": 2, "cost_latency_hawk": 2,
        "prior_art_researcher": 2, "maintainer": 1
    },
    40: {
        "domain_expert": 5, "skeptic": 5, "risk_analyst": 4, "user_advocate": 4,
        "pragmatic_engineer": 4, "security_auditor": 3, "systems_architect": 3,
        "test_engineer": 3, "devils_advocate": 3, "cost_latency_hawk": 2,
        "prior_art_researcher": 2, "maintainer": 2
    },
    50: {
        "domain_expert": 6, "skeptic": 6, "risk_analyst": 5, "user_advocate": 5,
        "pragmatic_engineer": 5, "security_auditor": 4, "systems_architect": 4,
        "test_engineer": 4, "devils_advocate": 4, "cost_latency_hawk": 3,
        "prior_art_researcher": 2, "maintainer": 2
    },
}


class PersonaSeatAllocator:
    def __init__(self, personas: Optional[List[PersonaCard]] = None) -> None:
        self.personas = {p.id: p for p in (personas or load_personas())}

    def allocate_seats(
        self,
        run_id: str,
        n: int,
        available_families: Optional[List[str]] = None,
        available_models: Optional[Dict[str, str]] = None,  # family -> model_id
    ) -> List[SwarmSeat]:
        counts = PERSONA_COUNTS_BY_N.get(n)
        if not counts:
            closest_n = min(PERSONA_COUNTS_BY_N.keys(), key=lambda k: abs(k - n))
            counts = PERSONA_COUNTS_BY_N[closest_n]

        default_model_map = {
            "qwen": "openrouter/qwen/qwen3.8-27b:free",
            "gpt-oss": "groq/openai/gpt-oss-20b",
            "llama": "nvidia/llama-3.1-nemotron-70b-instruct",
            "mistral": "nvidia/mistralai/codestral-22b-instruct-v0.1",
            "deepseek": "go/deepseek-v4-flash",
        }
        try:
            from pathlib import Path
            import yaml
            models_path = Path(__file__).resolve().parents[3] / "config" / "models.yaml"
            if models_path.is_file():
                with open(models_path, "r", encoding="utf-8") as f:
                    cfg = yaml.safe_load(f) or {}
                for m in cfg.get("models", []):
                    mid = m.get("id", "")
                    for fam in ("qwen", "gpt-oss", "llama", "mistral", "deepseek"):
                        if fam in mid.lower():
                            default_model_map[fam] = mid
        except Exception:
            pass

        families = available_families or list(default_model_map.keys())
        model_map = available_models or default_model_map

        temps = [0.2, 0.5, 0.8]
        seats: List[SwarmSeat] = []
        seat_no = 1

        # Calculate rings: if N > 20, ring 1 (inner) has 20 seats, ring 2 (outer) has rest
        inner_cap = 20 if n > 20 else n
        outer_cap = n - inner_cap

        for p_id, count in counts.items():
            card = self.personas.get(p_id)
            if not card:
                continue

            for i in range(count):
                family = families[(seat_no - 1) % len(families)]
                model = model_map.get(family, f"{family}-default")
                temp = temps[i % len(temps)]

                # Geometry calculation
                if seat_no <= inner_cap:
                    ring = 1
                    angle = (2 * math.pi * (seat_no - 1)) / max(inner_cap, 1)
                else:
                    ring = 2
                    outer_idx = seat_no - inner_cap - 1
                    angle = (2 * math.pi * outer_idx) / max(outer_cap, 1)

                seat = SwarmSeat(
                    seat_id=f"seat_{seat_no}",
                    run_id=run_id,
                    seat_no=seat_no,
                    persona_id=card.id,
                    persona_name=card.name,
                    initials=card.initials,
                    icon=card.icon,
                    color=card.color,
                    lens=card.lens,
                    output_rubric=card.output_rubric,
                    function_role=card.preferred_build_role,
                    model=model,
                    family=family,
                    temperature=temp,
                    ring=ring,
                    angle=angle,
                )
                seats.append(seat)
                seat_no += 1

        return seats


def compute_distinctness(proposals: List[dict]) -> Tuple[float, bool]:
    """
    Computes pairwise TF-IDF cosine similarity of proposals (local, free).
    Returns (mean_similarity, is_collapsed).
    If mean pairwise similarity > 0.80, emits PERSONA_COLLAPSE.
    """
    if len(proposals) < 2:
        return 0.0, False

    # Extract words
    def tokenize(text: str) -> List[str]:
        return re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())

    docs = []
    for p in proposals:
        text = f"{p.get('title', '')} {p.get('body', '')} {p.get('approach', '')} {' '.join(p.get('assumptions', []))}"
        docs.append(tokenize(text))

    # Compute term frequencies
    all_vocab = sorted(list(set(w for doc in docs for w in doc)))
    if not all_vocab:
        return 0.0, False

    # Document frequency
    df = {w: sum(1 for doc in docs if w in doc) for w in all_vocab}
    num_docs = len(docs)

    # Compute vectors
    vectors = []
    for doc in docs:
        tf = {}
        for w in doc:
            tf[w] = tf.get(w, 0) + 1
        vec = []
        for w in all_vocab:
            idf = math.log((num_docs + 1) / (df[w] + 1)) + 1
            vec.append(tf.get(w, 0) * idf)
        # Normalize
        norm = math.sqrt(sum(v * v for v in vec)) or 1e-9
        vectors.append([v / norm for v in vec])

    # Compute pairwise cosines
    similarities = []
    for i in range(num_docs):
        for j in range(i + 1, num_docs):
            dot = sum(a * b for a, b in zip(vectors[i], vectors[j]))
            similarities.append(dot)

    mean_sim = sum(similarities) / len(similarities) if similarities else 0.0
    is_collapsed = mean_sim > 0.80
    return round(mean_sim, 3), is_collapsed
