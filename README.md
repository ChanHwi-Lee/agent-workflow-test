# 흐름

<img width="6953" height="8100" alt="mermaid-diagram-2026-04-06-091504" src="https://github.com/user-attachments/assets/10f31bd3-6cbc-41b5-868b-d908d7a64638" />



# agent-workflow-test

2026-04-06 기준 진행 상태 메모.

## 범위

- 이 저장소에는 Tooldi agent workflow v1 문서들과 `tooldi-agent-runtime/` backend workspace만 포함했다.
- `toolditor/` 는 의도적으로 제외했다.

## 문서 상태

- 아래 문서들의 public/shared contract naming policy를 camelCase로 정리했다.
  - `tooldi-agent-workflow-v1-functional-spec-to-be.md`
  - `tooldi-agent-workflow-v1-backend-boundary.md`
  - `toolditor-agent-workflow-v1-client-boundary.md`
  - `tooldi-agent-backend-v1-bootstrap-instructions.md`
- 정책은 다음으로 고정했다.
  - public REST JSON / SSE / shared TS contract / worker callback payload = camelCase
  - DB table / column / SQL migration = snake_case
  - route layer에서 snake_case serializer/mapper를 두지 않음

## 현재까지 완료한 것

- bootstrap step 1: `tooldi-agent-runtime/` workspace root 생성
- bootstrap step 2: `pnpm` workspace, `tsconfig`, root config skeleton 생성
- bootstrap step 3: `packages/contracts` 생성
- bootstrap step 4: `packages/domain`, `packages/config`, `packages/observability`, `packages/persistence` 생성
- bootstrap step 5: `apps/agent-api` 생성
- bootstrap step 6: public/internal route + contract hardening 완료
- bootstrap step 7: `apps/agent-worker` execution-plane skeleton 생성
- bootstrap step 8: BullMQ queue consume + backend callback HTTP skeleton 연결
- bootstrap step 9: backend-owned lease / stalled / retry skeleton 연결
- recovery projection skeleton: `run.recovery` public contract + backend decision snapshot + `repairContext` handoff 연결
- happy-path phase A: backend finalization chain materialization 연결

### 구현된 주요 골격

- `packages/contracts`
  - public/canvas/worker/artifact 계약 정의 존재
  - `run.recovery` public contract와 worker `repairContext` 계약 존재
- `packages/domain`
  - run status, attempt state, workflow phase, invariant, ID helper 존재
- `packages/config`
  - API/worker 공통 env loader 존재
- `packages/observability`
  - logger, tracing, correlation skeleton 존재
- `packages/persistence`
  - PG placeholder, shared filesystem/memory object store placeholder, 초기 SQL migration 존재
- `packages/tool-registry`
  - enabled tool definition / registry skeleton 존재
- `packages/tool-adapters`
  - image/asset/text-layout adapter interface와 placeholder 구현 존재
- `packages/testkit`
  - fake run request / mutation / test run helper 존재
- `apps/agent-api`
  - `Fastify` app skeleton 존재
  - plugin: config/logger/db/queue/sseHub 존재
  - service: bootstrap/event/ack/finalize/cancel/recovery/watchdog skeleton 존재
  - repository skeleton 존재
- `apps/agent-worker`
  - separate execution-plane app skeleton 존재
  - `processRunJob` orchestration, BullMQ worker consumer, backend callback HTTP client 존재
  - boot smoke / orchestration test 존재

### 현재 구현된 canonical happy-path 범위

- backend 기준 happy-path는 아래 chain까지 초안 수준으로 materialize 된다.

```text
POST /runs
-> BullMQ enqueue/dequeue
-> worker hydrate / phase orchestration
-> SSE canvas.mutation
-> FE 또는 smoke harness 의 MutationApplyAck
-> worker finalize callback
-> backend finalizer
-> LiveDraftArtifactBundle 저장
-> RunCompletionRecord 저장
-> run.completed SSE
```

- 즉 현재는 단순 transport 성공만이 아니라 backend 가 `EditableBannerDraftCommitPayload -> LiveDraftArtifactBundle -> RunCompletionRecord` chain 을 실제로 생성하는 단계까지 들어가 있다.
- 다만 이 happy-path 는 아직 prototype close다.
  - `latestSaveReceiptId`, `outputTemplateCode` 같은 save evidence 는 현재 worker/smoke 가 공급하는 synthetic placeholder 를 사용한다.
  - 실제 editor save pipeline 이 연결되면 이 synthetic evidence 는 editor/save layer 가 공급하는 실증 값으로 대체되어야 한다.

## 현재 확인된 상태

- 아래 명령은 통과하는 상태다.

```bash
cd tooldi-agent-runtime
pnpm typecheck
pnpm build
npm test
```

- real cross-process transport smoke:

```bash
cd tooldi-agent-runtime
pnpm smoke:transport
```

