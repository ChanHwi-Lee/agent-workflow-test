# Tooldi Agent Workflow v6 — Layout Freedom SSOT

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 문서명 | Layout Freedom SSOT (v6) |
| 문서 목적 | 자연어 디자인 에이전트의 설계 철학, 3단계 파이프라인, 모델 선택, 재사용·폐기 경계를 확정하고 모든 후속 개발의 유일 기준선(Single Source of Truth)이 된다. |
| 상태 | **Authority / Design Lock** |
| 작성일 | 2026-04-21 |
| 대상 시스템 | `agent-workflow-test/tooldi-agent-runtime` (agent-worker, agent-api), `toolditor` (FE agent-workflow-spike), `sandbox/embedding-test` (Qdrant + jina-clip-v2) |
| 대상 독자 | Agent Backend, FE, PM, QA, Reviewer |
| 소유 | Agent Workflow 팀 |

---

## 0. 이 문서의 권위

이 문서는 2026-04-21자 기준 **자연어 에이전트 아키텍처의 유일 철학 SSOT**다. 충돌 발생 시 이 문서가 이긴다.

2026-04-28 legacy cleanup PR0~PR7 이후 live runtime은 이 SSOT의 projection인 **v6-only `object_native_v1`** 로 잠겼다. PostgreSQL/Drizzle persistence, LangGraph `PostgresSaver`, required `workflowVariant`, full `latestSaveReceipt` finalize input, v6 mutation/save/finalize path가 현재 기준선이다.

2026-04-30 기준 Phase 6 placeholder asset resolution은 Qdrant-first 흐름을 유지하되, 후보가 없거나 selector가 후보를 부적합하다고 판단한 경우에만 native Gemini image generation fallback을 허용한다. 생성 결과는 반드시 runtime object store에 저장한 Tooldi-owned URL로 바뀐 뒤 bitmap primitive에 들어가며, provider inline data나 provider URL은 canvas mutation으로 넘어가지 않는다.

### 0.1 이 문서가 대체하는 문서

| 문서 | 상태 변경 |
| --- | --- |
| `tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md` | **Historical context — 대체됨.** 제약 HTML grammar(`position:absolute` 강제, whitelist CSS, line-break sibling 분해)와 deterministic DOM→Tooldi transpiler 경로는 이 SSOT로 폐기된다. Phase 0 PoC가 free HTML + 브라우저 렌더 + 결정적 추출로 같은 편집성을 더 적은 제약으로 달성 가능함을 증명(2026-04-21 PHASE-0-REPORT). |
| `tooldi-agent-workflow-ssot-template-aware-adaptive-composition.md` | **Historical** (이전에도 대체된 상태 유지) |
| `tooldi-agent-workflow-v1-create-template-representation-design-lock.md` | **Historical** (이전에도 대체된 상태 유지) |
| `tooldi-agent-workflow-v1-template-intelligence-design-lock.md` | **Historical** (이전에도 대체된 상태 유지) |
| `tooldi-agent-workflow-vnext-object-native-reference-architecture.md` | **Historical** (이전에도 대체된 상태 유지) |
| `tooldi-agent-workflow-v4-topology-driven-editor-native-architecture.md` | **Historical** (이전에도 대체된 상태 유지) |

### 0.2 이 문서가 **대체하지 않는** 문서

아래 문서는 v6 파이프라인과 정합성을 유지하며 여전히 normative authority를 가진다.

- `tooldi-natural-language-agent-v1-architecture.md` — artifact identity, counted completion moment, lifecycle ownership, ordering, rollback semantics, Canvas Mutation Protocol 구조 authority. 설계 철학 참조는 이제 v6를 향한다.
- `tooldi-agent-workflow-v1-backend-boundary.md` — backend/worker/queue/store 경계.
- `toolditor-agent-workflow-v1-client-boundary.md` — FE/toolditor 적용 경계. Canvas Mutation Protocol ack/emit 계약 유지.
- `tooldi-agent-workflow-v1-functional-spec-to-be.md` — public/API/persistence projection. 철학 섹션은 v6 기준으로 갱신되어야 한다.
- `tooldi-agent-workflow-v1-scope-operations-decisions.md` — v1 scope/non-scope, stack lock, operations.
- `tooldi-agent-workflow-v1-create-template-current-state-as-is.md` — AS-IS. v6 전환 진행 중 상태 기록.

