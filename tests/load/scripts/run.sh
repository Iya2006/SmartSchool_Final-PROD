#!/usr/bin/env bash
# Runner k6 (Linux/macOS/Git Bash). Toujours contre une CIBLE DE TEST.
# Exemples :
#   ./run.sh smoke
#   BASE_URL=http://localhost:8300 VUS=100 DURATION=2m ./run.sh load
#   MAX_RATE=800 ./run.sh breakpoint
set -euo pipefail

SCENARIO="${1:?Usage: ./run.sh <scenario> (smoke|load|stress|spike|soak|breakpoint|multi_tenant|auth|sync_storm)}"
LOAD_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # tests/load
cd "$LOAD_DIR"

SCRIPT="scenarios/${SCENARIO}.js"
[ -f "$SCRIPT" ] || { echo "Scénario introuvable : $SCRIPT" >&2; exit 1; }

: "${BASE_URL:=http://localhost:8300}"
STAMP="$(date +%Y%m%d-%H%M%S)"
SUMMARY="results/${SCENARIO}-${STAMP}.summary.json"

ENV_ARGS=(--env "BASE_URL=${BASE_URL}")
[ "${TEST_ENV:-}" ] && ENV_ARGS+=(--env "TEST_ENV=${TEST_ENV}")
[ "${VUS:-}" ]      && ENV_ARGS+=(--env "VUS=${VUS}")
[ "${DURATION:-}" ] && ENV_ARGS+=(--env "DURATION=${DURATION}")
[ "${RATE:-}" ]     && ENV_ARGS+=(--env "RATE=${RATE}")
[ "${MAX_RATE:-}" ] && ENV_ARGS+=(--env "MAX_RATE=${MAX_RATE}")
[ "${MAX_VUS:-}" ]  && ENV_ARGS+=(--env "MAX_VUS=${MAX_VUS}")

echo "→ k6 run ${SCRIPT}  (BASE_URL=${BASE_URL})"
k6 run "${ENV_ARGS[@]}" --summary-export="${SUMMARY}" "${SCRIPT}"
echo "Résumé : ${SUMMARY}"
