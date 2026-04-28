# Agent Workflow Legacy Cleanup PR 3: Graph Topology Prune — 다음 스레드 핸드오프

생성일: 2026-04-28
선행: PR 0 (PostgreSQL/Drizzle persistence) → PR 1 (Baseline Lock) → PR 2 (Safe Leaf Cleanup, commit `558d6e1`)

## 1. 작업 목표

`agent-workflow-test/tooldi-agent-runtime` 의 LangGraph 토폴로지에서 v6 freeform pipeline 외의 모든 legacy 경로를 제거한다.

PR 3 는 **그래프 토폴로지/라우팅** 만 변경한다:

- legacy build/refinement 엣지 제거
- legacy 노드 등록 (`registerBuildNodes`, `registerRefinementNodes`) 제거
- `rule_judge` 분기 제거
- `routeAfterBuildObjectNativePath` 제거
- v6 단일 경로로 `prepare_execution` / `advance_after_ack` 단순화
- 토폴로지 가드 테스트 추가

PR 3 는 **legacy phase 파일 자체 삭제는 하지 않는다.** 그것은 PR 4 의 일이다.

## 2. 전체 PR 시리즈

source: `/home/ubuntu/github/tooldi/tws-editor-api/docs/dead-code-investigate/MERGED-FINAL.md`

| PR | 단계 | 상태 |
|---|---|---|
| PR 0 | PostgreSQL/Drizzle persistence foundation | DONE — `52b45f4` |
| PR 1 | Baseline Lock — v6 reachability/legacy non-reachability 테스트와 evidence 잠금 | DONE — `43d88c6` |
| PR 2 | Safe Leaf Cleanup — zero-ref leaf 7개 제거 | DONE — `558d6e1` |
| **PR 3** | **Graph Topology Prune — legacy 엣지/노드 등록/라우팅 제거 + v6 only 단순화** | **현재 작업** |
| PR 4 | Legacy Phase File Deletion — PR 3 으로 unreachable 해진 파일 삭제 | 미시작 |
| PR 5a | Runtime Mixed Cleanup — 살아있는 mixed 파일의 legacy 분기/타입/state 정리 (`state.plan` 유지) | 미시작 |
| PR 5b | Planner Cleanup — `TEMPLATE_PLANNER_MODE` / `TemplatePlanner` / LangChain planner mode 제거 | 미시작 |
| PR 5c | Public Contract Cleanup — required `workflowVariant`, full save receipt finalize input, no `tool.result` | 미시작 |
| PR 6 | Transitive Package Sweep — 사용처 사라진 패키지/DI/imports 제거 | 미시작 |
| PR 7 | Docs and Preserved Evidence — v6-only runtime 문서 갱신 + preserved PoC/bench/docs 표시 | 미시작 |

## 3. PR 3 범위 — 무엇을 제거하고 무엇을 유지하는가

### 3.1 제거 대상

#### `apps/agent-worker/src/graph/runJobGraphEdges.ts`

다음 legacy build chain edges 전체 제거:

```
build_template_prior_summary -> build_template_prior_bundle
build_template_prior_bundle -> build_scene_plans
build_scene_plans -> build_copy_and_abstract_layout_plan
build_copy_and_abstract_layout_plan -> build_object_native_path
addConditionalEdges("build_object_native_path", routeAfterBuildObjectNativePath)
build_search_profile -> compute_retrieval_policy
compute_retrieval_policy -> assemble_candidates
addConditionalEdges("assemble_candidates", state.finalizeDraft → send_finalize : select_composition)
select_composition -> build_asset_plan
build_asset_plan -> build_concrete_layout_plan
build_concrete_layout_plan -> select_typography
select_typography -> persist_selection_artifacts
persist_selection_artifacts -> build_plan
build_plan -> rule_judge
addConditionalEdges("rule_judge", verdict.recommendation === "refuse" → prepare_finalize : prepare_execution)
```

다음 legacy refinement subgraph edges 전체 제거:

```
build_execution_scene_summary -> build_judge_plan
build_judge_plan -> decide_refine
addConditionalEdges("decide_refine", refineDecision.decision === "patch" ...)
addConditionalEdges("emit_refinement_patch", currentMutationId → await_refinement_ack : prepare_finalize)
await_refinement_ack -> build_execution_scene_summary
```

`routeAfterBuildObjectNativePath` 함수 자체 제거 (export + body).

