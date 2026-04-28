# Agent Workflow Legacy Cleanup PR 6 — Transitive Package Sweep — 다음 스레드 핸드오프

생성일: 2026-04-28
선행: PR 0 → PR 1 → PR 2 → PR 3 → PR 4 → PR 4.5 → PR 5a → PR 5b → PR 5c

## 1. 작업 목표

PR 6 은 PR 1~5c 가 정리한 그래프·phase·planner·contract 의존성에서 **package-level** 잔재를 일괄 정리한다. PR 5b 에서 `templatePlanner.ts`/`heuristicTemplatePlanner.ts`/`langchainTemplatePlanner.ts`/`templateGenerators.ts` 는 이미 삭제됐고, `createStructuredOutputModel` 헬퍼만 `packages/agent-llm/src/structuredOutputModel.ts` 로 분리해 보존중이다 (Option A 결정 — `buildAdaptiveCompositionDecision.ts` 와 함께 PR 6 에서 자연 cleanup).

PR 6 의 핵심: **adaptive composition decision 경로 전체** (`adaptiveCompositionDecisionBuilder` DI + `buildAdaptiveCompositionDecision.ts` 소스 + `adaptiveVocabularyRegistry.ts` + `createStructuredOutputModel` 헬퍼) 가 PR 5b 이후로 production caller 0건이라는 것을 확정한 뒤 일괄 제거한다. 추가로 `tool-registry`, `tool-adapters/catalog`, `tool-adapters/primitives`, `tool-adapters/storage` 패키지 및 worker 측 tool adapter 들 (`imagePrimitiveAdapter`, `assetStorageAdapter`, `textLayoutHelperAdapter`) 도 v6 path 가 사용하지 않으면 제거한다.

PR 5 시리즈와 달리 PR 6 은 **단일 PR** 로 진행 가능 — package-level 일괄 sweep 이고 dead-code 증거가 이미 PR 5 시리즈에서 확보되어 있다. 다만 sweep 항목별로 reachability 검증을 commit 전에 명시적으로 통과해야 한다.

## 2. 전체 PR 시리즈 (재명시)

source: `/home/ubuntu/github/tooldi/tws-editor-api/docs/dead-code-investigate/MERGED-FINAL.md`

| PR | 단계 | 책임 / 역할 | 상태 |
|---|---|---|---|
| PR 0 | PostgreSQL/Drizzle persistence foundation | 영속성 계층 마이그레이션 토대 | DONE — `52b45f4` |
| PR 1 | Baseline Lock | v6 reachability + legacy non-reachability 테스트와 evidence 잠금 | DONE — `43d88c6` |
| PR 2 | Safe Leaf Cleanup | zero-ref leaf 7개 제거 (단일 파일/심볼) | DONE — `558d6e1` |
| PR 3 | Graph Topology Prune | legacy 엣지/노드 등록/라우팅 제거 + v6-only 단순화 + 가드 | DONE — `9f42bac` |
| PR 4 | Legacy Phase File Deletion | unreachable phase 파일 일괄 삭제 + package.json test enumeration. C안 carve-out 4건 보류 | DONE — `0d59360` |
| PR 4.5 | nodeUtils SpringActivationError prune | `nodeUtils.ts` 의 `SpringCatalogActivationError` 분기 제거 + `assembleTemplateCandidates.ts` / `candidateSearchers.ts` / `layoutCandidateSet.ts` 삭제 | DONE — `16aa517` |
| PR 5a | Runtime Mixed Cleanup | mixed 파일 v6-only 좁히기 (`emitSkeletonMutations.ts`, `layerCommandBuilder.ts`, `types.ts`, contracts worker-internal field). public API 불변 | DONE — `1b68910` |
| PR 5b | Planner Cleanup | `TemplatePlanner` DI/`TEMPLATE_PLANNER_*` env 제거, `plan_intent_draft` 노드 삭제, deterministic intentInference 인라인. `createStructuredOutputModel` 만 `structuredOutputModel.ts` 로 분리 보존 | DONE — `f19b926` |
| PR 5c | Public Contract Cleanup | `workflowVariant` required literal, `latestSaveReceipt` 필수화, `latestSaveReceiptId` input 제거, `tool.result` event 분기 제거. Toolditor 측 contract mirror 동시 갱신 | DONE — agent-runtime `a085111` + Toolditor `6378f0c33` |
| **PR 6** | **Transitive Package Sweep** | worker DI 항목 + `buildAdaptiveCompositionDecision.ts` + `adaptiveVocabularyRegistry.ts` + `createStructuredOutputModel` + tool-registry/adapters/storage/primitives 패키지 일괄 제거. PR 1~5c 정리로 0 caller 가 된 항목만 | **이 스레드 — main** |
| PR 7 | Docs / PoC / Bench Drift Sync | runtime cleanup 과 별도로 문서·PoC·bench 정렬 | 미시작 |

