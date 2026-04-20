# Tooldi Agent Workflow — Template-Aware Adaptive Composition (Historical)

> ⚠️ **SUPERSEDED 2026-04-20** — 이 문서는 더 이상 normative authority가 아니다.
>
> 현재 설계 철학/파이프라인 SSOT는 [`tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md`](./tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md) 다.
>
> 아래 A1~A5 axiom, retain/modify/remove/add decision DSL, addable vocabulary registry, projected template object graph 개념은 **전부 폐기**되었다. 이 문서는 adaptive composition 시도의 배경을 이해할 때만 참조하라.

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Template-Aware Adaptive Composition SSOT (Historical) |
| 문서 목적 | 에이전트 워크플로우의 설계 철학과 아키텍처 계약을 확정하고, 모든 후속 개발의 기준선(Single Source of Truth)으로 삼는다. |
| 상태 | **Historical — 2026-04-20자로 v5 SSOT에 의해 대체됨** |
| 작성일 | 2026-04-16 |
| 대상 시스템 | `agent-workflow-test/tooldi-agent-runtime` (agent-worker, agent-api), `toolditor` (FE agent-workflow-spike) |
| 대상 독자 | Agent Backend, FE, PM, QA, Reviewer |
| 소유 | Agent Workflow 팀 |

### 이 문서가 대체하는 문서

| 문서 | 상태 변경 |
| --- | --- |
| `tooldi-agent-workflow-vnext-object-native-reference-architecture.md` | **Historical context** — 이 SSOT에 의해 대체됨. object-native 전환 동기와 배경 참고용으로만 유효. |
| `tooldi-agent-workflow-v4-topology-driven-editor-native-architecture.md` | **Historical context** — 이 SSOT에 의해 대체됨. topology-driven 제안 참고용으로만 유효. |

### 이 문서가 대체하지 않는 문서

- `tooldi-agent-workflow-v1-create-template-current-state-as-is.md` — AS-IS 현재 구현 상태. 이 SSOT와 비교하여 gap을 식별할 때 참조.
- `tooldi-agent-workflow-v1-backend-boundary.md` — backend/worker/queue/store 경계. 이 SSOT의 인프라 불변량과 정합성을 유지해야 함.
- `toolditor-agent-workflow-v1-client-boundary.md` — FE 적용 경계. Canvas Mutation Protocol 계약 참조.
- `tooldi-agent-workflow-v1-functional-spec-to-be.md` — public/API/persistence projection. 이 SSOT의 completion contract에 맞춰 업데이트 필요.

---

## 1. 철학 정의 — Template-Aware Adaptive Composition

### 1.1 원라인 정의

> **시스템은 선택된 reference template의 editable object graph를 1차 진실로 읽고, LLM은 그 graph의 요소를 유지/수정/제거할지 결정하며, 필요한 경우에만 제한된 addable vocabulary를 통해 새 요소 추가를 지시한다. executor는 이를 editor-native node graph로 물화하고, completion은 editability/renderability/save truth로 판정한다.**

### 1.2 다섯 가지 Axiom

이 axiom들은 **잠금(locked)** 상태이다. 모든 코드 변경, PR, 설계 결정은 이 axiom에 위배되지 않는지 검증되어야 한다.

| # | Axiom | 의미 |
| --- | --- | --- |
| A1 | **Template object graph가 구조의 1차 진실이다** | 선택된 템플릿이 이미 가진 오브젝트 구조(레이아웃, 요소 배치, 시각적 위계)가 디자인 구조의 출발점이다. semantic slot(headline, cta 등)이 구조를 결정하지 않는다. |
| A2 | **LLM은 "무엇을" 결정하고, 코드는 "어떻게"를 결정한다** | LLM은 각 요소의 운명(유지/수정/제거/추가)과 content(텍스트, 의도)를 결정한다. 코드는 geometry normalization, node emission, renderability guard, save/finalize를 결정한다. |
| A3 | **retain/modify/remove는 template graph에서 도출되고, add는 별도 registry를 참조한다** | 기존 요소에 대한 결정은 템플릿이 가진 것에서 자연스럽게 나온다. 새 요소 추가만 별도의 addable vocabulary registry를 통해 통제된다. |
| A4 | **Completion = editability + renderability + save truth** | 완료 판정은 모든 오브젝트가 편집 가능하고, 렌더링 가능하며, 저장이 확인된 상태로 한다. named-slot completeness(headline이 있는지, cta가 있는지)는 completion 기준이 아니다. |
| A5 | **Capability는 execution vocabulary이고, topology는 transitional adapter이다** | 둘 다 planning ontology가 아니다. capability는 executor가 발행할 수 있는 것의 어휘이고, topology는 현재 단계의 전이적 구현 전략이다. |

