# Tooldi Agent Workflow v1 Template Intelligence Design Lock

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Template Intelligence Design Lock |
| 문서 목적 | `create_template` intelligence layer를 SSOT 기준으로 다시 잠그고, 무엇을 discovery vocabulary로 읽고 무엇을 executor vocabulary로 읽는지 분리한다. |
| 상태 | Draft |
| 문서 유형 | Decision / Spec Lock |
| 작성일 | 2026-04-16 |
| 기준 시스템 | `toolditor FE`, `Fastify Agent API`, `BullMQ Worker Runtime`, `Redis`, `existing internal tool adapters` |
| 기준 데이터 | `tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md`, `tooldi-natural-language-agent-v1-architecture.md`, `tooldi-agent-workflow-v1-functional-spec-to-be.md`, `tooldi-agent-workflow-v1-backend-boundary.md`, `tooldi-agent-workflow-v1-scope-operations-decisions.md`, `README.md` |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA |
| Owner | Ouroboros workflow |

## 1. 문서 성격

- 이 문서는 `create_template` intelligence layer의 projection lock이다.
- 설계 철학, adaptive composition axiom, completion definition은 SSOT만 authoritative 하다.
- 이 문서는 artifact identity, counted completion moment, lifecycle ownership, FE/BE control-plane split을 재정의하지 않는다.
- 이 문서는 capability catalog을 planning ontology로 격상하지 않는다. capability는 executor vocabulary이고, planning은 template object graph와 message atoms를 중심으로 조직된다.

## 2. 이 문서가 잠그는 것

이 문서가 잠그는 것은 아래 다섯 가지다.

1. source family registry
2. reference discovery / compare / select policy
3. message atom extraction vocabulary
4. addable vocabulary registry
5. executor capability registry

핵심 질문은 이제 `"LLM이 어떤 slot을 채워야 하는가"` 가 아니라 `"어떤 reference graph를 선택하고 어떤 object를 retain/modify/remove/add 해야 하는가"` 다.

## 3. v1 고정 전제

### 3.1 happy-path 우선

- v1 현재 단계의 우선순위는 recovery 고도화보다 happy-path composition quality 고도화다.
- 따라서 첫 구현 기준은 `더 적절한 reference 선택`, `더 나은 object-level decision`, `더 설명 가능한 selection trace` 다.

### 3.2 retrieval은 열되 planning ontology는 고정하지 않는다

- retrieval stage는 열어 둔다.
- 하지만 retrieval result를 다시 slot schema로 축약하면 안 된다.
- retrieval의 목적은 `reference template object graph` 를 찾는 것이지, required slot checklist를 채우는 것이 아니다.
- 적절한 reference가 없다고 from-scratch synthetic composition으로 내려가면 안 된다.

### 3.3 multi-agent는 열지 않는다

- planner, selector, judge, vision evaluator는 logical phase일 뿐 독립 actor 협업 구조가 아니다.
- v1은 single-run / single-worker mental model을 유지한다.

## 4. Canonical Intelligence Pipeline

`create_template` intelligence pipeline은 아래 순서로 고정한다.

1. ingress
2. grounding / context pack
3. message atom extraction
4. reference discovery
5. reference compare / select
6. projected object graph build
7. adaptive composition decision
8. executor materialization
9. evaluation / finalize

추가 규칙:

- retrieval stage와 evaluation/refinement stage는 optional 이지만 stage slot 자체는 구조에 포함한다.
- planner와 selector는 retrieval result가 없는 경우에도 fallback path를 가져야 한다.
- editor primitive는 `executor materialization` 이후에만 직접 등장해야 한다.
- backend API 프로세스 안에서 planner/model/tool를 직접 실행하면 안 되고 execution-plane worker가 이 pipeline을 소유한다.

## 5. Source Family Registry

### 5.1 원칙

source family registry는 planning ontology가 아니라 discovery surface registry다.

각 family는 최소 아래 필드를 가져야 한다.

- `familyId`
- `displayName`
- `discoveryRole`
- `selectionSignals`
- `executionConstraints`
- `failureModes`
- `currentRuntimeStatus`

### 5.2 family 고정값

| family | 의미 | discovery status | 기본 메모 |
| --- | --- | --- | --- |
| `template` | reference template metadata / fetched document | enabled | 구조의 1차 진실을 읽기 위한 reference source |
| `background` | background contents (`pattern`, `image`) | enabled | background treatment 후보 |
| `graphic` | shape / vector / bitmap / illustration / icon 계열 | enabled | decor/addable/support object 후보 |
| `photo` | picture / 업로드 이미지 / 일반 사진 계열 | enabled | hero/supporting visual 후보 |
| `font` | font inventory | enabled | materialization stage typography token source |
| `qr` | QR code 요소 | deferred | addable vocabulary reserved |
| `barcode` | barcode 요소 | deferred | addable vocabulary reserved |

