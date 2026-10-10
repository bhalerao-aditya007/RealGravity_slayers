import pytest
from deskmates_bridge.swarm.verify.cluster import BehavioralClusterer
from deskmates_bridge.swarm.verify.crossexam import CrossExamEngine
from deskmates_bridge.swarm.verify.pipeline import VerificationPipeline
from deskmates_bridge.swarm.verify.score import SelectionScorer


def test_verification_pipeline_l0_l1_l2():
    vp = VerificationPipeline(test_runner=lambda code, test: "assert True" in test)

    # 1. Clean candidate passes L0-L2
    res_clean = vp.verify_candidate(
        cand_id="c1",
        patch_code="x = 1",
        patch_diff="--- a/src/main.py\n+++ b/src/main.py\n@@ -1,1 +1,1 @@\n-x=0\n+x=1\n",
        touched_files=["src/main.py"],
        write_set=["src/main.py"],
        acceptance_tests=["def test(): assert True"],
    )
    assert res_clean.passes_l2 is True

    # 2. Scope escape fails L0
    res_scope = vp.verify_candidate(
        cand_id="c2",
        patch_code="x = 1",
        patch_diff="+x=1",
        touched_files=["outside/secret.py"],
        write_set=["src/main.py"],
        acceptance_tests=["def test(): assert True"],
    )
    assert res_scope.l0_passed is False
    assert res_scope.passes_l2 is False


def test_crossexam_codet_dual_agreement_and_quarantine():
    # Test runner: returns True if test matches candidate expectation
    def runner(code, test):
        if "failing_everywhere" in test:
            return False
        if "cand_1" in code and "test_1" in test:
            return True
        if "cand_2" in code and "test_1" in test:
            return True
        return False

    engine = CrossExamEngine(test_runner=runner)

    candidates = {"cand_1": "code_cand_1", "cand_2": "code_cand_2", "cand_3": "code_cand_3"}
    families = {"cand_1": "qwen", "cand_2": "llama", "cand_3": "mistral"}
    tests = {
        "test_1": "test_1 assert check()",
        "bad_test": "failing_everywhere",
    }

    matrix = engine.evaluate_matrix(candidates, families, tests, approved_contract_tests=set())

    # bad_test was failed by all candidates -> quarantined!
    assert "bad_test" in matrix.quarantined_tests

    # test_1 passed by cand_1 (qwen) and cand_2 (llama) (>=2 cands from >=2 families) -> trusted!
    assert "test_1" in matrix.trusted_tests


def test_selection_scoring_formula():
    scorer = SelectionScorer()
    scores = scorer.score_candidate(
        cand_id="c1",
        cross_exam_pass_rate=1.0,
        cluster_support=0.8,
        critic_score=1.0,
        reliability_prior=1.0,
        diff_lines=20,
        has_scope_violation=False,
    )
    # Expected: 0.40(1.0) + 0.25(0.8) + 0.20(1.0) + 0.10(1.0) = 0.40 + 0.20 + 0.20 + 0.10 = 0.90
    assert pytest.approx(scores.total_score, 0.01) == 0.90