#### `apps/agent-worker/src/graph/runJobGraphNodes.ts`

```
import { registerBuildNodes } from "./buildNodes.js";        // 제거
import { registerRefinementNodes } from "./refinementNodes.js";  // 제거
...
registerBuildNodes(graph, dependencies, tasks, tooldiCatalogSourceClient);   // 제거
registerRefinementNodes(graph, dependencies, tasks);                          // 제거
```

이때 `dependencies`, `tasks`, `tooldiCatalogSourceClient` 시그니처는 일단 유지한다 — state/type/mixed 정리는 PR 5a, planner 정리는 PR 5b, DI/package sweep 은 PR 6 에서 처리한다. PR 3 단계에서 시그니처까지 줄이면 worker.ts/runJobGraph.ts/processRunJob.ts 까지 연쇄 변경이 발생해 토폴로지 PR 의 책임 범위를 넘는다.

#### `apps/agent-worker/src/graph/runJobGraphEdges.test.ts`

`routeAfterBuildObjectNativePath` 만 테스트하던 기존 항목은 삭제한다 (대상 함수가 사라지므로).

### 3.2 단순화 대상

#### `prepare_execution` 분기 (현재)

```ts
addConditionalEdges("prepare_execution", (state) =>
  state.finalizeDraft
    ? "send_finalize"
    : state.currentProposal
      ? "emit_stage"
      : "build_execution_scene_summary",
)
```

PR 3 후 (v6 path 만 남음):

```ts
addConditionalEdges("prepare_execution", (state) =>
  state.finalizeDraft
    ? "send_finalize"
    : "emit_stage",
)
```

근거: v6 pipeline 후 `prepare_execution` 진입 시 `currentProposal` 은 항상 채워져 있다 (executionNodes 의 v6PipelineResult-driven proposal materialization). `build_execution_scene_summary` fallback 이 없으면 `currentProposal` 부재는 즉시 finalize 실패 이벤트로 surface 시키거나 (예: emit empty mutation envelope 후 finalize), `prepare_execution` 본체에서 invariant assertion 으로 처리한다. 어떤 선택을 하든 테스트로 닫아야 한다 (§5.3 참조).

⚠️ 시작 전에 `executionNodes.ts` 의 `prepare_execution` / `emit_stage` 구현이 v6PipelineResult 부재 시 어떻게 동작하는지 한 번 확인. v6 가 정상 emit 한 경우 `currentProposal` 이 항상 truthy 인지 invariant 로 단정할 수 있는지 검증한 뒤 단순화한다.

#### `emit_stage` 분기 (현재)

```ts
addConditionalEdges("emit_stage", (state) =>
  state.currentMutationId ? "await_stage_ack" : "build_execution_scene_summary",
)
```

PR 3 후:

```ts
addConditionalEdges("emit_stage", (state) =>
  state.currentMutationId ? "await_stage_ack" : "prepare_finalize",
)
```

근거: `build_execution_scene_summary` 가 사라지므로 mutation 이 emit 되지 못한 케이스는 finalize 로 직행 (현재 v6 short-circuit 의 `prepare_finalize` 결과와 동일).

#### `advance_after_ack` 분기 (현재)

```ts
addConditionalEdges("advance_after_ack", (state) => {
  const inV6Pipeline = Boolean(state.v6PipelineResult);
  if (state.lastMutationAck?.status !== "acked" || state.cooperativeStopRequested) {
    return inV6Pipeline ? "prepare_finalize" : "build_execution_scene_summary";
  }
  if (state.currentProposal) return "emit_stage";
  return inV6Pipeline ? "emit_save_stage" : "build_execution_scene_summary";
})
```

PR 3 후 (v6 only):

```ts
addConditionalEdges("advance_after_ack", (state) => {
  if (state.lastMutationAck?.status !== "acked" || state.cooperativeStopRequested) {
    return "prepare_finalize";
  }
  if (state.currentProposal) return "emit_stage";
  return "emit_save_stage";
})
```

`inV6Pipeline` ternary 가 collapse. `state.v6PipelineResult` reference 자체는 PR 3 에서 삭제하지 않는다 (state field 제거는 PR 5a 의 runtime mixed cleanup 영역).

#### `emit_save_stage` 분기 (현재)

```ts
addConditionalEdges("emit_save_stage", (state) =>
  state.currentMutationId ? "await_save_ack" : "prepare_finalize",
)
```

이것은 그대로 유지. v6 path 가 그대로 사용 중.

