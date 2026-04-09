# Tooldi Agent Workflow v1 Create Template Representation Design Lock

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Create Template Representation Design Lock |
| 문서 목적 | `create_template` 에이전트의 내부 표현 전략을 `hybrid core schema + structured subplans` 로 고정하고, 왜 하나의 초세밀 고정 스키마나 loose brief 가 아닌지 근거와 함께 남긴다. |
| 상태 | Draft |
| 문서 유형 | Decision / Design Lock |
| 작성일 | 2026-04-09 |
| 기준 시스템 | `Tooldi Editor`, `Fastify Agent API`, `BullMQ Worker + LangGraph Runtime`, `LangChain JS planner`, `Google Gemini`, Tooldi PHP API, `tooldi_dev` MariaDB, AWS S3 asset buckets |
| 대상 독자 | PM, Agent Backend, Worker, FE, QA, Reviewer |
| Owner | Tooldi agent workflow |

## 1. 문서 성격

- 이 문서는 `Tooldi Editor 안에서 동작하는 create_template agent` 의 **중간 표현 전략**을 고정한다.
- 이 문서는 architecture 문서가 잠근 artifact identity, counted completion moment, ownership split, FE/BE control-plane split을 다시 정의하지 않는다.
- 이 문서는 template intelligence vocabulary 문서를 대체하지 않고, 그 위에서 **표현 전략**을 더 늦은 기준으로 정리한다.
- sibling 문서와 충돌이 나면 아래 순서를 따른다.
  1. `tooldi-natural-language-agent-v1-architecture.md`
  2. `tooldi-agent-workflow-v1-functional-spec-to-be.md`
  3. `tooldi-agent-workflow-v1-backend-boundary.md`
  4. `toolditor-agent-workflow-v1-client-boundary.md`
  5. `tooldi-agent-workflow-v1-scope-operations-decisions.md`
  6. `tooldi-agent-workflow-v1-template-intelligence-design-lock.md`
  7. 이 문서

## 2. Decision Summary

### 2.1 고정 결론

- `create_template` agent 의 표현 전략은 **tight end-to-end mega schema** 가 아니다.
- `create_template` agent 의 표현 전략은 **loose freeform brief handoff** 도 아니다.
- canonical 방향은 아래로 고정한다.
  - `freeform prompt / creative brief`
  - `strict core schema`
  - `structured subplans`
  - `execution / scene layer`

즉 이 시스템은 **schema-driven** 이지만, 하나의 giant schema 에 모든 의미를 몰아넣는 방식으로 확장하지 않는다.

### 2.2 왜 이 결론이 필요한가

- 현재 worker 는 이미 `normalizedIntent -> templatePriorSummary -> searchProfile -> selectionDecision -> executablePlan` 체인을 가진다.
- 실제 Tooldi source family 는 `background`, `graphic`, `photo`, `font`, `template prior` 로 분리돼 있고 search surface 와 execution semantics 도 family 별로 다르다.
- 따라서 자연어를 하나의 초세밀 통합 스키마에 끝까지 밀어 넣으면:
  - nullable field 가 폭증하고
  - family-specific behavior 를 잃고
  - 현재 불안정한 domain ontology 를 너무 빨리 고정하게 된다.

## 3. Evidence Basis

## 3.1 Official framework guidance

- LangChain structured output 은 provider-native structured output 을 가장 신뢰도 높은 방법으로 다룬다.
- LangGraph 는 predictable task 에 workflow/state graph 를 권장하고, raw state 를 유지한 채 node 에서 필요한 prompt formatting 을 하도록 안내한다.
- OpenAI agent safety 가이드는 node 사이 데이터 흐름을 structured outputs 로 제한하라고 권장한다.

이 세 자료는 공통적으로 아래를 지지한다.

- 중간 handoff 는 typed contract 여야 한다.
- 그러나 그 contract 는 giant monolithic schema 일 필요가 없다.
- phase 별 responsibility 를 가진 layered contract 가 더 적절하다.

참고:

- LangChain structured output: https://docs.langchain.com/oss/javascript/langchain/structured-output
- LangGraph workflows and agents: https://docs.langchain.com/oss/python/langgraph/workflows-agents
- OpenAI safety in building agents: https://developers.openai.com/api/docs/guides/agent-builder-safety

## 3.2 Public product pattern hints

- Canva 는 `Magic Design`, `Design Model`, `Magic Layers` 를 통해 editable design, structure, layering, hierarchy, branding, visual logic 를 강조한다.
- Figma `First Draft` 는 building blocks 와 stacks of components 기반 조립을 전제로 한다.

이 공개 자료가 시사하는 것은:

- 실제 prompt-to-design 제품은 `prompt -> final image` 보다
- `prompt -> planning / retrieval / component-like structure -> editable render`
  에 더 가깝다는 점이다.

참고:

- Canva Magic Design / design model: https://www.canva.com/newsroom/news/supercharging-the-visual-suite/ , https://www.canva.com/newsroom/news/creative-operating-system/ , https://www.canva.com/newsroom/news/magic-layers/
- Figma First Draft: https://help.figma.com/hc/en-us/articles/23955143044247-Use-First-Draft-with-Figma-AI

## 3.3 Tooldi domain evidence

### 3.3.1 Source family가 이미 heterogeneous 하다

- picture direct search: `keyword`, `type`, `format`, `price`, `sort`, `owner`, `theme`
- shape direct search: `keyword`, `type`, `price`, `sort`, `owner`, `theme`, `method`
- background search: `type`, `keyword`, `page`

즉 retrieval surface 부터 family 별로 다르다.

근거:

- [Picture.php](/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Picture.php)
- [Shape.php](/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Shape.php)
- [Editor.php](/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Editor.php)

### 3.3.2 Inventory 분포도 family 편향이 강하다

2026-04-09 확인치:

- `default_shape = 1,567,139`
- `picture = 185,571`
- `template = 197,319`
- `background = 740`
- `default_font = 1,538`

shape inventory 가 압도적으로 크고, generic promo 실험에서도 실제로 graphic/vector/bitmap 중심 composition 이 더 자연스럽다.

### 3.3.3 Theme prior 는 sparse 하다

`contents_theme` active:

- `template = 8`
- `shape = 6`
- `picture = 6`

즉 curated prior 는 존재하지만 sparse 하다. giant schema 하나로 모든 theme/domain/subject 를 exhaustively 잠그는 방식은 실제 데이터 밀도와 맞지 않는다.

### 3.3.4 S3 / persisted asset semantics 도 family 별로 다르다

- `s3://dev-file.tooldi.com/` 아래도 `background/`, `picture/`, `shape/`, `font/`, `template/` family prefix 로 분리된다.
- `uid` 나 path semantics 도 family/legacy category 에 의존한다.

즉 persisted execution layer 역시 단일 family-agnostic mega schema 보다 **small canonical envelope + family-specific payload** 구조가 더 자연스럽다.

## 4. Locked Representation Strategy

## 4.1 Layered model

### Layer A. Freeform intake

- user prompt
- optional creative note
- optional human brand/style note

이 레이어는 자유형 텍스트를 허용한다.

### Layer B. Strict core schema

이 레이어는 worker state 와 cross-node handoff 의 canonical spine 이다.

최소 포함:

- `normalizedIntent`
- `assetPolicy`
- `requiredSlots`
- `constraints`
- `evaluationTargets`
- `canvas / output target`

이 레이어는 compact 하고 stable 해야 한다.

### Layer C. Structured subplans

이 레이어는 task-specific meaning 을 giant schema 에 몰지 않고 분리한다.

우선순위 subplan:

- `copyPlan`
- `layoutPlan`
- `assetPlan`
- `typographyPlan`
- `judgePlan`
- optional `templatePriorPlan`

규칙:

- subplan 은 typed 이어야 한다.
- subplan 은 phase-local responsibility 를 가져야 한다.
- subplan 안에는 localized rationale / alternatives 같은 제한된 freeform field 를 둘 수 있다.

