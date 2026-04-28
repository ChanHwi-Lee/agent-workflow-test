# Agent Workflow Legacy Cleanup PR 5 (+ PR 4.5 preflight) — 다음 스레드 핸드오프

생성일: 2026-04-28
선행: PR 0 → PR 1 (`43d88c6`) → PR 2 (`558d6e1`) → PR 3 (`9f42bac`) → PR 4 (`0d59360`)

## 1. 작업 목표

PR 5 시리즈는 PR 4 deletion 이후 남은 **mixed 파일** (live v6 export 와 legacy 분기가 한 파일에 공존) 을 v6-only 로 좁히고, planner DI 추상을 제거하고, public wire contract 를 v6 단일 모드로 잠그는 단계다.

PR 4 의 C안 보정으로 4개 source 파일 (`buildAdaptiveCompositionDecision.ts`, `assembleTemplateCandidates.ts`, `candidateSearchers.ts`, `layoutCandidateSet.ts`) 이 carve-out 되었다. 그 중 nodeUtils.ts → `SpringCatalogActivationError` 분기에 종속된 3건은 PR 5 진입 전 **PR 4.5 (preflight)** 로 정리한다. `buildAdaptiveCompositionDecision.ts` 와 `adaptiveVocabularyRegistry.ts` 는 worker.ts DI 가 제거될 때 (PR 6) 까지 잔존.

PR 5 는 단일 PR 이 아니라 **3개의 분리된 PR (5a, 5b, 5c)** 로 진행한다. 각 PR 의 독립성과 검증 가능성을 위해 한 스레드 안에서도 PR 단위로 commit 을 나눈다. 한 묶음으로 합치지 않는다.

## 2. 전체 PR 시리즈 (재명시)

source: `/home/ubuntu/github/tooldi/tws-editor-api/docs/dead-code-investigate/MERGED-FINAL.md`

| PR | 단계 | 책임 / 역할 | 상태 |
|---|---|---|---|
| PR 0 | PostgreSQL/Drizzle persistence foundation | 영속성 계층 마이그레이션 토대 | DONE — `52b45f4` |
| PR 1 | Baseline Lock | v6 reachability + legacy non-reachability 테스트와 evidence 잠금 | DONE — `43d88c6` |
| PR 2 | Safe Leaf Cleanup | zero-ref leaf 7개 제거 (단일 파일/심볼) | DONE — `558d6e1` |
| PR 3 | Graph Topology Prune | legacy 엣지/노드 등록/라우팅 제거 + v6-only 단순화 + 가드 | DONE — `9f42bac` |
| PR 4 | Legacy Phase File Deletion | unreachable phase 파일 일괄 삭제 + package.json test enumeration. C안 carve-out 4건 보류 | DONE — `0d59360` |
| **PR 4.5** | **nodeUtils SpringActivationError prune** | `nodeUtils.ts` 의 `SpringCatalogActivationError` 분기 제거 + `assembleTemplateCandidates.ts` / `candidateSearchers.ts` / `layoutCandidateSet.ts` 삭제 | **이 스레드 — preflight** |
| **PR 5a** | **Runtime Mixed Cleanup** | mixed 파일 v6-only 좁히기 (`emitSkeletonMutations.ts`, `layerCommandBuilder.ts`, `planningContext.ts`, `types.ts`, `runJobGraphState.ts` 의 legacy field, contracts 의 worker-internal field). **public API 불변** | **이 스레드 — main** |
| **PR 5b** | **Planner Cleanup** | `TemplatePlanner` DI/`TEMPLATE_PLANNER_*` env 제거, deterministic draft 인라인화, langchain planner 모듈 제거 | **이 스레드 — main** |
| **PR 5c** | **Public Contract Cleanup** | `workflowVariant` required literal, `latestSaveReceipt` 필수화, `latestSaveReceiptId` input 제거, `tool.result` event 분기 제거. Toolditor 측 contract mirror 동시 갱신 | **이 스레드 — main** |
| PR 6 | Transitive Package Sweep | worker DI 항목/패키지 모듈 (tool-registry, tool-adapters/catalog, primitives/storage, agent-llm/templateGenerators 등) 제거. PR 5a~c + PR 4.5 완료 후에만 | 미시작 |
| PR 7 | Docs / PoC / Bench Drift Sync | runtime cleanup 과 별도로 문서·PoC·bench 정렬 | 미시작 |

