import pytest
from deskmates_bridge.swarm.controller import SwarmController


@pytest.mark.asyncio
async def test_benchmark_arms_execution():
    # Evaluates benchmark runners for Swarm vs baselines
    arms = ["A0", "A1", "A2", "S10", "S20"]
    results = {}

    for arm in arms:
        n = 10 if arm == "S10" else (20 if arm == "S20" else 1)
        ctrl = SwarmController(
            run_id=f"bench_{arm}",
            n=n,
            task_kind="deliberative",
        )
        rep = await ctrl.run_deliberation(goal="Benchmark algorithmic problem")
        results[arm] = {
            "status": ctrl.state,
            "winner": rep.get("winning_cluster"),
            "n": n,
        }

    assert all(r["status"] == "DONE" for r in results.values())
    assert results["S20"]["n"] == 20