### 3.3 제거 후 살아남는 그래프

```
START
  -> hydrate_input
  -> plan_intent_draft
  -> normalize_intent
       -> [interview_user → gate_scope]
       -> [gate_scope]
  -> gate_scope
       -> send_finalize (refuse)
       -> maybe_research_visual_trends
  -> v6_freeform_layout_pipeline
  -> prepare_execution
       -> send_finalize (finalizeDraft 있을 때)
       -> emit_stage
  -> emit_stage
       -> await_stage_ack (mutationId 있을 때)
       -> prepare_finalize (없을 때)
  -> await_stage_ack
  -> advance_after_ack
       -> prepare_finalize (ack !acked OR stop)
       -> emit_stage (currentProposal 남음)
       -> emit_save_stage (정상 진행)
  -> emit_save_stage
       -> await_save_ack (mutationId 있을 때)
       -> prepare_finalize (없을 때)
  -> await_save_ack
  -> prepare_finalize
  -> send_finalize
END
```

### 3.4 절대 건드리지 않는 것

- v6 pipeline phase 파일 (`phases/v6*.ts`) 본체
- `executionNodes.ts`, `finalizeNodes.ts`, `interviewNode.ts`, `v6PipelineNode.ts`, `v6TrendResearchNode.ts`, `planningNodes.ts` 의 본체 로직 (분기 단순화는 edges 파일에서만)
- `runJobGraphState.ts` 의 state 필드 (legacy field 제거는 PR 5a 영역)
- `worker.ts` 의 dependencies 와 `tooldiCatalogSourceClient` 인스턴스화 (planner 는 PR 5b, DI/package sweep 은 PR 6)
- `processRunJob.ts` (PR 1 에서 의도적으로 다이어트됨, 복원 금지)
- legacy phase 파일들 자체 (`buildNodes.ts`, `refinementNodes.ts`, `phases/build*.ts`, `phases/ruleJudge*.ts`, `phases/compositionEngine*.ts` 등) — PR 4 영역
- API/contracts/persistence — PR 0 에서 안정화됨, 토폴로지 변경과 무관
- `0001_agent_runtime_init.sql` — PR 0 에서 닫힘

## 4. 시작 전 점검

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test
git status --short
git log --oneline -5
```

다음 커밋이 HEAD 또는 직전에 있어야 한다:

```
558d6e1 [refactor] agent runtime PR2: zero-ref 안전 leaf 정리
43d88c6 [chore] 과도하게 긴 테스트 파일 정리리
52b45f4 [refactor] agent runtime PostgreSQL persistence foundation
```

PR 3 작업은 깨끗한 working tree 에서 시작.

`AGENTS.md` 와 `tooldi-agent-workflow-v6-layout-freedom-ssot.md` 를 먼저 읽고 진입한다 (CLAUDE.md bootstrap 참조).

## 5. 상세 구현 단계

### 단계 0 — 사전 검증 (read-only)

다음을 모두 확인하고 메모해 둔다:

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime

# 5.0.1 — 현재 v6 happy path 가 통과 중인지 baseline 재확인
pnpm -F @tooldi/agent-worker test
pnpm smoke:object-native

# 5.0.2 — 제거 대상 노드명이 코드 외 다른 곳 (테스트 fixture, snapshot, doc) 에서 인용되는지
rg -n "build_template_prior_summary|build_template_prior_bundle|build_scene_plans|build_copy_and_abstract_layout_plan|build_object_native_path|build_search_profile|compute_retrieval_policy|assemble_candidates|select_composition|build_asset_plan|build_concrete_layout_plan|select_typography|persist_selection_artifacts|build_plan|rule_judge|build_execution_scene_summary|build_judge_plan|decide_refine|emit_refinement_patch|await_refinement_ack" \
  --glob '!dist/**' --glob '!node_modules/**' apps packages

# 5.0.3 — registerBuildNodes / registerRefinementNodes / routeAfterBuildObjectNativePath 사용처
rg -n "registerBuildNodes|registerRefinementNodes|routeAfterBuildObjectNativePath" \
  --glob '!dist/**' --glob '!node_modules/**' apps packages

# 5.0.4 — currentProposal 가 v6 path 에서 항상 채워지는지 executionNodes.ts 본체 검토
rg -n "currentProposal|prepare_execution|emit_stage" apps/agent-worker/src/graph/executionNodes.ts
```

