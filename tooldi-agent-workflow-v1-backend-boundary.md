# Tooldi Agent Workflow V1 Backend Boundary

| 항목 | 값 |
| --- | --- |
| 문서명 | `Tooldi Agent Workflow V1 Backend Boundary` |
| 문서 목적 | 자연어 agent/workflow layer의 backend 경계, orchestration 책임, sync/async 분리, northbound/southbound 계약을 v1 범위로 고정한다. |
| 상태 | `Draft` |
| 문서 유형 | `TO-BE` |
| 작성일 | `2026-04-02` |
| 기준 시스템 | `toolditor FE`, `Fastify-based non-PHP agent backend`, `BullMQ worker + LangGraph runtime`, `Redis-backed BullMQ queue`, `existing AI primitives` |
| 기준 데이터 | `docs/tooldi-agent-workflow-v1/tooldi-natural-language-agent-v1-architecture.md`, `docs/tooldi-agent-workflow-v1/toolditor-agent-workflow-v1-client-boundary.md` |
| 대상 독자 | `PM, FE, Agent Backend, Worker, QA` |
| Owner | `Ouroboros workflow` |

## 1. 목적

이 문서는 Tooldi 자연어 agent/workflow v1에서 `agent backend` 를 정확히 어디까지로 볼지 정의한다.

이 문서가 고정하려는 핵심은 아래 3가지다.

1. backend는 `run control plane` 이고, worker는 `execution plane` 이다.
2. FE와 worker는 backend를 통해서만 run 상태와 live-commit mutation을 주고받는다.
3. v1은 lightweight하게 시작하되, `updateLayer` 와 `deleteLayer` 가 필요한 후속 flow까지 무리 없이 확장 가능한 계약을 먼저 만든다.

### 1.1 Normative Precedence

- 이 문서는 backend/control-plane scope, persistence ownership, northbound/southbound 분리를 정의하는 authoritative boundary 문서다.
- counted completion moment, canonical draft artifact identity, lifecycle ownership source는 [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/docs/tooldi-agent-workflow-v1/tooldi-natural-language-agent-v1-architecture.md) 의 `completion_sla_definition`, `draft_artifact_model`, `authority_matrix` 를 그대로 재참조해야 한다.
- 따라서 이 문서의 persistence table, close-row 설명, terminalization prose는 `RunCompletionRecord.completedAt` 을 terminal bookkeeping timestamp로만 다루고, `RunCompletionRecord.draftGeneratedAt` 이 sole SLA-counted success moment라는 규칙을 바꾸면 안 된다.

## 2. backend 경계 정의

### 2.1 v1에서 말하는 backend의 범위

v1의 backend는 아래 컴포넌트를 하나의 논리 경계로 묶는다.

| 컴포넌트 | 포함 여부 | 설명 |
| --- | --- | --- |
| Public Agent API | 포함 | FE가 호출하는 northbound HTTP API |
| Run Orchestrator | 포함 | run 생성, lock, 상태 전이, event fan-out, cancel 처리 |
| Run Store / Event Log / Cost Log | 포함 | durable canonical state 저장소 |
| Snapshot / Request Reference Store | 포함 | worker가 hydrate할 request/snapshot reference 저장소 |
| Queue Publisher | 포함 | worker 실행 요청 enqueue |
| Worker Callback API | 포함 | worker heartbeat, mutation proposal, finalize 수신 |
| Worker Runtime | 제외 | planner, tool execution, compensation 계산을 수행하는 별도 프로세스 |
| Existing one-shot AI primitive | 제외 | worker가 internal tool adapter로 호출하는 대상 |
| toolditor command executor | 제외 | FE가 live-commit mutation을 실제 캔버스에 반영하는 실행자 |

즉, backend는 `run 생성`, `policy enforcement`, `지속성`, `orchestration control`, `종료 판정`을 맡고, `실행 계획 생성`, `도구 실행`, `캔버스 mutation 적용`은 맡지 않는다.

### 2.2 기술 제약

- 신규 backend stack은 PHP 밖에 둔다.
- v1은 public API와 worker callback API를 같은 서비스로 시작할 수 있다.
- v1은 queue, run store, event log를 분리하되, planner/runtime을 API 프로세스 안으로 넣지 않는다.
- 기존 one-shot AI 기능은 public API의 일부로 노출하지 않고 worker 내부 adapter를 통해서만 재사용한다.

### 2.3 v1 실행 플랫폼 고정값

v1은 구현 자유도를 열어 두지 않고 아래 플랫폼 조합을 표준으로 고정한다.

| 축 | v1 고정 선택 | 설명 |
| --- | --- | --- |
| backend service | 별도 TypeScript/Node `Fastify` 서비스 | public run API, worker internal API, SSE stream, auth/session 검증, run state/event/cost persistence, retry/cancel watchdog를 담당하는 control plane |
| worker runtime | 별도 TypeScript/Node `BullMQ Worker` 프로세스 + 내부 `LangGraph` runtime | planning, tool execution, mutation proposal, compensation, finalize payload 생성을 담당하는 execution plane |
| queue mechanism | `Redis` 기반 `BullMQ` queue + `QueueEvents` | durable dispatch, delayed re-enqueue, lease, stalled/completed/failed transport event를 제공하는 transport plane |

이 선택을 고정하는 이유는 아래와 같다.

- Tooldi/toolditor가 이미 JS/TS 운영 문맥과 `ioredis`, `pino`, `zod` 계열 도구를 사용하고 있어 새 orchestration layer도 TypeScript로 맞추는 편이 가장 가볍다.
- Fastify는 JSON Schema 기반 request validation, plugin registration, logger 통합이 강해 strict northbound/southbound 계약을 control plane에 구현하기 좋다.
- BullMQ는 Queue, Worker, QueueEvents, delayed job, stalled job signal을 제공하므로 v1의 separated worker + delayed retry + watchdog 요구사항을 transport plane 에서 충족한다.
- worker 내부 orchestration 은 TS `LangGraph` 로 관리하고, BullMQ 는 outer dispatch/lease 역할만 맡긴다.
- v1은 lightweight가 목표이므로 Temporal 같은 더 무거운 workflow engine이나 multi-broker 구성을 도입하지 않는다.

### 2.4 플랫폼별 책임 경계

| 컴포넌트 | owning 책임 | 명시적으로 맡지 않는 책임 |
| --- | --- | --- |
| `Fastify Agent Backend` | `POST /runs`, SSE, mutation ack, cancel, page lock, run creation, policy enforcement, run/attempt/event/cost persistence, BullMQ enqueue, QueueEvents 감시, retry/cancel/terminal 판정 | executable planning, planner/model/tool 호출, canvas mutation application, queue auto-retry에 대한 최종 판정 |
| `BullMQ Queue + Redis` | durable job handoff, delayed retry scheduling, worker lease/transport state, stalled/completed/failed transport event 발행 | canonical run status 저장, cost log, rollback ledger, FE stream fan-out |
| `BullMQ Worker Runtime` | queue consume, outer process lifecycle, LangGraph graph invoke, finalize handoff | page lock 관리, queue attempt budget 결정, accepted 응답, SSE 직접 송신 |
| `LangGraph Run Graph` | request/snapshot hydrate, plan 생성/실행, tool adapter 호출, mutation proposal, compensation 계산, fail-fast branch, finalize draft 생성 | northbound API, queue publish, canonical run status 저장 |

## 3. 책임 분리

### 3.1 주체별 책임 매트릭스

| 책임 | FE | Agent Backend | Worker | 비고 |
| --- | --- | --- | --- | --- |
| empty-canvas gate 확인과 prompt 입력 | 주 책임 | 보조 검증 | 없음 | FE와 backend 모두 방어적으로 확인 |
| web session 인증/권한 확인 | 없음 | 주 책임 | 없음 | public API 진입 시 처리 |
| page 단위 동시 run lock | 없음 | 주 책임 | 없음 | 같은 page에 2개 run 금지 |
| runId / traceId / deadlineAt 발급 | 없음 | 주 책임 | 없음 | canonical source of truth |
| request/snapshot reference 저장 | 없음 | 주 책임 | 없음 | worker hydrate 입력 |
| queue enqueue | 없음 | 주 책임 | 없음 | v1 필수 orchestration duty |
| planner 실행 | 없음 | 없음 | 주 책임 | backend sync path에서 금지 |
| tool 선택과 호출 | 없음 | 없음 | 주 책임 | one-shot primitive는 worker adapter 뒤에 숨김 |
| canvas mutation 내용 결정 | 없음 | 없음 | 주 책임 | backend는 내용 승인자가 아님 |
| mutation seq canonical ordering | 없음 | 주 책임 | 제안 | worker는 `mutationId` 와 dependency만 제안 |
| live mutation 실제 적용 | 주 책임 | 없음 | 없음 | FE command path 재사용 |
| mutation apply ack canonical 저장 | 보조 제출 | 주 책임 | 대기/소비 | 후속 update/delete chaining에 필요 |
| retry / timeout / cancel orchestration | 없음 | 주 책임 | 협력 | worker는 retryable 여부만 판단 |
| run timeline / event log / cost log 저장 | 없음 | 주 책임 | 보조 보고 | canonical log는 backend가 저장 |
| rollback ledger 저장 | 로컬 checkpoint | 주 책임 | 보조 계산 | FE는 local revert, backend는 durable trace |
| 최종 run status 판정 | 없음 | 주 책임 | 보조 보고 | worker 결과와 ack 상태를 합쳐 판정 |

### 3.2 backend가 직접 하면 안 되는 것

backend는 아래를 직접 수행하지 않는다.

- planner model 호출을 동기 HTTP request 안에서 처리하는 것
- 기존 AI primitive를 public API handler에서 직접 호출하는 것
- FE를 우회해 canvas object store를 직접 mutate하는 것
- provider별 prompt, tool parameter, fallback recipe를 public contract에 노출하는 것
- 사용자가 보는 live-commit approval gate를 backend에서 추가하는 것

## 4. backend orchestration duty

### 4.1 run bootstrap

`POST /api/agent-workflow/runs` 수신 시 backend는 아래를 순서대로 수행해야 한다.

1. 세션 인증과 page 권한을 확인한다.
2. `mode=create_from_empty_canvas` 와 `commitMode=apply_immediately` 를 검증한다.
3. 같은 `documentId + pageId` 에 active run이 있는지 확인하고 lock을 획득한다.
4. client payload를 canonical request record로 정규화한다.
5. 현재 revision, canvas gate, locale, deadline을 포함한 snapshot reference를 저장한다.
6. `runId`, `traceId`, `deadlineAt` 을 발급한다.
7. run row를 canonical `planning_queued` 상태로 만들고 queue에 `RunJobEnvelope` 를 발행한다.
8. FE에 `RunAccepted` 를 즉시 반환하고 event stream 구독을 가능하게 한다.

bootstrap 단계에서 planner/tool execution을 시작하면 안 된다.

### 4.2 in-flight orchestration

run 진행 중 backend는 아래를 지속적으로 수행한다.

- worker가 올린 phase/log/mutation proposal을 event log에 append한다.
- append된 mutation proposal마다 canonical `seq` 를 부여한다.
- `canvas.mutation` event를 FE stream으로 fan-out 한다.
- FE가 보낸 `MutationApplyAck` 를 검증하고 append-only mutation chain의 canonical ack/reconcile state를 확정한다.
- ack 결과를 worker가 조회할 수 있게 해 다음 step을 열어준다.
- cancel 요청, deadline 초과, worker heartbeat 누락을 감시한다.
- retryable failure면 queue 재시도를 열고, non-retryable failure면 종료 판정으로 보낸다.

