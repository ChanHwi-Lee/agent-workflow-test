# Tooldi 자연어 Agent Workflow v1 기능명세서 (TO-BE)

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi 자연어 Agent Workflow v1 기능명세서 (TO-BE) |
| 문서 목적 | 빈 캔버스 자연어 요청을 live-commit editable banner draft로 변환하는 신규 agent/workflow layer의 v1 요청/계획 계약과 실행 handoff 구조 정의 |
| 상태 | Draft |
| 작성일 | 2026-04-02 |
| 기준 시스템 | FE `toolditor`, 신규 `Fastify` Agent API, 신규 `BullMQ Worker Runtime`, 기존 Tooldi editor canvas/save 경로, `Redis` 기반 `BullMQ` queue, 기존 AI primitive tool adapters |
| 기준 데이터 | 기존 AS-IS 문서, `toolditor` 코드 정적 분석, 2026-04-02 Context7 기반 OpenAI/Replicate/Stability 공식 문서 확인 |
| 대상 독자 | FE 개발자, Agent Backend 개발자, Worker 개발자, PM/기획, QA, 인프라 담당자 |
| 문서 유형 | TO-BE |
| 이번 리비전 범위 | v1.0.5는 기존 범위 위에 `updateLayer` / `deleteLayer` mutation event schema, layer identity/versioning, `AuthoritativeCanvasFinalState` 와 canonical post-execution diff artifact를 구현 계약으로 고정한다. |
| 테스트 문서 분리 원칙 | 테스트 시나리오/케이스는 별도 문서로 관리 |
| Owner | TBD |
| Reviewers | TBD |
| Approver | TBD |

## 버전 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
| --- | --- | --- | --- |
| v1.0.7 | 2026-04-03 | Codex | canonical completion moment를 `RunCompletionRecord.draftGeneratedAt` 로 통일하고, 문서 authority/verification precedence를 architecture 문서 기준으로 고정 |
| v1.0.6 | 2026-04-03 | Codex | `NorthboundRunRequest -> AgentRunRecord` bootstrap contract, `clientRequestId` 와 backend `requestId` 분리, run-init ordering 고정 |
| v1.0.5 | 2026-04-03 | Codex | `updateLayer` / `deleteLayer` layer version guard, final canvas state/diff artifact contract 추가 |
| v1.0.4 | 2026-04-03 | Codex | stage별 detection signal, automatic recovery, terminal failure, manual intervention matrix 추가 |
| v1.0.3 | 2026-04-03 | Codex | planner/executor I/O envelope, validation gate, repair contract, span/correlation chain 명시 |
| v1.0.2 | 2026-04-02 | Codex | end-to-end traceability contract 추가, Agent API-issued `traceId` 규칙과 `queueJobId` correlation 명시 |
| v1.0.1 | 2026-04-02 | Codex | Fastify control plane, BullMQ worker runtime, Redis-backed BullMQ queue, 플랫폼 책임 경계 고정 |
| v1.0 | 2026-04-02 | Codex | pipeline failure taxonomy, retry/backoff/escalation matrix, reconciliation-first resume policy 추가 |
| v0.9 | 2026-04-02 | Codex | v1 범위/비범위 경계, non-PHP backend 원칙, edit/delete defer 규칙 명시화 |
| v0.8 | 2026-04-02 | Codex | asset/image adapter boundary, canonical request/result payload, normalized provider/storage error semantics 추가 |
| v0.7 | 2026-04-02 | Codex | live-commit persisted state model, metadata, terminal outcome contract 정리 |
| v0.6 | 2026-04-02 | Codex | text authoring tool registry와 addText/editText/style patch schema 계약 추가 |
| v0.5 | 2026-04-02 | Codex | live-commit state model, persisted status layers, terminal outcome contract 추가 |
| v0.4 | 2026-04-02 | Codex | separated worker/queue architecture, attempt lifecycle, retry/cancel ownership, failure handoff 규칙 추가 |
| v0.3 | 2026-04-02 | Codex | representative flow timing budget, timeout threshold, abort boundary 계약 추가 |
| v0.2 | 2026-04-02 | Codex | generic tool invocation contract, tool registry resolution, tool result/error/retry/traceability 계약 추가 |
| v0.1 | 2026-04-02 | Codex | v1 agent/workflow layer의 top-level request/planning 계약 초안 작성 |

## 1. 목적

본 문서는 Tooldi 편집기 안에서 자연어 요청을 받아 `계획 생성 -> live-commit 실행 -> editable draft 저장`으로 이어지는 신규 workflow layer의 v1 목표 상태를 정의한다.

이 문서의 핵심 목적은 다음과 같다.

- 빈 캔버스에서 시작하는 대표 시나리오의 입력 계약과 성공 기준을 모호하지 않게 고정한다.
- prompt ingestion, intent extraction, constraint capture, structured plan generation 계약을 독립 구현 가능 수준으로 정의한다.
- agent API와 worker runtime 사이에 separated worker/queue 경계를 강제하는 handoff schema를 정의한다.
- plan action에서 concrete tool invocation으로 이어지는 generic runtime contract를 정의한다.
- v1 사용자 표면은 empty-canvas banner draft 생성으로 제한하되, 내부 계약은 향후 `updateLayer`, `deleteLayer`까지 수용하게 설계한다.

### 1.1 Normative Precedence

- artifact identity, counted completion moment, lifecycle ownership, root contract-chain identity, ordering primitive, checkpoint/rollback semantics, primitive reuse boundary, AC closure는 [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/tooldi-agent-workflow-v1/tooldi-natural-language-agent-v1-architecture.md) 의 canonical section만 normative source로 사용한다.
- 이 문서는 product/API/persistence projection 문서다. 동일 주제를 재진술할 수는 있지만, architecture 문서가 이미 닫은 semantic contract를 override하면 안 된다.
- 따라서 이 문서의 `canonicalCompletionMoment`, `run lifecycle bootstrap`, persistence field glossary, FR/BR/NFR 표는 모두 architecture 문서의 `completion_sla_definition`, `draft_artifact_model`, `authority_matrix`, `ordering_policy` 와 동일한 용어를 재사용해야 한다.

## 2. 범위

### 2.1 In Scope

- 편집기에서 agent run을 시작하는 top-level request contract
- prompt 정규화, intent extraction, constraint capture contract
- structured execution plan schema
- generic tool invocation contract와 tool registry resolution 규칙
- 신규 non-PHP Agent API, queue, worker로 분리된 orchestration control-plane 경계
- plan을 worker 실행 경계로 전달하는 queue/message contract
- live-commit run policy, traceability, rollback metadata의 최소 계약
- 기존 one-shot AI primitive를 southbound internal tool adapter로 재사용하는 계약
- v1 사용자 표면을 empty-canvas create flow 1종으로 제한하면서 내부적으로 `updateLayer`, `deleteLayer` contract family를 reserve하는 규칙
- v1 대표 플로우
  - 빈 캔버스
  - 자연어 입력 예시: `봄 세일 이벤트 배너 만들어줘`
  - 2분 이내
  - 1개 editable banner draft 생성

### 2.2 Out of Scope

- executor의 세부 canvas mutation 알고리즘
- provider SDK wiring, model parameter tuning, prompt recipe, non-v1 image edit 알고리즘 상세
- 기존 캔버스 요소 편집/삭제를 일반 사용자 기능으로 여는 작업
- 기존 one-shot primitive flow를 확장해 새 workflow layer 자체를 대체하는 구현
- embeddings/RAG, 브랜드 자동 학습, personalization
- 복수 agent 협업, 외부 SaaS tool integration
- 자동 발행, 외부 전송, export 완료 계약
- PHP 기반 신규 backend 구현

범위 해석 규칙은 아래처럼 고정한다.

- v1에서 사용자가 직접 시작할 수 있는 run은 `빈 캔버스 -> 배너 초안 생성` 하나뿐이다.
- `updateLayer`, `deleteLayer` 는 v1에서 runtime/rollback/cleanup을 위해 이미 계약에 포함되지만, 기존 요소 대상 독립 사용자 기능은 아니다.
- 기존 T2I/Rewrite/Outpaint 같은 primitive는 재사용 가능한 내부 tool이며, run lifecycle의 canonical owner나 northbound product surface가 아니다.

## 3. 배경

현재 Tooldi AI는 T2I, Rewrite, Outpaint, Eraser, Style Change 같은 one-shot primitive 중심이다. 로컬 AS-IS 문서와 연구 문서는 현재 빈칸이 `primitive 1개 추가`가 아니라 `workflow layer`라고 정리한다.

이번 v1은 Cursor, Claude Code, Codex 계열 agent UX의 다음 패턴을 Tooldi 문맥으로 제한적으로 가져온다.

- 단일 자연어 입력으로 run 시작
- 사용자가 step 진행 상황을 보면서 기다림
- agent가 승인 대기 없이 도구를 실행
- 결과는 flat image가 아니라 편집 가능한 상태로 남음

단, Tooldi v1은 범용 open-ended agent가 아니라 `제약된 편집기 workflow` 로 시작한다. planner는 자유 텍스트가 아니라 strict schema 기반 plan JSON을 만들어야 하고, executor는 그 plan만 실행해야 한다. 이 문서에서 `planner`, `executor` 는 배포 단위가 아니라 `Worker Runtime` 내부의 논리 phase 이름으로 사용한다.

Context7로 2026-04-02 확인한 OpenAI 공식 문서 기준으로 다음 building block은 문서화 가능한 전제다.

- Structured outputs는 strict JSON schema를 지원한다.
- Function/tool calling도 strict schema 기반 파라미터 강제가 가능하다.
- strict mode는 JSON Schema subset만 보장하므로, v1 tool input/output schema도 그 subset 안에서 정의해야 한다.
- Image generation/editing은 multi-step application workflow에 넣을 수 있고, image edit에서는 input fidelity와 mask 같은 제약을 둘 수 있다.

## 4. 액터 및 전제조건

### 4.1 주요 액터

| 액터 | 설명 |
| --- | --- |
| 편집기 사용자 | 빈 캔버스에서 자연어로 draft 생성을 요청하는 로그인 사용자 |
| `toolditor` FE | prompt 입력, editor/canvas context 수집, run 시작, 진행 상태 표시 담당 |
| Agent API | `Fastify` 기반 control-plane 서비스. request validation, run 생성, plan queue publish, 상태 조회, SSE, internal worker callback 담당 |
| Worker Runtime | `BullMQ Worker` 로 실행되는 별도 execution process. intent extraction, constraint capture, structured plan generation, validated action execution, live-commit orchestration 수행 |
| Queue Broker | `Redis` 기반 `BullMQ` queue/QueueEvents. Agent API와 Worker Runtime 사이 durable dispatch, delayed retry, lease delivery를 제공하는 분리 경계 |
| Plan Store | request snapshot, intent, constraints, plan payload, revision 이력 저장 |
| Tool Registry | canonical tool 이름/버전, input/output schema, retry policy, adapter binding metadata 제공 |
| 기존 Tooldi AI primitives | image generation/edit/edit-like 작업을 내부 tool adapter로 제공하는 재사용 엔진 |
| 기존 editor canvas/save 경로 | layer 삽입, 갱신, 삭제, draft 저장의 최종 source of truth |

### 4.2 전제조건

- 사용자는 로그인 상태여야 한다.
- FE는 run 시작 시 현재 문서/페이지/캔버스 크기를 알고 있어야 한다.
- v1 사용자 표면은 `canvasState=empty` 인 경우에만 run 시작을 허용한다.
- 기존 editor는 빈 상태에서 page와 canvas size를 초기화할 수 있어야 한다.
- live-commit 모드에서는 승인 모달 없이 Worker Runtime이 허용된 canvas mutation을 즉시 오케스트레이션할 수 있어야 한다.

### 4.3 책임 경계

| 컴포넌트 | 책임 | 금지사항 |
| --- | --- | --- |
| FE | user prompt와 editor context를 모아 run 생성 요청 전송 | plan 생성, tool 선택, provider 직접 호출 |
| Fastify Agent API | request validation, idempotency, run/plan metadata 저장, queue publish, SSE fan-out, QueueEvents 기반 watchdog | canvas 직접 mutation, long-running model execution |
| BullMQ Worker Runtime | intent/constraint/plan JSON 생성, validated action 실행, mutation proposal, rollback metadata 기록 | FE를 우회한 canvas 직접 mutation, 새 사용자-visible run 생성 |
| Tool Registry | canonical tool lookup, schema/timeout/retry metadata 제공 | run orchestration, prompt interpretation |
| Existing primitives | 이미지 생성/편집 같은 내부 도구 기능 제공 | run orchestration 담당 |

### 4.4 v1 실행 플랫폼 결정

v1은 구현 후보를 열어 두지 않고 아래 플랫폼 조합을 기본값으로 고정한다.

| 축 | v1 고정 선택 | 계약상 의미 |
| --- | --- | --- |
| backend service | TypeScript/Node 기반 `Fastify` control-plane 서비스 | northbound public API, worker internal API, SSE stream, auth/session 검증, run/attempt/event/cost persistence, retry/cancel watchdog의 canonical owner |
| worker runtime | TypeScript/Node 기반 별도 `BullMQ Worker` 프로세스 | queue consumer, hydrate, plan 생성/실행, tool adapter 호출, mutation proposal, compensation, finalize payload 생성 owner |
| queue mechanism | `Redis` 기반 `BullMQ` 단일 interactive queue + `QueueEvents` | API와 worker 사이 durable handoff, delayed re-enqueue, stalled/completed/failed transport event 제공 |

이 선택의 근거는 아래와 같다.

- Tooldi/toolditor가 이미 JS/TS와 `ioredis`, `pino`, `zod` 계열 운영 문맥을 사용하고 있어 새 orchestration layer도 TypeScript로 맞추는 편이 가장 가볍다.
- Context7로 2026-04-02 확인한 Fastify 공식 문서는 JSON Schema 기반 request validation, plugin 구조, logger 통합을 제공하므로 strict run/mutation 계약을 control plane에 구현하기에 적합하다.
- Context7로 2026-04-02 확인한 BullMQ 공식 문서는 `Queue`, `Worker`, `QueueEvents`, delayed job, separate Redis connections 패턴을 제공하므로 v1의 separated worker boundary와 delayed retry/watchdog 요구를 충족한다.
- v1은 lightweight가 목표이므로 multi-broker 구성이나 별도 heavyweight workflow engine은 채택하지 않는다.

추가 고정 규칙은 아래와 같다.

- `Fastify Agent API` 와 `BullMQ Worker Runtime` 은 같은 코드 저장소/패키지를 공유할 수 있지만 같은 프로세스로 합치지 않는다.
- `BullMQ Queue` 는 transport plane일 뿐이며 canonical run state, retry budget, cancel fence, terminal 판정은 `Fastify Agent API` 가 가진다.
- `BullMQ Worker` 는 실행 owner지만 queue retry 개시 권한은 없다. retry는 backend가 새 attempt를 enqueue할 때만 열린다.
- `QueueEvents` 는 watchdog와 관측 입력으로만 사용하며, audit source of truth로 승격하지 않는다.

## 5. 용어 정의

| 용어 | 정의 |
| --- | --- |
| Agent Run | 사용자의 한 번의 자연어 요청으로 생성되는 workflow 실행 단위 |
| Request Envelope | FE가 Agent API로 보내는 top-level 입력 계약 |
| Intent Envelope | planner가 request를 해석한 구조화 intent 결과 |
| Constraint Pack | 명시 제약, 환경 제약, 정책 제약, 추론 기본값, 누락 사실을 함께 담는 planning 입력 |
| Execution Plan | executor가 그대로 소비할 수 있는 strict JSON plan |
| Plan Action | execution plan 안의 개별 실행 step |
| Tool Registry | planner/executor가 공유하는 canonical tool catalog와 contract metadata |
| Tool Invocation | executor가 plan action을 concrete adapter call로 바꾸는 1회 실행 envelope |
| Tool Call Attempt | 동일 action/tool에 대한 개별 재시도 단위 |
| Live-Commit | 승인 대기 없이 실행 중 canvas/doc 상태를 실제로 변경하는 모드 |
| Commit Group | 여러 action을 하나의 논리적 mutation 묶음으로 보는 단위 |
| Placeholder Copy | 사용자가 제공하지 않은 사실 영역을 비워 두거나 일반 문구로 남기는 editable copy |
| Fact-safe | 사용자 미제공 브랜드/가격/일자/효능을 만들어내지 않는 정책 |

## 6. 사용자 시나리오

### UC-01. 빈 캔버스에서 봄 세일 배너 초안을 생성한다

1. 사용자는 빈 캔버스 상태의 editor에서 `봄 세일 이벤트 배너 만들어줘`를 입력한다.
2. FE는 현재 page, canvas width/height, `WorkingTemplateCode`, canvas empty 여부를 포함한 request envelope를 `POST /api/agent-workflow/runs`로 보낸다.
3. Agent API는 request를 검증하고 `runId`, `traceId`, public `status=queued`(internal canonical state는 `planning_queued`)를 반환한 뒤 worker queue에 메시지를 발행한다.
4. Worker Runtime은 queue에서 run job을 dequeue한 뒤 intent를 `create_template/banner`로 추출하고, 누락된 브랜드/가격/상품 사실은 `missingFacts`로 남긴다.
5. Worker Runtime은 1개 editable banner draft를 만들기 위한 structured execution plan을 생성하고 plan store에 저장한다.
6. Worker Runtime은 같은 attempt 안에서 validated `planId`를 실행 단계로 넘긴다.
7. Worker Runtime은 plan action을 순차 실행해 background, headline, supporting copy, CTA, hero visual slot을 현재 문서에 live-commit으로 반영한다.
8. 사용자는 생성 중 step log를 보고, 완료 후 개별 layer를 직접 수정할 수 있다.

### UC-02. 사실 정보가 부족한 경우 generic editable draft로 대체한다

1. 사용자가 할인율, 브랜드명, 상품명 없이 계절/행사성 요청만 입력한다.
2. Planner는 `brandName`, `discountValue`, `productName`을 missing fact로 기록한다.
3. Planner는 누락 사실을 허위로 채우지 않고 generic headline, generic CTA, editable placeholder 또는 해당 슬롯 생략으로 plan을 만든다.

### UC-03. 향후 기존 캔버스 요소 수정/삭제로 확장한다

1. 이후 v2에서 사용자는 특정 layer를 선택한 뒤 `헤드라인만 더 짧게 바꿔줘` 또는 `이 배지 지워줘`를 입력한다.
2. 같은 request/intent/plan 구조를 사용하되, intent만 `update_layer` 또는 `delete_layer`로 바뀐다.
3. executor는 같은 action schema의 `updateLayer`, `deleteLayer`를 실행한다.

## 7. 기능 요구사항

### 7.1 대표 플로우 성공 기준

| ID | 요구사항 | 우선순위 |
| --- | --- | --- |
| FR-001 | 시스템은 v1 대표 플로우에서 빈 캔버스 자연어 요청 1건당 1개의 editable banner draft만 생성해야 한다. | High |
| FR-002 | 시스템은 대표 플로우를 run 시작부터 draft 저장 완료까지 120000ms 이내 완료 목표로 설계해야 한다. | High |
| FR-003 | 시스템은 완료된 draft에 최소 `background layer`, `headline text layer`, `supporting copy layer`, `CTA layer`, `decoration layer`, `저장된 문서 상태`를 남겨야 한다. | High |
| FR-004 | 시스템은 사용자 미제공 브랜드명, 가격, 날짜, 효능 claim을 사실처럼 생성하지 않아야 한다. | High |

#### 7.1.1 시간 budget / timeout / abort boundary

| milestone | target | hard cutoff | 시스템 처리 |
| --- | --- | --- | --- |
| request accepted + queue ack | `2000ms` | `5000ms` | queue ack 실패 시 `enqueue_timeout`으로 종료하고 canvas mutation은 시작하지 않는다. |
| validated plan ready | `15000ms` | `25000ms` | `25000ms` 내 plan validation 실패 시 execution phase 진입을 금지하고 `planning_timeout` 또는 `plan_validation_failed`로 종료한다. |
| first skeleton visible | `20000ms` | `35000ms` | `35000ms`까지 첫 mutation ack가 없으면 `skeleton_timeout`으로 종료한다. |
| editable minimum ready | `60000ms` | `75000ms` | `75000ms`를 넘기면 `salvage_only` 모드로 전환해 optional asset 작업을 중단한다. |
| save started | `95000ms` | `105000ms` | `105000ms` 이후에는 새 mutation 시작을 금지하고 `saveDraft` 또는 compensation만 허용한다. |
| hard deadline | `120000ms` | `120000ms` | 진행 중 call을 취소하고 `completed`, `completed_with_warning`, `save_failed_after_apply`, `failed` 중 하나로 강제 종료한다. |

`editable minimum ready`는 최소 background, headline, supporting copy, CTA, decoration layer가 실제 편집 가능한 상태로 페이지에 존재하고 pending mutation이 남지 않은 상태를 뜻한다.

#### 7.1.2 Live-Commit State Model

v1은 queue transport 상태, worker 실행 상태, draft 완성 상태, mutation apply 상태를 하나의 enum으로 섞지 않고 별도 durable field로 저장해야 한다.

canonical persisted state surface는 최소 아래 4개다.

- `agent_runs.status`: API와 운영자가 보는 run 상위 lifecycle
- `agent_run_attempts.attempt_state`: queue/worker 관점의 개별 attempt lifecycle
- `agent_drafts.draft_state`: 실제 배너 초안이 얼마나 visible/editable/save-safe 한지에 대한 artifact lifecycle
- `agent_mutation_ledger.apply_status`: live-commit mutation/save/compensation의 apply 결과

queue broker의 `waiting`, `active`, `failed` 같은 native 상태는 참고용일 뿐 canonical source of truth가 아니다.

##### 7.1.2.1 Canonical Run Status

`agent_runs.status` 는 아래 enum만 허용한다.

| 상태 | 구분 | 진입 트리거 | 다음 가능 상태 |
| --- | --- | --- | --- |
| `enqueue_pending` | active-internal | run row는 생성됐지만 worker queue publish ack 전 | `planning_queued`, `failed` |
| `planning_queued` | active | worker queue publish ack 성공 | `planning`, `cancel_requested`, `failed`, `cancelled` |
| `planning` | active | worker attempt dequeue 후 첫 heartbeat 또는 planning phase append 수신 | `plan_ready`, `cancel_requested`, `failed`, `cancelled` |
| `plan_ready` | active | validated plan 저장 완료 + 같은 attempt 안에서 execution phase open | `executing`, `cancel_requested`, `failed`, `cancelled` |
| `executing` | active | worker execution phase에서 action dispatch 시작, pending FE apply ack 없음 | `awaiting_apply_ack`, `saving`, `cancel_requested`, `failed`, `save_failed_after_apply` |
| `awaiting_apply_ack` | active | user-visible mutation 또는 compensation mutation을 FE에 dispatch한 직후 | `executing`, `saving`, `finalizing`, `cancel_requested`, `failed`, `save_failed_after_apply` |
| `saving` | active | milestone save 또는 final save mutation을 dispatch해 save ack를 기다리는 중 | `executing`, `finalizing`, `cancel_requested`, `save_failed_after_apply`, `failed` |
| `finalizing` | active | 더 이상 새 user-visible mutation을 시작하지 않고 final diff/cost/outcome을 기록하는 중 | `completed`, `completed_with_warning`, `save_failed_after_apply`, `failed`, `cancelled` |
| `cancel_requested` | active-fenced | 사용자 stop 또는 backend cancel fence를 durable 저장했고 새 action 시작을 금지한 상태 | `cancelled`, `completed`, `completed_with_warning`, `save_failed_after_apply`, `failed` |
| `completed` | terminal-success | final save ack, final summary persistence, 성공 기준 충족 | 없음 |
| `completed_with_warning` | terminal-success | final save ack는 있으나 fallback, optional asset 생략, 경고가 남음 | 없음 |
| `save_failed_after_apply` | terminal-failure | editable minimum은 보였지만 latest revision save receipt를 확보하지 못함 | 없음 |
| `failed` | terminal-failure | editable minimum 이전 치명적 실패, timeout, unrecoverable conflict | 없음 |
| `cancelled` | terminal-neutral | cooperative stop과 pending ack 정리가 끝났고 run을 취소로 닫음 | 없음 |

##### 7.1.2.2 Run Transition Triggers

| 현재 상태 | 트리거 | 다음 상태 |
| --- | --- | --- |
| `enqueue_pending` | worker queue publish ack 성공 | `planning_queued` |
| `enqueue_pending` | enqueue timeout 또는 queue publish 실패 | `failed` |
| `planning_queued` | worker attempt dequeue + 첫 heartbeat 확인 | `planning` |
| `planning_queued` | cancel accepted, 아직 live mutation 0건 | `cancelled` |
| `planning` | validated plan persisted + 같은 attempt execution phase open | `plan_ready` |
| `planning` | re-plan budget 소진, schema validation 실패, planning timeout | `failed` |
| `plan_ready` | 첫 tool/action dispatch | `executing` |
| `executing` | canvas mutation/compensation mutation dispatch | `awaiting_apply_ack` |
| `executing` | saveDraft dispatch | `saving` |
| `awaiting_apply_ack` | non-save mutation ack 성공 + 후속 action 남음 | `executing` |
| `awaiting_apply_ack` | pending mutation 전부 ack 성공 + 다음 단계가 saveDraft | `saving` |
| `awaiting_apply_ack` | ack reject/timed_out, editable minimum 미도달, compensation 불가 | `failed` |
| `saving` | milestone save ack 성공 + refinement action 허용 시간 남음 | `executing` |
| `saving` | final save ack 성공 + pending mutation 0건 | `finalizing` |
| `saving` | latest save 실패, editable minimum은 충족 | `save_failed_after_apply` |
| `planning`, `plan_ready`, `executing`, `awaiting_apply_ack`, `saving` | cancel accepted | `cancel_requested` |
| `cancel_requested` | worker stop 확인 + pending ack/cleanup 정리 완료 | `cancelled` |
| `cancel_requested` | stop 이전에 final save와 summary가 이미 확정됨 | `completed` 또는 `completed_with_warning` |
| `planning`, `plan_ready`, `executing`, `awaiting_apply_ack`, `saving` | hard deadline 초과, editable minimum 미도달 | `failed` |
| `executing`, `awaiting_apply_ack`, `saving`, `finalizing`, `cancel_requested` | hard deadline 초과, editable minimum 도달했으나 latest save receipt 없음 | `save_failed_after_apply` |
| `finalizing` | warning 0건, fallback 0건, success criteria 충족 | `completed` |
| `finalizing` | success criteria는 충족했으나 warning/fallback 존재 | `completed_with_warning` |

추가 규칙:

- `awaiting_apply_ack` 는 live-commit의 핵심 durable 상태다. FE apply 결과를 받기 전 executor는 같은 `commitGroup` 의 다음 action을 시작하면 안 된다.
- `cancel_requested` 는 fence 상태이며 terminal 상태가 아니다. 이미 dispatch된 mutation/save의 ack reconciliation이 끝나야만 `cancelled` 또는 다른 terminal outcome으로 닫을 수 있다.
- `salvage_only` 와 `mutation_frozen` 은 별도 `execution_mode` 필드로 표현하며 `status` enum을 늘리지 않는다.
- public/SSE contract는 필요 시 `enqueue_pending` + `planning_queued` 를 `queued` 로, `awaiting_apply_ack` 를 `applying` 으로, `completed_with_warning` 를 `partially_completed` 로 압축 노출할 수 있다.

##### 7.1.2.3 Attempt, Draft, Mutation State Enums

| 엔티티 | 필드 | 허용 상태 |
| --- | --- | --- |
| `agent_run_attempts` | `attempt_state` | `enqueued`, `dequeued`, `hydrating`, `running`, `awaiting_ack`, `retry_waiting`, `finalizing`, `succeeded`, `failed`, `cancel_requested`, `cancelled` |
| `agent_drafts` | `draft_state` | `reserved`, `first_visible`, `editable_minimum_ready`, `milestone_saved`, `final_saved`, `abandoned` |
| `agent_mutation_ledger` | `apply_status` | `dispatched`, `acked`, `rejected`, `timed_out`, `compensated`, `cancelled` |
| `agent_mutation_ledger` | `ack_outcome` | `applied`, `noop_already_applied`, `rejected`, `reconciled_applied`, `reconciled_not_applied` |

state 의미는 아래처럼 고정한다.

