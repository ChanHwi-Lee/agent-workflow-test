# Tooldi Agent Workflow v1 Scope / Operations Decision Lock

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Scope / Operations Decision Lock |
| 문서 목적 | v1 범위/비범위와 운영/기술 결정을 한 문서에서 잠그고, sibling 설계 문서가 동일한 기준을 참조하게 한다. |
| 상태 | Draft |
| 문서 유형 | Decision Record |
| 작성일 | 2026-04-03 |
| 기준 시스템 | `toolditor FE`, 신규 `Fastify` Agent API, 신규 `BullMQ Worker + LangGraph Runtime`, `LangChain JS planner/model layer`, `Redis` 기반 `BullMQ` queue, 기존 AI primitive adapters |
| 기준 데이터 | `docs/tooldi-agent-workflow-v1/tooldi-natural-language-agent-v1-architecture.md`, `docs/tooldi-agent-workflow-v1/tooldi-agent-workflow-v1-functional-spec-to-be.md`, `docs/tooldi-agent-workflow-v1/tooldi-agent-workflow-v1-backend-boundary.md`, Fastify/BullMQ 공식 문서 |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA, 인프라/운영 |
| Owner | Ouroboros workflow |

## 1. 목적

이 문서는 Tooldi 자연어 agent/workflow v1에서 더 이상 열어 두지 않을 결정을 명시적으로 고정한다.

고정 대상은 아래 다섯 가지다.

1. v1 제품 범위와 비범위
2. PHP 제외와 신규 backend/worker/queue 선택
3. live-commit run의 최소 traceability contract
4. prompt log / tool execution log 저장 원칙
5. 비용 가시성과 day-one 운영 관측 기준

이 문서가 우선하는 질문은 "v1을 어떤 시스템으로 만들 것인가" 보다 "무엇을 절대 v1에서 하지 않을 것인가" 와 "운영자가 day one부터 무엇을 볼 수 있어야 하는가" 다.

### 1.1 Document Authority Boundary

- 이 문서는 v1 scope/non-scope, stack lock, day-one operations visibility를 잠그는 decision record다.
- artifact identity, counted completion moment, lifecycle ownership, contract-chain root identity와 ordering은 [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/tooldi-agent-workflow-v1/tooldi-natural-language-agent-v1-architecture.md) 가 authoritative source다.
- backend API/persistence surface는 [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/tooldi-agent-workflow-v1/tooldi-agent-workflow-v1-functional-spec-to-be.md), control-plane/worker split은 [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/tooldi-agent-workflow-v1/tooldi-agent-workflow-v1-backend-boundary.md) 가 projection을 제공한다.
- 따라서 이 문서의 scope/stack decision은 sibling 문서가 같은 문장을 재사용하게 만드는 lock 역할만 하고, completion semantics나 artifact identity를 별도 source로 다시 만들지 않는다.

## 2. v1 Scope Lock

### 2.1 제품 표면에서 포함하는 것

v1의 사용자-visible scope는 아래 한 흐름으로 고정한다.

- 빈 캔버스에서 자연어 입력 1건으로 배너 초안 1개를 live-commit으로 생성
- 대표 입력 예시: `봄 세일 이벤트 배너 만들어줘`
- 목표 완료 시간: 최초 요청 후 `120초 이내`
- 결과물: flat bitmap이 아닌 editable layer/group 기반 draft 1개

v1에서 포함하는 구현 범위는 아래와 같다.

| 항목 | v1 결정 |
| --- | --- |
| northbound user entrypoint | `empty_canvas -> create_draft` 1종만 연다. |
| live-commit | 승인 모달, apply 버튼, review gate 없이 즉시 캔버스를 바꾼다. |
| southbound primitive reuse | 기존 one-shot AI 기능은 internal tool adapter로만 재사용한다. |
| internal op family | `createLayer`, `updateLayer`, `deleteLayer`, image insertion, `saveDraft` 를 모두 내부 실행 계약에 포함한다. |
| worker boundary | planning/tool execution은 별도 worker에서 수행한다. |
| run visibility | run 상태, phase, warning, terminal outcome, 비용/로그 조회 가능성을 day one부터 확보한다. |

### 2.2 제품 표면에서 제외하는 것

아래는 v1에서 의도적으로 열지 않는다.

