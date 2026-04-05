# Tooldi Agent Backend v1 초기 뼈대 세팅 지시서 (Backend Only)

이 문서는 **AI AGENT가 바로 실행할 단일 작업 지시서**다.

이번 작업의 목표는 **Tooldi 자연어 에이전트 v1의 백엔드 런타임 뼈대만 정확히 세우는 것**이다.
프론트엔드(`toolditor`) 구조 추정, 에디터 내부 파일 생성, 기존 FE 디렉터리 수정은 **이번 범위에서 제외**한다.

즉, 이번 작업이 끝났을 때 아래만 성립하면 된다.

- 별도 TypeScript/Node 기반 **`Fastify Agent API` + `BullMQ Worker Runtime`** 구조가 잡혀 있다.
- `Redis/BullMQ`, `PostgreSQL`, object store placeholder를 포함한 **control plane / execution plane / transport plane / persistence plane** 의 뼈대가 코드로 드러난다.
- public run API, SSE, mutation ack, cancel, worker callback, queue handoff, persistence, contracts의 **골격**이 모두 존재한다.
- 실제 LLM/provider/image/tool 구현은 stub여도 된다.
- FE는 외부 시스템으로 취급하며, **HTTP/SSE 계약의 상대편** 으로만 가정한다.

이번 작업의 목적은 기능 시연이 아니라 **ownership이 무너지지 않는 초기 골격** 을 만드는 것이다.

---

## 1. 문서 우선순위 (SSOT)

작업 중 충돌이 나면 아래 우선순위를 따른다.

1. `tooldi-natural-language-agent-v1-architecture.md`
2. `tooldi-agent-workflow-v1-functional-spec-to-be.md`
3. `tooldi-agent-workflow-v1-backend-boundary.md`
4. `tooldi-agent-workflow-v1-scope-operations-decisions.md`

이번 작업은 **backend only** 이므로 `toolditor-agent-workflow-v1-client-boundary.md` 는 구현 지시의 직접 근거로 사용하지 않는다. 다만 northbound interface 이름 확인이 필요할 때만 참고한다.

고정 규칙:

- artifact identity, completion moment, lifecycle ownership, ordering, rollback semantics는 `architecture` 기준으로 닫는다.
- public request/response/tool schema와 persistence projection은 `functional-spec` 기준으로 맞춘다.
- backend/control-plane vs worker/execution-plane 분리는 `backend-boundary` 기준으로 맞춘다.
- v1에서 하지 않을 것은 `scope-operations-decisions` 기준으로 잠근다.

---

## 2. 이번 작업의 범위와 비범위

### 2.1 범위에 포함되는 것

이번 작업은 아래만 포함한다.

- 신규 `tooldi-agent-runtime/` 워크스페이스 생성
- `agent-api` 앱 생성
- `agent-worker` 앱 생성
- shared contracts/domain/config/observability/persistence/tool-registry/tool-adapters/testkit 패키지 생성
- `POST /runs`, `GET /events`, `POST /mutation-acks`, `POST /cancel` 의 public contract 골격 생성
- worker callback surface 골격 생성
- BullMQ queue producer/consumer skeleton 생성
- canonical persistence 스키마 placeholder 생성
- README / smoke command / runbook 초안 생성

### 2.2 범위에서 제외되는 것

아래는 이번 작업에서 하지 않는다.

- `toolditor` 내부 파일 생성/수정
- 에디터 command wiring 추정 구현
- 실제 FE 컴포넌트, hook, controller 작성
- 기존 editor/template save path 구현
- 실제 LLM/provider/model/image API 연동
- 실제 layout intelligence/creative quality 구현
- exact auth/session integration 완성
- exact deployment pipeline 완성
- heavyweight workflow engine(Temporal 등) 도입

### 2.3 중요한 범위 해석

- 이번 작업은 **에이전트를 위한 백엔드만** 만든다.
- FE는 존재한다고 가정하되, 구현 대상이 아니라 **외부 클라이언트** 로만 본다.
- 따라서 문서 안에서 FE와 관련해 다룰 수 있는 것은 **northbound contract shape** 와 **mutation ack / SSE interaction assumption** 뿐이다.
- `toolditor` 내부 파일명, 실제 모듈 구조, 기존 command 경로를 추정해서 코드에 반영하지 마라.

---

## 3. 절대 바꾸지 말아야 할 설계 결정