- pickup-timeout retry smoke:

```bash
cd tooldi-agent-runtime
pnpm smoke:retry
```

- 최소 worker boot smoke:

```bash
cd tooldi-agent-runtime
WORKER_EXIT_AFTER_BOOT=true WORKER_QUEUE_TRANSPORT_MODE=disabled pnpm --filter @tooldi/agent-worker start
```

- real transport smoke는 아래처럼 API와 worker를 따로 띄우는 기준이다.
- 아래 명령은 프로세스를 따로 띄우는 수동 boot 경로일 뿐이며, 실제 end-to-end 검증은 위의 `pnpm smoke:transport`, `pnpm smoke:retry` 가 담당한다.

```bash
cd tooldi-agent-runtime
pnpm --filter @tooldi/agent-api start
AGENT_INTERNAL_BASE_URL=http://127.0.0.1:3000 pnpm --filter @tooldi/agent-worker start
```

- 기본 runtime 모드는 `BullMQ + Redis` transport를 사용한다.
- 기본 object store placeholder 모드는 프로세스 간 공유 가능한 local filesystem 이다.
- 테스트와 boot smoke만 `API_QUEUE_TRANSPORT_MODE=memory`, `WORKER_QUEUE_TRANSPORT_MODE=disabled`, `WORKER_EXIT_AFTER_BOOT=true` 같은 harness 전용 모드를 사용한다.
- `pnpm smoke:transport` 는 현재 backend happy-path 를 실제로 검증한다.
  - API accepted response
  - BullMQ enqueue/dequeue
  - worker hydrate
  - SSE `canvas.mutation`
  - mutation ack
  - finalize callback
  - `run.completed`
- `npm test` 는 route/service/unit 수준에서 recovery projection 과 finalization materialization 을 함께 검증한다.
- FE/외부 클라이언트는 `POST /runs` 로 시작하고 SSE 를 구독하며 `POST /mutation-acks`, `POST /cancel` 을 호출해야 한다.
- create-run request 에 client-authored `traceId` 를 보내면 안 된다.
- `runId`, `traceId`, `streamUrl`, `cancelUrl`, `mutationAckUrl` 은 accepted response 에서 받는다.
- editor mutation apply semantics 자체는 backend 책임이 아니며, backend는 `CanvasMutationEnvelope` 와 `MutationApplyAckRequest` 계약만 책임진다.

- `agent-api` 는 control-plane skeleton까지만 구현돼 있다.
- `runBootstrapService` 는 ID 발급, placeholder request/snapshot 저장, BullMQ enqueue, accepted/queued event append까지 들어가 있다.
- public/internal route 파일과 registration 이 존재한다.
- route params/query/body/response schema authority는 `packages/contracts` 기준으로 맞췄다.
- `/internal/.../events` 는 Fastify body schema 대신 shared TypeBox contract validator를 route entry 에서 사용한다.
- `agent-api` 는 `Queue` producer와 `QueueEvents` subscriber를 소유한다. raw transport signal은 internal telemetry/watchdog input으로만 쓰고 public SSE/run.log source로 승격하지 않는다.
- `agent-api` watchdog은 `QueueEvents` 와 pickup timeout을 transport trigger로만 해석하고, canonical run/attempt state는 backend row/event 기준으로 판정한다.
- `enqueued -> dequeued` 전이는 첫 유효 heartbeat 또는 첫 phase append가 들어와야 lease owner를 인정한다.
- retry는 queue-native retry가 아니라 backend가 새 `attemptSeq`, 새 `attemptId`, 새 `queueJobId` 로 delayed re-enqueue 하는 방식으로만 연다.
- visible ack 0건이면 pickup timeout / stalled / failed transport signal에서 1회 retry를 열 수 있고, visible ack 이후에는 blind retry를 열지 않는다.
- retry enqueue 실패나 enqueue timeout은 backend가 `queue_publish_failed` / `enqueue_timeout` 으로 terminal close 한다.
- `QueueEvents.completed` 이후 finalize callback이 grace window 안에 오지 않으면 backend watchdog가 최소 terminal recovery를 수행한다.
- backend watchdog 는 recovery decision 을 placeholder row로 남기고 필요 시 `run.recovery` SSE 를 먼저 발행한다.
- pre-ack retry 는 `run.recovery(auto_retrying)` 를 남긴 뒤 새 attempt 를 연다.
- post-ack failure 는 현재 full resume engine 대신 `run.recovery(not_retryable|finalize_only)` projection 후 보수적으로 닫는다.
- `agent-worker` 는 separate process boundary를 유지한 채 phase stub를 순서대로 연결한다.
- `agent-worker` 는 BullMQ `Worker` consumer를 가지고 `RunJobEnvelope` 기반 `processRunJob` orchestration path를 실행한다.
- `agent-worker` 는 backend callback을 canonical internal HTTP routes로 호출하고, durable close는 backend에 남긴다.
- API와 worker는 같은 filesystem object-store root를 공유해 `requestRef` / `snapshotRef` hydrate가 실제 분리 프로세스에서 가능하다.
- worker 는 `normalizedIntentRef`, `executablePlanRef`, `repairContext` 를 받아 finalize handoff 에 실을 수 있다.
- backend finalizer 는 mutation ledger + ack evidence + finalize payload 를 읽어 committed bundle/completion row를 materialize 한다.
- `completed` 는 save evidence 가 있을 때만 허용되고, 없으면 `save_failed_after_apply` 로 downgrade 된다.
- spring worker path 는 이제 opt-in real Tooldi source mode를 가진다.
  - `TOOLDI_CATALOG_SOURCE_MODE=tooldi_api`
  - `TOOLDI_CONTENT_API_BASE_URL=http://localhost:<port>`
  - active family: `background`, `graphic(shape)`, `font`
  - worker 는 `run.log` 에 query count / selected serial / selected font token 을 남긴다.
