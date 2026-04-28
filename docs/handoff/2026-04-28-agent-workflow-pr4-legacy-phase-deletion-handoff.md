# Agent Workflow Legacy Cleanup PR 4: Legacy Phase File Deletion — 다음 스레드 핸드오프

생성일: 2026-04-28
선행: PR 0 (PostgreSQL/Drizzle persistence) → PR 1 (Baseline Lock, `43d88c6`) → PR 2 (Safe Leaf Cleanup, `558d6e1`) → PR 3 (Graph Topology Prune, `9f42bac`)

## 1. 작업 목표

PR 3 의 그래프 토폴로지 정리로 인해 import 0건 상태가 된 legacy phase 파일들을 일괄 삭제한다. PR 3 후 typecheck/build 는 그대로 통과 중이며, 해당 파일들은 어떤 production 진입점에서도 도달하지 못한다.

PR 4 는 **파일 삭제만 수행한다**. mixed cleanup, planner refactor, package sweep, contract 변경, state field 정리는 **하지 않는다**.

## 2. 전체 PR 시리즈 (재명시)

source: `/home/ubuntu/github/tooldi/tws-editor-api/docs/dead-code-investigate/MERGED-FINAL.md`

| PR | 단계 | 책임 / 역할 | 상태 |
|---|---|---|---|
| PR 0 | PostgreSQL/Drizzle persistence foundation | 영속성 계층 마이그레이션 토대 | DONE — `52b45f4` |
| PR 1 | Baseline Lock | v6 reachability + legacy non-reachability 테스트와 evidence 잠금 | DONE — `43d88c6` |
| PR 2 | Safe Leaf Cleanup | zero-ref leaf 7개 제거 (단일 파일/심볼) | DONE — `558d6e1` |
| PR 3 | Graph Topology Prune | legacy 엣지/노드 등록/라우팅 제거 + v6-only 단순화 + 가드 | DONE — `9f42bac` |
| **PR 4** | **Legacy Phase File Deletion** | **PR 3 으로 unreachable 해진 phase 파일들 삭제 (test 포함). C안 보정으로 §3.3 보류 4건 제외** | **현재 작업** |
| PR 4.5 | nodeUtils SpringActivationError prune | `nodeUtils.ts` 의 `SpringCatalogActivationError` 분기 제거 + `assembleTemplateCandidates.ts`/`candidateSearchers.ts`/`layoutCandidateSet.ts` 삭제 | 미시작 — §3.3 신설 |
| PR 5a | Runtime Mixed Cleanup | mixed 파일의 legacy 분기 제거 (`emitSkeletonMutations.ts` v6-only, `layerCommandBuilder.ts` save-only 등). state field 정리. **public API 불변** | 미시작 |
| PR 5b | Planner Cleanup | `TemplatePlanner` DI/`TEMPLATE_PLANNER_*` env 제거, deterministic draft 인라인화 | 미시작 |
| PR 5c | Public Contract Cleanup | `workflowVariant` required, `latestSaveReceipt` 필수화, `tool.result` 이벤트 분기 제거 등 contract 변경 | 미시작 |
| PR 6 | Transitive Package Sweep | DI 항목/패키지 모듈 (tool-registry, tool-adapters/catalog 등) 제거. PR 5a~c 완료 후에만 | 미시작 |
| PR 7 | Docs / PoC / Bench Drift Sync | runtime cleanup 과 별도로 문서·PoC·bench 정렬 | 미시작 |

## 3. PR 4 범위 — 삭제 대상

source: MERGED-FINAL §Phase 3 (lines 293–345).

### 3.1 Legacy build / adaptive / object-native chain