| 항목 | v1 결정 |
| --- | --- |
| existing-canvas edit | 사용자가 기존 요소를 대상으로 `문구만 바꿔줘` 같은 edit flow를 직접 시작하는 기능은 v2로 미룬다. |
| existing-canvas delete | 사용자가 기존 요소를 대상으로 `이 스티커 지워줘` 같은 delete flow를 직접 시작하는 기능은 v2로 미룬다. |
| staged apply UX | agent가 계획만 만든 뒤 사용자가 승인해야 적용되는 UX는 두지 않는다. |
| multi-variant generation | 2개 이상 시안 병렬 생성, 고르기 UX는 v1 범위가 아니다. |
| embeddings / RAG | retrieval, knowledge store, brand guide auto-learning은 넣지 않는다. |
| personalization | 사용자/브랜드별 자동 톤 학습, audience personalization은 넣지 않는다. |
| multi-agent collaboration | planner agent, designer agent, critic agent 같은 협업 구조는 넣지 않는다. |
| external integrations | 외부 SaaS, drive, CMS, ad platform, publish channel 연동은 넣지 않는다. |
| auto publish / export / send | 문서 외부 publish, export, send는 v1 종료 조건이 아니다. |
| heavyweight workflow engine | Temporal, multi-broker, DAG orchestrator 도입은 하지 않는다. |

### 2.3 v1에서 미루되 계약은 열어 두는 것

v1은 create-only 제품이지만 계약은 create-only로 설계하지 않는다.

- `updateLayer`, `deleteLayer` 는 이미 v1 internal runtime contract에 포함한다.
- 이유는 placeholder 치환, 레이아웃 보정, 실패 cleanup, compensation, save 전 정리 단계에서 update/delete가 필요하기 때문이다.
- 단, authority는 같은 run 안에서 생성 중인 draft의 self-correction 및 compensation으로만 제한한다. run 시작 전 존재하던 사용자 레이어를 일반 편집 대상으로 삼을 수 없다.
- 즉, 이 contract 존재가 곧바로 v1 사용자 기능 노출이나 hidden existing-canvas edit path를 의미하지는 않는다.

즉, `user scope` 는 좁게 잠그고 `runtime contract surface` 는 future-safe 하게 유지한다.

## 3. Technical Decision Lock

### 3.1 PHP 제외

v1의 canonical orchestration owner는 PHP가 아니다.

- 기존 PHP/legacy stack은 기존 Tooldi 기능 경계로 남는다.
- 새 agent/workflow run lifecycle, queue dispatch, retry/cancel fence, trace log, cost log의 source of truth는 신규 non-PHP runtime이 가진다.
- PHP에 새 endpoint를 얇게 추가해 연결하더라도, 그것은 compatibility shim일 뿐 canonical owner가 될 수 없다.

이 결정을 고정하는 이유는 아래와 같다.

- live-commit orchestration은 queue/worker/state-log/trace-log/cost-log를 한 덩어리로 가져가야 하며, 기존 one-shot PHP AI flow 위에 덧대면 ownership이 다시 분산된다.
- v1은 향후 `updateLayer`, `deleteLayer`, resume, reconciliation을 수용해야 하므로 stateful workflow runtime이 필요하다.

### 3.2 Backend 선택

v1 control plane backend는 TypeScript/Node 기반 `Fastify` 서비스로 고정한다.

| 축 | 결정 | 이유 |
| --- | --- | --- |
| runtime | TypeScript/Node | Tooldi/toolditor 운영 문맥과 가장 가깝고, worker와 schema/types를 공유하기 쉽다. |
| framework | `Fastify` | strict request validation, plugin registration, logger integration을 control plane에 가볍게 적용하기 쉽다. |
| ownership | `Agent API` | auth/session 검증, run 생성, queue publish, SSE fan-out, watchdog, terminal 판정, canonical state 저장 owner |

명시적으로 채택하지 않는 구조:

- API handler 안에서 planner/model/tool 실행
- FE와 worker가 backend를 우회해 직접 통신하는 구조
- provider SDK와 prompt recipe를 public API surface에 노출하는 구조

### 3.3 Worker 선택

v1 execution plane은 별도 TypeScript/Node 기반 `BullMQ Worker` 프로세스로 고정하고, worker 내부 orchestration runtime 은 `LangGraph` 로 관리한다.

- worker는 queue consumer이며, 내부 `LangGraph` graph 를 통해 request/snapshot hydrate, plan 생성, tool execution, mutation proposal, compensation 계산, finalize payload 생성을 담당한다.
- worker 내부 planner/model abstraction 은 `LangChain JS` 로 정리한다.
- provider SDK 차이는 `LangChain` 뒤로 숨기고, graph node 가 provider-specific request shape를 직접 알지 않게 한다.
- 현재 local 기본 planner provider 는 `Google Gemini` 지만, 이 값은 stack lock이 아니라 운영 기본값이다.
- worker는 FE canvas를 직접 mutate하지 않는다.
- worker는 retry budget의 canonical owner가 아니다. queue retry는 backend가 새 attempt를 enqueue할 때만 열린다.

