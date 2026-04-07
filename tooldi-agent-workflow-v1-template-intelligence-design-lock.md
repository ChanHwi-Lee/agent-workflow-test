# Tooldi Agent Workflow v1 Template Intelligence Design Lock

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Template Intelligence Design Lock |
| 문서 목적 | `create_template` happy-path 고도화를 위한 intelligence layer의 v1 설계 기준을 고정한다. |
| 상태 | Draft |
| 문서 유형 | Decision / Spec Lock |
| 작성일 | 2026-04-07 |
| 기준 시스템 | `toolditor FE`, `Fastify Agent API`, `BullMQ Worker Runtime`, `Redis`, `existing internal tool adapters` |
| 기준 데이터 | `tooldi-natural-language-agent-v1-architecture.md`, `tooldi-agent-workflow-v1-functional-spec-to-be.md`, `tooldi-agent-workflow-v1-backend-boundary.md`, `tooldi-agent-workflow-v1-scope-operations-decisions.md`, `README.md` |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA |
| Owner | Ouroboros workflow |

## 1. 문서 성격

- 이 문서는 `create_template` intelligence layer의 vocabulary, phase boundary, selection policy를 잠그는 sibling authority 문서다.
- 이 문서는 artifact identity, counted completion moment, lifecycle ownership, FE/BE control-plane split을 재정의하지 않는다.
- sibling 문서와 충돌이 나면 아래 순서를 따른다.
  1. `tooldi-natural-language-agent-v1-architecture.md`
  2. `tooldi-agent-workflow-v1-functional-spec-to-be.md`
  3. `tooldi-agent-workflow-v1-backend-boundary.md`
  4. `toolditor-agent-workflow-v1-client-boundary.md`
  5. `tooldi-agent-workflow-v1-scope-operations-decisions.md`
  6. 이 문서

즉, 이 문서는 위 문서들이 이미 잠근 ownership/scope 위에서 `template intelligence` 관련 세부 기준만 닫는다.

## 2. 목적

이 문서가 잠그는 것은 아래 4가지다.

1. Tooldi 요소 capability catalog
2. `create_template` intent -> tool selection policy
3. search / compare / select candidate schema
4. agent tool / editor primitive hierarchy

핵심 질문은 "LLM이 무엇을 알아야 적절한 툴과 요소를 고를 수 있는가" 이다.

이 질문의 답은 단순 기능 설명서가 아니라 아래 3종을 함께 정의하는 것이다.

- 무엇이 존재하는가
- 무엇을 할 수 있는가
- 언제 무엇을 써야 하는가

## 3. v1 고정 전제

### 3.1 happy-path 우선

- v1 현재 단계의 우선순위는 recovery 고도화보다 happy-path intelligence 고도화다.
- 따라서 첫 구현 기준은 `더 적절한 요소 선택`, `더 나은 structured plan`, `더 설명 가능한 selection trace` 다.

### 3.2 전체 문서화, 핵심만 실행

- capability catalog는 `background`, `text`, `shape`, `group`, `photo`, `graphic`, `qr`, `barcode` 까지 모두 포함한다.
- 하지만 immediate v1 implementation / happy-path execution surface는 계속 `background`, `shape`, `text`, `group` 중심으로 유지한다.
- `photo`, `graphic`, `qr`, `barcode` 는 catalog와 future selection policy에는 포함하지만, 기본 happy-path 실행 요구사항으로는 올리지 않는다.

### 3.3 retrieval은 구조만 열고 실행은 잠근다

- `embeddings / RAG` 는 여전히 v1 제품 범위 밖이다.
- 다만 전체 pipeline은 `optional retrieval stage` 를 later-addable seam 으로 가진다.
- v1 default는 `retrievalMode=none` 이다.
- 이후 metadata search, semantic search, rerank는 같은 stage contract에 꽂을 수 있어야 한다.

### 3.4 multi-agent는 열지 않는다

- planner, selector, judge, vision evaluator는 logical phase일 뿐 독립 actor 협업 구조가 아니다.
- v1은 single-run / single-worker mental model을 유지한다.

## 4. Template Intelligence Canonical Pipeline

`create_template` intelligence pipeline은 아래 순서로 고정한다.

1. ingress
2. grounding / context pack
3. normalized intent
4. executable plan
5. optional retrieval stage
6. candidate compare / select
7. mutation synthesis
8. optional critique / refinement
9. finalize

추가 규칙:

- retrieval stage와 critique/refinement stage는 optional 이지만, stage slot 자체는 구조에 포함한다.
- planner와 selector는 retrieval result가 없는 경우에도 동작 가능한 fallback path를 가져야 한다.
- editor primitive는 `mutation synthesis` 이후에만 직접 등장해야 한다.
- backend API 프로세스 안에서 planner/model/tool를 직접 실행하면 안 되고, execution-plane worker가 이 pipeline을 소유한다.

## 5. Capability Catalog Lock

### 5.1 목적

capability catalog는 사용자 문서가 아니라 machine-readable selection 기준이다.

각 요소 family는 최소 아래 필드를 가져야 한다.

