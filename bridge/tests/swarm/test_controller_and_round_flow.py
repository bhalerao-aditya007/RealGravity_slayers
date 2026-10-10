import pytest
from deskmates_bridge.swarm.controller import SwarmController
from deskmates_bridge.swarm.store.repo import SwarmRepository


@pytest.mark.asyncio
async def test_full_deliberative_flow_end_to_end():
    repo = SwarmRepository(":memory:")
    events_log = []
    ctrl = SwarmController(
        run_id="run_delib_1",
        n=10,
        task_kind="deliberative",
        privacy_mode="free_with_redaction",
        repo=repo,
        on_event=lambda ev, data: events_log.append((ev, data)),
    )

    report = await ctrl.run_deliberation(
        goal="Design high-throughput event processing architecture",
        constraints=["Zero data loss", "Sub-10ms p99"],
    )

    assert ctrl.state == "DONE"
    assert report["run_id"] == "run_delib_1"
    assert "synthesis" in report
    assert "tally" in report
    assert report["verifiability_badge"] == "partial"

    # Verify events were fired
    emitted_types = [e[0] for e in events_log]
    assert "swarm.run_started" in emitted_types
    assert "swarm.phase" in emitted_types
    assert "swarm.frame" in emitted_types
    assert "swarm.proposal" in emitted_types
    assert "swarm.cluster" in emitted_types
    assert "swarm.critique" in emitted_types
    assert "swarm.vote" in emitted_types
    assert "swarm.tally" in emitted_types
    assert "swarm.synthesis" in emitted_types
    assert "swarm.report_ready" in emitted_types


@pytest.mark.asyncio
async def test_full_build_flow_end_to_end():
    repo = SwarmRepository(":memory:")
    events_log = []
    ctrl = SwarmController(
        run_id="run_build_1",
        n=10,
        task_kind="build",
        privacy_mode="free_with_redaction",
        repo=repo,
        on_event=lambda ev, data: events_log.append((ev, data)),
    )

    report = await ctrl.run_deliberation(
        goal="Implement data validation utilities",
    )

    assert ctrl.state == "DONE"
    assert "cell_patches" in report
    assert report["verifiability_badge"] == "high"

    # Verify SQLite records
    run_record = repo.get_run("run_build_1")
    assert run_record is not None
    assert run_record["state"] == "DONE"

    proposals = repo.get_proposals("run_build_1")
    assert len(proposals) == 10

    votes = repo.get_votes("run_build_1")
    assert len(votes) == 10
