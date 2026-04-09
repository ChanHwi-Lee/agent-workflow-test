# Tooldi Agent Workflow v1 Create Template Current State (AS-IS)

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Create Template Current State (AS-IS) |
| 문서 목적 | 2026-04-08 기준 `create_template` worker/runtime 구현이 실제로 어디까지 왔는지 current truth를 기록한다. |
| 상태 | Draft |
| 문서 유형 | AS-IS |
| 작성일 | 2026-04-09 |
| 기준 시스템 | `toolditor FE`, `Fastify Agent API`, `BullMQ Worker + LangGraph Runtime`, `LangChain JS planner`, `Google Gemini`, existing Tooldi PHP source APIs |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA, Reviewer |

## 1. 목적

- 이 문서는 현재 코드가 실제로 수행하는 `empty_canvas -> create_template` 흐름을 AS-IS 기준으로 정리한다.
- 이 문서는 normative TO-BE spec을 대체하지 않는다.
- 이 문서는 다음 질문에 답하기 위한 current-state 문서다.
  - 현재 natural language run이 어디까지 구현됐는가
  - 어떤 artifact와 terminal status가 실제로 남는가
  - 지금 가장 큰 품질 gap은 무엇인가

## 2. 배경

- 초기 bootstrap/happy-path prototype은 `spring representative slice` 와 `photo branch` 를 중심으로 real source evidence를 쌓는 단계였다.
- 현재 구현은 그 위에 generic `create_template` skeleton 을 추가했다.
- worker 내부 orchestration 은 `LangGraph` 로, planner/model abstraction 은 `LangChain JS` 로 정리됐다.
- local 기본 planner provider 는 `.env.local` 기준 `Google Gemini` 다.

## 3. 범위

### 3.1 In Scope

- empty canvas 에서 자연어로 배너 초안을 1개 생성하는 run
- `LangGraph` worker graph 기반 single-run orchestration
- planner 기반 `NormalizedIntent`
- `CopyPlan`, `AbstractLayoutPlan`, `AssetPlan`, `ConcreteLayoutPlan`
- `SearchProfile` 기반 source query plan
- candidate assemble / selection / typography selection
- `RuleJudgeVerdict`
- `ExecutionSceneSummary`, `JudgePlan`, `RefineDecision`
- canonical `executionSlotKey` based execution/scene identity for copy/photo/background
- staged mutation execution
- `completed`, `completed_with_warning`, `failed` terminal semantics

### 3.2 Out of Scope

- existing canvas edit/delete 사용자 표면
- semantic retrieval / vector DB
- vision model judge
- public multi-turn memory
- editor canonical picture seam 정렬
- actual editor save evidence 완전 연동

## 4. 액터 및 전제조건

| 액터 | 현재 역할 |
| --- | --- |
| 편집기 사용자 | 빈 캔버스에서 create-template run 시작 |
| `toolditor` FE | prompt 입력, SSE 구독, mutation apply, ack 제출 |
| Agent API | run bootstrap, SSE, mutation ack, finalize persistence |
| Worker Runtime | LangGraph graph 실행, planner/search/select/judge/plan 수행 |
| LangChain JS planner | provider abstraction 및 structured output |
| Google Gemini | 현재 local 기본 planner provider |
| Tooldi PHP API | background/graphic/photo/font real source query |

전제조건:

- current user-visible entrypoint 는 `empty_canvas -> create_template` only 다.
- local representative run은 `pnpm run local:toolditor:stack:real` 로 띄운다.
- real source mode 는 `localhost` host만 허용한다.

## 5. 현재 사용자 시나리오

### UC-01. empty canvas에서 마케팅 배너 초안 생성

1. 사용자가 편집기에서 자연어 prompt를 입력한다.
2. FE는 run 생성 요청을 backend로 보낸다.
3. backend는 BullMQ queue에 `RunJobEnvelope` 를 넣고 SSE stream을 연다.
4. worker는 LangGraph graph를 통해 `NormalizedIntent`, `CopyPlan`, `LayoutPlan`, `AssetPlan`, `SearchProfile`, candidate set, selection, judge, final plan을 만든다.
5. worker는 staged mutation을 FE에 제안하고 ack를 수집한다.
6. worker는 ack 결과로 `ExecutionSceneSummary -> JudgePlan -> RefineDecision` 을 만들고 필요 시 1회 patch-only refine mutation을 추가로 보낸다.
7. backend는 finalize를 materialize 하고 terminal outcome을 남긴다.

## 6. 현재 기능 요구사항 (AS-IS)

### 6.1 planner / intent

- 시스템은 현재 `heuristic` 또는 `langchain` planner mode를 지원한다.
- local 기준 현재 planner는 `langchain + google` 로 설정할 수 있고 실제로 동작한다.
- planner는 현재 최소 아래 값을 만든다.
  - `templateKind`
  - `domain`
  - `audience`
  - `campaignGoal`
  - `layoutIntent`
  - `tone`
  - `assetPolicy`
  - `searchKeywords`
  - `facets`
