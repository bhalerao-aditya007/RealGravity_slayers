#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAG_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Try python3 first for reliable cross-platform JSON manipulation
if command -v python3 >/dev/null 2>&1; then
  python3 "${SCRIPT_DIR}/gen-profiles.py"
  exit 0
fi

# Fallback to jq
mkdir -p "${PAG_ROOT}/build"

for p in strict assist turbo; do
  if [ -f "${PAG_ROOT}/profiles/${p}.rules.json" ]; then
    jq -s '.[0] * {permissions: .[1]}' "${PAG_ROOT}/profiles/base.json" "${PAG_ROOT}/profiles/${p}.rules.json" > "${PAG_ROOT}/build/${p}.json"
    echo "[OK] Generated ${PAG_ROOT}/build/${p}.json"
  fi
done
