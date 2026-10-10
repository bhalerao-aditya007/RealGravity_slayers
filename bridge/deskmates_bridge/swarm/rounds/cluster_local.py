"""
Local TF-IDF / MinHash clustering, Outlier Tray preservation, and steward packaging.
"""
from __future__ import annotations
import math
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple


@dataclass
class SwarmClusterGroup:
    id: str
    name: str
    summary: str
    member_ids: List[str]
    family_coverage: float
    seat_share: float
    is_outlier_tray: bool = False
    representative_proposals: List[dict] = field(default_factory=list)


def tokenize(text: str) -> List[str]:
    return re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())


class LocalClusterer:
    def __init__(self, tau: float = 0.55, k_max: int = 8) -> None:
        self.tau = tau
        self.k_max = k_max

    def cluster_proposals(
        self,
        proposals: List[dict],
        seat_families: Optional[Dict[str, str]] = None,
    ) -> List[SwarmClusterGroup]:
        if not proposals:
            return []

        families_map = seat_families or {}
        num_seats = len(proposals)

        # 1. Feature extraction
        docs = []
        for p in proposals:
            text = f"{p.get('title', '')} {p.get('approach', '')} {' '.join(p.get('assumptions', []))}"
            docs.append(tokenize(text))

        vocab = sorted(list(set(w for d in docs for w in d)))
        if not vocab:
            # Trivial fallback
            return [
                SwarmClusterGroup(
                    id="cluster_1",
                    name="Unified Approach",
                    summary="All proposals share equivalent approach.",
                    member_ids=[p.get("proposal_id", f"p_{i}") for i, p in enumerate(proposals)],
                    family_coverage=1.0,
                    seat_share=1.0,
                    representative_proposals=proposals[:2],
                )
            ]

        df = {w: sum(1 for d in docs if w in d) for w in vocab}
        num_docs = len(docs)
        vectors = []
        for d in docs:
            tf = {w: d.count(w) for w in set(d)}
            vec = []
            for w in vocab:
                idf = math.log((num_docs + 1) / (df[w] + 1)) + 1
                vec.append(tf.get(w, 0) * idf)
            norm = math.sqrt(sum(v * v for v in vec)) or 1e-9
            vectors.append([v / norm for v in vec])

        # 2. Agglomerative clustering with threshold tau
        # Start each proposal in its own cluster
        clusters: List[List[int]] = [[i] for i in range(num_docs)]

        def cluster_similarity(c1: List[int], c2: List[int]) -> float:
            sims = []
            for i in c1:
                for j in c2:
                    dot = sum(a * b for a, b in zip(vectors[i], vectors[j]))
                    sims.append(dot)
            return sum(sims) / len(sims) if sims else 0.0

        while len(clusters) > 1:
            best_pair = None
            best_sim = -1.0
            for i in range(len(clusters)):
                for j in range(i + 1, len(clusters)):
                    sim = cluster_similarity(clusters[i], clusters[j])
                    if sim > best_sim:
                        best_sim = sim
                        best_pair = (i, j)

            if best_pair and (best_sim >= self.tau or len(clusters) > self.k_max):
                i, j = best_pair
                merged = clusters[i] + clusters[j]
                clusters = [c for idx, c in enumerate(clusters) if idx not in (i, j)]
                clusters.append(merged)
            else:
                break

        # 3. Identify Outliers
        outlier_indices: List[int] = []
        regular_clusters: List[List[int]] = []

        for c in clusters:
            if len(c) == 1:
                # Singletons with unique assumptions move to Outlier Tray
                outlier_indices.extend(c)
            else:
                regular_clusters.append(c)

        result_clusters: List[SwarmClusterGroup] = []
        c_num = 1

        for c_indices in regular_clusters:
            member_ids = [proposals[idx].get("proposal_id", f"p_{idx}") for idx in c_indices]
            fams = set(families_map.get(proposals[idx].get("seat_id", ""), "fam") for idx in c_indices)
            total_distinct_fams = max(len(set(families_map.values())), 1)
            fam_coverage = min(1.0, len(fams) / total_distinct_fams)
            seat_share = len(c_indices) / max(num_seats, 1)

            rep_props = [proposals[idx] for idx in c_indices[:2]]
            title_sample = proposals[c_indices[0]].get("title", f"Pattern {c_num}")

            result_clusters.append(
                SwarmClusterGroup(
                    id=f"cluster_{c_num}",
                    name=f"Approach: {title_sample}",
                    summary=f"Clustered approaches emphasizing {title_sample}.",
                    member_ids=member_ids,
                    family_coverage=round(fam_coverage, 2),
                    seat_share=round(seat_share, 2),
                    representative_proposals=rep_props,
                )
            )
            c_num += 1

        # 4. Outlier Tray if any outliers exist (§8.4)
        if outlier_indices:
            outlier_ids = [proposals[idx].get("proposal_id", f"p_{idx}") for idx in outlier_indices]
            rep_props = [proposals[idx] for idx in outlier_indices]
            result_clusters.append(
                SwarmClusterGroup(
                    id="cluster_outliers",
                    name="Outlier Ideas Tray",
                    summary="Independent minority ideas with unique architectural assumptions.",
                    member_ids=outlier_ids,
                    family_coverage=0.5,
                    seat_share=len(outlier_indices) / max(num_seats, 1),
                    is_outlier_tray=True,
                    representative_proposals=rep_props,
                )
            )

        return result_clusters