## 3. MERGED-FINAL 매핑 (PR 별 source 라인)

`/home/ubuntu/github/tooldi/tws-editor-api/docs/dead-code-investigate/MERGED-FINAL.md`

- Phase 4 — Post-Legacy Import Sweep Checkpoint: lines 347-378 (PR 4.5 직후 sweep 점검 절차)
- Phase 5a — Runtime Mixed Cleanup: lines 380-414
- Phase 5b — Planner Cleanup: lines 416-447
- Phase 5c — Public Contract Cleanup: lines 449-481
- Critical corrections: lines 160-192 (특히 `runJobGraphState.plan` live 보존)

## 4. PR 4.5 — preflight (가장 먼저 처리)

### 4.1 목표

PR 4 carve-out 의 nodeUtils.ts 종속 3건을 정리. 단일 변경 단위로 commit.

### 4.2 변경 사항

1. `apps/agent-worker/src/graph/nodeUtils.ts` 의 `isSpringActivationFailure` / `SpringCatalogActivationError` 분기 제거.
   - 현재: `error is TooldiCatalogSourceError | SpringCatalogActivationError` → 좁히기: `error is TooldiCatalogSourceError`
   - import 라인 (`import { SpringCatalogActivationError } from "../phases/assembleTemplateCandidates.js"`) 삭제
   - 호출처가 있다면 좁힌 시그니처에 맞게 정리
2. 다음 3개 phase 파일 삭제:
   - `apps/agent-worker/src/phases/assembleTemplateCandidates.ts`
   - `apps/agent-worker/src/phases/candidateSearchers.ts`
   - `apps/agent-worker/src/phases/layoutCandidateSet.ts`
3. `package.json` test enumeration 점검 — PR 4 에서 이미 정리되어 있으므로 추가 변경 불필요 (확인만).

### 4.3 검증

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime
rg -n "SpringCatalogActivationError|assembleTemplateCandidates|candidateSearchers|layoutCandidateSet" \
  apps packages --glob '!dist/**' --glob '!node_modules/**'
# production+test 모두 0 hits 가 acceptance 기준

pnpm -r --if-present typecheck
pnpm build
pnpm -F @tooldi/agent-api test
pnpm -F @tooldi/agent-worker test
pnpm smoke:object-native
```

### 4.4 커밋 메시지 초안

```
[refactor] agent runtime PR4.5: SpringCatalogActivationError 분기 제거

PR 4 carve-out 였던 assembleTemplateCandidates / candidateSearchers /
layoutCandidateSet 의 유일한 보존 zone referrer 인 nodeUtils.ts 의
isSpringActivationFailure 분기를 정리한 뒤 3개 source 일괄 삭제.

검증: typecheck/build/api/worker/smoke:object-native 모두 PASS.
```

## 5. PR 5a — Runtime Mixed Cleanup (main)

### 5.1 목표

mixed 파일 v6-only 좁히기. **public API/contract 불변**.

### 5.2 대상 파일과 작업

- `apps/agent-worker/src/phases/emitSkeletonMutations.ts`
  - 보존: `buildV6SkeletonBatch()` 경로
  - 제거: 비-v6 `validatePlanActions()`, foundation/photo/copy/polish proposal 구성, legacy plan-action 파싱
- `apps/agent-worker/src/phases/layerCommandBuilder.ts`
  - 보존: `buildSaveTemplateCommand`
  - 제거: adaptive/refinement layer command helper (PR 3~4 에서 import 가 사라진 것 확인 후)
- `apps/agent-worker/src/phases/planningContext.ts`
  - import sweep 으로 unused export 식별 후 제거
- `apps/agent-worker/src/types.ts`
  - `TemplateRecallSource`, `legacyAliases` 등 PR 3~4 정리 후 unused 인 export/field 만 제거
  - **`plan` 관련 타입은 절대 제거 금지** (live)
- `apps/agent-worker/src/graph/runJobGraphState.ts`
  - 제거 후보 (PR 3~4 정리로 unreachable 검증 후): `copyPlanRef`, `assetPlanRef`, `concreteLayoutPlanRef`, `executionSceneSummary*`, `judgePlan*`, `refineDecision*`, `templatePriorBundleRef`, `sceneStylePlanRef`, `sceneBindingPlanRef`
  - **절대 제거 금지**: `plan`, v6/interview/finalize 관련 필드
- `packages/contracts/src/worker/run-job-envelope.ts`
  - worker-internal field 중 unused 만 제거. **public/Toolditor 측 wire 형태는 PR 5c 에서 처리**
- `packages/contracts/src/artifacts/run-result.ts`
  - 동일 원칙

### 5.3 필수 가드

```bash
rg -n "state\.plan|plan:" \
  tooldi-agent-runtime/apps/agent-worker/src/graph \
  tooldi-agent-runtime/apps/agent-worker/src/phases