### 0.3 증거 기반

v6는 2026-04-21 실행된 다음 실증에 근거한다.

- **Phase 0 PoC** (`agent-workflow-test/v6-poc/`): 5종 HTML 샘플(flat-absolute / flex-centered / nested-wrapper / svg-decoration / mixed-text-image) 각각에 대해 Playwright 렌더 → DOM 추출 → primitive 매핑 → 커맨드 재렌더링이 **md5 pixel-identical**로 왕복 성공. 브라우저 layout 계산 경로가 제약 HTML 경로와 동일한 편집성을 제공하면서 LLM 출력 제약을 최소한으로 축소함을 입증.
- **Phase 4 E2E smoke** (`v6-poc/smoke/`): 20 prompt 중 5종(restaurant / product_launch / education / healthcare / kids) E2E 실행에서 5/5 렌더 성공, primitive count 9~13, total latency p50 ~5.5s. 자연어 → HTML 생성 → 브라우저 렌더 → primitive map → adapter 경로 전체가 프로덕션 경로로 동작함을 확인.
- **모델 벤치** (`bench/method-compare-phase1/`): 2026-04-20 실행의 cost/latency/품질 관계는 v6에서도 유효. default `gemini-3.1-flash-lite-preview`는 여전히 유지.

---

## 1. 철학 정의 — Layout Freedom Pipeline

### 1.1 원라인 정의

> **시스템은 LLM에게 free HTML 출력을 허용하고(security만 제약), 브라우저가 layout을 계산하며, 결정적 코드가 rendered DOM을 Tooldi editor-native primitive로 추출한다. Layout family / slot / role / CTA / topology 를 contract로 승격하지 않는다.**

### 1.2 다섯 가지 원칙 (Locked)

| # | 원칙 | 의미 |
| --- | --- | --- |
| P1 | **LLM은 결과를 만든다.** | LLM은 사용자 의도를 담은 자유도 있는 HTML을 생성한다. flex/grid/absolute/calc/transform 등 layout 기법은 전부 허용. |
| P2 | **브라우저는 layout 을 계산한다.** | Playwright Chromium이 `getBoundingClientRect` + `getComputedStyle` 로 최종 pixel 위치와 스타일을 산출한다. 코드가 layout을 재발명하지 않는다. |
| P3 | **코드는 결과를 추출한다.** | DOM traversal이 primitive(rect/text/image/bitmap/svg) 를 직접 내보낸다. 분류/추론/heuristic 없음. 같은 DOM → 항상 같은 primitive 집합. |
| P4 | **Layout family / slot / role / CTA / topology 를 contract 로 승격하지 않는다.** | 파이프라인 어디에도 "이 블록은 CTA다"같은 classification 개념을 주입하지 않는다. CTA처럼 보이는 rect+text 조합도 단지 rect 1개 + text 1개 primitive 로 자연스럽게 표현된다. |
| P5 | **Completion = editability + renderability + save truth.** | 완료 판정 축은 v5와 동일. primitive가 edit 가능하고 Tooldi canvas 가 렌더 가능하며 save receipt 이 확인된 상태로 한다. |

### 1.3 금지 패턴 (Anti-patterns)