### 3.4 Worker persistence / memory 결정

- worker progress persistence 는 `LangGraph` checkpointer 를 사용한다.
- local/운영 기본값은 `Postgres` checkpointer 다.
- 이 checkpoint 는 worker-internal progress/resume 용도이며, canonical run audit/completion source of truth를 대체하지 않는다.
- public multi-turn memory, chat thread memory, user preference memory 는 아직 v1 범위가 아니다.

### 3.5 Queue 선택

v1 durable orchestration handoff는 `Redis` 기반 `BullMQ` queue로 고정한다.

| 항목 | 결정 |
| --- | --- |
| queue topology | v1은 단일 interactive queue를 기본으로 시작한다. |
| event source | `QueueEvents` 는 stalled/completed/failed 같은 transport telemetry 입력으로만 사용한다. |
| retry shape | queue retry는 backend가 명시적으로 새 attempt를 열 때만 허용한다. |
| state ownership | queue native state는 참고값일 뿐 canonical run state가 아니다. |

v1에서 일부러 하지 않는 것:

- 다중 broker 분산 설계
- queue 자체를 audit source of truth로 취급
- workflow engine이 retry/terminal status를 자동 결정하게 위임

## 4. Day-One Operational Baseline

### 4.1 Trace / Correlation Chain

운영자가 한 run을 끝까지 추적하려면 최소 아래 식별자 체인이 필요하다.

| 식별자 | 발급 주체 | 용도 |
| --- | --- | --- |
| `client_request_id` | FE | 사용자 재시도와 idempotency key |
| `http_request_id` | Agent API | 개별 API request correlation |
| `trace_id` | Agent API | run/plan/action/tool/mutation 전 체인 공통 correlation key |
| `run_id` | Agent API | 사용자-visible logical run 식별자 |
| `attempt_id` / `attempt_seq` | Agent API | queue retry/resume 단위 식별 |
| `queue_job_id` | Agent API -> BullMQ | transport correlation 및 QueueEvents join key |
| `plan_id` | Worker | validated execution plan 식별자 |
| `action_id` | Worker | plan action 단위 추적 |
| `tool_call_id` | Worker | tool call attempt 단위 추적 |
| `mutation_id` / `seq` | Agent API | live-commit mutation apply ordering과 ledger join key |
| `rollback_group_id` | Worker -> Agent API | compensation/cleanup 묶음 추적 |
| `draft_id` | Agent API | 생성된 editable draft 식별 |

고정 규칙:

- canonical `trace_id` 는 backend가 dedupe 판정 뒤 발급한다.
- acceptance 이후 같은 run에서 생성되는 모든 row/event/artifact는 동일 `trace_id` 를 verbatim copy한다.
- `queue_job_id` 는 BullMQ custom `jobId` 와 동일한 colon-free 값으로 고정한다.
- queue native event만으로 run 상태를 판단하지 않고 `run_id + attempt_seq + queue_job_id + last_heartbeat_at + last_acked_mutation_seq` 를 함께 본다.

### 4.2 Prompt Log Policy

v1은 prompt logging을 day one부터 "남기되, 아무 데나 남기지 않는 것" 으로 설계한다.

| 저장 대상 | 저장 위치 | 규칙 |
| --- | --- | --- |
| raw user prompt | restricted artifact store + request record | 전문 저장은 제한된 artifact reference로만 허용 |
| normalized prompt | canonical request/plan input row | planner/executor 재현에 필요한 정규화 입력 |
| redacted preview | event log / support view | 민감정보 제거 후 preview만 저장 |
| raw prompt hash | canonical row | dedupe/support correlation용 |

금지 규칙:

- raw prompt 전문을 queue payload, generic event log, SSE payload, analytics metric에 중복 저장하지 않는다.
- giant body, base64, full canvas JSON을 prompt log row에 inline 저장하지 않는다.
- prompt redaction 없는 provider request body를 운영 로그로 흘리지 않는다.

### 4.3 Tool Execution Log Policy

tool execution log는 "어떤 도구를 불렀는가" 뿐 아니라 "그 도구가 어떤 canvas side effect를 만들었는가" 까지 따라갈 수 있어야 한다.

필수 기록 항목:

