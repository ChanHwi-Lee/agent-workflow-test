# Tooldi Agent Workflow v1.5 Create Template Hardening Spec (Source-Grounded TO-BE)

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Tooldi Agent Workflow v1.5 Create Template Hardening Spec (Source-Grounded TO-BE) |
| 문서 목적 | 현재 generic `create_template` skeleton 위에 실제 Tooldi taxonomy와 asset prior를 반영한 planner/search/judge hardening 요구사항을 정의한다. |
| 상태 | Draft |
| 문서 유형 | TO-BE |
| 작성일 | 2026-04-09 |
| 기준 시스템 | `Fastify Agent API`, `BullMQ Worker + LangGraph Runtime`, `LangChain JS planner`, `Google Gemini`, Tooldi PHP API, `tooldi_dev` MariaDB, AWS S3 asset buckets |
| 대상 독자 | PM, Agent Backend, Worker, FE, QA, Reviewer |
| 근거 Seed | `seed_f9f26b79eed4` |

## 1. Purpose

- 이 문서는 현재 `create_template` v1 skeleton 이 가진 planner/search/judge 품질 부족을 실제 Tooldi 데이터 구조에 grounded된 방식으로 보강하기 위한 구현 기준을 정의한다.
- 이 문서는 현재 구조를 뒤엎지 않는다.
- 이 문서는 아래 4개를 구체화한다.
  - planner ontology v2
  - deterministic normalize/repair layer
  - search profile v2
  - rule judge v2 + release eval contract

## 2. Background

현재 구현은 `Fastify + BullMQ + LangGraph + LangChain JS + Gemini` 조합으로 end-to-end 동작한다. artifact chain도 이미 존재한다.

- `normalized-intent`
- `search-profile`
- `candidate-set`
- `selection-decision`
- `typography-decision`
- `rule-judge-verdict`
- `executable-plan`

하지만 실제 manual run에서는 아래 문제가 확인됐다.

- `domain=fashion_retail`
- `facets.menuType=food_menu`
- `search-profile.photo.keyword=메뉴`
- 실제 editor 결과는 음식 사진 hero
- `rule_judge.recommendation=keep`

즉 현재 가장 큰 문제는 프레임워크 선택이 아니라 `planner ontology`, `deterministic invariant`, `judge contradiction rule` 이 실제 Tooldi taxonomy에 충분히 grounded되지 않은 점이다.

## 3. Scope

### 3.1 In Scope

- `empty_canvas -> create_template` hardening
- `NormalizedIntentDraft -> NormalizedIntent` deterministic normalization
- actual Tooldi taxonomy 기반 `SearchProfile v2`
- `template/theme/asset` prior를 반영한 ranking direction
- `ruleJudge v2` contradiction detection
- fixed eval-set과 release bar 정의

### 3.2 Out of Scope

- public multi-turn memory
- semantic retrieval/vector DB 실제 연결
- vision model judge
- actual second-pass refine mutation loop
- existing-canvas edit/delete user surface
- editor picture seam canonicalization
- save evidence fully productionized integration

## 4. Actors and Preconditions

| Actor | Description |
| --- | --- |
| User | 빈 캔버스에서 자연어로 템플릿 생성을 요청한다. |
| LangChain planner | natural language를 `NormalizedIntentDraft`로 구조화한다. |
| Deterministic normalizer | draft를 canonical `NormalizedIntent`로 보정하고 contradiction flag를 남긴다. |
| Search profile builder | real Tooldi query surface에 맞는 family별 query plan을 만든다. |
| Candidate selector | template/theme/asset prior를 함께 고려해 후보를 선택한다. |
| Rule judge | semantic contradiction, primary signal drift, execution safety를 평가한다. |

Preconditions:

- public entrypoint는 계속 `empty_canvas -> create_template` only 다.
- worker orchestration은 `LangGraph` graph를 유지한다.
- provider abstraction은 `LangChain JS`를 유지한다.
- canonical run/audit source는 backend row/object store를 유지한다.

## 5. Source-Grounded Evidence Basis

이 문서의 TO-BE 요구는 아래 실제 evidence를 기준으로 한다.

### 5.1 Real inventory scale

`tooldi_dev` 기준:

- `default_shape`: `1,567,139`
- `picture`: `185,571`
- `template`: `197,314`
- `background`: `740`
- `default_font`: `1,538`

active/usable inventory도 shape 쪽이 압도적이다.

- `default_shape` active: `1,490,805`
- `picture` active: `164,086`
- `template` active: `131,187`

### 5.2 Real taxonomy

`category` 기준:

- `default_shape`
  - `3004` 비트맵 요소
  - `3001` 벡터요소
  - `3012` 캘리그라피
  - `3002` 아이콘
  - `3005` 프레임
  - `3006` 조합 텍스트
  - `3007` 워드아트
  - `3009` 사진 콜라쥬
- `picture`
  - `0001` 사진
- `background`
  - `0001` 패턴
  - `0002` 사진
- `template`
  - `0001` 프레젠테이션
  - `0002` 포스터
  - `0006` 웹배너

### 5.3 Real search surface