- `agent_run_attempts.awaiting_ack`: 마지막 mutation/save가 FE에 전달됐고 canonical ack가 아직 없는 상태
- `agent_drafts.first_visible`: 첫 acked mutation으로 사용자가 배너 방향성을 볼 수 있는 상태
- `agent_drafts.editable_minimum_ready`: background, headline, supporting copy, CTA, decoration이 editable layer로 존재하고 pending apply가 0건인 상태
- `agent_drafts.milestone_saved`: editable minimum 시점 save receipt 확보
- `agent_drafts.final_saved`: final save receipt가 latest revision과 일치
- `agent_drafts.abandoned`: run이 실패/취소로 끝나 final saved draft로 승격되지 못함

##### 7.1.2.4 Required Persisted Metadata

| 엔티티 | 필드 | 언제 필수인지 | 목적 |
| --- | --- | --- | --- |
| `agent_runs` | `run_id`, `trace_id`, `status`, `status_reason_code` | 항상 | canonical lifecycle, machine-readable transition reason |
| `agent_runs` | `request_snapshot_ref`, `page_lock_token`, `deadline_at`, `time_budget_ms` | `enqueue_pending`부터 | replay 없는 hydrate, lock, timeout 판정 |
| `agent_runs` | `active_attempt_seq`, `active_attempt_id`, `plan_id`, `plan_version` | `planning`부터, plan 확정 후에는 항상 | queue/worker handoff와 validated plan 추적 |
| `agent_runs` | `draft_id`, `rollback_checkpoint_revision`, `execution_mode` | `executing`부터 | live-commit draft identity와 salvage/freeze 판정 |
| `agent_runs` | `last_emitted_mutation_seq`, `last_acked_mutation_seq`, `pending_mutation_count` | 첫 mutation dispatch 이후 | FE ack gating, resume, blind replay 방지 |
| `agent_runs` | `first_visible_at`, `editable_minimum_at`, `editable_minimum_revision` | 각 milestone 달성 시 즉시 | UX milestone, salvage cutoff, SLA 판정 |
| `agent_runs` | `latest_save_receipt_id`, `latest_saved_revision`, `latest_save_reason` | 첫 save dispatch/ack 이후 | durability 판정, final outcome 판정 |
| `agent_runs` | `warning_count`, `fallback_count`, `final_error_code`, `cancel_reason` | 해당 이벤트 발생 시 | user summary, analytics, retry/cancel audit |
| `agent_runs` | `completed_at`, `final_revision`, `final_canvas_state_ref`, `final_layer_diff_summary_ref`, `cost_summary_ref` | terminal 시 항상 | authoritative final state, 완료 증빙, observability, billing |
| `agent_run_attempts` | `attempt_id`, `run_id`, `attempt_seq`, `attempt_state`, `queue_job_id` | 항상 | queue resume와 retry canonical source |
| `agent_run_attempts` | `worker_id`, `started_at`, `last_heartbeat_at`, `lease_expires_at` | dequeue 이후 | stalled detection, cooperative stop |
| `agent_run_attempts` | `stop_requested_at`, `stop_reason`, `retry_budget_remaining` | cancel/retry 관련 시 | cancel fence와 bounded retry 판단 |
| `agent_drafts` | `draft_id`, `run_id`, `document_id`, `page_id`, `draft_state` | draft row 생성 시 항상 | editable artifact identity |
| `agent_drafts` | `root_layer_ids`, `editable_layer_ids`, `slot_bindings` | 첫 visible 이후 | v2 `updateLayer`/`deleteLayer`, rollback, selection handoff |
| `agent_drafts` | `first_visible_mutation_id`, `first_visible_at`, `editable_minimum_at`, `editable_minimum_revision` | milestone 달성 시 | UX and QA evidence |
| `agent_drafts` | `milestone_save_receipt_id`, `final_save_receipt_id`, `final_saved_revision` | save ack 이후 | saved draft durability chain |
| `agent_drafts` | `warning_count`, `fallback_count`, `abandoned_reason_code` | 경고/실패/취소 시 | terminal summary와 analytics |
| `agent_mutation_ledger` | `mutation_id`, `run_id`, `draft_id`, `action_id`, `tool_call_id`, `seq`, `apply_status` | 항상 | live-commit traceability |
| `agent_mutation_ledger` | `mutation_kind`, `commit_group`, `base_revision`, `dispatched_at` | dispatch 시 | ordering, rollback, timeout 판단 |
| `agent_mutation_ledger` | `ack_revision`, `acked_at`, `resolved_layer_ids`, `ack_outcome`, `command_results_ref`, `error_code` | ack/reject/timed_out 시 | layer identity resolution, reconciliation 근거, retry class 결정 |
| `agent_mutation_ledger` | `compensates_mutation_id`, `compensated_at` | compensation 시 | rollback provenance |

##### 7.1.2.5 Terminal Outcomes

| terminal 상태 | 진입 조건 | 필수 증빙 | 사용자 의미 |
| --- | --- | --- | --- |
| `completed` | final save ack 확보, editable minimum 충족, warning/fallback이 success bar를 넘지 않음 | `final_revision`, `final_save_receipt_id`, `draftState=final_saved`, final layer diff summary | 편집 가능한 배너 초안이 저장까지 끝난 정상 완료 |
| `completed_with_warning` | final save ack 확보, editable minimum 충족, optional asset fallback 또는 warning 존재 | `final_revision`, `final_save_receipt_id`, `warningCount>0` 또는 `fallback_count>0`, warning summary | 초안은 usable하지만 품질/자산 일부가 degraded 됨 |
| `save_failed_after_apply` | editable minimum은 캔버스에 보였지만 latest revision save receipt 없음 | `editableMinimumAt`, `editableMinimumRevision`, save failure code, latest visible layer summary | 사용자는 화면상 초안을 봤지만 durability가 보장되지 않는 실패 |
| `failed` | editable minimum 이전 실패, hard deadline 초과, unrecoverable conflict, plan/executor fatal error | terminal error code, last successful state, rollback/cleanup summary | usable draft를 남기지 못한 실패 |
| `cancelled` | user/backend cancel 후 cooperative stop 및 pending ack 정리 완료 | `cancel_reason`, `cancel_requested_at`, final cleanup summary | 사용자가 중간에 중단했고 run이 더 이상 진행되지 않음 |

terminal 상태 공통 규칙:

- terminal status에 들어간 후에는 새 `createLayer`, `updateLayer`, `deleteLayer`, `saveDraft` action을 시작할 수 없다.
- `completed` 와 `completed_with_warning` 만 대표 시나리오 성공으로 간주한다.
- `save_failed_after_apply` 는 partial visibility가 있었더라도 대표 시나리오 성공으로 간주하지 않는다.

##### 7.1.2.6 State Transition Execution / Commit Boundary Contract

아래 표는 `agent_runs.status` 전이마다 어느 시점에 durable write가 먼저 확정되어야 하는지, 어디까지를 replay 가능한 execution boundary로 볼지, workflow state와 실제 editor/template side effect 사이에 어떤 불일치를 허용하는지 고정한다.

| 전이 | 실행 owner / 시작 조건 | status 전이 전에 반드시 확정돼야 하는 durable write | idempotency / replay / resume rule | consistency guarantee |
| --- | --- | --- | --- | --- |
| `enqueue_pending -> planning_queued` | Agent API. queue publish ack 수신 | `agent_run_requests` 에 `requestId`, `clientRequestId`, `snapshotId`; `agent_runs` 에 `requestId`, `requestSnapshotRef`, `pageLockToken`, `active_attempt_seq=1`; `agent_run_attempts` 에 `attempt_state=enqueued`, `queueJobId` 저장 | 동일 `clientRequestId + editorSessionId + scenarioKey + documentId + pageId` 재전송은 새 run을 만들지 않고 기존 `runId` 를 재반환한다. publish ack가 없으면 replay 가능한 side effect는 `NorthboundRunRequest` 와 `AgentRunRecord(status=enqueue_pending)` 뿐이며 queue 재발행 전까지 status를 올리면 안 된다. | `planning_queued` 는 "durable queue handoff가 1회 이상 존재함"을 의미한다. 이 상태에서는 editor/template side effect가 0건이어야 한다. |
| `planning_queued -> planning` | Worker dequeue 후 첫 heartbeat 또는 planning phase append | `agent_run_attempts.worker_id`, `startedAt`, `last_heartbeat_at`, `attempt_state=running` | queue redelivery가 와도 같은 attempt에 이미 lease owner가 기록돼 있으면 중복 pickup으로 간주하고 새 execution을 열지 않는다. hydrate는 `requestSnapshotRef` 기준 pure replay여야 한다. | `planning` 은 "유일한 active worker owner가 있고 아직 user-visible mutation이 없음"을 보장한다. |
| `planning -> plan_ready` | Worker가 validated plan 생성 | `agent_plans` row와 `planId`, `planVersion`, `schema_version`, `payload`; `agent_runs.plan_id`, `planVersion` 갱신 | invalid plan은 저장하거나 replay source로 쓰면 안 된다. re-plan은 새 `planVersion` 으로만 허용되며, 이전 invalid output은 resume 근거가 될 수 없다. | `plan_ready` 는 "실행 가능한 canonical plan이 durable하게 존재함"을 의미하며 canvas/template side effect는 여전히 0건이다. |
| `plan_ready -> executing` | 첫 action dispatch 시작. asset prep 또는 canvas/document action 포함 | `agent_action_logs`/`agent_tool_calls` 에 첫 action attempt row, `active_attempt_id`, `execution_mode` 갱신 | resume 시 시작점은 항상 latest validated plan의 첫 미완료 action이다. 이미 `succeeded` 또는 `skipped` 로 기록된 action은 재실행하지 않는다. | `executing` 은 "plan execution이 시작됨"만 의미한다. user-visible side effect가 있다는 뜻은 아니며, editor와 workflow는 아직 `last_acked_mutation_seq` 기준으로 일치한다. |
| `executing -> awaiting_apply_ack` | mutation-emitting action 또는 compensation action dispatch | `agent_mutation_ledger` 에 `mutationId`, `seq`, `commitGroup`, `baseRevision`, `toolCallId`, `applyStatus=dispatched`; `agent_runs.last_emitted_mutation_seq`, `pending_mutation_count` 갱신 후 event log append | `ExecutionPlan.actions[].idempotency_key` 는 stable logical key이며 retry/resume 동안 바뀌지 않는다. 동일 key와 동일 `commitGroup` 으로 이미 ledger row가 있으면 새 mutation을 만들지 말고 기존 `mutationId/seq` 를 재사용 또는 reconciliation 해야 한다. | `awaiting_apply_ack` 는 control plane이 editor보다 앞설 수 있는 유일한 대표 상태다. 다만 열린 불일치는 `acked` 되지 않은 현재 `commitGroup` 1개 범위로 제한된다. 이 상태에서는 milestone/draft 승격을 금지한다. |
| `awaiting_apply_ack -> executing` | non-save mutation의 FE ack 성공 + 후속 action 존재 | `agent_mutation_ledger.apply_status=acked`, `ackRevision`, `acked_at`, `resolvedLayerIds`; `agent_runs.last_acked_mutation_seq`, `pending_mutation_count`; 필요 시 `agent_drafts.first_visible` 또는 `editable_minimum_ready` 승격 | resume cursor는 항상 `last_acked_mutation_seq + 1` 또는 다음 미완료 action으로 계산한다. 이미 `acked` 된 `commitGroup` 은 blind replay 금지다. 이후 action의 `baseRevision` 은 방금 ack된 revision 이상이어야 한다. | 이 전이가 끝나면 해당 `commitGroup` 은 editor에서 committed된 것으로 본다. workflow state와 editor visible state는 다시 같은 prefix(`seq <= last_acked_mutation_seq`)에서 일치한다. |
| `executing` 또는 `awaiting_apply_ack -> saving` | milestone 또는 final save action dispatch. 선행 non-save pending=0 | `agent_mutation_ledger` 에 save 성격 row 또는 동등 save ledger row, `mutation_kind=save`, `baseRevision=현재 latest acked revision`; `agent_runs.latest_save_reason` 업데이트 | save action도 자체 stable `idempotencyKey` 를 가진다. 동일 save key의 이전 결과가 있으면 save receipt lookup 후 재사용해야 하며, receipt 존재 여부를 확인하기 전 중복 save를 발행하면 안 된다. | `saving` 은 "가장 최근 visible revision을 durable template revision으로 맞추는 중"을 뜻한다. 저장 대상 revision은 dispatch 시점의 latest acked visible revision으로 고정된다. |
| `saving -> executing` | milestone save ack 성공 + refinement 시간/예산 남음 | `latest_save_receipt_id`, `latest_saved_revision`, `latest_save_reason`; 필요 시 `agent_drafts.milestone_saved` | 같은 milestone save는 receipt가 이미 있으면 replay 없이 success로 간주한다. 후속 resume은 next action부터 진행하며, milestone save를 반복하지 않는다. | 이 전이 후 workflow는 "현재 visible revision 중 최소 editable milestone까지는 durable하게 저장됨"을 보장한다. 이후 새 mutation은 `latest_saved_revision` 이상을 base로 삼아야 한다. |
| `saving -> finalizing` | final save ack 성공 + pending mutation 0 | `latest_save_receipt_id`, `latest_saved_revision`, `final_save_receipt_id`, `final_saved_revision`, `agent_drafts.draft_state=final_saved` | worker finalize가 유실돼도 backend는 save receipt chain만으로 이 지점부터 resume 가능하다. final save가 receipt로 확인되면 save replay를 다시 열지 않는다. | `finalizing` 은 visible editor state와 latest durable template revision이 동일 revision으로 수렴했음을 뜻한다. 이 이후에는 새 user-visible mutation 시작 금지다. |
| `planning`/`plan_ready`/`executing`/`awaiting_apply_ack`/`saving` -> `cancel_requested` | backend가 cancel intent durable 기록 | `agent_runs.cancel_reason`, `status=cancel_requested`; active attempt에 `stop_requested_at`, `stop_reason` 기록 | cancel 이후 resume은 "cleanup/finalize 전용" 모드만 허용한다. 새 draft 확장 action, 새 commitGroup 시작, speculative replay는 금지한다. | `cancel_requested` 는 editor/template 상태가 아니라 workflow fence 상태다. 이미 dispatch된 mutation/save의 결과는 끝까지 reconciliation 해야 한다. |
| `cancel_requested -> cancelled` | worker cooperative stop + pending ack/cleanup 종료 | 모든 open ledger row가 `acked`, `rejected`, `timed_out`, `compensated`, `cancelled` 중 하나로 닫힘; page lock 해제 준비 | cancel 직전 열린 `commitGroup` 은 cleanup 또는 compensation으로만 닫을 수 있다. cancel 완료 후 동일 run resume은 금지한다. | `cancelled` 는 "더 이상 실행 중인 owner가 없고 open mutation/save가 없음"을 보장한다. editor에 남은 결과가 있더라도 workflow는 immutable terminal이다. |
| `finalizing -> completed` 또는 `completed_with_warning` | backend가 final summary, cost, layer diff 기록 완료 | `completed_at`, `final_revision`, `final_layer_diff_summary_ref`, `cost_summary_ref`, terminal status | duplicate finalize 요청은 `runId + final_save_receipt_id` 기준 idempotent 처리한다. 이미 terminal이면 same outcome만 재반환한다. | terminal success는 반드시 `final_save_receipt_id != null` 이고 `final_revision == latest_saved_revision` 일 때만 가능하다. dispatch-only state로는 success를 선언할 수 없다. |
| active 상태 -> `save_failed_after_apply` | editable minimum은 달성했으나 latest visible revision에 대응하는 save receipt 확보 실패 | terminal error code, `editableMinimumRevision`, latest visible layer summary, failure summary | 이미 ack된 visible mutation은 replay 대상이 아니다. recovery는 save receipt lookup으로만 먼저 시도하고, 미확정이면 이 terminal 상태로 닫는다. | 이 상태는 editor visible state가 workflow보다 앞서 있지만 template durability가 뒤처진 경우만 의미한다. "보이는 초안 있음, durable save 없음"이 canonical interpretation이다. |
| active 상태 -> `failed` | editable minimum 이전 fatal error 또는 unrecoverable conflict | `final_error_code`, last successful state, cleanup/rollback summary, `agent_drafts.abandoned_reason_code` | terminal fail 이전에 retry가 열리려면 non-terminal attempt row와 resume cursor가 있어야 한다. terminal `failed` 로 닫힌 뒤 동일 run의 blind restart는 금지다. | `failed` 는 usable draft를 canonical success artifact로 인정하지 않는다. 일부 speculative mutation이 있었더라도 cleanup summary 없이는 terminal fail로 닫을 수 없다. |

##### 7.1.2.7 Idempotency, Replay, Resume, and Consistency Rules

1. idempotency scope는 세 층으로 분리한다.
   - request-level: `clientRequestId + editorSessionId + scenarioKey + documentId + pageId` 는 run acceptance dedupe key다.
   - action-level: `ExecutionPlan.actions[].idempotency_key` 는 logical action/save dedupe key다. retry, delayed re-enqueue, worker resume 동안 값이 바뀌면 안 된다.
   - attempt-level: `toolCallId` 와 `actionAttemptSeq` 는 observability와 timeout ownership용이다. 중복 side effect 차단 키로 쓰면 안 된다.
2. resume source of truth는 `latest validated plan + agent_runs.last_acked_mutation_seq + agent_mutation_ledger + latest save receipt` 조합이다.
3. `last_emitted_mutation_seq == last_acked_mutation_seq` 이고 open save가 없을 때만 executor는 다음 미완료 action/commit group으로 전진할 수 있다.
4. `last_emitted_mutation_seq > last_acked_mutation_seq` 또는 save ledger가 `dispatched` 인 상태에서는 run을 `mutation_frozen` 또는 동등 guard 상태로 보고, open entry마다 먼저 reconciliation을 수행해야 한다.
5. `unknown_apply_state` 는 재실행 허가가 아니라 reconciliation 필요 신호다. backend/worker는 같은 `idempotencyKey`, `toolCallId`, `mutationId`, `saveReceiptId` 를 조회해 이미 반영됐는지 먼저 증명해야 한다.
6. replay는 아래 순서로만 허용한다.
   - 이미 `acked` 인 mutation/save면 replay 금지
   - `rejected` 또는 `timed_out` 이고 side effect 미발생이 확인되면 같은 action의 새 attempt 허용
   - 상태가 불명확하면 editor/save lookup을 통해 `acked` 또는 `not_applied` 로 먼저 수렴
   - 현재 `commitGroup` 이 정리되기 전에는 다음 `commitGroup` 시작 금지
7. `commitGroup` 은 user-visible forward progress의 최소 단위다. 같은 group에서 방출된 mutation/save는 전부 terminal apply 상태가 되기 전까지 다음 group action을 시작할 수 없다.
8. control plane과 editor/template 사이의 consistency model은 cross-system atomic transaction이 아니라 prefix consistency다.
   - workflow는 `seq <= last_acked_mutation_seq` 범위의 editor visible state를 canonical committed prefix로 본다.
   - `awaiting_apply_ack` 또는 `saving` 에서는 최대 1개의 open commit boundary만 존재할 수 있다.
   - `agent_drafts.first_visible` 은 dispatch가 아니라 첫 `acked` mutation 이후에만 설정할 수 있다.
   - `agent_drafts.editable_minimum_ready` 는 required layer set이 모두 `acked` 되고 `pending_mutation_count=0` 일 때만 설정할 수 있다.
   - `agent_drafts.milestone_saved` 와 `final_saved` 는 save receipt revision이 당시 latest acked visible revision과 일치할 때만 설정할 수 있다.
   - `completed` 와 `completed_with_warning` 은 `final_save_receipt_id` 없이 진입할 수 없다.
   - `save_failed_after_apply` 는 `latest_saved_revision < latest acked visible revision` 또는 receipt 부재를 explicit하게 의미해야 한다.

### 7.2 Prompt Ingestion

| ID | 요구사항 | 우선순위 |
| --- | --- | --- |
| FR-005 | 시스템은 신규 workflow layer의 공식 진입점으로 `POST /api/agent-workflow/runs`를 제공해야 한다. | High |
| FR-006 | 시스템은 public request envelope에 최소 `clientRequestId`, `editorSessionId`, `prompt`, `locale`, `editorContext`, `runPolicy`를 받아야 한다. accepted northbound request row의 canonical `requestId` 와 `traceId` 는 client-authored field가 아니다. | High |
| FR-006A | 시스템은 `clientRequestId + editorSessionId + scenarioKey + documentId + pageId` dedupe를 먼저 판정한 뒤, 새 run일 때만 Agent API에서 canonical `requestId`, `runId`, `traceId` 를 발급해야 한다. 같은 dedupe key의 재전송은 기존 `runId` 와 기존 `traceId` 를 재반환해야 한다. | High |
| FR-006B | 시스템은 모든 HTTP ingress마다 별도 `httpRequestId` 를 생성해 응답 header와 구조화 로그에 남겨야 하며, browser가 보낸 임의 request-id 값을 canonical request id로 신뢰하지 않아야 한다. | Medium |
| FR-006C | 시스템은 canonical `traceId` 를 `RunAccepted`, SSE event, queue message, worker callback, tool invocation, mutation/save/final summary까지 명시적으로 전파해야 한다. | High |
| FR-007 | 시스템은 `editorContext`에 최소 `documentId`, `pageId`, `canvasState`, `canvasWidth`, `canvasHeight`, `sizeSerial`, `workingTemplateCode`를 포함해야 한다. | High |
| FR-008 | 시스템은 raw prompt를 원문 그대로 저장하되, planner 입력용 normalized prompt를 별도 필드로 생성해야 한다. | High |
| FR-009 | 시스템은 v1 사용자 표면에서 `canvasState=non_empty` request를 `unsupported_existing_canvas`로 차단해야 한다. | High |
| FR-010 | 시스템은 request 수락 시 동기 plan 생성을 수행하지 않고 worker queue publish 후 `202 Accepted`를 반환해야 한다. | High |
| FR-011 | 시스템은 동일 `requestId`가 같은 `editorSessionId`에서 재전송되면 동일 `runId`를 반환하는 idempotency를 제공해야 한다. | High |

### 7.3 Intent Extraction

| ID | 요구사항 | 우선순위 |
| --- | --- | --- |
| FR-012 | 시스템은 request envelope를 `Intent Envelope`로 변환해야 한다. | High |
| FR-013 | `Intent Envelope.operation_family` enum은 최소 `create_template`, `update_layer`, `delete_layer`를 지원해야 한다. | High |
| FR-014 | 시스템은 v1 사용자 표면에서 `create_template` 외 intent를 plan 생성 전에 차단하거나 deferred 처리해야 한다. | High |
| FR-015 | `Intent Envelope`는 최소 `artifactType`, `goalSummary`, `confidence`, `supportedInV1`, `blockingReason`, `requestedOutputCount`를 포함해야 한다. | High |
| FR-016 | 시스템은 intent extraction 결과에 `futureCapableOperations`를 기록해 현재 UX 범위와 schema 가능 범위를 분리해야 한다. | Medium |

### 7.4 Constraint Capture

| ID | 요구사항 | 우선순위 |
| --- | --- | --- |
| FR-017 | 시스템은 planning 전에 `Constraint Pack`을 생성해야 한다. | High |
| FR-018 | `Constraint Pack`은 최소 `explicitConstraints`, `environmentConstraints`, `policyConstraints`, `inferredDefaults`, `missingFacts`를 포함해야 한다. | High |
| FR-019 | 시스템은 output size를 LLM이 추정하지 않고 `editorContext.canvas_width/canvasHeight` 또는 동등한 editor source에서 고정해야 한다. | High |
| FR-020 | 시스템은 `policyConstraints.approval_mode=none` 을 v1 live-commit run의 고정값으로 유지해야 한다. | High |
| FR-021 | 시스템은 `policyConstraints.fact_policy=no_invented_brand_price_date` 를 기본 정책으로 포함해야 한다. | High |
| FR-022 | 시스템은 누락된 factual field를 generic copy로 대체할지, placeholder로 남길지, 슬롯을 생략할지 `copyPolicy`로 명시해야 한다. | High |
| FR-023 | 시스템은 `Constraint Pack` 안에서 사용자 명시 제약과 시스템 추론값을 구분 저장해야 한다. | High |

### 7.5 Plan Generation

| ID | 요구사항 | 우선순위 |
| --- | --- | --- |
| FR-024 | 시스템은 planner 출력으로 strict JSON schema 검증 가능한 `Execution Plan`만 허용해야 한다. | High |
| FR-025 | 시스템은 schema validation 실패 시 plan을 저장하거나 실행 queue에 넘기지 않아야 한다. | High |
| FR-026 | `Execution Plan`은 최소 `planId`, `planVersion`, `runId`, `traceId`, `intent`, `constraintPackRef`, `artifactTargets`, `actions`, `rollbackPolicy`, `successCriteria`를 포함해야 한다. | High |
| FR-027 | 시스템은 `actions` 배열의 각 action에 `actionId`, `kind`, `operation`, `toolName`, `toolVersion`, `targetRef`, `inputs`, `dependsOn`, `commitGroup`, `liveCommit`, `idempotencyKey`, `rollback`을 포함해야 한다. | High |
| FR-028 | `Execution Plan`의 `operation` enum은 최소 `generateImageAsset`, `createLayer`, `updateLayer`, `deleteLayer`, `saveDraft`를 지원해야 한다. | High |
| FR-029 | 시스템은 v1 대표 플로우에서 action sequence를 빈 캔버스 생성에 맞는 생성 계열 action으로 제한해야 한다. | High |
| FR-030 | 시스템은 text/image layer action마다 `factuality` 또는 동등 필드를 포함해 `user_provided`, `generic_generated`, `placeholder`, `omitted`를 구분해야 한다. | High |
| FR-031 | 시스템은 planner가 execution 중 임의 해석을 남기지 않도록 action `inputs`를 executor에 필요한 수준까지 구체화해야 한다. | High |
| FR-031A | 시스템은 planner phase 입력을 `PlannerInputEnvelope` 로 정규화해야 하며, 이 envelope는 최소 `requestSnapshotRef`, `intent`, `constraintPackRef`, `registrySnapshot`, `planningPolicy`, `correlation` block을 포함해야 한다. | High |
| FR-031B | 시스템은 planner phase 출력을 `PlannerOutputEnvelope` 로 감싸야 하며, `validation.status=validated` 인 경우에만 내부 `candidatePlan` 을 canonical `Execution Plan` 으로 승격할 수 있어야 한다. | High |
| FR-031C | 시스템은 plan validation 결과를 `PlanValidationIssue[]` 로 직렬화해야 하며, v1에서는 같은 attempt 안에서 최대 1회의 repair/re-plan round만 허용해야 한다. | High |

### 7.6 Plan Handoff To Execution

| ID | 요구사항 | 우선순위 |
| --- | --- | --- |
| FR-032 | 시스템은 Agent API control plane에서 Worker Runtime execution plane으로 run을 넘길 때 queue message를 사용해야 한다. | High |
| FR-033 | `agent.run.requested` 메시지는 최소 `runId`, `traceId`, `queueJobId`, `requestSnapshotRef`, `attemptSeq`, `hardDeadlineAt`, `milestoneDeadlinesMs`, `pageLockToken`, `cancelToken`을 포함해야 한다. | High |
| FR-034 | Worker Runtime은 queue message 수신 후 request snapshot을 hydrate하고 plan store에서 `planId` 기준 최신 validated plan을 조회해야 한다. | High |
| FR-035 | 시스템은 queue 재전달이나 worker 재시작이 발생해도 `idempotencyKey`로 중복 실행을 방지해야 한다. | High |
| FR-036 | 시스템은 각 action 실행 전후로 `traceId`, `runId`, `planId`, `actionId`를 공통 correlation key로 기록해야 한다. | High |
| FR-036A | 시스템은 planner phase에서 execution phase로 넘어갈 때 `ExecutorRunEnvelope` 를 생성해야 하며, 최소 `attemptSeq`, `queueJobId`, `planRef`, `executionCursor`, `budget`, `correlation` 을 포함해야 한다. | High |

#### 7.6.1 v1 실행 플랫폼 프로파일

| plane | 구현 컴포넌트 | 필수 계약 |
| --- | --- | --- |
| control plane | `Fastify Agent API` | `POST /api/agent-workflow/runs`, SSE, mutation ack, cancel, worker internal callback를 같은 service boundary에서 제공해야 한다. |
| transport plane | `BullMQ Queue` + `QueueEvents` on Redis | durable enqueue, lease, delayed retry transport, stalled/completed/failed transport event를 제공하되 canonical lifecycle state를 저장하지 않는다. |
| execution plane | `BullMQ Worker Runtime` | 같은 queue의 consumer로 동작하며 `requestSnapshotRef`, `planId`, `cancelToken`, `attemptSeq` 기준 hydrate/resume 해야 한다. |