### 5.3 image taxonomy lock

`image` 라는 단일 family로 묶지 않고 아래처럼 분리한다.

- `photo`
  - realism, crop, focal point, hero/supporting visual에 적합
- `graphic`
  - decor, symbolic motif, vector/bitmap element, abstract support object에 적합

이 구분은 discovery와 execution constraint를 동시에 바꾸므로 유지한다.

## 6. Message Atom Vocabulary

### 6.1 canonical atom families

`create_template` 의 canonical content vocabulary는 아래 atom family로 고정한다.

- `primary`
- `offer`
- `cta`
- optional `detail`
- optional `legal_or_footer`

### 6.2 규칙

- message atoms는 structure truth가 아니다.
- atom 존재가 특정 object 수나 특정 layout role을 강제하지 않는다.
- atom은 selected reference graph와 결합돼 retain/modify/remove/add 결정을 돕는 content seed다.

## 7. Addable Vocabulary Registry

### 7.1 역할

새 요소 추가는 addable vocabulary registry를 통해서만 허용한다.

registry는 최소 아래 분류를 가진다.

- `cta_button`
- `footer_text`
- `accent_shape`
- `badge`
- `supporting_graphic`
- `hero_photo_frame`

### 7.2 규칙

- registry는 기존 object 분류 체계가 아니다.
- 템플릿에 이미 있는 object는 retain/modify/remove로 다루고, 여기에 없는 것만 add로 다룬다.
- add request는 placement zone 수준까지만 허용하고 좌표/scale/z-order를 직접 결정하지 않는다.

## 8. Executor Capability Registry

### 8.1 역할

capability는 planning ontology가 아니라 executor vocabulary다.

예시 capability family:

- `create_text_object`
- `update_text_content`
- `update_text_style`
- `create_shape_object`
- `create_group_object`
- `bind_photo_asset`
- `bind_graphic_asset`
- `set_background_treatment`
- `delete_run_owned_object`

### 8.2 규칙

- capability registry를 planning taxonomy처럼 읽으면 안 된다.
- planner/selector는 object graph와 message atom을 보고 결정을 만들고, executor는 그 결정을 capability로 물화한다.
- topology는 transitional adapter일 뿐 planning ontology가 아니다.

## 9. Reference Selection Policy

selection 단계는 최소 아래 입력을 본다.

- message atoms
- context pack
- selected source family candidates
- fetched reference template metadata/document
- asset policy
- canvas/output constraints

selection 단계는 최소 아래 결과를 남겨야 한다.

- considered candidate set
- compare criteria
- selected reference template
- projected object graph ref 또는 equivalent evidence
- rejection reasons

즉 selection은 black-box 결론이 아니라 `candidate set -> comparison -> selected reference` 구조를 남겨야 한다.

추가 규칙:

- selected reference가 없으면 synthetic composition fallback으로 성공을 만들지 않는다.
- 이 경우 run은 fail-fast 하거나 explicit warning close 후보로만 수렴해야 한다.
- allowed fallback은 selected reference를 유지한 optional object 제거, photo->graphic 전환, bounded add 정도로 제한한다.

## 10. Photo Rule

- `photo` 는 discovery/selection 대상에 포함한다.
- `photo` 는 `background replacement` 를 기본값으로 해석하면 안 된다.
- 현재 단계에서는 `hero/supporting visual object` 후보로만 읽는다.
- photo execution failure 는 same-run graphic fallback 으로 설명을 숨기지 않고 evidence에 남겨야 한다.
- 이 fallback 역시 selected reference를 버리지 않는 범위에서만 허용된다.

## 11. 금지 패턴

- `requiredSlots` 같은 fixed slot checklist로 planning을 조직하는 것
- capability catalog을 planning ontology처럼 읽는 것
- reference graph를 읽어 놓고 execution 직전에 다시 semantic slot skeleton으로 축약하는 것
- message atoms를 layout structure truth로 오독하는 것
- reference miss를 이유로 synthetic composition을 상시 fallback으로 여는 것

## 12. Current Default

추후 별도 decision record가 나오기 전까지 `create_template` intelligence 관련 새 설계는 아래 가정 위에서 시작한다.