### 1.3 금지 패턴 (Anti-patterns)

아래 패턴은 이 SSOT가 명시적으로 금지한다. 코드 리뷰에서 이 패턴이 발견되면 반려 사유가 된다.

| 금지 패턴 | 왜 금지하는가 |
| --- | --- |
| 고정 슬롯 스키마를 completion truth로 사용 | v2/v3에서 `requiredExecutionSlots = ["background","headline","offer_line","cta"]`가 모든 템플릿에 동일한 구조를 강제했다. A1, A4 위반. |
| capability catalog을 planning ontology로 격상 | capability는 executor의 실행 어휘이지, LLM이 계획을 세우는 상위 개념이 아니다. 격상하면 slot의 이름만 바뀐 재포장이 된다. A5 위반. |
| reference를 못 찾았다고 from-scratch synthetic composition으로 도망감 | reference-first 원칙을 버리고 heuristic layout 조립으로 되돌아가면 다시 slot/threshold/fallback tuning 지옥으로 돌아간다. A1, A3, A4 위반. |
| LLM이 레이아웃/지오메트리를 결정 | anchor 좌표, emphasis 수준, z-order, font sizing을 LLM이 지정하면 LLM에게 그래픽 디자이너 역할을 기대하게 된다. A2 위반. |
| refine을 primary quality mechanism으로 사용 | refine은 bounded secondary pass이다. 초안 품질은 adaptive composition 결정의 질에서 나와야 한다. |
| threshold micro-tuning, fallback polish, prompt-specific exception | v2에서 이런 패치가 축적되어 시스템의 일관성을 무너뜨렸다. 구조적 해결이 아닌 지엽적 조정은 금지. |
| named-slot completeness regression | slot 이름이 바뀌어도(execution slot → capability → topology role) 본질이 같으면 같은 문제를 만든다. A4 위반. |

---

## 2. 개념 모델 — 네 개의 레이어