## 3. MERGED-FINAL 매핑

`/home/ubuntu/github/tooldi/tws-editor-api/docs/dead-code-investigate/MERGED-FINAL.md`

- Phase 6 — Transitive Package Sweep: lines 458-481 (worker DI candidates + package candidates + rule)
- Final Status Taxonomy: lines 510~ (PR 단계별 책임 표)
- Critical corrections: lines 160-192 (`runJobGraphState.plan` live 보존 — PR 6 에서도 유지)

핸드오프 §10.1 (PR 5 mixed cleanup) 명시: "worker DI 인스턴스화 (`adaptiveCompositionDecisionBuilder` 등) — PR 6 영역". PR 6 는 그 잠긴 영역을 이제 실행한다.

## 4. PR 6 진입 시점 baseline (`a085111` HEAD)

### 4.1 살아남은 DI / package 항목 (PR 6 sweep 후보)

worker.ts 가 instantiate 하는 DI 항목 중 v6 production path 와 무관한 것들:

| 항목 | type / factory | 정의 위치 | production caller 상태 |
|---|---|---|---|
| `toolRegistry` | `ToolRegistry` | `packages/tool-registry/**` | runJobGraphTypes 에 type 만 노출, runtime caller 검증 필요 |
| `imagePrimitiveClient` | `ImagePrimitiveClient` | `packages/tool-adapters/src/primitives/imagePrimitiveClient.ts` + `apps/agent-worker/src/tools/adapters/imagePrimitiveAdapter.ts` | v6 phase 중 `v6CommandAdapter` / `v6BrowserRender` 등에서 사용 여부 검증 필요 |
| `assetStorageClient` | `AssetStorageClient` | `packages/tool-adapters/src/storage/assetStorageClient.ts` + `apps/agent-worker/src/tools/adapters/assetStorageAdapter.ts` | v6 path 사용 여부 검증 필요 |
| `textLayoutHelper` | `TextLayoutHelper` | `apps/agent-worker/src/tools/adapters/textLayoutHelperAdapter.ts` (+ `@tooldi/tool-adapters`) | PR 5a 에서 `emitSkeletonMutations` legacy path 가 유일한 호출처였음 → 0 caller 후보. 단 `executionNodes.ts` 의 unused `_dependencies` 잔존 여부 확인 필요 |
| `templateCatalogClient` | `TemplateCatalogClient` | `packages/tool-adapters/src/catalog/**` | PR 4 phase 삭제 후 0 caller 후보 |
| `tooldiCatalogSourceClient` | `TooldiCatalogSourceClient` | `packages/tool-adapters/src/catalog/**` (real + placeholder + http modes) | nodeUtils.ts 의 `TooldiCatalogSourceError` 만 보존 (PR 4.5). 실제 client 호출처 검증 필요 |
| `adaptiveCompositionDecisionBuilder` | `AdaptiveCompositionDecisionBuilder` | `apps/agent-worker/src/phases/buildAdaptiveCompositionDecision.ts` (+ runJobGraphTypes type) | **확정 0 caller** (PR 5b 후 production import sweep 결과 worker.ts DI wiring + test 만 남음) |

