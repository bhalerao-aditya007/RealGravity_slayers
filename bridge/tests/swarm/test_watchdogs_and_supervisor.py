import time
import pytest
from deskmates_bridge.swarm.supervisor.arbiter import SupervisorArbiter
from deskmates_bridge.swarm.supervisor.directives import SwarmDirective
from deskmates_bridge.swarm.supervisor.watchdogs import WatchdogIncident, WatchdogManager


def test_watchdogs_scope_and_stall():
    incidents = []
    wm = WatchdogManager(stall_timeout_s=0.1, on_incident=lambda i: incidents.append(i))

    # Scope violation
    inc_scope = wm.check_scope_violation(["secrets/pass.key"], ["src/app.py"], "cell_1")
    assert inc_scope is not None
    assert inc_scope.incident_type == "SCOPE_VIOLATION"

    # Stall check
    wm.last_activity_ts = time.time() - 0.2
    inc_stall = wm.check_stall()
    assert inc_stall is not None
    assert inc_stall.incident_type == "STALL"

    assert len(incidents) == 2


def test_directive_validation():
    # Valid directive
    d_valid = SwarmDirective(
        type="RESPAWN_WITH_HINT",
        args={"agent": "coder_1", "hint": "Check edge cases with empty strings."},
        rationale="Agent stuck in loop",
    )
    assert d_valid.validate_executable({"coder_1"}, {"c_1"}) is True

    # Invalid entity reference
    d_invalid = SwarmDirective(
        type="REASSIGN",
        args={"agent": "non_existent_agent", "cell": "c_1"},
        rationale="Rebalancing",
    )
    assert d_invalid.validate_executable({"coder_1"}, {"c_1"}) is False


@pytest.mark.asyncio
async def test_supervisor_degraded_mode_fallback():
    # Supervisor with no LLM caller operates in degraded mode with deterministic directives
    arbiter = SupervisorArbiter(llm_caller=None)
    inc = WatchdogIncident("SCOPE_VIOLATION", "cell_1", "File outside write-set modified")

    directive = await arbiter.arbitrate_incident(inc, {}, {"c1"}, {"cell_1"})
    assert directive.type == "REJECT_AND_REWORK"
    assert "rejection" in directive.rationale.lower()