### 단계 1 — `runJobGraphEdges.ts` 수정

1. legacy build chain `addEdge`/`addConditionalEdges` 호출 모두 제거.
2. legacy refinement chain `addEdge`/`addConditionalEdges` 호출 모두 제거.
3. `routeAfterBuildObjectNativePath` export 와 함수 본체 모두 제거.
4. `prepare_execution`, `emit_stage`, `advance_after_ack` 분기를 §3.2 처럼 v6-only 로 단순화.
5. `state` 매개변수의 `as any` 캐스팅은 그대로 둔다 (필요 시 PR 6 에서 타입 강화).

### 단계 2 — `runJobGraphNodes.ts` 수정

1. `registerBuildNodes`, `registerRefinementNodes` import 제거.
2. 본체에서 두 호출 제거.
3. 함수 시그니처 (dependencies, tasks, tooldiCatalogSourceClient 매개변수) 는 유지. 미사용 매개변수가 생기면 일단 underscore prefix 또는 ts-expect-error 없이 그대로 두고 PR 6 에서 sweep.
   - 단, ESLint/tsc 에서 unused parameter warning 이 error 로 막힌다면 매개변수 자체를 제거하되, **호출처 (worker.ts) 의 인자도 같이 정리**해야 한다. 가능하면 매개변수 유지가 깔끔.

### 단계 3 — `runJobGraphEdges.test.ts` 정리

- `routeAfterBuildObjectNativePath` 만 테스트하던 두 케이스 삭제. 파일이 비게 되면 파일 자체 삭제.
- 새 토폴로지 가드 테스트는 별도 파일 (단계 5) 로 추가하는 편이 깔끔.

### 단계 4 — 컴파일 확인

```bash
pnpm -r --if-present typecheck
pnpm build
```

이 시점에서 `buildNodes.ts`, `refinementNodes.ts` 는 import 0건 상태가 된다 (= PR 4 후보로 자연스럽게 떠오름). 그러나 PR 3 에서는 파일을 삭제하지 않는다.

### 단계 5 — 가드 테스트 추가

세 종류 모두 필요. 위치는 `apps/agent-worker/src/graph/`.

#### 5.1 그래프 컴파일 테스트

```ts
// runJobGraph.compile.test.ts (신규)
test("runJobGraph compiles with v6-only topology", () => {
  // buildWorkerRuntime 또는 동일한 build 헬퍼 사용
  // 등록된 노드 set 에 build_*, rule_judge, *_judge_plan, decide_refine,
  // emit_refinement_patch, await_refinement_ack, build_execution_scene_summary 가
  // 포함되지 **않는다** 를 단정.
});
```

PR 1 의 baseline 테스트 패턴을 참고. PR 1 에서 `legacy nodes not reached` assertion 이 이미 도입되었으므로 **새 테스트는 "compile 단계에서 노드 자체가 등록조차 되지 않는다"** 를 단정해 한 단계 더 강하게 잠근다.

PR 1 evidence 노트:
`/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr1-baseline-lock-evidence.md`

#### 5.2 v6 happy path 테스트 — create-layer + save mutation

object-native happy path 가 여전히 다음을 emit 하는지 단정:

- v6 pipeline 직후 `emit_stage` 가 createLayer 를 포함한 mutation envelope emit
- `emit_save_stage` 가 save mutation emit
- `prepare_finalize → send_finalize` 도달

가능하면 기존 `pnpm smoke:object-native` 의 핵심 단정 (3 createLayer + finalize completed) 을 unit/integration 레벨로 압축한 새 테스트 추가. 또는 smoke 의 emit 카운트 단정을 강화.

#### 5.3 `prepare_execution` invariant 테스트

§3.2 단순화로 `currentProposal` 부재 fallback 이 사라졌으므로:

- v6PipelineResult 정상 + currentProposal 정상 → `emit_stage` 로 라우팅
- finalizeDraft 있음 → `send_finalize` 로 라우팅
- (선택) currentProposal 부재 케이스가 어떻게 처리되는지 명시. 해당 케이스가 v6 정상 path 에서 발생할 수 없다면 그 invariant 를 코멘트 1줄로 남기거나 `executionNodes.ts` 의 `prepare_execution` 본체에서 throw 하도록 한 뒤 그 throw 를 테스트.

### 단계 6 — 검증

`tooldi-agent-runtime` 디렉토리에서:

```bash
pnpm -r --if-present typecheck
pnpm build
pnpm -F @tooldi/agent-api test
pnpm -F @tooldi/agent-worker test
pnpm smoke:object-native
```

선택: real eval (PR 1 알려진 blocker — `object-native-reference-audit.json` stale expectation — 가 그대로면 그 사유로 fail 를 보고만 하고 PR 3 와 무관하게 처리):

```bash
pnpm local:toolditor:eval:object-native:real
```

### 단계 7 — 커밋

`agent-workflow-test` 워크스페이스 루트에서:

```bash
git diff --check
git status --short
```

명시적 사용자 요청 시에만 커밋 (`feedback_no_auto_commit`).

커밋 메시지 형식 (`feedback_commit_format`): `[refactor]` 접두어 + 한국어. Co-Authored-By 절대 금지. 예시:

```
[refactor] agent runtime PR3: 그래프 토폴로지 v6-only 정리

legacy build chain (build_template_prior_summary -> ... -> rule_judge),
refinement subgraph (build_execution_scene_summary -> ... -> await_refinement_ack),
registerBuildNodes/registerRefinementNodes, routeAfterBuildObjectNativePath 제거.

prepare_execution / advance_after_ack / emit_stage 분기를 v6-only 단순화.

토폴로지 가드 테스트:
- runJobGraph 가 v6-only 노드 set 으로 compile
- v6 happy path 가 createLayer + save mutation + finalize 도달
- prepare_execution invariant

검증: typecheck/build/api 31/worker 테스트/smoke:object-native 모두 PASS.
```

## 6. 회귀 위험 / 주의

1. **`currentProposal` 가 v6 path 에서 항상 채워지는가?** §3.2 의 `prepare_execution` 단순화 전에 반드시 `executionNodes.ts` 본체와 v6PipelineNode 의 emit 시점을 확인. 만약 일부 분기에서 비어 있을 수 있다면 fallback 을 finalize 로 보내거나 invariant 로 처리하고 테스트로 닫아야 한다.
2. **`state.v6PipelineResult` reference 보존.** `advance_after_ack` 의 v6 ternary 만 collapse 하고, state 필드 자체는 남겨둔다. 다른 노드 (예: `executionNodes`, `finalizeNodes`) 가 이 필드를 read 할 수 있음.
3. **`legacy nodes not reached` 테스트 (PR 1 도입).** PR 3 후에도 그대로 통과해야 한다. 노드 자체가 등록되지 않으므로 `not reached` 가 자명해진다 — 그래도 baseline 보존 차원에서 삭제 금지.
4. **PR 1 의 `processRunJob.test.ts` 다이어트 보존.** "diff 가 커 보인다" 는 이유로 복원 금지.
5. **legacy phase 파일은 그대로 둔다.** PR 3 후 import 0건이 되어 lint warning 이 떠도 무시. PR 4 에서 한 번에 정리.
6. **`runJobGraphState.ts` 필드.** 사라진 노드들이 read 하던 state 필드는 그대로 둔다. PR 5a 의 runtime mixed/state cleanup 에서 일괄 처리한다. 단 `state.plan` 은 live 필드이므로 제거 금지.
7. **`worker.ts` 의 `templateCopyPlanGenerator` / `templateAbstractLayoutGenerator` 인스턴스화.** PR 3 후 dead 가 되더라도 그대로 둔다. planner mode/runtime injection 제거는 PR 5b, 남은 DI/package sweep 은 PR 6 영역이다.
8. **catalog client 들 (`tooldiCatalogSourceClient`, `templateCatalogClient`).** PR 3 후 사용처가 사라지더라도 dependency 시그니처는 유지한다. 실제 제거는 PR 6 import sweep 뒤에 한다.
9. **Public contract 변경 금지.** `workflowVariant` required, finalize `latestSaveReceiptId` input compat 제거, `tool.result` branch 제거는 PR 5c 에서 Toolditor mirror/request builder 와 함께 처리한다. PR 3 에 섞지 않는다.
10. **테스트가 그래프 노드 이름을 string 으로 가지고 있을 수 있다.** §5.0.2 grep 으로 확인. 발견 시 해당 테스트가 살아있는 의미가 있는지 점검 후 제거 또는 이름 교체.

## 7. 수용 기준