| 금지 패턴 | 왜 금지하는가 |
| --- | --- |
| Layout family / slot / role / CTA / topology 를 contract 로 승급 | P4 위반. v1~v5 의 반복 실패 원인. v6 bench + Phase 0 PoC 에서 이 개념들이 없어도 편집 가능한 결과를 낸다는 게 증명됨. |
| Pass-2 를 LLM 에 위임 | v5 V2 계승. LLM → LLM 직렬은 비결정성을 곱한다. primitive 매핑은 순수 코드. |
| 제약 HTML grammar 부활 (position:absolute 강제, child 수 제한, line-break sibling 분해) | v5 경로 회귀 금지. Phase 0 PoC 가 free HTML 로 동일 결과를 내므로 grammar 잠금은 불필요. |
| 중간에 LLM으로 "refine" | 폐기. Stage 1 → Stage 2 → Stage 3 직렬, LLM 호출 1회. |
| 분류 / 추론 / heuristic 기반 primitive 매핑 | P3 위반. "이 rect 는 background 다" 같은 라벨링 금지. 그냥 rect. |
| Chromium/Puppeteer/html2canvas 렌더링을 pixel raster 로 변환해 편집 UI 에 주입 | editability 파괴. DOM parse 만 허용. |
| 모델 default 를 bench 없이 교체 | 계승. `bench/method-compare-phase1/` 재실행 + parity/cost/latency 증거 PR 필수. |
| slot/role/cluster completeness 를 completion gate 로 복구 | 계승. 완료 판정은 editability + renderability + save truth 3축만. |
| Primitive type 하위 분류를 QA/게이트 contract 로 도입 | `text/image/bitmap/svg/rect` 는 닫힌 primitive 집합이다. `decorative-svg`, `logo-svg`, `hero-image`, `cta-text` 같은 하위 vocabulary 를 만들면 slot/role 을 이름만 바꿔 복구하는 것이므로 금지한다. |
| Render QA 에서 content / src / class / parent role 을 검사 | Render QA 는 bounds, visibility, scroll metrics, primitive type 같은 렌더 관측값만 본다. 텍스트 내용, `placeholder://` hint, class name, 부모 DOM 의 의미를 검사하면 semantic slot/topology 회귀가 된다. |
| Render QA threshold 를 domain / intent / layout family 별로 분기 | threshold 는 canvas geometry 와 닫힌 primitive type 에 대한 정적 정책이어야 한다. "카페라서", "학원이라서", "좌우형이라서" 같은 분기는 layout family/topology 복구 신호다. |
| Primitive count 를 semantic completeness 로 해석 | `0 primitives` 같은 렌더 실패 판정은 허용되지만, "CTA 가 없다", "hero 가 없다", "가격이 2개다" 같은 completeness gate 는 금지한다. |

---

## 2. 3단계 파이프라인 (Normative)

파이프라인은 아래 3단계로 고정된다. 각 단계는 명확한 입력·출력 경계를 가지며, 책임 침범이 원칙 위반이다.

```
┌──────────────────────────────────────────────────────────────┐
│ Stage 1  Free HTML Generation       (LLM, 1회)                │
│ Stage 2  Security Validate + Browser Render + DOM Extraction  │
│          (deterministic)                                      │
│ Stage 3  Primitive Map → Command Adapter → SSE Envelope       │
│          (deterministic)                                      │
│          → Canvas Mutation / SSE / Completion Gate (reuse)    │
└──────────────────────────────────────────────────────────────┘
```

### Stage 1 — Free HTML Generation (LLM)

- **모델**: `gemini-3.1-flash-lite-preview` (default). 교체는 §0.3 근거 + bench harness 재실행 필수.
- **입력**: 사용자 자연어 prompt + `editorContext.canvasWidth/Height`.
- **출력**: self-contained HTML snippet 문자열.
- **프롬프트 락 (`v6SystemPrompt.ts` §P1)**:
  - 출력은 단 하나의 root `<div>` 로 시작, 명시적 픽셀 폭/높이(canvas size 일치).
  - `<!DOCTYPE>`, `<html>`, `<head>`, `<body>`, `<style>` block, markdown code fence, surrounding prose 금지.
  - 인라인 `style` 만 허용. class attribute / 외부 CSS / 외부 JS 금지.
  - **Layout 자유**: flex / grid / absolute / relative / margin / padding / calc / transform / rotate / nested wrappers 전부 허용.
  - 허용 태그: `<h1>~<h6>`, `<p>`, `<span>`, `<div>`, `<strong>`, `<em>`, `<img>`, `<svg>` + SVG 자식.
  - 이미지 placeholder: `<img src="placeholder://<hint>" width="..." height="...">` 형식 강제(Phase 0 PoC 리스크 R-2).
  - 폰트: registry 에 선언된 Toolditor ID (`701_400`, `701_700`, `1301_400`) 만 허용 (§3 font pipeline).
  - **금지 태그 / 속성 (security)**: `<script>`, `<style>`, `<link>`, `<meta>`, `<base>`, `<form>`, `<input>`, `<textarea>`, `<select>`, `<button>`, `<iframe>`, `<canvas>`, `<video>`, `<audio>`, `<object>`, `<embed>`, on* 이벤트 핸들러, CSS animation/transition/@keyframes/pseudo-classes.
