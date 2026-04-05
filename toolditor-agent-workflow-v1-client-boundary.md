# Toolditor Agent Workflow V1 Client Boundary

| 항목 | 값 |
| --- | --- |
| 문서명 | `Toolditor Agent Workflow V1 Client Boundary` |
| 문서 목적 | 자연어 기반 agent/workflow layer 도입 시 `toolditor` 클라이언트 경계와 호출 계약을 v1 범위로 고정한다. |
| 상태 | `Draft` |
| 문서 유형 | `TO-BE` |
| 작성일 | `2026-04-02` |
| 기준 시스템 | `toolditor FE`, `new agent backend`, `separate worker queue` |
| 기준 데이터 | `toolditor 코드 분석`, `workspace 연구 문서` |
| 대상 독자 | `PM, FE, Agent Backend, Worker, QA` |
| Owner | `Ouroboros workflow` |

## 1. 대표 시나리오

v1 대표 시나리오는 아래 한 가지로 고정한다.

1. 사용자가 빈 캔버스로 `/editor` 에 진입한다.
2. 사용자가 `봄 세일 이벤트 배너 만들어줘` 같은 자연어 요청을 입력한다.
3. `toolditor` 는 요청을 agent workflow layer에 보낸다.
4. agent workflow layer는 계획과 tool 실행 결과를 이벤트로 스트리밍한다.
5. `toolditor` 는 승인 단계 없이 캔버스에 실시간으로 mutation을 적용한다.
6. 2분 이내에 편집 가능한 배너 초안 1개가 완성되고 working template 저장까지 끝낸다.

v1의 핵심은 `자동 생성 이미지 1장`이 아니라 `live-commit으로 쌓이는 editable draft`다.

## 2. 코드 기준 현재 사실

이번 문서는 아래 현재 구현을 source of truth로 본다.

- 에디터 진입과 템플릿 bootstrap은 `pages/editor/[[...WorkingTemplateCode]].tsx` 와 `useTemplateLoader()` 가 담당한다.
- 현재 AI 진입점은 `selected target` 기반이다.
  - `useAiEditEntryState()` 는 선택 상태를 `text | image | none` 으로 계산한다.
  - 선택이 없으면 `type: 'none'` 이므로 SubHeader/Editable의 `툴디 AI` 버튼은 렌더링되지 않는다.
- 캔버스/페이지/오브젝트/선택/UI 상태는 이미 Zustand store로 분리돼 있다.
  - canvas: `src/store/canvas.ts`
  - object/target: `src/store/object.ts`
  - template/save flags: `src/store/template.ts`
  - tool refs: `src/store/editor.ts`
  - edit session projection: `src/application/store/useEditSessionViewModel.ts`
  - undo/redo: `src/store/history.ts`
- 실시간 캔버스 변경은 command 경로를 통해 이뤄지고, command 실행 시 autosave가 연결돼 있다.
  - add: `AddObjectsCommand`
  - update: `UpdateObjectsCommand`
  - delete: `DeleteObjectsCommand`
  - save: `saveCanvas()`

즉, v1 agent create flow는 새 캔버스 agent 진입점을 추가해야 하지만, 실제 mutation 적용은 기존 command/save invariant를 재사용해야 한다.

## 3. 경계 결정

### 3.1 `toolditor` 클라이언트가 반드시 소유하는 책임

`toolditor` 는 아래만 책임진다.

- 빈 캔버스 진입점 렌더링
- prompt 입력, 수정, 재시도, 취소 UI와 `StartAgentWorkflowRunRequest` 패키징
- `PublicRunEvent` 기반 run timeline, 진행 상태, 오류 배너, stop 버튼 같은 agent UX shell 렌더링
- 현재 run에 대해 authorise된 `canvas.mutation` 만 즉시 command adapter로 적용
- undo/redo, autosave, selection, viewport, active page 일관성 유지
- trace id, run id, mutation seq를 기준으로 FE observability 이벤트 발행
- `MutationApplyAck` 제출과 로컬 rollback checkpoint 보관 및 revert action 실행

### 3.2 새 agent workflow layer가 소유하는 책임

새 agent workflow layer는 아래를 책임진다.

- `POST /runs` 수락 시점의 run 생성, `runId`/`traceId`/deadline 발급, page lock/idempotency/persistence
- 자연어 해석과 계획 생성
- tool 선택과 실행 순서 결정
- guardrail, retry/backoff, compensation, completion 같은 정책 결정
- queue enqueue / worker dispatch / retry / timeout
- LLM/provider/model 선택
- durable run state, 비용, 로그, worker trace 저장
- 최종 draft 완료 판정

