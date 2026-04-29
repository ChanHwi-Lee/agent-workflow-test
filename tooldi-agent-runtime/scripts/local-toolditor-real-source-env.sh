#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=/dev/null
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/local-toolditor-env.sh"

export TOOLDI_CATALOG_SOURCE_MODE="${TOOLDI_CATALOG_SOURCE_MODE:-tooldi_api_direct}"
export TOOLDI_CONTENT_API_BASE_URL="${TOOLDI_CONTENT_API_BASE_URL:-http://localhost}"