```
PR 5a 전후로 동일하게 `state.plan` / `plan:` 사용처가 v6 createLayer / save / finalize 경로에 살아 있어야 한다. v6 회귀 가드인 `processRunJobFixtures.ts` 의 `LEGACY_BUILD_OR_REFINEMENT_*` / `assertLegacyBuildAndRefinementNodesWereBypassed` 도 보존.

### 5.4 절대 손대지 않는 것 (PR 5a 한정)

- public API contract (`workflowVariant`, `latestSaveReceipt`, `tool.result` 등) — PR 5c 영역
- planner DI / `TEMPLATE_PLANNER_*` env — PR 5b 영역
- worker.ts dependency 인스턴스화 (`adaptiveCompositionDecisionBuilder` 등) — PR 6 영역
- packages/tool-adapters / tool-registry / agent-llm/templateGenerators — PR 6 영역
- v6 phase 파일 (`phases/v6*.ts`), `executionNodes.ts`, `finalizeNodes.ts`, `interviewNode.ts`, `v6PipelineNode.ts`, `v6TrendResearchNode.ts`, `planningNodes.ts`
- `runJobGraph*.ts` 의 router/topology
- `0001_agent_runtime_init.sql`

### 5.5 검증

```bash
pnpm -r --if-present typecheck
pnpm build
pnpm -F @tooldi/agent-api test
pnpm -F @tooldi/agent-worker test
pnpm smoke:object-native
```

### 5.6 커밋 메시지 초안

```
[refactor] agent runtime PR5a: mixed 파일 v6-only 정리

emitSkeletonMutations / layerCommandBuilder / planningContext / types /
runJobGraphState / contracts(worker-internal) 의 legacy 분기를 제거하고
v6-only 로 좁힘. public API contract 와 worker DI 는 보존
(PR 5c / PR 6 영역).

검증: typecheck/build/api/worker/smoke:object-native 모두 PASS.
```

## 6. PR 5b — Planner Cleanup (main)

### 6.1 목표

planner DI 추상 제거. v6 normalization 은 fixed deterministic draft path 로 단일화.

전제 결정 (PR 5b 진입 시점에 잠긴 product 결정):

- LangChain/heuristic planner 모드 스위치 없음
- `TemplatePlanner` runtime injection 없음
- `TEMPLATE_PLANNER_MODE` 분기 없음

### 6.2 대상

- worker / process graph setup 의 `TemplatePlanner` DI 제거
- `TEMPLATE_PLANNER_MODE`, `TEMPLATE_PLANNER_PROVIDER`, `TEMPLATE_PLANNER_MODEL` 등 env / config 제거
- `langchainTemplatePlanner.ts`, `templatePlanner.ts`, planner factory, 모드별 테스트, package export 제거
- deterministic planner draft 로직을 worker normalization 에 인라인
- `ExecutablePlan` / `IntentEnvelope` 의 schema/type 중 PR 5c 까지 살아 있어야 하는 항목은 보존 — 여기선 DI/모드 스위치만 정리

### 6.3 가드

```bash
rg -n "TEMPLATE_PLANNER_MODE|TemplatePlanner|langchainTemplatePlanner" \
  apps packages --glob '!dist/**' --glob '!node_modules/**'
```
historical 문서 외 production/test 0 hits 가 acceptance.

```bash
pnpm -F @tooldi/agent-worker test
pnpm smoke:object-native
```

### 6.4 커밋 메시지 초안

```
[refactor] agent runtime PR5b: planner DI 제거