- **운영 제약**: `responseMimeType` plain text. self-repair loop 없음(Stage 1 실패는 run 전체 실패).

### Stage 2 — Security Validate + Browser Render + DOM Extraction

- **입력**: Stage 1 HTML.
- **출력**: `V6ExtractionResult` — `RenderedElement[]` with bounds, computed style, image/svg payload.
- **구현**:
  - `v6HtmlValidator.ts`: `<script>`, `<style>`, on-handlers, CSS animation/transition/pseudo 등 security 위반 탐지. 실패 시 run fail.
  - `v6BrowserRender.ts`: Playwright Chromium 기동 (Phase 4 시점 ephemeral; Phase 5 warm pool) → `setContent` 전에 @font-face 주입(§3) → `page.evaluate` 안에서 DOM traversal, `getBoundingClientRect` + `getComputedStyle` 캡처.
- **불변량**: 같은 HTML 입력 → 같은 `V6ExtractionResult` (Linux headless Chromium 기준 pixel-identical; macOS/Windows drift 는 Phase 5 에서 측정).
- **Placeholder 이미지**: `placeholder://*` route 인터셉터가 1×1 transparent PNG 반환.

#### Stage 2.5 — Render QA Observation / Gate Candidate

- **목적**: 브라우저가 계산한 렌더 결과가 캔버스 안전 불변식을 깨는지 관측한다. 이 단계는 디자인을 평가하지 않고, 렌더링 안전성만 검사한다.
- **입력**: `V6ExtractionResult`.
- **출력**: `V6RenderQualityReport` — root/canvas mismatch, off-canvas, scroll overflow, zero-area, text density 등의 닫힌 failure mode 목록.
- **닫힌 축**:
  - primitive type: `text`, `image`, `bitmap`, `svg`, `rect` (Stage 3 primitive table 과 동일, 하위 분류 금지)
  - failure mode: `root_bounds_mismatch`, `off_canvas_*`, `scroll_overflow`, `zero_area`, `high_text_density`
- **정책 원칙**:
  - hard gate 후보는 root bounds mismatch, visible text/image loss, visible text scroll overflow 처럼 정보 손실 위험이 큰 정적 primitive 정책으로만 정한다.
  - `rect/svg` off-canvas bleed 는 의미를 추정하지 않고 warning 으로 둔다. "장식이라서"가 아니라 해당 primitive type 전체에 동일한 loss tolerance 를 적용하는 정책이다.
  - 텍스트 내용, 이미지 src hint, class name, 부모/자식 DOM 역할, 도메인/intent, layout family 를 검사하지 않는다.
- **현재 상태**: `V6RenderQualityReport` 는 관측 artifact 를 남기고, blocking issue 가 있으면 첫 생성 결과를 폐기한 뒤 geometry-only feedback 으로 Stage 1 을 1회 재시도한다. 두 번째 생성도 blocking issue 를 남기면 primitive mapping 전 run 을 실패시킨다.
  - `count_zero` 는 Stage 3 의 `V6EmptyCommandsError` 로 별도 처리한다.

### Stage 3 — Primitive Map + Command Adapter + SSE Envelope

- **입력**: `V6ExtractionResult`.
- **출력**: `CreateLayerCommand[]` (contracts 계약) + Canvas Mutation envelope (SSE용).
- **구현**:
  - `v6PrimitiveMapper.ts`: DOM 순회 → primitive 방출.
  - `v6AssetResolver.ts`: `placeholder://` bitmap의 `src`만 Qdrant asset URL, native Gemini generated artifact URL, 또는 unresolved fallback으로 교체한다. 이 단계는 bounds/style/z-order를 수정하지 않는다.
  - `v6CommandAdapter.ts`: primitive → `CreateLayerCommand` (Toolditor layerType 매핑).
  - `emitV6Mutations.ts`: `CreateLayerCommand[]` 을 하나의 `MutationProposalDraft` 로 묶어 `CanvasMutationEnvelopeSchema` 에 싣는다.
