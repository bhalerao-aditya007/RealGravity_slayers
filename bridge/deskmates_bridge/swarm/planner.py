"""
Task Planner: Decomposes objectives into DAG and executable Cells with acceptance contracts.
Includes PathGuard ensuring sandbox/tool operations never escape repo boundaries.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional
from .config import BudgetsConfig


class PathGuardViolation(Exception):
    """Raised when an agent attempts to access or modify paths outside repo root."""


def in_scope(root: Path | str, target: Path | str) -> bool:
    """Verifies target path is strictly within root directory (resolves .., symlinks, junctions)."""
    try:
        r = Path(root).resolve()
        t = (r / target).resolve() if not Path(target).is_absolute() else Path(target).resolve()
        return t == r or r in t.parents
    except Exception:
        return False


def assert_path_in_scope(root: Path | str, target: Path | str) -> Path:
    if not in_scope(root, target):
        raise PathGuardViolation(f"Path '{target}' escapes root '{root}'")
    r = Path(root).resolve()
    return (r / target).resolve() if not Path(target).is_absolute() else Path(target).resolve()


@dataclass
class SwarmCell:
    cell_id: str
    run_id: str
    title: str
    difficulty: float = 0.5
    verifiable: bool = True
    write_set: List[str] = field(default_factory=list)
    acceptance_tests: List[str] = field(default_factory=list)
    contract: Dict[str, Any] = field(default_factory=dict)
    state: str = "PENDING"
    token_cap: int = BudgetsConfig().cell_tokens


class TaskPlanner:
    def __init__(self, root_path: str | Path) -> None:
        self.root = Path(root_path).resolve()

    def plan_cells_from_synthesis(
        self,
        run_id: str,
        goal: str,
        synthesis_approach: Dict[str, Any],
        target_files: Optional[List[str]] = None,
    ) -> List[SwarmCell]:
        """Creates non-overlapping cells with write-sets and contracts."""
        files = target_files or ["src/main.py"]
        cells: List[SwarmCell] = []

        # Validate paths
        for f in files:
            assert_path_in_scope(self.root, f)

        # Decompose into cells based on file boundaries
        for idx, file_path in enumerate(files):
            cell_id = f"c_{idx + 1}"
            title = f"Implement changes in {file_path}"
            cell = SwarmCell(
                cell_id=cell_id,
                run_id=run_id,
                title=title,
                difficulty=0.5,
                verifiable=True,
                write_set=[file_path],
                acceptance_tests=[f"test_contract_{cell_id}_acceptance"],
                contract={
                    "cell_id": cell_id,
                    "title": title,
                    "write_set": [file_path],
                    "interface": f"Updates to {file_path}",
                    "acceptance_tests": [f"test_contract_{cell_id}_acceptance"],
                },
            )
            cells.append(cell)

        return cells
