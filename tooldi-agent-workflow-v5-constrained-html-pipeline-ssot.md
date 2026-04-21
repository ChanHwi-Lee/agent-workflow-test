# Tooldi Agent Workflow v5 — Constrained HTML Pipeline SSOT

> **⚠ Historical — 2026-04-21 자로 [v6 Layout Freedom SSOT](./tooldi-agent-workflow-v6-layout-freedom-ssot.md) 에 의해 대체됨.**
>
> 이 문서는 2026-04-20~04-21 사이의 authority 이었다. Phase 0 PoC 와 Phase 4 E2E smoke 에서 free HTML + 브라우저 렌더 + 결정적 primitive 추출 경로가 **더 적은 제약으로 같은 편집성**을 제공함이 증명되어, 제약 HTML grammar(`position:absolute` 강제, child 수 제한, line-break sibling 분해)와 deterministic DOM→Tooldi transpiler 경로는 폐기되었다.
>
> v5 경로에서 설계된 6단계 파이프라인, grammar whitelist, self-repair 루프, DOM→layer graph 매핑 표는 전부 v6 의 3단계 파이프라인(free HTML → browser layout → primitive extract) 으로 재구성되었다. 배경 이해 시에만 참조.

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Constrained HTML Pipeline SSOT (v5) |
| 문서 목적 | 자연어 디자인 에이전트의 설계 철학, 파이프라인 계약, 모델 선택, 재사용·폐기 경계를 확정하고 모든 후속 개발의 유일 기준선(Single Source of Truth)이 된다. |
| 상태 | **Authority / Design Lock** |
| 작성일 | 2026-04-20 |
| 대상 시스템 | `agent-workflow-test/tooldi-agent-runtime` (agent-worker, agent-api), `toolditor` (FE agent-workflow-spike), `sandbox/embedding-test` (Qdrant + jina-clip-v2) |
| 대상 독자 | Agent Backend, FE, PM, QA, Reviewer |
| 소유 | Agent Workflow 팀 |

---

## 0. 이 문서의 권위

이 문서는 2026-04-20자 기준 **자연어 에이전트 아키텍처의 유일 철학 SSOT**다. 충돌 발생 시 이 문서가 이긴다.

### 0.1 이 문서가 대체하는 문서

| 문서 | 상태 변경 |
| --- | --- |
| `tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md` | **Historical context — 대체됨.** template-aware adaptive composition(A1~A5 axiom, retain/modify/remove/add decision DSL, addable vocabulary registry, projected template object graph)은 이 SSOT로 폐기된다. 이전 설계 결정의 배경을 이해할 때만 참조. |
| `tooldi-agent-workflow-v1-create-template-representation-design-lock.md` | **Historical context — 대체됨.** adaptive composition 표현 projection이었으므로 base philosophy 소멸로 같이 폐기. |
| `tooldi-agent-workflow-v1-template-intelligence-design-lock.md` | **Historical context — 대체됨.** discovery / reference selection / addable vocabulary / executor capability registry 개념이 v5에서 전부 제거된다. |
| `tooldi-agent-workflow-vnext-object-native-reference-architecture.md` | **Historical** (이전에도 대체된 상태 유지) |
| `tooldi-agent-workflow-v4-topology-driven-editor-native-architecture.md` | **Historical** (이전에도 대체된 상태 유지) |

### 0.2 이 문서가 **대체하지 않는** 문서

아래 문서는 v5 파이프라인과 정합성을 유지하지만, 여전히 normative authority를 가진다. v5는 이 문서들이 이미 닫은 계약(completion moment, canvas mutation protocol, persistence schema, queue boundary)을 **재사용**한다.