- `apps/agent-worker/src/graph/buildNodes.ts`
- `apps/agent-worker/src/graph/buildFailureDrafts.ts`
- `apps/agent-worker/src/phases/buildTemplatePriorSummary.ts`
- `apps/agent-worker/src/phases/buildTemplatePriorBundle.ts`
- `apps/agent-worker/src/phases/buildScenePlans.ts`
- `apps/agent-worker/src/phases/buildSceneStylePlans.ts`
- `apps/agent-worker/src/phases/buildCopyAndAbstractLayoutPlan.ts`
- `apps/agent-worker/src/phases/buildObjectNativePath.ts`
- `apps/agent-worker/src/phases/buildReferenceDrivenFallback.ts`
- `apps/agent-worker/src/phases/projectTemplateGraph.ts`
- `apps/agent-worker/src/phases/buildAdaptiveCompositionDecision.ts` (main builder)
- `apps/agent-worker/src/phases/emitAdaptiveCompositionMutations.ts`
- `apps/agent-worker/src/phases/buildSearchProfile.ts`
- `apps/agent-worker/src/phases/runRetrievalStage.ts`
- `apps/agent-worker/src/phases/assembleTemplateCandidates.ts`
- `apps/agent-worker/src/phases/candidateSearchers.ts`
- `apps/agent-worker/src/phases/compositionEngine.ts`
- `apps/agent-worker/src/phases/compositionEngine.familyCatalog.ts`
- `apps/agent-worker/src/phases/compositionEngine.project.ts`
- `apps/agent-worker/src/phases/compositionEngine.rank.ts`
- `apps/agent-worker/src/phases/buildAssetPlan.ts`
- `apps/agent-worker/src/phases/buildConcreteLayoutPlan.ts`
- `apps/agent-worker/src/phases/selectTypography.ts`
- `apps/agent-worker/src/phases/buildExecutablePlan.ts`
- `apps/agent-worker/src/phases/templatePriorVectorRecall.ts`
- `apps/agent-worker/src/phases/layoutCandidateSet.ts`
- `apps/agent-worker/src/phases/abstractLayoutPlanService.ts`
- `apps/agent-worker/src/phases/copyPlanService.ts`
- `apps/agent-worker/src/phases/copyAbstractLayoutPlanningShared.ts`
- 위 파일들만 테스트하는 `*.test.ts` (test-only artifact 도 삭제)

### 3.2 Legacy rule judge / refinement chain

- `apps/agent-worker/src/graph/refinementNodes.ts`
- `apps/agent-worker/src/phases/ruleJudge.ts`
- `apps/agent-worker/src/phases/ruleJudgeDomainAnalysis.ts`
- `apps/agent-worker/src/phases/ruleJudgeIssueCollector.ts`
- `apps/agent-worker/src/phases/ruleJudgeIssueDefinitions.ts`
- `apps/agent-worker/src/phases/ruleJudgePolicyDetectors.ts`
- `apps/agent-worker/src/phases/ruleJudgeSelectionContext.ts`
- `apps/agent-worker/src/phases/ruleJudgeSemanticMismatchDetectors.ts`
- `apps/agent-worker/src/phases/ruleJudgeStructuralDetectors.ts`
- `apps/agent-worker/src/phases/buildExecutionSceneSummary.ts`
- `apps/agent-worker/src/phases/buildJudgePlan.ts`
- `apps/agent-worker/src/phases/buildRefineDecision.ts`
- `apps/agent-worker/src/phases/emitRefinementMutations.ts`
- 위 파일들만 테스트하는 `*.test.ts`

### 3.3 PR 4 보류 — 다음 PR 로 미룸 (C안 보정, 2026-04-28 추가)

§3.1 의 일부 파일은 보존 영역(`worker.ts`, `nodeUtils.ts`)에서 여전히 import 되고 있어 PR 4 에서 삭제하면 typecheck 가 깨진다. PR 4 는 deletion-only 원칙을 지키기 위해 다음 4개 source 파일은 삭제하지 않고 후속 PR 로 미룬다.

