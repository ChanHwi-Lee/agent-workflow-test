#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${AGENT_RUNTIME_POSTGRES_CONTAINER_NAME:-tooldi-agent-runtime-postgres}"
HOST_PORT="${AGENT_RUNTIME_POSTGRES_PORT:-55432}"
DB_NAME="${AGENT_RUNTIME_POSTGRES_DB:-tooldi_agent_runtime_test}"
DB_USER="${AGENT_RUNTIME_POSTGRES_USER:-postgres}"
DB_PASSWORD="${AGENT_RUNTIME_POSTGRES_PASSWORD:-postgres}"
IMAGE="${AGENT_RUNTIME_POSTGRES_IMAGE:-postgres:16-alpine}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[agent-postgres] docker is required to run the local LangGraph Postgres checkpointer" >&2
  exit 1
fi

container_id="$(docker ps -aq -f "name=^${CONTAINER_NAME}$")"

if [[ -z "${container_id}" ]]; then
  echo "[agent-postgres] creating ${CONTAINER_NAME} on 127.0.0.1:${HOST_PORT}"
  docker run -d \
    --name "${CONTAINER_NAME}" \
    -e POSTGRES_DB="${DB_NAME}" \
    -e POSTGRES_USER="${DB_USER}" \
    -e POSTGRES_PASSWORD="${DB_PASSWORD}" \
    -p "127.0.0.1:${HOST_PORT}:5432" \
    "${IMAGE}" >/dev/null
elif [[ -z "$(docker ps -q -f "name=^${CONTAINER_NAME}$")" ]]; then
  echo "[agent-postgres] starting existing container ${CONTAINER_NAME}"
  docker start "${CONTAINER_NAME}" >/dev/null
fi

for _ in {1..40}; do
  if docker exec "${CONTAINER_NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
    echo "[agent-postgres] ready ${CONTAINER_NAME} (${DB_NAME})"
    exit 0
  fi
  sleep 1
done

echo "[agent-postgres] PostgreSQL did not become ready in time" >&2
exit 1