### 3.1 v1 제품 범위

- 사용자-visible v1 scope는 `empty_canvas -> create_draft` 1종만 연다.
- 대표 입력은 빈 캔버스 기준 자연어 1건이다.
- 결과물은 editable draft 1개다.
- northbound user-facing existing-canvas update/delete flow는 열지 않는다.

### 3.2 ownership

- `Fastify Agent API` 는 **run control plane** 이다.
- `BullMQ Worker Runtime` 은 **execution plane** 이다.
- `Redis/BullMQ` 는 **transport plane** 이다.
- canonical run state / retry budget / cancel fence / terminal 판정 / completion close는 backend가 가진다.
- planning/tool execution/mutation proposal/finalize payload 생성은 worker가 가진다.
- queue는 canonical state 저장소가 아니다.

### 3.3 v1 lightweight 원칙

- long-running HTTP 하나로 전체 run을 처리하지 않는다.
- worker와 client 사이 direct socket을 만들지 않는다.
- mutation ack용 second queue를 만들지 않는다.
- queue native retry/backoff를 user-visible retry owner로 사용하지 않는다.
- v1 queue publish는 기본 `attempts=1` 로 고정한다.
- retry가 필요하면 backend가 새 `attemptSeq` 와 새 `queueJobId` 로 재enqueue 한다.

### 3.4 확장성 원칙

- v1 제품 표면은 create-only지만 내부 contract는 create-only로 잠그지 않는다.
- `createLayer`, `updateLayer`, `deleteLayer`, `saveTemplate` op family는 이미 포함한다.
- 단, `updateLayer`, `deleteLayer` 는 same-run internal correction / cleanup / compensation 용도로만 본다.

---

## 4. 최종 목표 구조

이번 작업이 끝났을 때 생성되어야 할 최종 디렉터리 목표는 아래와 같다.

```text
<workspace-root>/
  tooldi-agent-runtime/
    README.md
    package.json
    pnpm-workspace.yaml
    tsconfig.base.json
    .gitignore
    .editorconfig
    apps/
      agent-api/
        package.json
        tsconfig.json
        src/
          main.ts
          app.ts
          plugins/
            config.ts
            logger.ts
            db.ts
            queue.ts
            sseHub.ts
          routes/
            public/
              runs.post.ts
              run-events.sse.ts
              mutation-acks.post.ts
              cancel.post.ts
            internal/
              worker-phase.post.ts
              worker-mutations.post.ts
              worker-finalize.post.ts
              worker-heartbeat.post.ts
          services/
            runBootstrapService.ts
            runEventService.ts
            runAckService.ts
            runFinalizeService.ts
            runCancelService.ts
            runRecoveryService.ts
          repositories/
            runRequestRepository.ts
            runRepository.ts
            runAttemptRepository.ts
            runEventRepository.ts
            mutationLedgerRepository.ts
            costSummaryRepository.ts
            draftBundleRepository.ts
            completionRepository.ts
          lib/
            ids.ts
            errors.ts
            time.ts

      agent-worker/
        package.json
        tsconfig.json
        src/
          main.ts
          worker.ts
          jobs/
            processRunJob.ts
          phases/
            hydratePlanningInput.ts
            buildNormalizedIntent.ts
            buildExecutablePlan.ts
            emitSkeletonMutations.ts
            emitRefinementMutations.ts
            finalizeRun.ts
          clients/
            backendCallbackClient.ts
          tools/
            registry.ts
            adapters/
              imagePrimitiveAdapter.ts
              assetStorageAdapter.ts
              textLayoutHelperAdapter.ts
          lib/
            config.ts
            logger.ts
            time.ts

    packages/
      contracts/
        package.json
        tsconfig.json
        src/
          public/
            run-request.ts
            run-accepted.ts
            public-run-event.ts
          worker/
            run-job-envelope.ts
            worker-callbacks.ts
          canvas/
            canvas-mutation.ts
            mutation-ack.ts
            template-save-receipt.ts
          artifacts/
            live-draft-artifact-bundle.ts
            run-result.ts
          index.ts

      domain/
        package.json
        tsconfig.json
        src/
          run-status.ts
          attempt-state.ts
          phases.ts
          ids.ts
          invariants.ts
          index.ts

      tool-registry/
        package.json
        tsconfig.json
        src/
          registry.ts
          definitions/
            image-generate.ts
            image-edit.ts
            asset-store.ts
            text-layout.ts
          index.ts

      tool-adapters/
        package.json
        tsconfig.json
        src/
          primitives/
            imagePrimitiveClient.ts
          storage/
            assetStorageClient.ts
          helpers/
            textLayoutHelper.ts
          index.ts

      persistence/
        package.json
        tsconfig.json
        src/
          pg/
            client.ts
          object-store/
            objectStoreClient.ts
          sql/
            0001_agent_runtime_init.sql
          index.ts

      observability/
        package.json
        tsconfig.json
        src/
          logger.ts
          tracing.ts
          correlation.ts
          index.ts

      config/
        package.json
        tsconfig.json
        src/
          env.ts
          index.ts

      testkit/
        package.json
        tsconfig.json
        src/
          fakes/
            fakeRunRequest.ts
            fakeRunAccepted.ts
            fakeMutationEnvelope.ts
          helpers/
            createTestRun.ts
          index.ts
```