시스템은 네 개의 레이어로 구성된다. 각 레이어는 명확한 입력/출력 경계를 가지며, 레이어 간 책임 침범이 이 문서의 axiom 위반이다.

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Intent & Message Atoms                            │
│  사용자 프롬프트 → semantic brief → message atoms            │
│  (느슨한 hint, 실행 진실 아님)                                │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Template Object Graph (Reference Truth)           │
│  선택된 템플릿의 Fabric.js 오브젝트 → projected format        │
│  (구조의 1차 진실 — A1)                                      │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: LLM Decision (Adaptive Composition)               │
│  projected graph + atoms → retain/modify/remove/add 결정     │
│  ("무엇을" — A2)                                             │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Executor (Code-Driven Materialization)            │
│  결정 → canvas mutation → renderability guard → save         │
│  ("어떻게" — A2)                                             │
└─────────────────────────────────────────────────────────────┘
```

### Layer 1: Intent & Message Atoms

사용자의 프롬프트에서 시스템이 추출하는 의미 단위이다.

- **범위**: 사용자가 원하는 것의 의미적 요약 (domain, campaign goal, 핵심 메시지)
- **산출물**: message atoms — primary(핵심 메시지), offer(혜택/프로모 문구), cta(행동 유도 문구), detail(부가 정보) 등
- **현재 코드**: `plan_intent_draft` → `normalize_intent` → `CanonicalDesignIntent` → copy plan
- **중요**: message atoms는 **느슨한 semantic hint**이다. "primary atom이 있으니까 headline slot이 있어야 한다"는 추론을 해서는 안 된다. atom은 content의 씨앗이지 layout 구조의 요구사항이 아니다.

### Layer 2: Template Object Graph (Reference Truth)

선택된 reference 템플릿의 실제 오브젝트 구조를 읽어 중간 표현(projected format)으로 변환한 것이다.

- **입력**: Fabric.js 직렬화 JSON (template prior bundle에서 가져온 fetchedDocument.pages[0].parsed)
- **산출물**: projected object graph — 각 오브젝트의 layerType, bounds, text, fontSize, fill 등 관찰 가능한 속성 + computable annotation (visualWeight, zone)
- **핵심 원칙**:
  - semantic role classification(display_text, promo_surface, action_surface 등)을 **이 레이어에서 부여하지 않는다**
  - 오브젝트가 "무엇인지"는 LLM이 Layer 3에서 판단한다
  - 이 레이어는 "무엇이 있는지"만 보고한다
- **상세**: Section 3 참조

### Layer 3: LLM Decision (Adaptive Composition)

LLM이 projected graph와 message atoms를 함께 보고, 각 오브젝트의 운명을 결정하는 레이어이다.

- **입력**: projected template object graph + message atoms + canvas dimensions + style context
- **산출물**: element-level decisions (retain/modify/remove) + add decisions (addable vocabulary 참조)
- **핵심 원칙**:
  - LLM은 "이 텍스트를 유지하되 내용을 바꾼다", "이 도형을 제거한다", "CTA 버튼을 추가한다" 수준의 결정을 한다
  - LLM은 정확한 좌표, scale, z-order, font sizing을 결정하지 **않는다** (A2)
  - add는 addable vocabulary registry에 등록된 항목에서만 가능하다 (A3)
- **상세**: Section 4 참조

### Layer 4: Executor (Code-Driven Materialization)

LLM의 결정을 editor-native canvas mutation으로 물화하고, 품질 guard를 적용하는 레이어이다.

- **입력**: LLM composition decisions + template object graph (geometry 참조용)
- **산출물**: canvas mutation commands (createLayer / updateLayer / deleteLayer) → SSE → FE 적용
- **핵심 원칙**:
  - geometry normalization (bounds 계산, scale 적용, origin 보정)은 코드가 한다
  - renderability guard (canvas bounds 초과, critical overlap, text overflow)는 코드가 한다
  - 새 오브젝트의 placement (좌표 결정)은 코드가 template context를 보고 한다
  - save/finalize chain은 코드가 닫는다
- **현재 코드**: `prepare_execution` → `emit_stage` → `await_ack` loop → `save` → `finalize`

---

## 3. Template Object Graph — Projected Format

### 3.1 왜 raw Fabric.js JSON을 LLM에 직접 넘기지 않는가

템플릿의 원본 Fabric.js JSON은:
- 20개 이상의 오브젝트가 group 내 group으로 중첩될 수 있다
- `scaleX`, `scaleY`, `originX`, `originY` 등의 transform이 실제 시각적 bounds와 다르다
- gradient, clipPath, filter 등의 정보가 토큰을 대량으로 소비한다
- 시각적으로 의미 없는 invisible/off-canvas 오브젝트가 포함될 수 있다

따라서 중간 표현(projected format)이 필요하다.

### 3.2 Projected Format 원칙 (잠금)

| 원칙 | 설명 |
| --- | --- |
| **관찰 가능한 속성만 포함** | layerType, 실효 bounds(scale/origin이 적용된 최종 좌표), sourceText, fontSize, fillColorHex, fontFamily, textAlign |
| **semantic role classification 없음** | `kind: "display_text"` / `kind: "promo_surface"` 같은 강제 분류를 하지 않는다. 오브젝트가 headline인지 CTA인지는 이 레이어에서 판단하지 않는다. |
| **computable annotation만 포함** | `visualWeight`(dominant/secondary/tertiary/decorative/background) — bounds 면적 × fontSize × 위치 prominence에서 계산. `zone`(center/top/bottom/left/right/corner) — canvas 대비 상대 위치에서 계산. 이들은 관찰에서 도출되는 힌트이지, role assignment가 아니다. |
| **flat list** | group hierarchy를 재귀적으로 풀어서 flat list로 만든다. group 자체가 의미 있는 컨테이너(예: shape+text로 구성된 버튼)인 경우, 그 관계를 composite annotation으로 표시할 수 있다. |
| **invisible/off-canvas 오브젝트 제외** | canvas bounds 밖이거나 opacity 0인 오브젝트는 projected graph에 포함하지 않는다. |

### 3.3 재사용 가능한 기존 로직

현재 `buildReferenceResetPath.ts`의 `extractReferenceBlockGraph` 함수가 이미 하는 것:
- `flattenObjects()` — group hierarchy를 재귀적으로 풀어 flat list로 만듦
- `isTextLikeObject()` — text, textbox, i-text 타입 식별
- `readBounds()` — width/height/left/top을 읽고 실효 bounds 계산
- `readText()`, `readEffectiveFontSize()`, `readFillColor()` — 텍스트/스타일 추출
- prominence 계산 로직 — bounds 면적과 fontSize 기반

**제거해야 할 것**: `classifyTextBlock()`, `classifySurfaceBlock()` — 오브젝트를 `ReferenceBlockKind`(display_text/promo_surface/action_surface/decor_cluster)로 강제 분류하는 단계.

**추가해야 할 것**: `computeVisualWeight()`, `computeZone()` — semantic role 없이 시각적 위계와 공간적 위치를 computable annotation으로 부여하는 로직.

### 3.4 예시 (방향 제시, 스키마 잠금 아님)

```
Template: "봄 이벤트 배너" | code: 89287356925 | canvas: 850 x 635

