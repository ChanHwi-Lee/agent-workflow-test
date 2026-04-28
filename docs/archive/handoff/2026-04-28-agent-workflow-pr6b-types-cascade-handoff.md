# Agent Workflow Legacy Cleanup PR 6b — types.ts Dead-State Cascade — 다음 스레드 핸드오프

생성일: 2026-04-28
선행: PR 0 → PR 1 → PR 2 → PR 3 → PR 4 → PR 4.5 → PR 5a → PR 5b → PR 5c → PR 6

## 1. 작업 목표

PR 6 가 worker DI / package 수준 dead code 를 일괄 sweep 한 뒤 남은 **types.ts dead-state types + RunJobGraphState dead 필드 + tool-adapters 잔여 type-only 패키지** 를 정리한다.

PR 6 진행 중 §6.4 가 경고했던 cross-package cascade 가 예상보다 깊다는 것이 확인됐다. dead-state types 는 producer 가 0 이지만 (1) `graphHelpers.ts` / `representativeReadiness.ts` 의 type signature 에 묶여 있고, (2) `finalizeNodes.ts` 의 `state.X ? ... : ...` conditional 에 propagation 되며, (3) 일부는 `@tooldi/agent-contracts` 의 ref 필드와 cross-cut 된다. PR 6 단일 commit 범위를 초과하므로 PR 6b 로 분리.

PR 6b 의 핵심:
1. `runJobGraphState.ts` 의 producer-0 state field 제거 (`templatePriorBundle*`, `candidateSets*`, `sourceSearch*`, `typographyDecision*`, `selectionDecision*`, `searchProfile*`, `retrievalStage*`, `selectionPolicy`)
2. `types.ts` 의 dead interface 제거 (`TemplatePriorBundle` 계열, `TemplateCandidateBundle`, `SourceSearchSummary` 계열, `TypographyDecision` 계열, `SelectionDecision`, `SearchProfileArtifact`, `RetrievalStageResult`, `TemplateSelectionPolicy`, `RepresentativeReadinessSummary`, `GraphicCompositionSet` 등)
3. `graphHelpers.ts` / `representativeReadiness.ts` 의 dead 함수 정리
4. `finalizeNodes.ts` 의 dead conditional propagation 제거
5. `apps/agent-worker/src/types.ts` 의 `@tooldi/tool-adapters` import 제거
6. `packages/tool-adapters` 패키지 통째로 삭제 + workspace dep 제거
7. (선택) `interviewLlm.ts` phantom deps (`@langchain/google-genai`, `zod`) 를 `apps/agent-worker/package.json` 에 명시 — codex Finding 3 follow-up

## 2. 전체 PR 시리즈

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
| PR 6 | Transitive Package Sweep | adaptive composition chain 전체 + tool-registry 패키지 + tool-adapters 런타임 클래스 + worker tool adapter facade + nodeUtils SpringActivation helper 제거. tool-adapters 는 type-only carve-out 으로 슬림화 | DONE — `9870ce0` |
| **PR 6b** | **types.ts Dead-State Cascade** | runJobGraphState producer-0 필드 + types.ts dead interface + graphHelpers/representativeReadiness/finalizeNodes 의 dead 함수·conditional + tool-adapters 패키지 자체 삭제 | **이 스레드 — main** |
| PR 7 | Docs / PoC / Bench Drift Sync | runtime cleanup 과 별도로 문서·PoC·bench 정렬 | 미시작 |

## 3. MERGED-FINAL 매핑

`/home/ubuntu/github/tooldi/tws-editor-api/docs/dead-code-investigate/MERGED-FINAL.md`

- Phase 6 — Transitive Package Sweep: lines 458-481 (PR 6 cover, PR 6b 는 §6.4 cross-package cascade 분리분)
- Phase 7 — Docs / PoC / Bench Drift Sync: lines 482-501 (PR 7)
- Critical corrections: lines 160-192 (`runJobGraphState.plan` 보존 — PR 6b 에서도 유지)
- Final Status Taxonomy: lines 510~ (PR 단계별 책임 표)

선행 PR 6 핸드오프 §6.4 명시:
> **types.ts 잔재** — PR 6 후 unused 인 type 들 (예: `TemplateCandidateBundle`, `TemplateCandidateSet`) 확정 dead 시 함께 제거. 단 contracts 와의 cross-package 의존이 살아있는지 다시 확인.