---

## 5. 기술 선택 원칙

### 5.1 언어/런타임

- TypeScript / Node 로 고정한다.

### 5.2 backend framework

- control plane은 `Fastify` 로 고정한다.

### 5.3 queue

- `Redis + BullMQ` 로 고정한다.

### 5.4 schema/contract SSOT

- HTTP / SSE / queue / worker callback / mutation envelope / ack schema는 단일 TS source 에서 관리한다.
- 가능하면 `TypeBox` 기반으로 schema와 타입을 함께 관리한다.
- Fastify validation과 shared contracts가 같은 source를 보도록 만든다.
- any/object 난립 금지.

### 5.5 package manager

- 별도 규칙이 없다면 `pnpm workspace` 로 구성한다.

---

## 6. 반드시 만들어야 하는 public contract

### 6.1 public endpoint

다음 endpoint는 반드시 코드로 존재해야 한다.

- `POST /api/agent-workflow/runs`
- `GET /api/agent-workflow/runs/:runId/events`
- `POST /api/agent-workflow/runs/:runId/mutation-acks`
- `POST /api/agent-workflow/runs/:runId/cancel`

### 6.2 internal worker callback endpoint

다음 internal callback surface도 반드시 코드로 존재해야 한다.

- `POST /internal/agent-workflow/runs/:runId/worker/phase`
- `POST /internal/agent-workflow/runs/:runId/worker/mutations`
- `POST /internal/agent-workflow/runs/:runId/worker/finalize`
- `POST /internal/agent-workflow/runs/:runId/worker/heartbeat`

### 6.3 최소 타입/스키마

아래 타입은 반드시 shared contracts 패키지에 있어야 한다.

- `StartAgentWorkflowRunRequest`
- `RunAccepted`
- `PublicRunEvent`
- `RunJobEnvelope`
- `CanvasMutationEnvelope`
- `MutationApplyAckRequest`
- `MutationApplyAckResponse`
- `TemplateSaveReceipt`
- `LiveDraftArtifactBundle`
- `RunResult`
- `AgentRunResultSummary`

### 6.4 public request 규칙

- FE/외부 클라이언트는 `clientRequestId` 를 보낸다.
- public create-run request는 client-authored `traceId` 를 받지 않는다.
- canonical `requestId`, `runId`, `traceId`, `deadlineAt` 은 backend가 acceptance 후 발급한다.
- accepted response는 최소 아래를 포함해야 한다.
  - `runId`
  - `traceId`
  - `status=queued`
  - `streamUrl`
  - `cancelUrl`
  - `mutationAckUrl`

### 6.5 SSE event family

최소 아래 event family를 shared contracts에 둔다.

- `run.accepted`
- `run.phase`
- `run.log`
- `canvas.mutation`
- `run.cancel_requested`
- `run.completed`
- `run.failed`
- `run.cancelled`

---

## 7. `agent-api` 에서 해야 할 일

### 7.1 `agent-api` 의 역할

`agent-api` 는 planner가 아니라 **durable orchestration control plane skeleton** 이다.

반드시 아래 책임이 코드 구조로 드러나야 한다.

- request validation
- auth/session placeholder
- page lock placeholder
- idempotency/dedupe placeholder
- request row / run row / attempt row bootstrap
- snapshot reference 저장 placeholder
- queue enqueue
- SSE event fan-out
- mutation ack 수락 및 기록
- worker phase/mutation/finalize/heartbeat callback 수락 및 기록
- final artifact / completion row 저장 placeholder
- cancel acceptance
- watchdog / timeout / recovery placeholder

