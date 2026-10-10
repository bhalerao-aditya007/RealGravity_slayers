#!/usr/bin/env bash
set -euo pipefail
WORK_DIR="${1:-.}"
cd "$WORK_DIR"

# Run tests
python3 -m pytest python_pkg/tests/ -v

# Verify validation code exists
grep -i "TypeError" python_pkg/string_utils.py >/dev/null 2>&1
grep -i "test_reverse_type_error" python_pkg/tests/test_string.py >/dev/null 2>&1
