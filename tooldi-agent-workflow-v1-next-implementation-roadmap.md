# Tooldi Agent Workflow v1 Next Implementation Roadmap

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Next Implementation Roadmap |
| 문서 목적 | 현재 bootstrap/happy-path prototype 이후 어떤 구현 축을 우선순위로 열어야 하는지 정리한다. |
| 상태 | Working Draft |
| 문서 유형 | Implementation Roadmap |
| 작성일 | 2026-04-08 |
| 기준 시스템 | `toolditor FE`, `Fastify Agent API`, `BullMQ Worker + LangGraph Runtime`, `LangChain JS planner`, `Google Gemini`, `Redis`, existing internal tool adapters |
| 기준 데이터 | `README.md`, `tooldi-natural-language-agent-v1-architecture.md`, `tooldi-agent-workflow-v1-functional-spec-to-be.md`, `tooldi-agent-workflow-v1-backend-boundary.md`, `toolditor-agent-workflow-v1-client-boundary.md`, `tooldi-agent-workflow-v1-scope-operations-decisions.md` |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA |
| Owner | Ouroboros workflow |

## 1. 문서 성격

- 이 문서는 normative spec이 아니라 `다음 구현 우선순위` 를 정리하는 working roadmap이다.
- `create_template` intelligence layer의 capability catalog / selection policy / candidate schema / hierarchy authority는 [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md) 가 맡고, 이 문서는 sequencing과 implementation track만 다룬다.
- `create_template` 내부 표현 전략과 `core schema + structured subplans` 기준은 [tooldi-agent-workflow-v1-create-template-representation-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-representation-design-lock.md) 를 따른다.
- planner/search/judge hardening의 source-grounded TO-BE 기준은 [tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md) 를 따른다.
- authority ownership, artifact identity, completion semantics, FE/BE boundary는 sibling 문서를 override하지 않는다.
- sibling 문서와 충돌이 나면 아래 순서를 따른다.
  1. `tooldi-natural-language-agent-v1-architecture.md`
  2. `tooldi-agent-workflow-v1-functional-spec-to-be.md`
  3. `tooldi-agent-workflow-v1-backend-boundary.md`
  4. `toolditor-agent-workflow-v1-client-boundary.md`
  5. `tooldi-agent-workflow-v1-scope-operations-decisions.md`
  6. `tooldi-agent-workflow-v1-template-intelligence-design-lock.md`

## 2. 현재 기준선

현재 코드베이스는 아래 수준까지 와 있다.

- separate control-plane / execution-plane skeleton 존재
- `POST /runs -> SSE -> mutation ack -> finalize -> completed` happy-path prototype 존재
- 2026-04-09 기준 worker 내부 orchestration 은 LangGraph `StateGraph` 로 실제 실행된다.
- current worker 는 generic `create_template` skeleton 을 넘어 `strict core + structured subplans` chain 을 가진다.
  - `normalized-intent`
  - `copy-plan`
  - `layout-plan-abstract`
  - `asset-plan`
  - `layout-plan-concrete`
  - `search-profile`
  - `candidate-set`
  - `selection-decision`
  - `typography-decision`
  - `rule-judge-verdict`
  - `execution-scene-summary`
  - `judge-plan`
  - `refine-decision`
  - `executable-plan`
- planner/model abstraction 은 LangChain JS 뒤로 정리됐고, local 기본 provider 는 Gemini 다.
- picture/shape retrieval은 direct `Picture::index` / `Shape::index` surface를 사용하는 `tooldi_api_direct` mode로 정리됐다.
- terminal semantics 에 `completed_with_warning` 가 실제로 연결돼 있다.
- black-box acceptance prompt 3종(`restaurant`, `cafe`, `fashion_retail`)이 integration test 에 고정돼 있다.
- backend는 `LiveDraftArtifactBundle -> RunCompletionRecord` happy-path chain을 prototype 수준으로 materialize 한다
- `run.recovery` 는 projection skeleton 수준으로만 존재한다
- 실제 editor save evidence, resume engine, rollback engine, production durability는 아직 아니다