PR 6 실행 중 이 cascade 가 graphHelpers / representativeReadiness / finalizeNodes 와 묶여 있다는 것이 확정됐고, 단일 commit 정책을 깨지 않기 위해 PR 6b 로 분리.

## 4. PR 6b 진입 시점 baseline (`9870ce0` HEAD)

### 4.1 정리 대상 — RunJobGraphState producer-0 필드

`apps/agent-worker/src/graph/runJobGraphState.ts` 에 정의됐지만 production node 가 한 번도 write 하지 않는 필드:

| 필드 | 타입 | 보존 여부 | 비고 |
|---|---|---|---|
| `templatePriorBundle` | `TemplatePriorBundle` | 제거 | finalizeNodes:242 가 conditional propagate 만 함 |
| `templatePriorBundleRef` | `string` | **보존** | contracts (run-result.ts, live-draft-artifact-bundle.ts, worker-callbacks.ts) 와 cross-cut. PR 5c lock 영역 |
| `searchProfile` | `SearchProfileArtifact` | 제거 | finalizeNodes 만 conditional read |
| `searchProfileRef` | `string` | **보존** | contracts ref 와 cross-cut |
| `retrievalStage` | `RetrievalStageResult` | 제거 | finalizeNodes 만 conditional read |
| `retrievalStageRef` | `string` | **보존** | contracts ref 와 cross-cut |
| `selectionPolicy` | `TemplateSelectionPolicy` | 제거 | 0 read, 0 write |
| `candidateSets` | `TemplateCandidateBundle` | 제거 | finalizeNodes 만 conditional read |
| `candidateSetRef` | `string` | **보존** | contracts ref 와 cross-cut 가능성 sweep 필요 |
| `sourceSearchBackground` | `SourceSearchSummary["background"]` | 제거 | 0 read, 0 write |
| `sourceSearchGraphic` | `SourceSearchSummary["graphic"]` | 제거 | 0 read, 0 write |
| `sourceSearchPhoto` | `SourceSearchSummary["photo"]` | 제거 | 0 read, 0 write |
| `typographySearchSummary` | `SourceSearchSummary["font"]` | 제거 | 0 read, 0 write |
| `selectionDecision` | `SelectionDecision` | 제거 | graphHelpers + representativeReadiness 가 type-only signature 로 사용 (caller 0) |
| `selectionDecisionRef` | `string` | **보존** | contracts ref 와 cross-cut |
| `typographyDecision` | `TypographyDecision` | 제거 | graphHelpers + representativeReadiness 가 type-only signature 로 사용 (caller 0) |
| `typographyDecisionRef` | `string` | **보존** | contracts ref 와 cross-cut |
| `sourceSearchSummary` | `SourceSearchSummary` | 제거 | graphHelpers 가 type-only signature 로 사용 (caller 0) |
| `sourceSearchSummaryRef` | `string` | **보존** | contracts ref 와 cross-cut |

**핵심 룰**: `*Ref` (string) 는 contracts (PR 5c lock) 의 input/output side 에 살아있을 수 있어 sweep 으로 cross-cut 검증 후 살린다. struct (interface) 는 producer 0 이면 제거.

### 4.2 정리 대상 — types.ts dead interfaces

`apps/agent-worker/src/types.ts` 에서 위 state field 가 가리키는 interface + 그들의 의존 sub-interface:

```
TemplatePriorBundle
├── TemplatePriorScaffold (TooldiTemplateDocument | null 의존)
├── TemplatePriorCandidate
├── TemplatePriorQueryDiagnostic (TooldiCatalogSourceErrorCode 의존)
└── TemplatePriorDiagnostics

TemplateCandidateBundle (TemplateCandidateSet 4 회 의존)

SourceSearchSummary (TooldiCatalogSourceMode 의존)
├── SourceSearchFamilySummary
└── SourceSearchQueryAttempt
└── RepresentativeReadinessSummary
└── RepresentativeReadinessStatus

TypographyDecision (TooldiCatalogSourceMode 의존)
└── TypographyChoice

SelectionDecision
└── GraphicCompositionSet
└── GraphicCompositionEntry
└── GraphicCompositionRole
└── (compareCriteria, layoutMode, decorationMode, photoBranchMode literal unions)

SearchProfileArtifact

RetrievalStageResult

TemplateSelectionPolicy
```