### 4.3 run 종료

backend는 아래 조건을 만족할 때만 run을 terminal state로 닫는다.

1. worker가 `RunFinalizeRequest` 를 보냈거나, worker 유실 후 backend recovery rule이 terminal outcome을 합성했다.
2. 마지막으로 필요한 `saveTemplate` mutation까지 ack 또는 실패 상태가 확정됐다.
3. cancel/retry 경쟁 상태가 정리됐다.
4. created/updated/deleted layer summary와 cost summary가 기록됐다.

terminal status는 v1에서 아래만 허용한다.

- `completed`
- `completed_with_warning`
- `save_failed_after_apply`
- `failed`
- `cancelled`

## 5. sync vs async 분리

### 5.1 결정 원칙

- 사용자의 짧은 요청-응답이 필요한 것은 sync로 둔다.
- planner, tool execution, retry, timeout recovery처럼 시간이 늘어날 수 있는 것은 async로 둔다.
- live-commit mutation의 실제 적용은 FE가 수행하므로, backend는 `mutation delivery` 와 `ack acceptance` 만 맡는다.

### 5.2 v1 분리표

| 동작 | 처리 방식 | 주체 | 이유 |
| --- | --- | --- | --- |
| run 시작 요청 수락 | Sync | Agent Backend | 사용자는 즉시 run 시작과 lock 성공 여부를 알아야 한다 |
| request validation / auth / page lock / snapshot ref 저장 | Sync | Agent Backend | bootstrap의 일관성을 먼저 확보해야 한다 |
| queue enqueue | Sync | Agent Backend | `accepted` 응답 전에 durable handoff가 필요하다 |
| planner / tool execution / asset generation | Async | Worker | 2분 budget과 retry를 감안하면 별도 execution plane이 필요하다 |
| phase/log stream fan-out | Async push | Agent Backend | FE는 long-lived SSE로 timeline을 받아야 한다 |
| canvas mutation 제안 | Async | Worker -> Agent Backend | mutation 생성은 planner/tool 결과에 종속된다 |
| canvas mutation 실제 적용 | Async | FE | live-commit을 실제 편집기 command path로 반영해야 한다 |
| mutation apply ack 수락 | Sync write | FE -> Agent Backend | 후속 update/delete는 ack 결과에 의존하므로 즉시 durable write가 필요하다 |
| cancel 요청 수락 | Sync accept + Async stop | Agent Backend + Worker | 사용자는 즉시 취소 의도를 전달하고, 실제 stop은 협력적으로 처리한다 |
| timeout / retry 판단 | Async | Agent Backend | worker attempt와 deadline을 종합해야 한다 |
| 최종 결과 통지 | Async push | Agent Backend | completion/failure를 stream과 저장소에 함께 남겨야 한다 |

### 5.3 v1에서 일부러 하지 않는 것

- run 시작 요청을 하나의 long-running HTTP call로 유지하지 않는다.
- worker와 FE 사이에 direct socket을 열지 않는다.
- mutation ack 전달을 위해 별도 second queue를 추가하지 않는다.

v1의 lightweight 선택은 `queue for job dispatch + SSE for client stream + synchronous ack write` 조합이다.

## 6. FE에 노출하는 northbound 계약

### 6.1 public endpoint 목록

| API | Method | 목적 | 처리 성격 |
| --- | --- | --- | --- |
| `/api/agent-workflow/runs` | `POST` | 새 run 생성 | Sync |
| `/api/agent-workflow/runs/:runId/events` | `GET` | run event stream 구독 | Async SSE |
| `/api/agent-workflow/runs/:runId/mutation-acks` | `POST` | live mutation 적용 결과 제출 | Sync |
| `/api/agent-workflow/runs/:runId/cancel` | `POST` | cancel 의도 전달 | Sync accept |

### 6.2 `POST /api/agent-workflow/runs`

이 endpoint는 `StartAgentWorkflowRunRequest` 를 받아 `RunAccepted` 를 반환한다.

backend가 추가로 보장해야 하는 규칙은 아래와 같다.

- `clientRequestId` 는 사용자 세션 범위 idempotency key로 취급한다.
- `requestId` 는 backend가 acceptance 시 발급하는 immutable northbound request row id다. `clientRequestId` 와 같은 값으로 재사용하면 안 된다.
- 같은 key로 재요청하면 기존 active run을 재반환하거나 명시적으로 충돌을 돌려준다.
- public create-run request는 client-authored `traceId` 를 받지 않는다. canonical `traceId` 는 backend가 dedupe 판정 뒤 발급한다.
- `isEmptyCanvas` 가 false면 `409` 또는 `422` 로 거절한다.
- active page lock이 이미 있으면 새 run을 시작하지 않는다.
- 응답은 최소 `x-request-id`, `x-agent-run-id`, `x-agent-trace-id` header를 함께 돌려줘야 한다.

```ts
type RunAccepted = {
  runId: string;
  traceId: string;
  status: 'queued';
  startedAt: string;
  deadlineAt: string;
  streamUrl: string;
  cancelUrl: string;
  mutationAckUrl: string;
};
```

#### 6.2.1 persisted bootstrap contract

run acceptance 순간 backend가 durable하게 고정해야 하는 bootstrap artifact는 아래 두 개다.

- `NorthboundRunRequest`: `agent_run_requests` 에 저장되는 immutable request row
- `AgentRunRecord`: `agent_runs` 에 저장되는 mutable run lifecycle row

이 둘은 같은 값 집합을 중복 저장하기 위한 것이 아니라 책임이 다르다.

- `NorthboundRunRequest` 는 사용자가 무엇을 보냈는지와 acceptance 당시 어떤 조건에서 받아들여졌는지를 보존한다.
- `AgentRunRecord` 는 그 요청이 어떤 run lifecycle 상태로 진행 중인지와 canonical completion 기준이 무엇인지를 보존한다.

```ts
type NorthboundRunRequest = {
  requestId: string;
  clientRequestId: string;
  runId: string;
  traceId: string;
  snapshotId: string;
  acceptedHttpRequestId: string;
  dedupeKey: string;
  dedupeDisposition: 'accepted_new' | 'reused_active_run';
  workflowVersion: 'v1';
  scenarioKey: 'empty_canvas_banner_create';
  mode: 'create_from_empty_canvas';
  promptRef: string;
  rawPromptHash: string;
  normalizedPrompt: string;
  redactedPreview: string;
  actor: {
    userId: string;
    workspaceId: string;
    editorSessionId: string;
  };
  workspace: {
    documentId: string;
    pageId: string;
    widthPx: number;
    heightPx: number;
    baseRevision: number;
    isEmptyCanvas: true;
  };
  executionPolicy: {
    draftCount: 1;
    maxDurationSec: 120;
    commitMode: 'apply_immediately';
    allowedMutationOps: ['createLayer', 'updateLayer', 'deleteLayer', 'saveTemplate'];
  };
  locale: string;
  timezone: string;
  requestedAt: string;
  acceptedAt: string;
  snapshotRef: string;
};

type AgentRunRecord = {
  runId: string;
  traceId: string;
  requestId: string;
  snapshotId: string;
  ownerComponent: 'fastify_agent_api';
  scenarioKey: 'empty_canvas_banner_create';
  mode: 'create_from_empty_canvas';
  documentId: string;
  pageId: string;
  userId: string;
  workspaceId: string;
  pageLockToken: string;
  requestRef: string;
  requestSnapshotRef: string;
  status: 'enqueue_pending' | 'planning_queued' | 'planning' | 'plan_ready' | 'executing' | 'awaiting_apply_ack' | 'saving' | 'finalizing' | 'cancel_requested' | 'completed' | 'completed_with_warning' | 'save_failed_after_apply' | 'failed' | 'cancelled';
  statusReasonCode: string | null;
  activeAttemptSeq: number;
  activeAttemptId: string | null;
  queueJobId: string | null;
  draftId: string | null;
  finalArtifactRef: string | null;
  completionRecordRef: string | null;
  executionMode: 'normal' | 'salvage_only' | 'mutation_frozen';
  canonicalArtifactKind: 'LiveDraftArtifactBundle';
  canonicalCompletionMoment: 'run_completion_record_completed_at';
  timeBudgetMs: 120000;
  deadlineAt: string;
  createdAt: string;
  updatedAt: string;
};
```

storage location과 ownership은 아래처럼 고정한다.

| artifact | canonical storage location | durable write owner | storage rule |
| --- | --- | --- | --- |
| `NorthboundRunRequest` | control-plane DB `agent_run_requests` | Agent Backend | raw prompt 전문은 row에 inline 저장하지 않고 restricted object store `promptRef` 로 분리한다. |
| request bootstrap snapshot | control-plane DB `agent_run_snapshots` | Agent Backend | acceptance 당시 empty-canvas gate와 base revision을 immutable하게 남긴다. |
| `AgentRunRecord` | control-plane DB `agent_runs` | Agent Backend | `requestRef`, `requestSnapshotRef` 는 bootstrap stable ref이고, `finalArtifactRef`, `completionRecordRef` 는 terminal close에서만 전진하는 forward ref다. |

creation order는 아래처럼 고정한다.

1. ingress마다 `httpRequestId` 를 먼저 발급하고 auth, page 권한, empty-canvas gate를 검증한다.
2. dedupe scope는 `userId + editorSessionId + clientRequestId + scenarioKey + documentId + pageId` 로 계산한다.
3. dedupe hit가 active run에 매핑되면 새 `requestId`, 새 `runId`, 새 `traceId` 를 만들지 않고 기존 `runId + traceId` 를 재반환한다.
4. dedupe miss면 backend가 `requestId`, `snapshotId`, `runId`, `traceId`, `pageLockToken` 을 발급하고 `NorthboundRunRequest` 와 snapshot을 먼저 durable write 한다.
5. 그 다음 `AgentRunRecord(status=enqueue_pending)` 를 durable write 한다. 이 시점까지 `queueJobId` 는 `null` 이어야 하며 editor-visible mutation은 0건이어야 한다.
6. backend는 `attemptSeq=1`, `attemptId`, colon-free `queueJobId={runId}__attempt_01` 를 확정한 뒤 queue publish를 수행한다.
7. queue publish ack를 받은 뒤에만 `agent_run_attempts` 첫 row를 만들고 `AgentRunRecord.status=planning_queued` 및 `queueJobId` 를 기록한다.
8. `RunAccepted` 는 4-7 단계 durable write가 모두 끝난 뒤에만 반환한다. 따라서 accepted 응답은 `NorthboundRunRequest`, snapshot, `AgentRunRecord`, first-attempt correlation이 모두 존재함을 의미한다.

### 6.3 `GET /api/agent-workflow/runs/:runId/events`

v1 event stream은 SSE를 우선한다.