### 7.2 반드시 만들 서비스

- `runBootstrapService.ts`
- `runEventService.ts`
- `runAckService.ts`
- `runFinalizeService.ts`
- `runCancelService.ts`
- `runRecoveryService.ts`

각 서비스는 로직이 비어 있어도 **누가 무엇을 소유하는지** 가 드러나야 한다.

### 7.3 bootstrap 최소 동작

`POST /runs` 의 최소 skeleton 동작은 아래를 만족해야 한다.

1. payload validation
2. empty-canvas/create-from-empty-canvas policy check placeholder
3. dedupe key 계산
4. `requestId`, `runId`, `traceId`, `deadlineAt` 발급
5. request row / run row / attempt row persist placeholder
6. queue enqueue
7. `RunAccepted` 반환
8. `run.accepted` 혹은 `run.phase(queued)` 를 append 가능한 상태 준비

### 7.4 canonical writer 규칙

- durable run row/event/cost/mutation/completion writer는 backend만 가능해야 한다.
- worker와 client는 backend에 payload를 제출할 수는 있어도 canonical DB row를 직접 쓰면 안 된다.
- queue state만으로 run 상태를 판정하면 안 된다.

### 7.5 SSE 규칙

- event stream은 SSE를 우선한다.
- append-only event log offset을 SSE event id 로 사용할 수 있게 구조를 잡아라.
- `Last-Event-ID` 기반 reconnect 를 나중에 붙일 수 있도록 event repository interface를 설계하라.

---

## 8. `agent-worker` 에서 해야 할 일

### 8.1 `agent-worker` 의 역할

`agent-worker` 는 별도 프로세스의 execution plane 이다.
API 프로세스 안에서 planner/executor 로직을 직접 돌리면 안 된다.

### 8.2 worker 최소 phase 골격

아래 phase 파일을 만들고, 지금은 stub라도 phase 이름과 handoff 방향이 살아 있어야 한다.

- `hydratePlanningInput.ts`
- `buildNormalizedIntent.ts`
- `buildExecutablePlan.ts`
- `emitSkeletonMutations.ts`
- `emitRefinementMutations.ts`
- `finalizeRun.ts`

### 8.3 현재 단계 구현 기대치

이번 작업에서 worker는 creative quality를 낼 필요 없다. 대신 아래는 반드시 지켜라.

- `RunJobEnvelope` 를 consume한다.
- request/snapshot ref를 읽는 자리 구조가 있어야 한다.
- `NormalizedIntent` / `ExecutablePlan` stub를 만든다.
- skeleton mutation batch를 만들 수 있는 자리가 있어야 한다.
- backend callback client를 통해 phase / mutation / finalize / heartbeat payload를 보내는 구조가 있어야 한다.
- client canvas를 직접 건드리면 안 된다.
- terminal status를 worker가 author할 수는 있지만 durable close는 backend가 하게 둬야 한다.

### 8.4 tool registry / adapters

이번 단계에서 실제 provider integration은 최소화해도 되지만 아래 package 뼈대는 만들어라.

- `tool-registry`
- `tool-adapters`
- `imagePrimitiveAdapter`
- `assetStorageAdapter`
- `textLayoutHelperAdapter`

원칙:

- primitive는 후보 공급자다.
- orchestration owner는 worker다.
- provider/client 세부 구현이 public contract로 새어 나오면 안 된다.

---

## 9. queue / attempt / retry 규칙

### 9.1 BullMQ 사용 규칙

- `agent-api` 는 `Queue` producer와 `QueueEvents` subscriber를 소유한다.
- `agent-worker` 는 `Worker` consumer를 소유한다.
- `queueJobId` 는 custom `jobId` 와 동일한 colon-free 값으로 고정한다.
- 기본 publish 옵션은 `attempts=1` 이다.

### 9.2 상태 해석 규칙

- `QueueEvents` 의 `active`, `completed`, `failed`, `stalled` 는 transport signal일 뿐이다.
- canonical run state는 backend row/event 기준으로 판단한다.
- `enqueued -> dequeued` 전이는 QueueEvents 만으로 확정하지 않는다. 첫 유효 heartbeat 또는 첫 phase append 가 들어왔을 때 worker lease owner를 인정하는 구조를 잡아라.