구현 해석 규칙:

- backend는 `BullMQ Queue` producer와 `QueueEvents` subscriber를 소유한다.
- worker는 `BullMQ Worker` consumer를 소유한다.
- public FE는 queue를 직접 보지 않고 Fastify API와 SSE만 사용한다.
- backend와 worker 사이의 shared schema는 TypeScript source에서 관리하되, transport payload는 Redis/BullMQ job data로 직렬화한다.

### 7.7 Generic Tool Invocation Runtime

| ID | 요구사항 | 우선순위 |
| --- | --- | --- |
| FR-037 | 시스템은 validated action의 `toolName` 을 server-side `Tool Registry` 에서 해석해 canonical tool binding을 확정해야 하며, persisted plan에는 alias나 provider-specific method name 대신 canonical `toolName` + `toolVersion` 만 남겨야 한다. | High |
| FR-038 | `Tool Registry` entry는 최소 `toolName`, `toolVersion`, `operation`, `kind`, `inputSchemaRef`, `resultSchemaRef`, `sideEffectScope`, `supportsLiveCommit`, `defaultTimeoutMs`, `retryPolicy`, `emitsMutation` 메타데이터를 가져야 한다. | High |
| FR-039 | executor는 각 action attempt마다 `toolCallId`, `traceId`, `runId`, `planId`, `planVersion`, `actionId`, `toolName`, `toolVersion`, `targetRef`, `arguments`, `execution`, `idempotencyKey` 를 담은 `ToolInvocationRequest` envelope를 생성해야 한다. | High |
| FR-040 | 시스템은 adapter invocation 전에 `arguments` 를 `toolName` + `toolVersion` 기준 strict input schema로 검증해야 하며, schema mismatch는 non-retryable 오류로 처리해야 한다. | High |
| FR-040A | planner-facing schema와 tool input schema는 strict JSON Schema subset 규칙을 따라야 하며, object field는 explicit `required` 집합과 `additionalProperties=false` 를 사용하고, 논리적 optional field는 nullable required key로 표현해야 한다. | High |
| FR-041 | tool execution은 terminal 또는 interim 상태를 표현할 수 있는 `ToolInvocationResult` 를 반환해야 하며, 최소 `status`, `attemptNo`, `output`, `resultRefs`, `usage`, `error`, `emittedMutations`, `startedAt`, `finishedAt` 를 포함해야 한다. | High |
| FR-042 | 시스템은 tool 오류를 최소 `validation`, `policy`, `conflict`, `transient_provider`, `timeout`, `rate_limited`, `unknown_apply_state` 클래스로 정규화하고, retryable class에만 남은 run budget 안에서 bounded retry를 허용해야 한다. | High |
| FR-042A | 시스템은 planner repair와 executor recovery를 모두 `repairId` 기반 serialized decision으로 기록해야 하며, `traceId`, `attemptSeq`, `queueJobId`, `plannerSpanId` 또는 `toolCallId` 와 join 가능해야 한다. | High |
| FR-043 | tool invocation이 방출한 모든 canvas mutation, save receipt, compensation batch는 `toolCallId`, `actionId`, `planId`, `traceId` back-reference를 유지해야 한다. | High |
| FR-043A | `ToolInvocationRequest` 와 `ToolInvocationResult` 는 `attemptSeq`, `queueJobId`, `spanId`, `parentSpanId` 를 포함해 queue, planner, executor, mutation ledger를 하나의 chain으로 연결해야 한다. | High |
| FR-044 | mutation-emitting tool의 retry는 blind replay가 아니라 `idempotencyKey` 와 mutation ledger reconciliation을 우선해야 하며, `unknown_apply_state` 를 확인하기 전에는 재실행하면 안 된다. | High |
| FR-045 | 시스템은 canonical text authoring tool set으로 최소 `canvas.text.addText`, `canvas.text.editText`, `canvas.text.patchStyleRanges` 를 registry에 등록해야 하며, text 삭제는 별도 `deleteText` tool이 아니라 generic `canvas.deleteLayer` 로 처리해야 한다. | High |
| FR-046 | `canvas.text.addText` 는 최소 `clientLayerKey`, `slotKey`, `textRole`, `factuality`, `content`, `bounds`, `boxMode`, `typography`, `styleSpans`, `overflowPolicy` 를 입력으로 받아 text layer 1개를 생성하고 `layerId`, `resolvedBounds`, `textMetrics`, `overflowStatus`, `contentHash` 를 반환해야 한다. | High |
| FR-047 | `canvas.text.editText` 는 기존 `layerId` 를 유지한 채 `replace_all` 또는 `replace_range` 편집을 지원해야 하며, `preserveUneditedStyles`, `fallbackTypography`, `layoutAdjustment`, `overflowPolicy` 를 명시 입력으로 받아야 한다. | High |
| FR-048 | `canvas.text.patchStyleRanges` 는 multi-style text를 위해 `stylePatches[]` 기반 부분 범위 스타일 수정과 deterministic precedence를 지원해야 하며, 겹치는 range나 text length 밖 범위는 non-retryable `validation` 오류로 차단해야 한다. | High |
| FR-049 | 모든 text authoring tool input/result schema는 strict JSON Schema subset 호환을 위해 explicit `required` 배열, `additionalProperties=false`, bounded enum/numeric range, stable result field를 가져야 한다. | High |
| FR-050 | 시스템은 canonical image acquisition / insertion tool set으로 최소 `asset.searchImage`, `asset.generateImage`, `asset.selectImageCandidate`, `canvas.image.addImage` 를 registry에 등록해야 하며, future image source swap은 `canvas.image.replaceImageAsset` 로 확장 가능해야 한다. | High |
| FR-051 | `asset.searchImage` 는 ranked candidate list를 반환해야 하며, 각 candidate는 최소 `candidateId`, provider/license/source metadata, `placementHints`, selection에 필요한 stable reference를 포함해야 한다. | High |
| FR-052 | `asset.generateImage` 는 생성 결과를 internal asset storage 기준 stable asset reference로 정규화한 뒤, 이후 canvas mutation tool이 그대로 소비할 수 있는 `CanvasReadyImageAsset` 형태로 반환해야 한다. | High |
| FR-053 | `asset.selectImageCandidate` 는 검색 결과 candidate 1개를 internal asset storage로 import 또는 confirm하고, 이후 `canvas.image.addImage` 또는 `canvas.image.replaceImageAsset` 가 그대로 소비할 수 있는 `CanvasReadyImageAsset` 을 반환해야 한다. | High |
| FR-054 | `canvas.image.addImage` 는 `CanvasReadyImageAsset` 과 bounds/crop/fit 정보를 입력으로 받아 image layer 1개를 생성하고, `layerId`, `resolvedBounds`, `resolvedCrop`, `appliedAssetId`, `contentHash` 를 반환해야 한다. | High |
| FR-055 | `canvas.image.replaceImageAsset` 는 기존 `layerId` 를 유지한 채 source asset 교체와 crop/fit 재계산을 지원해야 하며, future `updateLayer` user flow에서 그대로 재사용 가능해야 한다. | High |
| FR-056 | 모든 image acquisition / insertion tool input/result schema는 strict JSON Schema subset 호환을 위해 explicit `required` 배열, `additionalProperties=false`, bounded enum/numeric range, stable bridge object(`CanvasReadyImageAsset`)를 가져야 한다. | High |

## 8. 비즈니스 규칙

| ID | 규칙 |
| --- | --- |
| BR-001 | v1 사용자 가치의 핵심은 `blank canvas 문제 제거`와 `editable first draft` 이며, 완전 자율 creative direction이 아니다. |
| BR-002 | live-commit run 동안 create/update/delete/image insertion/save는 별도 승인 게이트를 두지 않는다. |
| BR-003 | v1 사용자 표면은 empty-canvas template creation만 허용하지만, 내부 contract는 future `updateLayer`, `deleteLayer`를 미리 표현할 수 있어야 한다. |
| BR-004 | planner는 기존 one-shot AI primitive를 내부 tool로 재사용할 수 있지만, workflow orchestration 책임은 신규 agent layer가 가져야 한다. |
| BR-005 | 신규 orchestration backend는 PHP 스택 밖에 존재해야 한다. |

## 9. UI/UX 요구사항

### 9.1 입력/상태 표면

- 시스템은 editor 안에 단일 자연어 입력창을 제공해야 한다.
- 시스템은 run 시작 후 `planning`, `executing`, `completed`, `failed` 상태를 사용자가 볼 수 있게 해야 한다.
- 시스템은 Cursor/Claude Code/Codex 류의 activity log처럼 현재 step 이름과 최근 완료 step을 요약 표시해야 한다.

### 9.2 사용자 상호작용

| 항목 | 요구사항 |
| --- | --- |
| 입력창 | prompt 1건으로 run을 시작할 수 있어야 한다. |
| 시작 버튼 | request validation 실패 시 즉시 reason code를 보여줘야 한다. |
| 진행 로그 | planner 완료 전에는 `계획 생성 중`, executor 단계에서는 `캔버스 반영 중` 상태를 보여줘야 한다. |
| 승인 | v1 active run 중 create/update/delete/save에 대한 승인 모달을 띄우지 않아야 한다. |

## 10. 외부 인터페이스

### 10.1 API 계약

| API | Method | Request | Response 핵심 |
| --- | --- | --- | --- |
| `/api/agent-workflow/runs` | POST | request envelope | `202`, `runId`, `traceId`, `status=queued`, `streamUrl`, `cancelUrl`, `mutationAckUrl` |
| `/api/agent-workflow/runs/{runId}/events` | GET | path `runId`, SSE subscribe | phase/log/mutation/completion stream |
| `/api/agent-workflow/runs/{runId}/mutation-acks` | POST | FE apply ack | `accepted`, `runStatus`, `nextExpectedSeq` |
| `/api/agent-workflow/runs/{runId}/cancel` | POST | cancel intent | `status=cancel_requested` |

#### 10.1.1 End-to-End Traceability Contract

v1 public/shared contract field naming은 camelCase를 canonical로 사용한다. persistence schema와 DB projection은 snake_case를 유지할 수 있지만, public JSON, SSE payload, worker callback payload, shared TypeScript contract는 별도 snake_case projection을 두지 않는다. 다만 public 요청의 `clientRequestId` 와 accepted northbound request row의 `requestId` 는 다른 식별자다. `clientRequestId` 는 FE idempotency key이고, `requestId` 는 Agent API가 acceptance 시 발급하는 immutable persisted request row id다.

| 식별자 | 발급 주체 | scope | 전파 경로 | 규칙 |
| --- | --- | --- | --- | --- |
| `httpRequestId` | `Fastify Agent API` | 개별 HTTP request 1건 | `x-request-id` response header, ingress/egress structured log, `agent_run_events.http_request_id` | request 단위 correlation 전용이다. dedupe key나 run identity로 쓰면 안 된다. |
| `clientRequestId` | FE | 사용자의 run 시작 의도 1건 | `POST /api/agent-workflow/runs` body, `agent_run_requests.client_request_id` | 같은 의도의 재전송 동안 유지된다. `editorSessionId + scenarioKey + documentId + pageId` 와 함께 acceptance dedupe key를 이룬다. |
| `requestId` | Agent API | accepted northbound request 1건 | `agent_run_requests.request_id`, `agent_runs.request_id`, `ToolInvocationRequest.sourceRefs.requestId` | immutable persisted request row id다. dedupe hit가 기존 active run을 재사용하면 기존 `requestId` 를 그대로 재사용한다. |
| `traceId` | Agent API | run 전체 수명주기 | `RunAccepted`, SSE event, queue message, worker callback, tool invocation, mutation ledger, save receipt, final summary | v1 canonical run correlation key다. dedupe hit면 새 값을 만들지 않고 기존 값을 재사용한다. |
| `queueJobId` | Agent API | queue attempt 1건 | BullMQ `jobId`, `agent_run_attempts`, `QueueEvents`, worker log | `QueueEvents` 가 `jobId` 위주로 관측되므로 별도 저장이 필수다. BullMQ custom job id 제약상 `:` 문자를 포함하면 안 된다. |
| `toolCallId` | Worker Runtime | action attempt 1건 | `ToolInvocationRequest/Result`, provider metadata, mutation/save/compensation back-reference | action-local retry 때마다 새 값이 발급된다. logical action identity는 `idempotencyKey` 가 유지한다. |

추가 규칙:

1. public `POST /api/agent-workflow/runs` 는 client-authored `traceId` 를 받지 않는다. strict request schema에서 해당 필드는 validation error로 거절한다.
2. Agent API는 dedupe 판정이 끝난 뒤에만 `requestId`, `runId`, `traceId` 를 발급한다. 그래서 acceptance 전 로그는 `httpRequestId` 만 가질 수 있고, acceptance 후 같은 request log context에 `requestId`, `runId`, `traceId` 를 추가해야 한다.
3. FE의 후속 public call(`cancel`, `mutation-acks`, SSE reconnect)은 path `runId` 를 source of truth로 사용하되, 이미 알고 있는 `traceId` 를 body 또는 header에 echo해 ingress log correlation을 강화해야 한다.
4. queue correlation의 canonical join path는 `QueueEvents.jobId -> agent_run_attempts.queue_job_id -> runId -> traceId` 다. queue transport state만으로 trace를 복원하려고 하면 안 된다.
5. provider별 `providerRequestId`, `externalJobId` 는 secondary metadata다. incident 조사에서는 항상 `traceId -> toolCallId -> providerRequestId` 순서로 따라가야 한다.

#### 10.1.1A `NorthboundRunRequest -> AgentRunRecord` Bootstrap Contract

이 절은 run initialization의 persisted contract를 한 곳에서 닫는다.

- `NorthboundRunRequest` 는 public `POST /runs` body가 acceptance된 뒤 `agent_run_requests` 에 immutable하게 저장된 canonical request row다.
- `AgentRunRecord` 는 같은 acceptance를 기준으로 `agent_runs` 에 생성되는 mutable control-plane row다.
- worker hydrate DTO는 이 둘과 `agent_run_snapshots` 를 조합한 read model일 뿐, 별도 canonical storage owner가 아니다.

| contract | canonical entity | storage location | owner | initialization guarantee |
| --- | --- | --- | --- | --- |
| northbound acceptance | `NorthboundRunRequest` | `agent_run_requests` | Agent API | `requestId`, `clientRequestId`, `runId`, `traceId`, `snapshotId`, `acceptedHttpRequestId`, prompt ref/hash, normalized prompt, redacted preview가 acceptance 시점에 immutable하게 고정된다. |
| run lifecycle bootstrap | `AgentRunRecord` | `agent_runs` | Agent API | `runId`, `traceId`, `requestId`, `snapshotId`, `pageLockToken`, `canonicalArtifactKind=LiveDraftArtifactBundle`, `canonicalCompletionMoment=RunCompletionRecord.draftGeneratedAt`, `status=enqueue_pending` 가 queue publish 전에 먼저 고정된다. |
| first queue handoff | `AgentRunRecord + agent_run_attempts` | `agent_runs`, `agent_run_attempts` | Agent API | `attemptSeq=1`, `attemptId`, `queueJobId` 는 queue publish ack 뒤에만 확정되며, 그 이후에만 `status=planning_queued` 와 `RunAccepted(status=queued)` 가 허용된다. |

초기 생성 순서는 아래와 같이 강제한다.

1. `clientRequestId` 를 포함한 public request가 도착하면 Agent API가 `httpRequestId` 를 만든다.
2. Agent API는 `clientRequestId + editorSessionId + scenarioKey + documentId + pageId` dedupe를 판정한다.
3. dedupe miss일 때만 `requestId`, `snapshotId`, `runId`, `traceId`, `pageLockToken` 을 발급한다.
4. `agent_run_requests` 와 `agent_run_snapshots` durable write가 끝난 뒤 `agent_runs(status=enqueue_pending)` 를 만든다.
5. queue publish ack 이후 `agent_run_attempts(attemptSeq=1, queueJobId)` 를 만들고 `agent_runs.status=planning_queued` 로 승격한다.
6. 3-5가 모두 끝난 뒤에만 `RunAccepted` 를 반환한다.

#### `POST /api/agent-workflow/runs` request example

```json
{
  "clientRequestId": "cli_req_20260403_090001_001",
  "editorSessionId": "editor_sess_01",
  "surface": "editor_agent_bar",
  "userInput": {
    "prompt": "봄 세일 이벤트 배너 만들어줘",
    "locale": "ko-KR",
    "timezone": "Asia/Seoul"
  },
  "editorContext": {
    "documentId": "doc_123",
    "pageId": "page_0",
    "canvasState": "empty",
    "canvasWidth": 1200,
    "canvasHeight": 628,
    "sizeSerial": "5",
    "workingTemplateCode": null,
    "canvasSnapshotRef": null,
    "selectedLayerIds": []
  },
  "brandContext": {
    "brandName": null,
    "palette": [],
    "logoAssetId": null
  },
  "referenceAssets": [],
  "runPolicy": {
    "mode": "live_commit",
    "approvalMode": "none",
    "timeBudgetMs": 120000,
    "milestoneTargetsMs": {
      "firstVisible": 20000,
      "editableMinimum": 60000,
      "saveStarted": 95000
    },
    "milestoneDeadlinesMs": {
      "planValidated": 25000,
      "firstVisible": 35000,
      "editableMinimum": 75000,
      "mutationCutoff": 105000,
      "hardDeadline": 120000
    },
    "requestedOutputCount": 1,
    "allowInternalAiPrimitives": true
  },
  "clientInfo": {
    "pagePath": "/editor/abc",
    "viewportWidth": 1512,
    "viewportHeight": 982
  }
}
```

#### `POST /api/agent-workflow/runs` response example

```json
{
  "runId": "run_20260402_0001",
  "traceId": "6c3fb033-9ef2-435c-b3e4-7d1cc4088dca",
  "status": "queued",
  "startedAt": "2026-04-02T09:00:00.000Z",
  "deadlineAt": "2026-04-02T09:02:00.000Z",
  "streamUrl": "/api/agent-workflow/runs/run_20260402_0001/events",
  "cancelUrl": "/api/agent-workflow/runs/run_20260402_0001/cancel",
  "mutationAckUrl": "/api/agent-workflow/runs/run_20260402_0001/mutation-acks"
}
```

### 10.2 Intent Envelope

```json
{
  "intentId": "intent_01",
  "runId": "run_20260402_0001",
  "operationFamily": "create_template",
  "artifactType": "banner",
  "goalSummary": "spring sale promotional banner draft",
  "requestedOutputCount": 1,
  "confidence": 0.95,
  "supportedInV1": true,
  "blockingReason": null,
  "futureCapableOperations": ["update_layer", "delete_layer"]
}
```

### 10.3 Constraint Pack

```json
{
  "constraintPackId": "cp_01",
  "runId": "run_20260402_0001",
  "explicitConstraints": {
    "language": "ko",
    "themeKeywords": ["봄", "세일"],
    "requestedOutputCount": 1
  },
  "environmentConstraints": {
    "canvasState": "empty",
    "canvasWidth": 1200,
    "canvasHeight": 628,
    "documentId": "doc_123",
    "pageId": "page_0"
  },
  "policyConstraints": {
    "approvalMode": "none",
    "timeBudgetMs": 120000,
    "milestoneDeadlinesMs": {
      "planValidated": 25000,
      "firstVisible": 35000,
      "editableMinimum": 75000,
      "mutationCutoff": 105000,
      "hardDeadline": 120000
    },
    "factPolicy": "no_invented_brand_price_date"
  },
  "inferredDefaults": {
    "layoutArchetype": "promo_banner",
    "tone": "bright_promotional",
    "visualDensity": "medium"
  },
  "missingFacts": [
    { "field": "brandName", "severity": "optional" },
    { "field": "discountValue", "severity": "optional" },
    { "field": "productName", "severity": "optional" }
  ],
  "copyPolicy": {
    "headline": "generic_allowed",
    "cta": "generic_allowed",
    "priceBadge": "omit_if_missing"
  }
}
```

### 10.3A Planner Input Envelope

planner phase는 자유 prompt 문자열만 받아 즉흥적으로 plan을 만드는 것이 아니라, hydrate가 끝난 worker runtime이 아래 `PlannerInputEnvelope` 를 만들어 planner model 또는 planner service에 넘기는 것으로 고정한다.

```json
{
  "plannerInputSchemaVersion": "2026-04-03",
  "runId": "run_20260402_0001",
  "traceId": "6c3fb033-9ef2-435c-b3e4-7d1cc4088dca",
  "attemptSeq": 1,
  "request": {
    "requestId": "req_01JQ7J8QW2Q8P7D6W7NN4Q9JZ4",
    "clientRequestId": "cli_req_20260403_090001_001",
    "editorSessionId": "editor_sess_01",
    "normalizedPrompt": "봄 세일 이벤트 배너 만들어줘",
    "locale": "ko-KR",
    "timezone": "Asia/Seoul"
  },
  "requestSnapshotRef": "reqsnap_01",
  "intent": {
    "intentId": "intent_01",
    "operationFamily": "create_template",
    "artifactType": "banner"
  },
  "constraintPackRef": "cp_01",
  "registrySnapshot": {
    "registryVersion": "2026-04-03",
    "enabledTools": [
      { "toolName": "canvas.createLayer", "toolVersion": "2026-04-02", "kind": "canvas_mutation" },
      { "toolName": "canvas.text.addText", "toolVersion": "2026-04-02", "kind": "canvas_mutation" },
      { "toolName": "asset.generateImage", "toolVersion": "2026-04-02", "kind": "asset_prep" },
      { "toolName": "document.saveDraft", "toolVersion": "2026-04-02", "kind": "document_commit" }
    ]
  },
  "planningPolicy": {
    "maxActions": 24,
    "maxCommitGroups": 12,
    "maxRepairRounds": 1,
    "schemaMode": "strict_json_schema_subset",
    "allowToolAliasesInOutput": false,
    "allowNewCorrelationIds": false
  },
  "correlation": {
    "httpRequestId": "http_req_01",
    "queueJobId": "run_20260402_0001__attempt_1",
    "plannerSpanId": "span_plan_01",
    "parentSpanId": null
  },
  "repairContext": null
}
```

필드 규칙:

- `requestSnapshotRef` 는 planner가 직접 FE payload 원문을 다시 조합하지 않게 하는 hydrate source of truth다.
- `constraintPackRef` 는 canonical planning input join key다. planner는 임의로 새 constraint pack을 만들지 않고, 보강이 필요하면 repair round에서 새 version을 명시적으로 발급해야 한다.
- `registrySnapshot.enabledTools[]` 는 planner가 사용할 수 있는 capability boundary다. plan 안에 이 목록에 없는 `toolName` 을 넣으면 validation 이전에 정책 위반으로 취급한다.
- `planningPolicy.schemaMode=strict_json_schema_subset` 는 planner output이 strict JSON Schema subset을 따라야 한다는 뜻이다. object는 explicit `required` 집합과 `additionalProperties=false` 를 가져야 하고, 논리적 optional field는 nullable required key로 표현한다.
- `correlation.plannerSpanId` 는 planning 단계 전체를 대표하는 span이다. planner는 이 값을 그대로 echo하고, action/tool 수준 새로운 correlation ID는 validation 통과 후 executor가 발급한다.
- `repairContext` 는 첫 시도에는 `null` 이고, repair round에서는 직전 validation issue bundle과 repair budget을 담는다.

### 10.3B Planner Output Envelope

planner가 내놓는 1차 산출물은 곧바로 canonical plan이 아니라 아래 `PlannerOutputEnvelope` 다. canonical 저장소에 승격되는 것은 이 envelope 안의 `candidatePlan` 이 `validation.status=validated` 인 경우뿐이다.

```json
{
  "plannerOutputSchemaVersion": "2026-04-03",
  "runId": "run_20260402_0001",
  "traceId": "6c3fb033-9ef2-435c-b3e4-7d1cc4088dca",
  "attemptSeq": 1,
  "plannerSpanId": "span_plan_01",
  "status": "validated",
  "candidatePlanRef": "plan_candidate_01",
  "candidatePlan": {
    "planId": "plan_01",
    "planVersion": 1,
    "planSchemaVersion": "2026-04-02"
  },
  "validation": {
    "status": "validated",
    "repairRound": 0,
    "blockingIssueCount": 0,
    "warningCount": 1,
    "issues": []
  },
  "warnings": [
    {
      "code": "missing_optional_facts",
      "message": "brandName, discountValue, productName omitted"
    }
  ],
  "generatedAt": "2026-04-02T10:00:00.900Z"
}
```

`PlannerOutputEnvelope.status` enum은 최소 아래를 지원한다.

| 값 | 의미 | canonical 승격 가능 여부 |
| --- | --- | --- |
| `validated` | plan candidate가 schema/semantic/registry/policy gate를 모두 통과 | 가능 |
| `needs_repair` | plan candidate가 있으나 blocking issue가 있어 repair round 필요 | 불가 |
| `fatal` | repair budget 소진, deadline 초과, planner contract 위반 | 불가 |

추가 규칙:

- `candidatePlanRef` 는 raw planner output 또는 redacted artifact의 durable ref다. canonical `agent_plans.payload` 와 동일시하면 안 된다.
- `validation.issues[]` 는 blocking/non-blocking issue를 모두 담을 수 있지만, blocking issue가 1개 이상이면 `status=validated` 를 사용할 수 없다.
- `warnings[]` 는 사용자-visible 경고나 fallback 힌트의 source가 될 수 있지만, 실행 차단 근거는 아니다.
- planner는 repair round에서도 `runId`, `traceId`, `attemptSeq`, `plannerSpanId` 를 유지해야 하며, 새 run이나 새 trace처럼 행동하면 안 된다.

### 10.3C Plan Validation Issue and Repair Request

plan validator는 blocking failure를 free-form log로 흩뿌리지 말고, 아래 `PlanValidationIssue` shape로 정규화해야 한다.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `issueId` | string | 예 | issue 고유 ID |
| `stage` | enum | 예 | `schema_shape`, `registry_resolution`, `semantic_graph`, `policy_budget`, `target_integrity` |
| `severity` | enum | 예 | `error`, `warn` |
| `code` | string | 예 | 예: `missing_required_field`, `unknown_tool_name`, `cycle_detected` |
| `path` | string | 예 | 예: `actions[2].inputs.slotKey` |
| `message` | string | 예 | 사람/로그용 설명 |
| `repairHint` | string/null | 예 | planner에 되돌려줄 최소 수정 힌트 |
| `blocking` | boolean | 예 | canonical 승격 차단 여부 |

repair round가 열릴 때 planner로 다시 넘기는 payload는 아래 `PlannerRepairRequest` 다.

```json
{
  "repairId": "repair_01",
  "runId": "run_20260402_0001",
  "traceId": "6c3fb033-9ef2-435c-b3e4-7d1cc4088dca",
  "attemptSeq": 1,
  "plannerSpanId": "span_plan_01",
  "repairRound": 1,
  "candidatePlanRef": "plan_candidate_01",
  "issues": [
    {
      "issueId": "issue_01",
      "stage": "registry_resolution",
      "severity": "error",
      "code": "unknown_tool_name",
      "path": "actions[1].toolName",
      "message": "tool alias must be normalized to canonical name",
      "repairHint": "replace createLayer with canvas.createLayer",
      "blocking": true
    }
  ],
  "repairBudgetRemaining": 0,
  "repairDeadlineAt": "2026-04-02T10:00:15.000Z"
}
```

repair 규칙:

1. v1은 같은 attempt 안에서 `repairRound=1` 1회만 허용한다.
2. repair는 자유 재작성(full brainstorm)이 아니라 issue bundle을 해소하는 bounded 수정이어야 한다.
3. repair 후에도 blocking issue가 남으면 `plan_validation_failed` 로 종료하고 execution phase를 열지 않는다.
4. invalid candidate는 debug artifact로 남길 수는 있어도 canonical `agent_plans.payload` 로 승격할 수 없다.

### 10.4 Execution Plan