```ts
type CanvasLayerRef = {
  layerId?: string;
  clientLayerKey?: string;
  slotKey?: string;
};

type CanvasMutationCommand =
  | {
      commandId: string;
      op: 'createLayer';
      slotKey: string | null;
      clientLayerKey: string;
      targetRef: { layerId: null; clientLayerKey: string; slotKey?: string };
      targetLayerVersion: null;
      desiredLayerId?: string | null;
      parentRef: { layerId?: string; clientLayerKey?: string; position: string };
      expectedLayerType: 'group' | 'shape' | 'text' | 'image' | 'sticker' | 'unknown' | null;
      allowNoop: boolean;
      metadataTags: Record<string, string | number | boolean | null>;
      layerBlueprint: {
        layerType: 'group' | 'shape' | 'text' | 'image' | 'sticker';
        bounds: { x: number; y: number; width: number; height: number };
        transform?: Record<string, unknown>;
        styleTokens?: Record<string, unknown>;
        assetBinding?: { assetId: string; fitMode?: string } | null;
        textBindingRef?: string | null;
        metadata: Record<string, string | number | boolean | null>;
      };
      editable: boolean;
    }
  | {
      commandId: string;
      op: 'updateLayer';
      slotKey: string | null;
      clientLayerKey?: string | null;
      targetRef: CanvasLayerRef;
      targetLayerVersion: number;
      expectedLayerType: 'group' | 'shape' | 'text' | 'image' | 'sticker' | 'unknown' | null;
      allowNoop: boolean;
      metadataTags: Record<string, string | number | boolean | null>;
      patchMask: Array<'bounds' | 'transform' | 'styleTokens' | 'assetBinding' | 'metadata' | 'zOrder' | 'parentRef' | 'visibility'>;
      patch: Record<string, unknown>;
      ifMatch?: {
        expectedRevision?: number;
        expectedContentHash?: string;
        expectedAssetId?: string;
        expectedLayerType?: string;
      };
      preserveLayerId: true;
    }
  | {
      commandId: string;
      op: 'deleteLayer';
      slotKey: string | null;
      clientLayerKey?: string | null;
      targetRef: CanvasLayerRef;
      targetLayerVersion: number;
      expectedLayerType: 'group' | 'shape' | 'text' | 'image' | 'sticker' | 'unknown' | null;
      allowNoop: boolean;
      metadataTags: Record<string, string | number | boolean | null>;
      cascadeMode: 'delete_subtree' | 'reject_if_has_children';
      deleteReason: 'cleanup_placeholder' | 'replace_with_final' | 'rollback' | 'user_visible_trim' | 'compensation';
      tombstone: { keepTombstoneRecord: boolean; tombstoneKey: string };
    }
  | {
      commandId: string;
      op: 'saveTemplate';
      slotKey: null;
      clientLayerKey?: null;
      targetRef: { layerId?: string; clientLayerKey?: string; slotKey?: string };
      targetLayerVersion: null;
      allowNoop: boolean;
      metadataTags: Record<string, string | number | boolean | null>;
      reason: 'milestone_first_editable' | 'run_completed';
    };

type CanvasMutationEnvelope = {
  mutationId: string;
  mutationVersion: string;
  traceId: string;
  runId: string;
  draftId: string;
  documentId: string;
  pageId: string;
  seq: number;
  commitGroup: string;
  dependsOnSeq?: number | null;
  idempotencyKey: string;
  expectedBaseRevision: number;
  ownershipScope: 'draft_only' | 'draft_and_descendants';
  commands: CanvasMutationCommand[];
  rollbackHint: {
    rollbackGroupId: string;
    strategy: 'inverse_patch' | 'delete_created_layers' | 'restore_snapshot';
    restoreSnapshotRef?: string;
  };
  emittedAt: string;
  deliveryDeadlineAt: string;
};

type PublicRunEvent =
  | { type: 'run.accepted'; runId: string; traceId: string; at: string }
  | { type: 'run.phase'; runId: string; traceId: string; phase: 'queued' | 'planning' | 'executing' | 'applying' | 'saving'; message: string; at: string }
  | { type: 'run.log'; runId: string; traceId: string; level: 'info' | 'warn' | 'error'; message: string; at: string }
  | { type: 'canvas.mutation'; runId: string; traceId: string; draftId: string; pageId: string; seq: number; mutation: CanvasMutationEnvelope; at: string }
  | { type: 'run.cancel_requested'; runId: string; traceId: string; reason?: string; at: string }
  | { type: 'run.completed'; runId: string; traceId: string; result: AgentRunResultSummary; at: string }
  | { type: 'run.failed'; runId: string; traceId: string; error: { code: string; message: string; retryable: boolean }; at: string }
  | { type: 'run.cancelled'; runId: string; traceId: string; at: string };
```

추가 규칙은 아래와 같다.

- SSE event id는 append-only event log offset을 사용한다.
- FE는 `Last-Event-ID` 로 재연결할 수 있어야 한다.
- backend는 reconnect 시 아직 ack되지 않은 최신 mutation도 재전송할 수 있어야 한다.
- `run.completed` 는 full success와 partial success를 모두 담는 terminal event이며, 세부 outcome은 result summary가 구분한다.

### 6.4 `POST /api/agent-workflow/runs/:runId/mutation-acks`

worker가 후속 step을 안전하게 이어가려면 backend가 FE apply 결과를 canonical하게 보관해야 한다.

```ts
type MutationCommandResult = {
  commandId: string;
  op: 'createLayer' | 'updateLayer' | 'deleteLayer' | 'saveTemplate';
  status: 'applied' | 'noop_already_applied' | 'rejected';
  resolvedLayerId?: string;
  removedLayerIds?: string[];
  changedFields?: string[];
  targetLayerVersion?: number | null;
  resultingLayerVersion?: number | null;
  tombstoneKey?: string;
  contentHash?: string;
  error?: {
    code: string;
    message: string;
  };
};

type MutationApplyAckRequest = {
  runId: string;
  traceId: string;
  mutationId: string;
  seq: number;
  status: 'applied' | 'noop_already_applied' | 'rejected';
  partialApplyDetected?: boolean;
  targetPageId: string;
  baseRevision: number;
  resultingRevision?: number;
  resolvedLayerIds?: Record<string, string>;
  commandResults: MutationCommandResult[];
  error?: {
    code: string;
    message: string;
  };
  clientObservedAt: string;
};

type MutationApplyAckResponse = {
  accepted: boolean;
  runStatus:
    | 'planning_queued'
    | 'planning'
    | 'plan_ready'
    | 'executing'
    | 'awaiting_apply_ack'
    | 'saving'
    | 'finalizing'
    | 'cancel_requested'
    | 'completed'
    | 'completed_with_warning'
    | 'save_failed_after_apply'
    | 'failed'
    | 'cancelled';
  nextExpectedSeq: number;
};
```

`resolvedLayerIds` 는 FE 엔진이 worker가 제안한 stable layer id를 그대로 보존하지 못할 때만 사용한다. 기본 원칙은 worker/backend가 미리 발급한 layer id를 FE가 그대로 유지하는 것이다.

추가 규칙:

- `status=applied` 는 모든 command가 `applied` 또는 duplicate-safe `noop_already_applied` 일 때만 허용된다.
- duplicate delivery나 reconnect replay로 이미 같은 effect가 반영돼 있으면 FE는 새 side effect를 만들지 말고 `status=noop_already_applied` 로 응답해야 한다.
- 일부 command만 반영된 뒤 실패했다면 `status=rejected` + `partialApplyDetected=true` + `commandResults[]` 로 부분 적용 범위를 명시해야 한다.
- backend는 ack를 ledger에 기록할 때 `ack_outcome`, `command_results`, `resultingRevision` 과 per-layer evidence(`targetLayerVersion`, `resultingLayerVersion`, `tombstoneKey`, `contentHash`)를 함께 영속화해야 한다. 그래야 timeout 이후 reconciliation과 final-state projection이 blind replay 없이 가능하다.

### 6.5 `POST /api/agent-workflow/runs/:runId/cancel`

```ts
type CancelRunRequest = {
  traceId: string;
  reason?: 'user_stop' | 'navigation' | 'client_timeout';
};

type CancelRunResponse = {
  runId: string;
  status: 'cancel_requested';
  requestedAt: string;
};
```

cancel은 `best effort stop` 이다. backend는 즉시 응답하되, 실제 terminal state는 SSE의 `run.cancelled` 또는 `run.completed` 로 확정한다.

## 7. worker에 노출하는 southbound 계약

### 7.1 queue handoff

worker는 queue에서 `RunJobEnvelope` 를 받아 실행을 시작한다.

```ts
type RunJobEnvelope = {
  messageVersion: 'v1';
  runId: string;
  traceId: string;
  queueJobId: string;
  attempt: number;
  priority: 'interactive';
  requestRef: string;
  snapshotRef: string;
  deadlineAt: string;
  pageLockToken: string;
  cancelToken: string;
};
```

규칙은 아래와 같다.

- queue payload에는 거대한 canvas JSON을 직접 넣지 않는다.
- worker는 `requestRef`, `snapshotRef` 를 통해 hydrate한다.
- 재시도 시 `attempt` 만 증가하고 `runId` 는 유지한다.

#### 7.1.1 v1 queue topology

v1은 `한 개의 interactive run queue + 한 개의 worker pool` 로 시작한다. 중요한 점은 아래와 같다.

- public API와 worker 사이에는 반드시 durable queue handoff가 있어야 한다.
- retry는 별도 repair 시스템이 아니라 `같은 queue에 delayed re-enqueue` 하는 방식으로 처리한다.
- queue broker는 delivery, lease, delayed retry 같은 transport 책임만 가진다.
- backend는 run state, attempt state, cancel fence, retry budget, terminal 판정을 가진다.
- FE는 queue를 직접 보지 않고 backend SSE와 ack API만 사용한다.

구현 시 queue adapter는 generic broker가 아니라 `BullMQ` 로 고정한다. 즉, backend는 `Queue` producer와 `QueueEvents` subscriber를 소유하고, worker는 `Worker` consumer를 소유한다. BullMQ가 제공하는 `waiting`, `active`, `delayed`, `completed`, `failed` 상태와 `stalled` event는 transport layer 입력으로 사용하되, Tooldi의 canonical 계약은 아래의 attempt lifecycle로 정규화되어야 한다.

또한 BullMQ의 transport 기능과 Tooldi의 orchestration ownership이 충돌하지 않도록 아래 guardrail을 같이 고정한다.

- `jobId` 는 BullMQ 문서 제약대로 `:` 를 포함하지 않는 custom id를 사용한다. `queueJobId` 는 attempt마다 새로 발급되며 backend attempt row와 1:1로 매핑된다.
- BullMQ native retry/backoff는 user-visible retry owner가 될 수 없으므로 v1 job publish는 기본 `attempts=1` 로 고정한다. delayed retry가 필요하면 backend가 새 `attemptSeq` 와 새 `queueJobId` 로 다시 enqueue한다.
- `QueueEvents` 의 `active`, `completed`, `failed`, `stalled` 는 global transport signal일 뿐이다. backend는 `queueJobId` 가 현재 active attempt와 일치할 때만 이를 liveness/recovery 입력으로 사용한다.
- broker retention 또는 `removeOnComplete/removeOnFail` 같은 정리 정책은 운영 편의용일 뿐이다. canonical attempt/run history 삭제 근거가 되어서는 안 된다.

#### 7.1.2 enqueue / dequeue flow

1. backend는 request validation, page lock, snapshot persistence를 끝낸 뒤 `attempt=1` 인 `RunJobEnvelope` 를 만든다.
2. backend는 queue publish 성공이 확인된 후에만 run을 `queued` 로 유지하고 FE에 `RunAccepted` 를 반환한다.
3. queue broker는 job을 durable waiting set에 넣고, backend는 `queue.enqueued` 성격의 내부 event와 현재 `queueJobId` 매핑을 저장한다. BullMQ custom job id 제약상 이 값은 `run_20260402_0001__attempt_1` 같은 colon-free 포맷이어야 한다.
4. worker가 job을 dequeue하면 해당 attempt의 lease owner가 되고, 첫 heartbeat 또는 첫 phase append로 dequeue 사실을 backend에 증명한다.
5. worker는 `requestRef`, `snapshotRef` 로 hydrate한 뒤 planning/execution을 진행한다.
6. worker가 mutation proposal을 append하면 backend가 canonical `seq` 를 발급하고 FE로 fan-out 한다.
7. FE ack는 backend의 canonical ack/reconcile state에 먼저 확정되고, worker는 그 canonical ack를 읽은 뒤 다음 step으로 진행한다.
8. worker finalize 또는 backend recovery rule이 terminal outcome을 만들면 backend가 run을 닫고 page lock과 queue ownership을 해제한다.

