# Tooldi Agent Workflow v1 Create Template Spring Vertical Slice

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1 Create Template Spring Vertical Slice |
| 문서 목적 | `봄 템플릿 만들어줘` intent 1건에 대해 실제 Tooldi 자산과 요소를 어떻게 사용해 템플릿 초안을 만들지 좁은 vertical slice 기준을 고정한다. |
| 상태 | Draft |
| 문서 유형 | Vertical Slice Spec |
| 작성일 | 2026-04-07 |
| 기준 시스템 | `toolditor FE`, `Fastify Agent API`, `BullMQ Worker Runtime`, `existing Tooldi content sources` |
| 기준 데이터 | `tooldi-agent-workflow-v1-template-intelligence-design-lock.md`, `tooldi-natural-language-agent-v1-architecture.md`, `tooldi-agent-workflow-v1-scope-operations-decisions.md`, Toolditor content API / element taxonomy |
| 대상 독자 | PM, FE, Agent Backend, Worker, QA |
| Owner | Ouroboros workflow |

## 1. 문서 성격

- 이 문서는 generic roadmap이 아니라 `봄 템플릿 만들어줘` 1개 intent에 대한 narrow vertical slice spec이다.
- 이 문서는 artifact identity, lifecycle ownership, completion semantics를 재정의하지 않는다.
- 이 문서는 [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md) 의 4축을 실제 intent 1건에 투영하는 역할만 가진다.

## 2. 목표

대표 입력:

- `봄 템플릿 만들어줘`

이 입력에 대해 시스템은 아래를 수행해야 한다.

- 빈 캔버스 기준 `spring promo banner` 초안 1개를 만든다.
- 결과는 Tooldi 편집기에서 바로 수정 가능한 레이어/그룹 기반 템플릿이어야 한다.
- 실제 Tooldi 자산 소스를 사용하되, v1 현재 단계에서는 execution surface를 좁게 유지한다.

이 문서의 핵심 질문은 아래다.

- 어떤 자산 소스를 조회 대상에 넣을 것인가
- 어떤 요소 family를 선택 대상으로 열 것인가
- 어떤 순서와 기준으로 선택할 것인가
- 어떤 것은 v1 immediate execution에서 일부러 제외할 것인가

## 3. Scope Lock

### 3.1 포함

- empty canvas -> create template 1건
- banner/promo 계열 generic spring template
- Tooldi 내부 자산 소스 기반 candidate reasoning
- `background`, `text`, `shape`, `group` 중심 mutation synthesis
- optional `photo` / `graphic` candidate reasoning

### 3.2 제외

- multi-variant generation
- user-facing existing canvas edit/delete
- embeddings / RAG actual execution
- fully autonomous image-heavy composition을 기본 경로로 승격
- QR / barcode 실제 실행
- 외부 SaaS publish/export

## 4. Intent Interpretation Lock

`봄 템플릿 만들어줘` 는 아래 structured intent로 정규화한다.

| field | locked value |
| --- | --- |
| `operationFamily` | `create_template` |
| `templateKind` | `seasonal_sale_banner` |
| `canvasPreset` | active page size 기준. 대표 preset은 `wide_1200x628` |
| `layoutIntent` | `copy_focused` 기본, 단 background 자산 quality가 충분하면 `hero_focused` 허용 |
| `tone` | `bright` + `playful` 사이의 spring promo tone |
| `requiredSlots` | `background`, `headline`, `supporting_copy`, `cta`, `decoration` |
| `assetPolicy` | 기본은 `graphic_allowed`, `photo_optional` |
| `brandConstraints` | palette/typography hint가 있으면 반영, 없으면 generic spring promo defaults 사용 |

추가 규칙:

- 입력에 실제 브랜드명, 할인율, 날짜, 상품명이 없으면 generic promo copy만 사용한다.
- `봄`은 계절 mood constraint이지, 반드시 꽃 사진 사용을 의미하지 않는다.
- 사진보다 도형/graphic만으로 더 안정적이면 그것을 우선한다.

## 5. Tooldi Asset Source Lock

### 5.1 candidate source family

이 vertical slice에서 planner가 인식하는 Tooldi 자산 소스는 아래로 고정한다.

| source family | 실제 Tooldi source | 용도 |
| --- | --- | --- |
| `background_source` | background contents (`pattern`, `image`) | page background candidate |
| `graphic_source` | shapes / creator shapes / element library | 장식 요소, abstract motif, badge block, accent |
| `photo_source` | pictures / creator pictures / optional stock-like photo feed | hero photo, seasonal supporting image |
| `template_source` | existing template metadata | 직접 복제는 금지하되 style prior/reference 용도로만 future-safe하게 열어 둠 |

### 5.2 asset source policy

- v1 immediate execution에서 실제로 기본 사용해야 하는 것은 `background_source` 와 `graphic_source` 다.
- `photo_source` 는 candidate reasoning에는 포함하지만, 기본 mandatory path는 아니다.
- `template_source` 는 이번 vertical slice에서 direct execution source가 아니다. style prior/reference seam으로만 둔다.

### 5.3 photo vs graphic lock

이미지 계열은 아래처럼 분리한다.

- `photo`
  - 일반 사진, 업로드 이미지, picture/image 계열
  - realism, crop, visual focal point에 적합
- `graphic`
  - bitmap, vector, illust, icon, calligraphy bitmap 등 요소 계열
  - decorative motif, accent, abstract spring 표현에 적합

