#!/usr/bin/env bash
set -euo pipefail
WORK_DIR="${1:-.}"
cd "$WORK_DIR"

# Check math_utils.py exists
[ -f "math_utils.py" ] || exit 1
# Check test_math.py exists
[ -f "test_math.py" ] || exit 1

# Run pytest using python3
python3 -m pytest test_math.py -v