### Layer D. Execution / scene layer

- `selectionDecision`
- `StoredAssetDescriptor` 또는 equivalent canonical asset envelope
- `executablePlan`
- mutation batches / layer tree

이 레이어는 editor apply 와 audit 를 위해 strict 해야 한다.

## 4.2 금지할 방향

### 금지 1. Giant monolithic schema

아래는 금지한다.

- domain, theme, subject, family, layout, copy, render slot, persistence metadata 를 하나의 mega schema 안에 모두 박아 넣는 것

이유:

- Tooldi source family 가 heterogeneous 하다.
- domain ontology 가 아직 계속 repair 되고 있다.
- family-specific execution semantics 가 너무 다르다.

### 금지 2. Loose freeform handoff

아래는 금지한다.

- prompt/brief 를 그대로 다음 phase 에 넘기고, 각 phase 가 다시 자기 식으로 해석하는 것

이유:

- traceability 와 safety 가 떨어진다.
- planner/search/judge mismatch 를 잡기 어렵다.
- current worker artifact chain 의 설명 가능성이 무너진다.

## 4.3 Family handling rule

- `background`, `graphic`, `photo`, `font` 는 planner 단계에서 하나의 flat taxonomy 로 합치지 않는다.
- family-specific query surface 와 execution semantics 는 subplan 에서 분기한다.
- 단, persisted / finalize / audit layer 에서는 가능한 한 작은 canonical asset envelope 를 사용한다.

즉 family heterogeneity 는 **planner/search/subplan layer** 에서 유지하고, **persisted execution layer** 에서만 제한적으로 canonicalize 한다.

## 5. Immediate Implications For Future Work

## 5.1 다음 단계의 중심

이 결정에 따라 다음 구조 작업은 아래 순서가 맞다.

1. `copyPlan` 을 1급 객체로 승격
2. `layoutPlan` 을 slot topology 기반으로 승격
3. `assetPlan` 을 family-specific subplan 으로 정리
4. `judgePlan` 을 구조 품질 중심으로 강화
5. 그 다음 bounded refine loop 추가

즉 지금 병목은 retrieval 정확도보다 **copy/layout/composition/judge 구조**다.

## 5.2 현재 generic promo 개선과의 연결

- generic promo 를 `general_marketing + graphic_preferred + subjectless` 로 repair 한 최근 변경은 이 문서의 방향과 일치한다.
- multi-graphic composition role 도 giant schema 확장이 아니라 `asset / layout subplan` 쪽으로 옮겨가야 한다.

## 5.3 explicit subject path 와의 연결

- `restaurant`, `cafe` 같은 explicit subject path 는 그대로 유지한다.
- 단, 이 semantics 역시 giant core schema 확장이 아니라 `assetPlan` 과 `copyPlan` 쪽에서 분기하는 것이 맞다.

## 6. Traceability

이 문서의 결론은 아래 evidence 를 기반으로 했다.

- current design / hardening docs:
  - [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
  - [tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md)
  - [tooldi-agent-workflow-v1-tooldi-content-discovery.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-tooldi-content-discovery.md)
- current runtime code:
  - [templatePlanner.ts](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/packages/agent-llm/src/templatePlanner.ts)
  - [buildSearchProfile.ts](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/buildSearchProfile.ts)
  - [selectTemplateComposition.ts](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/selectTemplateComposition.ts)
  - [types.ts](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/types.ts)
- real Tooldi source seams:
  - [Picture.php](/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Picture.php)
  - [Shape.php](/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Shape.php)
  - [Editor.php](/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Editor.php)

## 7. Current Default

추후 별도 decision record 가 나오기 전까지, `create_template` 관련 새 설계는 아래 가정 위에서 시작한다.

- `strict core schema + structured subplans`
- `family-specific retrieval / execution semantics 유지`
- `freeform text 는 intake 와 localized creative fields 에만 허용`
- `giant mega schema 증설 금지`