이 구분은 Toolditor 실제 타입/정책과 맞춘다. `photo`와 `bitmap/vector`는 같은 `image`로 취급하지 않는다.

## 6. Selection Strategy Lock

### 6.1 default composition strategy

이 intent의 default composition strategy는 아래 3단계다.

1. background path 결정
2. copy/layout path 결정
3. decoration path 결정

### 6.2 path decision order

#### A. Background path

우선순위:

1. spring-like background pattern
2. spring-toned gradient/color + graphic accent
3. spring photo background

기본값은 `pattern or color+graphic` 이다.

이유:

- 현재 v1 immediate execution surface가 background/shape/text/group에 더 잘 맞는다.
- generic prompt에서 photo를 강제하면 오히려 품질과 일관성이 흔들릴 수 있다.

#### B. Copy/layout path

우선순위:

1. `wide_1200x628` 에서는 left-aligned headline cluster + right decorative field
2. square/story 계열에서는 centered headline + subcopy + CTA
3. badge-led promo block

기본값은 `copy_focused` 이지만, 대표 preset인 `wide_1200x628` 에서는 `copy_left_with_right_decoration` 을 우선한다.

#### C. Decoration path

우선순위:

1. abstract floral/leaf-like graphic motif
2. ribbon/badge/panel
3. optional spring photo support image

기본값은 `graphic-first` 다.

### 6.3 when to use photo

photo는 아래 조건을 만족할 때만 선택 후보로 승격한다.

- current canvas preset에서 hero focal area를 둘 여유가 있음
- headline/readability를 해치지 않음
- generic spring mood를 photo 하나가 더 잘 설명함
- graphic-only composition보다 명확한 이점이 있음

이 조건을 만족하지 않으면 `photo`는 candidate set에 있어도 채택하지 않는다.

## 7. Candidate Schema for This Slice

### 7.1 candidate set

이 vertical slice의 candidate set family는 아래 3개로 고정한다.

- `background_candidate_set`
- `layout_candidate_set`
- `decoration_candidate_set`

### 7.2 candidate minimum fields

각 candidate는 최소 아래 정보를 가져야 한다.

- `candidateId`
- `candidateFamily`
- `sourceFamily`
- `summary`
- `fitScore`
- `selectionReasons`
- `riskFlags`
- `fallbackIfRejected`

### 7.3 compare criteria

candidate compare는 아래 criteria를 기준으로 한다.

- seasonal fit
- readability support
- CTA visibility support
- layout compatibility
- execution simplicity
- fallback safety

즉, 단순 미감 판단만이 아니라 `v1에서 안정적으로 실행 가능한가` 도 ranking 기준에 포함한다.

## 8. Immediate v1 Execution Lock

### 8.1 mandatory execution surface

이 vertical slice에서 immediate v1 execution이 반드시 지원해야 하는 것은 아래다.

- background color / pattern selection
- shape placement
- text placement
- group composition

### 8.2 optional future-facing surface

아래는 candidate reasoning에는 포함하지만 immediate execution mandatory로는 올리지 않는다.

- photo insertion
- graphic bitmap/vector insertion
- QR insertion
- barcode insertion

### 8.3 practical consequence

따라서 이 vertical slice의 첫 번째 실제 구현은 아래처럼 닫는 것이 맞다.

- spring template를 만들되, 결과는 우선 `background + text + shape + group` 만으로도 성립해야 한다.
- 그 이후에 `photo` 나 `graphic` candidate 채택 경로를 점진적으로 연다.

## 9. Mutation Synthesis Lock

최종 mutation synthesis는 아래 slot 구조를 만든다.

- `background`
- `headline`
- `supporting_copy`
- `cta`
- `decoration_primary`
- optional `decoration_secondary`
- optional `badge`

최소 성공 조건:

- required slot 5개는 모두 `ready` 또는 `fallback_ready`
- optional slot은 없어도 된다

기본 spring template mutation 전략:

1. spring-like background
2. headline/subcopy block
3. CTA group
4. decorative shapes/graphics
5. optional polish layer

## 10. Why This Slice Is Meaningful

이 vertical slice는 장난감이 아니라 아래 이유로 실제 의미가 있다.

- Tooldi의 실제 자산 소스와 요소 taxonomy를 기반으로 한다.
- `무엇을 사용할 수 있는가` 와 `언제 무엇을 써야 하는가` 를 분리해 정의한다.
- `photo` 와 `graphic` 을 구분해 later image-heavy path로 확장 가능하다.
- immediate v1 execution은 좁게 유지해 안정성을 지킨다.
- 이후 LLM planner, search, rerank, vision judge를 붙여도 이 문서의 candidate/selection/mutation 구조를 그대로 재사용할 수 있다.

## 11. Next Implementation Mapping

이 vertical slice를 코드로 옮길 때 첫 우선순위는 아래다.

1. `create_template` structured intent 확장
2. `background_candidate_set`, `layout_candidate_set`, `decoration_candidate_set` 생성
3. `graphic-first / photo-optional` selection policy 구현
4. `background + shape + text + group` 기반 spring template mutation synthesis
5. 이후 `photo` 와 `graphic bitmap/vector` 채택 경로를 점진적으로 추가

## 12. References

- [tooldi-agent-workflow-v1-template-intelligence-design-lock.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-template-intelligence-design-lock.md)
- [tooldi-natural-language-agent-v1-architecture.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md)
- [tooldi-agent-workflow-v1-scope-operations-decisions.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-scope-operations-decisions.md)
- [README.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/README.md)