### 3.3 `toolditor` 가 직접 하면 안 되는 것

`toolditor` 는 아래를 직접 하지 않는다.

- `runId`, `traceId`, deadline, page lock, canonical run row를 스스로 만드는 run creation
- 자유 텍스트를 바로 canvas object로 변환하는 planner 역할
- worker queue 직접 접근
- policy engine처럼 retry/backoff, fallback, compensation, completion rule을 결정하는 것
- 장기 실행 상태의 canonical 저장
- provider별 에러 재시도 정책
- 비용 계산의 source of truth 보관

### 3.3A contract naming policy

`toolditor` 가 소비하는 public REST, SSE, mutation ack, worker-visible shared contract field는 모두 camelCase를 canonical로 사용한다.

- FE는 별도 wire projection을 유지하지 않는다.
- route/SSE/client adapter에서 snake_case serializer mapper를 두지 않는다.
- snake_case는 persistence/SQL 경계에서만 허용되고, FE는 그 변환을 소유하지 않는다.

### 3.4 정확한 소유권 매트릭스

아래 표는 `client owns` 와 `delegates to backend` 를 구현 가능한 수준으로 자른 기준선이다.

| 책임 축 | `toolditor` 가 직접 소유하는 것 | agent backend로 위임하는 것 | 구현 규칙 |
| --- | --- | --- | --- |
| prompt / entry UX | composer 입력값, overlay/bottom-sheet open 상태, submit/stop/retry 버튼, run panel 표시 | prompt 해석, intent 추론, plan 생성 | FE는 입력 UI와 validation만 담당하고 prompt 의미 해석은 하지 않는다. |
| empty-canvas gate | 현재 `pageData`, `objectData`, `isLoaded`, `isEditSessionActive` 를 읽어 시작 가능 여부 계산 | 서버측 권한/lock/idempotency 재검증 | FE gate는 UX용 1차 방어이고, 최종 허용 여부는 backend가 닫는다. |
| editor-local state | visible page tree, object tree, selection, zoom, viewport, undo/redo, `isSaved/isSaving` | canonical run state, queue state, retry budget, deadline 상태 | 화면에 보이는 편집기 truth는 FE가 갖고, run lifecycle truth는 backend가 갖는다. |
| run transport | `StartAgentWorkflowRunRequest` 제출, SSE 연결/재연결, cancel 호출, mutation ack 제출 | run 생성, `runId`/`traceId`/deadline 발급, page lock/idempotency/persistence, SSE fan-out, dedupe, cancel fence, mutation seq 발급 | FE는 transport client일 뿐이며 `POST /runs` 호출 자체가 run creation을 뜻하지 않는다. |
| canvas apply | `AddObjectsCommand`, `UpdateObjectsCommand`, `DeleteObjectsCommand`, `saveCanvas()` 실행 | mutation payload 생성, commit group 계산, compensation 정책 결정 | backend/worker는 무엇을 바꿀지 결정하고, FE는 어떻게 기존 editor invariant 안에서 적용할지 결정한다. |
| mutation ordering | `nextExpectedSeq` 로 수신 순서 검증, duplicate delivery 차단 | canonical `seq`, `mutationId`, `rollbackGroupId` 발급 | FE는 out-of-order를 거부하지만 새 순서를 만들지 않는다. |
| rollback | run 시작 checkpoint 보관, command/history 기반 local revert, 사용자용 `되돌리기` affordance | rollback ledger, compensation 필요 여부, terminal recovery 판정 | FE checkpoint는 in-session recovery 수단일 뿐 canonical durability source가 아니다. |
| save / durability UX | force-save 실행, 저장중/저장실패 UI, last saved revision 표시 | final save 필요 여부, durable terminal outcome 판정 | save API/receipt의 canonical 성공 여부는 backend가 확정한다. |
| observability | 화면 이벤트, apply latency, seq gap, reconnect 상태를 FE telemetry로 발행 | run/event/cost log, trace join, support 조회용 audit record | FE telemetry는 보조 signal이며 support source of truth가 아니다. |
| scope control | empty-canvas create surface만 노출 | v2 `updateLayer` / `deleteLayer` 확장 경로 유지 | FE는 v1 제품 범위를 좁게 유지하되, runtime contract는 미래 op를 가리지 않는다. |

### 3.5 FE 내부 구현 경계

v1에서 `toolditor` 내부에는 최소 아래 5개 경계가 필요하다.