```json
{
  "planId": "plan_01",
  "planVersion": 1,
  "planSchemaVersion": "2026-04-02",
  "runId": "run_20260402_0001",
  "traceId": "6c3fb033-9ef2-435c-b3e4-7d1cc4088dca",
  "attemptSeq": 1,
  "intent": {
    "operationFamily": "create_template",
    "artifactType": "banner"
  },
  "constraintPackRef": "cp_01",
  "artifactTargets": [
    {
      "artifactId": "artifact_banner_01",
      "type": "banner_draft",
      "documentId": "doc_123",
      "pageId": "page_0",
      "width": 1200,
      "height": 628,
      "editable": true
    }
  ],
  "actions": [
    {
      "actionId": "act_001",
      "kind": "canvas_mutation",
      "operation": "createLayer",
      "toolName": "canvas.createLayer",
      "toolVersion": "2026-04-02",
      "targetRef": {
        "documentId": "doc_123",
        "pageId": "page_0",
        "layerId": null,
        "artifactId": "artifact_banner_01"
      },
      "inputs": {
        "layerType": "shape",
        "shapeRole": "background",
        "styleTokens": {
          "fill": "spring_gradient",
          "opacity": 1
        },
        "bounds": { "x": 0, "y": 0, "width": 1200, "height": 628 }
      },
      "dependsOn": [],
      "commitGroup": "cg_001",
      "liveCommit": true,
      "idempotencyKey": "run_20260402_0001:act_001",
      "rollback": {
        "strategy": "delete_created_layer"
      }
    },
    {
      "actionId": "act_002",
      "kind": "canvas_mutation",
      "operation": "createLayer",
      "toolName": "canvas.text.addText",
      "toolVersion": "2026-04-02",
      "targetRef": {
        "documentId": "doc_123",
        "pageId": "page_0",
        "layerId": null,
        "artifactId": "artifact_banner_01"
      },
      "inputs": {
        "clientLayerKey": "clk_headline_01",
        "slotKey": "headline_primary",
        "textRole": "headline",
        "factuality": "generic_generated",
        "content": "봄 세일",
        "bounds": { "x": 96, "y": 84, "width": 1008, "height": 160 },
        "boxMode": "fixed_width",
        "typography": {
          "fontFamilyToken": "701_700",
          "fontSizePx": 84,
          "fontWeight": 700,
          "fontStyle": "normal",
          "textAlign": "center",
          "lineHeight": 1.1,
          "letterSpacingPx": 0,
          "textDecoration": "none",
          "fillMode": "solid",
          "fillValue": "#1F2937",
          "strokeColor": null,
          "strokeWidthPx": 0,
          "uppercase": false
        },
        "styleSpans": [],
        "overflowPolicy": {
          "mode": "shrink_to_fit",
          "minFontSizePx": 56
        },
        "lockAspectRatio": false
      },
      "dependsOn": ["act_001"],
      "commitGroup": "cg_002",
      "liveCommit": true,
      "idempotencyKey": "run_20260402_0001:act_002",
      "rollback": {
        "strategy": "delete_created_layer"
      }
    },
    {
      "actionId": "act_003",
      "kind": "document_commit",
      "operation": "saveDraft",
      "toolName": "document.saveDraft",
      "toolVersion": "2026-04-02",
      "targetRef": {
        "documentId": "doc_123",
        "pageId": "page_0",
        "layerId": null,
        "artifactId": "artifact_banner_01"
      },
      "inputs": {
        "saveReason": "agent_run_completion"
      },
      "dependsOn": ["act_001", "act_002"],
      "commitGroup": "cg_999",
      "liveCommit": true,
      "idempotencyKey": "run_20260402_0001:act_003",
      "rollback": {
        "strategy": "restore_last_saved_revision"
      }
    }
  ],
  "rollbackPolicy": {
    "mode": "action_level_compensation",
    "restoreCheckpointBeforeRun": true
  },
  "successCriteria": {
    "editableLayerCountMin": 3,
    "saved": true,
    "firstVisibleDeadlineMs": 35000,
    "editableMinimumDeadlineMs": 75000,
    "hardDeadlineMs": 120000
  }
}
```

### 10.5 Plan Action 필드 계약

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `actionId` | string | 예 | plan 내 고유 step ID |
| `kind` | enum | 예 | `asset_prep`, `canvas_mutation`, `document_commit` |
| `operation` | enum | 예 | `generateImageAsset`, `createLayer`, `updateLayer`, `deleteLayer`, `saveDraft` |
| `toolName` | string | 예 | canonical namespaced tool key. 예: `canvas.createLayer`, `canvas.text.addText`, `document.saveDraft` |
| `toolVersion` | string | 예 | 실행 시 binding할 tool contract 버전 |
| `targetRef` | object | 예 | document/page/layer/artifact 식별자 |
| `inputs` | object | 예 | `toolName` + `toolVersion` input schema에 맞는 정규화 파라미터 |
| `dependsOn` | string[] | 예 | 선행 action ID 목록 |
| `commitGroup` | string | 예 | user-visible forward progress의 최소 commit 단위. 같은 group이 terminal apply 상태가 되기 전까지 다음 group action 시작 금지 |
| `liveCommit` | boolean | 예 | 실행 즉시 canvas mutation 대상 여부 |
| `idempotencyKey` | string | 예 | logical action dedupe 키. retry/resume 동안 stable하게 유지되며 attempt 구분은 `toolCallId` 와 `actionAttemptSeq` 가 담당 |
| `rollback` | object | 예 | 보상 실행 전략 |

### 10.5.1 시간 제약 계약

- `runPolicy.time_budget_ms` 는 전체 run wall-clock hard deadline이다.
- `runPolicy.milestone_targets_ms` 는 운영 SLO 용도이며, FE progress UI와 slow-run 경고 기준으로 사용한다.
- `runPolicy.milestone_deadlines_ms` 는 planner와 executor가 따라야 하는 hard cutoff다. worker는 이 값을 기준으로 planning 중단, `salvage_only` 전환, mutation freeze를 판단한다.
- `Execution Plan.successCriteria.*DeadlineMs` 는 run policy를 snapshot한 값이며, executor가 plan version마다 다른 deadline을 혼동하지 않도록 plan payload 안에도 복제 저장한다.

### 10.5.2 Plan Validation Gates

planner output은 아래 gate를 순서대로 통과해야만 `Execution Plan` 으로 승격된다.

| gate | owner | 입력 | 실패 코드 예시 | 실패 시 처리 |
| --- | --- | --- | --- | --- |
| `schema_shape` | planner output validator | `PlannerOutputEnvelope.candidate_plan` | `missing_required_field`, `unexpected_property`, `enum_out_of_range` | `PlanValidationIssue` 생성 후 repair 또는 fail |
| `registry_resolution` | worker runtime | `toolName` + `toolVersion` + registry snapshot | `unknown_tool_name`, `tool_version_mismatch`, `tool_disabled` | repair 또는 fail |
| `semantic_graph` | worker runtime | `actions[]`, `dependsOn`, `commitGroup`, `rollback` | `duplicate_action_id`, `cycle_detected`, `invalid_commit_group_order` | repair 또는 fail |
| `policy_budget` | worker runtime | `intent`, `constraints`, `runPolicy`, `successCriteria` | `out_of_scope_operation`, `approval_gate_requested`, `deadline_over_budget` | repair 또는 fail |
| `target_integrity` | worker runtime | `targetRef`, `artifact_targets`, factuality markers | `missing_target_ref`, `unknown_artifact_id`, `factuality_not_set` | repair 또는 fail |

추가 규칙:

1. gate는 순서를 건너뛰면 안 된다. 예를 들어 `schema_shape` 실패 상태에서 `registry_resolution` 결과를 canonical하게 기록하면 안 된다.
2. `schema_shape` 는 planner-facing strict JSON Schema subset discipline을 검사한다. object field 누락은 생략이 아니라 validation failure며, 논리적 optional도 nullable required key여야 한다.
3. `registry_resolution` 은 alias 허용 여부를 planner input policy로 닫고, persisted plan에는 canonical `toolName` + `toolVersion` 만 남긴다.
4. `semantic_graph` 는 action dependency DAG, commit group fence, rollback strategy completeness를 검사한다.
5. `target_integrity` 는 `updateLayer`/`deleteLayer` future-capable action도 동일하게 검사하되, v1 representative flow에서는 empty-canvas create target만 실제로 통과해야 한다.

### 10.6 Generic Tool Invocation Runtime Contract

#### 10.6.1 Tool Registry Entry

`toolName` 은 planner가 자유 문자열로 만드는 값이 아니라 registry에 등록된 canonical capability key여야 한다. v1 validated plan에는 alias나 provider SDK method name을 저장하지 않는다.

Tool Registry entry는 최소 아래 필드를 가져야 한다.

```json
{
  "toolName": "canvas.createLayer",
  "toolVersion": "2026-04-02",
  "aliases": ["createLayer"],
  "operation": "createLayer",
  "kind": "canvas_mutation",
  "inputSchemaRef": "tool.canvas.createLayer.input.v2026-04-02",
  "resultSchemaRef": "tool.canvas.createLayer.result.v2026-04-02",
  "sideEffectScope": "canvas_page",
  "supportsLiveCommit": true,
  "emitsMutation": true,
  "defaultTimeoutMs": 15000,
  "retryPolicy": {
    "maxAttempts": 2,
    "backoffMs": [0, 750],
    "retryOn": ["conflict", "transient_provider", "rate_limited", "unknown_apply_state"]
  }
}
```

Resolution rules:

1. planner 또는 validator는 alias를 canonical `toolName` 으로 정규화할 수 있지만, persisted plan에는 canonical `toolName` 과 `toolVersion` 만 저장한다.
2. executor는 `toolName` + `toolVersion` exact match로 registry를 조회한다. 미등록, 비활성, 버전 불일치는 non-retryable `tool_resolution_failed` 로 처리한다.
3. `operation`, `kind`, `supportsLiveCommit`, `sideEffectScope` 는 registry metadata와 일치해야 한다. 불일치 action은 실행 전에 차단한다.
4. `inputSchemaRef` 와 `resultSchemaRef` 는 OpenAI strict mode가 보장하는 JSON Schema subset 안에서 유지한다.

#### 10.6.1A ExecutorRunEnvelope

planning phase가 validated plan을 확정한 뒤 execution phase로 넘어갈 때 worker 내부 handoff는 아래 `ExecutorRunEnvelope` 로 고정한다. queue job data 자체는 `agent.run.requested` 이지만, 실제 action loop는 이 envelope를 hydrate source로 사용한다.

```json
{
  "executorInputSchemaVersion": "2026-04-03",
  "runId": "run_20260402_0001",
  "traceId": "6c3fb033-9ef2-435c-b3e4-7d1cc4088dca",
  "attemptSeq": 1,
  "queueJobId": "run_20260402_0001__attempt_1",
  "planRef": {
    "planId": "plan_01",
    "planVersion": 1,
    "planSchemaVersion": "2026-04-02"
  },
  "draftContext": {
    "draftId": "draft_01",
    "documentId": "doc_123",
    "pageId": "page_0",
    "artifactId": "artifact_banner_01"
  },
  "executionCursor": {
    "resumeMode": "fresh",
    "resumeFromActionId": "act_001",
    "lastAckedMutationSeq": 0,
    "lastSaveReceiptId": null
  },
  "budget": {
    "executorStartedAt": "2026-04-02T10:00:01.000Z",
    "editableMinimumDeadlineAt": "2026-04-02T10:01:15.000Z",
    "mutationCutoffAt": "2026-04-02T10:01:45.000Z",
    "hardDeadlineAt": "2026-04-02T10:02:00.000Z"
  },
  "correlation": {
    "plannerSpanId": "span_plan_01",
    "executorSpanId": "span_exec_01",
    "parentSpanId": "span_plan_01"
  }
}
```

필드 규칙:

- `executionCursor.resumeMode` 는 최소 `fresh`, `resume_after_ack`, `finalize_only` 를 지원한다.
- `resumeFromActionId` 는 resume 시점의 첫 미완료 action ID다. `fresh` 모드에서도 명시적으로 첫 action을 가리켜야 한다.
- `lastAckedMutationSeq` 와 `lastSaveReceiptId` 는 blind replay 금지와 reconciliation-first resume의 근거다.
- execution phase는 `ExecutorRunEnvelope` 가 없으면 action dispatch를 시작할 수 없다. validated plan만으로는 충분하지 않다.
- `correlation.executor_span_id` 는 executor action loop 전체 상위 span이며, 개별 `ToolInvocationRequest` 는 이를 `parentSpanId` 로 물려받아야 한다.

#### 10.6.2 ToolInvocationRequest

`Execution Plan.actions[].inputs` 는 executor에서 아래 `ToolInvocationRequest.arguments` 로 복사되며, runtime이 계산한 timeout/base revision metadata가 추가된다. 여기서 `execution.idempotencyKey` 는 plan action의 stable key를 그대로 사용하고, attempt identity는 `toolCallId` + `actionAttemptSeq` 로 분리한다.

```json
{
  "toolCallId": "tc_20260402_0001_01",
  "traceId": "6c3fb033-9ef2-435c-b3e4-7d1cc4088dca",
  "runId": "run_20260402_0001",
  "attemptSeq": 1,
  "queueJobId": "run_20260402_0001__attempt_1",
  "planId": "plan_01",
  "planVersion": 1,
  "actionId": "act_001",
  "actionAttemptSeq": 1,
  "correlation": {
    "spanId": "span_act_001_01",
    "parentSpanId": "span_exec_01",
    "plannerSpanId": "span_plan_01",
    "repairId": null
  },
  "tool": {
    "toolName": "canvas.createLayer",
    "toolVersion": "2026-04-02",
    "operation": "createLayer",
    "kind": "canvas_mutation"
  },
  "targetRef": {
    "documentId": "doc_123",
    "pageId": "page_0",
    "layerId": null,
    "artifactId": "artifact_banner_01"
  },
  "arguments": {
    "layerType": "shape",
    "shapeRole": "background",
    "styleTokens": {
      "fill": "spring_gradient",
      "opacity": 1
    },
    "bounds": { "x": 0, "y": 0, "width": 1200, "height": 628 }
  },
  "execution": {
    "liveCommit": true,
    "timeoutMs": 15000,
    "retryBudgetRemaining": 1,
    "idempotencyKey": "run_20260402_0001:act_001",
    "baseRevision": 42
  },
  "sourceRefs": {
    "requestId": "req_01JQ7J8QW2Q8P7D6W7NN4Q9JZ4",
    "constraintPackId": "cp_01",
    "artifactId": "artifact_banner_01"
  }
}
```

#### 10.6.2A Argument Validation Gates

tool adapter 호출 전 validation은 아래 순서대로 실행한다.

| gate | owner | 검증 내용 | 실패 시 canonical code |
| --- | --- | --- | --- |
| `plan_contract` | executor bootstrap | `ExecutorRunEnvelope.planRef` 와 persisted `Execution Plan` 일치 여부 | `plan_validation_failed` |
| `tool_schema` | executor | `arguments` 가 `toolName + toolVersion` input schema와 exact match인지 | `tool_input_invalid` |
| `cross_field_semantics` | executor | `targetRef`, `operation`, `kind`, `liveCommit`, associated action rollback contract 상호 일관성 | `tool_input_invalid` 또는 `policy_violation` |
| `runtime_guard` | executor | deadline 초과 여부, `expected_base_revision`, ownership scope, target existence | `stale_target_conflict`, `run_deadline_exceeded`, `policy_violation` |
| `adapter_preflight` | concrete tool adapter | provider/model/asset/storage 사전조건 충족 여부 | `provider_unavailable`, `asset_storage_unavailable` 등 |

추가 규칙:

1. `tool_schema` gate는 strict JSON Schema subset discipline을 따른다. object property 누락/추가를 허용하는 best-effort coercion은 v1에서 금지한다.
2. logical optional field는 생략이 아니라 nullable required key로 들어와야 한다. 예를 들어 `layerId` 가 없음을 뜻할 때는 key 자체를 빼지 말고 `null` 을 넣는다.
3. `cross_field_semantics` 는 schema만으로 잡기 어려운 규칙을 닫는다. 예를 들어 `operation=deleteLayer` 인데 `rollback.strategy=delete_created_layer` 인 경우처럼 의미 충돌이면 reject해야 한다.
4. `runtime_guard` 실패는 retryable 여부를 error class로 다시 분류하지만, blind retry 전에 최신 revision/ownership reconcile이 선행돼야 한다.

#### 10.6.3 ToolInvocationResult

`ToolInvocationResult.status` 는 `dispatched`, `succeeded`, `failed`, `compensated`, `skipped` 중 하나를 사용한다. `emits_mutation=true` 인 tool은 mutation ack 전까지 interim `dispatched` 상태를 가질 수 있다.

```json
{
  "toolCallId": "tc_20260402_0001_01",
  "traceId": "6c3fb033-9ef2-435c-b3e4-7d1cc4088dca",
  "runId": "run_20260402_0001",
  "attemptSeq": 1,
  "queueJobId": "run_20260402_0001__attempt_1",
  "planId": "plan_01",
  "planVersion": 1,
  "actionId": "act_001",
  "correlation": {
    "spanId": "span_act_001_01",
    "parentSpanId": "span_exec_01",
    "plannerSpanId": "span_plan_01",
    "repairId": null
  },
  "status": "succeeded",
  "attemptNo": 1,
  "output": {
    "resolvedLayerIds": ["layer_712"]
  },
  "resultRefs": {
    "assetIds": [],
    "layerIds": ["layer_712"],
    "saveReceiptId": null
  },
  "emittedMutations": [
    {
      "mutationId": "mut_0001",
      "commitGroup": "cg_001",
      "seq": 1,
      "status": "acked",
      "ackRevision": 43
    }
  ],
  "usage": {
    "meteringClass": "internal_metered_unpriced",
    "costState": "unpriced",
    "pricingVersion": "agent-v1-2026-04-02",
    "latencyMs": 184,
    "provider": "editor_gateway",
    "model": null,
    "invocationCount": 1,
    "cachedInputTokens": 0,
    "reasoningTokens": 0,
    "generatedImageCount": 0,
    "generatedImagePixels": 0,
    "inputBytes": 612,
    "outputBytes": 148,
    "estimatedCostUsd": 0
  },
  "error": null,
  "startedAt": "2026-04-02T10:00:01.100Z",
  "finishedAt": "2026-04-02T10:00:01.284Z"
}
```

핵심 필드 규칙:

- `output` 은 tool contract별 strict result schema를 따른다.
- `resultRefs` 는 asset/layer/save receipt 같은 stable identifier만 담는다.
- `emittedMutations` 는 0개 이상일 수 있으며, mutation/save/compensation의 durable join key가 된다.
- `usage` 는 모든 tool call에 필수이며, `meteringClass`, `costState`, `pricingVersion`, latency, provider/model, 추정 비용을 남겨 day-one observability와 cost attribution을 보장한다.
- `correlation.span_id` 와 `correlation.parent_span_id` 는 tool request/result pair에서 동일해야 하며, 이를 기준으로 action-local telemetry와 audit row를 1:1로 붙인다.
- model-backed tool은 provider usage가 있으면 `input_tokens`, `output_tokens` 를 필수로 채우고, provider가 지원하면 `cached_input_tokens`, `reasoning_tokens` 도 함께 남긴다.
- image generate/edit/search 계열은 token이 없더라도 `generated_image_count` 와 가능한 경우 `generated_image_pixels` 또는 동등 unit을 남겨야 한다.
- internal tool은 `estimatedCostUsd=0` 이어도 `invocationCount`, `latencyMs`, 필요 시 `inputBytes`, `outputBytes` 를 남겨 운영 footprint를 숨기지 않는다.
- 사용자-visible request 비용은 같은 `runId` 아래 acceptance 이후 실행된 모든 attempt/tool call 합으로 계산하고, job 운영 비용은 `attemptSeq + queueJobId` 별 breakdown으로 별도 본다.
- `error` 는 실패 시에도 free-form 문자열이 아니라 정규화된 error envelope를 사용한다.

#### 10.6.4 Error / Retry Semantics

| errorClass | retryable | executor rule |
| --- | --- | --- |
| `validation` | 아니오 | schema mismatch, missing required argument, unsupported enum. 즉시 실패시키고 재실행하지 않는다. |
| `policy` | 아니오 | fact policy, approval mode, forbidden side effect 위반. 차단 사유를 기록하고 action을 중단한다. |
| `conflict` | 조건부 | stale revision, missing target layer, optimistic concurrency 충돌. 최신 target/base revision 재확인 후 1회만 재시도 가능하다. |
| `transient_provider` | 예 | provider 5xx, temporary network failure. 남은 deadline 안에서 bounded backoff 재시도 가능하다. |
| `timeout` | 조건부 | side effect가 아직 방출되지 않았으면 1회 재시도 가능하다. 방출 여부가 불명확하면 `unknown_apply_state` 로 승격해 reconciliation을 먼저 수행한다. |
| `rate_limited` | 예 | provider 또는 internal gateway throttling. retry-after 힌트를 따르되 run deadline을 넘기면 안 된다. |
| `unknown_apply_state` | 직접 재실행 금지 | `idempotencyKey`, `toolCallId`, `mutation ledger` 기준으로 이미 반영됐는지 먼저 조회한다. 미반영으로 확인된 경우에만 replay 가능하다. |

추가 규칙:

- retry는 항상 같은 `actionId` 아래 새로운 `toolCallId` 또는 증가된 `actionAttemptSeq` 로 기록해야 한다.
- retry/resume 동안에도 같은 logical action/save의 `idempotencyKey` 는 유지해야 한다. 값이 바뀌면 side effect dedupe와 reconciliation 근거가 깨지므로 금지한다.
- retry 후에도 `commitGroup` 는 유지해 rollback/observability group을 깨지 않는다.
- partial side effect가 확인되면 blind retry 대신 compensation decision을 먼저 기록한다.

#### 10.6.4A Repair Decision Contract

planner repair와 executor recovery는 모두 아래 `RepairDecision` shape로 event log와 action log에 남겨야 한다. 이 object는 "무엇이 실패했고 다음에 어떤 bounded 복구를 할지"를 free-form message가 아니라 machine-readable record로 남기는 목적이다.

```json
{
  "repairId": "repair_02",
  "runId": "run_20260402_0001",
  "traceId": "6c3fb033-9ef2-435c-b3e4-7d1cc4088dca",
  "attemptSeq": 1,
  "queueJobId": "run_20260402_0001__attempt_1",
  "scope": "action_attempt",
  "plannerSpanId": "span_plan_01",
  "executorSpanId": "span_exec_01",
  "actionId": "act_002",
  "toolCallId": "tc_20260402_0001_03",
  "decision": "rebase_and_retry",
  "reason": {
    "errorClass": "conflict",
    "errorCode": "stale_target_conflict"
  },
  "resumeFromActionId": "act_002",
  "resumeFromSeq": 2,
  "compensateCommitGroup": null,
  "recordedAt": "2026-04-02T10:00:04.100Z"
}
```

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `scope` | enum | 예 | `planner_output`, `action_attempt`, `mutation_reconciliation`, `save_finalize` |
| `decision` | enum | 예 | `replan`, `retry_action`, `rebase_and_retry`, `fallback_optional_slot`, `compensate_commit_group`, `finalize_with_warning`, `terminal_fail` |
| `reason.errorClass` | enum | 예 | 10.6.4 canonical error class |
| `reason.errorCode` | string | 예 | normalized machine-readable code |
| `resumeFromActionId` | string/null | 예 | execution 재개 시작점 |
| `resumeFromSeq` | integer/null | 예 | mutation ledger reconciliation 기준 seq |
| `compensateCommitGroup` | string/null | 예 | rollback/cleanup 대상 group |

규칙:

1. 동일 failure에 대해 여러 logger가 서로 다른 repair 결정을 쓰면 안 된다. canonical writer는 worker runtime 또는 backend finalizer 한 곳이어야 한다.
2. `decision=replan` 은 planner stage에만 허용되고, 이미 visible ack가 발생한 뒤에는 금지한다.
3. `decision=rebase_and_retry` 또는 `retry_action` 은 같은 logical `idempotencyKey` 를 유지해야 하며, 새 `toolCallId` 로만 시도를 구분한다.
4. `decision=compensate_commit_group` 이면 compensation mutation들도 같은 `repairId` 를 달고 원 action/tool/mutation chain에 연결돼야 한다.

#### 10.6.5 Traceability Chain

| ID | 생성 시점 | 다음 연결 지점 | 의미 |
| --- | --- | --- | --- |
| `httpRequestId` | 각 HTTP ingress | request log, SSE subscribe log, mutation ack log, worker callback log | 개별 API request correlation |
| `clientRequestId` | FE가 run start intent 생성 시 | public request body, `agent_run_requests.client_request_id` | acceptance dedupe와 사용자 재전송 provenance |
| `requestId` | Agent API가 dedupe acceptance를 새 run으로 확정할 때 | `agent_run_requests.request_id`, `agent_runs.request_id`, `ToolInvocationRequest.sourceRefs` | immutable accepted northbound request row identity |
| `snapshotId` | Agent API가 acceptance snapshot을 durable write 할 때 | `agent_run_snapshots`, `agent_runs.request_snapshot_ref` | acceptance 시점 editor/canvas 조건 identity |
| `traceId` | run acceptance 직후 | plan, action, tool call, mutation, save receipt, final summary 전부 | end-to-end 상관관계 키 |
| `runId` | run acceptance | plan, queue attempt, tool call, mutation ledger, result | 사용자-visible run 식별자 |
| `attemptSeq` | enqueue 또는 retry 승인 시 | queue attempt row, worker callback, plan execution context | 같은 run 안의 queue/worker 재시도 순번 |
| `queueJobId` | queue publish 직전 | `agent_run_attempts`, `QueueEvents`, worker log | transport plane에서 attempt를 찾는 키 |
| `plannerSpanId` | planner input envelope 생성 시 | planner output, validation issue, repair request, executor envelope | planning phase sub-trace |
| `executorSpanId` | executor envelope 생성 시 | tool invocation, mutation proposal, finalize flow | execution phase 상위 span |
| `planId` + `planVersion` | planner validation 완료 | tool call, action log, worker attempt | 어떤 validated plan이 실행됐는지 식별 |
| `actionId` | execution plan 생성 | tool call, rollback record, result summary | plan 내부 step 추적 |
| `spanId` | 개별 action attempt 시작 시 | tool result, provider metadata, repair decision | action-level telemetry span |
| `repairId` | repair/recovery decision 기록 시 | repair request/result, compensation, warning/final summary | bounded recovery chain 식별 |
| `toolCallId` | Worker Runtime이 action attempt 생성 시 | tool result, mutation ledger, save receipt, compensation | action과 concrete adapter 실행을 잇는 핵심 join key |
| `mutationId` | mutation dispatch 시 | mutation ack, rollback, completion snapshot | 실제 캔버스 side effect 추적 |
| `saveReceiptId` | save 완료 시 | run result, completion snapshot | durability 증빙 |
| `compensatesToolCallId` | compensation 생성 시 | rollback log, mutation ledger | 어떤 실패/부분 적용을 되돌리는지 추적 |

canonical creation order는 `clientRequestId -> httpRequestId -> requestId -> snapshotId -> runId -> traceId -> attemptSeq/queueJobId -> plannerSpanId -> executorSpanId -> spanId/toolCallId -> mutationId/saveReceiptId` 다.

추가 규칙:

- `traceId` 는 process-local logger context에만 의존하지 않고 queue payload, worker callback payload, tool request/result, mutation/save envelope에 물리적으로 포함돼야 한다.
- `queueJobId` 는 BullMQ `jobId` 와 동일해야 하며, recommended format은 `run_20260402_0001__attempt_1` 같은 colon-free string이다.
- `QueueEvents` 기반 transport telemetry는 `queueJobId` 만 알려 주므로, backend는 enqueue 시점에 반드시 `queueJobId -> runId -> traceId` 매핑을 durable하게 남겨야 한다.
- `providerRequestId`, `externalJobId` 는 항상 `toolCallId` 하위 metadata다. provider id만으로 run correlation을 시도하면 안 된다.
- `plannerSpanId`, `executorSpanId`, `spanId` 는 같은 `traceId` 아래 parent-child 관계를 가져야 한다. tool call이 planner span에 직접 매달리면 execution phase 경계가 흐려지므로 금지한다.
- `repairId` 는 run 전체 unique면 충분하지만, 최소한 같은 `traceId` 안에서 충돌 없이 한 번만 발급돼야 한다.

control-plane 기준의 canonical join path는 `ExecutionPlan.actions[actionId] -> ToolInvocationRequest.toolCallId -> ToolInvocationResult.emittedMutations[].mutationId -> mutation ledger/save receipt` 로 고정한다.

#### 10.6.5A Canvas Mutation and Reconciliation Contracts

이 절은 `canvas.createLayer`, `canvas.updateLayer`, `canvas.deleteLayer` 를 하나의 canonical layer-mutation family로 묶고, FE delivery/ack/reconciliation/final-state 규칙을 한 곳에서 고정한다. text/image 전용 tool은 planner-facing 표현을 더 풍부하게 만들기 위한 것이며, 실제 live-commit side effect는 모두 이 mutation family 또는 동등한 envelope로 환원돼야 한다.

