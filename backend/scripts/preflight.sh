#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAG_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== RealGravity (PAG) Preflight Check ==="

# 1. OS check
OS_INFO=$(uname -a)
echo "[INFO] OS: ${OS_INFO}"
if [[ "$OS_INFO" =~ [Mm]icrosoft || "$OS_INFO" =~ [Ww][Ss][Ll] ]]; then
  echo "[OK] Running under WSL2."
elif [[ "$OSTYPE" == "linux-gnu"* || "$OSTYPE" == "darwin"* ]]; then
  echo "[OK] Running under Linux/macOS."
else
  echo "[ERROR] Unsupported OS. Please run inside WSL2 Ubuntu or Linux."
  exit 1
fi

# 2. Required tools check
REQUIRED_CMDS=(docker git tmux jq curl sqlite3 watch python3 ctags)
MISSING=()

for cmd in "${REQUIRED_CMDS[@]}"; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    MISSING+=("$cmd")
  else
    echo "[OK] Found $cmd"
  fi
done

if [ ${#MISSING[@]} -ne 0 ]; then
  echo "[ERROR] Missing required tools: ${MISSING[*]}"
  echo "Please install them via apt-get or your system package manager."
  exit 1
fi

# Check docker compose v2
if docker compose version >/dev/null 2>&1; then
  echo "[OK] Docker Compose v2 is available: $(docker compose version)"
else
  echo "[ERROR] Docker Compose v2 is required."
  exit 1
fi

# Check docker daemon
if docker info >/dev/null 2>&1; then
  echo "[OK] Docker daemon is running."
else
  echo "[ERROR] Docker daemon is not running. Start with 'sudo systemctl start docker'."
  exit 1
fi

# Test container execution (A0 test)
echo "[INFO] Testing container execution..."
if docker run --rm hello-world >/dev/null 2>&1; then
  echo "[OK] Docker hello-world container ran successfully."
else
  echo "[ERROR] Failed to run test docker container."
  exit 1
fi

# 3. Check .env file and generate secrets
ENV_FILE="${PAG_ROOT}/.env"
ENV_EXAMPLE="${PAG_ROOT}/.env.example"

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "[INFO] Copied .env.example to .env"
  else
    echo "[WARN] ${ENV_FILE} does not exist."
    echo "Owner action required: Copy .env.example to .env and add API keys."
  fi
fi

if [ -f "$ENV_FILE" ]; then
  PERMS=$(stat -c "%a" "$ENV_FILE" 2>/dev/null || stat -f "%A" "$ENV_FILE" 2>/dev/null || echo "unknown")
  echo "[OK] .env exists (permissions: ${PERMS})"
  if [ ! -s "$ENV_FILE" ]; then
    echo "[WARN] .env is empty!"
  fi

  # Generate SearXNG secret if not set
  source "$ENV_FILE"
  if [ -z "${SEARXNG_SECRET:-}" ]; then
    SECRET_KEY=$(openssl rand -hex 32)
    echo "SEARXNG_SECRET=${SECRET_KEY}" >> "$ENV_FILE"
    echo "[OK] Generated SearXNG secret key in .env"
  fi

  # Report configured providers
  PROVIDERS=()
  [ -n "${GO_API_KEY:-}" ]        && PROVIDERS+=("OpenCode Go")
  [ -n "${GROQ_API_KEY:-}" ]      && PROVIDERS+=("Groq")
  [ -n "${NVIDIA_API_KEY:-}" ]    && PROVIDERS+=("NVIDIA NIM")
  [ -n "${OPENROUTER_API_KEY:-}" ] && PROVIDERS+=("OpenRouter")
  if [ ${#PROVIDERS[@]} -gt 0 ]; then
    echo "[OK] Configured providers: ${PROVIDERS[*]}"
  else
    echo "[WARN] No API keys configured! Add at least one to .env"
    echo "  Free providers: Groq, NVIDIA NIM, OpenRouter, OpenCode Go"
  fi
fi

# 5. Check or initialize scratch repo
SCRATCH_DIR="${PAG_ROOT}/scratch-repo"
if [ ! -d "$SCRATCH_DIR/.git" ]; then
  echo "[INFO] Initializing scratch test repo at ${SCRATCH_DIR}..."
  mkdir -p "${SCRATCH_DIR}/python_pkg/tests" "${SCRATCH_DIR}/ts_pkg"
  
  # Python modules
  cat <<'EOF' > "${SCRATCH_DIR}/python_pkg/math_utils.py"
def add(a: int, b: int) -> int:
    return a + b

def multiply(a: int, b: int) -> int:
    return a * b
EOF

  cat <<'EOF' > "${SCRATCH_DIR}/python_pkg/string_utils.py"
def reverse_string(s: str) -> str:
    return s[::-1]

def capitalize_words(s: str) -> str:
    return s.title()
EOF

  cat <<'EOF' > "${SCRATCH_DIR}/python_pkg/core.py"
from .math_utils import add
from .string_utils import reverse_string

def process_data(text: str, count: int) -> str:
    rev = reverse_string(text)
    total = add(count, len(text))
    return f"{rev}:{total}"
EOF

  cat <<'EOF' > "${SCRATCH_DIR}/python_pkg/tests/test_math.py"
from python_pkg.math_utils import add, multiply

def test_add():
    assert add(2, 3) == 5

def test_multiply():
    assert multiply(3, 4) == 12
EOF

  cat <<'EOF' > "${SCRATCH_DIR}/python_pkg/tests/test_string.py"
from python_pkg.string_utils import reverse_string

def test_reverse():
    assert reverse_string("hello") == "olleh"
EOF

  # TypeScript project
  cat <<'EOF' > "${SCRATCH_DIR}/ts_pkg/calc.ts"
export function subtract(a: number, b: number): number {
  return a - b;
}
EOF

  cat <<'EOF' > "${SCRATCH_DIR}/ts_pkg/calc.test.ts"
import { test, expect } from "vitest";
import { subtract } from "./calc";

test("subtract", () => {
  expect(subtract(5, 2)).toBe(3);
});
EOF

  (
    cd "$SCRATCH_DIR"
    git init -b main >/dev/null 2>&1 || git init >/dev/null 2>&1
    git config user.name "PAG Tester"
    git config user.email "tester@realgravity.local"
    git add .
    git commit -m "Initial scratch repo commit" >/dev/null 2>&1
  )
  echo "[OK] Scratch repo initialized at ${SCRATCH_DIR}"
else
  echo "[OK] Scratch repo already present."
fi

# Symlink scratch repo to ~/pag-scratch if needed
if [ ! -L "$HOME/pag-scratch" ] && [ ! -d "$HOME/pag-scratch" ]; then
  ln -sf "${SCRATCH_DIR}" "$HOME/pag-scratch"
fi

echo "=== Preflight Checks Passed! ==="