PHP controllers 기준:

- picture search
  - `keyword`
  - `type=pic|rmbg`
  - `format=square|horizontal|vertical`
  - `price`
  - `sort`
  - `owner`
  - `theme`
- shape search
  - `keyword`
  - `type=vector|bitmap`
  - `price`
  - `sort`
  - `owner`
  - `theme`
  - `method=ai|creator`
- font load
  - category/language/weight inventory

### 5.4 Theme prior exists

`contents_theme` active count:

- `template`: `8`
- `shape`: `6`
- `picture`: `6`

즉 Tooldi는 단순 keyword search만이 아니라 curated `theme` prior도 실제로 가진다.

## 6. Use Cases

### UC-01. shape/vector-heavy 결과를 정상 성공 경로로 처리한다

1. 사용자는 `패션 리테일 봄 세일 배너 만들어줘`를 입력한다.
2. planner는 fashion retail / sale intent를 draft한다.
3. normalizer는 `shape/vector/graphic` 중심 결과를 정상 허용한다.
4. search profile은 photo를 강제하지 않고, shape/theme/template prior를 먼저 반영할 수 있다.
5. 결과가 shape/vector-heavy여도 wrong-domain drift가 없으면 정상 success다.

### UC-02. weak contradiction은 repair-first로 처리한다

1. draft에서 subject keyword나 promotion style이 약하게 흔들린다.
2. normalizer가 보정 가능한 필드를 repair한다.
3. repair 후 coherent result를 만들 수 있으면 run은 계속 진행된다.

### UC-03. primary signal drift만 hard reject 또는 warning escalation한다

1. draft/selection 결과가 다른 도메인 의미로 강하게 기울어질 수 있다.
2. judge는 `primary message`, `primary visual`, `search profile`의 일관성을 본다.
3. repair 후에도 복구 불가능하면 hard reject, 복구 가능하지만 imperfect하면 warning으로 처리한다.

## 7. Functional Requirements

### 7.1 Planner output must become a draft, not final truth

- The system must treat the LangChain model output as `NormalizedIntentDraft`, not as the final canonical intent.
- The system must separate `LLM draft generation` from `deterministic canonicalization`.

### 7.2 Ontology must reflect real Tooldi source structure

- The system must expand the current planner vocabulary beyond `domain`, `campaignGoal`, `layoutIntent`, `menuType`.
- The system must represent at least:
  - `themeHints`
  - `subjectHints`
  - `offerMode`
  - `contentTypePreference`
  - `format/orientation preference`
  - `method preference`
  - `price sensitivity`
  - `template prior eligibility`

### 7.3 Asset policy must be flexible, not single-family forcing

- The system must not force `photo` or `graphic` as a single dominant family through a single enum.
- The system must represent asset policy as a flexible structure.

Minimum structure:

- `allowedFamilies`
- `preferredFamilies`
- `primaryVisualPolicy`
- `avoidFamilies`

- The system must treat shape/vector-heavy outputs as first-class normal success paths.

### 7.4 Domain must be a weighting signal, not a family ban

- The system must not rigidly ban asset families by `domain`.
- The system must use domain primarily as a ranking and contradiction signal together with:
  - `theme`
  - `subject`
  - `primary visual`
  - `offer mode`

### 7.5 Deterministic normalize/repair layer must exist

- The system must add a deterministic normalization step between planner draft generation and search-profile building.
- The system must produce:
  - repaired canonical intent
  - `consistencyFlags`
  - `normalizationNotes`
- The system must auto-repair weak field drift when the overall domain meaning is still coherent.

Weak drift includes:

- `searchKeywords` drift
- `promotionStyle` drift
- subject keyword normalization drift

### 7.6 SearchProfile v2 must use the actual Tooldi query surface

- The system must build `SearchProfile` from the repaired canonical intent, not directly from raw planner draft fields.
- The system must support actual source filters where available.

Minimum required query dimensions:

- picture:
  - `keyword`
  - `theme`
  - `type`
  - `format`
  - `price`
  - `owner`
- shape:
  - `keyword`
  - `theme`
  - `type`
  - `method`
  - `price`
  - `owner`
- background:
  - `pattern vs photo`
- font:
  - `language`
  - `category`
  - `weight`
- template prior:
  - `theme`
  - keyword/theme match

### 7.7 Template and theme prior must become first-class retrieval inputs

- The system must consider `template`, `contents_theme`, and asset inventory as three distinct prior layers.
- The system must allow `template/theme prior -> asset selection` rather than only direct asset search.
- The system must not assume direct asset search alone is sufficient for high-quality template generation.

### 7.8 Judge v2 must detect semantic drift

- The system must extend `ruleJudge` to inspect semantic coherence, not only execution safety and simple layout mismatch.

Minimum new rules:

- `domain_subject_mismatch`
- `theme_domain_mismatch`
- `search_profile_intent_mismatch`
- `primary_signal_drift`
- `photo_subject_drift`
- `asset_policy_conflict`
- `template_prior_conflict`

### 7.9 Contradiction policy must be repair-first