- `tooldi-natural-language-agent-v1-architecture.md` — artifact identity, counted completion moment, lifecycle ownership, ordering, rollback semantics, Canvas Mutation Protocol 구조 authority. **단, 설계 철학 참조는 이제 v5를 향한다.**
- `tooldi-agent-workflow-v1-backend-boundary.md` — backend/worker/queue/store 경계. 인프라 불변량 유지.
- `toolditor-agent-workflow-v1-client-boundary.md` — FE/toolditor 적용 경계. Canvas Mutation Protocol ack/emit 계약 유지.
- `tooldi-agent-workflow-v1-functional-spec-to-be.md` — public/API/persistence projection. 철학 섹션만 v5 기준으로 갱신되어야 한다.
- `tooldi-agent-workflow-v1-scope-operations-decisions.md` — v1 scope/non-scope, stack lock, operations. 유지.
- `tooldi-agent-workflow-v1-create-template-current-state-as-is.md` — AS-IS. v5 전환 진행 중 상태 기록.

### 0.3 증거 기반

이 SSOT는 2026-04-20 실행된 다음 실증에 근거한다. 숫자는 `agent-workflow-test/bench/method-compare-phase1/` 에 전량 저장.

- 5-모델(2.5-pro, 3-pro-preview, 3.1-pro-preview, 3-flash-preview, 3.1-flash-lite-preview) × 2-방식(native JSON 직생성 vs 제약 HTML) × 20 프롬프트 = **200 calls 무실패**.
- Format 합격률: 제약 HTML 방식은 3.1-flash-lite에서 92.8%, 3-pro에서 98.9%. Native JSON 직생성은 모든 모델 100% 근접.
- 비용/레이턴시: 3.1-flash-lite는 $0.007 / 20 prompts / p50 3.1s. 3-pro는 $0.95 / 37s. **약 125배 비용차, 12배 latency차**에 품질 격차가 선형적이지 않음.
- 사용자(1인 개발자, 최종 설계 권한자) 육안 판정: 제약 HTML 방식이 시각 디자인 품질에서 일관 우세. 두 방식 모두 줄바꿈/겹침 이슈 존재 — post-processor는 어느 방식이든 필수.

---

## 1. 철학 정의 — Constrained HTML Pipeline

### 1.1 원라인 정의

> **시스템은 LLM에게 좁게 제약된 DOM/CSS 서브셋으로 디자인을 판단하게 하고, 결정적 코드가 그 DOM을 Tooldi editor-native layer graph로 직렬화한다. 모델은 웹 스택에 훈련된 감각을 디자인 판단에 쓰고, 코드는 편집성·렌더러빌리티·저장을 보장한다.**

### 1.2 다섯 가지 Axiom (v5)

이 axiom들은 **잠금(locked)** 상태다. 모든 코드 변경, PR, 설계 결정은 이 axiom에 위배되지 않는지 검증되어야 한다.

| # | Axiom | 의미 |
| --- | --- | --- |
| V1 | **LLM은 디자인 판단, 코드는 DSL 직렬화.** | LLM은 제약된 HTML/CSS로 배치·타이포·색·위계를 결정한다. 코드는 DOM을 Tooldi `AllElementTypes[]` + Canvas Mutation으로 직렬화한다. 이 역할 경계를 침범하면 안 된다. |
| V2 | **Pass-2는 결정적이다.** | HTML → Tooldi layer graph 변환은 순수 Node.js 코드만으로 수행한다. 2차 LLM 호출은 금지. 디버깅 deterministic을 확보하고, 비결정성이 파이프라인에서 곱해지는 것을 막는다. |
| V3 | **LLM 출력은 유한 문법 서브셋이다.** | root `<div style="position:relative; width:1200px; height:628px; overflow:hidden;">` 하위에 허용 태그/속성/CSS만 나올 수 있다. validator가 이를 강제하고, 위반 시 self-repair 또는 bounded degradation으로 닫는다. creative HTML은 silently 허용하지 않는다. |
| V4 | **완료 = editability + renderability + save truth.** | 완료 판정은 모든 layer가 편집 가능하고, Tooldi canvas가 렌더 가능하며, 저장 receipt이 확인된 상태로 한다. slot/role/cluster completeness는 완료 기준이 아니다 (v1~v4의 잔재). |
| V5 | **모델 선택은 벤치 근거만 믿는다.** | 현재 default: `gemini-3.1-flash-lite-preview`. 새 모델 도입은 기존 bench harness(`bench/method-compare-phase1`)에서 format ≥ parity & cost/latency 개선 증명 후에만 default 교체가 허용된다. 직감 교체 금지. |