- real Tooldi source mode는 `localhost` host만 지원한다. `127.0.0.1` 은 PHP local host/cookie policy 때문에 의도적으로 막았다.

## 아직 안 된 것

- 실제 editor save pipeline 연동
  - synthetic `latestSaveReceiptId`, `outputTemplateCode` 를 실제 editor/save layer evidence 로 교체해야 한다.
- visible ack 이후 `resumeFromSeq` / ledger-safe resume 실행
- rollback / compensation canonical orchestration
- final save / finalize grace recovery reconstruction 고도화
- DB/object store/repository 의 production-grade durability
- runtime runbook / operator 문서 정리

## 주의할 점

- 현재 queue / db / object store / SSE / repository 대부분은 placeholder 또는 in-memory 구현이다.
- BullMQ queue와 worker callback HTTP transport는 연결됐고, retry/lease/watchdog skeleton 도 있다. 다만 recovery 는 projection skeleton 수준이며 full resume/rollback engine 은 아니다.
- durable canonical writer ownership은 문서상 backend 기준으로 맞춰놨지만, DB/object store의 실제 production durability는 아직 아님.
- 현재 `run.completed` happy-path 는 backend 가 canonical bundle/completion chain 을 만들 수 있다는 뜻이지, real editor save evidence 연동이 끝났다는 뜻은 아니다.

## 내일 바로 이어서 볼 파일

- `tooldi-agent-backend-v1-bootstrap-instructions.md`
- `tooldi-agent-workflow-v1-backend-boundary.md`
- `tooldi-agent-workflow-v1-functional-spec-to-be.md`
- `tooldi-agent-runtime/apps/agent-worker/src/worker.ts`
- `tooldi-agent-runtime/apps/agent-worker/src/jobs/processRunJob.ts`

## 다음 작업 권장 순서

1. 실제 editor 한 세션과 happy-path integration spike 수행
2. synthetic save evidence 를 editor/save layer evidence 로 교체
3. visible ack 이후 resume / rollback / finalize reconstruction 설계 재개
4. DB/object store durability 고도화

## 후속 구현 로드맵

- `create_template` intelligence layer의 capability catalog / selection policy / candidate schema / hierarchy 기준선은 [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md) 에 별도로 잠갔다.
- `봄 템플릿 만들어줘` 한 건에 대한 실제 Tooldi 자산 기반 vertical slice 기준은 [tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md) 에 정리했다.
- 실제 Tooldi 콘텐츠 source family, PHP API / DB seam, real catalog adapter 기준선은 [tooldi-agent-workflow-v1-tooldi-content-discovery.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-tooldi-content-discovery.md) 에 정리했다.
- 현재 worker runtime에는 `real Tooldi catalog source adapter` seam 이 추가되어 있고, spring slice는 opt-in real source mode에서 `background/shape/font` 를 실제 Tooldi PHP API로 조회할 수 있다.
- `photo` 는 현재 `wide_1200x628` representative preset 에 한해 execution-enabled 상태다. 즉 real source mode에서 picture inventory 조회와 `photoBranchMode` / `photoBranchReason` evidence를 남기고, `photo_selected` 인 경우 실제 `hero_image` mutation 까지 내려간다.
- `photo branch` 의 spec lock 과 Phase A 범위는 [tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-a.md) 에 정리한다.
- `photo branch` 의 execution lock 은 [tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-b.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-photo-branch-phase-b.md) 에 정리한다.
- 다만 non-wide preset, multi-photo, auth/user-context source, photo background path 는 아직 다음 단계다.
- planner / tool selection / search-compare-select / vision critique / real save evidence 연동 같은 다음 구현 축은 [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md) 에 별도로 정리했다.
- 이 문서는 normative spec이 아니라 working roadmap이며, sibling authoritative docs를 override하지 않는다.