- `familyId`
- `displayName`
- `description`
- `primaryUseCases`
- `requiredInputs`
- `optionalInputs`
- `styleControls`
- `supportedOperations`
- `constraints`
- `failureModes`
- `v1CatalogStatus`
- `v1ExecutionStatus`

### 5.2 요소 family

v1 capability catalog의 top-level family는 아래로 고정한다.

| family | 의미 | v1 catalog | immediate v1 execution |
| --- | --- | --- | --- |
| `background` | 페이지 배경, 배경색, 배경 패턴, 배경 이미지 slot | 포함 | 제한적 포함 |
| `text` | headline, supporting copy, badge, footer note 등 텍스트 계열 | 포함 | 포함 |
| `shape` | rect, ellipse, polygon, line 등 도형 계열 | 포함 | 포함 |
| `group` | CTA, badge block, composite decoration 등 그룹 계열 | 포함 | 포함 |
| `photo` | 업로드/검색/사진 추가로 들어오는 사진 계열 | 포함 | future-facing |
| `graphic` | bitmap/vector/illust/icon/calligraphy bitmap 등 요소 계열 | 포함 | future-facing |
| `qr` | QR code 요소 | 포함 | future-facing |
| `barcode` | barcode 요소 | 포함 | future-facing |

### 5.3 image taxonomy lock

`image` 라는 단일 family로 묶지 않고 아래처럼 분리한다.

- `photo`
  - 사진, 업로드 이미지, 검색 이미지, 일반 picture/image 계열
  - realism, crop, AI photo editing, stock-search candidate와 더 가깝다
- `graphic`
  - bitmap, vector, illust, icon, calligraphy bitmap 같은 요소 계열
  - 장식성, 조형성, 시각 기호성, 요소 라이브러리 재사용과 더 가깝다

이 구분을 고정하는 이유:

- Toolditor 내부에서도 `photo`와 `bitmap/vector`는 실제로 다른 정책과 진입 조건을 가진다.
- selection policy, AI eligibility, future retrieval source가 다르므로 하나의 `image` family로 합치면 안 된다.

### 5.4 요소 family별 operation matrix

각 family는 `존재하는가`만이 아니라 `무엇을 할 수 있는가`를 가져야 한다.

최소 operation 분류는 아래로 고정한다.

- `create`
- `update_style`
- `update_content`
- `replace_asset`
- `group_into`
- `ungroup`
- `set_background`
- `delete`

단, v1 사용자-visible scope가 아닌 runtime/internal operation은 catalog에 존재할 수 있다.

## 6. Structured Intent Lock

### 6.1 `create_template` intent 기본 shape

`create_template` 는 단일 string prompt 해석으로 끝나지 않고, 최소 아래 structured field로 정규화되어야 한다.

- `templateKind`
- `canvasPreset`
- `layoutIntent`
- `tone`
- `requiredSlots`
- `brandConstraints`
- `assetPolicy`

### 6.2 field semantics

| field | 의미 |
| --- | --- |
| `templateKind` | `promo_banner`, `announcement_banner`, `coupon_banner`, `seasonal_sale_banner` 같은 결과물 유형 |
| `canvasPreset` | `square_1080`, `story_1080x1920`, `wide_1200x628` 같은 canvas class |
| `layoutIntent` | `hero_focused`, `copy_focused`, `product_focused` 같은 레이아웃 성격 |
| `tone` | `bright`, `premium`, `playful`, `minimal` 같은 시각 톤 |
| `requiredSlots` | happy-path 최소 충족 slot 목록 |
| `brandConstraints` | palette, typography hint, forbidden style 같은 브랜드 제약 |
| `assetPolicy` | `shapes_only`, `photo_allowed`, `graphic_allowed`, `brand_assets_only` 같은 asset 사용 규칙 |

### 6.3 required slot baseline

`create_template` v1 minimum required slot은 아래 5개로 고정한다.

- `background`
- `headline`
- `supporting_copy`
- `cta`
- `decoration`

추가 slot은 선택적으로 존재할 수 있지만, v1 representative happy-path는 위 5개를 기준으로 평가한다.

## 7. Tool Selection Policy Lock

### 7.1 원칙

- planner는 editor primitive를 직접 selection unit으로 취급하면 안 된다.
- planner는 먼저 상위 agent tool / selection policy를 통해 방향을 정하고, 마지막에 primitive mutation으로 내려가야 한다.
- 즉, `text`, `shape`, `image` 는 editor primitive family이고, `layout planner`, `copy chooser`, `asset ranker` 는 agent tool family다.

### 7.2 selection input

selection은 최소 아래 입력을 본다.

- normalized intent
- context pack
- allowed tool registry
- current execution policy
- retrieval result 또는 empty retrieval fallback

### 7.3 selection output

selection 단계는 최소 아래 결과를 남겨야 한다.

- chosen tool or path
- considered candidate set
- compare criteria
- rank reason
- final chosen candidate

즉, selection은 black-box 결론이 아니라 `candidate set -> explicit comparison -> chosen candidate` 구조를 남겨야 한다.

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