| FE 모듈 | owning 책임 | 맡지 않는 책임 |
| --- | --- | --- |
| `AgentEntryShell` | empty-canvas overlay, desktop subheader action, mobile header action, prompt composer 표시 | planner UI, long-running state canonical 저장 |
| `AgentRunController` | start/cancel/retry 요청, SSE 구독, run state projection, timeline item 정리 | queue retry 결정, terminal status 판정 |
| `EditorMutationGateway` | `canvas.mutation` 을 기존 command/save 경로로 변환해 실행, apply 결과 수집 | mutation 내용 수정, seq 재할당, tool fallback |
| `RollbackSupervisor` | checkpoint 생성, group-local revert 실행, 사용자 `agent 변경사항 되돌리기` 액션 제공 | 어떤 rollback group을 언제 닫을지 canonical 판정 |
| `AgentTelemetryBridge` | trace/run/mutation correlation이 있는 FE log 발행, reconnect/apply latency 측정 | 비용 집계, 운영 audit 보관 |

경계 규칙:

- `AgentRunController` 와 `EditorMutationGateway` 는 분리한다. run state projection과 canvas side effect execution을 한 store/hook에 섞지 않는다.
- `EditorMutationGateway` 는 기존 `command/history/save` 경로만 호출할 수 있다. store direct write는 금지한다.
- `AgentEntryShell` 은 prompt와 entry UX를 바꿀 수 있지만, mutation apply semantics를 가지면 안 된다.
- `RollbackSupervisor` 는 FE local checkpoint를 관리하지만, durable rollback ledger를 흉내 내면 안 된다.

## 4. v1 요청 진입점

현재 `useAiEditEntryController()` 는 선택이 없으면 entry를 숨기므로, v1 empty-canvas create flow는 별도 진입 컨트롤러를 둬야 한다.

권장 신규 진입점은 아래 3개다.

| Entry ID | 호스트 UI | 노출 조건 | 역할 |
| --- | --- | --- | --- |
| `empty_canvas_overlay` | 빈 캔버스 중앙 overlay | `isLoaded=true`, `pageData.length=1`, active page object 수 0, edit session inactive | v1 기본 CTA. 사용자가 가장 먼저 보는 입력창 |
| `desktop_subheader_agent` | Desktop `SubHeader` 우측 또는 좌측 고정 action | 위 조건과 동일, overlay 닫힘 상태에서도 노출 | overlay 재오픈과 run panel 재포커스 |
| `mobile_header_agent` | `MobileHeader` action | 모바일에서 동일한 empty-canvas 조건 | 동일 계약을 bottom sheet shell로 노출 |

### 4.1 공통 UX 규칙

- UX shell은 Cursor, Claude Code, Codex 계열 패턴을 따른다.
- 단일 prompt composer, live activity timeline, 현재 단계 표시, stop 버튼을 기본으로 둔다.
- `승인 후 적용` 모달은 두지 않는다.
- 사용자가 보는 것은 `계획 -> 실행 -> 캔버스 반영 -> 저장`의 진행 로그다.
- 사용자가 바로 수정 가능한 결과를 남기는 것이 우선이며, 긴 설명 텍스트는 최소화한다.

### 4.1.1 step failure / retry / resume execution UX

이 절의 canonical entity는 `AgentWorkflowEvent.type='run.recovery'`, `AgentRunState.recovery`, `MutationLedger.lastKnownGoodCheckpointId` 다. FE는 step failure가 발생했을 때 generic toast 하나로 끝내지 않고, run panel에서 `무엇이 실패했는지`, `지금 자동 복구 중인지`, `사용자가 눌러도 되는 retry가 있는지`, `복구 기준점이 빈 캔버스인지 마지막 저장본인지` 를 같은 구조로 보여줘야 한다.