### 1.3 금지 패턴 (Anti-patterns)

| 금지 패턴 | 왜 금지하는가 |
| --- | --- |
| Pass-2를 LLM에 위임 | V2 위반. LLM → LLM 직렬은 비결정성을 곱해 debugging surface를 폭발시킨다. |
| template reference graph를 structure truth로 부활 | v1 "Template-Aware Adaptive Composition"의 A1 axiom이었으나 **이 SSOT로 폐기**. v5는 reference graph에 의존하지 않는다. |
| retain/modify/remove/add decision DSL 부활 | adaptive composition의 실행 계약이었으나 폐기. LLM이 DOM을 직접 생성하고 코드가 직렬화한다 — decision DSL은 중간 표현으로 더 이상 존재하지 않는다. |
| addable vocabulary registry 부활 | 폐기. 허용되는 요소는 DOM grammar whitelist(태그/CSS)로만 정의된다. |
| projected object graph, computable annotation, semantic-role classification | 폐기. v5는 "무엇이 있는지"를 DOM parse로, "어떻게 그릴지"를 결정적 코드로 닫는다. |
| Chromium/Puppeteer/html2canvas 렌더링 단계 | 금지. 중간에 픽셀 raster가 끼면 editability가 깨진다. DOM parse만 허용. |
| flex/grid/margin-auto/calc/translate-center HTML | V3 위반. DOM grammar validator가 반려. 예외 허용 시 whitelist 확장은 SSOT 개정이 선행되어야 한다. |
| 모델 default를 bench 없이 교체 | V5 위반. `bench/method-compare-phase1` 재현 없이 default 모델을 바꾸는 PR은 거부. |
| slot/role/cluster completeness를 completion gate로 복구 | V4 위반. 완료 판정은 editability + renderability + save truth 3축만. |

---

## 2. 6단계 파이프라인 (Normative)

파이프라인은 아래 6단계로 고정된다. 각 단계는 명확한 입력·출력 경계를 가지며, 책임 침범이 axiom 위반이다.

```
┌──────────────────────────────────────────────────────────────┐
│ Stage 1  Intent Normalize         (reuse: normalize_intent)  │
│ Stage 2  HTML Design Pass         (LLM)                      │
│ Stage 3  HTML Validator + Repair  (deterministic)            │
│ Stage 4  RAG Asset Swap           (Qdrant + jina-clip-v2)    │
│ Stage 5  DOM → Layer Graph        (deterministic transpiler) │
│ Stage 6  Overflow Post-Processor  (Fabric textMeasure refit) │
│          → Canvas Mutation / SSE / Completion Gate (reuse)    │
└──────────────────────────────────────────────────────────────┘
```

### Stage 1 — Intent Normalize

- **입력**: 사용자 자연어 prompt + canvas spec (`canvasWidth=1200`, `canvasHeight=628`).
- **출력**: `CanonicalDesignIntent` + message atoms(primary/offer/cta/detail).
- **구현**: 기존 `normalize_intent` 경로 재사용. 폐기되는 `buildSearchProfile`, `assembleTemplateCandidates`, `buildTemplatePriorBundle`, `selectTemplateComposition` 등 reference-first 경로는 더 이상 호출되지 않는다.
- **불변량**: intent는 Stage 2의 프롬프트 컨텍스트로만 사용된다. "intent에서 slot을 도출"하는 추론은 v5에서 금지.

### Stage 2 — HTML Design Pass (LLM)