즉, `enqueue 성공 전 accepted 응답 금지`, `dequeue 후 첫 heartbeat 전 실행 소유권 미인정`, `FE ack 전 다음 mutation chaining 금지` 가 v1 queue boundary의 핵심 규칙이다.

#### 7.1.3 canonical job lifecycle states

queue-native 상태와 Tooldi attempt 상태는 분리해서 봐야 한다.

| Tooldi attempt 상태 | 일반 queue 상태 예시 | 주 소유자 | 의미 |
| --- | --- | --- | --- |
| `enqueue_pending` | 없음 | backend | publish 시도 중이며 아직 durable handoff 전 |
| `enqueued` | `waiting` | backend + queue | queue에 안전하게 들어갔고 pickup 대기 중 |
| `dequeued` | `active` | worker | worker가 lease를 잡았고 첫 heartbeat grace window 안 |
| `hydrating` | `active` | worker | request/snapshot/guardrail 복원 중 |
| `running` | `active` | worker | planning, tool call, mutation 계산 수행 중 |
| `awaiting_ack` | `active` | backend + worker | 마지막 mutation의 FE apply ack를 기다리는 중 |
| `retry_waiting` | `delayed` 또는 `waiting` | backend | 다음 attempt가 예약됐고 새 worker pickup 대기 중 |
| `finalizing` | `active` | worker | 저장 확인, layer diff 요약, finalize 제출 중 |
| `succeeded` | `completed` | backend | 해당 attempt 성공 종료 |
| `failed` | `failed` | backend | 해당 attempt 실패 종료 |
| `cancel_requested` | `waiting`/`active`/`delayed` 위 fence | backend | 새 work 금지, cooperative stop 진행 중 |
| `cancelled` | 제거 또는 종료 후 terminal | backend | run 전체가 취소로 확정됨 |

추가 규칙:

- `stalled` 는 durable state가 아니라 `active` attempt가 lease를 잃었음을 알리는 event다.
- queue adapter가 다른 구현으로 바뀌어도 위 canonical attempt 상태와 의미는 유지되어야 한다.
- backend run state는 attempt state를 그대로 노출하지 않는다. 다만 retry, cancel, recovery 판단은 attempt state를 canonical source로 사용한다.

#### 7.1.4 retry ownership과 시도 규칙

retry ownership은 backend에 있다.

- worker는 실패를 `retryable=true|false` 와 함께 보고하고, 필요하면 `resumeFromSeq` 같은 recovery 힌트만 제공한다.
- backend만 `attempt+1` 을 발급하고 queue 재등록을 수행할 수 있다.
- queue broker의 자동 redelivery나 stall recovery가 있더라도 backend는 이를 보이지 않는 내부 retry로 취급하지 않는다. 모든 재실행은 명시적인 새 attempt row로 기록해야 한다.
- BullMQ built-in retry를 켜더라도 backend attempt row 없이 재실행되는 hidden retry는 허용하지 않는다. v1에서는 queue-native retry 자체를 비활성화하고, retry는 항상 backend 재enqueue로만 연다.

v1 기본 규칙은 아래와 같다.

- run당 queue attempt는 기본 `최대 2회` 로 제한한다. 즉, initial attempt 1회 + delayed retry 1회다.
- retry backoff는 `1~3초 수준의 짧은 fixed delay` 를 사용한다. 120초 interactive SLA 안에서는 긴 exponential backoff를 허용하지 않는다.
- retry는 `deadlineAt` 여유가 남고, cancel이 걸리지 않았고, page lock이 아직 유효하고, failure가 retryable로 분류된 경우에만 열린다.
- retry는 `같은 runId` 를 유지한 채 진행한다. 새 사용자-visible run을 만들지 않는다.
- retry는 backend의 append-only mutation chain과 마지막 ack revision을 기준으로 이어서 수행한다. 이미 ack된 mutation을 무조건 처음부터 다시 적용하는 full restart는 금지한다.

#### 7.1.5 cancellation ownership과 stop protocol

cancel ownership도 backend에 있다.

| concern | owner | v1 규칙 |
| --- | --- | --- |
| cancel 의도 접수 | backend | `POST /cancel` 수신 즉시 `cancel_requested` 를 기록하고 `run.cancel_requested` event를 발행한다. |
| queued/delayed job 제거 | backend | 아직 dequeue되지 않은 attempt는 queue adapter를 통해 제거 또는 무효화할 수 있다. |
| active attempt 정지 | worker | active job은 queue만으로 강제 종료를 보장하지 않는다. worker가 cancel token/heartbeat 응답을 보고 cooperative stop 해야 한다. |
| 새 mutation fence | backend | cancel 이후 backend는 새 user-visible mutation proposal을 막고, cleanup/finalize 성격 event만 허용한다. |
| 현재 rollback group 정리 | worker | 이미 시작된 현재 group의 placeholder cleanup 또는 compensation만 허용한다. 새 draft 확장은 금지한다. |
| terminal cancel 판정 | backend | worker finalize, lease loss timeout, cleanup 완료 여부를 종합해 `cancelled` 로 닫는다. |

즉, v1 cancel은 `best effort stop` 이지만 ownership은 분명해야 한다. FE는 cancel intent를 보내고, backend는 work fence를 세우며, worker는 안전 지점에서 멈춘다.

#### 7.1.6 failure handoff rules

실패가 어디서 발생했는지에 따라 다음 ownership이 달라진다.

| 실패 지점 | 최초 감지 주체 | 즉시 handoff | 다음 owner / 결과 |
| --- | --- | --- | --- |
| queue publish 실패 또는 ack timeout | backend | worker handoff 없음 | backend가 `enqueue_timeout` 또는 `queue_publish_failed` 로 즉시 실패 처리한다. canvas mutation은 시작하지 않는다. |
| enqueue 후 pickup 없음 | backend | queue 상태와 deadline 검사 | 남은 예산이 있으면 backend가 동일 run의 새 attempt를 1회 재등록할 수 있고, 아니면 `worker_pickup_timeout` 으로 종료한다. |
| hydrate 실패 (`requestRef`/`snapshotRef` 손상) | worker | non-retryable error append | backend가 terminal `failed` 로 닫는다. |
| worker crash/stall, 첫 FE ack 이전 | queue event + backend watchdog | attempt failure 기록 | user-visible side effect가 없으므로 backend가 full retry attempt를 열 수 있다. |
| worker crash/stall, FE ack 이후 | queue event + backend watchdog | ack/reconcile evidence 기준 recovery mode 진입 | backend는 blind restart를 금지하고, `resume from last ack` 가 가능한 경우에만 retry를 열며, 아니면 현재 rollback group cleanup 후 `completed_with_warning`, `save_failed_after_apply`, `failed` 중 하나로 넘긴다. |
| FE mutation reject | backend | rejection을 worker에 노출 | worker가 같은 attempt 안에서 fallback mutation 또는 cleanup을 수행한다. 필수 mutation이 끝내 성립하지 않으면 backend가 partial/failure로 종료한다. |
| cancel 중 active provider call 잔존 | backend + worker | cancel fence 유지 | worker는 call 종료 후 새 action 시작 없이 cleanup/finalize만 수행한다. |
| final save ack는 있으나 worker finalize 유실 | backend watchdog | finalize grace timeout 후 recovery rule 적용 | backend는 append-only mutation chain, committed bundle, save evidence로 outcome을 복원할 수 있으면 `completed` 또는 `completed_with_warning` 으로 닫고, 그렇지 않으면 `save_failed_after_apply` 또는 `failed` 로 닫는다. |

#### 7.1.7 rollback / compensation canonical policy

rollback ownership은 backend에 있다.

- worker는 `rollbackGroupId`, `compensatesMutationId`, `resumeFromSeq`, `preferredRollbackScope` 같은 recovery hint를 제안할 수 있다.
- FE는 checkpoint revert나 compensation command를 실제로 실행할 수 있지만, `무엇을 어느 범위까지 되돌릴지` 의 canonical 판정은 backend가 한다.
- backend는 `latest committed bundle/save metadata`, `last acked seq`, `open rollback group`, `cancel fence`, `deadline` 을 함께 보고 recovery scope를 고정해야 한다.

v1 rollback scope는 아래처럼 고정한다.

| rollback case | backend 판정 | FE/worker에 허용하는 action | durable outcome |
| --- | --- | --- | --- |
| 첫 visible ack 이전 실패 | full run rollback | queue attempt 폐기 또는 no-op cleanup | run 기록만 남고 editor durable state는 run 시작 전 상태 유지 |
| visible ack 이후, milestone save 이전 실패/취소 | full run rollback to start checkpoint | run-owned mutation 전체 compensation 또는 FE checkpoint revert | durable draft는 남지 않고, run 시작 전 저장 상태가 canonical |
| milestone save 이후 open group 실패/취소 | group-local rollback | 현재 `rollbackGroupId` 의 mutation/delete/update compensation만 허용 | latest milestone save receipt가 가리키는 editable draft가 canonical |
| latest visible revision save 실패 | rollback to latest saved revision 우선 시도 | latest save 이후 tail mutation compensation, save/finalize만 허용 | latest saved editable draft가 canonical. tail 불일치가 남으면 `save_failed_after_apply` |

##### 7.1.7.1 rollback trigger matrix

backend는 아래 trigger를 canonical rollback entry point로 취급한다.

| trigger | detection input | backend 기본 scope | implementation note |
| --- | --- | --- | --- |
| first visible ack 이전 fatal error | queue failure, worker fatal, plan/execution abort | `full run rollback` | user-visible side effect가 없거나 증명되지 않았으므로 checkpoint 복원이 기본이다. |
| open group mutation reject / ack timeout / `unknown_apply_state` | FE ack, long-poll timeout, reconciliation query | `group-local rollback` | authoritative ack가 없으면 replay 전에 reconciliation snapshot을 먼저 만든다. |
| cancel request | `POST /cancel`, cancel fence persisted | `group-local rollback` 또는 `latest saved revision preserve` | cancel 이후엔 cleanup, compensation, save, finalize 외 action을 거부한다. |
| final save failure / saved revision mismatch | save ack reject, receipt timeout, finalizer mismatch | `rollback to latest saved revision` | latest visible revision이 아닌 latest durable revision이 canonical base다. |
| worker crash/stall after ack | QueueEvents stalled/failed + watchdog | `resume from last ack` 또는 `group-local rollback` | blind full restart는 금지하고, resume 불가일 때만 rollback으로 수렴한다. |
| deadline fence (`T+105`, `T+120`) | backend deadline controller | `latest saved revision preserve` 또는 `run 시작 checkpoint 복귀` | hard deadline에서는 draft 확장 대신 tail cleanup과 terminal close가 우선이다. 저장본이 있으면 latest saved revision을 보존하고, 없으면 run 시작 checkpoint로 복귀한다. |

##### 7.1.7.2 rollback execution order

backend는 rollback을 아래 순서대로 지휘해야 한다.