##### 10.6.5A.1 Canonical layer mutation tool family

| toolName | operation | kind | v1 enabled | 역할 |
| --- | --- | --- | --- | --- |
| `canvas.createLayer` | `createLayer` | `canvas_mutation` | 예 | 새 agent-owned layer 또는 subtree 생성 |
| `canvas.updateLayer` | `updateLayer` | `canvas_mutation` | 예 | 기존 layer를 같은 `layerId` 로 유지한 채 bounds/style/asset/metadata를 patch |
| `canvas.deleteLayer` | `deleteLayer` | `canvas_mutation` | 예 | agent-owned placeholder 또는 no-longer-needed layer/subtree 제거 |

추가 규칙:

- v1 사용자 표면은 empty-canvas create flow만 노출하지만, worker는 refinement, placeholder 교체, cleanup, compensation을 위해 `updateLayer`, `deleteLayer` 를 즉시 사용할 수 있어야 한다.
- specialized tool(`canvas.text.editText`, `canvas.image.replaceImageAsset` 등)은 executor 내부에서 `canvas.updateLayer` 계열 mutation envelope를 만들 수 있어야 한다. 즉, specialized result와 generic mutation ledger가 서로 다른 세계로 분리되면 안 된다.
- `canvas.updateLayer` 는 target을 delete 후 recreate하는 우회 구현을 허용하지 않는다. 같은 `layerId` 유지가 계약이며, 지키지 못하면 명시적 `deleteLayer + createLayer` 계획과 compensation 근거를 별도로 남겨야 한다.
- `canvas.deleteLayer` 는 visible tree에서 target을 제거하는 의미다. FE undo stack이나 내부 history snapshot은 있을 수 있지만, run final state에서는 tombstone만 남고 active layer로 간주하지 않는다.

##### 10.6.5A.2 `CanvasMutationEnvelope`

`CanvasMutationEnvelope` 는 worker가 backend에 proposal로 제출하고, backend가 SSE `canvas.mutation` 이벤트로 FE에 fan-out하는 공통 mutation 단위다. ledger에는 envelope 원문과 ack/reconciliation 결과를 함께 남긴다.

| 필드 | 타입 | 필수 | 설명 / 규칙 |
| --- | --- | --- | --- |
| `mutationId` | string | 예 | mutation 고유 ID. replay/reconciliation 동안 불변 |
| `mutation_version` | string | 예 | envelope schema 버전 |
| `traceId` | string | 예 | end-to-end trace join key |
| `runId` | string | 예 | 상위 run |
| `draftId` | string | 예 | 상위 draft |
| `documentId` | string | 예 | 대상 document |
| `pageId` | string | 예 | 대상 active page |
| `seq` | integer | 예 | run 내부 strict total order. `1`부터 시작 |
| `commitGroup` | string | 예 | user-visible forward progress 최소 단위 |
| `depends_on_seq` | integer/null | 예 | 일반적으로 직전 `seq`. gap이 있으면 FE는 apply 금지 |
| `idempotencyKey` | string | 예 | logical mutation dedupe key. retry/resume 중에도 유지 |
| `expected_base_revision` | integer | 예 | apply 시작 시 page revision guard |
| `ownership_scope` | enum | 예 | v1 기본값은 `draft_only`. run이 소유한 layer만 직접 변이 가능 |
| `commands` | array | 예 | 1개 이상 20개 이하의 ordered command list |
| `rollback_hint` | object | 예 | compensation 시 필요한 최소 정보. `{ rollback_group_id, strategy, restore_snapshot_ref? }` |
| `emitted_at` | datetime | 예 | backend fan-out 기준 timestamp |
| `delivery_deadline_at` | datetime | 예 | FE apply/ack 기대 deadline |

`ownership_scope` enum은 최소 `draft_only`, `draft_and_descendants` 를 지원한다. v1 representative flow는 `draft_only` 만 사용하되, future subtree edit/delete 확장을 위해 enum 자체는 미리 열어 둔다.

##### 10.6.5A.3 `CanvasMutationCommand`

모든 command는 아래 공통 필드를 가진다.

| 필드 | 타입 | 필수 | 설명 / 규칙 |
| --- | --- | --- | --- |
| `command_id` | string | 예 | envelope 내부 unique ID |
| `op` | enum | 예 | `createLayer`, `updateLayer`, `deleteLayer`, `saveTemplate` |
| `slotKey` | string/null | 예 | semantic slot. 예: `headline_primary`, `hero_image`, `decor_01`. `saveTemplate` 는 항상 `null` |
| `clientLayerKey` | string/null | 예 | run/draft 내부 stable key. create 시 필수, update/delete는 known target이 있으면 nullable, `saveTemplate` 는 `null` |
| `targetRef` | object | 예 | `{ layerId?, clientLayerKey?, slotKey? }`. create는 `layerId=null`, update/delete는 최소 하나 이상 필요, `saveTemplate` 는 draft/page scope save라 구체 layer target 없이도 허용 |
| `target_layer_version` | integer/null | 예 | create와 `saveTemplate` 는 `null`. update/delete는 현재 active projection의 expected layer version |
| `expected_layer_type` | enum/null | 예 | `group`, `shape`, `text`, `image`, `sticker`, `unknown` |
| `allow_noop` | boolean | 예 | duplicate delivery 또는 이미 충족된 state를 noop success로 처리할지 |
| `metadataTags` | object | 예 | 최소 `runId`, `draftId`, `slotKey`, `clientLayerKey`, `lastMutationId` 를 포함해야 한다 |

`targetRef` 해석 규칙:

1. `saveTemplate` 는 draft/page scope save command라 `targetRef.layerId` 가 없어도 된다. 나머지 op는 최소 하나 이상의 target 식별자를 가져야 한다.
2. `layerId` 가 있으면 1순위 식별자다.
3. `layerId` 가 없고 `clientLayerKey` 가 있으면 FE/editor는 layer metadata에서 `runId + draftId + clientLayerKey` 조합으로 target을 찾아야 한다.
4. `slotKey` 단독 탐색은 마지막 fallback이다. 여러 layer가 매칭되면 non-retryable `conflict` 로 실패시킨다.
5. `target_layer_version` 은 per-layer optimistic guard다. create와 `saveTemplate` 는 항상 `null`, update/delete는 `>= 1` 이어야 하며 현재 active projection version과 일치하지 않으면 blind apply 대신 reconciliation 또는 `conflict` 로 처리한다.

`createLayer` command는 아래 필드를 추가로 가진다.

| 필드 | 타입 | 필수 | 설명 / validation |
| --- | --- | --- | --- |
| `desiredLayerId` | string/null | 예 | backend/worker가 선발급한 layer id. FE가 유지 가능하면 그대로 사용 |
| `parentRef` | object | 예 | `{ layerId?, clientLayerKey?, position }`. `position` 은 `front`, `back`, `before:<layerId>`, `after:<layerId>` |
| `layerBlueprint` | object | 예 | `{ layerType, bounds, transform, styleTokens, assetBinding?, textBindingRef?, metadata }` |
| `editable` | boolean | 예 | 생성 직후 기존 편집기 도구로 직접 편집 가능한지 |

추가 규칙:

1. `clientLayerKey` 는 create 시 필수이며 같은 `runId + draftId` 안에서 중복될 수 없다.
2. create된 layer/subtree는 metadata에 최소 `runId`, `draftId`, `clientLayerKey`, `slotKey`, `createdByMutationId`, `lastMutationId` 를 남겨야 한다.
3. duplicate replay 시 동일 metadata를 가진 layer가 이미 존재하면 새 layer를 만들지 않고 `noop_already_applied` 로 응답한다.
4. create가 처음 ack되면 backend projection은 해당 layer의 `layer_version=1` 로 시작한다. duplicate noop이나 rejected apply는 version을 증가시키면 안 된다.

`updateLayer` command는 아래 필드를 추가로 가진다.

| 필드 | 타입 | 필수 | 설명 / validation |
| --- | --- | --- | --- |
| `patchMask` | array | 예 | 1개 이상. `bounds`, `transform`, `styleTokens`, `assetBinding`, `metadata`, `zOrder`, `parentRef`, `visibility` 중 선택 |
| `patch` | object | 예 | `patch_mask` 에 포함된 필드만 채운다 |
| `ifMatch` | object | 예 | `{ expected_revision?, expected_content_hash?, expected_asset_id?, expected_layer_type? }` |
| `preserveLayerId` | boolean | 예 | v1에서는 항상 `true` 여야 한다 |

추가 규칙:

1. `patch_mask` 에 없는 필드를 `patch` 에 넣으면 validation 오류다.
2. `preserve_layer_id=false` 는 허용하지 않는다. 교체가 필요하면 planner가 `deleteLayer + createLayer` 를 명시해야 한다.
3. `asset_binding` patch는 반드시 stable `assetId` 만 참조해야 하며 provider URL/base64를 직접 넣으면 안 된다.
4. duplicate replay 시 target layer의 `lastMutationId` 가 이미 현재 `mutationId` 이거나, `ifMatch` 와 patch fingerprint가 이미 충족됐으면 `noop_already_applied` 로 처리한다.
5. `target_layer_version` 은 필수다. 성공적으로 ack된 `updateLayer` 는 target active layer의 version을 정확히 `+1` 증가시켜야 하며, noop/rejected/reconciled_not_applied 는 version을 증가시키면 안 된다.

`deleteLayer` command는 아래 필드를 추가로 가진다.

| 필드 | 타입 | 필수 | 설명 / validation |
| --- | --- | --- | --- |
| `cascade_mode` | enum | 예 | `delete_subtree`, `reject_if_has_children` |
| `deleteReason` | enum | 예 | `cleanup_placeholder`, `replace_with_final`, `rollback`, `user_visible_trim`, `compensation` |
| `tombstone` | object | 예 | `{ keep_tombstone_record: boolean, tombstone_key }` |

추가 규칙:

1. v1 기본값은 `cascade_mode=delete_subtree` 다. orphan child를 남기면 안 된다.
2. target이 이미 없고 같은 `runId + draftId + clientLayerKey` tombstone이 있으면 `allow_noop=true` 인 경우 `noop_already_applied` 로 처리한다.
3. delete는 page tree에서 사라지더라도 ledger/final state에는 tombstone metadata를 남겨 replay/reconciliation 근거를 보존해야 한다.
4. `target_layer_version` 은 필수다. 성공적으로 ack된 delete는 active projection을 닫고 `deletedAtLayerVersion=target_layer_version`, `tombstoneVersion=target_layer_version + 1` 을 기록해야 한다.

`saveTemplate` command는 아래 필드를 추가로 가진다.

| 필드 | 타입 | 필수 | 설명 / validation |
| --- | --- | --- | --- |
| `reason` | enum | 예 | `milestone_first_editable`, `run_completed` |

추가 규칙:

1. `saveTemplate` 는 같은 envelope 안에서 마지막 command로만 허용한다.
2. save는 user-visible layer mutation이 아니라 durability step이므로 `target_layer_version=null` 이어야 한다.
3. duplicate replay 시 동일 `runId + draftId + reason + expected_base_revision` 에 대한 save receipt가 이미 있으면 새 save를 발행하지 않고 기존 receipt 재사용 또는 `noop_already_applied` 로 처리해야 한다.

##### 10.6.5A.4 Emitted mutation event and ack schemas

public SSE와 internal append event는 동일한 `CanvasMutationEnvelope` 를 payload core로 사용한다. public stream은 FE apply에 필요한 delivery metadata만 추가하고, internal event는 rollback/retry metadata를 더 붙일 수 있다.

`canvas.mutation` public event는 아래 필드를 최소 포함해야 한다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `type` | string | 항상 `canvas.mutation` |
| `runId` | string | 상위 run |
| `draftId` | string | 상위 draft |
| `pageId` | string | 대상 active page |
| `seq` | integer | FE apply 순서 |
| `mutation` | `CanvasMutationEnvelope` | 실제 mutation payload |
| `at` | datetime | event append timestamp |

FE ack payload는 아래 필드를 최소 포함해야 한다.

| 필드 | 타입 | 설명 / 규칙 |
| --- | --- | --- |
| `runId` | string | 상위 run |
| `mutationId` | string | ack 대상 mutation |
| `seq` | integer | ack 대상 seq |
| `status` | enum | `applied`, `noop_already_applied`, `rejected` |
| `partial_apply_detected` | boolean | 일부 command만 적용된 뒤 실패했는지 |
| `targetPageId` | string | 대상 page |
| `baseRevision` | integer | apply 시작 시 FE가 본 revision |
| `resultingRevision` | integer/null | terminal outcome 후 FE revision |
| `resolvedLayerIds` | object | `clientLayerKey -> layerId` 매핑 |
| `commandResults` | array | 각 command별 `{ commandId, op, status, resolvedLayerId?, removedLayerIds?, changedFields?, targetLayerVersion?, resultingLayerVersion?, tombstoneKey?, contentHash?, error? }` |
| `error` | object/null | envelope-level 실패 요약 |
| `clientObservedAt` | datetime | FE 관측 시각 |

추가 규칙:

1. `status=applied` 는 모든 command가 `applied` 또는 duplicate-safe `noop_already_applied` 일 때만 허용된다.
2. `status=noop_already_applied` 는 전체 envelope가 이전 delivery/reconnect replay에서 이미 반영된 것이 확실할 때만 사용한다.
3. `status=rejected` 이면 `commandResults` 를 반드시 채워야 하며, 일부 command가 성공했으면 `partial_apply_detected=true` 로 올려야 한다.
4. backend는 ack를 받은 즉시 ledger에 `ack_outcome`, `resultingRevision`, `resolvedLayerIds`, `command_results` 를 기록해야 한다.
5. `commandResults[].target_layer_version` 과 `resulting_layer_version` 은 FE/editor가 추론 가능한 범위에서 채우고, backend finalizer는 이를 ledger history와 조합해 canonical per-layer version projection을 확정해야 한다.

##### 10.6.5A.5 Ordering, idempotency, and reconciliation rules

1. `seq` 는 run 내부 strict total order다. FE는 `nextExpectedSeq` 보다 큰 mutation을 apply하면 안 된다.
2. 같은 `commitGroup` 안의 mutation은 seq 순서대로 terminal ack가 날 때까지 다음 commit group을 시작하면 안 된다.
3. 같은 logical mutation의 retry/resume 동안 `mutationId`, `idempotencyKey`, `commitGroup`, `clientLayerKey` 는 유지해야 한다. 바뀌면 blind replay로 간주하고 차단한다.
4. duplicate delivery 판단 우선순위는 `mutationId` -> `idempotencyKey` -> layer metadata(`runId`, `draftId`, `clientLayerKey`, `lastMutationId`) 순서다.
5. `createLayer` duplicate replay는 기존 layer 재사용 + `resolvedLayerIds` 회수로 끝내야 하며, 두 번째 physical create를 허용하지 않는다.
6. `updateLayer` duplicate replay는 target layer의 `lastMutationId` 또는 patch fingerprint로 판정한다. 이미 같은 patch가 반영돼 있으면 noop, 다른 patch가 끼어들었으면 `conflict` 로 실패시킨다.
7. `deleteLayer` duplicate replay는 동일 tombstone 또는 target 부재로 판정한다. target이 없어도 같은 tombstone이 없고 다른 run이 layer를 소유하고 있으면 `conflict` 다.
8. `unknown_apply_state` 발생 시 direct replay를 금지한다. backend/worker는 먼저 `(a) ledger row`, `(b) FE가 본 latest revision`, `(c) layer metadata/tombstone`, `(d) final save receipt` 를 기준으로 reconciliation 해야 한다.
9. reconciliation 결과가 `applied` 또는 `noop_already_applied` 로 확정되면 동일 `mutationId` 로 ledger를 닫고 다음 seq로 진행한다. `not_applied` 로 확정된 경우에만 같은 `mutationId` / `idempotencyKey` 로 1회 replay 가능하다.
10. partial apply가 확인되면 blind retry 대신 compensation decision을 먼저 기록한다. compensation 역시 별도 `mutationId` 와 `seq` 를 가져야 하지만 `rollback_group_id` 로 원 mutation과 연결돼야 한다.
11. terminal success 전제는 `last_acked_mutation_seq == last_emitted_mutation_seq` 이고, open reconciliation 상태가 0건이며, latest save receipt가 `final_revision` 과 일치하는 것이다.

##### 10.6.5A.5A Layer identity and versioning model

v1은 page-level revision과 layer-level version을 구분해야 한다. page revision은 editor/template store의 문서 전체 상태를 추적하고, layer version은 run-owned layer projection의 optimistic guard와 final-state reporting을 위해 사용한다.

| 개념 | canonical field | owner | 규칙 |
| --- | --- | --- | --- |
| physical layer identity | `layerId` | FE/editor gateway | editor가 실제로 가진 object ID. layer가 살아 있는 동안 stable |
| logical layer identity | `clientLayerKey` | planner/worker | 같은 `runId + draftId` 안에서 stable. retry/resume 동안 불변 |
| semantic identity | `slotKey` | planner/worker | headline, CTA, hero image 같은 의미 슬롯. 여러 layer가 한 slot에 매핑될 수 있음 |
| document version | `page revision` / `ackRevision` / `final_revision` | editor/template store | page 전체 단위 monotonic revision |
| layer version | `target_layer_version`, `resulting_layer_version`, `activeLayers[].layer_version` | backend finalizer projection | run-owned layer 단위 monotonic version |
| tombstone version | `deletedLayers[].tombstone_version` | backend finalizer projection | delete로 active projection이 닫힌 뒤 남는 삭제 version |

추가 규칙:

1. `layerId` 는 물리 식별자이고 `clientLayerKey` 는 논리 식별자다. v1 final-state summary는 둘 다 보존해야 한다.
2. `clientLayerKey` 는 같은 run/draft 안에서 다른 live layer에 재사용하면 안 된다. delete 후 새 레이어를 만들 때도 replacement semantics가 필요하면 새 `clientLayerKey` 를 써야 한다.
3. layer version은 첫 acked create에서 `1` 로 시작한다.
4. acked `updateLayer` 는 target layer version을 정확히 `+1` 증가시킨다. `noop_already_applied`, `rejected`, `reconciled_not_applied` 는 version을 증가시키지 않는다.
5. acked `deleteLayer` 는 active projection을 닫고 tombstone을 남긴다. tombstone version은 delete 직전 active version보다 정확히 `+1` 이어야 한다.
6. page revision은 문서 전체 변경 때문에 여러 layer가 함께 증가할 수 있다. 반대로 layer version은 해당 layer projection이 실제로 변한 경우에만 증가한다.
7. FE는 layer version의 canonical source가 아니다. FE는 `resultingRevision`, `resolvedLayerIds`, `changedFields`, `contentHash` 같은 관측 증거를 반환하고, backend/ledger/finalizer가 이를 바탕으로 authoritative layer version projection을 계산한다.
8. future `updateLayer` / `deleteLayer` user-facing flows도 같은 identity model을 그대로 재사용해야 하며, 새 API surface를 위해 별도 layer identity 체계를 만들면 안 된다.

##### 10.6.5A.6 `AuthoritativeCanvasFinalState`

run 종료 시 backend finalizer는 `AuthoritativeCanvasFinalState` 를 산출해야 한다. 이 object는 full document 전체를 대체하는 것이 아니라, `final_revision` 시점에 이번 run이 만들어낸 draft scope를 authoritative하게 설명하는 control-plane summary다. 사용자-visible full document truth는 여전히 editor/template store의 `page revision` 이다.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `runId` | string | 예 | 상위 run |
| `draftId` | string | 예 | 상위 draft |
| `documentId` | string | 예 | 대상 document |
| `pageId` | string | 예 | 대상 page |
| `baseRevision` | integer | 예 | run 시작 시 revision |
| `final_revision` | integer | 예 | 마지막 acked mutation 이후 page revision |
| `durability_state` | enum | 예 | `durable_saved`, `applied_not_saved`, `unknown` |
| `saveReceiptId` | string/null | 예 | latest save receipt |
| `reconciled_through_seq` | integer | 예 | reconciliation이 끝난 마지막 seq |
| `root_layer_ids` | string[] | 예 | 초안의 최상위 root layer 집합 |
| `editable_layer_ids` | string[] | 예 | 사용자가 바로 편집 가능한 layer |
| `slotBindings` | object | 예 | `slotKey -> layerId[]` |
| `activeLayers` | array | 예 | 현재 page에 남아 있는 run-owned layer summary |
| `deletedLayers` | array | 예 | tombstone summary |
| `warnings` | array | 예 | fallback/save/reconciliation 경고 |
| `completion_state` | enum | 예 | `editable_draft_ready`, `completed`, `completed_with_warning`, `save_failed_after_apply`, `failed` |

`activeLayers[]` 각 항목은 최소 `{ layerId, clientLayerKey, slotKey, layerType, layerVersion, parentLayerId, zIndex, bounds, editable, placeholderState, assetId?, contentHash?, createdByMutationId, lastMutationId }` 를 포함해야 한다.

`deletedLayers[]` 각 항목은 최소 `{ clientLayerKey, formerLayerId, formerSlotKey, deletedAtLayerVersion, tombstoneVersion, deleteReason, deletedByMutationId, deletedSeq, tombstoneKey }` 를 포함해야 한다.

추가 규칙:

1. `AuthoritativeCanvasFinalState` 는 `agent_final_summaries` 또는 동등 artifact ref로 저장돼야 하며, `run.completed` / `run.failed` summary의 canonical source가 된다.
2. `durability_state=durable_saved` 는 `saveReceiptId != null` 이고 `saved_revision == final_revision` 일 때만 허용된다.
3. `completed` / `completed_with_warning` 는 `durability_state=durable_saved` 와 `reconciled_through_seq == last_emitted_mutation_seq` 를 동시에 만족해야 한다.
4. `save_failed_after_apply` 는 `activeLayers` 가 존재해도 `durability_state=applied_not_saved` 이므로 success로 승격하면 안 된다.
5. finalizer가 `activeLayers` projection과 editor store의 `final_revision` snapshot이 불일치함을 발견하면 terminal success를 확정하지 말고 reconciliation 또는 fail-safe warning으로 내려야 한다.

##### 10.6.5A.7 `AuthoritativeCanvasDiff`

`final_layer_diff_summary_ref` 는 아래 `AuthoritativeCanvasDiff` artifact를 가리켜야 한다. 이 diff는 `baseRevision -> final_revision` 사이에서 이번 run이 draft scope에 남긴 net effect를 canonical하게 표현한다. full editor document dump가 아니라, `AuthoritativeCanvasFinalState` 를 복원하거나 검증할 수 있는 run-scoped diff여야 한다.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `diff_version` | string | 예 | diff schema 버전 |
| `runId` | string | 예 | 상위 run |
| `draftId` | string | 예 | 상위 draft |
| `documentId` | string | 예 | 대상 document |
| `pageId` | string | 예 | 대상 page |
| `baseRevision` | integer | 예 | run 시작 시 revision |
| `final_revision` | integer | 예 | terminal 시점 revision |
| `reconciled_through_seq` | integer | 예 | reconciliation 완료 seq |
| `summary` | object | 예 | `{ created_count, updated_count, deleted_count, noop_count, compensated_count }` |
| `created` | array | 예 | base에는 없고 final에는 존재하는 active layer net additions |
| `updated` | array | 예 | base와 final 모두 존재하지만 값이 바뀐 layer net updates |
| `deleted` | array | 예 | base에는 있었고 final에서는 tombstone만 남는 net deletes |
| `noop_mutations` | array | 예 | duplicate replay/reconciliation으로 net effect가 없었던 mutation summary |
| `compensated_mutations` | array | 예 | 최종 net diff에는 남지 않았지만 rollback/cleanup에 사용된 mutation summary |
| `warnings` | array | 예 | diff 계산 과정의 warning/fallback/reconciliation notes |

`created[]` 각 항목은 최소 `{ layerId, clientLayerKey, slotKey, layerType, layerVersion, createdByMutationId, createdSeq, parentLayerId, zIndex, bounds, editable, assetId?, contentHash? }` 를 포함해야 한다.

`updated[]` 각 항목은 최소 `{ layerId, clientLayerKey, slotKey, fromLayerVersion, toLayerVersion, updatedByMutationId, updatedSeq, changedFields, previousBounds?, newBounds?, previousContentHash?, newContentHash?, previousAssetId?, newAssetId? }` 를 포함해야 한다.

`deleted[]` 각 항목은 최소 `{ clientLayerKey, formerLayerId, formerSlotKey, fromLayerVersion, tombstoneVersion, deleteReason, deletedByMutationId, deletedSeq, tombstone_key }` 를 포함해야 한다.

추가 규칙:

1. `created`, `updated`, `deleted` 는 terminal reconciliation 이후의 net effect만 표현해야 한다. 중간에 생성됐다가 cleanup된 임시 layer는 `compensated_mutations` 에만 남기고 net diff에는 남기지 않는다.
2. base snapshot이 empty canvas인 v1 representative flow에서도 diff artifact는 생략하면 안 된다. 이 경우 대부분의 visible 결과는 `created[]` 에 들어가고 `updated[]` / `deleted[]` 는 0건일 수 있다.
3. 같은 layer가 run 중 여러 번 update됐더라도 net diff에는 최종 `fromLayerVersion -> toLayerVersion` 범위 한 건으로 압축할 수 있다. 세부 mutation history는 ledger가 authoritative source다.
4. `AuthoritativeCanvasDiff` 와 `AuthoritativeCanvasFinalState` 는 서로 모순되면 안 된다. `created + updated - deleted` 를 base snapshot에 적용한 결과는 final state의 `activeLayers` 와 `deletedLayers` 와 일치해야 한다.
5. `final_layer_diff_summary_ref` 와 `final_canvas_state_ref` 는 terminal 이후 immutable이어야 한다. 정정이 필요하면 기존 artifact를 덮어쓰지 말고 correction event와 새 ref를 별도로 남긴다.

#### 10.6.6 Text Authoring Tool Schemas

text authoring contract는 `toolditor` 의 기존 `addText()` / `UpdateTextsCommand` / `TextType.styles` 모델을 내부 adapter가 재사용할 수 있게 하되, agent layer에서는 더 명시적인 canonical tool로 노출한다.

v1 canonical tool set은 아래처럼 고정한다.

| toolName | operation | kind | 목적 |
| --- | --- | --- | --- |
| `canvas.text.addText` | `createLayer` | `canvas_mutation` | 새 text layer 생성 |
| `canvas.text.editText` | `updateLayer` | `canvas_mutation` | 기존 text layer의 content/layout/typography 변경 |
| `canvas.text.patchStyleRanges` | `updateLayer` | `canvas_mutation` | 한 text layer 안의 부분 강조/부분 스타일 수정 |

주의:

- text 삭제는 별도 `canvas.text.deleteText` 를 만들지 않고 generic `canvas.deleteLayer` 로 처리한다.
- 위 3개 tool은 모두 `ToolInvocationRequest.targetRef` 와 별도로 tool-specific `arguments` 만 정의한다.
- 세 schema 모두 strict mode 호환을 위해 `type=object`, explicit `required`, `additionalProperties=false` 전제를 따른다.

공통 enum과 helper object는 아래를 사용한다.

| 이름 | 타입/값 | 규칙 |
| --- | --- | --- |
| `textRole` | `headline`, `supporting_copy`, `cta_label`, `badge`, `disclaimer`, `placeholder` | planner와 FE summary가 공유하는 semantic slot key |
| `factuality` | `user_provided`, `generic_generated`, `placeholder`, `omitted` | copy provenance 명시 |
| `boxMode` | `auto_size`, `fixed_width` | `auto_size` 는 height를 결과에서 재계산할 수 있다 |
| `overflowMode` | `grow`, `shrink_to_fit`, `reject` | `reject` 는 overflow 발생 시 `validation` 또는 `policy` 실패로 종료 |
| `editMode` | `replace_all`, `replace_range` | `replace_range` 는 UTF-16 index 기준 |
| `layoutAdjustment` | `preserve_box`, `grow_height`, `shrink_to_fit`, `recompute_bounds` | content 변경 후 text box 처리 방식 |
| `textAlign` | `left`, `center`, `right` | `toolditor` 의 기존 align enum과 동일 |
| `TextBounds` | `{ x, y, width, height }` | 모든 값은 px number, `width > 0`, `height > 0` |
| `TextTypography` | `{ fontFamilyToken, fontSizePx, fontWeight, fontStyle, textAlign, lineHeight, letterSpacingPx, textDecoration, fillMode, fillValue, strokeColor, strokeWidthPx, uppercase }` | strict schema에서는 전체 필드를 항상 채우고, 사용하지 않는 값도 `normal`, `none`, `0`, `null` 등 명시값으로 보낸다 |