- **모델**: `gemini-3.1-flash-lite-preview` (default). 교체는 V5 axiom을 따른다.
- **입력**: Stage 1 산출물 + DOM grammar spec + few-shot exemplar 1~3개 + Tooldi 에셋 placeholder 주입 규칙.
- **출력**: 제약된 HTML 문자열(자세히는 §3).
- **프롬프트 락**:
  - root `<div style="position:relative; width:1200px; height:628px; overflow:hidden;">` 강제.
  - 자식은 전부 `position:absolute`, 픽셀 정수.
  - 허용 태그: `div, span, p, h1~h6, img, svg`. 금지: `button, a, ul, table, form, br, style, script, link`.
  - 허용 CSS 속성 whitelist: `left, top, width, height, font-family, font-size, font-weight, color, text-align, line-height, letter-spacing, background-color, background-image: linear-gradient(), border-radius, box-shadow (single layer), opacity, transform: rotate(), z-index`.
  - 이미지 placeholder: `<img data-tooldi-role="..." data-hint="..." data-aspect="..." src="placeholder://">`.
  - 줄바꿈은 **별도 요소**로 표현(`<br>` 금지, 텍스트 내부 `\n` 금지). 같은 블록 내 여러 줄은 같은 `<span>` / `<p>` 에 자연 개행으로 표현하거나 요소를 분리한다.
- **운영 제약**: `responseMimeType` 은 plain text(HTML). thinking 기본값 유지(production 시뮬레이션).

### Stage 3 — HTML Validator + Self-Repair

- **입력**: Stage 2 HTML 문자열.
- **출력**: grammar-clean HTML 또는 bounded-degradation marker.
- **구현**: `htmlparser2` 또는 `parse5` 로 DOM tree 파싱 → §1.3 grammar 위반 감지. 위반 시 사유를 모델에 재주입해 **1회 self-repair**. 2회 연속 실패는 bounded degradation(background + primary text만 담긴 minimum draft)으로 내려간다.
- **완료 gate**: V3 axiom 통과.

### Stage 4 — RAG Asset Swap

- **입력**: Stage 3 DOM의 `<img data-tooldi-role=... data-hint=...>` placeholder 집합.
- **출력**: 실제 Tooldi asset ID(`photo:XXXX`, `graphic:XXXX`)와 S3 URL이 주입된 DOM.
- **구현**: `data-hint` + `data-tooldi-role` + canvas aspect를 `jinaai/jina-clip-v2`로 embedding → Qdrant 인덱스(`sandbox/embedding-test/` PoC 확장) 검색 → `Picture::index`/`Shape::index` 의 owner/price/type 정책 적용 → 최상위 1건 선택. 매칭 실패/품질 미달 시 solid fill fallback(bounded degradation).
- **순서 유연성**: Stage 5 이후에 수행해도 무방하다. editability에 영향 없는 순서 선택.

### Stage 5 — DOM → Tooldi Layer Graph Transpiler (Deterministic)

- **입력**: grammar-clean DOM (asset swap 전/후 무관).
- **출력**: `AllElementTypes[]` + `AgentCreateLayerCommand[]`.
- **매핑 테이블 (normative minimum)**:

| DOM 노드 | Tooldi layer type | 재사용 빌더 |
| --- | --- | --- |
| `<div>` bg-color only | `rect` (`RectType`) | 신규 inline |
| `<div>` bg linear-gradient | `rect` + `gradientType` fill | `baseType.gradientType` 매핑 |
| root `<div>` with bg image cover | `image` cover | `buildCoverImageObject` |
| `<span>`, `<p>`, `<h1~6>` (pure text) | `text` (`TextType`) | `buildTextObject` + `buildTextStyles` |
| `<img src>` | `image` (`ImageType`) placed/cover | `buildCoverImageObjectWithOptions` |
| `<svg><path d="...">` | `path` (`PathType`) / `illust` | 신규 inline |
| nested `<div>` with `data-tooldi-group` | `group` (`GroupType`) | `buildCtaGroupObject` 패턴 |
| `box-shadow` | `shadowType` (single layer) | `baseType.shadowType` 매핑 |

- **불변량**: LLM 호출 없음. 같은 DOM 입력 → 항상 같은 layer graph 출력. Long-tail 대응은 validator 강화(Stage 3) 또는 whitelist 축소로 처리한다.
- **한글 폰트 드리프트 대응은 Stage 6에서**.

