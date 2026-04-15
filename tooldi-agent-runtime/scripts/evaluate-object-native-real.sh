#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck source=/dev/null
source "${SCRIPT_DIR}/local-toolditor-real-source-env.sh"

cd "${WORKSPACE_ROOT}"
node --enable-source-maps ./scripts/evaluate-object-native-real.mjs "$@"
