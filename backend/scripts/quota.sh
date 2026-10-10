#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAG_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if command -v python3 >/dev/null 2>&1; then
  python3 "${SCRIPT_DIR}/quota.py"
  exit 0
fi

LOG_FILE="${PAG_ROOT}/logs/pag.log"

echo "=== RealGravity (PAG) API Usage & Quota Summary ==="

if [ ! -f "$LOG_FILE" ]; then
  echo "No log file found at ${LOG_FILE} yet. Run a session first."
  exit 0
fi

echo "--- Requests per Day ---"
awk '{print substr($1, 1, 10)}' "$LOG_FILE" | sort | uniq -c | while read -r count date; do
  echo "Date: $date | Requests: $count"
done

echo ""
echo "--- Total Traffic Estimate ---"
awk '
  {
    for(i=1; i<=NF; i++) {
      if($i ~ /^req=/) { req += substr($i, 5) }
      if($i ~ /^res=/) { res += substr($i, 5) }
    }
    total_reqs++
  }
  END {
    printf "Total Requests: %d\n", total_reqs
    printf "Estimated Input Tokens: ~%d (based on %d bytes)\n", req/3.5, req
    printf "Estimated Output Tokens: ~%d (based on %d bytes)\n", res/3.5, res
  }
' "$LOG_FILE"