role별 hard validation budget은 아래를 따른다.

| `textRole` | max chars | max line breaks | 추가 규칙 |
| --- | --- | --- | --- |
| `headline` | 48 | 1 | 결과는 최대 2줄 |
| `supporting_copy` | 120 | 2 | 결과는 최대 3줄 |
| `cta_label` | 24 | 0 | 단일 줄만 허용 |
| `badge` | 20 | 0 | 단일 줄만 허용 |
| `disclaimer` | 120 | 2 | 작은 크기 허용 |
| `placeholder` | 60 | 1 | 사실값 미확정 슬롯 전용 |

공통 runtime validation 규칙:

1. `content` 또는 `newContent` 는 trim 후 비어 있으면 안 된다.
2. `TextBounds` 는 active page rectangle과 교차해야 한다. 완전히 캔버스 밖인 요청은 허용하지 않는다.
3. `fontSizePx` 는 `8 <= value <= 256`, `lineHeight` 는 `0.8 <= value <= 3.0`, `letterSpacingPx` 는 `-10 <= value <= 80` 범위를 벗어나면 안 된다.
4. `strokeWidthPx` 는 `0 <= value <= 24` 이어야 한다.
5. `overflowMode=shrink_to_fit` 인 경우 `minFontSizePx` 를 함께 보내야 하며 `8 <= minFontSizePx <= fontSizePx` 를 만족해야 한다.
6. 모든 결과 object는 `layerId`, `resolvedBounds`, `textMetrics`, `overflowStatus`, `contentHash` 를 포함해야 한다.

##### 10.6.6.1 `canvas.text.addText`

Registry metadata 예시는 아래를 따른다.

```json
{
  "toolName": "canvas.text.addText",
  "toolVersion": "2026-04-02",
  "aliases": ["addText"],
  "operation": "createLayer",
  "kind": "canvas_mutation",
  "inputSchemaRef": "tool.canvas.text.addText.input.v2026-04-02",
  "resultSchemaRef": "tool.canvas.text.addText.result.v2026-04-02",
  "sideEffectScope": "canvas_page",
  "supportsLiveCommit": true,
  "emitsMutation": true,
  "defaultTimeoutMs": 8000,
  "retryPolicy": {
    "maxAttempts": 2,
    "backoffMs": [0, 500],
    "retryOn": ["conflict", "unknown_apply_state"]
  }
}
```

입력 schema 필드는 아래를 최소 기준으로 고정한다.

| 필드 | 타입 | 필수 | 설명 / validation |
| --- | --- | --- | --- |
| `clientLayerKey` | string | 예 | run 내부 stable key. 같은 run 안에서 중복 불가 |
| `slotKey` | string | 예 | 예: `headline_primary`, `cta_label_primary` |
| `textRole` | enum | 예 | 위 role enum 중 하나 |
| `factuality` | enum | 예 | copy provenance |
| `content` | string | 예 | trim 후 non-empty, role별 char/line budget 충족 |
| `bounds` | `TextBounds` | 예 | 생성 위치와 box hint |
| `boxMode` | enum | 예 | `auto_size` 또는 `fixed_width` |
| `typography` | `TextTypography` | 예 | 기본 text style |
| `styleSpans` | array | 예 | 비어 있는 배열 허용. 각 항목은 `{ startUtf16, endUtf16, typography }` full-object patch를 사용하며 겹치면 안 된다 |
| `overflowPolicy` | object | 예 | `{ mode, minFontSizePx }`. `mode != shrink_to_fit` 인 경우 `minFontSizePx=null` |
| `lockAspectRatio` | boolean | 예 | text layer 자체는 기본 `false`, 명시 필수 |

추가 validation:

1. `targetRef.layerId` 는 반드시 `null` 이어야 한다.
2. `styleSpans` 는 `0 <= startUtf16 < endUtf16 <= content.length` 를 만족하고 start 기준 오름차순이어야 한다.
3. `boxMode=fixed_width` 이면 `bounds.width` 를 그대로 사용하고, `auto_size` 이면 adapter가 `resolvedBounds.width/height` 를 재계산할 수 있다.
4. `cta_label` 과 `badge` 는 줄바꿈을 포함하면 안 된다.
5. `factuality=placeholder` 이면 `textRole` 는 `placeholder`, `headline`, `supporting_copy`, `disclaimer` 중 하나여야 한다. `cta_label` 에 placeholder는 허용하지 않는다.

예상 result payload는 아래와 같다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `layerId` | string | gateway가 확정한 실제 text layer id |
| `clientLayerKey` | string | 입력값 echo |
| `slotKey` | string | 입력값 echo |
| `resolvedBounds` | `TextBounds` | 실제 적용 후 box |
| `textMetrics` | object | `{ charCount, lineCount, appliedFontSizePx }` |
| `overflowStatus` | enum | `none`, `wrapped`, `shrunk` 중 하나 |
| `contentHash` | string | 이후 `editText` optimistic guard용 stable hash |
| `appliedTypography` | `TextTypography` | 실제 적용된 default style |

##### 10.6.6.2 `canvas.text.editText`

이 tool은 기존 text layer를 삭제 후 재생성하지 않고 같은 `layerId` 를 유지하는 것이 계약이다.

입력 schema 필드는 아래를 최소 기준으로 고정한다.

| 필드 | 타입 | 필수 | 설명 / validation |
| --- | --- | --- | --- |
| `slotKey` | string | 예 | 기대한 semantic slot. runtime trace용 |
| `editMode` | enum | 예 | `replace_all` 또는 `replace_range` |
| `rangeStartUtf16` | integer | 예 | `replace_all` 인 경우 `0` 으로 정규화 |
| `rangeEndUtf16` | integer | 예 | `replace_all` 인 경우 기존 content length로 정규화 |
| `newContent` | string | 예 | trim 후 non-empty |
| `preserveUneditedStyles` | boolean | 예 | 편집 범위 밖 style span 유지 여부 |
| `fallbackTypography` | `TextTypography` | 예 | 새로 삽입된 글자에 적용할 기본 style |
| `layoutAdjustment` | enum | 예 | 편집 후 box 처리 정책 |
| `overflowPolicy` | object | 예 | addText와 동일 shape |
| `expectedRole` | enum | 예 | target layer의 semantic role 검증용 |

추가 validation:

1. `targetRef.layerId` 는 필수이며 실제 layer type이 `text` 여야 한다.
2. `rangeStartUtf16` 와 `rangeEndUtf16` 는 기존 content 기준으로 검증하며 `0 <= start <= end <= current_content.length` 를 만족해야 한다.
3. `editMode=replace_range` 인 경우 `start != end` 이어야 한다. insert-only는 v1에서 명시적으로 허용하지 않는다.
4. 편집 후 결과 문자열도 target layer의 semantic role, 즉 `expectedRole` 이 가리키는 role budget을 만족해야 한다.
5. `preserveUneditedStyles=true` 인 경우 편집 범위 밖 span은 유지하되, 새로 삽입된 구간의 style은 `fallbackTypography` 또는 인접 문자 style로만 채운다. adapter가 임의 style 추론을 하면 안 된다.
6. `layoutAdjustment=preserve_box` 이고 overflow가 발생하면 `overflowMode` 정책을 따른다. `reject` 면 non-retryable failure다.

예상 result payload는 아래와 같다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `layerId` | string | 입력 target과 동일해야 한다 |
| `slotKey` | string | 입력값 echo |
| `contentHash` | string | 편집 후 새 hash |
| `resolvedBounds` | `TextBounds` | 편집 후 실제 box |
| `textMetrics` | object | `{ charCount, lineCount, appliedFontSizePx }` |
| `overflowStatus` | enum | `none`, `wrapped`, `shrunk`, `rejected` |
| `styleRebase` | object | `{ preservedSpanCount, rebuiltSpanCount }` |

##### 10.6.6.3 `canvas.text.patchStyleRanges`

이 tool은 content는 유지하고 style span만 바꾼다. 헤드라인 일부만 강조하거나 CTA 안의 특정 단어만 색을 바꾸는 경우를 위한 최소 text-authoring primitive다.

입력 schema 필드는 아래를 최소 기준으로 고정한다.

| 필드 | 타입 | 필수 | 설명 / validation |
| --- | --- | --- | --- |
| `slotKey` | string | 예 | 기대 slot |
| `stylePatches` | array | 예 | 1개 이상 12개 이하 |
| `mergeMode` | enum | 예 | `replace_touched_ranges`, `merge_with_existing` |
| `normalizeAfterPatch` | boolean | 예 | 동일 style 인접 span 병합 여부 |
| `expectedRole` | enum | 예 | target layer semantic role 검증 |

`stylePatches[]` 의 각 항목은 아래 full-object shape를 사용한다.

| 필드 | 타입 | 필수 | 설명 / validation |
| --- | --- | --- | --- |
| `startUtf16` | integer | 예 | inclusive |
| `endUtf16` | integer | 예 | exclusive |
| `typography` | `TextTypography` | 예 | 해당 range에 덮어쓸 full style |

추가 validation:

1. `targetRef.layerId` 는 필수이며 실제 layer type이 `text` 여야 한다.
2. patch range는 모두 `0 <= start < end <= current_content.length` 를 만족해야 한다.
3. patch range끼리 겹치면 안 된다. 겹침은 non-retryable `validation` 오류다.
4. `stylePatches` 는 start 기준 오름차순이어야 한다.
5. 이 tool은 `contentHash` 를 바꾸지 않지만, typography 변경으로 bounds가 달라질 수 있으므로 overflow/line-wrap 재평가를 반드시 수행해야 한다.

예상 result payload는 아래와 같다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `layerId` | string | 수정 대상 text layer |
| `appliedPatchCount` | integer | 실제 적용된 patch 수 |
| `contentHash` | string | content 불변이므로 입력 layer의 hash와 동일 |
| `resolvedBounds` | `TextBounds` | style 적용 후 실제 box |
| `textMetrics` | object | `{ charCount, lineCount, appliedFontSizePx }` |
| `overflowStatus` | enum | `none`, `wrapped`, `shrunk`, `rejected` |
| `normalized_span_count` | integer | normalize 이후 최종 span 수 |

##### 10.6.6.4 Text Tool Design Notes

- `canvas.createLayer` 하나에 raw `layerType=text` 를 넣는 generic shape만으로도 실행은 가능하지만, text는 role budget, style span, overflow policy, future range edit 같은 별도 validation이 필요하므로 canonical registry에서는 text 전용 tool을 둔다.
- `canvas.text.editText` 와 `canvas.text.patchStyleRanges` 를 분리하면 `content` 변경과 `style` 변경의 retry/rollback 원인을 분리할 수 있다.
- v1 user-facing scope는 empty-canvas create지만, 위 schema는 future `update_layer` flow에서 그대로 재사용된다.

### 10.6.7 Asset / Image Adapter Contracts

Tooldi의 asset/image contract는 planner/runtime이 provider transport 차이를 직접 알지 않도록 설계해야 한다. 일부 provider는 async prediction/job handle을 먼저 돌려주고 polling/webhook으로 완료되며, 다른 provider는 inline binary 또는 JSON artifact(base64 등)를 즉시 반환한다. v1 runtime은 이 차이를 canonical asset request/result contract로 흡수해야 한다.

#### 10.6.7.1 Boundary / ownership

| layer | owner | 책임 | 직접 노출되면 안 되는 것 |
| --- | --- | --- | --- |
| `ExecutionPlan.actions[]` | Planner + Validator | slot별 asset intent, constraint, fallback 정책 정의 | provider endpoint, SDK method, raw request body |
| `Asset Tool Executor` | Worker Runtime | tool registry 해석, adapter 선택, deadline/retry/cancel 제어, storage persist orchestration | editor 내부 command 구조, provider auth header |
| `ImageProviderAdapter` | provider-specific implementation | canonical request를 provider 요청으로 변환하고 결과/job state를 정규화 | Tooldi layer id, template save receipt |
| `AssetStorageAdapter` | Tooldi storage boundary | provider output을 stable asset ref로 영속화, metadata/checksum 기록 | provider polling semantics, planner prompt tree |
| `Canvas Mutation Tool` | editor gateway | stable `assetId` 와 render hint를 layer mutation으로 반영 | provider raw output URL/base64, provider job id |

추가 규칙:

1. persisted plan에는 canonical `toolName` + `toolVersion` 과 `providerPreferences.providerHint` 같은 advisory field만 저장한다. provider-specific raw payload는 저장하지 않는다.
2. queue payload에는 raw image bytes, base64 body, provider signed URL을 직접 넣지 않는다. worker는 reference hydrate 후 provider/storage adapter를 호출한다.
3. provider output은 반드시 `StoredAssetDescriptor` 로 영속화된 뒤에만 `canvas.createLayer` 또는 `canvas.updateLayer` 의 입력으로 연결할 수 있다.
4. `asset.searchImage`, `asset.generateImage`, `asset.selectImageCandidate` 는 v1 enabled tool이고, `asset.editImage` 는 future v2 reserved tool이다. `asset.generateImage` 와 `asset.editImage` 는 같은 canonical schema family를 공유하되 `requestKind` 와 `sourceImages[]` validation만 다르다.
5. actual provider/model/version, provider request id, storage checksum은 observability metadata에는 남기되 planner-facing schema에는 새지 않는다.

#### 10.6.7.2 Required runtime interfaces

아래 인터페이스는 구현 언어와 무관하게 반드시 분리된 책임으로 존재해야 한다.

```ts
type AssetRequestKind = 'search' | 'generate' | 'edit';
type ProviderJobMode = 'sync_inline' | 'async_poll' | 'async_webhook';

interface AssetToolExecutor {
  execute(request: CanonicalAssetToolRequest | CanonicalAssetSearchRequest): Promise<CanonicalAssetToolResult>;
}

interface ImageSearchProviderAdapter {
  getCapabilities(): ImageSearchProviderCapabilities;
  search(request: CanonicalAssetSearchRequest): Promise<SearchProviderResult>;
}

interface ImageProviderAdapter {
  getCapabilities(): ImageProviderCapabilities;
  submit(request: CanonicalAssetProviderRequest): Promise<ProviderDispatchResult>;
  poll(job: ProviderJobRef): Promise<ProviderJobSnapshot>;
  cancel(job: ProviderJobRef, reason: string): Promise<ProviderCancelAck>;
}

interface AssetStorageAdapter {
  resolveSourceAssets(sourceRefs: CanonicalSourceImage[]): Promise<ResolvedSourceAsset[]>;
  persistCandidate(input: PersistAssetCandidateInput): Promise<StoredAssetDescriptor>;
  persistImportedCandidate(input: PersistImportedCandidateInput): Promise<StoredAssetDescriptor>;
  getAsset(assetId: string): Promise<StoredAssetDescriptor | null>;
}
```

최소 capability 필드는 아래를 포함해야 한다.

| 필드 | 설명 |
| --- | --- |
| `provider_key` | `stability`, `replicate`, `openai`, `internal_graphic`, `...` |
| `supports_search` | provider가 `asset.searchImage` 를 지원하는지 |
| `supported_request_kinds` | `generate`, `edit` 지원 여부 |
| `jobMode` | `sync_inline`, `async_poll`, `async_webhook` |
| `accepted_source_roles` | `reference`, `base_image`, `mask`, `style_guide` 등 |
| `output_transport` | `binary_body`, `base64_json`, `remote_url` |
| `max_candidates` | provider가 한 번에 돌려줄 수 있는 최대 candidate 수 |
| `returns_license_metadata` | search result에 license/editorial/commercial 정보를 주는지 |
| `supports_transparency` | alpha output 허용 여부 |

#### 10.6.7.3 Canonical tool registry entries

| toolName | operation | kind | v1 enabled | 설명 |
| --- | --- | --- | --- | --- |
| `asset.searchImage` | `generateImageAsset` | `asset_prep` | 예 | stock/search provider에서 후보 이미지 조회 및 ranking metadata 정규화 |
| `asset.generateImage` | `generateImageAsset` | `asset_prep` | 예 | empty-canvas draft의 hero/decorative image, pattern, background bitmap 생성 |
| `asset.selectImageCandidate` | `generateImageAsset` | `asset_prep` | 예 | 검색 결과 candidate 1개를 internal asset reference로 확정 |
| `canvas.image.addImage` | `createLayer` | `canvas_mutation` | 예 | `CanvasReadyImageAsset` 을 새 image layer로 삽입 |
| `canvas.image.replaceImageAsset` | `updateLayer` | `canvas_mutation` | 예 | 기존 image layer의 source asset 교체 |
| `asset.editImage` | `editImageAsset` | `asset_prep` | 아니오 | future existing-layer edit/outpaint/masked edit 확장용 reserved contract |

`asset.generateImage` registry metadata 예시는 아래를 따른다.

```json
{
  "toolName": "asset.generateImage",
  "toolVersion": "2026-04-02",
  "aliases": ["generateImageAsset"],
  "operation": "generateImageAsset",
  "kind": "asset_prep",
  "inputSchemaRef": "tool.asset.generateImage.input.v2026-04-02",
  "resultSchemaRef": "tool.asset.generateImage.result.v2026-04-02",
  "sideEffectScope": "asset_storage",
  "supportsLiveCommit": false,
  "emitsMutation": false,
  "defaultTimeoutMs": 45000,
  "retryPolicy": {
    "maxAttempts": 2,
    "backoffMs": [0, 1500],
    "retryOn": ["transient_provider", "timeout", "rate_limited", "unknown_apply_state"]
  }
}
```

#### 10.6.7.4 `CanonicalAssetToolRequest.arguments`

공통 canonical payload는 `asset.generateImage`, future `asset.editImage` 가 함께 재사용한다.

| 필드 | 타입 | 필수 | 설명 / validation |
| --- | --- | --- | --- |
| `requestKind` | enum | 예 | `generate`, `edit`. v1 enabled path는 `generate`만 허용 |
| `slotKey` | string | 예 | `hero_image`, `background_texture`, `decor_01` 같은 plan slot |
| `assetRole` | enum | 예 | `hero_image`, `background_bitmap`, `pattern`, `sticker`, `mask_source` |
| `prompt` | string | 예 | trim 후 비어 있으면 안 된다 |
| `negativePrompt` | string/null | 아니오 | provider별 field 명칭과 무관하게 canonical negative intent |
| `sourceImages` | array | 예 | `generate` 는 빈 배열 허용, `edit` 는 1개 이상 필수 |
| `outputConstraints` | object | 예 | 결과 크기/포맷/후보 수 제약 |
| `styleHints` | object | 예 | palette, composition, factuality 등 planner 유도값 |
| `providerPreferences` | object | 예 | `providerHint`, `fallbackOrder`, `allowFallback`, `maxCandidates` |
| `persistence` | object | 예 | 저장 범위, dedupe key, intermediate 보존 여부 |
| `safetyPolicy` | object | 예 | 사람/로고/텍스트 렌더링 허용 정책 |

`sourceImages[]` 항목은 아래 필드를 최소 포함해야 한다.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `assetId` | string | 예 | 기존 Tooldi asset reference |
| `role` | enum | 예 | `reference`, `base_image`, `mask`, `style_guide` |
| `required` | boolean | 예 | 없으면 action 자체가 실패해야 하는지 |
| `crop` | object/null | 아니오 | `{ x, y, width, height }` normalized crop |
| `maskAssetId` | string/null | 아니오 | masked edit에서 별도 마스크 자산 |

`outputConstraints` 는 아래 구조를 사용한다.

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `width` | integer | 예 | px |
| `height` | integer | 예 | px |
| `preferredMimeType` | enum | 예 | `image/png`, `image/webp`, `image/jpeg` |
| `backgroundMode` | enum | 예 | `opaque`, `transparent_preferred`, `transparent_required` |
| `candidateCount` | integer | 예 | v1은 `1`만 허용 |
| `maxOutputBytes` | integer | 예 | 저장/다운로드 안전 한도 |

`styleHints` 와 `providerPreferences` 는 아래 필드를 최소 기준으로 둔다.

| object | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| `styleHints` | `visualStyle` | string | 예: `bright_promotional_graphic` |
| `styleHints` | `paletteHex` | string[] | planner가 정한 대표 palette |
| `styleHints` | `avoidTextRendering` | boolean | 이미지 안에 읽을 수 있는 텍스트 삽입 방지 |
| `styleHints` | `factuality` | enum | `user_provided`, `generic_generated`, `placeholder`, `omitted` |
| `providerPreferences` | `providerHint` | string/null | advisory only |
| `providerPreferences` | `fallbackOrder` | string[] | 시도 순서 |
| `providerPreferences` | `allowFallback` | boolean | 동일 slot fallback 허용 여부 |
| `providerPreferences` | `modePreference` | enum | `prefer_sync`, `prefer_async`, `no_preference` |

예시 payload는 아래와 같다.

```json
{
  "requestKind": "generate",
  "slotKey": "hero_image",
  "assetRole": "hero_image",
  "prompt": "soft spring sale hero visual, pastel flowers, no product brand, editable banner-safe composition",
  "negativePrompt": "readable text, watermark, logo, photoreal face",
  "sourceImages": [],
  "outputConstraints": {
    "width": 1200,
    "height": 628,
    "preferredMimeType": "image/png",
    "backgroundMode": "transparent_preferred",
    "candidateCount": 1,
    "maxOutputBytes": 8000000
  },
  "styleHints": {
    "visualStyle": "bright_promotional_graphic",
    "paletteHex": ["#FFF0C8", "#FFB8D2", "#8DD5C0"],
    "avoidTextRendering": true,
    "factuality": "generic_generated"
  },
  "providerPreferences": {
    "providerHint": "stability",
    "fallbackOrder": ["replicate", "internal_graphic"],
    "allowFallback": true,
    "modePreference": "no_preference"
  },
  "persistence": {
    "storeScope": "agent_run",
    "dedupeKey": "run_20260402_0001:hero_image",
    "retainIntermediateOutputs": false
  },
  "safetyPolicy": {
    "allowPeople": false,
    "allowBrandLogo": false,
    "allowReadableText": false
  }
}
```

#### 10.6.7.5 Canvas-ready bridge object

검색과 생성 결과를 실제 canvas mutation으로 이어붙이려면, provider별 결과 shape를 그대로 들고 가지 않고 하나의 stable bridge object로 정규화해야 한다. v1은 이 bridge object를 `CanvasReadyImageAsset` 으로 고정한다.

`CanvasReadyImageAsset` 은 최소 아래 구조를 따라야 한다.

| object | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| `CanvasReadyImageAsset` | `imageSource` | object | 실제 canvas insertion/update가 소비하는 source binding |
| `CanvasReadyImageAsset` | `placementHints` | object | crop, fit, focal point, opacity 같은 advisory/default 배치 힌트 |
| `CanvasReadyImageAsset` | `audit` | object | provider/license/selection trace |
| `imageSource` | `assetId` | string | Tooldi stable asset id |
| `imageSource` | `storageKey` | string/null | internal storage pointer |
| `imageSource` | `sourceImageUrl` | string | FE 또는 editor gateway가 실제 로드할 URL |
| `imageSource` | `originImageUrl` | string/null | 원본 source URL 또는 provider origin |
| `imageSource` | `thumbnailUrl` | string/null | preview/thumbnail |
| `imageSource` | `providerAssetRef` | string/null | provider 원본 asset id 또는 job output ref |
| `imageSource` | `mimeType` | string | `image/png`, `image/jpeg`, `image/webp` 등 |
| `imageSource` | `widthPx` | integer | 원본 width |
| `imageSource` | `heightPx` | integer | 원본 height |
| `imageSource` | `sourceKind` | enum | `generated`, `stock_search`, `uploaded`, `fallback_graphic`, `placeholder` |
| `imageSource` | `factuality` | enum | `user_provided`, `generic_generated`, `placeholder`, `omitted` |
| `placementHints` | `fitMode` | enum | `cover`, `contain`, `fill`, `none` |
| `placementHints` | `cropMode` | enum | `smart_crop`, `center_crop`, `manual_crop`, `none` |
| `placementHints` | `cropRect` | object/null | `{ x, y, width, height }` normalized crop |
| `placementHints` | `focalPointX` | number | `0..1` |
| `placementHints` | `focalPointY` | number | `0..1` |
| `placementHints` | `opacity` | number | `0..1` |
| `placementHints` | `rotationDeg` | number | degree |
| `placementHints` | `backgroundRemovalApplied` | boolean | alpha/배경 제거 적용 여부 |
| `audit` | `provider` | string | 실제 provider |
| `audit` | `licenseScope` | enum | `commercial_reuse`, `editorial_only`, `internal_test` |
| `audit` | `selectionReason` | enum/null | search result 선택 사유 |
| `audit` | `promptHash` | string/null | generated/edit asset일 때 사용 |
| `audit` | `sourceCandidateId` | string/null | search result origin back-reference |

bridge 규칙:

1. `asset.searchImage` result는 candidate metadata만 줄 수 있지만, `asset.selectImageCandidate` 와 `asset.generateImage` result는 반드시 `CanvasReadyImageAsset` 을 포함해야 한다.
2. `canvas.image.addImage` 와 `canvas.image.replaceImageAsset` 는 provider raw output이 아니라 `CanvasReadyImageAsset` 만 입력으로 받아야 한다.
3. `imageSource.sourceImageUrl` 과 `imageSource.storageKey` 는 현재 FE `assetRefs.sourceImageUrl` / `assetRefs.uploadedFileKey` 또는 동등 필드로 바로 매핑 가능해야 한다.
4. tool adapter가 만드는 최종 image object는 `src`, `originSrc`, `width`, `height`, `imageWidth`, `imageHeight`, `cropX`, `cropY`, `imageScaleX`, `imageScaleY` 를 현재 `toolditor` image object model과 일치시키는 것이 원칙이다.

#### 10.6.7.6 Tool-specific schemas for search / select / insert

##### 10.6.7.6.1 `asset.searchImage`

이 tool은 canvas mutation을 일으키지 않고, 후보 탐색과 ranking metadata 정규화만 수행한다.

입력 schema 필드는 아래를 최소 기준으로 고정한다.

| 필드 | 타입 | 필수 | 설명 / validation |
| --- | --- | --- | --- |
| `slotKey` | string | 예 | `hero_image`, `background_visual`, `decor_01` 등 |
| `assetRole` | enum | 예 | `hero_image`, `background_bitmap`, `pattern`, `sticker` |
| `query` | string | 예 | trim 후 non-empty |
| `styleKind` | enum | 예 | `photo`, `illustration`, `graphic`, `pattern`, `cutout` |
| `requestedWidthPx` | integer | 예 | `64 <= value <= 4096` |
| `requestedHeightPx` | integer | 예 | `64 <= value <= 4096` |
| `candidateLimit` | integer | 예 | `1 <= value <= 8` |
| `licenseScope` | enum | 예 | 기본 `commercial_reuse` |
| `allowEditorial` | boolean | 예 | 기본 `false` |
| `avoidEmbeddedText` | boolean | 예 | 배너 asset 기본값은 `true` |
| `preferredPaletteHex` | string[] | 예 | 비어 있는 배열 허용. 최대 8개 |
| `factuality` | enum | 예 | 기본 `generic_generated` |

예상 result payload는 아래와 같다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `candidateSetId` | string | 후속 selection 입력에 쓰는 stable id |
| `slotKey` | string | 입력값 echo |
| `normalizedQuery` | string | 실제 provider query |
| `provider` | string | search provider 식별자 |
| `candidateCount` | integer | 반환 후보 수 |
| `candidates` | array | 각 항목은 아래 `ImageSearchCandidate` shape |

`ImageSearchCandidate` 는 최소 아래 필드를 포함해야 한다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `candidateId` | string | candidate set 내부 stable id |
| `providerAssetRef` | string | provider 원본 식별자 |
| `preview_url` | string | 미리보기 URL |
| `thumbnailUrl` | string/null | 썸네일 URL |
| `widthPx` | integer | 원본 width |
| `heightPx` | integer | 원본 height |
| `mimeType` | string | 예: `image/jpeg` |
| `licenseScope` | enum | 상업 사용 가능 여부 포함 |
| `sourceKind` | enum | 항상 `stock_search` |
| `score` | number | `0..1` ranking score |
| `placementHints` | object | `CanvasReadyImageAsset.placementHints` 와 동일 shape |
| `canvasReadyAsset` | `CanvasReadyImageAsset` or null | provider/cache가 이미 internal asset으로 정규화했으면 채움 |