### 9.3 retry 규칙

- hidden queue-native retry 금지.
- retry가 필요하면 backend가 새 `attemptSeq`, 새 `attemptId`, 새 `queueJobId` 로 다시 enqueue 하게 만들어라.
- retry budget과 cancel fence의 canonical owner는 backend다.

---

## 10. persistence 에서 해야 할 일

### 10.1 최소 저장소 구조

실제 ORM/쿼리 레이어와 상관없이, 개념적으로 아래 저장 경계가 살아 있어야 한다.

- Agent Backend control-plane DB
- Agent Backend event/log store
- Request/Snapshot/Object store ref
- Queue broker transport state

### 10.2 최소 테이블/저장 엔티티

SQL migration 또는 동등한 migration 파일에 최소 아래 개념이 드러나야 한다.

- `agent_run_requests`
- `agent_runs`
- `agent_run_attempts`
- `agent_run_events`
- `agent_mutation_ledger` 또는 동등 mutation ledger
- `agent_cost_summaries`
- `agent_live_draft_bundles`
- `agent_run_completions`

필드까지 완벽할 필요는 없지만 아래 식별자 축은 반드시 반영하라.

- `httpRequestId`
- `clientRequestId`
- `requestId`
- `runId`
- `traceId`
- `attemptId`
- `attemptSeq`
- `queueJobId`

### 10.3 object store placeholder

- raw request / normalized request / snapshot / validated plan / final bundle diff 같은 큰 payload는 DB inline이 아니라 ref 저장 구조로 가야 한다.
- 실제 S3 wiring이 아직 없더라도 `objectStoreClient.ts` 와 ref type은 만들어라.

### 10.4 prompt / tool log 저장 원칙

- raw prompt 전문은 `agent_run_requests` + restricted artifact ref 에 1회만 durable 저장 가능하도록 구조를 만들어라.
- SSE/event/log 에는 redacted preview + hash 만 남기는 방향으로 인터페이스를 설계하라.
- tool execution log는 `toolCallId`, `traceId`, `runId`, `attemptSeq`, `queueJobId`, `toolName`, `toolVersion`, `status`, `inputRef`, `outputRef`, `emittedMutationIds` 를 수용할 수 있게 구조를 남겨라.

---

## 11. contracts 패키지에서 반드시 포함해야 할 핵심 필드

### 11.1 `CanvasMutationEnvelope`

최소 아래 의미를 담아야 한다.

- `mutationId`
- `runId`
- `traceId`
- `draftId`
- `documentId`
- `pageId`
- `seq`
- `commitGroup`
- `dependsOnSeq`
- `idempotencyKey`
- `expectedBaseRevision`
- `ownershipScope`
- `commands[]`
- `rollbackHint`
- `emittedAt`
- `deliveryDeadlineAt`

### 11.2 `MutationApplyAckRequest`

최소 아래 의미를 담아야 한다.

- `runId`
- `traceId`
- `mutationId`
- `seq`
- `status`
- `targetPageId`
- `baseRevision`
- `resultingRevision`
- `resolvedLayerIds`
- `commandResults`
- `clientObservedAt`

### 11.3 intent / planner 관련 contract

아래 개념도 타입 수준에서 반영하라.

- `IntentEnvelope.operationFamily` 는 최소 `create_template`, `update_layer`, `delete_layer`
- `futureCapableOperations`
- `PlannerInputEnvelope.registrySnapshot.enabledTools[]`
- persisted plan은 canonical `toolName` + `toolVersion` 만 남기도록 타입을 잡는다.

### 11.4 identifier helper

`packages/domain` 또는 `apps/agent-api/lib/ids.ts` 에 아래 발급 자리가 있어야 한다.

- `httpRequestId`
- `requestId`
- `runId`
- `traceId`
- `attemptId`
- `queueJobId`

---

## 12. README / 운영 메모에 반드시 남겨야 할 것

이번 작업은 FE 구현을 하지 않으므로, README 에 아래를 명시적으로 남겨라.

