#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=/dev/null
source "${SCRIPT_DIR}/local-toolditor-env.sh"

mkdir -p "${OBJECT_STORE_ROOT_DIR}"

cd "${WORKSPACE_ROOT}"

if [[ "${AGENT_RUNTIME_SKIP_BUILD:-0}" != "1" ]]; then
  pnpm build
fi

echo "[agent-api] starting on ${PUBLIC_BASE_URL}"
pnpm --filter @tooldi/agent-api start