확정 dead 항목 (production 0 caller):
- `apps/agent-worker/src/phases/buildAdaptiveCompositionDecision.ts` + `.test.ts`
- `apps/agent-worker/src/phases/adaptiveVocabularyRegistry.ts`
- `packages/agent-llm/src/structuredOutputModel.ts` (PR 5b Option A 로 분리 보존했으나 buildAdaptive... 가 유일 caller 였음 → 동반 제거)
- `runJobGraphTypes.AdaptiveCompositionDecisionBuilder` / `AdaptiveCompositionDecisionBuilderInput` 타입
- `worker.ts` 의 `adaptiveCompositionDecisionBuilder` DI 항목 + `package.json` 테스트 엔트리 `dist/phases/buildAdaptiveCompositionDecision.test.js`

### 4.2 검증 우선 항목 (sweep 전 reachability 확정 필요)

다음은 import chain 이 살아있을 가능성이 있어 **삭제 전 production caller sweep 필수**:

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime

# v6 path 가 ToolRegistry / 각 client 를 쓰는지 검증
rg -n "toolRegistry\b|ToolRegistry\b" \
  apps/agent-worker/src/graph/v6PipelineNode.ts \
  apps/agent-worker/src/graph/v6TrendResearchNode.ts \
  apps/agent-worker/src/phases/v6*.ts \
  --glob '!dist/**'

rg -n "imagePrimitiveClient|ImagePrimitiveClient" \
  apps/agent-worker/src --glob '!dist/**' --glob '!*.test.ts'

rg -n "assetStorageClient|AssetStorageClient" \
  apps/agent-worker/src --glob '!dist/**' --glob '!*.test.ts'

rg -n "textLayoutHelper|TextLayoutHelper" \
  apps/agent-worker/src --glob '!dist/**' --glob '!*.test.ts'

rg -n "templateCatalogClient|TemplateCatalogClient" \
  apps/agent-worker/src --glob '!dist/**' --glob '!*.test.ts'

rg -n "tooldiCatalogSourceClient" \
  apps/agent-worker/src --glob '!dist/**' --glob '!*.test.ts'
```

**중요한 보존 영역**:
- `nodeUtils.ts` 의 `TooldiCatalogSourceError` import (PR 4.5 에서 좁혀둔 분기) — `tooldiCatalogSourceClient` 자체는 죽어도 `TooldiCatalogSourceError` 클래스는 살아있는지 확인. 살아있어야 한다면 그 클래스만 별도 분리 후 `packages/tool-adapters` sweep
- v6 pipeline 의 LangChain Gemini 호출 경로 (`@langchain/google-genai` import) — 무조건 보존
- interview node 의 LangChain 사용 (`interviewLlm.ts`) — 무조건 보존

## 5. PR 6 작업 절차

### 5.1 진입 전 점검

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test
git status --short
git log --oneline -10
```

다음 9개 커밋이 직전에 있어야 한다:

```
a085111 [refactor] agent runtime PR5c: public contract v6-only 잠금
f19b926 [refactor] agent runtime PR5b: planner DI 제거
1b68910 [refactor] agent runtime PR5a: mixed 파일 v6-only 정리
16aa517 [refactor] agent runtime PR4.5: SpringCatalogActivationError 분기 제거
0d59360 [refactor] agent runtime PR4: legacy phase 파일 일괄 삭제
9f42bac [refactor] agent runtime PR3: 그래프 토폴로지 v6-only 정리
558d6e1 [refactor] agent runtime PR2: zero-ref 안전 leaf 정리
43d88c6 [chore] 과도하게 긴 테스트 파일 정리리
52b45f4 [refactor] agent runtime PostgreSQL persistence foundation
```

깨끗한 working tree 에서 시작.

### 5.2 단계별 진행 (단일 PR 6 commit, 단계별 검증)

각 단계 끝에 typecheck/build 가 깨지면 안 된다. 단계별 commit 분리는 선택 — 사용자 승인 시 가능. 기본은 **단일 commit**.