| 보류 파일 | 보존 zone 의 referrer | 미루는 PR |
|---|---|---|
| `apps/agent-worker/src/phases/buildAdaptiveCompositionDecision.ts` | `apps/agent-worker/src/worker.ts:51` (`adaptiveCompositionDecisionBuilder` DI 기본 팩토리) | **PR 6** (worker.ts dependency sweep) |
| `apps/agent-worker/src/phases/assembleTemplateCandidates.ts` | `apps/agent-worker/src/graph/nodeUtils.ts:3` (`SpringCatalogActivationError` re-export) | **PR 4.5** 또는 PR 5a (nodeUtils.ts 의 `SpringCatalogActivationError` 분기 정리) |
| `apps/agent-worker/src/phases/candidateSearchers.ts` | `assembleTemplateCandidates.ts:25` (`SpringCatalogActivationError` 정의처) | PR 4.5 / PR 5a 와 동일 |
| `apps/agent-worker/src/phases/layoutCandidateSet.ts` | `assembleTemplateCandidates.ts:26` (`createLayoutCandidateSet`) | PR 4.5 / PR 5a 와 동일 |

추가 점검:

- `apps/agent-worker/src/phases/adaptiveVocabularyRegistry.ts` 는 §3 에 없지만 `buildAdaptiveCompositionDecision.ts` 가 import 한다. `buildAdaptiveCompositionDecision.ts` 가 살아있는 동안 같이 보존됨 → PR 6 에서 함께 정리.

테스트 처리 (보류된 source 에 한정):

- `assembleTemplateCandidates.test.ts` — `buildSearchProfile` / `buildTemplatePriorSummary` 등 §3 삭제 대상 파일을 import 하므로 source 가 살아도 test 는 어차피 broken. **PR 4 에서 삭제**.
- `buildAdaptiveCompositionDecision.test.ts` — self-contained (자기 source + `../types.js` 만 사용). **PR 4 에서 보존**.
- `candidateSearchers.test.ts`, `layoutCandidateSet.test.ts` — 존재하지 않음.

신규 follow-up PR:

- **PR 4.5 — `nodeUtils.ts` 의 `SpringCatalogActivationError` 분기 정리** (단일 변경): `nodeUtils.ts` 의 `isSpringActivationFailure` 가 더 이상 `SpringCatalogActivationError` 를 분기하지 않도록 좁힌 뒤, 위 4개 보류 파일 삭제 + `assembleTemplateCandidates.test.ts` 가 이미 PR 4 에서 사라졌으므로 추가 작업 없음. 단 `buildAdaptiveCompositionDecision.ts` 와 `adaptiveVocabularyRegistry.ts` 는 worker.ts DI 가 제거될 때 (PR 6) 까지 잔존.

## 4. 절대 손대지 않는 것

- v6 pipeline phase 파일 (`phases/v6*.ts` 전체)
- `executionNodes.ts`, `finalizeNodes.ts`, `interviewNode.ts`, `v6PipelineNode.ts`, `v6TrendResearchNode.ts`, `planningNodes.ts`
- `runJobGraph.ts`, `runJobGraphEdges.ts`, `runJobGraphNodes.ts`, `runJobGraphState.ts`, `runJobGraphTypes.ts`, `graphTasks.ts`, `graphHelpers.ts`, `nodeUtils.ts`
- mixed 파일 (PR 5a 영역): `emitSkeletonMutations.ts`, `layerCommandBuilder.ts`, `planningContext.ts`, `types.ts`, `packages/contracts/src/worker/run-job-envelope.ts`, `packages/contracts/src/artifacts/run-result.ts`
- `worker.ts` 의 dependency 인스턴스화 (PR 6 영역) — `tooldiCatalogSourceClient`, `templateCatalogClient`, `templateCopyPlanGenerator`, `templateAbstractLayoutGenerator`, `adaptiveCompositionDecisionBuilder` 모두 PR 6 까지 보존
- `runJobGraphState.ts` 의 legacy state 필드 (PR 5a 영역)
- API/contracts (PR 5c 영역)
- planner DI / `TEMPLATE_PLANNER_*` env (PR 5b 영역)
- `0001_agent_runtime_init.sql`