**보존 대상 (state field 와 무관하게 다른 곳에서 alive):**
- `LayoutBounds` — v6 path 전반 사용
- `ConcreteLayoutPlan` 계열 — sweep 필요
- `FreeformLayoutPlan` / `FreeformRenderableBlock` — v6 alive
- `ProjectedObject` / `ProjectedObjectGraph` — v6 alive
- `MessageAtom` / `MessageAtomPlan` / `BlockBindingPlan` / `EditableBlockPlan` — v6 alive
- `ObjectNative*` (ReadinessDiagnostics, Audit, Selection, Renderability) — v6 alive
- `AssetPlan` 계열 — sweep 필요
- `CompositionVariant*` / `CompositionRanking` / `CompositionBrief` — sweep 필요

### 4.3 정리 대상 — graphHelpers / representativeReadiness / finalizeNodes

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime

# graphHelpers.ts — selectionDecision/typographyDecision/sourceSearchSummary 사용 함수 모두 caller 0 검증
rg -n "buildXXX|summariseXXX" apps/agent-worker/src --glob '!dist/**' --glob '!*.test.ts'

# representativeReadiness.ts — `summariseRepresentativeReadiness` 등 caller 0 검증
rg -n "representativeReadiness|summariseRepresentativeReadiness" apps/agent-worker/src --glob '!dist/**'