- The system must default to `repair first`.
- The system must escalate to `warning` only when the result remains usable.
- The system must reserve `hard reject` for fundamentally unsafe or impossible cases only.

Hard reject examples:

- mandatory executable asset metadata is incomplete or impossible
- required slots cannot be materialized into any safe final plan
- after repair, primary message and primary visual still point to incompatible meanings that cannot be resolved without inventing facts

### 7.10 Eval contract must be fixed

- The system must use a fixed eval set of exactly `24` prompts.
- Distribution:
  - `restaurant 6`
  - `cafe 6`
  - `fashion retail 6`
  - `general marketing 6`
- Release readiness requires:
  - `0 hard rejects`
  - `warning rate < 20%`
  - no wrong-domain primary visual drift

## 8. Business Rules

- `shape/vector/graphic` 중심 결과는 정상 성공 경로다.
- photo는 optional일 수 있고, graphic fallback은 degraded가 아니라 safe success일 수 있다.
- `brand palette missing`, `typography hint missing`, `photo-preferred -> safe graphic fallback`은 warning 허용 항목이다.
- `wrong-domain primary signal`은 warning 또는 hard reject escalation 대상이다.
- `domain`은 금지 규칙이 아니라 weighting signal이다.

## 9. Interfaces

### 9.1 Internal planner output

The system must define a `PlannerOutputDraft` or equivalent schema that is narrower than a final canonical intent and explicitly marked as draft/intermediate output.

### 9.2 Internal normalized intent

The system must define `NormalizedIntent v2` with at least:

- `domain`
- `campaignGoal`
- `layoutIntent`
- `themeHints`
- `subjectHints`
- `requiredSlots`
- `assetPolicy`
- `searchConstraints`
- `consistencyFlags`
- `normalizationNotes`

### 9.3 Search profile artifact

The system must define `SearchProfile v2` as a real source query contract rather than a keyword-only summary.

### 9.4 Judge verdict

The system must carry contradiction reasons in `rule-judge-verdict` so the final outcome can be classified as:

- `completed`
- `completed_with_warning`
- `failed`

## 10. Data Requirements

The hardening design must remain grounded in these data sources:

- MariaDB `tooldi_dev`
  - `picture`
  - `default_shape`
  - `background`
  - `template`
  - `default_font`
  - `contents_theme`
  - `category`
  - `search_keyword_types`
  - `summary_contents`
- Tooldi PHP API endpoints
  - `Picture::index`
  - `Shape::index`
  - `Editor::loadFont`
- S3 buckets/prefixes
  - `dev-file.tooldi.com/picture`
  - `dev-file.tooldi.com/shape`
  - `dev-file.tooldi.com/background`
  - `dev-file.tooldi.com/template`
  - `font.tooldi.com`

## 11. Error Handling

| Case | System Handling |
| --- | --- |
| weak field drift | deterministic repair |
| safe graphic/vector fallback | warning + continue |
| wrong-domain but repairable primary signal | repair, then warning if still imperfect |
| wrong-domain and irrecoverable primary signal | hard reject |
| missing executable metadata | hard reject |
| impossible required slots | hard reject |

## 12. Non-Functional Requirements

- The system must preserve the current structured artifact chain.
- The system must not replace the LangGraph orchestration runtime.
- The system must not replace LangChain JS with provider-specific direct calls.
- The system must keep release evaluation deterministic and reviewer-repeatable.

## 13. Open Questions

| ID | Question |
| --- | --- |
| OQ-001 | `primaryVisualPolicy`를 enum으로 둘지, ordered preference list로 둘지 |
| OQ-002 | `template prior`, `theme prior`, `asset prior` 중 어느 것을 가장 강하게 ranking에 반영할지 |
| OQ-003 | `repair` 허용 범위를 어디까지 둘지 |

## 14. Risks / Design Debt

| ID | Item | Impact |
| --- | --- | --- |
| KD-001 | planner schema가 실제 Tooldi taxonomy보다 너무 작으면 contradiction이 계속 재발한다 | High |
| KD-002 | normalize/repair가 없으면 잘못된 facet 하나가 search profile 전체를 오염시킨다 | High |
| KD-003 | judge가 primary signal drift를 못 잡으면 wrong-domain result가 계속 통과한다 | High |
| KD-004 | template prior를 안 쓰면 Canva류 품질과 격차가 계속 유지될 가능성이 높다 | Medium |

## 15. Implementation Trace

Verified source files and systems:

- `/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Picture.php`
- `/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Shape.php`
- `/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Editor.php`
- `/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/config/database.php`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/packages/agent-llm/src/templatePlanner.ts`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/buildSearchProfile.ts`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/ruleJudge.ts`
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/packages/tool-adapters/src/catalog/tooldiCatalogSourceClient.ts`
- MariaDB `tooldi_dev`
- AWS S3 buckets `dev-file.tooldi.com`, `font.tooldi.com`, `dev-asset.tooldi.com`

Directly verified evidence snapshots:

- `default_shape`: `1,567,139`
- `picture`: `185,571`
- `template`: `197,314`
- `background`: `740`
- `default_font`: `1,538`
- `contents_theme`: `template 8`, `shape 6`, `picture 6`