즉 현재 상태는 `작동하는 create_template subplan-driven runtime v1` 이며, 다음 단계의 핵심은 새 runtime 도입이 아니라 `judgePlan 성숙화 / bounded refine 품질 / real save evidence` 를 고도화하는 것이다.

## 3. 현재 단계에서 고정할 전제

다음 구현은 아래 전제를 유지하는 것이 맞다.

### 3.1 happy-path 우선

- 당분간 우선순위는 recovery가 아니라 happy-path 품질 향상이다.
- 이유는 recovery quality도 결국 normal path의 evidence quality에 의존하기 때문이다.
- 따라서 `tool choice`, `plan quality`, `mutation quality`, `save evidence integration` 이 먼저다.

### 3.2 mutation surface는 좁게 유지

- 다음 prototype도 당분간 `shape/text/group only` 가 기본이다.
- `image/sticker/saveTemplate/deleteLayer` 를 한꺼번에 열지 않는다.
- 예외적으로 post-execution bounded refine 를 위한 **narrow `updateLayer` patch surface** 는 허용한다.
- 실제 image/sticker는 asset binding, license, save semantics, editor-side apply 제약이 있어 다음 단계로 미룬다.

### 3.3 single-run / single-worker mental model 유지

- v1 현재 단계에서는 multi-agent collaboration을 열지 않는다.
- planner / search / judge / vision loop가 들어오더라도 logical pipeline은 하나의 run 안에서 직렬 phase로 유지한다.
- 별도 planner agent, critic agent, designer agent를 독립 actor로 분해하는 것은 이 단계 목표가 아니다.

### 3.4 synthetic evidence는 점진적으로 제거

- 현재 prototype happy-path는 synthetic `latestSaveReceiptId`, `outputTemplateCode` 를 사용한다.
- 이 값들은 임시 harness로는 허용되지만, 실제 integration 단계에서는 editor/save layer evidence로 교체되어야 한다.

## 4. 다음 구현 축

다음 작업은 크게 8개의 implementation track으로 나눌 수 있다.

### 4.1 Grounding / Context Assembly

LLM이나 planner가 안정적으로 동작하려면 먼저 run context를 잘 모아야 한다.

필요한 항목:

- editor context normalization
  - canvas size
  - page id
  - active template code
  - empty-canvas gate 결과
  - current revision
- brand/style context
  - palette
  - typography hint
  - existing template style
- asset/search context
  - 검색 가능한 요소의 타입
  - 비교 가능한 후보군
- prompt normalization
  - free-form user prompt를 structured intent input으로 정규화

핵심 포인트:

- 좋은 tool selection은 좋은 grounding이 먼저다.
- 단순 prompt-to-plan보다 context-pack 기반 planner가 안정적이다.

### 4.2 Tool Expansion

현재 registry/adapters는 skeleton 수준이므로 실제로 사용할 수 있는 tool surface를 늘려야 한다.

우선순위가 높은 tool 종류:

- text-layout / copy arrangement tool
- shape/layout block generation tool
- asset search tool
- asset comparison / ranking tool
- style heuristic tool
- save/evidence capture tool

단, 이번 단계의 tool expansion은 `더 많은 외부 API 연동` 이 아니라 `내부적으로 분리된 capability surface 정의` 가 먼저다.

즉 먼저 필요한 것은:

- canonical tool metadata
- input/output schema
- retryability
- cost class
- latency class
- failure mode taxonomy

### 4.3 LLM Connection and Runtime Decision Layer

현재 worker는 fixed orchestration prototype이므로, 실제로는 아래 decision layer가 들어가야 한다.

- planner LLM
- tool selector LLM 또는 heuristic policy
- judge/critic LLM
- vision evaluator model

이때 중요한 것은 모델 수를 늘리는 것이 아니라 phase responsibility를 분리하는 것이다.

권장 분해:

- planning phase
  - prompt + context -> normalized intent + executable plan
- selection phase
  - 후보군 중 어느 asset/layout/copy path를 택할지 결정
- critique phase
  - 현재 draft가 목표에 맞는지 평가
- refinement phase
  - 평가 결과를 반영해 다음 mutation을 결정

### 4.4 Search / Compare / Select Pipeline