### Stage 6 — Text Overflow/Overlap Post-Processor

- **입력**: Stage 5 layer graph.
- **출력**: bounds-safe layer graph (완료 gate 통과 가능).
- **구현**: Fabric.js `textMeasure` 또는 동등 메트릭으로 text layer별 실측 → container bounds 초과 시 (a) fontSize step-down, (b) width 확장(이웃 layer와 IoU 검사), (c) lineHeight 미세 조정. critical overlap(IoU > 0.6)은 z-order 재배치 또는 reject→degraded draft.
- **철학**: 이 단계는 **LLM 두 방식 공통으로 필요한 보정**이다. 파이프라인 특화가 아니라 렌더 현실(브라우저 ↔ Fabric의 text metric 차이) 대응이다.

### Stage 7 (경계 재사용) — Canvas Mutation / SSE / Completion Gate

- **재사용**: 기존 Canvas Mutation Protocol (`toolditor-agent-workflow-v1-client-boundary.md`), SSE event 구조 (`tooldi-natural-language-agent-v1-architecture.md`), completion gate (editability + renderability + save receipt) 그대로 사용.
- **스트리밍**: skeleton(background + primary text) → full draft → asset-swapped final 의 3단 partial emit 가능. `firstVisible` / `editableMinimum` milestone 은 architecture 문서가 닫는다.

---

## 3. 모듈 재사용 / 폐기 / 신설 경계

### 3.1 재사용 (유지)

| 모듈 | 역할 |
| --- | --- |
| `normalize_intent`, `plan_intent_draft` | Stage 1 |
| `canvasObjectFactories.ts` (buildTextObject/buildCoverImageObject/buildCtaGroupObject) | Stage 5 빌더 |
| `contracts.ts` (AgentLayerType, mutation blueprint) | Stage 5 출력 스키마 |
| Canvas Mutation Protocol / SSE emit+ack | Stage 7 |
| completion gate (editability + renderability + save receipt) | Stage 7 |
| `sandbox/embedding-test/` Qdrant + jina-clip-v2 PoC | Stage 4 기반 |

### 3.2 폐기 (v5 리셋)

| 모듈 | 사유 |
| --- | --- |
| `buildObjectNativePath.ts`, `buildReferenceResetPath.ts`, `buildReferenceCompositionV2.ts`, `buildTopologyPath.ts` | adaptive composition 경로 전체 폐기 |
| `ReferenceBlockKind`, `ObjectNativeClusterFamily`, `classifyTextBlock`, `classifySurfaceBlock` | reference-first 분류 폐기 |
| `resolveRequiredExecutionSlots`, slot completeness gate | slot/role completion 폐기 (V4) |
| addable vocabulary registry, projected object graph extractor, computable annotation generator | 개념 자체 소멸 |
| `buildSearchProfile`, `assembleTemplateCandidates`, `buildTemplatePriorBundle`, `selectTemplateComposition` | reference template 선발 경로 전체 폐기 |
| `selectTypography` | 폰트 결정은 Stage 2 LLM이 직접 지정, Stage 5에서 Tooldi 폰트 ID로 정규화 |
| `ruleJudge`, `buildJudgePlan`, `buildRefineDecision`, patch-only refine loop | 폐기. visual judge는 v6 이후 별도 topic. |

### 3.3 신설

| 모듈 | 역할 |
| --- | --- |
| `htmlDesignPassPrompt.ts` | Stage 2 프롬프트 락, few-shot pool, grammar spec 포함 |
| `htmlValidator.ts` | Stage 3 (htmlparser2 + grammar 위반 탐지) |
| `htmlSelfRepair.ts` | Stage 3 재생성 루프 |
| `assetPlaceholderRagSwapper.ts` | Stage 4 |
| `domToLayerGraph.ts` (transpiler) | Stage 5 |
| `textOverflowPostProcessor.ts` | Stage 6 |
| `modelRegistry.ts` | V5 axiom 준수용, 허용 모델 목록 + bench 증거 hash 기록 |