1. rollback trigger를 decision event로 append하고, 해당 run에 새 user-visible mutation fence를 건다.
2. `latest committed bundle/save metadata`, `savedRevision`, `lastAckedSeq`, `open rollbackGroupId`, `pending mutation rows`, `cancel fence`, `deadline` 을 읽어 decision snapshot을 고정한다.
3. decision snapshot을 기준으로 `full run rollback`, `group-local rollback`, `rollback to latest saved revision` 중 하나를 확정한다.
4. worker 또는 FE executor에 compensation/checkpoint revert를 지시하되, compensation 순서는 `seq` 역순을 기본으로 한다.
5. 각 compensation 실행 결과를 append-only `agent_canvas_mutation_events` 에 별도 compensation row로 append하고, `compensatesMutationId` 와 `rollback_group_id` 로 원본 mutation과 연결한다. committed `LiveDraftArtifactBundle.mutationLedger` 는 이 append chain을 reconciliation한 projection이어야 한다.
6. compensation 이후 실제 canvas revision이 target revision과 맞는지 확인한다. 맞지 않으면 추가 user-visible draft mutation 없이 reconciliation, compensation, save/finalize만 허용한다.
7. pending mutation/save가 모두 닫히고 terminal `RunCompletionRecord` 또는 동일 completion chain의 failure evidence가 기록된 뒤에만 page lock 해제와 terminal status 확정을 허용한다.

##### 7.1.7.3 compensating action mapping

backend가 허용하는 canonical compensating action은 아래로 제한한다.

| forward action | required rollback payload | compensating action | backend validation 포인트 |
| --- | --- | --- | --- |
| `createLayer` | `layerId`, `clientLayerKey`, ownership metadata | `deleteLayer` | agent-owned layer인지, 이미 다른 run/user가 수정하지 않았는지 확인해야 한다. |
| `updateLayer` | inverse patch 또는 pre-update snapshot, `layerId` | prior state를 복원하는 `updateLayer` | 같은 `layerId` 유지가 필수다. delete+recreate는 invalid compensation이다. |
| `deleteLayer` | tombstone snapshot, parent/z-order, metadata | tombstone 기반 `createLayer` 후 필요 시 restore `updateLayer` | tombstone이 없으면 auto compensation 불가로 판정하고 escalation 또는 terminal fail 후보가 된다. |
| asset attach/replace | previous asset ref, placeholder state | 이전 asset ref 복원 또는 failed tail layer 삭제 | detached asset은 orphan ref로 남기고 GC 후보로 표기해야 한다. |
| `saveTemplate` | prior successful save receipt | save rollback이 아니라 prior saved revision preserve | failed save를 새 canonical base로 채택하면 안 된다. |

##### 7.1.7.4 post-rollback closure requirements

backend는 아래 조건이 만족되기 전까지 rollback 완료로 판정하면 안 된다.

- `agent_canvas_mutation_events` append chain과 그로부터 materialize된 `MutationLedger` 기준으로 unreconciled open mutation이 없어야 한다.
- canonical user-visible state가 `run 시작 checkpoint` 또는 `latest saved revision` 중 하나로 설명 가능해야 한다.
- preserve 경로라면 latest committed `LiveDraftArtifactBundle.saveMetadata.latestSaveReceipt.savedRevision` 과 retained `savedRevision` 이 일치해야 한다.
- full rollback 경로라면 `agent_runs.final_artifact_ref` 가 끝까지 `null` 이거나, terminal `RunCompletionRecord.durabilityState='no_saved_draft'` 로 durable draft 부재가 명시돼야 한다.
- orphan asset ref, cleanup pending 여부, unresolved mismatch 여부가 terminal `RunCompletionRecord` 또는 동일 completion chain의 error summary에 포함돼야 한다.
- rollback decision event, compensated seq range, `compensatesMutationId`, terminal outcome reason이 append-only audit record에 남아야 한다.

추가 규칙은 아래와 같다.

1. backend는 milestone save 이후 `전체 run 자동 revert` 를 선택하지 않는다. 이 구간의 기본 정책은 `latest saved editable draft preserve` 다.
2. backend는 `runId`, `draftId` 메타데이터가 없는 layer를 auto-rollback 대상으로 판정하지 않는다.
3. backend는 rollback 중 새 draft 확장 mutation을 열지 않는다. cleanup, compensation, save, finalize만 허용한다.
4. backend는 compensation 성공 여부와 무관하게 이미 append된 `agent_canvas_mutation_events` row를 삭제하지 않는다. reconciliation outcome은 `MutationLedger` projection과 terminal completion evidence에 `compensated`, `compensation_failed`, `rolled_back_to_checkpoint`, `preserved_as_durable_base` 같은 결과로 누적 표기한다.
5. backend는 latest saved revision으로 수렴하지 못한 채 종료할 때만 `save_failed_after_apply` 를 허용한다. 그 외에는 `completed_with_warning`, `cancelled`, `failed` 중 하나로 정리해야 한다.

### 7.2 worker callback surface

v1에서 worker는 queue consumer인 동시에 backend internal API consumer다.

| API | Method | 목적 | 처리 성격 |
| --- | --- | --- | --- |
| `/internal/agent-workflow/runs/:runId/heartbeats` | `POST` | attempt 생존 신호와 현재 단계 보고 | Sync |
| `/internal/agent-workflow/runs/:runId/events` | `POST` | phase/log/tool/result/mutation proposal append | Sync append |
| `/internal/agent-workflow/runs/:runId/mutations/:mutationId/acks` | `GET` | 특정 mutation의 FE apply 결과 대기/조회 | Sync long-poll |
| `/internal/agent-workflow/runs/:runId/finalize` | `POST` | 최종 상태와 요약 제출 | Sync |

### 7.2.1 `/internal/.../heartbeats`

heartbeat는 단순 생존 ping이 아니라 `현재 어떤 attempt가 queue lease를 잡고 있고 어디까지 진행했는지` 를 backend가 canonical하게 판단하는 입력이다.

```ts
type WorkerHeartbeatRequest = {
  traceId: string;
  attempt: number;
  queueJobId: string;
  workerId: string;
  attemptState: 'dequeued' | 'hydrating' | 'running' | 'awaiting_ack' | 'finalizing';
  phase?: 'planning' | 'executing' | 'applying' | 'saving';
  activeActionId?: string;
  lastAssignedSeq?: number;
  lastAckedSeq?: number;
  resumeFromSeq?: number;
  heartbeatAt: string;
};

type WorkerHeartbeatResponse = {
  accepted: boolean;
  cancelRequested: boolean;
  stopAfterCurrentAction: boolean;
  runStatus:
    | 'planning_queued'
    | 'planning'
    | 'plan_ready'
    | 'executing'
    | 'awaiting_apply_ack'
    | 'saving'
    | 'finalizing'
    | 'cancel_requested'
    | 'completed'
    | 'completed_with_warning'
    | 'save_failed_after_apply'
    | 'failed'
    | 'cancelled';
  deadlineAt: string;
};
```

추가 규칙은 아래와 같다.

- `enqueued -> dequeued` 전이는 QueueEvents만으로 확정하지 않는다. 해당 `queueJobId` 의 첫 유효 heartbeat 또는 첫 phase append가 들어와야 attempt lease owner를 worker로 인정한다.
- backend는 `runId + attempt + queueJobId` 가 현재 active attempt와 일치할 때만 `last_heartbeat_at` 을 갱신한다. stale attempt나 이미 terminal 처리된 attempt heartbeat는 무시하거나 `409` 로 거절한다.
- `cancelRequested=true` 또는 `stopAfterCurrentAction=true` 를 받은 worker는 새 user-visible mutation group을 시작하면 안 된다. 이미 시작한 현재 action의 cleanup/finalize만 허용된다.
- heartbeat는 liveness와 resume 단서만 제공한다. terminal 판정, retry budget 소모, page lock 해제는 heartbeat handler가 아니라 backend orchestration rule이 수행한다.

### 7.3 `/internal/.../events` payload

```ts
type WorkerAppendEventRequest = {
  traceId: string;
  attempt: number;
  event:
    | { type: 'phase'; phase: 'planning' | 'executing' | 'applying' | 'saving'; message: string }
    | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
    | {
        type: 'mutation.proposed';
        mutationId: string;
        dependsOnSeq?: number;
        rollbackGroupId: string;
        expectedBaseRevision?: number;
        mutation: CanvasMutationEnvelope;
      }
    | {
        type: 'tool.result';
        toolName: string;
        durationMs: number;
        status: 'succeeded' | 'failed';
        retryable: boolean;
        usage?: {
          meteringClass: 'provider_actual' | 'provider_units_estimated' | 'internal_metered_unpriced' | 'nonbillable';
          costState: 'estimated' | 'final' | 'unpriced' | 'unknown';
          pricingVersion?: string;
          invocationCount: number;
          inputTokens?: number;
          outputTokens?: number;
          cachedInputTokens?: number;
          reasoningTokens?: number;
          generatedImageCount?: number;
          generatedImagePixels?: number;
          inputBytes?: number;
          outputBytes?: number;
          usd?: number | null;
        };
      };
};

type WorkerAppendEventResponse = {
  accepted: boolean;
  assignedSeq?: number;
  cancelRequested: boolean;
};
```

`mutation.proposed` 에서 중요한 점은 아래와 같다.

- worker는 mutation 내용을 제안하지만 canonical `seq` 는 backend가 배정한다.
- backend는 제안된 mutation을 event log와 append-only mutation row에 먼저 저장한 뒤 FE로 stream 한다.
- worker는 `assignedSeq` 를 받은 후 필요하면 ack 대기 endpoint를 호출한다.

### 7.4 `/internal/.../mutations/:mutationId/acks`

이 endpoint는 worker가 특정 mutation의 FE 적용 결과를 기다릴 때 사용한다.

```ts
type WaitMutationAckResponse = {
  found: boolean;
  status: 'dispatched' | 'acked' | 'rejected' | 'cancelled' | 'timed_out';
  seq?: number;
  resultingRevision?: number;
  resolvedLayerIds?: Record<string, string>;
  error?: {
    code: string;
    message: string;
  };
};
```

v1에서는 `waitMs=15000` 정도의 long-poll query param을 허용하는 단순 방식으로 시작한다. 이 경로는 second queue를 추가하지 않으면서도 `create -> ack -> update/delete` chaining을 가능하게 한다.

### 7.5 `/internal/.../finalize`

```ts
type RunFinalizeRequest = {
  traceId: string;
  attempt: number;
  queueJobId: string;
  finalStatus: 'completed' | 'completed_with_warning' | 'save_failed_after_apply' | 'failed' | 'cancelled';
  finalRevision?: string;
  lastAckedSeq: number;
  latestSaveReceiptId?: string;
  createdLayerIds: string[];
  updatedLayerIds: string[];
  deletedLayerIds: string[];
  fallbackCount: number;
  errorSummary?: {
    code: string;
    message: string;
  };
  costSummary?: {
    costState: 'estimated' | 'final' | 'mixed' | 'unknown';
    pricingVersion: string;
    toolCallCount: number;
    modelCallCount: number;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    reasoningTokens: number;
    generatedImageCount: number;
    generatedImagePixels: number;
    billableExternalUsd: number;
    recoveryOverheadUsd: number;
    internalUnpricedToolCalls: number;
    attemptBreakdown: Array<{
      attemptSeq: number;
      queueJobId: string;
      usd: number;
      toolCallCount: number;
    }>;
  };
};
```

worker는 run row를 직접 terminal state로 바꾸지 않는다. terminal 판정과 lock 해제는 backend만 수행한다.

추가 규칙:

- backend는 `attempt + queueJobId` 가 현재 active attempt와 일치하는 finalize만 유효하게 받는다. 이전 attempt의 늦은 finalize는 audit event로만 남기고 terminal 판정에는 사용하지 않는다.
- `lastAckedSeq` 와 `latestSaveReceiptId` 는 backend finalizer가 blind success 판정을 하지 않도록 강제하는 최소 안전장치다.

## 8. 상태, 로깅, 저장소 경계

### 8.1 저장 경계 원칙

v1은 실행 데이터를 아무 저장소에나 흩뿌리지 않고 아래 6개 경계로 고정한다.

| 저장 경계 | owner | 저장 대상 | 쓰기 규칙 | 읽기 규칙 |
| --- | --- | --- | --- | --- |
| Agent Backend control-plane DB | Agent Backend | run 상태, attempt 상태, append-only mutation row, cancel fence, final artifact/completion ref, cost summary ref | durable canonical row는 backend만 쓴다. FE와 worker는 payload를 제출할 수 있지만 DB row를 직접 쓰지 않는다. | FE/worker/ops는 backend API 또는 내부 query layer를 통해 읽는다. |
| Agent Backend event/log store | Agent Backend | append-only run timeline, worker phase/log, mutation proposal event, ack event, finalize event | event append는 backend만 수행한다. worker/FE는 event producer일 뿐이다. | SSE fan-out, recovery 조사, 운영 감사는 이 저장소를 기준으로 한다. |
| Request/Snapshot/Object store | Agent Backend | raw request, normalized request, editor snapshot, validated plan payload, final layer diff summary 같은 큰 JSON artifact | bootstrap/plan finalize 시 backend가 ref를 만들고 저장한다. queue에는 ref만 실린다. | worker hydrate/resume, backend recovery, 운영 감사가 ref로 조회한다. |
| Existing editor/template store | toolditor FE + 기존 저장 경로 | 실제 page revision, layer tree, working template 저장 결과 | backend/worker는 직접 쓰지 않는다. FE의 기존 command/save path만 쓴다. | 사용자-visible truth는 여기서 읽는다. backend는 ack/save receipt를 통해 간접적으로만 반영 여부를 안다. |
| Existing asset storage | Tooldi asset/storage boundary | 생성/업로드 자산의 binary와 metadata | asset adapter가 stable asset ref를 만든 뒤 저장한다. binary를 control-plane DB/event log에 넣지 않는다. | FE renderer, worker follow-up action, ops가 asset ref 기준으로 조회한다. |
| Queue broker | Queue adapter | job delivery, lease, delayed retry transport state | transport metadata만 저장한다. canonical audit row를 대신하지 않는다. | backend watchdog와 worker가 pickup/retry에만 사용한다. |

핵심 규칙은 아래와 같다.

- queue broker의 native 상태는 운영 힌트일 뿐 canonical audit source가 아니다.
- editor/template store는 실제 화면 결과의 source of truth이지만, run orchestration의 canonical truth는 backend control-plane DB + event/log store다.
- worker는 local cache를 가질 수 있어도 canonical run state를 직접 영속화하지 않는다.
- FE local undo/redo, reconnect cursor, panel state는 사용자 경험용 local state일 뿐 audit 대상 저장소가 아니다.
- OTLP/metrics/log aggregation 같은 operational telemetry sink는 둘 수 있지만, redacted attribute만 보내는 best-effort 관측면일 뿐 canonical audit storage boundary로 승격하지 않는다.

### 8.2 persisted record ownership matrix

아래 표는 v1에서 반드시 남겨야 하는 실행 데이터를 `무엇을 저장하는지`, `누가 durable write owner인지`, `어느 컴포넌트가 주로 읽는지` 기준으로 고정한다.

| durable record | persisted data | durable write owner | producer component | main readers | retrieval / audit expectation |
| --- | --- | --- | --- | --- | --- |
| `agent_runs` | `run_id`, `trace_id`, `request_id`, `snapshot_id`, status, status reason, page lock, deadline, last acked seq, latest save refs, `final_artifact_ref`, `completion_record_ref`, terminal outcome, canonical artifact/completion 기준 | Agent Backend | FE start request, worker phase/finalize, backend watchdog | FE summary API/SSE, worker recovery, ops | `run_id`, `trace_id`, `request_id`, `document_id+page_id`, `user_id+started_at` 기준 조회 가능해야 한다. terminal 이후에도 남아야 한다. |
| `agent_run_attempts` | attempt seq, `trace_id`, queue job id, accepted HTTP request id, worker id, heartbeat, lease, retry budget, cancel/stop markers | Agent Backend | backend enqueue/retry, worker heartbeat, backend watchdog | worker resume, backend recovery, ops | queue transport가 사라져도 attempt 이력만으로 pickup/retry/cancel 경과를 재구성할 수 있어야 한다. `queue_job_id -> run_id -> trace_id` join이 가능해야 한다. |
| `agent_run_requests` | `request_id`, `client_request_id`, `run_id`, `trace_id`, raw prompt ref/hash, normalized prompt, redacted preview, locale/timezone, FE surface, brand/reference asset input, redaction policy version, accepted HTTP request id, dedupe disposition | Agent Backend | FE | worker hydrate, ops, policy audit | raw와 normalized를 둘 다 보관해야 하며, prompt가 어떻게 해석됐는지 나중에 비교 가능해야 한다. secondary log/event는 redacted preview와 hash만 사용해야 한다. |
| `agent_run_snapshots` | document/page id, empty-canvas gate 결과, base revision, size, selected layer ids, run policy snapshot | Agent Backend | FE payload + backend bootstrap validation | worker hydrate/resume, ops | run 시작 시점의 편집기 조건을 증빙해야 한다. 이후 캔버스가 바뀌어도 원 snapshot은 immutable ref로 남아야 한다. |
| `agent_run_events` | accepted, phase, log, mutation proposed, ack observed, cancel requested, finalized event stream, `trace_id`, originating `http_request_id` | Agent Backend | backend, worker, FE ack path | FE SSE, ops, backend recovery | append-only여야 하며 monotonic event offset을 가져야 한다. `Last-Event-ID` 재연결과 운영 감사 둘 다 이 offset을 사용한다. |
| `agent_plans` | intent, constraint pack ref, validated plan payload, schema version, plan version, validation outcome | Agent Backend | worker planner output | worker execution/resume, ops, QA | latest validated plan을 빠르게 조회할 수 있어야 하며, plan version은 immutable하게 남아야 한다. |
| `agent_tool_calls` | action/tool invocation envelope, `trace_id`, `span_id`, attempt no, prompt log ref, redacted input/output ref, result status, error class/code, usage/cost, emitted mutation/save ids, provider request ref metadata | Agent Backend | worker execution runtime | worker reconciliation, backend final summary, ops | idempotency/retry 판단에 필요하므로 `run_id + action_id` 와 `tool_call_id` 로 조회 가능해야 한다. provider auth secret, CoT, full binary/body는 저장하지 않는다. |
| `agent_canvas_mutation_events` | mutation/save/compensation emission seq, `trace_id`, plan step linkage, base revision, ack/reconcile evidence linkage, command payload, resolved layer ids, compensation back-reference | Agent Backend | worker proposal, FE ack, backend timeout/cancel recovery | worker chaining/recovery, backend finalizer, ops, QA | live-commit 감사의 append-only source log다. `run_id + seq` 순서 재생과 `mutation_id` 단건 조회가 모두 가능해야 하며, committed bundle의 `MutationLedger` 는 이 row들의 projection이어야 한다. |
| `agent_live_draft_bundles` | bundle id, draft id, editable canvas payload, slot bindings, root/editable layer ids, referenced stored assets, mutation ledger projection, latest save receipt, completion snapshot | Agent Backend | worker finalization payload + backend bundle commit | FE completion summary/hydrate, worker future update/delete seed, ops | 사용자가 실제로 무엇을 얻게 되었는지 보여주는 canonical draft artifact row다. 별도 `agent_drafts` row를 source of truth로 두지 않는다. |
| `agent_run_completions` | completion id, bundle id, terminal status, durability state, final revision, latest save receipt id, warning/fallback summary, final error/cancel reason, authoritative final canvas state ref, `completed_at` | Agent Backend | worker finalize payload + backend terminalization | FE result panel, ops, QA, audit | terminal close row다. `RunCompletionRecord.completedAt` 은 downstream bookkeeping/status close timestamp일 뿐 canonical counted completion moment가 아니다. canonical completion moment는 architecture 문서의 `completion_sla_definition` 이 정의한 `RunCompletionRecord.draftGeneratedAt` 하나이며, completion row는 committed bundle을 가리킬 때만 존재할 수 있다. |
| `agent_cost_summaries` | model/provider/tool별 usage, total usd, attempt-level cost rollup | Agent Backend | worker finalize + backend rollup | ops, finance/analytics, backend final summary | run 단위 cost visibility를 day one부터 제공해야 하며, terminal run과 join 가능해야 한다. |

중요한 ownership 규칙은 아래와 같다.

- `durable write owner` 는 항상 Agent Backend다. worker나 FE가 직접 control-plane table을 갱신하지 않는다.
- worker는 planner/executor 결과를 backend internal surface로 제출하고, backend가 canonical row/event로 변환해 저장한다.
- FE는 mutation apply/save 결과를 제출하지만, canonical ledger/save receipt 반영은 backend가 수행한다.
- binary asset 자체는 execution audit record가 아니라 existing asset storage의 소유물이다. control-plane에는 stable ref와 metadata만 남긴다.

#### 8.2.1 prompt log contract

v1 prompt observability는 `user-authored prompt provenance` 와 `model-facing rendered prompt` 를 분리해 저장해야 한다.

- `agent_run_requests` 는 사용자가 실제로 입력한 원문 prompt의 canonical owner다.
- planner, copywriter, image prompt builder 같은 model-backed 실행은 별도 `PromptLogArtifact` 를 restricted object store에 저장하고, `agent_tool_calls.prompt_log_ref` 로 연결한다.
- `agent_run_events` 와 일반 운영 로그에는 full prompt를 싣지 않는다. redacted preview와 hash만 허용한다.

`PromptLogArtifact` 는 최소 아래 필드를 가져야 한다.

| field | requirement |
| --- | --- |
| `prompt_log_id` | prompt artifact 자체 식별자 |
| `runId`, `traceId`, `attemptSeq` | run/attempt join key |
| `phase` | `planning`, `copywriting`, `asset_prompting`, `fallback_replan` 같은 실행 구간 |
| `source_kind` | `user_raw`, `normalized_user`, `planner_rendered`, `tool_rendered`, `provider_structured_response` |
| `requestId`, `planId`, `actionId`, `toolCallId` | 상위 계약 back-reference |
| `template_id`, `template_version` | 어떤 prompt recipe가 쓰였는지 식별 |
| `model_provider`, `model_name` | 실제 provider/model 식별 |
| `redacted_preview` | 운영 UI와 일반 로그에서 보는 짧은 preview |
| `prompt_hash` | prompt provenance와 dedupe 조사에 쓰는 hash |
| `payload_ref` | redacted full prompt payload가 저장된 restricted object ref |
| `response_ref` | structured output 또는 redacted provider response ref |
| `startedAt`, `finishedAt`, `latency_ms` | 시간 추적 |
| `input_tokens`, `output_tokens`, `estimated_usd` | 비용 추적 |
| `redaction_policy_version`, `contains_user_text`, `contains_pii` | privacy 판정 근거 |

prompt 저장 경계 규칙은 아래처럼 고정한다.

