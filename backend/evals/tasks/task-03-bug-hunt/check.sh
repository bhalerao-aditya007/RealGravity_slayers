#!/usr/bin/env bash
set -euo pipefail
WORK_DIR="${1:-.}"
cd "$WORK_DIR"

# Run tests
python3 -m pytest python_pkg/tests/ -v

# Ensure test was not deleted or altered to trivially pass
grep 'assert process_data("abc", 5) == "cba:8"' python_pkg/tests/test_core.py >/dev/null 2>&1