## 5. 시작 전 점검

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test
git status --short
git log --oneline -5
```

다음 4개 커밋이 직전에 있어야 한다:

```
9f42bac [refactor] agent runtime PR3: 그래프 토폴로지 v6-only 정리
558d6e1 [refactor] agent runtime PR2: zero-ref 안전 leaf 정리
43d88c6 [chore] 과도하게 긴 테스트 파일 정리리
52b45f4 [refactor] agent runtime PostgreSQL persistence foundation
```

깨끗한 working tree 에서 시작.

진입 시 `AGENTS.md` 와 `tooldi-agent-workflow-v6-layout-freedom-ssot.md` 를 먼저 읽는다 (CLAUDE.md bootstrap 참조).

## 6. 상세 구현 단계

### 단계 0 — Import 0건 사전 검증 (read-only)

각 삭제 대상 파일의 export 가 production 코드에서 0건 import 됨을 확인.

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime

# 6.0.1 — 삭제 대상의 import path 검색 (production)
rg -n --glob '!dist/**' --glob '!node_modules/**' --glob '!*.test.ts' \
  "from \"\\./buildNodes|from \"\\./refinementNodes|from \"\\./buildFailureDrafts|from \"\\./phases/buildTemplatePriorSummary|from \"\\./phases/buildTemplatePriorBundle|from \"\\./phases/buildScenePlans|from \"\\./phases/buildSceneStylePlans|from \"\\./phases/buildCopyAndAbstractLayoutPlan|from \"\\./phases/buildObjectNativePath|from \"\\./phases/buildReferenceDrivenFallback|from \"\\./phases/projectTemplateGraph|from \"\\./phases/buildAdaptiveCompositionDecision|from \"\\./phases/emitAdaptiveCompositionMutations|from \"\\./phases/buildSearchProfile|from \"\\./phases/runRetrievalStage|from \"\\./phases/assembleTemplateCandidates|from \"\\./phases/candidateSearchers|from \"\\./phases/compositionEngine|from \"\\./phases/buildAssetPlan|from \"\\./phases/buildConcreteLayoutPlan|from \"\\./phases/selectTypography|from \"\\./phases/buildExecutablePlan|from \"\\./phases/templatePriorVectorRecall|from \"\\./phases/layoutCandidateSet|from \"\\./phases/abstractLayoutPlanService|from \"\\./phases/copyPlanService|from \"\\./phases/copyAbstractLayoutPlanningShared|from \"\\./phases/ruleJudge|from \"\\./phases/buildExecutionSceneSummary|from \"\\./phases/buildJudgePlan|from \"\\./phases/buildRefineDecision|from \"\\./phases/emitRefinementMutations" \
  apps packages
```

production 측 import 0건 이어야 한다. test 측에서만 잡히는 hits 는 그 테스트 파일도 §3 에 포함되어 함께 삭제 대상인지 확인.

### 단계 1 — 파일 삭제 (C안 보정 반영)

§3.3 보류 4건 (`buildAdaptiveCompositionDecision.ts`, `assembleTemplateCandidates.ts`, `candidateSearchers.ts`, `layoutCandidateSet.ts`) 은 source 보존. 그 외 §3.1 + §3.2 source + 동반 `.test.ts` 삭제. 보류 source 의 broken test 인 `assembleTemplateCandidates.test.ts` 는 §3.3 룰대로 함께 삭제. `buildAdaptiveCompositionDecision.test.ts` 는 self-contained 이므로 보존.

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime

# graph/
git rm apps/agent-worker/src/graph/buildNodes.ts
git rm apps/agent-worker/src/graph/buildFailureDrafts.ts apps/agent-worker/src/graph/buildFailureDrafts.test.ts
git rm apps/agent-worker/src/graph/refinementNodes.ts