##### 10.6.7.6.2 `asset.generateImage`

`asset.generateImage` 는 10.6.7.4 canonical request를 사용하며, 성공 시 최소 1개의 `CanvasReadyImageAsset` 을 반환해야 한다.

generate-specific 추가 규칙:

1. v1은 `outputConstraints.candidateCount=1` 만 허용한다.
2. 생성 결과는 provider URL만 들고 끝나면 안 되고, 반드시 `assetId` 와 `storageKey` 또는 동등 internal persistence ref를 가져야 한다.
3. `styleHints.avoidTextRendering=true` 인 경우 readable text가 포함된 결과는 warning 또는 fallback 대상이어야 한다.

tool-specific result 필드는 아래를 추가로 가져야 한다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `selectedAsset` | `CanvasReadyImageAsset` | v1에서 실제 채택된 결과 |
| `candidateAssets` | `CanvasReadyImageAsset[]` | v1은 1개지만 확장 대비 배열 유지 가능 |
| `finishReason` | enum | `success`, `fallback_applied`, `content_filtered`, `partial` |

##### 10.6.7.6.3 `asset.selectImageCandidate`

이 tool은 search result candidate 1개를 internal asset으로 import 또는 confirm한 뒤, insertion-ready bridge object를 반환한다.

입력 schema 필드는 아래를 최소 기준으로 고정한다.

| 필드 | 타입 | 필수 | 설명 / validation |
| --- | --- | --- | --- |
| `slotKey` | string | 예 | 기대 slot |
| `candidateSetId` | string | 예 | `asset.searchImage` result에서 받은 값 |
| `candidateId` | string | 예 | 확정할 후보 |
| `selectionReason` | enum | 예 | `best_score`, `layout_fit`, `brand_fit`, `fallback_after_generation_failure`, `manual_rule` |
| `expectedMinWidthPx` | integer | 예 | `64 <= value <= 4096` |
| `expectedMinHeightPx` | integer | 예 | `64 <= value <= 4096` |
| `requireCommercialLicense` | boolean | 예 | 기본 `true` |
| `normalizeToAssetStore` | boolean | 예 | v1은 항상 `true` |

예상 result payload는 아래와 같다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `candidateSetId` | string | 입력값 echo |
| `candidateId` | string | 입력값 echo |
| `slotKey` | string | 입력값 echo |
| `selectedAsset` | `CanvasReadyImageAsset` | 이후 insertion/update가 그대로 소비하는 canonical bridge object |
| `importReceiptId` | string | internal asset import/confirm receipt |

##### 10.6.7.6.4 `canvas.image.addImage`

이 tool은 `CanvasReadyImageAsset` 을 실제 편집기 image layer로 만든다. 내부적으로는 generic `addLayer` mutation 또는 기존 `addObject({ type: 'image' | 'aiImage' })` 경로를 재사용할 수 있지만, planner/executor 계약은 image-specific schema로 고정한다.

입력 schema 필드는 아래를 최소 기준으로 고정한다.

| 필드 | 타입 | 필수 | 설명 / validation |
| --- | --- | --- | --- |
| `clientLayerKey` | string | 예 | run 내부 stable key |
| `slotKey` | string | 예 | semantic slot |
| `assetRole` | enum | 예 | `hero_image`, `background_bitmap`, `pattern`, `sticker` |
| `imageAsset` | `CanvasReadyImageAsset` | 예 | asset acquisition 단계 결과 |
| `bounds` | object | 예 | `{ x, y, width, height }`, `width > 0`, `height > 0` |
| `placement` | object | 예 | `CanvasReadyImageAsset.placementHints` 와 동일 shape |
| `lockAspectRatio` | boolean | 예 | 기본 `true` |
| `isPlaceholder` | boolean | 예 | fallback asset 여부 |

예상 result payload는 아래와 같다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `layerId` | string | gateway가 확정한 실제 image layer id |
| `clientLayerKey` | string | 입력값 echo |
| `slotKey` | string | 입력값 echo |
| `appliedAssetId` | string | 실제 연결된 asset id |
| `resolvedBounds` | object | `{ x, y, width, height }` |
| `resolvedCrop` | object/null | normalized crop |
| `renderMetrics` | object | `{ renderedWidthPx, renderedHeightPx, imageScaleX, imageScaleY }` |
| `contentHash` | string | future replace/update optimistic guard용 stable hash |

##### 10.6.7.6.5 `canvas.image.replaceImageAsset`

이 tool은 같은 image layer를 유지한 채 source asset만 바꾸고 crop/fit을 다시 계산한다. future existing-canvas edit flow와 v1 internal placeholder replacement 둘 다 같은 contract를 재사용한다.

입력 schema 필드는 아래를 최소 기준으로 고정한다.

| 필드 | 타입 | 필수 | 설명 / validation |
| --- | --- | --- | --- |
| `slotKey` | string | 예 | 기대 slot |
| `expectedAssetRole` | enum | 예 | semantic role 검증 |
| `newImageAsset` | `CanvasReadyImageAsset` | 예 | 새 source asset |
| `placement` | object | 예 | crop/fit 재계산 힌트 |
| `preserveLayerTransform` | boolean | 예 | 기본 `true` |

예상 result payload는 아래와 같다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `layerId` | string | 입력 target과 동일해야 한다 |
| `slotKey` | string | 입력값 echo |
| `appliedAssetId` | string | 새로 연결된 asset id |
| `resolvedBounds` | object | 적용 후 box |
| `resolvedCrop` | object/null | 적용 후 crop |
| `renderMetrics` | object | `{ renderedWidthPx, renderedHeightPx, imageScaleX, imageScaleY }` |
| `contentHash` | string | source asset 교체 후 새 hash |

##### 10.6.7.6.6 Design notes

- v1 user-facing scope는 empty-canvas create지만, search/generate/select/add/replace를 같이 정의해야 future update/delete flow로 schema migration 없이 확장할 수 있다.
- `CanvasReadyImageAsset` 은 search provider, internal T2I primitive, future uploaded asset picker를 하나의 downstream schema로 수렴시키는 핵심 계약이다.
- 현재 FE의 `addObject({ type: 'aiImage', serial, imageSrc })`, `/AI/loadAiPicture`, `/AI/loadInputcanvasAiImage` 경로는 adapter 내부 구현으로 재사용 가능하지만, planner/validated plan에는 노출하지 않는다.

#### 10.6.7.7 Generate/edit asset tool result payload

성공한 asset tool의 `ToolInvocationResult.output` 은 최소 아래 구조를 따라야 한다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `assetJobId` | string | Tooldi 내부 asset job 식별자 |
| `slotKey` | string | 입력 slot과 동일 |
| `providerRef` | object | 실제 사용 provider/model/job 식별 |
| `storedAssets` | `StoredAssetDescriptor[]` | 영속화까지 완료된 결과 candidate |
| `selectedAssetId` | string | v1에서 실제 채택한 asset |
| `selectedAsset` | `CanvasReadyImageAsset` | canvas mutation tool이 그대로 소비할 canonical bridge object |
| `renderHints` | object | `fitMode`, `focalPoint`, `opacity`, `replacePlaceholderLayerIds` |
| `finishReason` | enum | `success`, `fallback_applied`, `content_filtered`, `partial` |

`providerRef` 와 `StoredAssetDescriptor` 는 아래 필드를 최소 포함해야 한다.

| object | 필드 | 타입 | 설명 |
| --- | --- | --- | --- |
| `providerRef` | `provider` | string | 실제 실행 provider |
| `providerRef` | `modelRef` | string/null | 실제 model/version reference |
| `providerRef` | `externalJobId` | string/null | provider job/prediction id |
| `providerRef` | `jobMode` | enum | `sync_inline`, `async_poll`, `async_webhook` |
| `providerRef` | `finalStatus` | enum | `succeeded`, `failed`, `cancelled` |
| `StoredAssetDescriptor` | `assetId` | string | Tooldi stable asset id |
| `StoredAssetDescriptor` | `storageKey` | string | storage object key |
| `StoredAssetDescriptor` | `mimeType` | string | 최종 저장 포맷 |
| `StoredAssetDescriptor` | `width` | integer | px |
| `StoredAssetDescriptor` | `height` | integer | px |
| `StoredAssetDescriptor` | `source` | enum | `generated`, `edited`, `uploaded`, `fallback_graphic` |
| `StoredAssetDescriptor` | `checksum_sha256` | string | dedupe / unknown state reconciliation용 |

예상 result payload는 아래와 같다.

```json
{
  "assetJobId": "aj_20260402_0015",
  "slotKey": "hero_image",
  "providerRef": {
    "provider": "stability",
    "modelRef": "stable-image-ultra",
    "externalJobId": null,
    "jobMode": "sync_inline",
    "finalStatus": "succeeded"
  },
  "storedAssets": [
    {
      "assetId": "asset_9012",
      "storageKey": "agent/runs/run_20260402_0001/hero_image/output.png",
      "mimeType": "image/png",
      "width": 1200,
      "height": 628,
      "source": "generated",
      "checksumSha256": "sha256:7b8f..."
    }
  ],
  "selectedAssetId": "asset_9012",
  "selectedAsset": {
    "imageSource": {
      "assetId": "asset_9012",
      "storageKey": "agent/runs/run_20260402_0001/hero_image/output.png",
      "sourceImageUrl": "https://cdn.tooldi.example/agent/runs/run_20260402_0001/hero_image/output.png",
      "originImageUrl": null,
      "thumbnailUrl": null,
      "providerAssetRef": null,
      "mimeType": "image/png",
      "widthPx": 1200,
      "heightPx": 628,
      "sourceKind": "generated",
      "factuality": "generic_generated"
    },
    "placementHints": {
      "fitMode": "cover",
      "cropMode": "smart_crop",
      "cropRect": null,
      "focalPointX": 0.5,
      "focalPointY": 0.45,
      "opacity": 1,
      "rotationDeg": 0,
      "backgroundRemovalApplied": false
    },
    "audit": {
      "provider": "stability",
      "licenseScope": "commercial_reuse",
      "selectionReason": null,
      "promptHash": "sha256:prompt_1234",
      "sourceCandidateId": null
    }
  },
  "renderHints": {
    "fitMode": "cover",
    "focalPoint": { "x": 0.5, "y": 0.45 },
    "opacity": 1,
    "replacePlaceholderLayerIds": ["layer_tmp_hero_01"]
  },
  "finishReason": "success"
}
```

#### 10.6.7.8 Normalized error semantics

asset/image adapter는 generic runtime error class를 그대로 재사용하되, 아래처럼 provider/storage 전용 `errorCode` 를 추가 정규화한다.

| errorCode | errorClass | retryable | executor rule |
| --- | --- | --- | --- |
| `source_asset_missing` | `validation` | 아니오 | `sourceImages[].assetId` 를 resolve하지 못했다. 즉시 실패한다. |
| `source_asset_unsupported` | `validation` | 아니오 | MIME, size, alpha, mask role 등 입력이 provider capability와 맞지 않는다. |
| `provider_request_invalid` | `validation` | 아니오 | provider mapping 후 필수 필드 누락, 범위 초과, unsupported enum. blind retry 금지. |
| `provider_content_filtered` | `policy` | 아니오 | provider safety filter 또는 Tooldi safety policy에 의해 차단됐다. optional slot이면 fallback graphic으로 전환 가능하다. |
| `provider_not_allowed` | `policy` | 아니오 | allowed provider set 밖의 adapter를 사용하려 한 경우. 즉시 차단한다. |
| `provider_unavailable` | `transient_provider` | 예 | provider 5xx, connection reset, temporary DNS/network failure. bounded retry 가능. |
| `provider_rate_limited` | `rate_limited` | 예 | provider throttling 또는 internal adapter quota. `retry_after_ms` 를 따르되 run deadline을 넘기면 안 된다. |
| `provider_job_timeout` | `timeout` | 조건부 | polling deadline 안에 완료되지 않았다. output 존재 여부를 먼저 reconciliation 한다. |
| `provider_job_state_unknown` | `unknown_apply_state` | 직접 재실행 금지 | 제출은 됐지만 최종 완료/실패를 확정할 수 없다. `externalJobId` 기준 조회가 먼저다. |
| `asset_storage_unavailable` | `transient_provider` | 예 | persist 전 storage write 실패. 아직 `assetId` 가 발급되지 않았으면 retry 가능하다. |
| `asset_persist_outcome_unknown` | `unknown_apply_state` | 직접 재실행 금지 | storage write 또는 DB insert 성공 여부가 불명확하다. checksum + dedupe key로 reconciliation 후 replay 판단한다. |

실패 시 `ToolInvocationResult.error` 는 최소 아래 필드를 포함해야 한다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `errorClass` | enum | 10.6.4의 canonical class |
| `errorCode` | string | 위 표의 normalized code |
| `message` | string | 내부/운영자용 요약 |
| `provider` | string/null | 실제 시도 provider |
| `providerRequestId` | string/null | external job/prediction/request id |
| `httpStatus` | integer/null | provider/storage 응답 코드 |
| `retryAfterMs` | integer/null | rate limit 대응용 |
| `reconciliationKey` | string/null | dedupe key 또는 checksum key |

추가 규칙:

1. provider가 inline binary를 반환한 뒤 storage persist에서 실패하면 즉시 blind regenerate를 하지 않는다. 먼저 `dedupeKey` + `checksumSha256` 기준 existing asset 여부를 확인한다.
2. async provider는 `externalJobId` 를 받은 순간부터 cancel/retry 판단의 기준이 `toolCallId` 하나가 아니라 `toolCallId + externalJobId` 조합이 된다.
3. `asset.generateImage` 가 실패해도 draft minimum이 이미 충족된 상태라면 whole run fail 대신 slot-level fallback 또는 placeholder 유지 후 `completed_with_warning` 로 종료할 수 있다.

### 10.7 이벤트 / 메시지 큐

| 채널 | Producer | Consumer | 페이로드 핵심 |
| --- | --- | --- | --- |
| `agent.run.requested` | Agent API | Worker Runtime | `runId`, `traceId`, `queueJobId`, `requestSnapshotRef`, `attemptSeq`, `hardDeadlineAt`, `milestoneDeadlinesMs`, `pageLockToken`, `cancelToken` |

추가 규칙은 아래와 같다.

- v1은 `한 개의 interactive run queue + 한 개의 worker pool` 로 시작한다.
- retry는 별도 multi-queue fan-out이 아니라 같은 channel에 delayed re-enqueue하는 방식으로 처리한다.
- `runId` 는 retry 동안 유지되고 `attemptSeq` 만 증가한다.
- `queueJobId` 는 attempt마다 새로 발급되며 BullMQ custom `jobId` 와 동일한 값을 사용해야 한다. `:` 를 포함한 포맷은 금지한다.
- queue payload에는 대용량 canvas JSON이나 provider별 실행 중간값을 직접 싣지 않는다. worker는 reference hydrate를 기본으로 한다.

#### 10.7.1 worker attempt lifecycle

| attempt 상태 | queue 상태 예시 | owner | 의미 |
| --- | --- | --- | --- |
| `enqueued` | `waiting` | Agent API + Queue Broker | durable enqueue 완료, worker pickup 대기 |
| `dequeued` | `active` | Worker Runtime | worker lease 획득, 첫 heartbeat 전 grace 구간 |
| `hydrating` | `active` | Worker Runtime | request/snapshot/context 복원 중 |
| `running` | `active` | Worker Runtime | intent extraction, plan generation, action execution 수행 중 |
| `awaiting_ack` | `active` | Agent API + Worker Runtime | 마지막 live mutation의 FE apply ack 대기 |
| `retry_waiting` | `delayed` 또는 `waiting` | Agent API | 같은 `runId` 의 다음 attempt 예약 완료 |
| `finalizing` | `active` | Worker Runtime | save 확인, layer diff 요약, finalize 제출 중 |
| `succeeded` | `completed` | Agent API | 해당 attempt 성공 종료 |
| `failed` | `failed` | Agent API | 해당 attempt 실패 종료 |
| `cancel_requested` | transport state 위 fence | Agent API | 새 action 시작 금지, cooperative stop 진행 중 |
| `cancelled` | terminal | Agent API | run 전체가 취소 확정됨 |

`stalled` 는 별도 durable state가 아니라 queue lease 상실 event로 취급한다. 따라서 worker crash/stall 대응은 queue broker가 아니라 Agent API orchestration rule이 소유해야 한다.

#### 10.7.2 retry / cancellation ownership

- retry budget과 새 attempt enqueue 권한은 Agent API가 가진다.
- Worker Runtime은 실패를 `retryable=true|false` 로 분류하고 `resumeFromSeq` 같은 recovery 힌트만 제공한다.
- v1 queue attempt는 기본 `최대 2회` 로 제한한다. initial attempt 1회 + delayed retry 1회다.
- cancel canonical owner도 Agent API다. cancel 수락 시 `cancel_requested` 를 기록하고 새 action/mutation 시작을 fence 한다.
- active worker stop은 queue broker만으로 보장하지 않는다. Worker Runtime이 cancel token을 보고 cooperative stop 해야 한다.

#### 10.7.3 failure handoff rules

| failure point | detector | handoff rule |
| --- | --- | --- |
| queue publish 실패 | Agent API | worker handoff 없이 `enqueue_timeout` 또는 `queue_publish_failed` 로 종료 |
| enqueue 후 pickup 없음 | Agent API watchdog | 예산이 남으면 같은 `runId` 로 1회 재enqueue, 아니면 `worker_pickup_timeout` 으로 종료 |
| hydrate 실패 | Worker Runtime | non-retryable failure로 보고, Agent API가 terminal fail 판정 |
| worker crash/stall before first visible ack | Queue Broker event + Agent API watchdog | user-visible side effect가 없으므로 full retry 허용 |
| worker crash/stall after visible ack | Queue Broker event + Agent API watchdog | blind restart 금지, `last ack 기준 resume` 또는 현재 rollback group cleanup 후 partial/fail handoff |
| FE mutation reject | Agent API | worker가 같은 attempt 안에서 fallback 또는 cleanup 수행, 실패 시 partial/fail 종료 |
| final save ack 후 finalize 유실 | Agent API watchdog | ledger와 save receipt로 outcome 복원 가능하면 complete/partial, 아니면 fail |

## 11. 데이터 요구사항

### 11.1 핵심 엔티티

| 엔티티 | 용도 |
| --- | --- |
| `agent_runs` | request acceptance, 상태, trace correlation, 현재 plan version 저장 |
| `agent_run_attempts` | queue/worker attempt lifecycle, heartbeat, retry/cancel ownership 저장 |
| `agent_run_requests` | raw prompt, normalized prompt, redacted preview, prompt provenance 저장 |
| `agent_drafts` | banner draft lifecycle, editable layer set, save milestone 저장 |
| `agent_plans` | intent, constraint pack, execution plan payload, validation 결과 저장 |
| `agent_tool_calls` | tool attempt 단위 request/result, prompt log ref, retry/error, 비용, emitted mutation refs 저장 |
| `agent_mutation_ledger` | mutation/save/compensation의 dispatch/ack 상태와 tool call back-reference 저장 |
| `agent_action_logs` | action 단위 실행/실패/rollback 결과 저장 |
| `agent_final_summaries` | terminal status, authoritative final canvas state ref, canonical diff ref, warning/fallback summary 저장 |

record별 durable writer/read owner, retrieval path, audit immutability 규칙은 [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/tooldi-agent-workflow-v1/tooldi-agent-workflow-v1-backend-boundary.md) 의 `8. 상태, 로깅, 저장소 경계` 를 기준으로 삼는다.

### 11.2 최소 필드

| 엔티티 | 필드 | 타입 | 의미 |
| --- | --- | --- | --- |
| `agent_runs` | `run_id` | string | run 고유 ID |
| `agent_runs` | `trace_id` | uuid/string | FE/BE/worker correlation ID |
| `agent_runs` | `request_id` | string | accepted northbound request row 식별자 |
| `agent_runs` | `snapshot_id` | string | acceptance snapshot 식별자 |
| `agent_runs` | `page_lock_token` | string | 같은 page의 동시 active run을 막는 canonical lock token |
| `agent_runs` | `canonical_artifact_kind` | enum/string | v1 canonical output artifact. 고정값은 `LiveDraftArtifactBundle` |
| `agent_runs` | `canonical_completion_moment` | enum/string | v1 canonical completion moment. 고정값은 `RunCompletionRecord.draftGeneratedAt` |
| `agent_run_requests` | `request_id` | string | Agent API가 발급한 immutable request row ID |
| `agent_run_requests` | `client_request_id` | string | FE가 발급한 run start idempotency key |
| `agent_run_requests` | `editor_session_id` | string | request dedupe scope를 완성하는 FE 세션 키 |
| `agent_run_requests` | `run_id` | string | accepted run 식별자 |
| `agent_run_requests` | `trace_id` | uuid/string | accepted run에 귀속된 canonical trace |
| `agent_run_requests` | `snapshot_id` | string | acceptance snapshot 식별자 |
| `agent_run_requests` | `accepted_http_request_id` | string | 이 northbound request row를 생성한 ingress request correlation key |
| `agent_run_requests` | `raw_prompt_hash` | string | prompt provenance와 secondary join용 hash |
| `agent_run_requests` | `redacted_preview` | string | 일반 log/SSE에 노출 가능한 짧은 preview |
| `agent_run_requests` | `redaction_policy_version` | string | 어떤 redaction 규칙으로 처리됐는지 식별 |
| `agent_runs` | `attempt_seq` | integer | 같은 trace 안의 사용자-visible run 시도 순번 |
| `agent_runs` | `status` | enum | `enqueue_pending`, `planning_queued`, `planning`, `plan_ready`, `executing`, `awaiting_apply_ack`, `saving`, `finalizing`, `cancel_requested`, `completed`, `completed_with_warning`, `save_failed_after_apply`, `failed`, `cancelled` |
| `agent_runs` | `status_reason_code` | string/null | 현재 상태 전이의 machine-readable reason |
| `agent_runs` | `execution_mode` | enum | `normal`, `salvage_only`, `mutation_frozen` |
| `agent_runs` | `draft_id` | string/null | 현재 run이 소유한 banner draft 식별자 |
| `agent_runs` | `last_emitted_mutation_seq` | integer | 마지막으로 dispatch한 mutation seq |
| `agent_runs` | `last_acked_mutation_seq` | integer | 마지막으로 ack된 mutation seq |
| `agent_runs` | `latest_save_receipt_id` | string/null | 가장 최근 save ack 식별자 |
| `agent_runs` | `final_revision` | integer/null | terminal 시점 최신 revision |
| `agent_runs` | `final_canvas_state_ref` | string/null | authoritative final canvas state artifact ref |
| `agent_run_attempts` | `attempt_id` | string | attempt 고유 ID |
| `agent_run_attempts` | `run_id` | string | 상위 run 식별자 |
| `agent_run_attempts` | `trace_id` | uuid/string | attempt가 속한 canonical trace |
| `agent_run_attempts` | `attempt_seq` | integer | 재시도/재개 순번 |
| `agent_run_attempts` | `attempt_state` | enum | `enqueued`, `dequeued`, `hydrating`, `running`, `awaiting_ack`, `retry_waiting`, `finalizing`, `succeeded`, `failed`, `cancel_requested`, `cancelled` |
| `agent_run_attempts` | `queue_job_id` | string | queue adapter job 식별자 |
| `agent_run_attempts` | `accepted_http_request_id` | string | 이 attempt를 enqueue한 HTTP/API request correlation key |
| `agent_run_attempts` | `last_heartbeat_at` | datetime | stalled/cancel 감시 기준 |
| `agent_run_events` | `event_id` | string | append-only event row 식별자 |
| `agent_run_events` | `run_id` | string | 상위 run 식별자 |
| `agent_run_events` | `trace_id` | uuid/string | event correlation key |
| `agent_run_events` | `http_request_id` | string/null | 이 event append를 유발한 HTTP request id |
| `agent_drafts` | `draft_id` | string | draft 고유 ID |
| `agent_drafts` | `run_id` | string | 상위 run 식별자 |
| `agent_drafts` | `draft_state` | enum | `reserved`, `first_visible`, `editable_minimum_ready`, `milestone_saved`, `final_saved`, `abandoned` |
| `agent_drafts` | `editable_layer_ids` | json/string[] | 직접 수정 가능한 layer 집합 |
| `agent_drafts` | `final_save_receipt_id` | string/null | latest durable save receipt |
| `agent_plans` | `plan_id` | string | plan 고유 ID |
| `agent_plans` | `plan_version` | integer | 같은 run 안의 revision 번호 |
| `agent_plans` | `payload` | json | validated execution plan |
| `agent_plans` | `schema_version` | string | plan schema 버전 |
| `agent_tool_calls` | `tool_call_id` | string | tool attempt 고유 ID |
| `agent_tool_calls` | `run_id` | string | 상위 run 식별자 |
| `agent_tool_calls` | `trace_id` | uuid/string | tool call trace join key |
| `agent_tool_calls` | `span_id` | string | telemetry span과 audit row를 연결하는 key |
| `agent_tool_calls` | `action_id` | string | 어떤 plan action의 실행인지 식별 |
| `agent_tool_calls` | `tool_name` | string | canonical tool key |
| `agent_tool_calls` | `tool_version` | string | 실행된 tool contract 버전 |
| `agent_tool_calls` | `attempt_seq` | integer | 어떤 queue attempt/job 안에서 실행됐는지 식별 |
| `agent_tool_calls` | `queue_job_id` | string | BullMQ job correlation key |
| `agent_tool_calls` | `attempt_no` | integer | 같은 action 안의 retry 순번 |
| `agent_tool_calls` | `status` | enum | `dispatched`, `succeeded`, `failed`, `compensated`, `skipped` |
| `agent_tool_calls` | `error_class` | enum/null | normalized retry class |
| `agent_tool_calls` | `metering_class` | enum | `provider_actual`, `provider_units_estimated`, `internal_metered_unpriced`, `nonbillable` |
| `agent_tool_calls` | `cost_state` | enum | `estimated`, `final`, `unpriced`, `unknown` |
| `agent_tool_calls` | `pricing_version` | string/null | cost 계산에 사용한 price card version |
| `agent_tool_calls` | `estimated_cost_usd` | number/null | tool call 단위 비용 추정값 |
| `agent_tool_calls` | `input_tokens` | integer/null | provider input token usage |
| `agent_tool_calls` | `output_tokens` | integer/null | provider output token usage |
| `agent_tool_calls` | `cached_input_tokens` | integer/null | provider cache hit usage |
| `agent_tool_calls` | `reasoning_tokens` | integer/null | provider reasoning token usage |
| `agent_tool_calls` | `generated_image_count` | integer/null | image tool usage |
| `agent_tool_calls` | `generated_image_pixels` | integer/null | image tool usage의 정규화 단위 |
| `agent_tool_calls` | `prompt_log_ref` | string/null | model-backed tool이면 연결되는 redacted prompt artifact ref |
| `agent_tool_calls` | `input_ref` | string/null | redacted input payload ref |
| `agent_tool_calls` | `output_ref` | string/null | redacted output payload ref |
| `agent_tool_calls` | `emitted_mutation_ids` | json/string[] | tool call이 만든 mutation/save refs |
| `agent_cost_summaries` | `run_id` | string | request-visible logical run 식별자 |
| `agent_cost_summaries` | `trace_id` | uuid/string | run cost correlation key |
| `agent_cost_summaries` | `request_id` | string | accepted northbound request row correlation key |
| `agent_cost_summaries` | `cost_state` | enum | `estimated`, `final`, `mixed`, `unknown` |
| `agent_cost_summaries` | `pricing_version` | string | summary에 사용한 pricing catalog version |
| `agent_cost_summaries` | `billable_external_usd` | number | provider/model/image 등 외부 비용 총액 |
| `agent_cost_summaries` | `recovery_overhead_usd` | number | retry, fallback, compensation, failed attempt에 쓰인 외부 비용 |
| `agent_cost_summaries` | `tool_call_count` | integer | 전체 tool call 수 |
| `agent_cost_summaries` | `model_call_count` | integer | model-backed tool call 수 |
| `agent_cost_summaries` | `input_tokens` | integer | run 전체 input token rollup |
| `agent_cost_summaries` | `output_tokens` | integer | run 전체 output token rollup |
| `agent_cost_summaries` | `cached_input_tokens` | integer | run 전체 cached token rollup |
| `agent_cost_summaries` | `reasoning_tokens` | integer | run 전체 reasoning token rollup |
| `agent_cost_summaries` | `generated_image_count` | integer | run 전체 image unit rollup |
| `agent_cost_summaries` | `generated_image_pixels` | integer | run 전체 image pixel rollup |
| `agent_cost_summaries` | `internal_unpriced_tool_calls` | integer | USD 배부는 없지만 추적 대상인 internal tool 수 |
| `agent_cost_summaries` | `attempt_breakdown_ref` | string | attempt/job별 비용 breakdown artifact ref |
| `agent_cost_summaries` | `provider_breakdown_ref` | string | provider/model별 비용 breakdown artifact ref |
| `agent_cost_summaries` | `tool_breakdown_ref` | string | toolName별 비용 breakdown artifact ref |
| `agent_mutation_ledger` | `mutation_id` | string | mutation/save/compensation 고유 ID |
| `agent_mutation_ledger` | `run_id` | string | 상위 run 식별자 |
| `agent_mutation_ledger` | `trace_id` | uuid/string | mutation trace join key |
| `agent_mutation_ledger` | `tool_call_id` | string | 어떤 tool call이 만들었는지 식별 |
| `agent_mutation_ledger` | `seq` | integer | live-commit 적용 순서 |
| `agent_mutation_ledger` | `apply_status` | enum | `dispatched`, `acked`, `rejected`, `timed_out`, `compensated`, `cancelled` |
| `agent_mutation_ledger` | `ack_outcome` | enum/null | `applied`, `noop_already_applied`, `rejected`, `reconciled_applied`, `reconciled_not_applied` |
| `agent_mutation_ledger` | `ack_revision` | integer/null | editor ack 기준 revision |
| `agent_final_summaries` | `run_id` | string | 상위 run 식별자 |
| `agent_final_summaries` | `trace_id` | uuid/string | final summary correlation key |
| `agent_final_summaries` | `terminal_status` | enum | `completed`, `completed_with_warning`, `save_failed_after_apply`, `failed`, `cancelled` |
| `agent_final_summaries` | `authoritative_canvas_final_state_ref` | string | `AuthoritativeCanvasFinalState` artifact ref |
| `agent_final_summaries` | `layer_diff_summary_ref` | string | `AuthoritativeCanvasDiff` artifact ref |