- FE/외부 클라이언트는 `POST /runs` 로 시작하고, SSE 를 구독하며, `POST /mutation-acks`, `POST /cancel` 을 호출해야 한다.
- create-run request 는 client-authored `traceId` 를 보내면 안 된다.
- `runId`, `traceId`, `streamUrl`, `cancelUrl`, `mutationAckUrl` 은 accepted response 에서 받는다.
- mutation apply 의 실제 editor semantics 는 backend 범위 밖이며, backend는 `CanvasMutationEnvelope` 와 `MutationApplyAckRequest` 계약만 책임진다.

---

## 13. 테스트/검증 최소 기준

이번 작업은 기능 완성 전 단계지만, 아래는 반드시 가능해야 한다.

### 13.1 정적 검증

- workspace install 가능
- TypeScript typecheck 가능
- Fastify app 부팅 가능
- Worker 프로세스 부팅 가능

### 13.2 최소 통합 smoke

아래 시나리오가 skeleton 수준으로 돌아야 한다.

1. `POST /api/agent-workflow/runs` 호출
2. 유효 payload면 `202 + RunAccepted` 반환
3. worker가 job을 consume
4. backend가 SSE 로 최소 `run.accepted` / `run.phase` 류 event 를 보낼 수 있음
5. `POST /mutation-acks` 가 schema validation과 basic durable write placeholder 를 통과
6. `POST /cancel` 이 `cancel_requested` 상태를 기록할 수 있음
7. worker internal callback route가 phase / mutation / finalize / heartbeat payload 를 수락할 수 있음

---

## 14. 권장 작업 순서

반드시 아래 순서를 크게 지켜라.

1. `tooldi-agent-runtime/` workspace root 생성
2. workspace/package manager/tsconfig/logging/config 뼈대 생성
3. `packages/contracts` 먼저 생성
4. `packages/domain`, `config`, `observability`, `persistence` 생성
5. `apps/agent-api` 생성
6. public routes + internal worker callback routes 생성
7. `apps/agent-worker` 생성
8. queue consume + backend callback skeleton 생성
9. migration / object store placeholder 생성
10. README / runbook / smoke command 정리
11. 최종 typecheck 및 basic smoke 정리

---

## 15. 완료 정의 (Definition of Done)

이번 작업은 아래를 만족하면 완료다.

### 15.1 구조

- [ ] `tooldi-agent-runtime/` 가 생성되어 있다.
- [ ] `agent-api` 와 `agent-worker` 가 분리된 앱으로 존재한다.
- [ ] `contracts`, `domain`, `tool-registry`, `tool-adapters`, `persistence`, `observability`, `config`, `testkit` 패키지가 존재한다.

### 15.2 경계

- [ ] API handler 안에 planner/tool 실행이 직접 들어가 있지 않다.
- [ ] worker가 client/editor를 직접 mutate하지 않는다.
- [ ] queue를 source of truth처럼 사용하지 않는다.
- [ ] retry/cancel owner가 backend에 남아 있다.

### 15.3 계약

- [ ] public endpoints 4개가 코드상 존재한다.
- [ ] internal worker callback endpoints 4개가 코드상 존재한다.
- [ ] shared contracts 패키지에 핵심 request/event/mutation/ack/result 타입이 존재한다.
- [ ] `createLayer`, `updateLayer`, `deleteLayer`, `saveTemplate` op family가 contract에 존재한다.
- [ ] `clientRequestId`, `requestId`, `runId`, `traceId`, `attemptSeq`, `queueJobId` 축이 코드 구조에 반영되어 있다.

### 15.4 실행성

- [ ] install / typecheck / basic boot 가 가능하다.
- [ ] 최소 smoke path 가 README 또는 실행 명령으로 남아 있다.

---

## 16. 마지막 지시

이번 작업의 목적은 **기능을 멋지게 시연하는 것** 이 아니다.
목적은 **백엔드 ownership이 안 무너지는 초기 골격을 정확히 세우는 것** 이다.

그러므로 아래 기준으로 판단하라.

- 로직이 비어 있어도 경계가 맞으면 괜찮다.
- 임시값이 있어도 contract가 맞으면 괜찮다.
- provider wiring 이 없어도 queue/control plane/worker split 이 맞으면 괜찮다.
- 반대로, 기능이 조금 더 돌아가더라도 ownership이 흐려지면 실패다.

작업 완료 후에는 아래를 남겨라.

1. 생성/수정한 주요 디렉터리 트리
2. 각 앱/패키지 책임 요약
3. 아직 stub/TODO 로 남긴 부분
4. 바로 다음 구현 우선순위 5개