# phases/ — legacy build / adaptive / object-native chain (보류 4건 제외)
git rm apps/agent-worker/src/phases/buildTemplatePriorSummary.ts apps/agent-worker/src/phases/buildTemplatePriorSummary.test.ts
git rm apps/agent-worker/src/phases/buildTemplatePriorBundle.ts apps/agent-worker/src/phases/buildTemplatePriorBundle.test.ts
git rm apps/agent-worker/src/phases/buildScenePlans.ts apps/agent-worker/src/phases/buildScenePlans.test.ts
git rm apps/agent-worker/src/phases/buildSceneStylePlans.ts apps/agent-worker/src/phases/buildSceneStylePlans.test.ts
git rm apps/agent-worker/src/phases/buildCopyAndAbstractLayoutPlan.ts apps/agent-worker/src/phases/buildCopyAndAbstractLayoutPlan.test.ts
git rm apps/agent-worker/src/phases/buildObjectNativePath.ts apps/agent-worker/src/phases/buildObjectNativePath.test.ts
git rm apps/agent-worker/src/phases/buildReferenceDrivenFallback.ts
git rm apps/agent-worker/src/phases/projectTemplateGraph.ts apps/agent-worker/src/phases/projectTemplateGraph.test.ts
# 보류: buildAdaptiveCompositionDecision.ts (source) — test 는 self-contained 이므로 함께 보존
git rm apps/agent-worker/src/phases/emitAdaptiveCompositionMutations.ts apps/agent-worker/src/phases/emitAdaptiveCompositionMutations.test.ts
git rm apps/agent-worker/src/phases/buildSearchProfile.ts apps/agent-worker/src/phases/buildSearchProfile.test.ts
git rm apps/agent-worker/src/phases/runRetrievalStage.ts
# 보류: assembleTemplateCandidates.ts (source) — test 는 §3 deps 깨지므로 삭제
git rm apps/agent-worker/src/phases/assembleTemplateCandidates.test.ts
# 보류: candidateSearchers.ts (test 없음)
git rm apps/agent-worker/src/phases/compositionEngine.ts apps/agent-worker/src/phases/compositionEngine.test.ts
git rm apps/agent-worker/src/phases/compositionEngine.familyCatalog.ts
git rm apps/agent-worker/src/phases/compositionEngine.project.ts
git rm apps/agent-worker/src/phases/compositionEngine.rank.ts
git rm apps/agent-worker/src/phases/buildAssetPlan.ts apps/agent-worker/src/phases/buildAssetPlan.test.ts
git rm apps/agent-worker/src/phases/buildConcreteLayoutPlan.ts apps/agent-worker/src/phases/buildConcreteLayoutPlan.test.ts
git rm apps/agent-worker/src/phases/selectTypography.ts
git rm apps/agent-worker/src/phases/buildExecutablePlan.ts
git rm apps/agent-worker/src/phases/templatePriorVectorRecall.ts
# 보류: layoutCandidateSet.ts (test 없음)
git rm apps/agent-worker/src/phases/abstractLayoutPlanService.ts
git rm apps/agent-worker/src/phases/copyPlanService.ts
git rm apps/agent-worker/src/phases/copyAbstractLayoutPlanningShared.ts