- `tool_call_id`, `trace_id`, `run_id`, `attempt_seq`, `queue_job_id`
- `plan_id`, `action_id`, `tool_name`, `tool_version`
- provider/model 실제 사용값 또는 internal tool 분류
- dispatch 시각, 완료 시각, latency, `attempt_no`
- `status`, `error_class`, retryable 여부
- `prompt_log_ref`, `input_ref`, `output_ref`
- `emitted_mutation_ids`, save receipt ref, compensation ref

고정 규칙:

- action-local retry는 같은 `action_id` 아래 `attempt_no` 만 증가시키고, queue retry는 `attempt_seq` 를 증가시킨다.
- provider/model 호출 결과가 unknown이면 `status=failed` 로 단정하지 않고 `unknown side effect` 계열로 분류해 reconciliation 근거를 남긴다.
- provider response/body, large image metadata, full mutation body는 row inline 저장 대신 restricted artifact ref로 저장한다.

### 4.4 Cost Tracking Policy

v1 비용 관측은 "나중에 붙이는 대시보드"가 아니라 canonical run contract의 일부다.

| 집계 축 | 요구사항 |
| --- | --- |
| tool-call level | 각 `tool_call_id` 마다 usage, metering class, `cost_state`, `pricing_version`, estimated/final cost를 기록 |
| attempt level | `run_id + attempt_seq + queue_job_id` 축에서 retry/resume 오버헤드를 분리 추적 |
| run level | terminal 시점 immutable `agent_cost_summaries` 를 남기고 이후 재계산으로 덮어쓰지 않음 |
| provider/model level | provider/model/tool별 daily rollup을 재생성 가능해야 함 |

비용 규칙:

- `pricing_version` 은 tool call 시점에 pinning한다.
- `billable_external_usd` 와 `recovery_overhead_usd` 를 분리 저장한다.
- `0 USD` 는 `internal_metered_unpriced` 또는 `nonbillable` 인 경우에만 허용한다.
- usage를 확정할 수 없으면 `cost_state=unknown` 으로 남기고 final summary에서도 숨기지 않는다.
- run 비용은 acceptance 이후 같은 `run_id` 아래 실행된 모든 tool call을 합산한다. retry/resume은 새 attempt로 보여도 같은 run 비용에 포함한다.

### 4.5 Day-One Alert / Reporting Minimum

v1은 대규모 observability platform 없이 시작하더라도 아래 수준의 운영 가시성은 반드시 있어야 한다.

| 분류 | 최소 감시 항목 |
| --- | --- |
| orchestration health | queue publish timeout, worker pickup timeout, stalled attempt, heartbeat loss |
| user-visible latency | time-to-first-visible, editable-minimum-ready time, hard deadline 초과 비율 |
| trace integrity | terminal run인데 `trace_id` chain 또는 `queue_job_id` join 누락 |
| prompt logging | model-backed call이 있는데 `prompt_log_ref` 없음 |
| tool logging | mutation이 ack됐는데 `tool_call_id` join 불가 |
| cost visibility | terminal run인데 `agent_cost_summaries` 없음, `cost_state=unknown` 급증 |
| recovery overhead | `recovery_overhead_usd / billable_external_usd` 비율 급증 |

운영 보고는 최소 아래 projection을 재생성할 수 있어야 한다.

- `run_execution_report`
- `attempt_cost_report`
- `provider_model_daily_rollup`
- `flow_health_rollup`

즉, v1 day-one 운영 준비의 기준은 "로그가 많다" 가 아니라 "support, engineering, finance가 같은 canonical row에서 같은 답을 재생성할 수 있다" 다.

## 5. Forward-Compatibility Rules

아래 규칙은 v1 이후 edit/delete 기능 확장을 위해 지금부터 지켜야 한다.

1. create-only UX라 해도 mutation ledger는 `create/update/delete/save/compensate` 를 모두 표현할 수 있어야 한다.
2. trace/log/cost schema는 future `updateLayer`, `deleteLayer` 추가 시 새 top-level identity 체계를 만들지 않아야 한다.
3. 기존 one-shot primitive는 계속 재사용하되, prompt 해석과 run state ownership은 새 workflow layer 밖으로 새지 않아야 한다.
4. v2 기능이 열려도 backend/worker/queue 분리, prompt log policy, cost summary immutability는 다시 협상하지 않는다.

## 6. References

- [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/tooldi-agent-workflow-v1/tooldi-agent-workflow-v1-functional-spec-to-be.md)
- [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/tooldi-agent-workflow-v1/tooldi-natural-language-agent-v1-architecture.md)
- [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/tooldi-agent-workflow-v1/tooldi-agent-workflow-v1-backend-boundary.md)
- Fastify official docs: https://fastify.dev/docs/latest/
- BullMQ official docs: https://docs.bullmq.io/