TemplatePlanner runtime injection / TEMPLATE_PLANNER_* env / langchain
planner 모듈을 제거하고 deterministic draft 를 worker normalization 에
인라인. ExecutablePlan/IntentEnvelope schema 는 PR 5c 까지 보존.

검증: rg gate clean, worker test/smoke:object-native PASS.
```

## 7. PR 5c — Public Contract Cleanup (main)

### 7.1 목표

Toolditor-only wire contract 를 v6 단일 모드로 잠금. SSE / mutation ack / save ack / finalize / cancel / interview / artifact fetch 는 형태 유지.

### 7.2 잠긴 contract 결정

- `StartAgentWorkflowRunRequest.workflowVariant` 를 required literal `"object_native_v1"` 로 (default 제거)
- API 측 `workflowVariant` 누락에 대한 defaulting 제거
- completed finalize 요청은 full `latestSaveReceipt` 필수화
- `RunFinalizeRequest.latestSaveReceiptId` input compatibility field 제거 (응답/result/artifact summary 의 `latestSaveReceiptId` 는 보존)
- worker callback `tool.result` event 분기 제거 (live emitter 없음)
- legacy finalize/artifact ref 는 producer 가 사라진 항목만 제거

### 7.3 대상

- `packages/contracts/**`
- `apps/agent-api/**` 의 normalization / materialization / 관련 테스트
- `/home/ubuntu/github/tooldi/toolditor` 의 contract mirror / request builder (Toolditor 측은 explicit `workflowVariant: "object_native_v1"` 송신 보장)

### 7.4 가드

```bash
rg -n "workflowVariant|latestSaveReceiptId|latestSaveReceipt|tool\.result" \
  tooldi-agent-runtime apps packages \
  --glob '!dist/**' --glob '!node_modules/**'

# Toolditor 측도 동시 sweep
rg -n "workflowVariant|latestSaveReceiptId|latestSaveReceipt|tool\.result" \
  /home/ubuntu/github/tooldi/toolditor/src
```

Acceptance: Toolditor 가 `workflowVariant: "object_native_v1"` 을 그대로 보내고, 서버가 누락을 거부하고, finalize 에서 `latestSaveReceipt` full payload 를 받는다. SSE / ack / interview 흐름 회귀 없음.

```bash
pnpm -F @tooldi/agent-api test
pnpm -F @tooldi/agent-worker test
pnpm smoke:object-native
```

### 7.5 절대 손대지 않는 것 (PR 5c 한정)

- 어떤 package-level 코드도 sweep 하지 않음 — PR 6 영역
- worker DI 인스턴스화 (`adaptiveCompositionDecisionBuilder`, `templateCopyPlanGenerator`, `templateAbstractLayoutGenerator`, `tooldiCatalogSourceClient` 등) — PR 6 영역

### 7.6 커밋 메시지 초안

```
[refactor] agent runtime PR5c: public contract v6-only 잠금

workflowVariant required literal, latestSaveReceipt 필수화,
latestSaveReceiptId input 제거, tool.result event 분기 제거.
Toolditor 측 contract mirror / request builder 동시 갱신.

검증: agent-api/worker test, smoke:object-native PASS.
Toolditor 회귀: SSE/ack/finalize/interview 흐름 동등.
```

## 8. 시작 전 점검

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test
git status --short
git log --oneline -6
```

다음 5개 커밋이 직전에 있어야 한다:

```
0d59360 [refactor] agent runtime PR4: legacy phase 파일 일괄 삭제
9f42bac [refactor] agent runtime PR3: 그래프 토폴로지 v6-only 정리
558d6e1 [refactor] agent runtime PR2: zero-ref 안전 leaf 정리
43d88c6 [chore] 과도하게 긴 테스트 파일 정리리
52b45f4 [refactor] agent runtime PostgreSQL persistence foundation
```

깨끗한 working tree 에서 PR 4.5 → PR 5a → PR 5b → PR 5c 순서로 처리. **각 PR 마다 별도 commit**.

진입 시 다음을 먼저 읽는다:

- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/AGENTS.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/CLAUDE.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md`

## 9. Phase 4 — Post-Legacy Import Sweep Checkpoint (PR 4.5 후, PR 5a 전)

PR 4.5 가 끝난 직후 다음을 한 번 실행해 mixed 파일의 export 별 liveness 를 분류한다 (read-only checkpoint, 변경 금지).

```bash
rg -n "state\.plan|plan:" \
  tooldi-agent-runtime/apps/agent-worker/src/graph \
  tooldi-agent-runtime/apps/agent-worker/src/phases

rg -n "from \"\\.\\.?/phases/(emitSkeletonMutations|layerCommandBuilder|planningContext)" \
  tooldi-agent-runtime/apps tooldi-agent-runtime/packages --glob '!dist/**'
```

각 export 를 다음 5개 카테고리로 분류:

1. live v6 contract — 보존
2. legacy runtime 분기 — PR 5a
3. planner abstraction — PR 5b
4. public contract compatibility — PR 5c
5. package-sweep residue — PR 6

분류 결과를 work-log 또는 PR description 에 짧게 첨부.

## 10. 회귀 위험 / 주의

1. **`state.plan` 절대 보존** — v6 createLayer / save / finalize 경로의 single source of truth. legacy 필드 제거 시 `plan` 만 살아 있는지 가드.
2. **Toolditor mirror sync (PR 5c)** — Toolditor 가 `workflowVariant` 를 explicit 으로 보내지 않으면 server reject 로 회귀. PR 5c 는 server + Toolditor 동시 변경.
3. **PR 5b 진입 전 product 결정 확정 필요** — "no LangChain/heuristic planner mode switch" 가 잠겼는지 사용자에게 재확인 후 진행. 잠겨있지 않으면 PR 5b 보류.
4. **fixture 보존** — `processRunJobFixtures.ts` 의 v6 회귀 가드 fixture / 상수 / `assertLegacyBuildAndRefinementNodesWereBypassed` 함수는 PR 5 내내 절대 삭제 금지. legacy phase 부재를 적극적으로 검출하는 회귀 안전망.
5. **`tooldiTaxonomyFixtures.ts:30 legacyGraphicOptionalAssetPolicy`** — 별도 의미. PR 5 에서 손대지 않음.
6. **PR 단위 커밋 분리** — 한 스레드 안이라도 PR 4.5 / 5a / 5b / 5c 는 각각 별도 commit. 한 묶음 커밋 금지.
7. **package.json test enumeration drift** — 향후 cleanup 마다 sync. 자동화 룰 도입 검토 (별도 과제).

## 11. 수용 기준

- PR 4.5: nodeUtils.ts SpringActivationError 분기 0 hits, 3개 source 삭제, typecheck/build/test/smoke PASS.
- PR 5a: mixed 파일 legacy 분기 제거, `state.plan` 가드 통과, public API/worker DI/packages 무변경.
- PR 5b: `TEMPLATE_PLANNER_*` / `TemplatePlanner` / `langchainTemplatePlanner` historical 외 0 hits.
- PR 5c: `workflowVariant` required literal, `latestSaveReceipt` 필수, `latestSaveReceiptId` input 제거, `tool.result` 분기 제거. Toolditor 측 explicit 송신 확인.
- 모든 PR 에서 typecheck/build/api test/worker test/smoke:object-native PASS.
- 각 PR 의 commit 은 단독 revert 가능하도록 의존 분리.

## 12. 메모리 / lock 결정 요약

- 커밋: 사용자 명시 요청 시에만 (`feedback_no_auto_commit`)
- 메시지: `[refactor]` 접두어 + 한국어, Co-Authored-By 절대 금지 (`feedback_commit_format`)
- 작업 디렉터리: pnpm workspace (`agent-workflow-test/tooldi-agent-runtime` 한정 pnpm)
- Plan 모드 호출 금지, 단 구현 진입 전 내부 plan(읽을 파일/순서/검증/롤백) 은 항상 선수립 (`feedback_implicit_planning`)
- 조사·리서치는 Agent 로 위임 가능 (`feedback_delegate_research`)
- 세션 종료 전 의미 있는 변경이면 `/session-save` 로 vault 적재 (CLAUDE.md `Obsidian Memory Workflow`)

## 13. 참조

### 정규 문서

- `/home/ubuntu/github/tooldi/tws-editor-api/AGENTS.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/AGENTS.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/CLAUDE.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md`

### Dead-code 조사 baseline (MERGED-FINAL)

- `/home/ubuntu/github/tooldi/tws-editor-api/docs/dead-code-investigate/MERGED-FINAL.md`
  - Liveness baseline: lines 38-75
  - Critical corrections (`runJobGraphState.plan` live 보존 등): lines 160-192
  - Phase 0 baseline lock: lines 194-228 (PR 1)
  - Phase 1 safe leaf cleanup: lines 229-264 (PR 2)
  - Phase 2 graph topology prune: lines 266-291 (PR 3)
  - Phase 3 legacy phase files: lines 293-345 (PR 4)
  - **Phase 4 post-legacy import sweep checkpoint**: lines 347-378 (PR 4.5 직후)
  - **Phase 5a runtime mixed cleanup**: lines 380-414
  - **Phase 5b planner cleanup**: lines 416-447
  - **Phase 5c public contract cleanup**: lines 449-481
  - Phase 6 transitive package sweep: lines 483~
  - Phase 7 docs / PoC / bench drift sync

### 직전 PR 핸드오프

- `agent-workflow-test/docs/handoff/2026-04-28-agent-workflow-pr1-baseline-lock-evidence.md`
- `agent-workflow-test/docs/handoff/2026-04-28-agent-workflow-pr3-graph-topology-prune-handoff.md`
- `agent-workflow-test/docs/handoff/2026-04-28-agent-workflow-pr4-legacy-phase-deletion-handoff.md`

### 작업기록 (llm-store vault)

- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-dead-code-investigation.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-runtime-postgres-drizzle-foundation.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr1-baseline-lock.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr2-safe-leaf-cleanup.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr3-graph-topology-prune.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr4-boundary-decision.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr4-execution-c-path.md`

### 직전 커밋 (HEAD 부터 5개)

```
0d59360 [refactor] agent runtime PR4: legacy phase 파일 일괄 삭제
9f42bac [refactor] agent runtime PR3: 그래프 토폴로지 v6-only 정리
558d6e1 [refactor] agent runtime PR2: zero-ref 안전 leaf 정리
43d88c6 [chore] 과도하게 긴 테스트 파일 정리리
52b45f4 [refactor] agent runtime PostgreSQL persistence foundation
```

### 알려진 blocker (PR 5 영향 없음)

- `pnpm local:toolditor:eval:object-native:real` 이 stale `object-native-reference-audit.json` 을 기대해 fail. PR 1 evidence 노트 참조.

## 14. 다음 스레드 시작 프롬프트

> Implement PR 4.5 (preflight) → PR 5a → PR 5b → PR 5c for `agent-workflow-test/tooldi-agent-runtime`.
>
> Read `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-28-agent-workflow-pr5-mixed-cleanup-handoff.md` first. It contains the locked PR series, scope, validation, acceptance criteria, MERGED-FINAL line mapping, and references.
>
> Repo root: `/home/ubuntu/github/tooldi/tws-editor-api`. Runtime workdir: `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime`. Toolditor (PR 5c only): `/home/ubuntu/github/tooldi/toolditor`.
>
> PR 0~4 are committed (`52b45f4`, `43d88c6`, `558d6e1`, `9f42bac`, `0d59360`). Start from a clean tree.
>
> Constraints:
>
> - Each of PR 4.5 / 5a / 5b / 5c is a separate commit. No bundling.
> - PR 5a stays runtime-only (no public contract change, no worker DI sweep, no package sweep).
> - PR 5b only after the user confirms "no LangChain/heuristic planner mode switch" is locked.
> - PR 5c touches both `tooldi-agent-runtime` and `/home/ubuntu/github/tooldi/toolditor` together. Verify Toolditor still sends explicit `workflowVariant: "object_native_v1"`.
> - PR 6 (worker DI / packages) and PR 7 (docs/PoC/bench) are out of scope for this thread.
> - `state.plan`, v6/interview/finalize fields, and `processRunJobFixtures.ts` legacy-bypass guards must survive untouched.
> - Commit policy: `[refactor]` prefix + Korean, no Co-Authored-By, only on explicit user approval (`feedback_no_auto_commit`).
> - For each PR, run typecheck/build/agent-api test/agent-worker test/smoke:object-native and report results before requesting commit approval.