**Step 1 — Adaptive composition chain 확정 dead 제거**
1. `apps/agent-worker/src/phases/buildAdaptiveCompositionDecision.ts` 삭제
2. `apps/agent-worker/src/phases/buildAdaptiveCompositionDecision.test.ts` 삭제
3. `apps/agent-worker/src/phases/adaptiveVocabularyRegistry.ts` 삭제
4. `apps/agent-worker/src/graph/runJobGraphTypes.ts` 의 `AdaptiveCompositionDecisionBuilder` / `AdaptiveCompositionDecisionBuilderInput` / 관련 deps 필드 제거
5. `apps/agent-worker/src/worker.ts` 의 `adaptiveCompositionDecisionBuilder` import + DI wiring 제거
6. `apps/agent-worker/package.json` test enumeration 에서 `buildAdaptiveCompositionDecision.test.js` 제거
7. `packages/agent-llm/src/structuredOutputModel.ts` 삭제 (유일 caller 사라짐)
8. `packages/agent-llm/src/index.ts` 의 `structuredOutputModel.js` re-export 제거

**Step 2 — Worker DI 항목별 import sweep + 제거**

각 DI 항목별로 (§4.2 의 sweep 명령):
1. caller 0건 확인
2. worker.ts DI wiring 제거
3. runJobGraphTypes.ts deps 필드 제거
4. adapter 파일 (`apps/agent-worker/src/tools/adapters/*Adapter.ts`) 삭제
5. typecheck + smoke 통과 확인

순서 권장 (의존이 적은 것부터):
- `templateCatalogClient` (PR 4 phase 삭제 후 dead)
- `tooldiCatalogSourceClient` (TooldiCatalogSourceError 보존 정책 확정 후)
- `imagePrimitiveClient`
- `assetStorageClient`
- `textLayoutHelper` (executionNodes 의 unused dependencies 까지 정리)
- `toolRegistry` (가장 마지막 — wire 가 가장 깊을 수 있음)

**Step 3 — Package 디렉터리 일괄 삭제**

Step 2 가 끝나면 package 들도 0 import 가 됐을 것:
1. `packages/tool-registry/**` (workspace 에서도 제거: `pnpm-workspace.yaml`)
2. `packages/tool-adapters/src/catalog/**`
3. `packages/tool-adapters/src/primitives/**`
4. `packages/tool-adapters/src/storage/**`
5. `packages/tool-adapters/**` 가 통째로 비면 패키지 자체 삭제. 일부 (예: `TooldiCatalogSourceError`) 가 살아남으면 그것만 보존

`packages/tool-adapters/src/index.ts` 의 export sweep 도 필수. agent-llm 처럼 explicit re-export 만 유지.

**Step 4 — Type 잔재 정리**

`apps/agent-worker/src/types.ts` 에서 PR 6 sweep 으로 unused 가 된 type들 (예: `TemplateCandidateBundle`, `TemplateCandidateSet` 등):
- 해당 type 의 production caller 가 0건임을 sweep 으로 확정
- import 줄 / interface 필드 / type alias 제거
- contracts (run-result.ts, live-draft-artifact-bundle.ts, worker-callbacks.ts) 의 legacy ref 필드 (`copyPlanRef`, `assetPlanRef`, `concreteLayoutPlanRef` 등) 도 producer 가 사라졌으면 제거. **단 PR 5c 가 보존 명시한 output side `latestSaveReceiptId` 등은 보존**

### 5.3 검증 게이트

각 Step 끝, 그리고 최종 commit 전 모두 통과:

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime

# Acceptance: 0 hits
rg -n "adaptiveCompositionDecisionBuilder|AdaptiveCompositionDecision\b|buildAdaptiveCompositionDecision|adaptiveVocabularyRegistry|createStructuredOutputModel|StructuredOutputProvider" \
  apps packages --glob '!dist/**' --glob '!node_modules/**'

# Worker DI 항목별 (각 단계마다)
rg -n "toolRegistry|imagePrimitiveClient|assetStorageClient|textLayoutHelper|templateCatalogClient|tooldiCatalogSourceClient" \
  apps/agent-worker/src --glob '!dist/**' --glob '!*.test.ts'