사용자가 언급한 `검색 및 비교를 통한 가장 적절한 요소들 판단 후 선택` 은 별도 축으로 보는 게 맞다.

이 파이프라인은 아래처럼 분리하는 것이 좋다.

1. search
   - 후보군 수집
2. filter
   - 범위 밖 후보 제거
3. compare
   - style, relevance, readability, layout-fit 기준 비교
4. rank
   - top-k 정렬
5. choose
   - 실제 mutation에 사용할 후보 결정

이 단계에서 필요한 것은:

- candidate schema
- compare criteria schema
- rank reason / audit log
- fallback rule

즉 단순히 “검색 결과 하나 채택”이 아니라 `candidate set -> explicit comparison -> chosen candidate` 구조를 남겨야 한다.

semantic retrieval / embedding / hybrid retrieval 을 현재 구조에 추가할 때의 checklist 는 [tooldi-agent-workflow-v1-semantic-retrieval-checklist.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-semantic-retrieval-checklist.md) 를 따른다.

### 4.5 Vision Evaluation and Refinement Loop

이 축은 실제로 agent스럽게 보이게 만드는 핵심이다.

필요한 루프:

1. visible draft snapshot 생성
2. vision model 또는 judge model 평가
3. 평가 결과를 structured issue list로 변환
4. 필요한 mutation만 재생성
5. budget 내에서 1~2회 반복

초기 평가 기준 예시:

- headline readability
- contrast
- hierarchy
- alignment / spacing
- CTA prominence
- overall balance
- seasonal tone consistency

중요한 점:

- 무한 refinement loop 금지
- `maxIterations`, `timeBudgetMs`, `qualityThreshold` 가 필요
- current v1 단계에서는 `1회 critique + 1회 refine` 정도가 가장 적절하다

### 4.6 Happy-Path Editor / Save Evidence Integration

현재 backend happy-path는 synthetic save evidence에 기대고 있다.

다음 실제 integration 축은 아래다.

- editor가 실제 mutation apply 결과를 더 정교하게 ack
- editor/save layer가 `latestSaveReceiptId`, `savedRevision`, `templateCode` 등 evidence 공급
- backend finalizer가 synthetic placeholder가 아니라 실제 save evidence를 source of truth로 사용

이 축이 닫혀야 `completed` 의 의미가 prototype이 아니라 제품 의미에 가까워진다.

### 4.7 Eval / Observability

intelligence layer를 붙이면 결과 품질과 비용을 같이 봐야 한다.

필요한 항목:

- phase latency
- tool success/failure rate
- candidate comparison trace
- judge verdict log
- mutation quality telemetry
- cost summary
- 대표 prompt eval set

즉 “잘 돌아간다”를 넘어서 “왜 이 결과가 나왔는지”와 “얼마나 일관되게 괜찮은지”를 봐야 한다.

### 4.8 Safety / Policy / Budgeting

실제 LLM/tool loop를 붙이면 정책 제어가 필요하다.

필요한 항목:

- tool allowlist / denylist
- max tool call budget
- phase timeout
- fallback policy
- unsupported editor operation 차단
- malformed candidate / malformed mutation 차단

이 축은 나중의 polish가 아니라, 실제 LLM 연결 순간부터 필요한 최소 guardrail이다.

## 5. 추천 구현 순서

현재 단계에서 가장 현실적인 순서는 아래와 같다.

### 5.1 완료된 단계: Generic Create-Template Skeleton v1

- LangGraph worker runtime
- LangChain JS planner/model abstraction
- Gemini planner 연결
- `NormalizedIntent`, `CopyPlan`, `LayoutPlan`, `AssetPlan`, `SearchProfile`, candidate-set, selection, judge artifact chain
- `completed_with_warning` terminal semantics
- 3-domain acceptance suite

즉 이 단계는 더 이상 계획이 아니라 현재 baseline 이다.

### 5.2 완료된 단계: Planner / Judge Consistency Hardening

목표:

- domain, facet, search-profile, selected asset 사이의 semantic contradiction 을 줄인다

범위:

- planner prompt/schema normalization 보강
- heuristic fallback 정합성 보강
- judge rule에 `domain/facet contradiction`, `search-profile mismatch`, `photo subject mismatch` 추가