| 상황 | run panel에 반드시 보여줄 것 | CTA / interaction | resume 표현 규칙 |
| --- | --- | --- | --- |
| 첫 visible ack 이전 실패 | `초안 적용 전 단계에서 문제가 발생했습니다` 와 단계명, retry 여부, 현재 캔버스가 unchanged라는 설명 | auto retry 중이면 `stop` 만 노출. terminal failure 후 `retryMode='manual_same_run'` 일 때만 `다시 시도` 노출 | `resumeMode='fresh'` 이면 `처음부터 다시 시도` 로 번역하되, 같은 `runId` 의 새 attempt라는 사실은 숨기지 않는다. |
| first visible 이후 milestone save 이전 step 실패 | 실패한 step label, `복구 중`, `마지막 확인 지점부터 다시 이어가는 중` 문구, 현재 보이는 draft 일부가 정리될 수 있다는 설명 | active recovery 동안 `retry` 숨김 + `stop` 유지. backend가 terminal manual retry를 열어 준 뒤에만 `마지막 안정 지점부터 다시 시도` 노출 | `lastKnownGoodCheckpointId` 를 기준으로 resume 중임을 표시하고, `restoreTargetKind='run_start_snapshot'` 이면 실패 시 빈 캔버스로 되돌아갈 수 있음을 함께 보여준다. |
| milestone save 이후 optional tail 실패 | `저장된 초안은 유지됩니다`, `일부 장식/정리 단계가 생략되었습니다` 같은 warning summary | 별도 regenerate/retry CTA 금지. 사용자는 남은 draft를 바로 수동 편집할 수 있어야 한다 | `restoreTargetKind='latest_saved_revision'` 이면 `마지막 저장된 초안 유지` badge를 고정 표시한다. |
| final save / finalize 실패 | `저장 확인 실패`, `새로고침 후 유지가 보장되지 않을 수 있음` 또는 `마지막 저장본으로 복구 중` | backend가 허용한 경우에만 `저장 다시 시도` 노출. layout/image 재생성 CTA는 금지 | `resumeMode='finalize_only'` 이면 `저장 확인만 다시 수행` 으로 번역하고, 새 visible mutation이 더 나오지 않는다는 점을 명시한다. |
| non-retryable terminal failure | 실패 code 요약, current canvas outcome, manual edit 가능 여부 | `retry` 숨김. `닫기` 또는 `수동 편집으로 전환` 만 허용 | `recovery.state='not_retryable'` 로 projection하고 checkpoint 문구는 informational only로 남긴다. |

추가 고정 규칙은 아래와 같다.

- FE는 `run.recovery` 이벤트가 도착하면 기존 `phaseLabel` 위에 recovery banner를 우선 렌더링한다. 같은 시점에 generic error toast만 띄우고 panel 정보를 숨기면 안 된다.
- `retry` 버튼은 새 prompt submit이 아니라 같은 `runId` 에 대한 backend retry endpoint 호출이어야 한다. FE가 새 `clientRequestId` 를 만들어 새 run처럼 보내면 안 된다.
- auto recovery 중에는 composer를 read-only로 두고, 사용자는 같은 페이지에 두 번째 run을 시작할 수 없다.
- `lastKnownGoodCheckpointId` 가 null이면 FE는 checkpoint-based resume 문구를 만들면 안 된다. 이 경우는 `fresh` 또는 `not_retryable` 둘 중 하나여야 한다.
- `restoreTargetKind='run_start_snapshot'` 과 `restoreTargetKind='latest_saved_revision'` 은 각각 `원래 빈 캔버스 복구`, `마지막 저장된 초안 유지` 로 고정 번역한다.
- FE는 `retryable=true` 라는 사실만으로 버튼을 노출하지 않는다. `retryMode='manual_same_run'` 일 때만 버튼을 보여준다. `auto_same_run` 인 동안에는 진행 상태만 보여준다.

### 4.2 v1 진입 가드

아래 조건을 모두 만족해야 agent run 시작 버튼이 활성화된다.

- canvas load 완료
- active edit session 없음
- active page가 사실상 empty canvas 상태
- 다른 agent run이 `planning | executing | applying | saving` 상태가 아님
- 로그인/권한 검증 완료

## 5. UI 상태 소유권

### 5.1 기존 store를 그대로 재사용하는 상태

| 상태 | 현재 저장 위치 | v1에서의 의미 |
| --- | --- | --- |
| canvas size / zoom / active page | `src/store/canvas.ts` | agent payload의 workspace context source |
| pageData / isLoaded | `src/store/canvas.ts` | empty-canvas gate와 target page 결정 |
| objectData / objectSort / selected targets | `src/store/object.ts` | live mutation 적용과 selection sync |
| template code / isSaved / isSaving | `src/store/template.ts` | autosave, working template identity |
| tool refs / canvas ref | `src/store/editor.ts` | viewport sync, rect refresh |
| undo / redo stacks | `src/store/history.ts` | live-commit rollback의 기본 수단 |
| edit session capability projection | `src/application/store/useEditSessionViewModel.ts` | agent run과 기존 AI 편집 세션 충돌 방지 |

### 5.2 새로 필요한 FE 전용 상태