# phases/ — legacy rule judge / refinement chain
git rm apps/agent-worker/src/phases/ruleJudge.ts apps/agent-worker/src/phases/ruleJudge.test.ts
git rm apps/agent-worker/src/phases/ruleJudgeDomainAnalysis.ts
git rm apps/agent-worker/src/phases/ruleJudgeIssueCollector.ts
git rm apps/agent-worker/src/phases/ruleJudgeIssueDefinitions.ts
git rm apps/agent-worker/src/phases/ruleJudgePolicyDetectors.ts
git rm apps/agent-worker/src/phases/ruleJudgeSelectionContext.ts
git rm apps/agent-worker/src/phases/ruleJudgeSemanticMismatchDetectors.ts
git rm apps/agent-worker/src/phases/ruleJudgeStructuralDetectors.ts
git rm apps/agent-worker/src/phases/buildExecutionSceneSummary.ts apps/agent-worker/src/phases/buildExecutionSceneSummary.test.ts
git rm apps/agent-worker/src/phases/buildJudgePlan.ts apps/agent-worker/src/phases/buildJudgePlan.test.ts
git rm apps/agent-worker/src/phases/buildRefineDecision.ts apps/agent-worker/src/phases/buildRefineDecision.test.ts
git rm apps/agent-worker/src/phases/emitRefinementMutations.ts apps/agent-worker/src/phases/emitRefinementMutations.test.ts
```

(실제 `.test.ts` 존재 여부는 `git ls-files` 로 단계 0 에서 사전 확인. 보류 4건은 §3.3 의 PR 4.5 / PR 6 로 미룸.)

### 단계 2 — package.json 테스트 목록 정리

`apps/agent-worker/package.json` 의 `test` script 가 삭제된 `.test.ts` 의 dist 경로를 enumeration 하고 있다. 사라진 파일 항목을 동시에 제거한다. 이 단계는 build 가 통과해도 test 실행이 깨지므로 필수.

```bash
# package.json 의 test script 안에 dist/phases/buildXXX.test.js 등 사라진 항목이 있는지 확인 후 수동 제거
rg -n "dist/(graph|phases)/(build|refinement|ruleJudge|emitRefinement|emitAdaptive|projectTemplateGraph|assembleTemplateCandidates|compositionEngine|selectTypography|buildExecutablePlan|templatePriorVectorRecall|layoutCandidateSet|abstractLayoutPlanService|copyPlanService|copyAbstractLayoutPlanningShared|buildExecutionSceneSummary|buildJudgePlan|buildRefineDecision)" \
  apps/agent-worker/package.json