완료 기준:

- `fashion_retail` 인데 `food_menu` 와 음식 photo가 섞이는 대표 mismatch 를 judge가 `keep` 으로 통과시키지 않는다

즉 이 단계는 generic promo 기준선과 search/profile/prior consistency hardening 을 현재 baseline 으로 만든다.

### 5.3 완료된 단계: Bounded Critique / Refine Loop

목표:

- 현재 `refine -> completed_with_warning` placeholder를 실제 1회 bounded refine 루프로 승격한다

범위:

- `ExecutionSceneSummary`
- `JudgePlan`
- `RefineDecision`
- patch-only mutation regenerate
- max 1회 bounded refine

완료 기준:

- `refine` recommendation 이 실제 second-pass patch mutation 또는 explicit skip reason 으로 이어진다

즉 이 단계는 현재 baseline 에 포함되고, 남은 일은 refine 품질과 save truth 쪽이다.

### 5.4 다음 1순위: Real Save Evidence Integration

목표:

- synthetic happy-path를 실제 editor/save evidence 기반 happy-path로 교체한다

범위:

- save receipt
- saved revision
- final template code
- finalizer evidence source 교체

완료 기준:

- backend completed path가 synthetic evidence 없이 닫힌다

### 5.5 다음 2순위: JudgePlan / Refine Quality Hardening

목표:

- current patch-only refine 의 품질과 설명 가능성을 끌어올린다

범위:

- topology/spacing/CTA 관련 judge rule 정교화
- issue taxonomy 정리
- patch op 우선순위와 skip reason 정교화
- 대표 prompt eval set 기반 judge false-positive 정리

완료 기준:

- refine 가 있어도 불필요한 second-pass 를 남발하지 않고, patch quality regression 이 줄어든다

### 5.6 다음 3순위: Semantic Retrieval 준비와 metadata search 고도화

목표:

- 현재 query-profile 기반 metadata search 를 semantic-ready 구조로 올린다

범위:

- retrieval artifact 보강
- metadata search fallback 정리
- semantic/hybrid seam 연결 준비

완료 기준:

- retrieval mode 추가가 현재 selection artifact chain을 깨지 않고 들어갈 수 있다

### 5.7 다음 4순위: Recovery / Resume Revisit

목표:

- normal path evidence가 충분히 생긴 뒤 recovery를 다시 강화한다

범위:

- visible ack 이후 resumeFromSeq
- rollback / compensation orchestration
- finalize reconstruction 고도화

완료 기준:

- 현재의 `recovery projection skeleton` 을 실제 execution-grade recovery로 올린다

## 6. 현재 단계에서 의도적으로 미루는 것

다음 항목은 당분간 열지 않는 것이 맞다.

- multi-agent collaboration
- embeddings / RAG / long-term memory public feature
- image/sticker heavy generation
- external SaaS integration
- auto publish / export
- production-grade rollback engine
- full checkpoint-based resume engine

## 7. 구현 체크리스트

다음 작업을 시작할 때 우선 확인할 질문은 아래와 같다.

### 7.1 planning / tool orchestration

- planner output이 structured schema를 갖는가
- tool metadata가 enough-for-selection 상태인가
- mutation generation 전 compare/select 단계가 explicit한가

### 7.2 vision loop

- issue list가 structured한가
- refinement가 bounded loop인가
- critique 결과가 event/log로 남는가

### 7.3 happy-path productization

- save evidence가 synthetic이 아닌가
- completed path가 실제 save receipt를 요구하는가
- FE/editor integration spike가 fixed demo를 넘어서 실제 contract를 따르는가

### 7.4 safety / observability

- phase/tool/cost trace가 남는가
- unsupported mutation/tool이 방어적으로 차단되는가
- budget 초과 시 graceful close가 가능한가

## 8. 한 줄 결론

현재 이후의 가장 중요한 방향은 `새 runtime을 다시 바꾸는 것` 이 아니라, `planner/judge 정합성 -> retrieval 고도화 -> bounded refine -> real save evidence` 순으로 current skeleton 의 품질을 올리는 것이다.