Objects (ordered by visualWeight):
1. [obj-img-1]  image  | bounds(0,0,850,635)           | weight:background
2. [obj-txt-1]  text   | "최대 50% 할인"               | bounds(180,280,490,96)  | fontSize:72 | fill:#ff6a00 | weight:dominant   | zone:center
3. [obj-txt-2]  text   | "SPRING BLOSSOM"              | bounds(241,200,532,36)  | fontSize:32 | fill:#ffffff | weight:secondary  | zone:center
4. [obj-grp-1]  group  | [rect + text:"혜택 보기"]     | bounds(300,420,250,56)  | composite:button | weight:secondary | zone:bottom
5. [obj-txt-3]  text   | "2024.04.01~04.30"            | bounds(280,520,290,24)  | fontSize:16 | fill:#666666 | weight:tertiary   | zone:bottom
6. [obj-shp-1]  path   | bounds(720,40,80,80)          | fill:#ffd24a | weight:decorative | zone:corner
```

이 표현에서 어떤 오브젝트가 "headline"이고 어떤 것이 "CTA"인지는 이 레이어가 판단하지 않는다. `weight:dominant`과 `zone:center`는 관찰에서 계산된 힌트이다. 실제로 이 텍스트를 primary message로 쓸지, offer line으로 쓸지는 Layer 3에서 LLM이 결정한다.

### 3.5 구체적 JSON schema는 잠그지 않는다

위 원칙(3.2)이 지켜지는 한, 구체적인 JSON field 이름과 구조는 구현 시점에 결정한다. 이는 의도적인 결정이다 — 구현 전에 schema를 과도하게 확정하면 premature abstraction이 된다.

---

## 4. LLM Decision Schema

### 4.1 Input Contract (원칙, 잠금)

LLM은 다음을 입력으로 받는다:

| 입력 | 설명 | 출처 |
| --- | --- | --- |
| Projected template object graph | Section 3의 format으로 변환된 템플릿 오브젝트 목록 | Layer 2 |
| Message atoms | copy plan에서 도출된 의미 단위 (primary, offer, cta, detail 등) | Layer 1 |
| Canvas dimensions | 캔버스 폭 × 높이 | editor context |
| Style context | brand palette, typography preferences | editor context |

### 4.2 Output Contract: Element-Level Decisions (원칙, 잠금)

LLM은 projected graph의 **각 오브젝트**에 대해 하나의 operation을 반환한다:

| Operation | 의미 | LLM이 명시하는 것 |
| --- | --- | --- |
| **retain** | 오브젝트를 그대로 유지한다. geometry, style, content 모두 보존. | 대상 오브젝트 id, 유지 이유 |
| **modify** | 오브젝트를 유지하되 특정 속성을 변경한다. | 대상 오브젝트 id, 변경할 속성(텍스트 교체, 색상 변경 등), 변경 이유 |
| **remove** | 오브젝트를 구성에서 제거한다. | 대상 오브젝트 id, 제거 이유 |

- LLM이 명시하지 않은 오브젝트는 **retain**으로 간주한다 (기본값).
- modify에서 LLM은 "무엇을 바꿀지"만 말하고, "어떤 좌표로 옮길지"는 말하지 않는다.

### 4.3 Output Contract: Add (원칙, 잠금)

LLM은 템플릿에 없는 새 요소를 추가할 수 있다. 단, **addable vocabulary registry에 등록된 항목에서만** 가능하다.

| 필드 | 설명 |
| --- | --- |
| vocabulary entry id | addable vocabulary에서 참조할 항목 id (예: `cta_button`, `footer_text`) |
| content | 요소에 들어갈 내용 (텍스트, 색상 등) |
| placement zone | 배치 힌트 — zone 수준까지만 (center/bottom/corner 등). **정확한 좌표는 LLM이 지정하지 않는다.** |
| reason | 추가 이유 |

### 4.4 LLM이 결정하지 않는 것 (잠금)

아래 항목은 **반드시 코드(Layer 4)가 결정한다**. LLM output에 이 정보가 포함되어 있어도 executor는 이를 무시하고 자체 계산을 사용해야 한다.

| 항목 | 이유 |
| --- | --- |
| 정확한 픽셀 좌표 (x, y) | 코드가 template context, collision avoidance, canvas bounds를 고려하여 계산 |
| scale transform | Fabric.js의 scaleX/scaleY는 코드가 node emission 시 계산 |
| z-order (레이어 순서) | 코드가 시각적 위계와 오브젝트 종류를 고려하여 결정 |
| font sizing relative to container | 코드가 container bounds와 text length를 고려하여 fitting |
| composition의 "완성" 여부 | renderability + editability + save truth는 코드가 판정 (A4) |

---

## 5. Addable Vocabulary Registry

### 5.1 정의

addable vocabulary registry는 **LLM이 "add" operation으로 새로 추가할 수 있는 요소 유형의 등록소**이다.

- **registry 기반**이다. hardcoded enum이 아니다.
- 새 항목을 추가할 때 LLM 프롬프트 계약이나 executor 코어 로직을 변경할 필요가 없다.
- LLM은 항목 id로 참조하고, executor는 registry에서 물화(materialization) 규칙을 조회한다.

### 5.2 Registry 항목 구조 (원칙, 잠금)

각 registry 항목은 최소한 다음을 포함한다:

| 속성 | 설명 |
| --- | --- |
| `id` | 고유 식별자 (예: `cta_button`, `accent_shape`) |
| `nodeType` | 발행되는 canvas 오브젝트의 타입 (text / shape / group / image) |
| `defaultPlacementZone` | 기본 배치 영역 (center / bottom / corner 등) |
| `requiredContent` | LLM이 add 시 반드시 제공해야 하는 내용 (예: text required, color optional) |
| `materializer` | executor가 이 항목을 canvas mutation으로 변환할 때 사용하는 로직 참조 |

### 5.3 초기 항목 (좁게 시작)

첫 구현 시 아래 항목으로 시작한다. 이 목록은 **잠금이 아니다** — 확장 가능하다.

| id | nodeType | 설명 | requiredContent |
| --- | --- | --- | --- |
| `cta_button` | group (shape+text) | 행동 유도 버튼 | text (필수) |
| `accent_shape` | shape | 장식/강조 도형 | — |
| `footer_text` | text | 하단 부가 정보 (날짜, 조건 등) | text (필수) |
| `badge_chip` | group (shape+text) | 뱃지/태그 ("NEW", "한정" 등) | text (필수) |

### 5.4 확장 원칙

- 새 항목 추가 시: registry에 항목 등록 + materializer 구현만 하면 된다.
- LLM 프롬프트에 항목 목록을 주입하는 방식으로, LLM은 자연스럽게 새 항목을 사용할 수 있다.
- 항목이 하나의 구현에 종속되면 안 된다. 같은 `cta_button`도 template context에 따라 다른 visual로 물화될 수 있다.

### 5.5 Addable vocabulary가 아닌 것

- 전체 시스템의 planning ontology가 아니다 (A5).
- retain/modify/remove의 대상 분류 체계가 아니다. 기존 오브젝트의 "역할"을 분류하는 데 사용하면 slot 재포장이 된다.
- 모든 가능한 디자인 요소의 exhaustive catalog이 아니다. 템플릿에 이미 있는 것은 retain/modify/remove로 다루고, 여기에 없는 것만 add로 다룬다.

### 5.6 CTA는 필수가 아니다

- `cta_button` 이 registry에 존재해도 모든 representative draft가 CTA를 반드시 가져야 하는 것은 아니다.
- 행동 유도 요소는 selected reference graph와 adaptive composition decision의 결과로 들어올 수 있는 선택 항목이다.
- CTA 부재 자체는 completion failure 이유가 아니다.

---

## 6. Completion Contract

### 6.1 Completion의 세 가지 축 (잠금)

run이 "완료"로 판정되려면 아래 세 축이 모두 충족되어야 한다.

| 축 | 판정 기준 | 판정 주체 |
| --- | --- | --- |
| **Editability** | 발행된 모든 오브젝트가 선택 가능하고 편집 가능한 레이어이다. 텍스트는 editable text이지 rasterized image가 아니다. 그룹은 진입 가능하다. | 코드 (Layer 4) |
| **Renderability** | 모든 오브젝트가 canvas bounds 내에 있다. critical overlap이 없다. 텍스트가 container에 맞는다. 시각적으로 무너진 layout이 아니다. | 코드 (Layer 4) |
| **Save truth** | `saveEvidence` + `saveReceipt` + `finalRevision` chain이 완결되었다. FE에서 mutation이 적용되고 ack가 돌아왔으며, backend에서 저장이 확인되었다. | 코드 (Layer 4) |

### 6.2 Completion이 아닌 것 (잠금)

아래 기준은 **completion 판정에 사용하면 안 된다**:

| 기준 | 왜 사용하면 안 되는가 |
| --- | --- |
| "headline" 슬롯이 채워졌는지 | semantic slot presence는 구조적 진실이 아니다. 템플릿에 headline-like 텍스트가 없을 수도 있고, 있더라도 LLM이 remove할 수 있다. |
| "cta" 슬롯이 채워졌는지 | 같은 이유. CTA가 없는 디자인도 유효할 수 있다. |
| 특정 topology family에 매칭되는지 | topology는 transitional adapter이다 (A5). |
| `requiredExecutionSlots` 기반 slot completeness | 이것이 현재 v3의 핵심 문제이다. 고정 목록으로 completion을 gate하면 모든 디자인이 같은 구조가 된다. |
| 발행된 오브젝트 수의 최소 기준 | 오브젝트 수는 구조의 질과 무관하다. |

### 6.3 Warning vs Failure

- completion의 세 축 중 하나라도 **불충족**이면: run은 `failed` 또는 `completed_with_warning`이다.
- 세 축이 모두 충족되었지만 **추가적인 품질 이슈**(copy 품질, 색상 조화 등)가 있으면: run은 `completed_with_warning`이되, completion 자체는 닫힌다.
- 세 축이 모두 충족되었고 추가 이슈도 없으면: run은 `completed`이다.

### 6.4 Reference-first rule

시스템은 **reference template first** 로 동작해야 한다.

- selected reference template이 representative composition의 구조 기준선이다.
- 적절한 reference template이 없다고 해서 시스템이 from-scratch synthetic composition으로 전환하면 안 된다.
- reference selection 단계에서 통과 가능한 후보가 없으면, run은 synthetic layout fallback으로 억지 성공을 만들지 말고 실패 또는 explicit warning close로 수렴해야 한다.

### 6.5 허용되는 fallback의 범위

fallback은 오직 **선택된 reference를 유지한 상태의 bounded degradation** 으로만 허용한다.

허용:

- optional object 제거
- photo 대신 graphic 또는 shape treatment 사용
- registry 기반 bounded add
- style/token 수준 약화

금지:

- reference를 버리고 새 레이아웃을 처음부터 조립
- completion을 맞추기 위한 synthetic structure 생성
- prompt별 예외 규칙을 누적해 synthetic composition을 사실상 상시 경로로 만드는 것

---

## 7. 인프라 불변량 (Preserved)

아래 인프라는 이 SSOT의 철학 전환에 영향을 받지 않는다. 유지한다.

### 7.1 LangGraph 오케스트레이션 스파인

- `runJobGraph.ts`의 StateGraph 구조 유지
- 노드 기반 phase 실행 + conditional edge routing 유지
- checkpointer 기반 재시도/재개 메커니즘 유지
- recursionLimit, cooperativeStop, heartbeat 패턴 유지

### 7.2 Canvas Mutation Protocol

- 세 가지 mutation command: `createLayer`, `updateLayer`, `deleteLayer`
- SSE event stream (`canvas.mutation`, `run.phase`, `run.log`, `run.completed`, `run.failed`)
- mutation ack flow (FE → backend POST)
- rollback hint (`rollbackGroupId`, `strategy`)
- agent ownership tracking (`uid = "agentwf:<runId>:<clientLayerKey>"`)

참조:
- 계약 정의: `toolditor/src/features/agent-workflow-spike/model/contracts.ts`
- 오브젝트 빌더: `toolditor/src/features/agent-workflow-spike/lib/canvasObjectFactories.ts`
- mutation 적용: `toolditor/src/features/agent-workflow-spike/lib/mutationAdapter.ts`

### 7.3 Template Retrieval

- 템플릿 키워드 검색 → 후보 조립 → reranking → 선택
- `TemplatePriorBundle` 구조 (query plan, candidates, selected scaffold)
- `TooldiTemplateDocument` 구조 (code, metaData, canvas, pages)

참조: `buildTemplatePriorBundle`, `assembleTemplateCandidates`

### 7.4 Save/Finalize

- `runFinalizeLedger.ts` — mutation ledger projection
- `runFinalizeMaterializer.ts` — `LiveDraftArtifactBundle` 생성
- `runFinalizeService.ts` — persistence, completion record, cost summary
- save evidence + save receipt + final revision chain

### 7.5 Intent Planning

- `plan_intent_draft` (LLM) → `normalize_intent` → `CanonicalDesignIntent`
- message atom 생성 (copy plan)
- 이 단계는 Layer 1에 해당하며, Layer 2 이하의 변경에 영향을 받지 않는다.

### 7.6 Artifact Persistence Pattern

- 각 단계의 중간 산출물을 ObjectStore에 JSON으로 저장
- key 패턴: `runs/{runId}/attempts/{attemptSeq}/{artifactKind}.json`
- 전체 lineage의 traceability 보장

---

## 8. Migration Map — 현재 파이프라인에서의 변경 대상

### 8.1 유지 (변경 없음)

| Phase | 현재 코드 위치 | 유지 근거 |
| --- | --- | --- |
| `hydrate_input` | planningNodes.ts | 입력 hydration, 철학 무관 |
| `plan_intent_draft` | planningNodes.ts | Layer 1 — intent planning, 유지 |
| `normalize_intent` | planningNodes.ts | Layer 1 — intent normalization, 유지 |
| `gate_scope` | planningNodes.ts | scope check, 유지 |
| `build_template_prior_summary` | buildNodes.ts | 검색 전 요약, 유지 |
| `build_template_prior_bundle` | buildNodes.ts | 후보 검색/reranking, 유지 |
| `build_search_profile` | buildNodes.ts | 에셋 검색 키워드, 유지 |
| `compute_retrieval_policy` | buildNodes.ts | 검색 정책, 유지 |
| `assemble_candidates` | buildNodes.ts | 후보 조립, 유지 |
| `select_typography` | buildNodes.ts | 타이포그래피 선택, 유지 |
| `persist_selection_artifacts` | buildNodes.ts | 아티팩트 저장, 유지 |
| `rule_judge` | buildNodes.ts | 비즈니스 규칙 판정, 유지 |
| `prepare_execution` / `emit_stage` / `await_ack` | executionNodes.ts | Canvas Mutation Protocol, 유지 |
| `build_execution_scene_summary` | refinementNodes.ts | 실행 후 요약, 유지 |
| `build_judge_plan` | refinementNodes.ts | refine 판정 (bounded secondary), 유지 |
| `decide_refine` | refinementNodes.ts | refine 결정 (bounded), 유지 |
| `save` / `finalize` | finalizeNodes.ts | save/finalize chain, 유지 |

### 8.2 교체 또는 대폭 재작업 대상

| 대상 | 현재 코드 | 현재 문제 | 변경 방향 |
| --- | --- | --- | --- |
| **Reference composition 생성** | `buildObjectNativePath.ts`, `buildReferenceResetPath.ts`, `buildReferenceCompositionV2.ts` | `classifyTextBlock`가 오브젝트를 `ReferenceBlockKind` enum으로 강제 분류. `buildObjectNativeClusterBindingPlan`(L614)이 display_text→headline, promo_surface→offer_line, action_surface→cta로 고정 매핑. | Section 3의 projected format을 생성하는 **Template Graph Projection** 단계로 교체. semantic classification 없이 관찰 가능한 속성 + computable annotation만 생성. |
| **Executable plan의 completion gate** | `buildExecutablePlan.ts` L421 | `resolveRequiredExecutionSlots`가 `["background","headline","offer_line","cta"]`를 하드코딩. 이것이 completion truth가 됨. | Section 6의 completion contract(editability + renderability + save truth)로 교체. 고정 slot 목록 완전 제거. |
| **Scene/layout plan의 slot expectation** | `build_scene_plans`, `build_copy_and_abstract_layout_plan` | copy plan과 abstract layout plan이 고정 슬롯 기대를 생성. | message atom 생성은 유지하되, "이 atom이 이 slot에 바인딩되어야 한다"는 expectation 제거. atom은 Layer 3에서 LLM이 오브젝트에 바인딩할 content의 후보로만 사용. |
| **Composition selection** | `select_composition` | 기존 composition model(ReferenceCompositionGraph) 기반. | LLM adaptive composition decision(Section 4)을 통합. projected graph + atoms → retain/modify/remove/add 결정. |

### 8.3 신규 구성 요소

| 항목 | 설명 | 위치 (예상) |
| --- | --- | --- |
| **Template Graph Projection** | 선택된 템플릿의 Fabric.js JSON을 Section 3의 projected format으로 변환. 기존 `extractReferenceBlockGraph`의 flatten/read 로직을 재사용하되, classification 단계를 제거하고 computable annotation을 추가. | 기존 `build_reference_composition_v2` 단계를 교체하거나 직전에 삽입 |
| **LLM Adaptive Composition Decision** | projected graph + atoms를 LLM에 넘기고, element-level decisions(retain/modify/remove) + add decisions를 받아오는 단계. | 기존 composition selection 단계를 교체하거나 직후에 삽입 |
| **Addable Vocabulary Registry** | 모듈 형태의 등록소. 현재 `buildObjectNativePath.ts`의 인라인 block emission 로직을 대체. LLM이 id로 참조, executor가 registry에서 materialization 규칙 조회. | 별도 모듈 또는 config |

### 8.4 현재 코드의 구체적 변경 지점

| 파일 | 문제가 되는 코드 | 대응 |
| --- | --- | --- |
| `types.ts` L741 | `ReferenceBlockKind` type — 고정 ontology | projected format의 새 타입으로 교체 |
| `types.ts` L848 | `ObjectNativeClusterFamily` type — `"big_text" \| "promo_band" \| "cta"` | 제거 또는 deprecated |
| `buildObjectNativePath.ts` L614-617 | `bind(findBlock("display_text"), atom.primary, "headline", "big_text_cluster")` 등 고정 바인딩 | LLM decision 기반 바인딩으로 교체 |
| `buildExecutablePlan.ts` L421 | `return ["background", "headline", "offer_line", "cta"]` | Section 6의 completion contract로 교체 |
| `buildReferenceResetPath.ts` | `classifyTextBlock()`, `classifySurfaceBlock()` | computable annotation 로직으로 교체 |

---

## 9. 명시적 보류 사항 (Deferred)

이 문서는 아래 항목을 **의도적으로 잠그지 않는다**. 이들은 향후 고도화 단계에서 결정한다.

| 보류 항목 | 이유 |
| --- | --- |
| Refine loop 동작 세부 / patch scope | refine은 bounded secondary이다. primary quality는 Layer 3의 LLM 결정 질에서 나온다. refine 세부는 나중에. |
| Error recovery의 세부 재시도 규칙 | 정상 경로를 먼저 안정화한 뒤 수치와 단계별 retry budget을 더 정교하게 조정한다. 단, reference-first와 synthetic fallback 금지는 이미 잠금이다. |
| Multi-turn editing | 현재는 single-turn draft 생성이 목표. multi-turn은 향후 확장. |
| Vision 기반 judge | 현재 judge는 rule 기반. vision 판정은 향후 고도화. |
| Overlap detection, text fitting 등의 threshold 값 | renderability guard의 구체적 수치는 구현 시 결정. |
| Photo insertion path 세부 | photo branch의 구체적 실행 경로는 별도 설계. |
| Addable vocabulary 초기 항목 이외의 확장 | Section 5.3의 초기 항목은 시작점. 확장은 실제 운용 데이터를 보고 결정. |
| Topology family의 향후 활용 | topology는 transitional adapter(A5). 향후 활용 여부와 방식은 열어둠. |
| Projected format의 구체적 JSON schema | Section 3.2의 원칙만 잠금. 구체적 필드 구조는 구현 시 결정. |
| LLM Decision의 구체적 JSON schema | Section 4의 원칙만 잠금. 구체적 필드 구조는 구현 시 결정. |
| 파이프라인 내 새 단계의 정확한 위치 | 계약만 잠금. 어떤 graph node 앞/뒤에 들어가는지는 구현에 맡김. |

---

## 10. 용어 사전

| 용어 | 정의 |
| --- | --- |
| **Template Object Graph** | 선택된 reference 템플릿의 Fabric.js 오브젝트 트리를 projected한 중간 표현. Section 3 참조. |
| **Projected Format** | raw Fabric.js JSON을 LLM이 소비할 수 있는 형태로 변환한 중간 표현. semantic role classification 없이 관찰 가능한 속성과 computable annotation만 포함. |
| **Message Atom** | copy plan에서 도출된 느슨한 의미 단위. primary(핵심 메시지), offer(혜택), cta(행동 유도), detail(부가 정보) 등. 실행 진실이 아니라 content의 씨앗. |
| **Retain** | template graph의 오브젝트를 그대로 유지하는 LLM 결정. |
| **Modify** | template graph의 오브젝트를 유지하되 특정 속성(텍스트, 색상 등)을 변경하는 LLM 결정. |
| **Remove** | template graph의 오브젝트를 구성에서 제거하는 LLM 결정. |
| **Add** | addable vocabulary에서 새 요소를 추가하는 LLM 결정. 템플릿에 없는 요소만 해당. |
| **Addable Vocabulary** | LLM이 add operation에서 참조할 수 있는 추가 가능 요소의 registry. hardcoded enum이 아니라 확장 가능한 등록소. |
| **Completion** | run의 완료 판정. editability + renderability + save truth의 세 축으로 구성. named-slot completeness가 아님. |
| **Editability** | 발행된 모든 오브젝트가 선택·편집 가능한 레이어인지 여부. |
| **Renderability** | 모든 오브젝트가 canvas bounds 내에 있고, critical overlap이 없고, 텍스트가 컨테이너에 맞는지 여부. |
| **Save Truth** | saveEvidence + saveReceipt + finalRevision chain이 완결되었는지 여부. |
| **Capability** | (하위 개념) 시스템의 executor가 발행할 수 있는 것에 대한 실행 어휘. planning ontology가 아님. A5 참조. |
| **Topology** | (하위 개념) 현재 단계의 transitional adapter 패턴. planning ontology가 아님. A5 참조. |
| **Visual Weight** | computable annotation. bounds 면적, fontSize, 위치 prominence에서 계산. dominant/secondary/tertiary/decorative/background. |
| **Zone** | computable annotation. canvas 대비 오브젝트의 상대적 공간 위치. center/top/bottom/left/right/corner. |
| **Canvas Mutation** | editor-native 캔버스에 오브젝트를 생성/수정/삭제하는 명령. createLayer, updateLayer, deleteLayer의 세 종류. |