v1에서는 별도 FE store를 추가한다.

```ts
type AgentComposerState = {
  isOpen: boolean;
  promptDraft: string;
  entrypoint: 'empty_canvas_overlay' | 'desktop_subheader_agent' | 'mobile_header_agent' | null;
  validationError: string | null;
};

type AgentRunState = {
  runId: string | null;
  traceId: string | null;
  status: 'idle' | 'submitting' | 'planning' | 'executing' | 'applying' | 'saving' | 'completed' | 'failed' | 'cancelled';
  streamState: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';
  phaseLabel: string | null;
  draftId: string | null;
  startedAt: string | null;
  deadlineAt: string | null;
  timeline: AgentTimelineItem[];
  nextExpectedSeq: number;
  pendingMutationIds: string[];
  appliedMutationIds: string[];
  rollbackGroupId: string | null;
  checkpointId: string | null;
  lastResultingRevision: number | null;
  lastSavedRevision: number | null;
  recovery: {
    state:
      | 'idle'
      | 'auto_retrying'
      | 'resuming_from_checkpoint'
      | 'checkpoint_restore_in_progress'
      | 'awaiting_manual_retry'
      | 'finalize_only'
      | 'not_retryable';
    retryMode: 'auto_same_run' | 'manual_same_run' | 'none';
    resumeMode: 'fresh' | 'last_known_good_checkpoint' | 'finalize_only' | null;
    retryable: boolean;
    lastKnownGoodCheckpointId: string | null;
    restoreTargetKind: 'run_start_snapshot' | 'latest_saved_revision' | null;
    failedPlanStepId: string | null;
    resumeFromSeq: number | null;
    userMessage: string | null;
  };
  lastError: { code: string; message: string } | null;
};
```

### 5.3 FE가 소유하지 않는 상태

아래 상태는 FE에 캐시될 수는 있지만 canonical state가 아니다.

- planner output 전문
- worker retry count
- queue position
- provider/model 결정 상세
- 비용 집계 원본
- durable rollback ledger

## 6. invoke 계약

## 6.1 FE 진입 endpoint

`toolditor` 는 worker나 queue를 직접 호출하지 않고, 단일 orchestration 진입점만 호출한다.

- `POST /api/agent-workflow/runs`
- 인증은 기존 web session cookie를 재사용한다.
- FE body에는 최소한의 editor context만 담고, 사용자 식별의 source of truth는 서버 세션을 쓴다.

### 6.1.1 Request schema

```ts
type StartAgentWorkflowRunRequest = {
  clientRequestId: string;
  workflowVersion: 'v1';
  mode: 'create_from_empty_canvas';
  prompt: string;
  entrypoint: 'empty_canvas_overlay' | 'desktop_subheader_agent' | 'mobile_header_agent';
  workspace: {
    editorSurface: 'desktop' | 'mobile';
    route: {
      workingTemplateCode: string | null;
      sizeSerial: string | null;
    };
    canvas: {
      sizeSerial: string | null;
      widthPx: number;
      heightPx: number;
      unit: string;
      pageCount: number;
      activePageId: string;
      activePageObjectCount: number;
      totalObjectCount: number;
      isEmptyCanvas: boolean;
      background: {
        type: 'color' | 'image';
        value: string | null;
      };
    };
    gating: {
      isCanvasLoaded: boolean;
      isEditSessionActive: boolean;
      hasSelection: boolean;
      liveCommitEnabled: true;
    };
  };
  executionPolicy: {
    draftCount: 1;
    maxDurationSec: 120;
    commitMode: 'apply_immediately';
    allowedMutationOps: ['createLayer', 'updateLayer', 'deleteLayer', 'saveTemplate'];
  };
  clientContext: {
    origin: 'toolditor_agent_v1';
    timezone: string;
    locale: string;
  };
};
```

추가 규칙:

- FE는 `clientRequestId` 만 생성하고, canonical `traceId` 는 `POST /api/agent-workflow/runs` 응답에서 받아야 한다.
- FE는 새 run 시작 요청에 `traceId` 를 넣지 않는다. 이후 `cancel`, `mutation-acks`, FE observability event에는 응답으로 받은 동일 `traceId` 를 사용한다.

### 6.1.2 응답 schema

```ts
type StartAgentWorkflowRunResponse = {
  runId: string;
  traceId: string;
  status: 'queued';
  streamUrl: string;
  cancelUrl: string;
  startedAt: string;
  deadlineAt: string;
  mutationAckUrl: string;
};
```