- planner 실패 시 heuristic fallback 으로 내려간다.

### 6.2 search profile / candidate assemble

- 시스템은 `SearchProfileArtifact` 를 실제로 만든다.
- `assemble_candidates` 단계는 이 search profile을 사용해 family별 query plan을 구성한다.
- current real source family는 아래를 쓴다.
  - `background`
  - `graphic`
  - `photo`
  - `font`
- picture/shape real source는 현재 `Editor::get_pictures/get_shapes` 가 아니라 direct `Picture::index` / `Shape::index` surface를 쓰며, `theme/owner/price/type/method` transport를 지원한다.
- `photo` 는 `wide_1200x628` representative preset에서만 execution-enabled path를 가진다.

### 6.3 selection / typography

- 시스템은 `candidate set -> selection decision` 구조를 artifact로 남긴다.
- 시스템은 typography selection을 별도 artifact로 남긴다.
- photo branch는 `photo_selected` 또는 `graphic_preferred` reasoning을 artifact와 `run.log`에 남긴다.

### 6.4 judge / terminal semantics

- 시스템은 `RuleJudgeVerdict` 를 실제로 생성한다.
- judge recommendation 은 현재 `keep`, `refine`, `refuse` 를 가진다.
- `refuse` 는 pre-execution failure 로 닫힌다.
- preflight `refine` 는 실행 이후 `ExecutionSceneSummary -> JudgePlan -> RefineDecision` 을 통해 **최대 1회 patch-only refine mutation** 으로 이어질 수 있다.
- patch scope 는 `copy text`, `slot anchor`, `cluster zone`, `spacing`, `cta container fallback` 으로 제한된다.
- `keep` 는 일반 `completed` 로 이어진다.
- emitted mutation, `ExecutionSceneSummary`, `JudgePlan`, `RefineDecision` 는 copy/photo/background slot에 대해 canonical `executionSlotKey` 를 truth로 사용한다.
- legacy `slotKey` 는 compat field로 유지되며, graphic identity는 계속 `role` 중심이다.
- `ConcreteLayoutPlan` 은 `resolvedSlotBounds` 를 가지며 copy/photo/background placement authority를 제공한다.

### 6.5 artifact chain

- 시스템은 현재 최소 아래 artifact를 남긴다.
  - `normalized-intent.json`
  - `copy-plan.json`
  - `layout-plan-abstract.json`
  - `asset-plan.json`
  - `layout-plan-concrete.json`
  - `search-profile.json`
  - `template-candidate-set.json`
  - `selection-decision.json`
  - `typography-decision.json`
  - `source-search-summary.json`
  - `rule-judge-verdict.json`
  - `execution-scene-summary.json`
  - `judge-plan.json`
  - `refine-decision.json`
  - `executable-plan.json`
- refine가 실제로 돌면 `executable-plan-refine-1.json`, `execution-scene-summary-refine-1.json`, `judge-plan-refine-1.json`, `refine-decision-refine-1.json` 도 남는다.
- finalize/completion chain은 이제 `copyPlanRef`, `assetPlanRef`, `concreteLayoutPlanRef`, `executionSceneSummaryRef`, `judgePlanRef`, `refineDecisionRef` 까지 포함한다.

## 7. 현재 business rule

- 현재 public 제품 표면은 create-only다.
- 현재 worker graph는 single-run, single-worker mental model을 유지한다.
- planner/model abstraction은 LangChain JS 뒤로 숨기고 provider SDK를 graph node에 직접 흩뿌리지 않는다.
- LangGraph checkpoint는 worker-internal progress/resume 용도이며, canonical audit/completion source는 backend row/object store다.
- `completed_with_warning` 는 이제 실제 terminal outcome 으로 사용된다.

## 8. 현재 gap / drift

### 8.1 planner/judge 정합성 부족

- 실제 manual run에서 `domain=fashion_retail` 인데 `facets.menuType=food_menu` 가 동시에 나온 사례가 있다.
- 같은 run에서 `search-profile.photo.keyword=메뉴` 가 생성됐고, 실제 editor에는 음식 사진이 들어갔다.
- `rule_judge` 는 이 모순을 `keep` 으로 통과시켰다.
- 즉 현재 가장 큰 gap은 `planner intent consistency` 와 `judge domain consistency detection` 이다.

### 8.2 execution contract 잔여 품질

- `executionSlotKey` canonicalization 으로 기존 `slotKey`/`role` alias 추론 mismatch 는 크게 줄었다.
- 다만 현재 refine/judge 는 still non-visual 이고, real scene fidelity 나 screenshot 기반 품질 판정은 아직 없다.
- 즉 현재 남은 큰 품질 gap은 retrieval 보다 `visual quality` 와 `real save evidence` 쪽이다.

