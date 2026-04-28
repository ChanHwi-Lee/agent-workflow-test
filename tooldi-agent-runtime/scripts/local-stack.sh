#!/usr/bin/env bash
# Agent workflow local browser-test stack.
#
# Managed components:
#   - PostgreSQL container: LangGraph PostgresSaver + runtime persistence
#   - Redis container: BullMQ queue
#   - Qdrant container: V6 asset RAG/vector search
#   - embedding FastAPI service
#   - agent-api + agent-worker runtime stack
#   - Toolditor Next dev server
#
# Usage from agent-workflow-test:
#   bash scripts/local-stack.sh up
#   bash scripts/local-stack.sh down
#   KEEP_DEPS=1 bash scripts/local-stack.sh down
#   bash scripts/local-stack.sh restart <embedding|stack|toolditor>
#   bash scripts/local-stack.sh status
#   bash scripts/local-stack.sh logs <embedding|stack|toolditor>
#   CONFIRM=1 bash scripts/local-stack.sh reset-db
set -euo pipefail

RUNTIME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_WORKFLOW_DIR="$(cd "$RUNTIME_DIR/.." && pwd)"
TOOLDI_ROOT="$(cd "$AGENT_WORKFLOW_DIR/../.." && pwd)"

TOOLDITOR_DIR="${TOOLDITOR_DIR:-$TOOLDI_ROOT/toolditor}"
EMBEDDING_DIR="${EMBEDDING_DIR:-$TOOLDI_ROOT/sandbox/embedding-test}"
STATE_DIR="${LOCAL_STACK_STATE_DIR:-/tmp/tooldi-local-stack}"
mkdir -p "$STATE_DIR"

POSTGRES_CONTAINER="${AGENT_RUNTIME_POSTGRES_CONTAINER_NAME:-tooldi-agent-runtime-postgres}"
POSTGRES_HOST_PORT="${AGENT_RUNTIME_POSTGRES_PORT:-55432}"
POSTGRES_DB="${AGENT_RUNTIME_POSTGRES_DB:-tooldi_agent_runtime_test}"
POSTGRES_USER="${AGENT_RUNTIME_POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${AGENT_RUNTIME_POSTGRES_PASSWORD:-postgres}"
POSTGRES_IMAGE="${AGENT_RUNTIME_POSTGRES_IMAGE:-postgres:16-alpine}"

REDIS_CONTAINER="${LOCAL_STACK_REDIS_CONTAINER:-tooldi-agent-runtime-redis}"
REDIS_HOST_PORT="${LOCAL_STACK_REDIS_PORT:-6380}"
REDIS_IMAGE="${LOCAL_STACK_REDIS_IMAGE:-redis:7-alpine}"
REDIS_DB="${LOCAL_STACK_REDIS_DB:-9}"

QDRANT_CONTAINER="${LOCAL_STACK_QDRANT_CONTAINER:-qdrant}"
QDRANT_HTTP_PORT="${LOCAL_STACK_QDRANT_HTTP_PORT:-6333}"
QDRANT_GRPC_PORT="${LOCAL_STACK_QDRANT_GRPC_PORT:-6334}"
QDRANT_IMAGE="${LOCAL_STACK_QDRANT_IMAGE:-qdrant/qdrant:latest}"
QDRANT_STORAGE_VOLUME="${LOCAL_STACK_QDRANT_STORAGE_VOLUME:-qdrant-storage}"
QDRANT_SNAPSHOTS_VOLUME="${LOCAL_STACK_QDRANT_SNAPSHOTS_VOLUME:-qdrant-snapshots}"

STACK_REDIS_URL="redis://127.0.0.1:${REDIS_HOST_PORT}/${REDIS_DB}"
STACK_POSTGRES_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/${POSTGRES_DB}"
STACK_QDRANT_URL="http://127.0.0.1:${QDRANT_HTTP_PORT}"
TOOLDITOR_BROWSER_URL="${LOCAL_STACK_TOOLDITOR_BROWSER_URL:-http://localhost:3010/editor}"

color() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
info() { echo "$(color '1;34' '[stack]') $*"; }
warn() { echo "$(color '1;33' '[stack]') $*" >&2; }
err() { echo "$(color '1;31' '[stack]') $*" >&2; }

port_listening() { ss -tlnH "( sport = :$1 )" 2>/dev/null | grep -q LISTEN; }
container_exists() { docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$1"; }
container_running() { docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$1"; }

port_owner_pid() {
  local port="$1"
  ss -ltnpH "( sport = :$port )" 2>/dev/null \
    | sed -nE 's/.*pid=([0-9]+),.*/\1/p' \
    | head -n 1
}

pid_pgid() { ps -o pgid= -p "$1" 2>/dev/null | tr -d '[:space:]'; }

pid_cwd_within() {
  local pid="$1" expected_dir="$2" cwd expected
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  expected="$(readlink -f "$expected_dir" 2>/dev/null || true)"
  [[ -n "$cwd" && -n "$expected" && ( "$cwd" == "$expected" || "$cwd" == "$expected"/* ) ]]
}

require_dir() {
  local label="$1" path="$2"
  if [[ ! -d "$path" ]]; then
    err "$label 경로가 없습니다: $path"
    err "$label 경로가 다르면 환경변수로 지정하세요. 예: ${label}_DIR=/path"
    exit 1
  fi
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    err "docker 가 필요합니다."
    exit 1
  fi
}

require_host_port_available_or_owned() {
  local name="$1" port="$2"
  if container_running "$name"; then
    return
  fi
  if port_listening "$port"; then
    err "host port $port 를 '$name' 이 아닌 프로세스/컨테이너가 사용 중입니다."
    err "안전상 임의 종료하지 않습니다. 충돌 대상을 내리거나 LOCAL_STACK_*_PORT 로 포트를 바꾸세요."
    exit 1
  fi
}

wait_for_container_cmd() {
  local name="$1" description="$2"
  shift 2
  for _ in {1..40}; do
    if "$@" >/dev/null 2>&1; then
      info "$description ready"
      return
    fi
    sleep 1
  done
  err "$description ready 대기 실패 (container=$name)"
  exit 1
}

ensure_postgres() {
  require_host_port_available_or_owned "$POSTGRES_CONTAINER" "$POSTGRES_HOST_PORT"
  AGENT_RUNTIME_POSTGRES_CONTAINER_NAME="$POSTGRES_CONTAINER" \
    AGENT_RUNTIME_POSTGRES_PORT="$POSTGRES_HOST_PORT" \
    AGENT_RUNTIME_POSTGRES_DB="$POSTGRES_DB" \
    AGENT_RUNTIME_POSTGRES_USER="$POSTGRES_USER" \
    AGENT_RUNTIME_POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    AGENT_RUNTIME_POSTGRES_IMAGE="$POSTGRES_IMAGE" \
    "$RUNTIME_DIR/scripts/ensure-local-langgraph-postgres.sh"
}

ensure_redis() {
  require_host_port_available_or_owned "$REDIS_CONTAINER" "$REDIS_HOST_PORT"
  if ! container_exists "$REDIS_CONTAINER"; then
    info "redis: 컨테이너 생성 ($REDIS_CONTAINER, 127.0.0.1:$REDIS_HOST_PORT)"
    docker run -d \
      --name "$REDIS_CONTAINER" \
      -p "127.0.0.1:${REDIS_HOST_PORT}:6379" \
      "$REDIS_IMAGE" >/dev/null
  elif ! container_running "$REDIS_CONTAINER"; then
    info "redis: 기존 컨테이너 시작 ($REDIS_CONTAINER)"
    docker start "$REDIS_CONTAINER" >/dev/null
  fi
  wait_for_container_cmd "$REDIS_CONTAINER" "redis" \
    docker exec "$REDIS_CONTAINER" redis-cli ping
}

ensure_qdrant() {
  require_host_port_available_or_owned "$QDRANT_CONTAINER" "$QDRANT_HTTP_PORT"
  require_host_port_available_or_owned "$QDRANT_CONTAINER" "$QDRANT_GRPC_PORT"
  if ! container_exists "$QDRANT_CONTAINER"; then
    info "qdrant: 컨테이너 생성 ($QDRANT_CONTAINER, 127.0.0.1:$QDRANT_HTTP_PORT/$QDRANT_GRPC_PORT)"
    docker run -d \
      --name "$QDRANT_CONTAINER" \
      -p "127.0.0.1:${QDRANT_HTTP_PORT}:6333" \
      -p "127.0.0.1:${QDRANT_GRPC_PORT}:6334" \
      -v "${QDRANT_STORAGE_VOLUME}:/qdrant/storage" \
      -v "${QDRANT_SNAPSHOTS_VOLUME}:/qdrant/snapshots" \
      "$QDRANT_IMAGE" >/dev/null
  elif ! container_running "$QDRANT_CONTAINER"; then
    info "qdrant: 기존 컨테이너 시작 ($QDRANT_CONTAINER)"
    docker start "$QDRANT_CONTAINER" >/dev/null
  fi
  wait_for_container_cmd "$QDRANT_CONTAINER" "qdrant" \
    curl -fsS "${STACK_QDRANT_URL}/readyz"
}

ensure_dependencies() {
  require_docker
  require_dir TOOLDITOR "$TOOLDITOR_DIR"
  require_dir EMBEDDING "$EMBEDDING_DIR"
  ensure_postgres
  ensure_redis
  ensure_qdrant
}

stop_container() {
  local name="$1"
  if container_running "$name"; then
    info "$name: 컨테이너 stop"
    docker stop "$name" >/dev/null
  else
    info "$name: 종료할 컨테이너 없음"
  fi
}

start_proc() {
  local name="$1" port="$2" workdir="$3"
  shift 3
  local pid_file="$STATE_DIR/$name.pid" log_file="$STATE_DIR/$name.log"

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    info "$name: 이미 가동 중 (pid=$(cat "$pid_file"))"
    return
  fi
  if [[ -n "$port" ]] && port_listening "$port"; then
    warn "$name: 본 스크립트가 띄우지 않은 프로세스가 포트 $port 점유 중 — 건드리지 않음"
    return
  fi

  info "$name: 기동 (cmd=$* | log=$log_file)"
  rm -f "$pid_file"
  (
    cd "$workdir"
    setsid bash -c '
      pid_file="$1"
      shift
      echo "$$" > "$pid_file"
      exec "$@"
    ' _ "$pid_file" "$@" >>"$log_file" 2>&1 < /dev/null &
  )
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    [[ -s "$pid_file" ]] && break
    sleep 0.1
  done
  sleep 1
  if ! kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    err "$name: 기동 직후 종료됨 — tail $log_file"
    return 1
  fi
}

wait_for_port_ready() {
  local name="$1" port="$2" timeout_seconds="$3"
  local pid_file="$STATE_DIR/$name.pid"
  for _ in $(seq 1 "$timeout_seconds"); do
    if port_listening "$port"; then
      info "$name: port $port ready"
      return
    fi
    if [[ -f "$pid_file" ]] && ! kill -0 "$(cat "$pid_file")" 2>/dev/null; then
      err "$name: ready 대기 중 프로세스 종료 — tail $STATE_DIR/$name.log"
      exit 1
    fi
    sleep 1
  done
  err "$name: port $port ready 대기 실패 (${timeout_seconds}s) — tail $STATE_DIR/$name.log"
  exit 1
}

wait_for_http_ready() {
  local name="$1" url="$2" expected_status="$3" timeout_seconds="$4"
  local deadline=$((SECONDS + timeout_seconds))
  local status=""
  while (( SECONDS < deadline )); do
    status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 60 "$url" 2>/dev/null || true)"
    if [[ "$status" == "$expected_status" ]]; then
      info "$name: HTTP $expected_status ready ($url)"
      return
    fi
    sleep 1
  done
  err "$name: HTTP $expected_status ready 대기 실패 (last_status=${status:-none}, url=$url)"
  exit 1
}

cmd_up() {
  ensure_dependencies
  start_proc embedding 7070 "$EMBEDDING_DIR" \
    env QDRANT_URL="$STACK_QDRANT_URL" bash run_template_embedding_service.sh
  start_proc stack 3100 "$RUNTIME_DIR" \
    env \
      POSTGRES_URL="$STACK_POSTGRES_URL" \
      AGENT_RUNTIME_POSTGRES_CONTAINER_NAME="$POSTGRES_CONTAINER" \
      AGENT_RUNTIME_POSTGRES_PORT="$POSTGRES_HOST_PORT" \
      AGENT_RUNTIME_POSTGRES_DB="$POSTGRES_DB" \
      AGENT_RUNTIME_POSTGRES_USER="$POSTGRES_USER" \
      AGENT_RUNTIME_POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
      AGENT_RUNTIME_POSTGRES_IMAGE="$POSTGRES_IMAGE" \
      REDIS_URL="$STACK_REDIS_URL" \
      V6_ASSET_QDRANT_URL="$STACK_QDRANT_URL" \
      pnpm run local:toolditor:stack
  start_proc toolditor 3010 "$TOOLDITOR_DIR" \
    env AGENT_WORKFLOW_BASE_URL="http://127.0.0.1:3100" npm run local:agent
  wait_for_port_ready embedding 7070 "${LOCAL_STACK_EMBEDDING_READY_TIMEOUT:-180}"
  wait_for_port_ready stack 3100 "${LOCAL_STACK_STACK_READY_TIMEOUT:-180}"
  wait_for_port_ready toolditor 3010 "${LOCAL_STACK_TOOLDITOR_READY_TIMEOUT:-120}"
  wait_for_http_ready toolditor "$TOOLDITOR_BROWSER_URL" 200 "${LOCAL_STACK_TOOLDITOR_HTTP_READY_TIMEOUT:-180}"
  echo
  cmd_status
  echo
  info "브라우저 테스트 진입점: $TOOLDITOR_BROWSER_URL"
  info "검증 시 interviewTimeoutMs=30000 단축 권장 (5분 → 30초)."
}

stop_proc() {
  local name="$1" port="$2" workdir="$3"
  local pid_file="$STATE_DIR/$name.pid"
  local pid="" pgid="" owner_pid=""
  if [[ -f "$pid_file" ]]; then
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      pgid="$(pid_pgid "$pid")"
    else
      info "$name: pid 파일의 프로세스는 이미 종료됨 (pid=$pid)"
      pid=""
    fi
  fi
  if [[ -z "$pgid" && -n "$port" ]]; then
    owner_pid="$(port_owner_pid "$port")"
    if [[ -n "$owner_pid" ]] && pid_cwd_within "$owner_pid" "$workdir"; then
      pid="$owner_pid"
      pgid="$(pid_pgid "$owner_pid")"
      info "$name: pid 파일 대신 포트 $port 점유 프로세스 회수 (pid=$pid pgid=$pgid)"
    fi
  fi
  if [[ -z "$pgid" || ! "$pgid" =~ ^[0-9]+$ || "$pgid" -le 1 ]]; then
    info "$name: 종료할 관리 대상 프로세스 없음"
    rm -f "$pid_file"
    return
  fi
  info "$name: SIGINT 송신 (pid=$pid pgid=$pgid + child group)"
  kill -INT -- "-$pgid" 2>/dev/null || kill -INT "$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ! kill -0 -- "-$pgid" 2>/dev/null; then break; fi
    sleep 1
  done
  if kill -0 -- "-$pgid" 2>/dev/null; then
    warn "$name: SIGINT 후 10s 잔류 — SIGKILL"
    kill -KILL -- "-$pgid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$pid_file"
}

cmd_down() {
  stop_proc toolditor 3010 "$TOOLDITOR_DIR"
  stop_proc stack 3100 "$RUNTIME_DIR"
  stop_proc embedding 7070 "$EMBEDDING_DIR"
  if [[ "${KEEP_DEPS:-0}" == "1" ]]; then
    info "KEEP_DEPS=1 — postgres/redis/qdrant 컨테이너 유지"
  else
    stop_container "$REDIS_CONTAINER"
    stop_container "$QDRANT_CONTAINER"
    stop_container "$POSTGRES_CONTAINER"
  fi
  echo
  cmd_status
}

cmd_status() {
  printf '%-12s %-10s %-15s %s\n' COMP PORT STATE PID
  for row in "embedding 7070" "stack 3100" "toolditor 3010"; do
    set -- $row
    name="$1" port="$2"
    case "$name" in
      embedding) workdir="$EMBEDDING_DIR" ;;
      stack) workdir="$RUNTIME_DIR" ;;
      toolditor) workdir="$TOOLDITOR_DIR" ;;
      *) workdir="$AGENT_WORKFLOW_DIR" ;;
    esac
    pid_file="$STATE_DIR/${name}.pid"
    pid_state="-"
    if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
      pid_state="$(cat "$pid_file") (this stack)"
    elif [[ -f "$pid_file" ]]; then
      owner_pid="$(port_owner_pid "$port")"
      if [[ -n "$owner_pid" ]] && pid_cwd_within "$owner_pid" "$workdir"; then
        pid_state="stale($(cat "$pid_file")); port-owner=$owner_pid"
      else
        pid_state="stale($(cat "$pid_file"))"
      fi
    else
      owner_pid="$(port_owner_pid "$port")"
      if [[ -n "$owner_pid" ]] && pid_cwd_within "$owner_pid" "$workdir"; then
        pid_state="port-owner=$owner_pid"
      fi
    fi
    if port_listening "$port"; then
      port_state="LISTEN"
    else
      port_state="-"
    fi
    printf '%-12s %-10s %-15s %s\n' "$name" "$port" "$port_state" "$pid_state"
  done
  echo '--- deps ---'
  for c in "$POSTGRES_CONTAINER" "$REDIS_CONTAINER" "$QDRANT_CONTAINER"; do
    if container_running "$c"; then
      printf '%-12s %s\n' "$c" 'running'
    else
      printf '%-12s %s\n' "$c" 'NOT running'
    fi
  done
  if container_running "$REDIS_CONTAINER" && docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1; then
    printf '%-12s %s\n' "redis:$REDIS_HOST_PORT" 'PONG'
  else
    printf '%-12s %s\n' "redis:$REDIS_HOST_PORT" 'no response'
  fi
  if container_running "$QDRANT_CONTAINER" && curl -fsS "${STACK_QDRANT_URL}/readyz" >/dev/null 2>&1; then
    printf '%-12s %s\n' "qdrant:$QDRANT_HTTP_PORT" 'ready'
  else
    printf '%-12s %s\n' "qdrant:$QDRANT_HTTP_PORT" 'no response'
  fi
}

cmd_restart() {
  local name="${1:-}"
  case "$name" in
    embedding)
      ensure_dependencies
      stop_proc embedding 7070 "$EMBEDDING_DIR"
      start_proc embedding 7070 "$EMBEDDING_DIR" env QDRANT_URL="$STACK_QDRANT_URL" bash run_template_embedding_service.sh
      wait_for_port_ready embedding 7070 "${LOCAL_STACK_EMBEDDING_READY_TIMEOUT:-180}"
      ;;
    stack)
      ensure_dependencies
      stop_proc stack 3100 "$RUNTIME_DIR"
      start_proc stack 3100 "$RUNTIME_DIR" \
        env \
          POSTGRES_URL="$STACK_POSTGRES_URL" \
          AGENT_RUNTIME_POSTGRES_CONTAINER_NAME="$POSTGRES_CONTAINER" \
          AGENT_RUNTIME_POSTGRES_PORT="$POSTGRES_HOST_PORT" \
          AGENT_RUNTIME_POSTGRES_DB="$POSTGRES_DB" \
          AGENT_RUNTIME_POSTGRES_USER="$POSTGRES_USER" \
          AGENT_RUNTIME_POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
          AGENT_RUNTIME_POSTGRES_IMAGE="$POSTGRES_IMAGE" \
          REDIS_URL="$STACK_REDIS_URL" \
          V6_ASSET_QDRANT_URL="$STACK_QDRANT_URL" \
          pnpm run local:toolditor:stack
      wait_for_port_ready stack 3100 "${LOCAL_STACK_STACK_READY_TIMEOUT:-180}"
      ;;
    toolditor)
      ensure_dependencies
      stop_proc toolditor 3010 "$TOOLDITOR_DIR"
      start_proc toolditor 3010 "$TOOLDITOR_DIR" env AGENT_WORKFLOW_BASE_URL="http://127.0.0.1:3100" npm run local:agent
      wait_for_port_ready toolditor 3010 "${LOCAL_STACK_TOOLDITOR_READY_TIMEOUT:-120}"
      wait_for_http_ready toolditor "$TOOLDITOR_BROWSER_URL" 200 "${LOCAL_STACK_TOOLDITOR_HTTP_READY_TIMEOUT:-180}"
      ;;
    '') err "restart: 컴포넌트 이름 필요 (embedding | stack | toolditor)"; exit 1 ;;
    *) err "restart: 알 수 없는 컴포넌트 '$name'"; exit 1 ;;
  esac
}

cmd_logs() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    err "logs: 컴포넌트 이름 필요 (embedding | stack | toolditor)"
    exit 1
  fi
  local log_file="$STATE_DIR/$name.log"
  if [[ ! -f "$log_file" ]]; then
    err "로그 파일 없음: $log_file"
    exit 1
  fi
  exec tail -f "$log_file"
}

cmd_reset_db() {
  if [[ "${CONFIRM:-0}" != "1" ]]; then
    err "reset-db: schema 를 CASCADE drop 합니다 (비가역). 다음으로 재실행:"
    err "  CONFIRM=1 bash scripts/local-stack.sh reset-db"
    exit 1
  fi
  for name in stack toolditor; do
    local pid_file="$STATE_DIR/$name.pid"
    if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
      err "reset-db: $name 가 가동 중 (pid=$(cat "$pid_file")) — 먼저 'down' 으로 종료"
      exit 1
    fi
  done
  if ! container_running "$POSTGRES_CONTAINER"; then
    err "reset-db: postgres 컨테이너 ($POSTGRES_CONTAINER) 미가동 — 먼저 'up' 실행"
    exit 1
  fi

  info "reset-db: drizzle / agent_interview / agent_langgraph schema CASCADE drop (db=$POSTGRES_DB)"
  docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
DROP SCHEMA IF EXISTS agent_interview CASCADE;
DROP SCHEMA IF EXISTS agent_langgraph CASCADE;
DROP SCHEMA IF EXISTS drizzle CASCADE;
SQL
  info "reset-db: 완료. 다음 'up' 또는 'restart stack' 시 worker boot 의 migrate() 가 자동 재생성"
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  restart) shift; cmd_restart "${1:-}" ;;
  status) cmd_status ;;
  logs) shift; cmd_logs "${1:-}" ;;
  reset-db) cmd_reset_db ;;
  ''|help|-h|--help)
    grep -E '^# ' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *) err "알 수 없는 명령: $1"; exit 1 ;;
esac