- 그래프 컴파일 후 노드 set 에 legacy 이름이 0건.
- `pnpm smoke:object-native` 가 v6 freeform pipeline 으로 createLayer 3건 + finalize completed.
- `pnpm -F @tooldi/agent-api test` 와 `pnpm -F @tooldi/agent-worker test` 모두 PASS.
- `pnpm -r --if-present typecheck`, `pnpm build` PASS.
- `git diff --check` clean.
- 수정 범위가 §3 의 "edges/nodes 등록/라우팅 단순화" 와 그 가드 테스트로 한정. legacy phase 파일/패키지/state field 는 손대지 않음.
- 테스트가 v6 happy path 와 토폴로지 invariant 를 닫음.

## 8. 참조

### 정규 문서

- `/home/ubuntu/github/tooldi/tws-editor-api/AGENTS.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/AGENTS.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/CLAUDE.md`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md`

### Dead-code 조사 baseline

- `/home/ubuntu/github/tooldi/tws-editor-api/docs/dead-code-investigate/MERGED-FINAL.md`
  - Liveness baseline: lines 38–75
  - Phase 0 baseline lock: lines 194–228
  - Phase 1 safe leaf cleanup list: lines 229–264 (PR 2 에서 처리됨)
  - **Phase 2 graph topology prune (PR 3 본문)**: lines 266–291
  - Phase 3 legacy phase files (PR 4): lines 293–345
  - Phase 4 post-legacy import sweep checkpoint: classify remaining mixed files after PR 4
  - Phase 5a runtime mixed cleanup: `emitSkeletonMutations`, `layerCommandBuilder`, live state/type cleanup
  - Phase 5b planner cleanup: `TEMPLATE_PLANNER_MODE`, `TemplatePlanner`, LangChain planner mode removal
  - Phase 5c public contract cleanup: required `workflowVariant`, full save receipt finalize input, no `tool.result`
  - Phase 6 transitive package sweep
  - Critical corrections: lines 160–192 (특히 `runJobGraphState.plan` 가 live 임)

### PR 1 evidence

- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr1-baseline-lock-evidence.md`

### 작업기록 (llm-store vault)

- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-dead-code-investigation.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-runtime-postgres-drizzle-foundation.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr1-baseline-lock.md`
- `/mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-28-agent-workflow-pr2-safe-leaf-cleanup.md`

### 직전 커밋

```
558d6e1 [refactor] agent runtime PR2: zero-ref 안전 leaf 정리
43d88c6 [chore] 과도하게 긴 테스트 파일 정리리
52b45f4 [refactor] agent runtime PostgreSQL persistence foundation
```

### 알려진 blocker (PR 3 영향 없음, 해결 시점 미정)

- `pnpm local:toolditor:eval:object-native:real` 이 stale `object-native-reference-audit.json` 을 기대하고 fail. PR 1 evidence 노트에 기록됨. PR 3 합격 기준에서 제외.

## 9. 메모리/lock 결정 요약

- 커밋: 사용자 명시 요청 시에만 (`feedback_no_auto_commit`)
- 메시지: `[refactor]` 접두어 + 한국어, Co-Authored-By 절대 금지 (`feedback_commit_format`)
- toolditor 리포는 `npm` 사용 — 그러나 **agent-workflow-test/tooldi-agent-runtime 은 pnpm workspace** 이므로 `pnpm` 으로만 실행 (이 리포 한정)
- Plan 모드 호출 금지, 단 구현 진입 전 내부 plan (읽을 파일/순서/검증/롤백) 은 항상 선수립 (`feedback_implicit_planning`)
- 조사·리서치는 가능하면 Agent 로 위임 (`feedback_delegate_research`)

## 10. 다음 스레드 시작 프롬프트 예시

> Implement PR 3 graph topology prune for `agent-workflow-test/tooldi-agent-runtime`.
>
> Read `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/archive/handoff/2026-04-28-agent-workflow-pr3-graph-topology-prune-handoff.md` first. It contains the locked scope, file-level steps, guard tests, acceptance criteria, and references.
>
> Repo root: `/home/ubuntu/github/tooldi/tws-editor-api`. Runtime workdir: `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime`.
>
> PR 0/1/2 are committed (`558d6e1`, `43d88c6`, `52b45f4`). Start from a clean tree.
>
> Stay strictly within PR 3 scope: edges + node registration + routing simplification + guard tests. Do not delete legacy phase files (PR 4), do not touch state fields or mixed runtime files (PR 5a), do not remove planner mode/contracts (PR 5b/5c), and do not sweep packages (PR 6). Do not commit unless I ask.
