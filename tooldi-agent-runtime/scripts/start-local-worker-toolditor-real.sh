#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=/dev/null
source "${SCRIPT_DIR}/local-toolditor-real-source-env.sh"

"${SCRIPT_DIR}/start-local-worker-toolditor.sh"