## 6.2 런타임 event stream 계약

run 수락 후 FE는 SSE 또는 WebSocket으로 event stream을 구독한다. v1은 구현 단순성을 위해 SSE 우선으로 둔다.

```ts
type AgentWorkflowEvent =
  | { type: 'run.accepted'; runId: string; traceId: string; at: string }
  | { type: 'run.phase'; runId: string; traceId: string; phase: 'queued' | 'planning' | 'executing' | 'applying' | 'saving'; message: string; at: string }
  | { type: 'run.log'; runId: string; traceId: string; level: 'info' | 'warn' | 'error'; message: string; at: string }
  | {
      type: 'run.recovery';
      runId: string;
      traceId: string;
      recovery: AgentRunState['recovery'];
      at: string;
    }
  | { type: 'canvas.mutation'; runId: string; traceId: string; draftId: string; pageId: string; seq: number; mutation: CanvasMutationEnvelope; at: string }
  | { type: 'run.cancel_requested'; runId: string; traceId: string; reason?: string; at: string }
  | { type: 'run.completed'; runId: string; traceId: string; result: AgentRunResultSummary; at: string }
  | { type: 'run.failed'; runId: string; traceId: string; error: { code: string; message: string; retryable: boolean }; at: string }
  | { type: 'run.cancelled'; runId: string; traceId: string; at: string };
```

추가 규칙:

- `run.recovery` 는 step failure가 `auto retry`, `checkpoint resume`, `finalize_only`, `manual retry 대기`, `not retryable` 중 어느 경로로 닫히는지 FE에 알려주는 유일한 public event다.
- `run.failed` 는 terminal close event이고, recovery 진행 중간 상태를 대신하면 안 된다. recovery가 진행 중이면 반드시 `run.recovery` 를 먼저 보낸다.
- `run.recovery.recovery.lastKnownGoodCheckpointId` 는 backend canonical checkpoint row를 mirror 해야 하며, FE가 임의 checkpoint id를 만들면 안 된다.
- `run.recovery.recovery.resumeFromSeq` 가 있으면 FE는 그 이전 `seq` 를 다시 적용하려고 하면 안 된다. 기존 applied prefix는 그대로 유지하고 recovery banner만 갱신한다.

### 6.2.1 Canvas mutation envelope

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
  mutationVersion: 'v1';
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

