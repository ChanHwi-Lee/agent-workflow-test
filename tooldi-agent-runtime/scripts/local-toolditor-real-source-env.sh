#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=/dev/null
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/local-toolditor-env.sh"

export TOOLDI_CATALOG_SOURCE_MODE="${TOOLDI_CATALOG_SOURCE_MODE:-tooldi_api_direct}"
export TOOLDI_CONTENT_API_BASE_URL="${TOOLDI_CONTENT_API_BASE_URL:-http://localhost}"

# R1 template-prior vector recall. Worker 의 graph 는 이 endpoint 가
# 설정된 경우에만 vector recall 을 시도하고, 없으면 legacy keyword
# recall 로만 동작한다 (graceful degrade). 로컬 sidecar 는
# sandbox/embedding-test/template_embedding_service.py 로 띄운다.
export TEMPLATE_EMBEDDING_ENDPOINT="${TEMPLATE_EMBEDDING_ENDPOINT:-http://127.0.0.1:7070}"