- **Primitive 매핑 표 (normative)**:

| DOM 조건 | Primitive → Tooldi layerType |
| --- | --- |
| `<svg>` inline | `svg` (`outerHTML` 보존) |
| `<img>` with placeholder:// or *.png | `bitmap` |
| `<img>` with *.jpg/jpeg | `image` |
| text leaf element (`<h1>~<h6>`, `<p>`, `<span>`, `<div>`, `<strong>`, `<em>` with only text children) | `text` (bounds를 padding+border inset) |
| element with visible paint (bg-color / gradient / border) | `rect` (→ `shape` layerType) |
| element with visible paint + text leaf (CTA 패턴) | **rect + text 2개** primitive 방출 (group 개념 없음) |

- **불변량**: LLM 호출 없음. 같은 `V6ExtractionResult` 입력 → 항상 같은 layer graph 출력.
- **SSE envelope**: 기존 v5 와 동일한 `CanvasMutationEnvelopeSchema`, 단 `operation = "v6_apply_freeform_layout"`, `planSchemaVersion = "v6-freeform-layout"`. ownership/rollback/commitGroup 규칙 모두 재사용.

### Stage 4 (경계 재사용) — Canvas Mutation / SSE / Completion Gate

- **재사용**: 기존 Canvas Mutation Protocol (`toolditor-agent-workflow-v1-client-boundary.md`), SSE event 구조 (`tooldi-natural-language-agent-v1-architecture.md`), completion gate (editability + renderability + save receipt) 그대로 사용.
- 스트리밍 partial emit은 Phase 5/6 주제.

---

## 3. Font Pipeline (Phase 2.5)

### 3.1 Registry SSOT

- `agent-workflow-test/fonts/registry.json` — **단일 SSOT**. v6-poc 와 agent-worker 모두 이 JSON 을 참조한다. 중복 복사 금지.
- 각 entry 는 `{ toolditorId: "<serial>_<weight>", savedFilename: "<serial>_<weight>.woff", cdnBase: "https://dev-file.tooldi.com/font" }` 형식.

### 3.2 Runtime 흐름

1. **HTML generator** (`v6SystemPrompt.ts`) 가 사용 가능한 Toolditor ID 목록을 system prompt 에 명시. LLM 은 `font-family: "701_400"` 형태로 출력.
2. **Browser renderer** (`v6BrowserRender.ts`) 가 `setContent` 직전에 `@font-face` 블록을 inject. 첫 단어 CSS family 가 Toolditor ID.
3. **Command adapter** (`v6CommandAdapter.ts`) 가 `parseFirstFontFamily()` 로 computed-style cascade 의 첫 토큰만 추출해 Toolditor ID 로 전달.

### 3.3 Registry 수정 규칙

- 폰트 추가/제거 시:
  - `fonts/registry.json` 갱신
  - `v6SystemPrompt.ts` 의 Available fonts 섹션 갱신
  - Toolditor 쪽 font catalog 와 일치 확인

---

## 4. 모듈 재사용 / 폐기 / 신설 경계

### 4.1 재사용 (유지)

| 모듈 | 역할 |
| --- | --- |
| `normalize_intent`, `plan_intent_draft` | 사용자 prompt normalization |
| Canvas Mutation Protocol / SSE emit+ack | Stage 4 |
| completion gate (editability + renderability + save receipt) | Stage 4 |
| `@tooldi/agent-contracts` `CreateLayerCommand` / `CanvasMutationEnvelopeSchema` | Stage 3 |
| bench harness (`bench/method-compare-phase1/`) | 모델 교체 증거 |
| `sandbox/embedding-test/` Qdrant + jina-clip-v2 PoC | Phase 6 RAG (placeholder asset 매핑) |

### 4.2 폐기 (v5→v6 리셋)