- raw user prompt는 `agent_run_requests` 에 1회만 durable 저장하고, secondary log/event/SSE에는 `redacted_preview + prompt_hash` 만 복제한다.
- queue payload에는 prompt 전문을 다시 싣지 않고 `request_ref`, `plan_ref`, 필요 시 `prompt_log_ref` 만 전달한다.
- planner scratchpad, chain-of-thought, speculative intermediate prompt 재료는 prompt artifact에 저장하지 않는다.
- full prompt artifact는 FE projection이나 기본 ops dashboard에서 직접 읽지 않는다. role-gated backend query를 통해서만 접근한다.

#### 8.2.2 tool execution log contract

`agent_tool_calls` 는 tool execution audit의 canonical metadata row다. row 자체에는 join, retry, 비용, rollback 판정에 필요한 핵심 정보만 두고, 큰 request/response body는 ref로 분리해야 한다.

`agent_tool_calls` 는 최소 아래 필드를 가져야 한다.

| field | requirement |
| --- | --- |
| `toolCallId` | tool attempt 식별자 |
| `runId`, `traceId`, `spanId` | audit와 telemetry correlation key |
| `attemptSeq`, `queueJobId`, `worker_id` | queue/worker 실행 경계 추적 |
| `planId`, `actionId` | 어떤 validated plan action의 실행인지 식별 |
| `toolName`, `toolVersion`, `tool_kind` | canonical tool 계약 식별 |
| `status`, `retryable`, `error_class`, `error_code` | retry/fail 판정 |
| `prompt_log_ref` | model-backed tool이면 연결되는 prompt artifact ref |
| `inputRef`, `outputRef` | redacted input/output payload ref |
| `provider_request_ref`, `provider_job_ref` | provider 측 correlation metadata |
| `startedAt`, `finishedAt`, `latency_ms` | wall-clock 추적 |
| `input_tokens`, `output_tokens`, `cached_input_tokens`, `reasoning_tokens`, `generated_image_count`, `generated_image_pixels`, `estimated_usd` | usage/cost 추적 |
| `emittedMutationIds`, `emitted_save_receipt_ids` | tool 결과가 만든 mutation/save chain 식별 |
| `fallback_used`, `compensation_required` | salvage/rollback 판정 입력 |

tool log 저장 경계 규칙은 아래처럼 고정한다.

- `agent_tool_calls` row는 control-plane DB에 저장하고, 큰 input/output payload는 restricted object store의 `inputRef`, `outputRef` 로 분리한다.
- `agent_run_events` 는 `tool.started`, `tool.finished`, `tool.failed` 같은 요약 event만 담고, full body는 담지 않는다.
- provider raw binary, base64 image, full canvas JSON, giant response body는 `agent_tool_calls` row나 event store에 inline 저장하지 않는다. stable ref, hash, byte size만 남긴다.
- save, planner/model call, image generate/edit call, asset persist call은 모두 같은 schema family를 쓰되 `tool_kind` 로 구분한다.
- optional tool 실패는 fallback으로 닫을 수 있어도 `fallback_used` 와 `error_class` 는 반드시 남겨야 하고, required tool 실패는 `compensation_required` 또는 terminal failure reason까지 이어질 수 있어야 한다.

#### 8.2.3 observability propagation and privacy/redaction rules

operational telemetry와 audit row를 연결하는 최소 규칙은 아래와 같다.

- `POST /runs` 는 HTTP server span, queue enqueue는 producer span, worker attempt 실행은 consumer span, provider call은 client span으로 관측한다.
- queue consumer trace는 HTTP trace에만 의존하지 않고 message-carried context로 복원해야 한다.
- retry/resume 시 새 attempt span을 만들되 같은 `runId`, `traceId` 를 유지하고 이전 attempt와의 link metadata를 남긴다.
- tool execution structured log에는 최소 `runId`, `traceId`, `attemptSeq`, `toolCallId`, `actionId` 를 함께 찍어 telemetry sink와 audit row를 양방향으로 조인할 수 있어야 한다.

privacy/redaction rules는 아래처럼 고정한다.

| data class | rule |
| --- | --- |
| auth token, cookie, session secret, signed URL, provider API credential | 모든 structured log/event/audit payload에서 완전 제거한다. hash로도 남기지 않는다. |
| raw user prompt | `agent_run_requests` 와 restricted prompt artifact 외에는 저장하지 않는다. 일반 log/SSE/event는 redacted preview와 hash만 허용한다. |
| model system prompt / hidden instruction | template id/version, hash, redacted rendered prompt만 남긴다. hidden reasoning 전문은 저장하지 않는다. |
| email, phone, address, account id 등 PII | redacted preview에서는 마스킹하고, full payload가 꼭 필요하면 restricted object ref로만 저장한다. |
| binary/base64 image, mask, full canvas JSON | stable ref, hash, byte size만 남기고 inline 저장하지 않는다. |
| provider raw transcript / token stream | v1 기본 저장 대상이 아니다. structured result 또는 normalized error만 저장한다. |

구현 규칙은 아래처럼 고정한다.

- `pino` 의 정적 `redact` path와 serializer를 사용해 redaction을 구현하고, redact path를 사용자 입력이나 동적 prompt 내용으로부터 생성하지 않는다.
- secret은 `remove`, 사용자 텍스트/PII는 `censor` 또는 serializer 기반 truncation을 우선한다.
- telemetry sink는 redacted attribute만 받아야 하며, sink만으로 prompt/tool 전문을 복원할 수 없어야 한다.
- FE와 일반 사용자-facing API는 `prompt_log_ref`, `inputRef`, `outputRef`, provider correlation ref를 직접 노출하지 않는다.

#### 8.2.4 cost tracking / attribution contract

v1 비용 추적의 canonical 원자 단위는 `agent_tool_calls` 1행이다. request/run, attempt/job, provider/model별 비용 집계는 모두 이 row를 source로 파생해야 한다.

핵심 attribution 규칙은 아래처럼 고정한다.

- user-visible 비용 owner는 `runId` 다. 같은 `clientRequestId` 로 dedupe된 요청은 같은 `runId` 로 귀결되므로 request-level 비용과 run-level 비용은 v1에서 동일 집합이다.
- worker 운영 분석 owner는 `runId + attemptSeq + queueJobId` 다. retry, stalled recovery, resume은 별도 attempt 비용으로 보여야 한다.
- acceptance 이후 실제 호출된 provider/tool 비용은 성공/실패 여부와 무관하게 숨기지 않는다. 대신 `billable_external_usd` 와 `recovery_overhead_usd` 를 분리한다.
- editor mutation, save, asset persist, validation 같은 internal tool은 `USD 0` 이어도 usage row를 남긴다. 비용이 없다고 실행 footprint까지 사라지면 안 된다.

`agent_cost_summaries` 는 최소 아래 필드를 가져야 한다.

| field | requirement |
| --- | --- |
| `runId`, `traceId`, `requestId` | accepted northbound request row와 run summary join key |
| `cost_state` | `estimated`, `final`, `mixed`, `unknown` |
| `pricing_version` | rollup 계산에 사용한 pricing catalog/version |
| `billable_external_usd` | provider/model/image 등 외부 billable 총액 |
| `recovery_overhead_usd` | retry, fallback, compensation, failed attempt 때문에 추가된 외부 비용 |
| `tool_call_count`, `model_call_count` | 총 tool/model 실행 수 |
| `input_tokens`, `output_tokens`, `cached_input_tokens`, `reasoning_tokens` | model usage rollup |
| `generated_image_count`, `generated_image_pixels` | image usage rollup |
| `internal_unpriced_tool_calls` | non-billable/internal metered usage count |
| `attempt_breakdown_ref` | attempt/job 단위 비용 집계를 담은 artifact ref |
| `provider_breakdown_ref`, `tool_breakdown_ref` | provider/model/toolName별 집계 ref |
| `updated_at` | partial rollup 재계산 시각 |

구현 규칙은 아래처럼 고정한다.

- `agent_tool_calls.estimated_usd` 는 tool call 시점의 `pricing_version` 으로 계산하고, price card가 바뀌어도 기존 row를 덮어쓰지 않는다.
- provider usage가 실제 값을 돌려주면 `metering_class=provider_actual` 로 기록하고, coarse unit만 있으면 `provider_units_estimated` 로 남긴다.
- provider usage를 끝내 확정하지 못하면 `cost_state=unknown` 으로 유지한다. `0 USD` 로 조용히 변환하면 안 된다.
- backend finalizer는 terminal 시점에 `agent_cost_summaries` 를 확정하지만, run 진행 중에도 partial rollup을 갱신해 ops projection이 현재 누적 비용을 볼 수 있어야 한다.
- `attempt_breakdown_ref` 는 `attemptSeq`, `queueJobId`, `startedAt`, `finishedAt`, `usd`, `tool_call_count`, `retry_reason`, `safe_resume_used` 를 최소로 담아야 한다.

#### 8.2.5 operational reporting projections

v1은 canonical audit row를 source로 최소 아래 projection을 만들 수 있어야 한다.

| projection | source records | primary keys | 필수 지표 |
| --- | --- | --- | --- |
| `run_execution_report` | `agent_runs`, `agent_run_attempts`, `agent_cost_summaries`, `agent_run_completions`, `agent_live_draft_bundles` | `runId` | terminal status, attempt count, queue wait ms, time-to-first-visible, editable minimum 시간, `billable_external_usd`, `recovery_overhead_usd`, fallback count |
| `attempt_cost_report` | `agent_run_attempts`, `agent_tool_calls` | `runId + attemptSeq + queueJobId` | dequeue->terminal 시간, stalled 여부, attempt 내 tool usage/cost, retry reason, safe resume 여부 |
| `provider_model_daily_rollup` | `agent_tool_calls`, `agent_cost_summaries` | `date + provider + model + toolName` | call count, token/unit usage, estimated usd, p50/p95 latency, failure/rate-limit count |
| `flow_health_rollup` | `agent_runs`, `agent_run_completions`, `agent_cost_summaries` | `date + scenarioKey + final_status` | run count, success/warning/failure 비율, 평균 비용, 평균 recovery overhead ratio |

projection 규칙은 아래처럼 고정한다.

- projection은 telemetry sink 전용 metric에만 의존하면 안 되고, canonical row만으로 재생성 가능해야 한다.
- run 진행 중 warning/ops panel은 partial projection을 볼 수 있어도, terminal finance/support 수치는 `agent_cost_summaries` finalized row를 기준으로 한다.
- `recovery_overhead_usd / billable_external_usd` 비율, `cost_state=unknown`, usage 없는 model call, stalled attempt 급증은 day-one alert 후보로 본다.
- FE 기본 사용자 surface는 provider/model별 세부 비용을 직접 노출하지 않고 summary/projection만 사용한다. 상세 비용 분석은 ops/support query layer에서만 연다.

### 8.3 컴포넌트별 읽기 경로

저장만 분리하면 부족하므로, 각 컴포넌트가 어떤 record를 읽는지도 같이 고정해야 한다.

| reader | 반드시 읽을 수 있어야 하는 record | 목적 |
| --- | --- | --- |
| FE run panel / SSE consumer | `agent_runs`, `agent_run_events`, `agent_run_completions` projection | 상태 표시, 최근 단계 표시, terminal 결과 표시 |
| FE mutation executor | `canvas.mutation` SSE event, 필요 시 최근 미ack mutation projection | live-commit 적용과 reconnect 복구 |
| Worker hydrate/resume | `agent_run_requests`, `agent_run_snapshots`, latest validated `agent_plans`, open `agent_canvas_mutation_events`, `agent_run_attempts`, latest committed `agent_live_draft_bundles` | queue 재시도, last-acked 기준 resume, blind replay 방지 |
| Backend watchdog / finalizer | `agent_runs`, `agent_run_attempts`, `agent_run_events`, `agent_canvas_mutation_events`, `agent_live_draft_bundles`, `agent_cost_summaries` | timeout, cancel, stall recovery, terminal 판정 |
| Ops / QA / support | 모든 canonical record + existing editor/template save receipt ref | 사용자 문의 대응, incident analysis, SLA/cost 검증, replay 금지 여부 점검 |