# 빌드/테스트
pnpm -r --if-present typecheck
pnpm build
pnpm -F @tooldi/agent-api test
pnpm -F @tooldi/agent-worker test
pnpm -F @tooldi/agent-llm test
pnpm smoke:object-native
```

smoke 가 PR 6 종료 시점에도 `[object-native-smoke] verified v6 pipeline emitted 3 createLayer commands via v6-freeform-layout-pipeline` 출력하면 PASS.

### 5.4 절대 손대지 않는 것 (PR 6 한정)

- v6 phase 파일 (`phases/v6*.ts`) 일체 — `v6PipelineNode`, `v6TrendResearchNode`, `v6HtmlGen`, `v6BrowserRender`, `v6CommandAdapter`, `v6PrimitiveMapper`, `v6FontRegistry`, `v6RenderQualityReport`, `v6HtmlValidator`
- `interviewNode.ts`, `interviewLlm.ts` — 인터뷰 LangChain 경로
- `executionNodes.ts`, `finalizeNodes.ts`, `planningNodes.ts` (PR 5b 에서 정리됨, PR 6 추가 변경 불필요)
- `state.plan` 및 `runJobGraphState.ts` 의 v6 / interview / finalize 필드
- `processRunJobFixtures.ts` 의 `LEGACY_BUILD_OR_REFINEMENT_*` 가드, `assertLegacyBuildAndRefinementNodesWereBypassed` 함수
- LangGraph postgres checkpointer 관련 (`langGraphCheckpointerMode` 등)
- public contract — PR 5c 에서 잠금 완료. PR 6 에서 추가 변경 시 같은 PR 5c 룰 (Toolditor mirror 동시 갱신) 적용

### 5.5 커밋 메시지 초안

```
[refactor] agent runtime PR6: package-level dead code 일괄 sweep

PR 1~5c 정리로 production caller 0건이 된 worker DI 항목과 package
디렉터리를 일괄 제거. adaptive composition chain (decisionBuilder /
buildAdaptiveCompositionDecision / adaptiveVocabularyRegistry /
structuredOutputModel) 전체 삭제. tool-registry, tool-adapters
(catalog/primitives/storage) 패키지 및 worker tool adapters 정리
(v6 path 미사용 항목만). nodeUtils 의 TooldiCatalogSourceError 등
보존 영역은 별도 모듈로 분리 후 잔류. v6 pipeline (LangChain Gemini)
경로와 interview LangChain 경로는 보존.