- reference discovery는 `template/background/graphic/photo/font` family를 분리해 다룬다
- message atoms는 `primary/offer/cta/detail/legal_or_footer` vocabulary를 따른다
- add는 addable vocabulary registry로만 열린다
- capability는 executor vocabulary일 뿐 planning ontology가 아니다
- selection은 object graph를 선택하고, adaptive composition은 object-level retain/modify/remove/add를 만든다
- CTA 부재는 실패 이유가 아니다
- selected reference가 없으면 synthetic composition으로 우회하지 않는다

## 8. Candidate Schema Lock

### 8.1 candidate family

candidate는 primitive raw output이 아니라 worker가 채택/폐기/비교할 수 있는 selection unit이다.

v1 기준 candidate family는 아래 4종으로 고정한다.

- `layout_candidate`
- `copy_candidate`
- `photo_candidate`
- `graphic_candidate`

### 8.2 최소 schema

candidate system은 최소 아래 객체를 가져야 한다.

- `CandidateSet`
- `Candidate`
- `CompareCriteria`
- `RankReason`
- `ChosenCandidate`
- `fallbackIfRejected`

### 8.3 retrieval compatibility

retrieval stage가 나중에 추가되더라도 candidate schema는 그대로 재사용되어야 한다.

즉 아래 흐름이 모두 같은 result family를 만들어야 한다.

### 8.4 photo branch compare criteria

`photo_candidate` 를 compare 할 때는 기존 criteria 외에 아래 criteria 를 추가로 본다.

- `focalSafety`
- `cropSafety`
- `copySeparationSupport`

Phase A 에서는 위 criteria 가 충분하지 않으면 `photo_selected` 가 아니라 `graphic_preferred` 를 선택해야 한다.
즉 `photo` 는 “쓸 수 있으면 쓰는” 옵션이 아니라 “guard 를 통과했을 때만 쓸 수 있는” 옵션이다.

- no retrieval
- metadata search
- semantic search
- rerank

`retrieval` 은 candidate source를 바꾸는 stage일 뿐, candidate contract 자체를 새로 만들면 안 된다.

## 9. Agent Tool / Editor Primitive Hierarchy Lock

### 9.1 계층

아래 계층을 분리한다.

1. structured intent / policy layer
2. agent tool layer
3. candidate layer
4. mutation synthesis layer
5. editor primitive layer

### 9.2 agent tool examples

v1에서 열어 둘 agent tool family 예시는 아래다.

- `layout-block-planner`
- `copy-variant-generator`
- `style-heuristic`
- `asset-search`
- `asset-ranker`
- `vision-judge`

이 중 immediate v1 implementation에서 실제 호출하는 것은 일부일 수 있다.
하지만 catalog와 selection policy는 위처럼 상위 capability 기준으로 설계해야 한다.

### 9.3 editor primitive examples

editor primitive는 아래처럼 낮은 레벨의 canvas 조작 unit이다.

- add text
- add shape
- add group
- add background
- add photo
- add graphic
- add qr
- add barcode
- update style
- replace asset
- delete

planner가 directly primitive를 reasoning vocabulary로 삼는 것은 허용하지 않는다.

## 10. v1 Immediate Implementation Defaults

현재 단계의 immediate implementation default는 아래로 고정한다.

- representative intent는 `empty canvas -> create_template` 1종
- immediate execution은 `background`, `shape`, `text`, `group` 중심
- `photo`, `graphic`, `qr`, `barcode` 는 catalog와 selection policy에는 포함하지만 기본 happy-path execution surface로 강제하지 않음
- `retrievalMode=none`
- critique/refinement는 future-compatible stage로 구조만 유지

## 11. Non-Scope Reminder

아래는 이 문서로 다시 열지 않는다.

- embeddings / RAG actual execution
- multi-agent collaboration
- full image-heavy autonomous generation을 default happy-path로 승격
- 기존 canvas edit/delete를 user-facing northbound flow로 오픈
- planner/runtime을 API sync path 안에 넣는 구조

## 12. References

- [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
- [tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-create-template-spring-vertical-slice.md)
- [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
- [tooldi-agent-workflow-v1-functional-spec-to-be.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-functional-spec-to-be.md)
- [tooldi-agent-workflow-v1-backend-boundary.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-backend-boundary.md)
- [tooldi-agent-workflow-v1-scope-operations-decisions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-scope-operations-decisions.md)
- [tooldi-agent-workflow-v1-next-implementation-roadmap.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-next-implementation-roadmap.md)
