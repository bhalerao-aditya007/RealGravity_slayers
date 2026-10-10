"""
Cross-examination matrix and CodeT-style dual agreement verification.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Set


@dataclass
class CrossExamMatrix:
    candidates: List[str]  # cand_ids
    tests: List[str]       # test_ids
    results: Dict[str, Dict[str, bool]] = field(default_factory=dict)  # cand_id -> test_id -> bool
    trusted_tests: Set[str] = field(default_factory=set)
    quarantined_tests: Set[str] = field(default_factory=set)


class CrossExamEngine:
    def __init__(self, test_runner: Optional[Callable[[str, str], bool]] = None) -> None:
        self.test_runner = test_runner or (lambda code, test: True)

    def evaluate_matrix(
        self,
        candidate_codes: Dict[str, str],            # cand_id -> code
        candidate_families: Dict[str, str],         # cand_id -> family
        candidate_tests: Dict[str, str],            # test_id -> test_code
        approved_contract_tests: Set[str],          # test_ids approved in contract
    ) -> CrossExamMatrix:
        cand_ids = list(candidate_codes.keys())
        test_ids = list(candidate_tests.keys())
        matrix = CrossExamMatrix(candidates=cand_ids, tests=test_ids)

        # 1. Run all candidate codes against all tests
        for c_id, code in candidate_codes.items():
            matrix.results[c_id] = {}
            for t_id, t_code in candidate_tests.items():
                passed = self.test_runner(code, t_code)
                matrix.results[c_id][t_id] = passed

        # 2. CodeT Dual Agreement & Quarantine logic (§10.2)
        for t_id in test_ids:
            if t_id in approved_contract_tests:
                matrix.trusted_tests.add(t_id)
                continue

            passing_cands = [c_id for c_id in cand_ids if matrix.results[c_id].get(t_id, False)]
            passing_families = set(candidate_families.get(c_id, "") for c_id in passing_cands)

            if len(passing_cands) == 0:
                # All candidates failed this test -> quarantine test (likely bad test)
                matrix.quarantined_tests.add(t_id)
            elif len(passing_cands) >= 2 and len(passing_families) >= 2:
                # >=2 candidates from >=2 families passed it -> trusted
                matrix.trusted_tests.add(t_id)
            else:
                # Not enough dual agreement
                pass

        return matrix

    def compute_candidate_pass_rates(self, matrix: CrossExamMatrix) -> Dict[str, float]:
        trusted = matrix.trusted_tests
        rates: Dict[str, float] = {}
        if not trusted:
            return {c_id: 1.0 for c_id in matrix.candidates}

        for c_id in matrix.candidates:
            passed_cnt = sum(1 for t_id in trusted if matrix.results.get(c_id, {}).get(t_id, False))
            rates[c_id] = round(passed_cnt / len(trusted), 3)

        return rates