검증: rg gate 0 hits, typecheck/build/api/worker/agent-llm test/
smoke:object-native 모두 PASS. processRunJobFixtures regression
guards 보존.
```

## 6. 회귀 위험 / 주의

1. **`TooldiCatalogSourceError` 잔류 처리** — `nodeUtils.ts:5` 가 import. error 클래스만 살리려면 별도 module (예: `packages/tool-adapters/src/errors/tooldiCatalogSourceError.ts`) 로 분리 후 나머지 catalog source code 삭제. 안 그러면 `TooldiCatalogSourceError` 까지 같이 죽는데, `isSpringActivationFailure` 가 의미를 잃음. 두 옵션:
   - A. error 클래스 분리 보존 + 나머지 sweep
   - B. `nodeUtils.ts` 의 helper 도 0 caller 이므로 함께 제거 (PR 4.5 메모 — "PR 6 worker DI sweep 시 함께 정리 후보")
   - 권장: B (helper 자체가 0 caller). 확실히 0 caller 면 클래스도 함께 죽이고 nodeUtils 의 helper 도 동반 제거.

2. **`interviewLlm.ts` 의 phantom dep** — `@langchain/google-genai` + `zod` 직접 import. agent-worker `package.json` 에 미선언. PR 6 sweep 과 별개로 자연스럽게 fix 할 기회 (deps 명시적 선언). 이번에 추가하면 codex Finding 3 의 잔재까지 해소.

3. **LangGraph postgres checkpoint 호환성** — DI 변경 시 graph topology 자체는 변하지 않지만, `RunJobGraphDependencies` 타입 변경이 직렬화에 영향 없음. 확인은 smoke 로 충분.

4. **types.ts 잔재** — PR 6 후 unused 인 type 들 (예: `TemplateCandidateBundle`, `TemplateCandidateSet`) 확정 dead 시 함께 제거. 단 contracts 와의 cross-package 의존이 살아있는지 다시 확인.

5. **package.json 의존성 정리** — `apps/agent-worker/package.json` 의 `@tooldi/tool-registry`, `@tooldi/tool-adapters` workspace deps 가 sweep 후 미사용이면 제거. 다만 `pnpm-workspace.yaml` 에서 패키지 자체를 빼면 의존 graph 가 깨지므로 순서 중요.

6. **단계별 commit vs 단일 commit** — 사용자 정책 (`feedback_no_auto_commit`) 따라 사용자 승인 후 commit. 기본은 단일 PR 6 commit 이지만 sweep 분량이 크면 사용자에게 sub-step 분할 commit 제안 가능.

## 7. 수용 기준

- `rg "adaptiveCompositionDecisionBuilder|buildAdaptiveCompositionDecision|adaptiveVocabularyRegistry|createStructuredOutputModel|StructuredOutputProvider"` → production/test 0 hits.
- 각 worker DI 항목 (`toolRegistry`, `imagePrimitiveClient`, `assetStorageClient`, `textLayoutHelper`, `templateCatalogClient`, `tooldiCatalogSourceClient`) 별로 production+test caller 0건 또는 보존 정당화 명시.
- `pnpm smoke:object-native` PASS — v6 pipeline 3 createLayer commands.
- typecheck/build/api test/worker test/agent-llm test 모두 PASS.
- v6 pipeline / interview LangChain 경로 무변경 (`git diff --name-only` 로 v6 파일 0건 확인).
- public contract (PR 5c 결정) 무변경.
- 단일 revert 가능성 — PR 6 commit 만 되돌려도 v6 동작 유지.

## 8. 메모리 / lock 결정 요약

- 커밋: 사용자 명시 요청 시에만 (`feedback_no_auto_commit`)
- 메시지: `[refactor]` 접두어 + 한국어, Co-Authored-By 절대 금지 (`feedback_commit_format`)
- 작업 디렉터리: pnpm workspace (`agent-workflow-test/tooldi-agent-runtime` 한정 pnpm)
- Plan 모드 호출 금지, 단 구현 진입 전 내부 plan(읽을 파일/순서/검증/롤백) 은 항상 선수립 (`feedback_implicit_planning`)
- 조사·리서치는 Agent 로 위임 가능 (`feedback_delegate_research`)
- 세션 종료 전 의미 있는 변경이면 `/session-save` 로 vault 적재 (CLAUDE.md `Obsidian Memory Workflow`)
- 핸드오프 모순 발생 시 사용자 확인 후 핸드오프 자체를 수정해 진행 (PR 4 C안 보정 / PR 5b Option 1 / PR 5b Option A 사례 참고)

## 9. 참조

### 정규 문서

- `/home/ubuntu/github/tooldi/tws-editor-api/AGENTS.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/AGENTS.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/CLAUDE.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md`

### Dead-code 조사 baseline (MERGED-FINAL)

- `/home/ubuntu/github/tooldi/tws-editor-api/docs/dead-code-investigate/MERGED-FINAL.md`
  - Critical corrections: lines 160-192
  - Phase 0 baseline lock: lines 194-228 (PR 1)
  - Phase 1 safe leaf cleanup: lines 229-264 (PR 2)
  - Phase 2 graph topology prune: lines 266-291 (PR 3)
  - Phase 3 legacy phase files: lines 293-345 (PR 4)
  - Phase 4 post-legacy import sweep checkpoint: lines 347-378 (PR 4.5)
  - Phase 5a runtime mixed cleanup: lines 380-414
  - Phase 5b planner cleanup: lines 416-447
  - Phase 5c public contract cleanup: lines 449-457
  - **Phase 6 transitive package sweep**: lines 458-481
  - Phase 7 docs / PoC / bench drift sync: lines 482-501
  - Phase 8 separate owner decision: lines 503-525

### 직전 PR 핸드오프

- `agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr1-baseline-lock-evidence.md`
- `agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr3-graph-topology-prune-handoff.md`
- `agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr4-legacy-phase-deletion-handoff.md`
- `agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr5-mixed-cleanup-handoff.md`

### 작업기록 (llm-store vault)

- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-dead-code-investigation.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-runtime-postgres-drizzle-foundation.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr1-baseline-lock.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr2-safe-leaf-cleanup.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr3-graph-topology-prune.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr4-boundary-decision.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr4-execution-c-path.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr45-spring-activation-prune.md`

