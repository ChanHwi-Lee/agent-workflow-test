# Tooldi Agent Workflow v1 Next Implementation Roadmap

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Next Implementation Roadmap |
| 문서 목적 | 현재 bootstrap/happy-path prototype 이후 어떤 구현 축을 우선순위로 열어야 하는지 정리한다. |
| 상태 | Working Draft |
| 문서 유형 | Implementation Roadmap |
| 작성일 | 2026-04-06 |
| 기준 시스템 | `toolditor FE`, `Fastify Agent API`, `BullMQ Worker Runtime`, `Redis`, `existing internal tool adapters` |
| 기준 데이터 | `README.md`, `tooldi-natural-language-agent-v1-architecture.md`, `tooldi-agent-workflow-v1-functional-spec-to-be.md`, `tooldi-agent-workflow-v1-backend-boundary.md`, `toolditor-agent-workflow-v1-client-boundary.md`, `tooldi-agent-workflow-v1-scope-operations-decisions.md` |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA |
| Owner | Ouroboros workflow |

## 1. 문서 성격

- 이 문서는 normative spec이 아니라 `다음 구현 우선순위` 를 정리하는 working roadmap이다.
- authority ownership, artifact identity, completion semantics, FE/BE boundary는 sibling 문서를 override하지 않는다.
- sibling 문서와 충돌이 나면 아래 순서를 따른다.
  1. `tooldi-natural-language-agent-v1-architecture.md`
  2. `tooldi-agent-workflow-v1-functional-spec-to-be.md`
  3. `tooldi-agent-workflow-v1-backend-boundary.md`
  4. `toolditor-agent-workflow-v1-client-boundary.md`
  5. `tooldi-agent-workflow-v1-scope-operations-decisions.md`

## 2. 현재 기준선

현재 코드베이스는 아래 수준까지 와 있다.

- separate control-plane / execution-plane skeleton 존재
- `POST /runs -> SSE -> mutation ack -> finalize -> completed` happy-path prototype 존재
- backend는 `LiveDraftArtifactBundle -> RunCompletionRecord` happy-path chain을 prototype 수준으로 materialize 한다
- `run.recovery` 는 projection skeleton 수준으로만 존재한다
- 실제 editor save evidence, resume engine, rollback engine, production durability는 아직 아니다

즉 현재 상태는 `작동하는 얇은 prototype` 이며, 다음 단계의 핵심은 recovery 고도화보다 `더 나은 draft를 더 그럴듯하게 만드는 intelligence layer` 를 붙이는 것이다.

## 3. 현재 단계에서 고정할 전제

다음 구현은 아래 전제를 유지하는 것이 맞다.

### 3.1 happy-path 우선

- 당분간 우선순위는 recovery가 아니라 happy-path 품질 향상이다.
- 이유는 recovery quality도 결국 normal path의 evidence quality에 의존하기 때문이다.
- 따라서 `tool choice`, `plan quality`, `mutation quality`, `save evidence integration` 이 먼저다.

### 3.2 mutation surface는 좁게 유지

- 다음 prototype도 당분간 `shape/text/group only` 가 기본이다.
- `image/sticker/saveTemplate/updateLayer/deleteLayer` 를 한꺼번에 열지 않는다.
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

### 5.1 Phase 1: Happy-Path Intelligence Skeleton

목표:

- fixed mutation prototype을 planner-driven mutation prototype으로 올린다

범위:

- grounding/context pack
- planner LLM 연결
- structured plan 생성
- tool registry metadata 정리
- 여전히 `shape/text/group only`

완료 기준:

- fixed prompt가 아니어도 structured plan이 생성된다
- mutation stage가 planner output과 연결된다

### 5.2 Phase 2: Search / Compare / Select

목표:

- asset/layout/copy 후보를 검색하고 비교한 뒤 선택하는 구조를 만든다

범위:

- candidate schema
- compare/rank pipeline
- chosen candidate trace 저장

완료 기준:

- 왜 이 요소를 골랐는지 설명 가능한 selection trace가 남는다

### 5.3 Phase 3: Vision Critique Loop

목표:

- 결과물을 보고 한 번 더 손보는 agent loop를 만든다

범위:

- snapshot capture
- vision/judge evaluation
- issue list 기반 refinement 1회

완료 기준:

- `foundation -> copy -> polish -> critique -> refine` 같은 순차 동작이 보인다

### 5.4 Phase 4: Real Save Evidence Integration

목표:

- synthetic happy-path를 실제 editor/save evidence 기반 happy-path로 교체한다

범위:

- save receipt
- saved revision
- final template code
- finalizer evidence source 교체

완료 기준:

- backend completed path가 synthetic evidence 없이 닫힌다

### 5.5 Phase 5: Recovery / Resume Revisit

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
- embeddings / RAG / long-term memory
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

현재 이후의 가장 중요한 방향은 `recovery를 더 깊게 파는 것` 이 아니라, `grounding -> planning -> tool selection -> search/compare/select -> vision critique -> real save evidence` 순으로 happy-path intelligence를 올리는 것이다.
