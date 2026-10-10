import math
import pytest
from deskmates_bridge.swarm.rounds.estimator import RunEstimator
from deskmates_bridge.swarm.scheduler.admission import AdmissionController
from deskmates_bridge.swarm.scheduler.planner_capacity import CapacityBucket, CapacityMap


def test_estimator_deliberative_protocol_exact_formulas():
    # Table from §4.6:
    # N=10: base 37, planned 43, tokens ~120k
    # N=20: base 68, planned 78, tokens ~210k
    # N=30: base 99, planned 114, tokens ~290k
    # N=40: base 130, planned 150, tokens ~380k
    # N=50: base 161, planned 185, tokens ~460k
    cmap = CapacityMap()
    cmap.add_bucket(CapacityBucket("groq", "gpt-oss", "g1", rpm=30, tpm=10000, tpd_remaining=2000000))

    est10 = RunEstimator.calculate_estimate(10, "deliberative", capacity_map=cmap)
    assert est10.planned_calls == 43
    assert 100_000 <= est10.planned_tokens <= 150_000

    est20 = RunEstimator.calculate_estimate(20, "deliberative", capacity_map=cmap)
    assert est20.planned_calls == 78
    assert 180_000 <= est20.planned_tokens <= 250_000

    est30 = RunEstimator.calculate_estimate(30, "deliberative", capacity_map=cmap)
    assert est30.planned_calls == 114
    assert 250_000 <= est30.planned_tokens <= 330_000

    est40 = RunEstimator.calculate_estimate(40, "deliberative", capacity_map=cmap)
    assert est40.planned_calls == 150
    assert 340_000 <= est40.planned_tokens <= 420_000

    est50 = RunEstimator.calculate_estimate(50, "deliberative", capacity_map=cmap)
    assert est50.planned_calls == 185
    assert 420_000 <= est50.planned_tokens <= 500_000


def test_estimator_build_task_adds_cells_calls():
    # Build task adds 1.2 * cells * 6 + 4 calls
    cmap = CapacityMap()
    est = RunEstimator.calculate_estimate(50, "build", cells_count=6, capacity_map=cmap)
    # 185 delib + round(1.2 * 36 + 4) = 185 + 47 = 232 calls
    assert est.build_calls == 47
    assert est.planned_calls == 185 + 47


def test_admission_controller_fits_and_does_not_fit():
    cmap = CapacityMap()
    # Generous capacity
    cmap.add_bucket(CapacityBucket("groq", "m1", "g1", rpm=60, tpm=50000, tpd_remaining=10_000_000))
    admit = AdmissionController(cmap)
    res_fits = admit.evaluate(n=30)
    assert res_fits.verdict == "FITS"
    assert res_fits.max_fitting_n == 50

    # Exhausted capacity
    cmap_tight = CapacityMap()
    cmap_tight.add_bucket(CapacityBucket("groq", "m1", "g1", rpm=5, tpm=500, tpd_remaining=50_000))
    admit_tight = AdmissionController(cmap_tight)
    res_tight = admit_tight.evaluate(n=50)
    assert res_tight.verdict == "DOES_NOT_FIT"
    assert any("exceeds available daily reserve" in w for w in res_tight.warnings)


def test_admission_shared_quota_group_warning():
    cmap = CapacityMap()
    cmap.add_bucket(CapacityBucket("groq", "m1", "shared_org_A", rpm=30, tpm=10000))
    cmap.add_bucket(CapacityBucket("groq", "m2", "shared_org_A", rpm=30, tpm=10000))
    admit = AdmissionController(cmap)
    res = admit.evaluate(n=10)
    assert any("shared_org_A" in w for w in res.warnings)
