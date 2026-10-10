#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAG_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MODEL="${1:-groq/llama-3.3-70b-versatile}"
PROFILE="${2:-assist}"
TIER="${3:-3}"
RUNS="${4:-1}"

DATE_STR=$(date +%Y%m%d)
CLEAN_MODEL_NAME=$(echo "$MODEL" | tr '/' '_')
RESULTS_DIR="${PAG_ROOT}/evals/results"
mkdir -p "$RESULTS_DIR"
CSV_FILE="${RESULTS_DIR}/${DATE_STR}-${CLEAN_MODEL_NAME}-t${TIER}.csv"

if [ ! -f "$CSV_FILE" ]; then
  echo "timestamp,task,run,pass,wall_seconds,input_tokens,output_tokens" > "$CSV_FILE"
fi

TASKS_DIR="${PAG_ROOT}/evals/tasks"
mkdir -p "$TASKS_DIR"

echo "=== Running PAG Evals: Model=$MODEL, Profile=$PROFILE, Tier=$TIER, Runs=$RUNS ==="

TOTAL_RUNS=0
TOTAL_PASS=0

for task_dir in "${TASKS_DIR}"/*; do
  [ -d "$task_dir" ] || continue
  task_name=$(basename "$task_dir")
  prompt_file="${task_dir}/prompt.txt"
  check_script="${task_dir}/check.sh"

  [ -f "$prompt_file" ] && [ -f "$check_script" ] || continue

  echo ""
  echo "--- Task: ${task_name} ---"

  for run_idx in $(seq 1 "$RUNS"); do
    ((TOTAL_RUNS++))
    WORK_COPY=$(mktemp -d "${PAG_ROOT}/.tmp/eval-${task_name}-XXXXXX" 2>/dev/null || mktemp -d /tmp/eval-XXXXXX)
    mkdir -p "${PAG_ROOT}/.tmp"

    if [ -d "${task_dir}/repo" ]; then
      cp -r "${task_dir}/repo"/* "$WORK_COPY"/ 2>/dev/null || true
    fi

    (
      cd "$WORK_COPY"
      git init -b main >/dev/null 2>&1 || git init >/dev/null 2>&1
      git config user.name "Eval Agent"
      git config user.email "eval@realgravity.local"
      git add . >/dev/null 2>&1 || true
      git commit -m "Initial eval state" >/dev/null 2>&1 || true
    )

    PROMPT=$(cat "$prompt_file")
    START_TIME=$(date +%s)

    export WORKSPACE="$WORK_COPY"
    export PROFILE="$PROFILE"
    export PAG_CTX_TIER="$TIER"

    # Run agent in headless mode with timeout
    set +e
    timeout 900 docker compose -f "${PAG_ROOT}/docker/docker-compose.yml" run --rm agent run --model "$MODEL" "$PROMPT"
    EXIT_CODE=$?
    END_TIME=$(date +%s)
    WALL_TIME=$((END_TIME - START_TIME))

    # Run verification check
    PASS="FAIL"
    if [ $EXIT_CODE -eq 0 ]; then
      if bash "$check_script" "$WORK_COPY"; then
        PASS="PASS"
        ((TOTAL_PASS++))
      fi
    fi
    set -e

    # Collect accurate token stats filtered to this run's timestamp
    STATS=$(python3 "${SCRIPT_DIR}/collect.py" "$WORK_COPY" --since "$START_TIME")
    IN_TOK=$(echo "$STATS" | jq -r '.input_tokens // 0')
    OUT_TOK=$(echo "$STATS" | jq -r '.output_tokens // 0')

    TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    echo "${TS},${task_name},${run_idx},${PASS},${WALL_TIME},${IN_TOK},${OUT_TOK}" >> "$CSV_FILE"
    echo "Result [${task_name} #$run_idx]: $PASS (Time: ${WALL_TIME}s, In: ~${IN_TOK} tok, Out: ~${OUT_TOK} tok)"

    # Clean up workspace copy
    rm -rf "$WORK_COPY"
  done
done

echo ""
echo "=== Evaluation Summary ==="
echo "Model:      $MODEL"
echo "Total Runs: $TOTAL_RUNS"
echo "Passed:     $TOTAL_PASS"
if [ $TOTAL_RUNS -gt 0 ]; then
  PASS_PCT=$(( TOTAL_PASS * 100 / TOTAL_RUNS ))
  echo "Pass Rate:  ${PASS_PCT}%"
fi
echo "Log file:   $CSV_FILE"
echo "=========================="