type AgentRunResultSummary = {
  outputTemplateCode: string | null;
  draftCount: 1;
  totalMutations: number;
  completedAt: string;
};
```

`clientLayerKey` 는 run/draft 내부의 stable logical identifier이고, `layerId` 는 FE가 실제로 가진 physical identifier다. `createLayer` 에서 생성된 레이어는 가능하면 `desiredLayerId` 를 유지해야 하며, 이후 `updateLayer` 와 `deleteLayer` 는 같은 layer를 `layerId` 또는 `clientLayerKey + targetLayerVersion` 조합으로 안정적으로 참조해야 한다.

### 6.2.2 op별 FE adapter

FE는 `CanvasMutationEnvelope.commands[]` 를 주어진 순서대로 기존 command/save 경로에 적용한 뒤, envelope 단위 ack를 1건 제출해야 한다.

| `command.op` | FE 적용 경로 | v1 사용 여부 |
| --- | --- | --- |
| `createLayer` | `AddObjectsCommand` | 필수 |
| `updateLayer` | `UpdateObjectsCommand` | 내부 correction 용도로 허용 |
| `deleteLayer` | `DeleteObjectsCommand` | contract만 열어두고 user-facing flow는 defer |
| `saveTemplate` | `saveCanvas({ forceSave: true })` 또는 동등 강제 저장 경로 | 필수 |

중요 규칙은 아래와 같다.

- FE는 `canvas.mutation` 을 받으면 승인 UI 없이 바로 적용하되, `commands[]` 순서를 바꾸거나 envelope를 쪼개면 안 된다.
- FE는 `seq` 가 순차적일 때만 적용한다.
- FE는 동일 `mutationId` 중복 수신 시 재적용하지 않는다.
- FE는 `expectedBaseRevision` 또는 `targetLayerVersion` guard가 맞지 않으면 blind apply 대신 `rejected` ack와 command-level evidence를 돌려줘야 한다.
- FE는 command 경로를 우회해 store를 직접 mutate하지 않는다.

### 6.2.3 FE mutation ack 계약

`toolditor` 는 mutation을 적용한 뒤 결과를 canonical backend에 다시 제출해야 한다. 이 응답은 단순 성공/실패 ping이 아니라, `editor-local visible truth` 를 backend가 이해할 수 있게 만드는 handoff다.

```ts
type SubmitMutationAckRequest = {
  runId: string;
  traceId: string;
  mutationId: string;
  seq: number;
  status: 'applied' | 'noop_already_applied' | 'rejected';
  partialApplyDetected: boolean;
  targetPageId: string;
  baseRevision: number;
  resultingRevision: number | null;
  resolvedLayerIds: Record<string, string>;
  commandResults: Array<{
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
  }>;
  error: {
    code: string;
    message: string;
  } | null;
  clientObservedAt: string;
};
```

추가 규칙:

- FE는 `mutationId` 단위로 정확히 한 번의 terminal ack만 제출해야 한다.
- FE는 command 실행 전 `baseRevision` 을 읽고, 실행 후 `resultingRevision` 또는 save receipt 기반 revision을 채워야 한다.
- FE는 `createLayer` 중 실제 layer id가 seed와 달라졌다면 `resolvedLayerIds` 로 canonical 매핑을 돌려줘야 한다.
- FE는 일부 command만 성공한 경우에도 전체 envelope를 숨기지 않고 `partialApplyDetected=true` 와 `commandResults` 를 채워 보내야 한다.
- FE는 `commandResults` 를 원래 `commands[]` 순서대로 반환하고, layer version은 canonical source로 주장하지 말고 관측 증거(`targetLayerVersion`, `resultingLayerVersion`, `contentHash`, `tombstoneKey`)만 제공해야 한다.
- FE는 apply 결과를 backend에 제출하기 전 다음 `seq` 를 speculative apply하면 안 된다.
- FE는 reconnect 중 duplicate delivery를 감지하면 `noop_already_applied` 로 닫을 수 있지만, 그 근거는 `mutationId` 또는 동일 layer metadata여야 한다.

## 7. rollback / cancel / 오류 처리

### 7.1 run 시작 체크포인트

run 시작 직전에 FE는 현재 empty canvas 기준 checkpoint를 하나 만든다.

- checkpoint source: pageData + objectData + template save flags
- 용도: `첫 milestone save 이전` 전체 revert와 in-session 복구
- 범위: 해당 run에서 발생한 live mutation만 되돌린다.
- 성격: FE local recovery state이며 canonical durability source는 아니다.

### 7.2 FE rollback scope

FE는 backend/worker가 정한 rollback policy를 실행하는 `canvas executor` 여야 한다. 즉, rollback 판단은 backend canonical state가 하고, FE는 그 판단에 맞는 command/history 실행을 담당한다.

아래 표는 FE가 실제로 수행해야 하는 revert 범위를 고정한다.

| 상황 | FE action | FE가 되돌리는 것 | FE가 남겨야 하는 것 |
| --- | --- | --- | --- |
| 첫 visible mutation ack 이전 실패 | 추가 action 없음 또는 local no-op revert | 없음 또는 아직 paint되지 않은 transient state | run panel error만 남긴다. |
| visible mutation은 있었지만 milestone save 이전 실패/취소 | run 시작 checkpoint로 전체 revert | 해당 run의 create/update/delete 결과 전체 | 사용자 원래 canvas 상태 |
| milestone save 이후 open rollback group 실패/취소 | group-local compensation 또는 latest saved revision 기준 revert | 현재 `rollbackGroupId` 에 속한 placeholder, failed tail update, 임시 decoration | 마지막 save receipt에 포함된 editable draft |
| final save 실패 후 latest visible revision이 durable하지 않음 | latest saved revision으로 수렴시키는 compensation 우선, 실패 시 더 이상의 user-visible mutation 중단 | latest save 이후 tail mutation | 마지막 saved editable draft 또는 실패 배너가 붙은 현재 세션 화면 |

추가 규칙:

- FE는 `runId`, `draftId`, `rollbackGroupId` 메타데이터가 없는 객체를 agent auto-revert 대상으로 삼지 않는다.
- FE는 동일 `rollbackGroupId` 안의 compensation command를 기존 command path로 실행해야 한다. 직접 store mutation은 금지한다.
- FE는 milestone save 이후 `전체 run 자동 revert` 를 실행하지 않는다. 전체 revert는 사용자가 명시적으로 `agent 변경사항 되돌리기` 를 눌렀을 때만 허용한다.
- FE는 compensation 이후 `pendingMutationIds` 와 `appliedMutationIds` 를 재계산해 open group이 남지 않도록 해야 한다.

### 7.3 cancel

- FE는 `POST /api/agent-workflow/runs/:runId/cancel` 을 호출할 수 있어야 한다.
- cancel 요청 후 새 `canvas.mutation` 적용은 중단한다.
- 이미 milestone save로 닫힌 mutation은 자동 revert하지 않는다.
- 현재 open rollback group의 placeholder 정리나 tail compensation은 허용한다.
- 사용자는 `run 취소` 와 `agent 변경사항 되돌리기` 를 분리해 선택한다.

### 7.4 실패

- planning 실패: 캔버스 mutation 없이 run panel error만 노출한다.
- executing/applying 실패:
  - milestone save 이전이면 checkpoint 기준 전체 revert를 수행한다.
  - milestone save 이후면 open rollback group만 정리하고 마지막 saved editable draft를 유지한다.
- save 실패:
  - FE는 latest saved revision으로 되돌릴 수 있으면 그 상태로 수렴시킨다.
  - 그 복구도 확정하지 못하면 현재 화면은 유지하되 `working template 저장 실패` 상태를 분리 노출하고, 새로고침 시 latest save 기준 상태가 canonical임을 사용자에게 알려야 한다.

### 7.5 FE가 보관해야 하는 rollback 관련 기록

FE는 audit source of truth가 아니지만, 아래 정보는 세션 동안 유지해야 한다.

- `checkpointId`
- `rollbackGroupId`
- `nextExpectedSeq`
- `pendingMutationIds` / `appliedMutationIds`
- latest `resultingRevision`
- 마지막으로 성공한 `saveTemplate` 의 `savedRevision`

이 값들은 local UX 복구와 reconnect를 위해 유지하지만, durable audit record로 간주하지 않는다. canonical 기록은 backend의 ledger/event/save receipt가 가진다.

## 8. v1 호환성 원칙

- 기존 selection 기반 `툴디 AI` entry와 섞지 않는다.
- empty-canvas create flow는 `useAiEditEntryController()` 와 별도 controller/store를 사용한다.
- 기존 AI 편집 세션 중에는 agent create flow를 시작할 수 없다.
- live-commit이라도 모든 캔버스 변경은 기존 command/history/save 규칙을 지켜야 한다.
- v1 user scope는 create이지만 contract는 `updateLayer` 와 `deleteLayer` 를 이미 수용해야 한다.

## 9. 구현 추적 파일

이번 문서의 근거로 직접 확인한 주요 파일은 아래와 같다.

- `toolditor/pages/editor/[[...WorkingTemplateCode]].tsx`
- `toolditor/src/hooks/editor/useEditorQueryParams.ts`
- `toolditor/src/hooks/editor/useTemplateLoader.ts`
- `toolditor/src/features/layout/components/desktop/DesktopEditor.tsx`
- `toolditor/src/features/layout/components/mobile/MobileEditor.tsx`
- `toolditor/src/components/subHeader/shared/button/AiEdit.tsx`
- `toolditor/src/widgets/ai-edit-entry/model/useAiEditEntryController.tsx`
- `toolditor/src/widgets/ai-edit-entry/model/useAiEditEntryState.ts`
- `toolditor/src/widgets/ai-edit-entry/ui/EditableAiEntry.tsx`
- `toolditor/src/tools/toolditor/Toolditor.tsx`
- `toolditor/src/store/canvas.ts`
- `toolditor/src/store/object.ts`
- `toolditor/src/store/editor.ts`
- `toolditor/src/store/template.ts`
- `toolditor/src/store/history.ts`
- `toolditor/src/application/store/useEditSessionViewModel.ts`
- `toolditor/src/functions/canvas/saveCanvas.ts`
- `toolditor/src/commands/object/addObjectsCommand.ts`
- `toolditor/src/commands/object/updateObjectsCommand.ts`
- `toolditor/src/commands/object/deleteObjectsCommand.ts`

## 10. 문서 결론

v1에서 `toolditor` 는 planner가 아니라 `agent shell + live canvas executor` 로 정의해야 한다.

따라서 구현 단위는 아래처럼 나뉜다.

1. 빈 캔버스 전용 agent entry/controller 추가
2. FE agent run state store 추가
3. `POST /api/agent-workflow/runs` + event stream 연동
4. `canvas.mutation -> command adapter` 적용기 추가
5. checkpoint / cancel / revert UI 추가

이 선을 넘어서 planner, worker retry, provider 선택까지 FE에 넣기 시작하면 v1의 분리 원칙이 무너진다.
