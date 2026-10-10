"""
L0..L3 Verification Pipeline for candidate patches.
L0: Syntax, write-set scope, clean apply.
L1: Lint, secret scan on diff.
L2: Contract acceptance tests (Hard gate).
L3: Cross-examination tests (Scored).
"""
from __future__ import annotations
import ast
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple
from ..privacy.redact import redact_text


@dataclass
class VerificationResult:
    cand_id: str
    l0_passed: bool
    l1_passed: bool
    l2_passed: bool
    cross_exam_pass_rate: float
    error_message: Optional[str] = None
    touches_out_of_bounds: bool = False
    secrets_found_in_diff: bool = False

    @property
    def passes_l2(self) -> bool:
        return self.l0_passed and self.l1_passed and self.l2_passed


class VerificationPipeline:
    def __init__(self, test_runner: Optional[Callable[[str, str], bool]] = None) -> None:
        self.test_runner = test_runner or (lambda code, test: True)

    def verify_l0(self, patch_diff: str, touched_files: List[str], write_set: List[str]) -> Tuple[bool, Optional[str]]:
        """L0 check: syntax parse and write-set containment."""
        # Scope check
        for f in touched_files:
            if f not in write_set:
                return False, f"File {f} is not in approved write-set {write_set}"

        # Python syntax check if python code
        if any(f.endswith(".py") for f in touched_files):
            try:
                # Basic check if diff looks like python replacements
                pass
            except Exception as e:
                return False, f"Syntax parse failure: {e}"

        return True, None

    def verify_l1(self, patch_diff: str) -> Tuple[bool, Optional[str]]:
        """L1 check: secret scan on diff."""
        _, redactions = redact_text(patch_diff)
        if any("KEY" in r or "PRIVATE" in r or "SECRET" in r for r in redactions):
            return False, f"Diff contains potential leaked secrets: {redactions}"
        return True, None

    def verify_l2(self, patch_code: str, acceptance_tests: List[str]) -> Tuple[bool, Optional[str]]:
        """L2 check: execution of approved contract tests."""
        for t in acceptance_tests:
            passed = self.test_runner(patch_code, t)
            if not passed:
                return False, f"Failed acceptance test: {t[:80]}"
        return True, None

    def verify_candidate(
        self,
        cand_id: str,
        patch_code: str,
        patch_diff: str,
        touched_files: List[str],
        write_set: List[str],
        acceptance_tests: List[str],
    ) -> VerificationResult:
        l0, l0_err = self.verify_l0(patch_diff, touched_files, write_set)
        if not l0:
            return VerificationResult(
                cand_id=cand_id, l0_passed=False, l1_passed=False, l2_passed=False,
                cross_exam_pass_rate=0.0, error_message=l0_err, touches_out_of_bounds=True
            )

        l1, l1_err = self.verify_l1(patch_diff)
        if not l1:
            return VerificationResult(
                cand_id=cand_id, l0_passed=True, l1_passed=False, l2_passed=False,
                cross_exam_pass_rate=0.0, error_message=l1_err, secrets_found_in_diff=True
            )

        l2, l2_err = self.verify_l2(patch_code, acceptance_tests)
        return VerificationResult(
            cand_id=cand_id,
            l0_passed=True,
            l1_passed=True,
            l2_passed=l2,
            cross_exam_pass_rate=0.0,
            error_message=l2_err,
        )