---

## 4. Verification Traceability Map

| AC ID | acceptance criterion | 단일 검증 anchor |
| --- | --- | --- |
| AC-V1 | representative run (`봄 세일 이벤트 배너 만들어줘`)에서 2분 내 편집 가능한 배너 초안 1개가 live-commit 된다 | `tooldi-natural-language-agent-v1-architecture.md` §2.2 (재사용) |
| AC-V2 | Stage 2의 HTML 출력은 §1.3 grammar를 100% 만족한다 (validator 통과율 ≥ 95%) | `bench/method-compare-phase1/grade.mjs` 의 `dom_grammar_ok` + `css_whitelist_ok` |
| AC-V3 | Stage 5는 같은 DOM 입력에 항상 같은 layer graph를 낸다 | unit test harness (신설 필요), `__tests__/domToLayerGraph.deterministic.test.ts` |
| AC-V4 | completion gate 3축이 성공 판정의 유일 기준이다 | `tooldi-natural-language-agent-v1-architecture.md` §4.1.1 `completion_sla_definition` 재사용 |
| AC-V5 | default 모델 교체 PR은 bench artifact 경로와 parity 증거를 포함한다 | PR template(신설), `bench/method-compare-phase1/` 경로 필수 포함 |
| AC-V6 | Stage 4 RAG 실패 시 bounded degradation 경로만 허용된다 (synthetic asset 생성 금지) | `assetPlaceholderRagSwapper.ts` + Stage 7 completion guard |
| AC-V7 | adaptive composition 잔재(`ReferenceBlockKind`, `resolveRequiredExecutionSlots`, `addable vocabulary`) 는 source tree에 존재하지 않는다 | `rg -n "ReferenceBlockKind|resolveRequiredExecutionSlots|addableVocabulary"` → 0 hits |

---

## 5. 구현 로드맵 (5단계)

이 로드맵은 v5 전환의 실행 순서다. 각 단계는 bench 숫자 또는 unit test로 검증된다.

1. **프롬프트 하드닝 (0.5일)**
   - `<br>` 금지 + "긴 텍스트는 요소를 분리" hint + overflow 힌트 추가
   - `bench/method-compare-phase1/` 에서 flash-lite Method B 재벤치 → `dom_grammar_ok` ≥ 97%, 전체 pass rate ≥ 95% 확인
2. **DOM → Tooldi Layer Graph 결정적 transpiler 스켈레톤 (1~2일)**
   - `toolditor/` 또는 `tooldi-agent-runtime/` 안 한 파일로 시작
   - `canvasObjectFactories.ts` 재사용, 매핑 테이블(§2 Stage 5) 15종을 우선 구현
   - 5~10 prompt 샘플로 end-to-end `DOM → AllElementTypes[]` 무손실 검증
3. **Text Overflow/Overlap Post-Processor (0.5일)**
   - Fabric textMeasure 기반 fontSize step-down + width 확장
   - Stage 5 후단에 삽입, transpiler 테스트 스위트에 덧붙임
4. **Legacy 코드 삭제 plan 문서 (1~2시간)**
   - §3.2 폐기 목록 기반 PR 단위 분할
   - 각 PR은 AC-V7 (`rg` 증거) 를 반드시 첨부
5. **철학/아키텍처 문서 Lock (이 문서)**
   - v5 SSOT 제정 및 downstream projection 갱신 (AGENTS.md, doc-index, representation/template-intelligence supersede banner, current-state-as-is 전환 노트)

---

## 6. Operational Constraints / Known Risks

### 6.1 레이턴시 프로파일

- Stage 2 LLM call: flash-lite 기준 p50 3.1s, p95 ≤ 8s (bench 측정).
- Stage 3 validator: < 50ms.
- Stage 4 RAG: N placeholders × (embed 0.3s + Qdrant query 0.1s), 병렬.
- Stage 5 transpiler: < 100ms (순수 compute).
- Stage 6 post-processor: 100~300ms.
- 총 p50 예상: 4~6s. 2분 SLA에 충분.