추가 규칙:

- worker recovery는 event log full scan만으로 복원하지 않는다. 최소 `latest validated plan + open mutation rows + latest committed bundle/save metadata + cancel fence` 를 직접 조회할 수 있어야 한다.
- FE는 raw request, raw plan, tool-call detail을 기본 UI에서 직접 읽지 않는다. 사용자 표면은 summary/projection만 사용한다.
- ops용 조회는 FE용 projection과 별도여도 되지만, 둘 다 같은 canonical record를 source로 삼아야 한다.

### 8.4 retrieval expectations

v1 retrieval은 단순 조회가 아니라 `운영`, `resume`, `감사` 세 목적을 동시에 만족해야 한다.

#### 8.4.1 운영 조회

- `runId` 로 현재 상태, 마지막 phase, pending mutation 수, latest save 상태를 즉시 확인할 수 있어야 한다.
- `traceId` 로 request, events, tool calls, canvas mutation append chain, committed bundle/completion을 한 번에 묶어 볼 수 있어야 한다.
- `documentId + pageId` 로 active run lock과 최근 terminal run을 조회할 수 있어야 한다.
- `userId + startedAt range` 로 사용자 문의 대응이 가능해야 한다.

#### 8.4.2 resume / recovery 조회

- worker retry attempt는 `runId` 기준으로 latest validated plan version, last acked seq, open mutation, latest committed bundle/save metadata를 bounded query로 복원해야 한다.
- backend watchdog는 queue broker를 보지 못해도 `agent_run_attempts.last_heartbeat_at`, open mutation row, cancel fence로 stall/cancel recovery를 판정할 수 있어야 한다.
- `unknown_apply_state` 나 `save outcome unknown` 상황에서는 event log보다 `agent_canvas_mutation_events` 와 latest committed `agent_live_draft_bundles.saveMetadata.latestSaveReceipt` 조회가 우선이다.

#### 8.4.3 감사 조회

감사 또는 사후 분석 시 최소 아래 질문에 답할 수 있어야 한다.

1. 어떤 prompt와 snapshot에서 run이 시작됐는가.
2. 어떤 rendered prompt와 structured output이 실제로 planner/tool 실행에 사용됐는가.
3. 어떤 validated plan version이 실행됐는가.
4. 어떤 tool call이 어떤 mutation/save/compensation을 만들었는가.
5. FE가 실제로 어떤 seq를 ack/reject 했고 resulting revision은 무엇이었는가.
6. 최종적으로 사용자가 본 draft와 save receipt는 무엇이었는가.
7. 비용, fallback, warning, cancel/failure reason은 무엇이었는가.

이 7개 질문에 답하기 위한 최소 감사 join path는 아래다.

`agent_runs -> agent_run_requests -> agent_run_snapshots -> agent_plans -> agent_tool_calls -> prompt/input/output object refs -> agent_canvas_mutation_events -> agent_live_draft_bundles -> agent_run_completions`

### 8.5 audit and immutability expectations

v1은 lightweight하게 시작해도 아래 audit rules는 처음부터 지켜야 한다.

- `agent_run_events` 는 append-only다. 기존 event를 덮어써서 history를 수정하면 안 된다.
- `agent_plans` 의 validated version은 immutable하다. 재계획은 overwrite가 아니라 `planVersion + 1` 로 남긴다.
- `agent_canvas_mutation_events` row는 삭제하지 않는다. 상태 전이와 compensation back-reference를 누적해 남긴다.
- terminal run의 `agent_live_draft_bundles`, `agent_run_completions`, `agent_cost_summaries` 는 terminal 이후 수정하지 않는다. 정정이 필요하면 별도 correction event로 남긴다.
- queue broker retention이 끝나도 audit package는 사라지면 안 된다. queue는 transport이고, audit source는 backend canonical records다.
- raw user prompt 전문과 rendered prompt 전문은 restricted record를 source로 삼고, 일반 event/log row에 복제하지 않는다.
- `prompt_hash`, `redaction_policy_version`, `prompt_log_ref` 같은 privacy provenance 필드는 terminal 이후 정정이 필요해도 overwrite하지 않고 correction event로만 보강한다.
- planner chain-of-thought, provider auth secret, provider raw binary, speculative prompt scratchpad는 감사 대상 persisted record에 넣지 않는다.

rollback/복구 관점에서 추가로 반드시 남겨야 하는 기록은 아래와 같다.

- run 시작 시점의 `agent_run_snapshots.base_revision`
- 각 mutation/save/compensation row의 `rollback_group_id`, `base_revision`, `ack_revision`, ack/reconcile outcome
- rollback 판단 자체를 설명하는 `agent_run_events` 의 decision event 또는 동등한 append-only log
- 어떤 mutation이 어떤 mutation을 되돌렸는지 나타내는 `compensatesMutationId` back-reference
- 마지막으로 보존하기로 결정된 `savedRevision` 과 그 근거가 되는 committed `LiveDraftArtifactBundle.saveMetadata.latestSaveReceipt`
- orphan asset ref와 cleanup 필요 여부
- terminal `RunCompletionRecord` 또는 동일 completion chain summary 안의 rollback outcome 요약

즉, audit만으로 아래 질문에 답할 수 있어야 한다.

1. 무엇을 되돌렸는가.
2. 무엇을 의도적으로 남겼는가.
3. 어떤 saved revision을 canonical draft로 채택했는가.
4. compensation이 성공했는가, 부분 실패했는가.

### 8.6 worker ephemeral state

worker는 아래를 durable source of truth로 삼지 않는다.

- planner intermediate chain-of-thought
- 임시 prompt 재료와 tool-local cache
- 최종적으로 ack되지 않은 speculative mutation 결과
- provider SDK client 내부 retry state

### 8.7 FE local state

FE는 아래를 로컬 상태로 유지할 수 있지만 canonical state는 아니다.

- run panel open/close 상태
- prompt draft
- local checkpoint와 undo/redo stack
- stream reconnect cursor cache
- mutation apply 직전의 transient render state

## 9. v1 핵심 상태 전이

### 9.1 run 상태 전이

| 현재 상태 | 이벤트 | 다음 상태 | 판정 주체 |
| --- | --- | --- | --- |
| `planning_queued` | worker가 planning phase append | `planning` | backend |
| `planning` | validated plan persisted + executor enqueue ack | `plan_ready` | backend |
| `plan_ready` | 첫 executor action dispatch | `executing` | backend |
| `executing` | 첫 `canvas.mutation` stream 발행 | `awaiting_apply_ack` | backend |
| `awaiting_apply_ack` | FE ack 성공 + 후속 action 남음 | `executing` | backend |
| `executing/awaiting_apply_ack` | saveTemplate mutation proposal | `saving` | backend |
| `saving` | milestone save ack + 후속 refinement 가능 | `executing` | backend |
| `saving` | final save ack + pending mutation 0건 | `finalizing` | backend |
| `planning_queued/planning/plan_ready/executing/awaiting_apply_ack/saving` | cancel 요청 수락 | `cancel_requested` | backend |
| `finalizing` | `RunCompletionRecord` append + warning 없음 | `completed` | backend |
| `finalizing` | `RunCompletionRecord` append + warning/fallback 존재 | `completed_with_warning` | backend |
| `cancel_requested` | worker stop 또는 recovery timeout 후 cleanup 종료 | `cancelled` | backend |
| `saving/finalizing/cancel_requested` | latest save receipt 부재로 durability 미확보 | `save_failed_after_apply` | backend |
| `planning_queued/planning/plan_ready/executing/awaiting_apply_ack/saving/finalizing` | fatal error | `failed` | backend |
| `cancel_requested` | fatal recovery failure | `failed` | backend |

state 전이는 worker의 힌트만으로 끝나지 않는다. backend는 `event log + ack ledger + cancel state + attempt recovery state` 를 함께 보고 확정한다.

### 9.2 attempt 상태 전이

아래 표는 `agent_run_attempts.attempt_state` 의 canonical 전이를 고정한다. run 상태와 달리 attempt 상태는 queue/worker liveness와 retry ownership 판단에 직접 사용된다.

| 현재 attempt 상태 | 이벤트 | 다음 attempt 상태 | 판정 주체 |
| --- | --- | --- | --- |
| `enqueue_pending` | `Queue.add()` 성공 + attempt row persist 완료 | `enqueued` | backend |
| `enqueued` | 현재 `queueJobId` 의 첫 유효 heartbeat 또는 첫 phase append | `dequeued` | backend |
| `dequeued` | hydrate 시작 heartbeat | `hydrating` | backend |
| `hydrating` | planning 또는 execution 시작 heartbeat/event | `running` | backend |
| `running` | mutation dispatch 후 FE ack 대기 시작 | `awaiting_ack` | backend |
| `awaiting_ack` | FE ack accepted + 후속 action 남음 | `running` | backend |
| `running/awaiting_ack` | final save ack 확보 + finalize 진입 heartbeat | `finalizing` | backend |
| `enqueued/dequeued/hydrating/running/awaiting_ack/finalizing` | cancel 수락 | `cancel_requested` | backend |
| `cancel_requested` | cleanup/finalize 완료 | `cancelled` | backend |
| `dequeued/hydrating/running/awaiting_ack/finalizing` | finalize accepted + 성공 종료 | `succeeded` | backend |
| `enqueued/dequeued/hydrating/running/awaiting_ack/finalizing/cancel_requested` | retry 불가 fatal error 또는 recovery 실패 | `failed` | backend |
| `enqueued/dequeued/hydrating/running/awaiting_ack/finalizing` | retryable failure + backend가 후속 attempt row 생성 | 현재 row는 `failed`, 새 row는 `retry_waiting` 로 생성 | backend |
| `retry_waiting` | delayed enqueue 시각 도달 + queue publish 성공 | `enqueued` | backend |

추가 규칙:

- `retry_waiting` 은 실패한 현재 attempt의 재해석이 아니라 `attemptSeq + 1` 미래 row의 초기 상태다.
- `stalled` QueueEvents는 attempt 상태가 아니라 transition trigger다. backend는 `last_heartbeat_at`, open ack wait, `queueJobId` 일치 여부를 함께 보고 `failed` 또는 recovery path를 결정한다.
- `cancel_requested` 이후에는 `running` 으로 되돌아가지 않는다. cleanup/finalize만 허용되며, 새 실행이 필요하면 새 attempt row를 만들거나 terminal로 닫아야 한다.

## 10. 문서 결론

v1 backend는 `thin API` 가 아니라 `durable orchestration control plane` 으로 설계해야 한다.

하지만 그 control plane이 planner/runtime까지 끌어안으면 v1의 분리 원칙이 무너진다. 따라서 구현 기준선은 아래처럼 고정한다.

1. public API는 `accept, stream, ack, cancel` 만 책임진다.
2. worker는 `plan, tool call, mutation propose, finalize` 만 책임진다.
3. canonical state와 sequencing은 backend가 가진다.
4. 실제 canvas mutation은 FE가 live-commit으로 실행한다.

이 선을 지키면 v1의 empty-canvas create flow를 2분 안에 실용적으로 구현하면서도, v2의 `updateLayer` 와 `deleteLayer` user-facing flow를 같은 orchestration 골격 위에 확장할 수 있다.
