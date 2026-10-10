#!/usr/bin/env bash
set -euo pipefail
WORK_DIR="${1:-.}"
cd "$WORK_DIR"

# Run tests
python3 -m pytest python_pkg/tests/ -v

# Verify export in __init__.py
python3 -c "from python_pkg import average; assert callable(average); assert average([2, 4, 6]) == 4.0"