### 직전 커밋 (HEAD 부터 5개)

```
a085111 [refactor] agent runtime PR5c: public contract v6-only 잠금
f19b926 [refactor] agent runtime PR5b: planner DI 제거
1b68910 [refactor] agent runtime PR5a: mixed 파일 v6-only 정리
16aa517 [refactor] agent runtime PR4.5: SpringCatalogActivationError 분기 제거
0d59360 [refactor] agent runtime PR4: legacy phase 파일 일괄 삭제
```

### 알려진 blocker (PR 6 영향 없음)

- `pnpm local:toolditor:eval:object-native:real` 이 stale `object-native-reference-audit.json` 을 기대해 fail. PR 1 evidence 노트 참조.
- LangGraph postgres checkpointer drain/migration: 시리즈 전체 deploy-time 운영 이슈. PR 6 단독 fix 영역 아님.

## 10. 다음 스레드 시작 프롬프트

> Implement PR 6 — Transitive Package Sweep — for `agent-workflow-test/tooldi-agent-runtime`.
>
> Read `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr6-package-sweep-handoff.md` first. It contains the PR series state, scope, MERGED-FINAL line mapping, validation gates, sweep order, regression notes, and acceptance criteria.
>
> Repo root: `/home/ubuntu/github/tooldi/tws-editor-api`. Runtime workdir: `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime`.
>
> PR 0~5c are committed (`52b45f4`, `43d88c6`, `558d6e1`, `9f42bac`, `0d59360`, `16aa517`, `1b68910`, `f19b926`, `a085111`). Toolditor mirror is at `6378f0c33`. Start from a clean tree.
>
> Constraints:
>
> - PR 6 is a single commit by default. Sub-step commits only with explicit user approval.
> - Each sweep target requires production+test caller sweep (rg gate) BEFORE deletion. Do not delete on assumption.
> - PR 6 stays runtime-package-only (no public contract change, no LangGraph topology change, no v6 pipeline change).
> - `state.plan`, v6/interview/finalize fields, `processRunJobFixtures.ts` legacy-bypass guards, public contract (PR 5c) must survive untouched.
> - v6 pipeline files (`phases/v6*.ts`, `v6PipelineNode.ts`, `v6TrendResearchNode.ts`) and interview LangChain (`interviewLlm.ts`, `interviewNode.ts`) must NOT be modified.
> - For `TooldiCatalogSourceError` decision: prefer Option B (remove `nodeUtils.ts` helpers since they have 0 caller, then full catalog source sweep). Confirm with user if uncertain.
> - For `interviewLlm.ts` phantom deps (`@langchain/google-genai`, `zod`): treat as opportunistic fix — add to `apps/agent-worker/package.json` deps. Codex adversarial review Finding 3 follow-up.
> - Commit policy: `[refactor]` prefix + Korean, no Co-Authored-By, only on explicit user approval (`feedback_no_auto_commit`).
> - Run typecheck/build/agent-api test/agent-worker test/agent-llm test/smoke:object-native and report results before requesting commit approval.
> - PR 7 (docs/PoC/bench) is out of scope for this thread.