```

### 단계 3 — testFixtures 의 legacy 잔존물 검토

`apps/agent-worker/src/testFixtures/processRunJobFixtures.ts` 는 PR 1 baseline 으로 `assertLegacyBuildAndRefinementNodesWereBypassed` + `LEGACY_BUILD_OR_REFINEMENT_*_KEYS` 상수 군을 보유한다. **이 fixture 들은 보존**한다 — `processRunJob.test.ts` 의 회귀 가드.

(`tooldiTaxonomyFixtures.ts:30 legacyGraphicOptionalAssetPolicy` 은 별도의 의미. 점검만 하고 PR 4 에선 손대지 않음.)

### 단계 4 — types.ts / runJobGraphState.ts / packages 손대지 않기 확인

- `apps/agent-worker/src/types.ts` 의 `TemplateRecallSource`, `legacyAliases` 필드 등은 mixed 영역 — PR 5a 까지 보존.
- `runJobGraphState.ts` 의 legacy 필드 역시 PR 5a 영역.
- `packages/contracts/**` 손대지 않음 (PR 5c).
- `packages/tool-adapters/**` 손대지 않음 (PR 6).

### 단계 5 — 검증

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime

pnpm -r --if-present typecheck
pnpm build
pnpm -F @tooldi/agent-api test
pnpm -F @tooldi/agent-worker test
pnpm smoke:object-native
```

모두 PASS 여야 한다. typecheck 가 fail 하면 → mixed 영역 의존이 남아있다는 뜻이므로 **PR 4 범위를 넘는 수정은 하지 말고**, 어떤 mixed 파일이 legacy 모듈을 참조하는지 핸드오프 노트로 남기고 사용자에게 확인 후 PR 5a 로 미룬다.

### 단계 6 — 커밋

`agent-workflow-test` 워크스페이스 루트에서:

```bash
git diff --check
git status --short
```

명시적 사용자 요청 시에만 커밋 (`feedback_no_auto_commit`).

커밋 메시지 형식 (`feedback_commit_format`): `[refactor]` 접두어 + 한국어. Co-Authored-By 절대 금지.

예시:

```
[refactor] agent runtime PR4: legacy phase 파일 일괄 삭제

PR 3 으로 graph topology 가 v6-only 가 된 후 import 0건이 된
legacy build/adaptive/object-native chain 과 rule judge/refinement chain
관련 phase 파일들을 일괄 삭제. test-only artifact 동반 삭제.

mixed 영역 (emitSkeletonMutations, layerCommandBuilder, types,
runJobGraphState 의 legacy field, contracts) 은 손대지 않음 — PR 5a~c.
worker DI / tool-adapters / tool-registry 도 보존 — PR 6.

검증: typecheck/build/api/worker/smoke:object-native 모두 PASS.
```

## 7. 회귀 위험 / 주의

1. **package.json test script** — 삭제된 `.test.ts` 의 dist 경로가 그대로 남으면 `pnpm -F @tooldi/agent-worker test` 가 missing-file 로 fail. 단계 2 누락 금지.
2. **PR 5a 의 mixed 파일이 legacy import 를 보유한 경우** — typecheck fail 로 surface. 이 경우 PR 4 에서 mixed 파일을 수정하지 말고 PR 5a 로 미룬다 ("PR 4 는 deletion only" 범위 보존).
3. **fixture 보존 (단계 3)** — `processRunJobFixtures.ts` 의 `LEGACY_BUILD_OR_REFINEMENT_*` 상수와 `assertLegacyBuildAndRefinementNodesWereBypassed` 함수는 v6 회귀 검출용. 절대 삭제 금지.
4. **worker.ts 인스턴스화** — `templateCopyPlanGenerator`, `templateAbstractLayoutGenerator`, `tooldiCatalogSourceClient` 등 dependency 가 dead 상태로 남는다. PR 4 에서는 그대로 두고 PR 6 sweep 영역.
5. **`runJobGraphState.ts` legacy 필드** — `copyPlanRef`, `assetPlanRef`, `concreteLayoutPlanRef`, `executionSceneSummary*`, `judgePlan*`, `refineDecision*`, `templatePriorBundleRef`, `sceneStylePlanRef`, `sceneBindingPlanRef` 등은 보존. PR 5a 가 정리.
6. **historical PoC/bench 파일 제외** — `bench/method-compare-phase1/**`, `v6-poc/trend-ab/**`, `poc/interview/**` 는 PR 7 영역. PR 4 에서 손대지 않음.
7. **rule_judge_refused finalize 경로** — `finalizeNodes.ts:205` 의 `code: "rule_judge_refused"` 는 단순 string code 로 남아 있어도 무방 (legacy 노드 이름 참조 아님). PR 5a 에서 정리 여부 판단.
8. **운영 alert / dashboard 영향** — 없음. 토폴로지 변경은 PR 3 에서 이미 적용됨. PR 4 는 unreachable 코드 삭제일 뿐.

## 8. 수용 기준

- 단계 0 의 import 검색에서 production 측 hits 0건 (test-only hits 는 동반 삭제 후 0건).
- §3 의 모든 파일 (존재하는 한) 삭제 + 동반 `.test.ts` 삭제.
- `pnpm -r --if-present typecheck` PASS
- `pnpm build` PASS
- `pnpm -F @tooldi/agent-api test` PASS
- `pnpm -F @tooldi/agent-worker test` PASS — 삭제된 테스트가 enumeration 에서 제거됨
- `pnpm smoke:object-native` PASS — v6 createLayer 3건 + finalize completed
- `git diff --check` clean
- 수정 범위가 §3 의 deletion + package.json test list 정리로 한정. mixed 파일/state field/contracts/packages/worker.ts 는 손대지 않음.

## 9. 메모리 / lock 결정 요약

- 커밋: 사용자 명시 요청 시에만 (`feedback_no_auto_commit`)
- 메시지: `[refactor]` 접두어 + 한국어, Co-Authored-By 절대 금지 (`feedback_commit_format`)
- 작업 디렉터리: pnpm workspace (`agent-workflow-test/tooldi-agent-runtime` 한정 pnpm)
- Plan 모드 호출 금지, 단 구현 진입 전 내부 plan (읽을 파일/순서/검증/롤백) 은 항상 선수립 (`feedback_implicit_planning`)
- 조사·리서치는 Agent 로 위임 가능 (`feedback_delegate_research`)

## 10. 참조

### 정규 문서

- `/home/ubuntu/github/tooldi/tws-editor-api/AGENTS.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/AGENTS.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/CLAUDE.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md`

### Dead-code 조사 baseline

- `/home/ubuntu/github/tooldi/tws-editor-api/docs/dead-code-investigate/MERGED-FINAL.md`
  - Liveness baseline: lines 38–75
  - Phase 0 baseline lock: lines 194–228
  - Phase 1 safe leaf cleanup list: lines 229–264 (PR 2 처리됨)
  - Phase 2 graph topology prune: lines 266–291 (PR 3 처리됨)
  - **Phase 3 legacy phase files (PR 4 본문)**: lines 293–345
  - Phase 4 post-legacy import sweep checkpoint: lines 347~ (PR 5a 진입 전 점검)
  - Phase 5a runtime mixed cleanup, Phase 5b planner cleanup, Phase 5c public contract cleanup
  - Phase 6 transitive package sweep
  - Phase 7 docs/PoC/bench drift sync
  - Critical corrections: lines 160–192 (특히 `runJobGraphState.plan` 가 live 임)

### 직전 PR 핸드오프

- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-28-agent-workflow-pr1-baseline-lock-evidence.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-28-agent-workflow-pr3-graph-topology-prune-handoff.md`

### 작업기록 (llm-store vault)

- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-dead-code-investigation.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-runtime-postgres-drizzle-foundation.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr1-baseline-lock.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr2-safe-leaf-cleanup.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr3-graph-topology-prune.md`

### 직전 커밋 (HEAD 부터 4개)

```
9f42bac [refactor] agent runtime PR3: 그래프 토폴로지 v6-only 정리
558d6e1 [refactor] agent runtime PR2: zero-ref 안전 leaf 정리
43d88c6 [chore] 과도하게 긴 테스트 파일 정리리
52b45f4 [refactor] agent runtime PostgreSQL persistence foundation
```

### 알려진 blocker (PR 4 영향 없음)

- `pnpm local:toolditor:eval:object-native:real` 이 stale `object-native-reference-audit.json` 을 기대해 fail. PR 1 evidence 노트 참조.

## 11. 다음 스레드 시작 프롬프트

> Implement PR 4 legacy phase file deletion for `agent-workflow-test/tooldi-agent-runtime`.
>
> Read `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-28-agent-workflow-pr4-legacy-phase-deletion-handoff.md` first. It contains the locked deletion list, file-level steps, validation, acceptance criteria, and references.
>
> Repo root: `/home/ubuntu/github/tooldi/tws-editor-api`. Runtime workdir: `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime`.
>
> PR 0/1/2/3 are committed (`52b45f4`, `43d88c6`, `558d6e1`, `9f42bac`). Start from a clean tree.
>
> Stay strictly within PR 4 scope: delete legacy phase files + their test-only artifacts + update `apps/agent-worker/package.json` test enumeration. **Defer §3.3 carve-out (`buildAdaptiveCompositionDecision.ts`, `assembleTemplateCandidates.ts`, `candidateSearchers.ts`, `layoutCandidateSet.ts`) — they stay alive (PR 4.5 / PR 6).** Do not touch mixed files (PR 5a), state fields (PR 5a), planner DI (PR 5b), public contracts (PR 5c), packages (PR 6), `nodeUtils.ts` (PR 4.5), or worker.ts dependency instantiation (PR 6). Do not commit unless I ask.