| 모듈 | 사유 |
| --- | --- |
| `v5HtmlValidator`, `v5MethodBHtmlGen`, `v5MethodBSystemPrompt`, `v5PipelineOrchestrator`, `v5Transpile/`, `emitV5SkeletonMutations`, `v5PipelineNode` | v5 경로 전체 폐기 — v6 로 대체됨 |
| `bench/method-compare-phase1/method-b-system.txt` | v5 prompt 텍스트. 폐기 |
| Toolditor `features/agent-workflow-spike/fixtures/v6Fixtures.ts` + AgentHappyPathPanel 의 fixture 주입 섹션 | Phase 2 임시 harness. Phase 4 완료 시 제거 |
| `build_template_prior_summary`, legacy build/refinement graph, `rule_judge`, `refineDecision` path | 2026-04-28 cleanup 완료. v6 route는 free HTML → render/extract → primitive map → mutation/save/finalize로 닫힌다. |
| `TemplatePlanner`, `TEMPLATE_PLANNER_MODE`, heuristic/langchain planner switch | planner abstraction 제거. v6 normalization은 fixed deterministic draft path를 사용한다. |
| LangGraph `MemorySaver` fallback | PostgreSQL `PostgresSaver` 전용화. HITL/resume/recovery는 PostgreSQL checkpoint를 기준으로 검증한다. |
| tool registry / tool adapters / primitive-storage / text-layout adapter packages | live v6 경로에서 caller가 없는 package-level dead code로 제거. |

### 4.3 신설 (Phase 4)

| 모듈 | 역할 |
| --- | --- |
| `v6HtmlGen.ts`, `v6SystemPrompt.ts` | Stage 1 |
| `v6HtmlValidator.ts`, `v6BrowserRender.ts`, `v6FontRegistry.ts` | Stage 2 |
| `v6PrimitiveMapper.ts`, `v6CommandAdapter.ts`, `emitV6Mutations.ts` | Stage 3 |
| `graph/v6PipelineNode.ts` | LangGraph 노드 |
| `v6-poc/` (PoC + E2E smoke harness) | 개발/검증 |

---

## 5. Verification Traceability Map

| AC ID | acceptance criterion | 단일 검증 anchor |
| --- | --- | --- |
| AC-V6-P1 | representative run (`봄 세일 이벤트 배너 만들어줘`)에서 2분 내 편집 가능한 배너 초안 1개가 live-commit 된다 | `tooldi-natural-language-agent-v1-architecture.md` §2.2 (재사용) |
| AC-V6-P2 | Stage 2 security validator 가 v5 grammar 제약(`flex`, `grid`, `calc` 등) 을 통과시킨다 | `v6HtmlValidator.test.ts` "v5 grammar constraints are lifted" |
| AC-V6-P3 | Stage 3 primitive mapper 는 같은 extraction 입력 → 항상 같은 command 배열 출력 | `v6PrimitiveMapper.test.ts` 전체 |
| AC-V6-P4 | completion gate 3축이 성공 판정의 유일 기준이다 | `tooldi-natural-language-agent-v1-architecture.md` §4.1.1 `completion_sla_definition` 재사용 |
| AC-V6-P5 | default 모델 교체 PR은 bench artifact 경로와 parity 증거를 포함한다 | PR template, `bench/method-compare-phase1/` 경로 필수 포함 |
| AC-V6-P6 | v5 legacy 잔재가 source tree 에 없다 | `rg -n "v5HtmlValidator\|v5MethodBHtmlGen\|v5MethodBSystemPrompt\|v5PipelineOrchestrator\|emitV5SkeletonMutations\|v5Transpile\|v5PipelineNode\|V5PipelineDependencies\|V5_APPLY_OPERATION" agent-workflow-test/tooldi-agent-runtime --glob '!dist/**'` → 0 hits |
| AC-V6-P7 | Phase 0 PoC round-trip pixel-identical | `v6-poc/PHASE-0-REPORT.md` md5 매칭 로그 |
| AC-V6-P8 | Phase 4 5-sample E2E smoke 모두 렌더 에러 없음 | `v6-poc/smoke/summary.json` 에 `{ ok: true }` 5개 |
| AC-V6-P9 | live runtime이 legacy object-native audit/refinement artifact를 필수로 요구하지 않는다 | `pnpm local:toolditor:eval:object-native:real` 이 legacy `object-native-reference-audit` 계열 artifact 없이 v6 run summary를 생성 |

---

## 6. Operational Constraints / Known Risks

### 6.1 레이턴시 프로파일 (Phase 4 smoke 기준)

