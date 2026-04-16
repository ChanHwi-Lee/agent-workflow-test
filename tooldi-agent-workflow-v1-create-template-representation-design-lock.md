# Tooldi Agent Workflow v1 Create Template Representation Design Lock

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Create Template Representation Design Lock |
| 문서 목적 | `create_template` 표현 전략을 SSOT 기준으로 투영하고, worker/runtime 안에서 어떤 표현이 canonical이고 어떤 것이 단순 구현 scaffolding인지 명확히 고정한다. |
| 상태 | Draft |
| 문서 유형 | Decision / Design Lock |
| 작성일 | 2026-04-16 |
| 기준 시스템 | `Tooldi Editor`, `Fastify Agent API`, `BullMQ Worker + LangGraph Runtime`, `LangChain JS planner`, `Google Gemini`, Tooldi PHP API, `tooldi_dev` MariaDB, AWS S3 asset buckets |
| 대상 독자 | PM, Agent Backend, Worker, FE, QA, Reviewer |
| Owner | Tooldi agent workflow |

## 1. 문서 성격

- 이 문서는 `create_template` 의 표현 전략을 **SSOT projection** 으로만 다룬다.
- 설계 철학 자체는 [tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md) 가 유일한 source다.
- 이 문서는 architecture 문서가 잠근 artifact identity, counted completion moment, ownership split, FE/BE control-plane split을 다시 정의하지 않는다.
- 이전 `strict core schema + structured subplans` 표현은 더 이상 철학 authority가 아니다. 남아 있는 legacy artifact chain은 migration scaffolding 로만 읽어야 한다.

## 2. Decision Summary

### 2.1 고정 결론

- `create_template` 의 canonical 표현 전략은 `strict core schema + structured subplans` 가 아니다.
- `create_template` 의 canonical 표현 전략은 `semantic slot completion` 도 아니다.
- `create_template` 의 canonical 표현 전략은 아래 4층으로 고정한다.
  - `freeform intake`
  - `message atoms`
  - `projected template object graph`
  - `adaptive composition decision`
  - `executor materialization / evaluation`

즉, 구조의 1차 진실은 template object graph이고, message atoms는 content hint이며, executor만이 geometry/materialization/renderability/save closing을 담당한다.

### 2.2 명시적으로 버리는 것

아래는 이제 더 이상 normative 하지 않다.

- giant core schema
- `requiredSlots` 기반 success gate
- slot completeness
- capability catalog을 planning ontology처럼 읽는 방식
- worker artifact chain을 design truth처럼 읽는 방식

## 3. Canonical Layer Model

### 3.1 Layer A. Freeform intake

- user prompt
- optional creative note
- optional human brand/style note

이 레이어는 자유형 텍스트를 허용한다. 단, 다음 레이어로 그대로 흘러가면 안 된다.

### 3.2 Layer B. Message atoms

이 레이어는 구조가 아니라 content seed를 닫는다.

최소 범위:

- `primary`
- `offer`
- `cta`
- optional `detail`
- optional `legal_or_footer`

규칙:

- message atoms는 loose semantic hint다.
- atom 존재가 곧 특정 slot 또는 특정 layout object 존재를 강제하지 않는다.
- atom은 copy intent와 content priority를 설명할 뿐, geometry truth를 만들지 않는다.

### 3.3 Layer C. Projected template object graph

이 레이어는 선택된 reference template의 editable object graph를 1차 구조 진실로 읽는다.

최소 포함:

- object id
- layer type
- effective bounds
- text / image / style observables
- computable annotation (`visualWeight`, `zone`, composite 관계 등)

규칙:

- semantic role classification을 이 레이어에서 강제하지 않는다.
- object graph는 `무엇이 있는지` 를 보여주고, `무엇으로 쓸지` 는 다음 레이어가 결정한다.
- hidden/off-canvas/no-op object는 canonical projection에서 제거할 수 있다.

### 3.4 Layer D. Adaptive composition decision

이 레이어는 LLM 또는 동등 decision maker가 아래 결정을 내리는 유일한 layer다.

- `retain`
- `modify`
- `remove`
- `add`

규칙:

- 기존 object에 대한 결정은 template graph에서 도출한다.
- 새 요소 추가는 addable vocabulary registry를 참조할 때만 허용한다.
- 정확한 좌표, z-order, scale, fitting은 여기서 결정하지 않는다.

### 3.5 Layer E. Executor materialization / evaluation

이 레이어는 code-driven materialization만 담당한다.

최소 책임:

- geometry normalization
- layer emission
- renderability guard
- save/finalize
- editability verification

completion은 여기서만 `editability + renderability + save truth` 로 닫는다.

## 4. Worker Artifact Chain Rule

현재 runtime에는 아래 artifact chain이 남아 있을 수 있다.

- `normalized-intent`
- `copy-plan`
- `layout-plan-*`
- `asset-plan`
- `search-profile`
- `selection-decision`
- `judge-plan`
- `executable-plan`

하지만 이들은 이제 아래처럼만 읽는다.

- transport/control artifact
- phase-local scaffolding
- debug/evidence artifact

즉, 위 artifact들이 존재해도 구조의 1차 진실은 template object graph를 대체할 수 없다. `requiredSlots`, `executionSlotKey`, `slot completeness`, legacy `role` alias는 implementation residue일 수는 있어도 철학 source가 아니다.

## 5. Family Handling Rule

- `background`, `graphic`, `photo`, `font`, `template` 는 planner ontology로 납작하게 합치지 않는다.
- family별 query surface, asset quality rule, execution constraint는 source family registry와 executor registry에서 분리해 다룬다.
- persisted/finalize/audit layer에서는 가능한 한 작은 canonical asset envelope만 사용한다.

즉 family heterogeneity는 discovery/selection/materialization 단계에서 보존하고, durability 단계에서만 최소한으로 canonicalize 한다.

## 6. 금지 패턴

### 금지 1. Giant schema 복귀

- domain, tone, asset family, layout structure, completion gate를 하나의 mega schema에 다시 몰아넣는 것

### 금지 2. Slot-driven completion

- headline/background/cta 같은 named slot presence로 success를 판정하는 것

### 금지 3. Capability-as-planning-ontology

- executor capability vocabulary를 상위 planning ontology로 격상하는 것

### 금지 4. Legacy artifact truth 승격

- `NormalizedIntent`, `CopyPlan`, `LayoutPlan`, `executionSlotKey` 같은 legacy scaffold를 canonical structure truth처럼 읽는 것

## 7. Immediate Implications

### 7.1 다음 설계/구현에서 유지할 기준

1. message atoms는 content hint로만 사용한다.
2. template object graph projection을 먼저 만든다.
3. adaptive composition decision을 통해 retain/modify/remove/add를 닫는다.
4. executor는 code-driven materialization만 맡는다.
5. completion은 always `editability + renderability + save truth` 로 닫는다.
6. CTA 부재는 실패 이유가 아니다.
7. 적절한 reference가 없다고 from-scratch synthetic composition으로 전환하지 않는다.
8. fallback은 selected reference를 유지한 bounded degradation까지만 허용한다.

### 7.2 현재 runtime과의 관계

- current runtime artifact chain은 완전히 삭제되기 전까지 유지될 수 있다.
- 다만 그 chain 안의 어떤 field도 SSOT를 override하면 안 된다.
- legacy field가 필요하다면 현재 구현 상태 문서에서만 AS-IS drift로 기록한다.
- legacy fallback path가 필요하더라도 selected reference를 버리는 synthetic composition route로 승격하면 안 된다.

## 8. Traceability

이 문서는 아래 문서를 projection basis로 삼는다.

- [tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md)
- [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
- [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
- [tooldi-agent-workflow-v1-create-template-current-state-as-is.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-current-state-as-is.md)

## 9. Current Default

추후 별도 decision record가 나오기 전까지 `create_template` 관련 새 설계는 아래 가정 위에서 시작한다.

- template object graph가 구조의 1차 진실이다
- message atoms는 content hint다
- adaptive composition decision은 `retain/modify/remove/add` 로 닫는다
- completion은 `editability + renderability + save truth` 다
- giant schema, slot completeness, capability-as-planning-ontology는 금지한다