### 6.2 cost 프로파일 (2026-04-20 기준 추정)

- flash-lite default: $0.0004 / prompt = ~$0.007 / 20 prompts.
- 3-pro 상한 확인용: $0.05 / prompt. bench-only 또는 프리미엄 요청 전용.
- RAG embedding: Qdrant 로컬 실행 시 추가 API 비용 0. jina-clip-v2는 로컬 embedding 사용.

### 6.3 알려진 리스크

| ID | 리스크 | 완화 |
| --- | --- | --- |
| R-V1 | flash-lite의 Korean 타이포 품질 ceiling이 3-pro보다 낮음 | 프리미엄 요청은 3-pro fallback 허용 (feature flag) |
| R-V2 | Fabric.js ↔ 브라우저 text metric 드리프트 (한글 줄바꿈 차이) | Stage 6 post-processor로 재정산 |
| R-V3 | Qdrant 인덱스 규모(현재 300건) 대비 asset diversity 부족 | 인덱스 수천~수만 확장은 별도 운영 작업 |
| R-V4 | DOM grammar whitelist가 창의적 프롬프트에 제약이 됨 | validator reject 로그 모니터링, whitelist 확장은 SSOT 개정 수반 |
| R-V5 | Stage 2 model 공급자 정책/가격 변경 | `modelRegistry.ts`의 bench 증거 요구로 자동 교체 방지 |

---

## 7. Governance

### 7.1 수정 규칙

- §1 철학/axiom/anti-pattern, §2 파이프라인 계약, §3 재사용·폐기·신설 경계를 수정하려면 **이 SSOT를 먼저 개정**하고, 그 다음 downstream projection을 맞춘다.
- Stage 2 grammar whitelist 확장은 이 SSOT 개정이 선행되어야 한다. "임시로만 풀자" PR은 반려.
- Model default 교체는 §0.3 근거에 `bench/method-compare-phase1/` 새 실행 링크와 parity 증거를 추가하고 V5 axiom 준수 명시 후 허용.

### 7.2 문서 권위 순서

1. **이 문서 (v5 SSOT)** — 설계 철학, 파이프라인 계약, 재사용·폐기 경계, 모델 선택 regime authority.
2. `tooldi-natural-language-agent-v1-architecture.md` — runtime semantic contract (artifact identity, completion moment, Canvas Mutation Protocol 구조).
3. `tooldi-agent-workflow-v1-functional-spec-to-be.md` — public/API/persistence projection.
4. `tooldi-agent-workflow-v1-backend-boundary.md` — backend/worker/queue/store 경계.
5. `toolditor-agent-workflow-v1-client-boundary.md` — FE 적용 경계.
6. `tooldi-agent-workflow-v1-scope-operations-decisions.md` — v1 scope / stack / operations.
7. `tooldi-agent-workflow-v1-create-template-current-state-as-is.md` — AS-IS.
8. `tooldi-agent-workflow-v1-doc-index.md` — 읽기 순서 인덱스.

### 7.3 검증 그립

- `rg -n "Template-Aware Adaptive Composition|ReferenceBlockKind|addableVocabulary|resolveRequiredExecutionSlots|retain/modify/remove/add" agent-workflow-test/ --glob '!*.historical*'` → 0 hits가 v5 전환 완료의 필요조건.
- `bench/method-compare-phase1/` 재실행은 모델 교체 PR의 필요조건.
- CLAUDE.md / AGENTS.md 최상단 권위 순서에 이 SSOT 파일이 첫 항목으로 등장해야 한다.

---

## 8. 고정된 대표 시나리오

- 빈 캔버스 1200×628
- 입력: `봄 세일 이벤트 배너 만들어줘`
- 2분 이내
- live-commit
- 결과: 편집 가능한 배너 초안 1개

(이 시나리오 자체는 architecture 문서 §2.2에서 규정되며 v5에서도 변경 없음.)