- Stage 1 LLM call: flash-lite 기준 p50 4.5s (4.0–5.0s, 관측 5 sample).
- Stage 2 browser render + extract: p50 1.0s (0.8–1.5s).
- Stage 3 map + adapter + emit: < 100ms (순수 compute).
- **총 p50**: ~5.5s. 2분 SLA 에 충분.

### 6.2 cost 프로파일 (2026-04-20 bench 기준 유지)

- flash-lite default: $0.0004 / prompt = ~$0.002 / 5 prompts.

### 6.3 알려진 리스크

| ID | 리스크 | 완화 |
| --- | --- | --- |
| R-V6-1 | OS별 Chromium font hinting / layout drift (Linux vs macOS vs Lambda) | Phase 5 에서 배포 환경(`@sparticuz/chromium`) parity 측정. Phase 4 는 Linux headless 만. |
| R-V6-2 | Placeholder 이미지에 width/height 미지정 시 `<img>` bounds 0 붕괴 | Stage 1 prompt 에 inline width/height 강제. Stage 2 validator 에서 향후 강제 검사 추가 검토. |
| R-V6-3 | 동일 bounds 의 rect+text 조합에서 z-order 가 DOM 순서와 다르게 해석될 위험 | DOM traversal 순서를 그대로 z-order 로 사용. Phase 2 Toolditor 통합에서 이미 검증됨. |
| R-V6-4 | Gemini 공급자 정책/가격 변경 | `modelRegistry` + bench 증거 요구. 직감 교체 금지. |
| R-V6-5 | Playwright 버전 드리프트 (agent-worker 설치본 ↔ Lambda Chromium layer) | Phase 4 에서 `^1.59.0` 으로 고정. Phase 5 Docker 화에서 이미지 버전 일치 확인. |

---

## 7. Governance

### 7.1 수정 규칙

- §1 철학/원칙/anti-pattern, §2 3단계 파이프라인, §4 재사용·폐기·신설 경계를 수정하려면 **이 SSOT를 먼저 개정**하고, downstream projection을 맞춘다.
- Stage 1 prompt security whitelist/blacklist 확장은 이 SSOT 개정이 선행되어야 한다. "임시로만 풀자" PR 은 반려.
- Model default 교체는 §0.3 근거에 `bench/method-compare-phase1/` 새 실행 링크와 parity 증거를 추가하고 허용.

### 7.2 문서 권위 순서

1. **이 문서 (v6 SSOT)** — 설계 철학, 3단계 파이프라인, 재사용·폐기 경계, 모델 선택 regime authority.
2. `tooldi-natural-language-agent-v1-architecture.md` — runtime semantic contract.
3. `tooldi-agent-workflow-v1-functional-spec-to-be.md` — public/API/persistence projection.
4. `tooldi-agent-workflow-v1-backend-boundary.md` — backend/worker/queue/store 경계.
5. `toolditor-agent-workflow-v1-client-boundary.md` — FE 적용 경계.
6. `tooldi-agent-workflow-v1-scope-operations-decisions.md` — v1 scope / stack / operations.
7. `tooldi-agent-workflow-v1-create-template-current-state-as-is.md` — AS-IS.
8. `tooldi-agent-workflow-v1-doc-index.md` — 읽기 순서 인덱스.

### 7.3 검증 그립

- `rg -n "v5HtmlValidator|v5MethodBHtmlGen|v5MethodBSystemPrompt|v5PipelineOrchestrator|emitV5SkeletonMutations|v5Transpile|v5PipelineNode|V5PipelineDependencies|V5_APPLY_OPERATION" agent-workflow-test/tooldi-agent-runtime --glob '!dist/**'` → 0 hits.
- `bench/method-compare-phase1/` 재실행은 모델 교체 PR 의 필요조건.
- CLAUDE.md / AGENTS.md 최상단 권위 순서에 이 SSOT 파일이 첫 항목으로 등장해야 한다.

---

## 8. 고정된 대표 시나리오

- 빈 캔버스 1200×628
- 입력: `봄 세일 이벤트 배너 만들어줘`
- 2분 이내
- live-commit
- 결과: 편집 가능한 배너 초안 1개

(이 시나리오 자체는 architecture 문서 §2.2 에서 규정되며 v6 에서도 변경 없음.)
