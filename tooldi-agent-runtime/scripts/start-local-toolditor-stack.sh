#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=/dev/null
source "${SCRIPT_DIR}/local-toolditor-env.sh"

mkdir -p "${OBJECT_STORE_ROOT_DIR}"

cleanup() {
  local exit_code=$?

  for pid in "${WORKER_PID:-}" "${API_PID:-}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill -INT "${pid}" 2>/dev/null || true
    fi
  done

  wait "${WORKER_PID:-}" 2>/dev/null || true
  wait "${API_PID:-}" 2>/dev/null || true

  exit "${exit_code}"
}

trap cleanup INT TERM EXIT

cd "${WORKSPACE_ROOT}"

if [[ "${AGENT_RUNTIME_SKIP_BUILD:-0}" != "1" ]]; then
  pnpm build
fi

echo "[stack] starting agent-api on ${PUBLIC_BASE_URL}"
./scripts/start-local-api-toolditor.sh &
API_PID=$!

sleep 2

echo "[stack] starting agent-worker"
AGENT_RUNTIME_SKIP_BUILD=1 ./scripts/start-local-worker-toolditor.sh &
WORKER_PID=$!

wait "${API_PID}" "${WORKER_PID}"