### 11.3 저장 정책

- raw prompt와 normalized prompt는 분리 저장한다.
- raw prompt 전문은 `agent_run_requests` 와 restricted prompt artifact 외에는 저장하지 않고, secondary log/event에는 `redacted_preview` 와 `raw_prompt_hash` 만 사용한다.
- worker queue에는 대용량 prompt 원문을 다시 싣지 않고 `requestSnapshotRef` 및 `planId` 기준 조회를 기본으로 한다.
- queue attempt row 또는 동등 로그에는 최소 `runId`, `attemptSeq`, `queueJobId`, `startedAt`, `ended_at`, `failureCode` 를 남긴다.
- `httpRequestId` 는 개별 API request correlation용일 뿐이며 idempotency key나 run identity로 재사용하지 않는다.
- `traceId` 는 dedupe 판정 뒤 생성된 값만 사용한다. acceptance 이후의 record는 같은 opaque 값을 verbatim copy해야 한다.
- `queueJobId` 는 BullMQ custom `jobId` 와 동일한 colon-free 값이어야 하며, QueueEvents correlation을 위해 attempt row에 반드시 저장한다.
- validated plan에는 alias가 아니라 canonical `toolName` + `toolVersion` 만 저장한다.
- `traceId`는 run, plan, action log, tool call, mutation ledger 전부에서 공통으로 유지한다.
- `prompt_log_ref`, `inputRef`, `outputRef` 는 restricted object store ref여야 하며, giant body/base64/full canvas JSON을 row에 inline 저장하면 안 된다.
- `toolCallId -> mutationId` 는 1:N join 가능해야 하며, save receipt와 compensation도 같은 chain에 연결돼야 한다.
- request-visible 총 비용은 acceptance 이후 같은 `runId` 아래 실행된 모든 `agent_tool_calls` 합으로 계산한다. queue retry나 resume은 새 `attemptSeq` 로 보이더라도 같은 run 비용에 포함된다.
- `agent_cost_summaries` 는 run 진행 중 incremental rollup이 가능해야 하며, terminal 시점에는 immutable finalized summary를 남겨야 한다.
- `0 USD` 는 `metering_class=internal_metered_unpriced` 또는 `nonbillable` 에만 허용한다. provider usage를 끝내 확정하지 못한 call은 `cost_state=unknown` 으로 남겨야 한다.
- `pricing_version` 은 tool call 시점에 pinning하고, 이후 단가표 변경 때문에 기존 run summary를 재계산해 덮어쓰지 않는다.

### 11.4 비용/운영 보고 projection 요구사항

canonical record만으로 최소 아래 projection을 재생성할 수 있어야 한다.

| projection | key | source | 필수 지표 |
| --- | --- | --- | --- |
| `run_execution_report` | `runId` | `agent_runs`, `agent_run_attempts`, `agent_cost_summaries`, `agent_final_summaries` | terminal status, attempt count, queue wait ms, time-to-first-visible, editable minimum 시간, `billable_external_usd`, `recovery_overhead_usd`, fallback count |
| `attempt_cost_report` | `runId + attemptSeq + queueJobId` | `agent_run_attempts`, `agent_tool_calls` | dequeue->terminal 시간, stalled 여부, attempt별 tool usage/cost, retry reason, safe resume 여부 |
| `provider_model_daily_rollup` | `date + provider + model + toolName` | `agent_tool_calls`, `agent_cost_summaries` | call count, token/unit usage, estimated usd, p50/p95 latency, failure/rate-limit count |
| `flow_health_rollup` | `date + final_status + scenarioKey` | `agent_runs`, `agent_final_summaries`, `agent_cost_summaries` | run count, success/warning/failure 비율, 평균 비용, recovery overhead ratio |

추가 규칙:

- projection은 telemetry sink 전용 metric만으로 계산하면 안 되고 canonical row만으로 재생성 가능해야 한다.
- run 진행 중 partial projection을 보여줄 수는 있지만, support/finance의 최종 수치는 terminal `agent_cost_summaries` 를 authoritative source로 사용한다.
- `cost_state=unknown`, usage 없는 model call, stalled attempt 급증, `recovery_overhead_usd / billable_external_usd` 급증은 day-one alert 대상이다.

## 12. 예외 및 오류 처리

- 빈 prompt 또는 필수 editor context 누락
  - 시스템 처리: request validation 실패
  - 응답 코드: `400`
  - 오류 코드: `invalid_request`
- queue publish timeout
  - 시스템 처리: run row만 남기고 planning worker enqueue를 포기
  - run 상태: `failed`
  - 오류 코드: `enqueue_timeout`
- non-empty canvas 요청
  - 시스템 처리: v1 surface에서 차단
  - 응답 코드: `409`
  - 오류 코드: `unsupported_existing_canvas`
- plan schema validation 실패
  - 시스템 처리: plan 폐기, 같은 run 안에서 1회 자동 재계획 가능
  - run 상태: 최종 `failed`
- planner timeout
  - 시스템 처리: 실행 queue publish 금지, run 실패 처리
  - 오류 코드: `planning_timeout`
- tool resolution 실패
  - 시스템 처리: action 실행 금지, plan 또는 executor bug로 분류
  - 오류 코드: `tool_resolution_failed`
- tool input schema validation 실패
  - 시스템 처리: non-retryable `validation` 오류로 기록, 같은 action 재실행 금지
  - 오류 코드: `tool_input_invalid`
- first skeleton timeout
  - 시스템 처리: `35000ms`까지 first visible mutation ack가 없으면 run 종료
  - 보상 처리: 미완료 commit group에 한해 placeholder cleanup 허용
  - 오류 코드: `skeleton_timeout`
- provider timeout 또는 rate limit
  - 시스템 처리: `retry_policy` 와 남은 run budget 기준 bounded retry
  - 오류 코드: `tool_timeout` 또는 `tool_rate_limited`
- mutation apply 상태 불명확
  - 시스템 처리: blind replay 금지, `idempotencyKey` 와 `mutation ledger` 로 reconciliation 후에만 replay 가능
  - 오류 코드: `unknown_apply_state`
- executor 중간 실패
  - 시스템 처리: action-level rollback metadata 기록, 실패한 commit group 이후 action 중단
  - run 상태: `failed`
- hard deadline exceeded after editable draft
  - 시스템 처리: optional action 중단, save 결과에 따라 `completed_with_warning` 또는 `save_failed_after_apply`로 종료
  - 오류 코드: `run_deadline_exceeded`
- hard deadline exceeded before editable minimum
  - 시스템 처리: run 종료, 필요 시 마지막 미완료 commit group cleanup
  - run 상태: `failed`
  - 오류 코드: `run_deadline_exceeded`

위 목록은 개별 사례를 열거한 것이다. 실제 구현과 운영은 아래 canonical taxonomy와 recovery 순서를 기준으로 해석한다.

### 12.1 Canonical Failure Taxonomy

| failure family | 대표 오류 / 상황 | first detector | retry scope | backoff rule | resume pointer | terminal / escalation |
| --- | --- | --- | --- | --- | --- | --- |
| ingress_orchestration | `invalid_request`, `queue_publish_failed`, `enqueue_timeout`, `worker_pickup_timeout` | Agent API / enqueue watchdog | request validation, publish failure는 retry 없음. pickup timeout만 queue attempt 1회 재등록 허용 | pickup timeout은 `1000~3000ms` fixed delay 1회. publish failure는 즉시 종료 | visible ack 0건이므로 hydrate부터 다시 시작 | 2번째 pickup miss 또는 publish failure는 `failed` + `status_reason_code` 기록 |
| planning_contract | `planning_timeout`, `plan_validation_failed`, `tool_resolution_failed` | Worker Runtime | 같은 attempt 안에서 repair/re-plan 1회만 허용 | delay 없이 즉시 repair. `T+25초` cutoff 초과 시 추가 시도 금지 | plan 생성 단계부터 재개. canvas reconciliation 없음 | repair budget 소진 시 `failed` |
| tool_transient | `provider_unavailable`, `provider_job_timeout`, `tool_timeout`, `tool_rate_limited`, `asset_storage_unavailable` | Tool Executor / adapter | 동일 `actionId` 내 tool call 1회 추가 허용 | 기본 `0ms -> 1500ms`, rate limit은 `retry_after_ms` 우선. hard deadline 초과 금지 | 같은 `actionId`, 같은 logical idempotency key 유지 | optional slot은 fallback + `warn`, required slot은 salvage 또는 attempt fail |
| unknown_side_effect | `provider_job_state_unknown`, `asset_persist_outcome_unknown`, `unknown_apply_state` | Tool Executor + Agent API reconciliation | direct replay 금지. reconciliation 후 미반영이 확인된 경우에만 1회 replay | 즉시 reconcile 후 `0~1500ms` 내 1회 replay 가능 | `last_acked_mutation_seq` 이후 첫 미확정 tool/mutation부터 재개 | 끝내 확정 불가면 attempt fail 또는 `save_failed_after_apply` |
| canvas_conflict_or_reject | stale revision, missing target layer, FE mutation reject, optimistic concurrency 충돌 | Editor Mutation Gateway + Worker | blind retry 금지. 최신 revision/base refresh 후 1회 rebased retry만 허용 | 별도 backoff 없음. 즉시 재계산 | 현재 rollback group 안에서 fallback mutation 또는 cleanup 후 계속 | 재시도 실패 시 current group compensation 후 `completed_with_warning` 또는 `failed` |
| worker_liveness_before_visible_ack | worker crash/stall before first visible ack | Queue Broker event + Agent API watchdog | same `runId` 로 attempt retry 가능 | `1000~3000ms` fixed delay 1회 | hydrate -> planning -> execution을 처음부터 재개 | retry exhausted 시 `failed` |
| worker_liveness_after_visible_ack | worker crash/stall after visible ack, heartbeat loss, lease loss | Queue Broker event + Agent API watchdog | `resumeFromSeq` 또는 ledger-safe resume이 있을 때만 attempt retry 허용 | `1000~3000ms` delayed retry 1회. safe resume 불가 시 retry 금지 | 새 `attemptSeq` 로 `lastAckSeq + 1`부터 재개 | safe resume 불가면 current rollback group cleanup 후 `completed_with_warning`, `save_failed_after_apply`, `failed` 중 하나로 닫음 |
| save_or_finalize_durability | save ack timeout/reject, final save 후 finalize 유실 | Editor Mutation Gateway + Agent API watchdog | `saveDraft` 는 `T+105초` 이전 시작분에 한해 1회 retry. finalize 유실은 backend recovery 허용 | save retry는 `0~1500ms` fixed delay 1회 | 새 user-visible mutation 없이 latest ack revision 기준 save/finalize만 재개 | latest save receipt 부재 시 `save_failed_after_apply`, finalize만 유실이면 reconstructed success/warning 가능 |
| deadline_or_cancel | `run_deadline_exceeded`, cancel requested | Agent API + Worker | 일반 retry 없음 | `T+75초` `salvage_only`, `T+105초` `mutation_frozen`, `T+120초` terminal close | cleanup, compensation, save, finalize만 허용 | editable minimum 충족 여부와 save receipt 보유 여부로 terminal outcome 결정 |

추가 규칙:

- queue attempt retry와 action-local retry는 분리한다. action-local retry는 `agent_tool_calls.attempt_no` 증가로 기록하고, queue retry는 `agent_run_attempts.attempt_seq` 증가로 기록한다.
- 같은 logical action/save의 retry/resume 동안 `idempotencyKey`, `runId`, `draftId`, `commit_group_id` 는 유지해야 한다.
- safe resume 근거가 없는 상태에서 새 attempt를 열면 live-commit 중복 적용 위험이 있으므로 금지한다.

### 12.1A Stage-by-Stage Failure and Recovery Matrix

아래 표는 v1 representative pipeline을 stage 순서대로 잘라, 각 stage에서 무엇이 실패 신호인지, 어떤 자동 복구만 허용되는지, 어디서 terminal로 닫아야 하는지, 어떤 경우에 ops/engineering 수동 개입이 필요한지를 구현 계약으로 고정한다.

`manual intervention required` 는 활성 run 안에서 자동 복구를 더 이어가지 않고, 운영자/개발자가 queue, storage, contract drift, data repair, incident 대응을 별도로 수행해야 함을 뜻한다. manual intervention이 필요해도 run은 `120000ms` 안에 `failed`, `completed_with_warning`, `save_failed_after_apply`, `cancelled` 중 하나로 닫아야 하며, `waiting_for_human` 같은 비종결 상태로 남겨두면 안 된다.

| stage | detection signals / first detector | automatic recovery / retry rule | terminal failure condition | manual intervention required when |
| --- | --- | --- | --- | --- |
| `ingress_validation_and_lock` | Agent API가 `POST /runs` request schema 불일치, `isEmptyCanvas=false`, auth/permission 실패, active page lock 충돌, idempotency conflict를 감지 | 자동 retry 없음. 동일 `clientRequestId + editorSessionId + scenarioKey + documentId + pageId` 중복은 기존 active run 재반환만 허용 | invalid request, unsupported existing canvas, permission denial, page lock 획득 실패가 확정되면 run 미생성 또는 즉시 `failed` | 같은 page lock이 terminal run 종료 후에도 해제되지 않거나, idempotency dedupe가 서로 다른 run으로 갈라지는 경우 |
| `queue_publish_and_pickup` | Agent API가 `Queue.add()` error/timeout, queue ack 누락, enqueue 후 `QueueEvents.active` 또는 첫 heartbeat 미수신을 감지 | publish retry 없음. pickup timeout만 visible ack 0건일 때 같은 `runId` 로 delayed re-enqueue 1회 허용 | 2번째 pickup miss, enqueue timeout, queue publish failed, hard deadline 침범 시 `failed` | Redis/BullMQ 장애가 지속되거나, queue에는 job이 있는데 backend attempt row와 `queueJobId` correlation이 깨지는 경우 |
| `hydrate_snapshot_restore` | Worker가 `requestSnapshotRef`, `constraintPackRef`, latest validated plan/ledger/save receipt 조회 실패, snapshot/base revision 불일치, cancel fence 선존재를 감지 | visible ack 0건이면 queue attempt level retry 1회 허용. visible ack 1건 이상이면 hydrate는 `resumeFromSeq`가 증빙될 때만 재개 | hydrate contract 불일치, snapshot artifact 유실, safe resume cursor 계산 실패 시 `failed` 또는 post-visible이면 guarded close | snapshot/object store 손상, immutable snapshot ref 누락, backend canonical row와 object ref가 상호 불일치하는 경우 |
| `planning_generation` | planner timeout, model/provider transient error, `PlannerOutputEnvelope` 미생성, malformed correlation echo를 Worker가 감지 | 같은 attempt 안에서 planner repair/re-plan 1회만 허용. planner timeout 뒤 blind full replay 금지 | `T+25초` cutoff 초과, repair budget 소진, planner contract 위반이면 `failed` | planner schema/version drift가 반복되거나, planner가 금지된 신규 correlation ID 또는 unsupported tool family를 계속 생성하는 경우 |
| `plan_validation_and_repair` | validator/Worker가 `schema_shape`, `registry_resolution`, `semantic_graph`, `policy_budget`, `target_integrity` gate 실패를 감지 | blocking issue bundle 기준 repair 1회만 허용. delay/backoff 없이 즉시 repair, repair 후 재검증 | 2차 검증 실패, out-of-scope operation, registry mismatch, policy violation이면 execution 진입 없이 `failed` | tool registry canonical name/version이 runtime과 문서 계약에서 어긋나거나, validator 규칙 자체가 배포 drift로 깨진 경우 |
| `pre_visible_tool_execution` | executor/adapter가 asset prep, text authoring, layout helper, provider/storage call 실패, rate limit, timeout, `unknown_apply_state` 전조를 감지 | 같은 `actionId` 내 action-local retry 1회. `unknown_apply_state` 는 직접 retry 금지, reconciliation 후 미반영일 때만 replay 1회 | required pre-visible action이 회복되지 않고 first visible deadline 또는 plan-required dependency를 넘기면 `failed` | provider/provider-quota 장애가 장시간 지속되거나, asset dedupe/reconciliation key가 손상돼 미반영 여부를 판정할 수 없는 경우 |
| `first_visible_mutation_dispatch_and_ack` | Editor Mutation Gateway와 Agent API가 mutation ack timeout, reject ack, seq gap, unexpected `ackRevision`, `unknown_apply_state`, stale revision conflict를 감지 | blind replay 금지. same `commitGroup` 안에서 reconciliation 후 rebased retry 1회 또는 cleanup 1회만 허용 | `35000ms`까지 first visible ack 없음, rebased retry 실패, current group cleanup도 불가하면 `failed` | FE command contract drift로 모든 mutation이 일관되게 reject되거나, `mutationId -> ackRevision` join이 지속적으로 불가능한 경우 |
| `post_visible_execution_to_editable_minimum` | Worker/Backend가 optional slot generation failure, fallback graphic 사용, mutation reject after visible ack, editable minimum milestone 미달을 감지 | optional slot은 fallback placeholder/graphic으로 대체 가능. required slot은 `last_acked_mutation_seq + 1`부터 safe resume 1회만 허용 | editable minimum 전 required slot failure, safe resume 불가, `75000ms` deadline 초과 시 `failed` | same page revision에서 repeated conflict가 누적돼 current rollback group 정리 후에도 required slot을 만들 수 없는 경우 |
| `post_minimum_refinement_and_salvage` | Backend가 `salvage_only` 진입(`T+75초`), optional asset 계속 실패, fallback count 급증, warning threshold 초과를 감지 | 새 optional action 중단, placeholder 유지, save preparation으로 조기 전환. queue retry는 safe resume 있을 때만 1회 | save 전환도 못 하고 pending visible ambiguity가 남은 채 hard deadline 접근 시 `completed_with_warning` 또는 `failed` | fallback/cleanup 결과가 summary와 실제 ledger에 일치하지 않거나, orphan asset/layer cleanup 필요량이 운영 허용치를 넘는 경우 |
| `save_and_finalize_durability` | FE save ack timeout/reject, save receipt 누락, finalize callback 유실, latest saved revision 불일치를 Agent API watchdog가 감지 | `saveDraft` 는 `T+105초` 이전 시작분에 한해 1회 retry. finalize 유실은 새 visible mutation 없이 ledger + save receipt 기반 재구성 허용 | latest save receipt 부재면 `save_failed_after_apply`; finalize reconstruction 근거도 없으면 `failed` | save receipt는 있는데 template store 조회가 불가능하거나, save receipt revision과 ledger ack revision이 구조적으로 어긋나는 경우 |
| `worker_liveness_and_resume` | QueueEvents `stalled`, heartbeat loss, worker crash, dequeue 후 장시간 phase append 누락을 Agent API watchdog가 감지 | visible ack 0건이면 full attempt retry 1회. visible ack 이후는 `resumeFromSeq` 와 open ledger가 있는 경우에만 delayed retry 1회 | retry budget 소진, safe resume 불가, current rollback group compensation 불가 시 terminal close | stalled job 폭증, worker binary crash loop, retry마다 동일 `queueJobId`/heartbeat corruption이 반복되는 경우 |
| `deadline_and_cancel_closeout` | backend가 `editable_minimum_deadline`, `mutationCutoff`, `hardDeadline`, user cancel fence를 감지 | `T+75초` 이후 `salvage_only`, `T+105초` 이후 mutation freeze, 이후 cleanup/save/finalize만 허용. 일반 retry 금지 | hard deadline 도달 시 editable minimum과 save receipt 보유 여부로 `completed`, `completed_with_warning`, `save_failed_after_apply`, `failed`, `cancelled` 중 하나로 강제 종료 | cancel fence 이후에도 worker가 새 visible mutation을 계속 제안하거나, terminal close 후 page lock이 해제되지 않는 경우 |

stage-specific 구현 규칙:

1. `manual intervention required` 에 해당하면 backend는 `ops_intervention_required` 성격의 event를 남기고 최소 `runId`, `traceId`, `attemptSeq`, `queueJobId`, `stage`, `status_reason_code`, `lastAckedMutationSeq`, `latest_save_receipt_id`, `suggested_operator_action` 을 포함해야 한다.
2. manual intervention은 retry budget을 추가로 여는 근거가 아니다. active run은 terminal close 후 별도 operator replay 또는 defect fix 이후 새 run으로 처리한다.
3. stage 전환 중 detector가 둘 이상이어도 canonical terminal 판정 owner는 Agent API다. worker/FE는 signal producer이며 terminal state를 직접 확정하지 않는다.

### 12.2 Recovery Execution Order

실패 발생 시 pipeline은 아래 순서로 처리한다.

1. detector는 failure를 `errorClass`, `errorCode`, `retryable`, `resumeFromSeq?`, `visible_ack_seen` 와 함께 기록한다.
2. `unknown_apply_state` 또는 side effect ambiguity가 있으면 retry보다 reconciliation을 먼저 수행한다. 사용 근거는 `toolCallId`, `idempotencyKey`, `mutationId`, `ackRevision`, `saveReceiptId`, asset checksum이다.
3. visible ack가 아직 없다면 retryable failure는 same `runId` 의 새 attempt로 full replay할 수 있다.
4. visible ack가 이미 있다면 retryable failure도 `last_acked_mutation_seq + 1` 또는 worker가 보고한 `resumeFromSeq` 부터만 재개한다.
5. non-retryable failure가 current commit group 안에서 발생했지만 optional slot/fallback이 남아 있으면 current group cleanup 후 fallback path로 계속 진행한다.
6. required action이 회복되지 않으면 editable minimum 달성 여부를 기준으로 `failed`, `completed_with_warning`, `save_failed_after_apply` 중 하나로 종료한다.

### 12.3 Escalation, Manual Intervention, and User-Facing Signaling

- action-local retry, optional asset fallback, single rebased retry는 `agent_action_logs` 와 `run.log(level=warn)` 에 남기고 run은 계속 진행한다.
- queue attempt retry scheduled, `salvage_only` 진입, save durability risk는 FE run panel에도 노출되는 warning event로 승격한다.
- retry budget exhausted, safe resume impossible, latest save receipt missing at deadline은 terminal status `failed`, `completed_with_warning`, `save_failed_after_apply` 중 하나와 함께 `status_reason_code` 를 남긴다.
- manual intervention이 필요한 경우 backend는 terminal outcome과 별도로 `ops_intervention_required=true` 와 `suggested_operator_action` 을 기록해야 한다. 예: `unlock_page`, `repair_snapshot_ref`, `inspect_queue_correlation`, `repair_save_receipt_join`, `fix_contract_drift`.
- FE 사용자 표면은 manual intervention 세부 원인 대신 `자동 복구에 실패해 실행을 종료했다` 수준의 bounded message만 노출하고, internal correlation(`runId`, `traceId`)은 support/debug surface에서만 보여준다.

## 13. 비기능 요구사항

| ID | 영역 | 요구사항 |
| --- | --- | --- |
| NFR-001 | 아키텍처 분리 | Agent API control plane과 Worker Runtime execution plane은 durable queue 경계로 분리되어야 한다. |
| NFR-002 | 스택 제약 | 신규 orchestration backend는 PHP가 아닌 별도 runtime으로 구현해야 한다. |
| NFR-003 | 검증성 | planner 출력은 app-side JSON schema validation 통과 전까지 실행할 수 없어야 한다. |
| NFR-004 | 추적성 | 모든 run/plan/action/tool call/mutation log는 `traceId`, `runId`, `planId`, `actionId`, `toolCallId` chain으로 상호 추적 가능해야 한다. |
| NFR-005 | 가벼운 시작 | v1은 단일 run, 단일 draft, 단일 executor 기준으로 시작할 수 있어야 한다. |
| NFR-006 | 확장성 | action schema 변경 없이 future `updateLayer`, `deleteLayer`를 추가할 수 있어야 한다. |
| NFR-007 | Schema Discipline | tool input/output/result schema는 strict mode 호환 JSON Schema subset으로 유지해야 한다. |
| NFR-008 | Control Plane Runtime | v1 control plane은 TypeScript/Node 기반 `Fastify` 서비스로 구현해야 한다. |
| NFR-009 | Execution Runtime | v1 execution plane은 별도 TypeScript/Node 기반 `BullMQ Worker` 프로세스로 구현해야 한다. |
| NFR-010 | Queue Transport | v1 durable queue handoff는 `Redis` 기반 `BullMQ` 를 사용해야 하며, `QueueEvents` 는 transport telemetry로만 사용해야 한다. |
| NFR-011 | Cost Visibility | v1은 `runId` 와 `attemptSeq + queueJobId` 두 축 모두에서 model/tool usage와 비용을 집계할 수 있어야 하며, terminal run마다 immutable `agent_cost_summaries` 를 남겨야 한다. |

## 14. 오픈 질문

| ID | 질문 | 필요한 결정 |
| --- | --- | --- |
| OQ-001 | prompt만 있고 브랜드/상품 정보가 없을 때 기본 visual asset을 pure graphic으로 둘지, stock-like generated image까지 허용할지? | 제품/디자인 결정 |
| OQ-002 | SSE는 v1 포함으로 고정한다. WebSocket도 추가로 열지 여부는 필요한 경우 후속 결정한다. | FE/Backend 결정 |
| OQ-003 | checkpoint restore를 editor 기존 revision/save 체계와 어떻게 연결할지? | FE/Executor 결정 |

## 15. 구현 추적

- 기존 제품/연구 기준 문서
  - [ai-suite-functional-spec-as-is-v2.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/ai-suite-functional-spec-as-is-v2.md)
  - [t2i-current-state-spec.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/t2i-current-state-spec.md)
  - [ai-feature-opportunity-research-2026-04-02-final.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/ai-feature-opportunity-research-2026-04-02-final.md)
  - [ai-feature-research-2026-04-02.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/ai-feature-research-2026-04-02.md)
  - [ai-logging-v1-design.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/ai-logging-v1-design.md)
- FE grounding reference
  - [menuItems.ts](/home/ubuntu/github/tooldi/tws-editor-api/toolditor/src/shared/config/menu/menuItems.ts)
  - [useTemplateLoader.ts](/home/ubuntu/github/tooldi/tws-editor-api/toolditor/src/hooks/editor/useTemplateLoader.ts)
  - [addObject.ts](/home/ubuntu/github/tooldi/tws-editor-api/toolditor/src/functions/elements/common/addObject.ts)
- 공식 문서 근거
  - Context7 `OpenAI API Reference`
    - structured outputs / strict JSON schema
    - function/tool calling strict parameter schema
    - strict mode JSON Schema subset limitation
    - image generation/editing workflow capability