### 8.3 bounded refine 한계

- `ruleJudge` 의 `refine` recommendation 은 이제 post-execution `JudgePlan` 과 1회 patch-only refine loop로 이어질 수 있다.
- 다만 이 refine 는 retrieval 재실행이나 asset rebinding 이 아니라 copy/layout/spacing/CTA container 보정만 허용한다.

### 8.4 retrieval / vision / memory 미구현

- semantic retrieval / vector DB 없음
- vision judge 없음
- public multi-turn memory 없음

### 8.5 save evidence 완전 연동 미완료

- backend completion chain은 존재하지만 real editor save evidence 연동은 아직 prototype 수준이다.

## 9. Interfaces / external dependency

| 인터페이스 | 현재 상태 |
| --- | --- |
| `POST /runs` | 사용 중 |
| SSE run/event stream | 사용 중 |
| `POST /mutation-acks` | 사용 중 |
| BullMQ + Redis | outer transport로 사용 중 |
| LangGraph | worker orchestration runtime으로 사용 중 |
| LangChain JS | planner/model abstraction으로 사용 중 |
| Google Gemini | local 기본 planner provider |
| Tooldi PHP API | real asset source query 에 사용 중 |

## 10. Non-functional / 운영 메모

- local representative boot는 docker 기반 local Postgres-backed LangGraph checkpointer를 사용한다.
- local real source boot는 `TOOLDI_CATALOG_SOURCE_MODE=tooldi_api_direct` 를 기본으로 사용한다.
- local representative command:

```bash
cd tooldi-agent-runtime
pnpm run local:toolditor:stack:real
```

- 브라우저 entry:
  - `http://localhost:3010/editor`
- 최근 verified regression:
  - `npm test`
  - `pnpm smoke:transport`
  - `pnpm smoke:retry`

## 11. Open Questions

| ID | 질문 |
| --- | --- |
| OQ-001 | explicit subject path(`restaurant`/`cafe`/`fashion`)에 대한 copy/layout grammar를 언제 별도 subplan 정책으로 승격할지 |
| OQ-002 | 현재 patch-only refine를 어디까지 topology/spacing/CTA 품질 쪽으로 확장하고, 어디까지는 Phase 4 이후 visual judge로 미룰지 |
| OQ-003 | semantic retrieval과 real save evidence integration 중 어느 축을 먼저 열지 |

## 12. Risks / design debt

| ID | 항목 | 영향 |
| --- | --- | --- |
| KD-001 | planner/judge가 domain contradiction을 충분히 잡지 못함 | High |
| KD-002 | `refine` 는 현재 patch-only / non-visual 이며 retrieval 재실행과 asset rebinding은 하지 않음 | Medium |
| KD-003 | real save evidence가 prototype 수준 | Medium |
| KD-004 | photo insertion canonical picture seam 정렬 deferred | Medium |

## 13. Implementation Traceability

현재 상태 확인에 사용한 주요 구현 파일:

- `tooldi-agent-runtime/apps/agent-worker/src/graph/runJobGraph.ts`
- `tooldi-agent-runtime/apps/agent-worker/src/phases/buildNormalizedIntent.ts`
- `tooldi-agent-runtime/apps/agent-worker/src/phases/buildSearchProfile.ts`
- `tooldi-agent-runtime/apps/agent-worker/src/phases/assembleTemplateCandidates.ts`
- `tooldi-agent-runtime/apps/agent-worker/src/phases/selectTemplateComposition.ts`
- `tooldi-agent-runtime/apps/agent-worker/src/phases/selectTypography.ts`
- `tooldi-agent-runtime/apps/agent-worker/src/phases/ruleJudge.ts`
- `tooldi-agent-runtime/apps/agent-worker/src/phases/buildExecutionSceneSummary.ts`
- `tooldi-agent-runtime/apps/agent-worker/src/phases/buildJudgePlan.ts`
- `tooldi-agent-runtime/apps/agent-worker/src/phases/buildRefineDecision.ts`
- `tooldi-agent-runtime/apps/agent-worker/src/phases/finalizeRun.ts`
- `tooldi-agent-runtime/packages/agent-llm/src/templatePlanner.ts`
- `tooldi-agent-runtime/packages/contracts/src/worker/worker-callbacks.ts`
- `tooldi-agent-runtime/apps/agent-api/src/services/runFinalizeService.ts`
- `tooldi-agent-runtime/apps/agent-worker/src/jobs/processRunJob.test.ts`

직접 확인한 대표 artifact 사례:

- `run_20260408_065611_331_ff585201`
  - `normalized-intent.json`
  - `search-profile.json`
  - `selection-decision.json`
  - `rule-judge-verdict.json`