# finalizeNodes.ts:286-296 의 state.X ? ... : ... conditional 모두 producer 0 인 X 만 참조하므로 함께 제거
rg -n "state\.(templatePriorBundle|searchProfile|retrievalStage|candidateSets|selectionDecision|typographyDecision|sourceSearchSummary)" apps/agent-worker/src/graph/finalizeNodes.ts
```

각 helper 함수는 caller 0 임을 확정한 뒤 **함수 자체 + 시그니처에 쓰인 type import** 모두 제거.

### 4.4 정리 대상 — tool-adapters 패키지

PR 6 에서 type-only carve-out 으로 슬림화 (`packages/tool-adapters/src/index.ts` 가 4 개 type 만 re-export). PR 6b 가 types.ts 의 의존을 끊으면:

1. `apps/agent-worker/src/types.ts` 에서 `import type { ... } from "@tooldi/tool-adapters"` 라인 제거
2. `apps/agent-worker/package.json` 의 `"@tooldi/tool-adapters": "workspace:*"` dep 제거
3. `packages/tool-adapters/**` 통째로 삭제
4. typecheck 통과 확인

### 4.5 (선택) interviewLlm phantom deps

`apps/agent-worker/src/graph/interviewLlm.ts` 가 `@langchain/google-genai` + `zod` 를 직접 import 하지만 `apps/agent-worker/package.json` 에 명시 안 됨. PR 6 핸드오프 §6.2 에서 opportunistic fix 후보로 명시. PR 6b 에서 같이 처리 가능.

## 5. PR 6b 작업 절차

### 5.1 진입 전 점검

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test
git status --short
git log --oneline -5
```

다음 5 개 커밋이 직전에 있어야 한다 (HEAD `9870ce0`):

```
9870ce0 [refactor] agent runtime PR6: package-level dead code 일괄 sweep
a085111 [refactor] agent runtime PR5c: public contract v6-only 잠금
f19b926 [refactor] agent runtime PR5b: planner DI 제거
1b68910 [refactor] agent runtime PR5a: mixed 파일 v6-only 정리
16aa517 [refactor] agent runtime PR4.5: SpringCatalogActivationError 분기 제거
```

깨끗한 working tree 에서 시작.

### 5.2 단계별 진행

**Step 1 — 명백한 dead state field 제거 (write 0 + read 0)**
1. `runJobGraphState.ts` 에서 다음 필드 + 관련 import 제거:
   - `selectionPolicy`, `sourceSearchBackground`, `sourceSearchGraphic`, `sourceSearchPhoto`, `typographySearchSummary`
2. typecheck 통과 확인

**Step 2 — finalizeNodes conditional propagate 만 있는 필드 제거**
1. `finalizeNodes.ts` 의 `...(state.X ? { X: state.X } : {})` 라인을 제거 (state.X 가 dead 인 경우):
   - `templatePriorBundle`, `searchProfile`, `retrievalStage`, `candidateSets`, `selectionDecision`, `typographyDecision`, `sourceSearchSummary`
2. `runJobGraphState.ts` 에서 위 필드 제거
3. `runJobGraphState.ts` 에서 매칭되는 `*Ref` 필드는 contracts cross-cut sweep 으로 보존 정당화 명시 후 유지
4. `types.ts` 의 `FinalizeRunDraft.input` 타입 정의에서도 위 dead struct 필드 제거 (`templatePriorBundle?`, `searchProfile?`, ...)

**Step 3 — graphHelpers / representativeReadiness dead helper 제거**
1. caller 0 인 함수 sweep
2. 각 함수 + 시그니처에 쓰인 type import 모두 제거
3. import side effect 가 사라진 type alias 도 정리

**Step 4 — types.ts dead interface 제거**
1. §4.2 의 dead interface 트리 일괄 제거
2. `import type { ... } from "@tooldi/tool-adapters"` 의 4 개 type 도 import 제거
3. dead interface 의 transitively-only consumer 가 된 sub-interface 도 sweep 후 제거

**Step 5 — tool-adapters 패키지 삭제**
1. `apps/agent-worker/package.json` 에서 `@tooldi/tool-adapters` dep 제거
2. `packages/tool-adapters/**` 디렉터리 삭제
3. `pnpm install` 로 workspace 동기화

**Step 6 — (선택) interviewLlm phantom deps 명시**
1. `apps/agent-worker/package.json` 의 `dependencies` 에 `@langchain/google-genai` + `zod` 추가
2. 버전은 monorepo 의 다른 위치에서 사용중인 버전과 정렬

### 5.3 검증 게이트

각 Step 끝, 그리고 최종 commit 전 모두 통과:

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime

# Acceptance: dead types 0 hits
rg -n "TemplatePriorBundle\b|TemplatePriorScaffold|TemplatePriorCandidate|TemplatePriorDiagnostics|TemplatePriorQueryDiagnostic|TemplateCandidateBundle|TemplateCandidateSet|SourceSearchSummary|SourceSearchFamilySummary|SourceSearchQueryAttempt|TypographyDecision|TypographyChoice|SelectionDecision\b|SearchProfileArtifact|RetrievalStageResult|TemplateSelectionPolicy|RepresentativeReadinessSummary|GraphicCompositionSet|GraphicCompositionEntry" \
  apps/agent-worker/src --glob '!dist/**' --glob '!*.test.ts'

# Acceptance: tool-adapters 0 hits
rg -n "@tooldi/tool-adapters|tool-adapters" apps packages --glob '!dist/**' --glob '!node_modules/**'

# 빌드/테스트
pnpm -r --if-present typecheck
pnpm build
pnpm -F @tooldi/agent-api test
pnpm -F @tooldi/agent-worker test
pnpm -F @tooldi/agent-llm test
pnpm smoke:object-native
```

smoke 가 PR 6b 종료 시점에도 `[object-native-smoke] verified v6 pipeline emitted 3 createLayer commands via v6-freeform-layout-pipeline` 출력하면 PASS.

### 5.4 절대 손대지 않는 것 (PR 6b 한정)

- v6 phase 파일 (`phases/v6*.ts`) 일체
- `interviewNode.ts`, `interviewLlm.ts` 본문 (deps 명시는 OK)
- `state.plan` 및 `runJobGraphState.ts` 의 v6 / interview / finalize 필드
- `processRunJobFixtures.ts` 의 legacy bypass guard
- LangGraph postgres checkpointer 관련
- public contract — PR 5c 잠금. PR 6b 에서 추가 변경 시 같은 PR 5c 룰 (Toolditor mirror 동시 갱신) 적용
- contracts 의 `*Ref` 필드 (templatePriorBundleRef, searchProfileRef, retrievalStageRef, selectionDecisionRef, typographyDecisionRef, sourceSearchSummaryRef, candidateSetRef) — PR 5c 가 보존 명시. struct 만 제거하고 ref 는 보존

### 5.5 커밋 메시지 초안

```
[refactor] agent runtime PR6b: types.ts dead-state cascade 정리

PR 6 sweep 후 producer-0 으로 확정된 RunJobGraphState 필드 (templatePriorBundle,
candidateSets, sourceSearch*, typographyDecision, selectionDecision,
searchProfile, retrievalStage, selectionPolicy 등) + 그들이 가리키는
types.ts dead interface (TemplatePriorBundle 계열, TemplateCandidateBundle,
SourceSearchSummary 계열, TypographyDecision, SelectionDecision 등) 일괄
제거. graphHelpers / representativeReadiness 의 0-caller helper 함수와
finalizeNodes 의 dead conditional propagate 도 함께 정리. types.ts 가
@tooldi/tool-adapters import 를 끊었으므로 tool-adapters 패키지 자체 삭제.
contracts 의 *Ref string 필드는 PR 5c lock 영역이라 보존.

(선택) interviewLlm.ts 의 @langchain/google-genai + zod phantom deps 를
apps/agent-worker/package.json 에 명시.

검증: rg gate 0 hits (dead types / tool-adapters / phantom deps),
typecheck/build/api/worker/agent-llm test/smoke:object-native 모두 PASS.
v6 pipeline / interview LangChain / public contract / state.plan /
processRunJobFixtures regression guards 무변경.
```

## 6. 회귀 위험 / 주의

1. **`*Ref` (string) 는 절대 제거 금지** — PR 5c 가 잠근 contracts 와 cross-cut. struct (interface) 만 제거.

2. **`finalizeNodes.ts` 의 `FinalizeRunDraft.input` 타입** — `apps/agent-worker/src/types.ts:1645+` 영역. dead struct 필드 (`templatePriorBundle?`, `candidateSets?`, etc.) 는 제거하지만 `*Ref?` 필드는 유지. `phases/finalizeRun.ts:25+` 의 options 타입도 같은 정책.

3. **graphHelpers 의 export 함수가 다른 곳에서 import 되어 있는지** — `summariseRepresentativeReadiness` 같은 helper 가 v6 path 의 어딘가에서 호출되면 caller 0 가정이 깨짐. sweep 필수.

4. **representativeReadiness.ts 의 `RepresentativeReadinessSummary` 자체** — 이 type 이 v6 path output (예: `ObjectNativeRenderabilityReport`) 에 들어가는지 확인. 만약 들어가면 type 자체는 보존.

5. **`TooldiCatalogSourceMode` enum** — `apps/agent-worker/src/lib/config.ts` 의 `tooldiCatalogSourceMode` env 가 여전히 type 으로 알아보기 위해 필요할 수 있음. config 쪽 sweep 필수.

6. **`@langchain/google-genai` + `zod` 명시** — codex Finding 3 에 따라 이미 다른 PR 후보로 명시되어 있음. 명시 시 monorepo lockfile 충돌 없도록 `pnpm-lock.yaml` 주의.

7. **단계별 commit vs 단일 commit** — 사용자 정책 (`feedback_no_auto_commit`) 따라 사용자 승인 후 commit. 기본은 단일 PR 6b commit 이지만 sweep 분량이 크면 사용자에게 sub-step 분할 commit 제안 가능.

## 7. 수용 기준

- `rg "TemplatePriorBundle\b|TemplateCandidateBundle|SourceSearchSummary|TypographyDecision|SelectionDecision\b|SearchProfileArtifact|RetrievalStageResult|TemplateSelectionPolicy"` → production/test 0 hits.
- `rg "@tooldi/tool-adapters"` → 0 hits (패키지 자체 삭제됨).
- `rg "templatePriorBundle\b|searchProfile\b|retrievalStage\b|candidateSets\b|selectionDecision\b|typographyDecision\b|sourceSearchSummary\b|selectionPolicy"` 시 state field/struct 정의 0 hits, contracts/finalize ref 만 hits.
- `pnpm smoke:object-native` PASS — v6 pipeline 3 createLayer commands.
- typecheck/build/api test/worker test/agent-llm test 모두 PASS.
- v6 pipeline / interview LangChain 경로 무변경 (`git diff --name-only` 로 v6 파일 0건 확인).
- public contract (PR 5c 결정) 무변경.
- 단일 revert 가능성 — PR 6b commit 만 되돌려도 v6 동작 유지.

## 8. 메모리 / lock 결정 요약

- 커밋: 사용자 명시 요청 시에만 (`feedback_no_auto_commit`)
- 메시지: `[refactor]` 접두어 + 한국어, Co-Authored-By 절대 금지 (`feedback_commit_format`)
- 작업 디렉터리: pnpm workspace (`agent-workflow-test/tooldi-agent-runtime` 한정 pnpm)
- Plan 모드 호출 금지, 단 구현 진입 전 내부 plan(읽을 파일/순서/검증/롤백) 은 항상 선수립 (`feedback_implicit_planning`)
- 조사·리서치는 Agent 로 위임 가능 (`feedback_delegate_research`)
- 세션 종료 전 의미 있는 변경이면 `/session-save` 로 vault 적재 (CLAUDE.md `Obsidian Memory Workflow`)
- 핸드오프 모순 발생 시 사용자 확인 후 핸드오프 자체를 수정해 진행 (PR 4 C안 보정 / PR 5b Option 1 / PR 5b Option A / PR 6 cascade 분리 사례 참고)

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
  - **Phase 6 transitive package sweep**: lines 458-481 — PR 6 (커밋 `9870ce0`) + PR 6b (이 핸드오프) 가 분담
  - Phase 7 docs / PoC / bench drift sync: lines 482-501
  - Phase 8 separate owner decision: lines 503-525

### 직전 PR 핸드오프

- `agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr1-baseline-lock-evidence.md`
- `agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr3-graph-topology-prune-handoff.md`
- `agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr4-legacy-phase-deletion-handoff.md`
- `agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr5-mixed-cleanup-handoff.md`
- `agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr6-package-sweep-handoff.md` ← PR 6 입력 핸드오프

### PR 6 작업 결과 (이번 핸드오프 baseline)

- 커밋 `9870ce0` — PR 6 final
- 50 files changed, 16 insertions(+), 4598 deletions(-)
- 삭제된 파일 목록 (요약):
  - `apps/agent-worker/src/phases/buildAdaptiveCompositionDecision*.ts`, `adaptiveVocabularyRegistry.ts`
  - `apps/agent-worker/src/tools/` 전체 (5 adapter facade + registry.ts)
  - `packages/tool-registry/**` 전체
  - `packages/tool-adapters/src/{storage,primitives,helpers}/**`
  - `packages/tool-adapters/src/catalog/{tooldiCatalogSourceClient,tooldiCatalogSourceHttp,tooldiCatalogAssetMapper}.ts` + `.test.ts`
  - `packages/agent-llm/src/structuredOutputModel.ts`
- 슬림화: `packages/tool-adapters/src/catalog/templateCatalogClient.ts` (런타임 클래스 제거, type 만 보존), `tooldiCatalogSourceTypes.ts` (4 type 만 보존), `index.ts` (type-only re-export)

### 알려진 blocker (PR 6b 영향 없음)

- `pnpm local:toolditor:eval:object-native:real` 이 stale `object-native-reference-audit.json` 을 기대해 fail. PR 1 evidence 노트 참조.
- LangGraph postgres checkpointer drain/migration: 시리즈 전체 deploy-time 운영 이슈. PR 6b 단독 fix 영역 아님.

## 10. 다음 스레드 시작 프롬프트

> Implement PR 6b — types.ts Dead-State Cascade — for `agent-workflow-test/tooldi-agent-runtime`.
>
> Read `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr6b-types-cascade-handoff.md` first. It contains the PR series state, scope, MERGED-FINAL line mapping, sweep order, regression notes, and acceptance criteria.
>
> Repo root: `/home/ubuntu/github/tooldi/tws-editor-api`. Runtime workdir: `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime`.
>
> PR 0~6 are committed (`52b45f4`, `43d88c6`, `558d6e1`, `9f42bac`, `0d59360`, `16aa517`, `1b68910`, `f19b926`, `a085111`, `9870ce0`). Toolditor mirror is at `6378f0c33`. Start from a clean tree.
>
> Constraints:
>
> - PR 6b is a single commit by default. Sub-step commits only with explicit user approval.
> - 6 sweep steps: dead state field 제거 (Step 1) → finalizeNodes conditional + state field cascade (Step 2) → graphHelpers/representativeReadiness dead helper (Step 3) → types.ts dead interface (Step 4) → tool-adapters 패키지 삭제 (Step 5) → (선택) interviewLlm phantom deps 명시 (Step 6).
> - Each sweep target requires production+test caller sweep (rg gate) BEFORE deletion. Do not delete on assumption.
> - PR 6b stays runtime-internal-only (no public contract change, no LangGraph topology change, no v6 pipeline change).
> - `state.plan`, v6/interview/finalize 필드, `processRunJobFixtures.ts` legacy-bypass guards, public contract (PR 5c) must survive untouched.
> - **`*Ref` (string) 필드는 절대 제거 금지** — contracts 의 input/output side 와 cross-cut. struct (interface) 만 제거.
> - v6 pipeline files (`phases/v6*.ts`, `v6PipelineNode.ts`, `v6TrendResearchNode.ts`) and interview LangChain (`interviewLlm.ts`, `interviewNode.ts`) body must NOT be modified. (interviewLlm 의 deps 명시는 package.json 에서만 OK.)
> - Commit policy: `[refactor]` prefix + Korean, no Co-Authored-By, only on explicit user approval (`feedback_no_auto_commit`).
> - Run typecheck/build/agent-api test/agent-worker test/agent-llm test/smoke:object-native and report results before requesting commit approval.
> - PR 7 (docs/PoC/bench) is out of scope for this thread.
