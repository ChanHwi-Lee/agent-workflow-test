# AGW v5 Post-Step 2 Handoff — E2E 데모 → Legacy 청산 → RAG 실구현

## Goal

AGW v5 Step 1 (프롬프트 하드닝) + Step 2 (HTML → Layer Graph Transpiler) 는 완료됨. 이 handoff 는 **그 위에서 수행할 후속 작업 4개 (D → A → B → C) 를 지정된 우선순위로 진행**하도록 새 스레드에 context 를 이전한다.

최상위 목표:
1. v5 6-stage 파이프라인을 **end-to-end 동작 증명** (D)
2. v5 §3.2 폐기 모듈을 **파괴적으로 청산** (B)
3. RAG Asset Swap 을 **placeholder 인터페이스가 아닌 실 DB/S3/API 연동으로 구현** (C — 이 원칙은 lock)

---

## Current State (2026-04-20 기준)

### 브랜치 / 커밋 상태

**tws-editor-api** (문서/벤치 리포):
- 브랜치: `feature/v5-agent` (from `feature/retrieval-prior-stack@61992db`)
- 커밋:
  - `0b0225a [chore] AGW v5 Step 1 bench harness baseline 스냅샷`
  - `5f89a49 [feat] AGW v5 Step 1 Method B prompt 하드닝 — <br> 금지 + 줄바꿈 분리 + overflow 힌트`
- 푸시 안 됨.

**toolditor** (코드 리포):
- 브랜치: `feature/ai-agent-base` (작업 진행 중인 long-lived branch) 와 `feature/v5-agent` (이번 Step 2 커밋을 가리키는 parallel branch) 두 개가 동일 HEAD 를 가리킴.
- 커밋:
  - `880418c8c [feat] AGW v5 Step 2 HTML → Layer Graph Transpiler`
  - `f9bd91232 [test] AGW v5 Step 2 runtime integration — transpile 출력 100% 런타임 수용 검증`
- 푸시 안 됨.
- Pre-existing unstaged 수정 (이번 스레드가 건드리지 않음): `contracts.ts`, `fixedRunRequest.ts`, `useAgentHappyPathController.ts`, `AgentHappyPathPanel.tsx`. 이전 세션 잔재 — 새 스레드가 필요하면 정리할 수 있으나, D/B 작업 전에 내용 확인 후 결정.

### 검증 상태

- toolditor 의 `transpile/` 모듈: **62/62 pass** (parseInlineStyle 16 + parseGradient 6 + classify 11 + transpile smoke 26 + runtime integration 3).
- 20개 v2 bench fixture (outputs-3.1-flash-lite-v2/method-b/prompt_*.json) 전부 `buildObjectForCreateLayerCommand` 에서 outcome='apply' (reject 0건).
- Bench Method B 최종 지표 (flash-lite): weighted pass rate **100%**, dom_grammar_ok **20/20**, bounds_ok 20/20.
- TS 빌드: **RED** (예상된 상태). B (Legacy cleanup) 범위에서 해소. IDE 진단에 AgentHappyPathPanel/buildNodes/buildTemplatePriorBundle.test 의 legacy import 오류 지속 표시.

---

## Locked Decisions — v5 핵심 원칙 (normative, **재오픈 금지**)

### 아키텍처 철학 (v5 SSOT 에서 계승)

- **v5 SSOT** (`tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md`) 는 authority hierarchy #1.
- **6-stage 파이프라인**: Intent Normalize → HTML Design Pass → Validator + Self-Repair → RAG Asset Swap → DOM → Layer Graph Transpiler → Text Overflow Post-Processor.
- **Default 모델**: `gemini-3.1-flash-lite-preview`. 교체는 재벤치 증거 필수.
- **Completion 판정 3축**: editability + renderability + save truth. **slot/cluster completeness 금지**.
- **V1 axiom**: LLM 은 디자인 판단만, 코드는 직렬화만.
- **V2 axiom**: Pass-2 이후 단계는 결정적 (no LLM in transpile/RAG/post-process).

### 이번 스레드에서 확정된 설계 결정

- **executionSlotKey = null 모두**: v5 가 생성한 commands 는 slot 을 semantic 계획 primitive 로 사용하지 않음. Runtime mutationObjectBuilder 는 null slot 을 non-semantic 경로로 dispatch, `styleTokens.fillColor/secondaryColor/cornerRadius/textAlign` + `metadata.customFontSize/Family/Weight/copyText` 가 semantic fallback 값을 override.
- **CTA/badge compound 재조립 불필요**: hardened Method B 가 이미 sibling (shape+text) 으로 flat 출력. runtime 도 각각 독립 layer 로 받음.
- **Template RAG = dead**: 이전 버전은 템플릿 RAG 로 레이아웃을 조립했지만 v5 는 레이아웃/초안 자체를 LLM 이 생성. Template-level semantic search 경로는 폐기. 이후 RAG 는 **에셋 단위** 에만 적용.
- **Linear gradient 1급**: Tooldi runtime 이 `styleTokens.secondaryColor` 를 보면 자동으로 `buildLinearGradientFill` 호출. transpiler 는 `linear-gradient(...)` → `{ fillColor, secondaryColor, gradientAngle }` 매핑.
- **SOLID 경계 고정**:
  - **SRP**: 각 stage = 하나의 관심사. Transpiler 는 HTML→commands 만.
  - **OCP**: RAG 는 별도 hook (preprocess HTML src 재작성 OR postprocess updateLayer(assetBinding)). transpiler 본체 건드리지 않음.
  - **DIP**: htmlparser2 는 `parseHtml.ts` 한 곳으로만 의존. 다른 모듈은 자체 `ParsedDomNode` 타입으로만 동작.

### 레거시 & RAG 원칙 (사용자 확정 — 반드시 준수)

- **레거시 = 청산 대상, not 유지보수 대상**: v5 §3.2 폐기 모듈은 파괴적으로 제거 가능. 하위 호환/점진 마이그레이션 배려 불필요. 제거 시 의존하는 테스트/UI 도 함께 삭제 또는 v5 버전으로 교체.
- **RAG 인터페이스 = 실사용 가능한 구체적 구현**: `AssetResolver` 같은 인터페이스를 "나중에 구현할 placeholder" 로 뚫어두는 것 **금지**. 실제 Qdrant + DB + S3 + API 를 호출하는 동작하는 코드여야 함. 범위가 너무 커서 별도 track 으로 분리해야 한다면 **분리하되 이 원칙은 문서에 계속 고정**.
- **이 원칙 deviation 필요 시 사용자에게 먼저 문의**.

### v5 §3.2 폐기 목록 (B 작업 범위)

- `buildObjectNativePath`, `buildReferenceResetPath`, `buildReferenceCompositionV2`, `buildTopologyPath`
- `ReferenceBlockKind`, `ObjectNativeClusterFamily`, `classifyTextBlock`, `classifySurfaceBlock`
- `resolveRequiredExecutionSlots`, addable vocabulary registry, projected object graph extractor, computable annotation generator
- `buildSearchProfile`, `assembleTemplateCandidates`, `buildTemplatePriorBundle`, `selectTemplateComposition`, `selectTypography`
- `ruleJudge`, `buildJudgePlan`, `buildRefineDecision`, patch-only refine loop
- `mutationObjectBuilder` 의 **slot-dispatch 분기 전체** → flat dispatcher 로 rewrite (layerType + styleTokens + metadata 만 보고 factory 선택)
- `AgentHappyPathPanel` 의 `startExperimental` / `startExperimentalV2` / `startExperimentalV2Reset` / `startExperimentalV3` / `startExperimentalV4` 및 연관 controller 경로 전부 — 단일 "v5 run" entry 로 대체

### 재사용 모듈 (유지)

- `contracts.ts` 의 `AgentLayerType`, `AgentCreateLayerCommand`, `AgentUpdateLayerCommand`, `AgentSaveTemplateCommand` (단, 불필요해진 필드 B 작업 중 정리 가능)
- `canvasObjectFactories.ts` 의 `buildTextObject` / `buildRectObject` / `buildCoverImageObject` / `buildPlacedImageObject` / `buildCtaGroupObject` / `buildLinearGradientFill`
- Canvas Mutation Protocol SSE adapter (`mutationAdapter.ts`)
- Completion gate 3축
- `sandbox/embedding-test/` Qdrant + jina-clip-v2 PoC (C 의 레퍼런스)
- 이번 Step 2 의 `transpile/` 모듈 (그대로 유지)

### 커밋 규칙 (locked)

- 대괄호 prefix: `[feat]` / `[fix]` / `[refactor]` / `[docs]` / `[test]` / `[chore]`
- `Co-Authored-By` **금지**
- `git add -A` **금지** (파일 개별 add)
- **푸시 금지** unless 사용자 명시 요청
- Toolditor 는 **npm/package-lock.json**. pnpm add 로 lockfile 섞지 말 것 (이 스레드에서 한 번 사고 발생 — 정리 완료).

---

## Work Order (사용자 승인된 순서)

### D (최우선) — E2E Pipeline Demo

**목표**: Step 2 까지 구현된 파이프라인을 "실제 LLM 호출 → canvas render" 까지 wire 해서 시각 증거 확보.

**Scope (do)**:
1. Runtime adapter: `transpileHtmlToCommands` 출력 (`AgentCreateLayerCommand[]`) 을 `mutationAdapter.ts` 의 canvas mutation SSE 에 feed.
2. UI entry: `AgentHappyPathPanel` 에 단일 **"v5 run"** 버튼 추가. 입력은 prompt string.
3. Controller: `useAgentHappyPathController` 에 v5 경로 wire:
   - prompt → Method B LLM 호출 (flash-lite, hardened method-b-system.txt 사용)
   - HTML 응답 → `transpileHtmlToCommands` 결정적 변환
   - commands → mutation SSE → canvas apply
4. 수동 E2E 검증: 예시 prompt "봄 신메뉴 카페 배너, 브랜드 컬러 그린, CTA '주문하기'" 로 run. Canvas 에 layer 가 실제로 렌더되는지 육안 확인 (placeholder 이미지는 빈 박스로 보이는 게 정상 — RAG 는 C 에서).
5. **파괴적 정리**: `AgentHappyPathPanel` 의 V1~V4 진입 버튼, 관련 controller 메서드 (`startExperimental`, `startExperimentalV2` 등) 모두 제거. 사용자 승인함.

**Scope (don't)**:
- RAG asset resolution (C 에서)
- Overflow post-processing (A 에서)
- TS 전체 빌드 green 화 (B 에서 — D 는 transpile 영역만 green 유지하면 됨)
- 실제 save persistence (save truth 는 completion gate 가 처리하는 기존 로직 재사용)

**Acceptance**:
- 버튼 클릭 → 로딩 → canvas 에 3~12개 layer 가 올바른 위치/크기/색으로 렌더됨
- 런타임 reject 0건 (buildObjectForCreateLayerCommand outcome='apply' 전부)
- SSE 이벤트 시퀀스 정상 (createLayer emit → apply ack)
- V1~V4 legacy 버튼 UI 상에서 완전히 사라짐

**Risks**:
- R-D1: SSE 이벤트 ordering / canvas hook timing — 단위테스트로 보이지 않는 통합 버그 가능. 계측 로깅 추가 후 단계별 확인.
- R-D2: flash-lite 의 실제 호출 당 variance — fixture 는 static 이지만 production 에선 매 호출마다 다른 HTML. 예상 못한 엣지 케이스 (e.g., `white-space`, `text-shadow`) 발견 시 transpile 에 warning 로그 + pass-through.
- R-D3: `useAgentHappyPathController` 의 pre-existing 수정이 이전 세션 작업 잔재 — D 작업 시작 전에 `git diff` 로 내용 확인하고, v5 작업에 맞게 정리 (또는 stash) 후 시작.

---

### A (조건부, D 결과에 따라) — Step 3 Text Overflow Post-Processor

**Trigger**: D 의 E2E 실행에서 overflow 가 실제로 자주 발생하면 착수. 드물면 skip 하고 B 로.

**Scope**:
- 순수 함수: `postProcessTextOverflow(html: string) → { html: string; adjustments: Adjustment[] }`
- Overflow 감지: `font-size × char_count × CJK(1.0 or Latin 0.55) > width × 1.1` → 위반 element 는 (a) font-size 축소 또는 (b) element 분할 (sibling 으로)
- Method B hardened prompt 가 이미 overflow 방지 힌트를 주지만 확률적 — post-processor 는 결정적 보정
- 적용 순서: transpile 전에 HTML 에 적용 (pipeline stage 6 = post-processor)

**Out of scope**:
- LLM 재호출로 regenerate
- 복잡한 텍스트 레이아웃 (justified, multi-column)

**Acceptance**:
- 20 fixture 에서 overflow 케이스 전부 보정
- False positive (이미 잘 맞는 텍스트) 0건
- transpile 결과 commands 수는 보정 전후 동일하거나 증가 (분할 시)

---

### B (D 완료 후) — Step 4 Legacy Cleanup

**목표**: v5 §3.2 폐기 목록 전부 삭제 + mutationObjectBuilder 를 flat dispatcher 로 rewrite. TS 빌드 green.

**Scope**:

1. **폐기 모듈 삭제** (파일 통째로 또는 함수 단위):
   - `buildReferenceCompositionV2.ts`, `buildReferenceResetPath.ts`, `buildTopologyPath.ts` 등 파일
   - `buildTemplatePriorBundle.ts` + 관련 .test.ts (현재 TS 오류의 직접 원인)
   - `classifyTextBlock`, `classifySurfaceBlock`, `resolveRequiredExecutionSlots` 등 함수
2. **import 깨진 consumer 수정**:
   - `buildNodes.ts` (현재 L15, L16, L20 import 오류)
   - `AgentHappyPathPanel.tsx` (D 에서 이미 startExperimentalV* 제거했으므로 자동 해소)
   - `buildTemplatePriorBundle.test.ts` — 파일 통째로 삭제
3. **mutationObjectBuilder rewrite**:
   - 현재: 9개 if 분기 `if layerType === X && executionSlot === Y`. 한 줄 스파게티.
   - 목표: 단일 dispatch table. `layerType` + `styleTokens.*` + `metadata.role` 만 봄. `executionSlotKey` 분기 전면 제거.
   - 기존 factory (`buildTextObject` 등) 는 그대로 재사용. 호출 규칙만 단순화.
   - `validateCreateExecutionIdentity` 는 type-compat 검사 (slot 이 있으면 layerType 호환 확인) 만 유지. slot 없으면 skip.
4. **테스트 정리**:
   - `mutationAdapter.test.ts`, `proxy.test.ts` 등에서 slot 기반 assertion 제거
   - v5 용 새 테스트 작성 (transpile 출력을 flat dispatcher 로 feeding 하는 happy path)
5. **TS green 달성**: `pnpm tsc --noEmit` → 0 error.

**Acceptance**:
- `pnpm tsc --noEmit` green
- `pnpm test` green (테스트 개수는 shrink 예상: 210 → ~150)
- `mutationObjectBuilder.ts` 라인 수 50% 이상 감소
- `rg "executionSlotKey" src/features/agent-workflow-spike/` → contracts.ts 의 type 선언 + identity validator 만 남음

**Risks**:
- R-B1: 삭제 파급이 예상보다 큼 — tests/UI 까지 연쇄. incremental 커밋 (파일 1~3개씩) 으로 롤백 가능하게.
- R-B2: `AgentHappyPathPanel.tsx` 의 pre-existing 수정이 삭제 범위와 충돌. D 작업 시점에 이미 해소되어 있을 가능성.

---

### C (마지막) — Stage 4 RAG Asset Swap (실구현)

**중요 원칙 (locked)**: **abstract interface + no-op default 절대 금지**. 실 Qdrant + DB + S3 + API 호출이어야 함. 범위가 너무 크면 별도 track 으로 분리하되 이 원칙은 계속 유지.

**현재 Qdrant 인덱스 상태**:
- Template 썸네일만 인덱싱됨. 에셋 단위 인덱싱은 **진행 중** (user 가 별도 workstream 으로 추진).
- v5 는 Template RAG 를 버렸으므로 현재 인덱스는 직접 사용 가치 낮음.
- 에셋 단위 인덱싱이 준비되는 시점까지 C 는 blocker 상태일 수 있음.

**실행 결정점** (새 스레드에서 **반드시** 맨 먼저 확인):
- **C.1** (권장 기본값): 에셋 인덱싱이 **아직 준비 안 됨** → C 는 별도 track 으로 미룸. 이 handoff 와 별개 handoff 로 분리. transpiler 의 `placeholder://` hole 은 그대로 유지 (문서에 "RAG pending — 에셋 인덱싱 완료 후 재개" 명시).
- **C.2** (인덱싱 일부 준비됨): 준비된 에셋 카테고리 (e.g., background only, hero only) 로 **먼저** 구현. 스키마 / S3 URL 형식 / API 엔드포인트 전부 실재하는 것. 준비 안 된 카테고리는 명시적으로 fallback = fail-visible (빈 박스 OR 에러 배너), **숨김 금지**.
- **C.3** (인덱싱 완료): 전 카테고리 구현.

**Scope (C.2 or C.3 기준, 구체적으로 해야 할 것)**:
1. Qdrant 클라이언트 연결 — `sandbox/embedding-test/` 패턴 재사용 (`@qdrant/js-client-rest` + jina-clip-v2 embedding)
2. Query embedding: `hint` 문자열 + `role` enum → vector → Qdrant 조회 (top-k, filter by category)
3. 결과 → Tooldi DB 메타데이터 join (assetId, sourceCategory, dimensions) — **실재 DB 테이블 이름과 ORM 경로 조사 후 호출**
4. S3/CloudFront URL resolution — 서명된 URL 이 필요하면 실재 signer 사용 (`TOOLDi_API_PHP` 또는 서비스에 있음)
5. v5 pipeline 에 삽입: **preprocess 모드** (HTML → HTML rewrite, `<img src="placeholder://">` → `<img src="https://...">`) OR **postprocess 모드** (transpile 후 updateLayer(assetBinding) 추가 emit)
   - preprocess 가 단순하고 v5 SSOT 의 "Stage 4 가 Stage 5 앞에 있다" 와 정렬. 권장.

**Out of scope (이번 C 에서 안 함)**:
- 에셋 인덱싱 자체 (user 의 별도 workstream)
- 새 embedding 모델 선택
- 에셋 리사이징/변환 (편집기가 처리)

**Acceptance**:
- 실 Qdrant endpoint 로 query 성공 (mock 없음)
- 실 S3 URL 반환
- E2E (D 의 재현) 에서 placeholder 이미지가 실 에셋 URL 로 교체되어 canvas 렌더
- 최소 카테고리 (background + hero) 에서 실제 매칭 결과 확인
- 실패 시 visible fallback (숨김 없음)

**Risks**:
- R-C1: DB 스키마 / S3 경로 / API 엔드포인트를 새 스레드가 **처음부터** 조사해야 함. 시간 소요 큼 → sub-agent 로 narrow 조사 병렬 권장.
- R-C2: "실 DB/S3/API 연동" 이 scope 비대 → 별도 track 분리. 이 때도 "concrete only" 원칙 handoff 문서에 박제.
- R-C3: flash-lite 의 `data-hint` 는 Korean 자유 문장. embedding 이 이를 에셋 카테고리로 얼마나 잘 매칭하는지 실험 필요 — `sandbox/embedding-test` PoC 로 선 검증.

---

## Contracts

### Transpile module (Step 2 — 고정)

```ts
// toolditor/src/features/agent-workflow-spike/lib/transpile/index.ts
export function transpileHtmlToCommands(
  html: string,
  options: { runId: string }
): {
  commands: AgentCreateLayerCommand[];
  warnings: TranspileWarning[];
};
```

- 순수, 결정적, no side effect.
- Input: Method B constrained HTML (root div 1200×628).
- Output: `AgentCreateLayerCommand[]` + warnings (non-fatal).

### Runtime dispatch (B 이후 목표)

현재 (폐기 대상):
```ts
buildObjectForCreateLayerCommand(pageId, command)
  → if slot='background' & type='shape' → ...
  → if slot∈semantic & type='text' → ...
  → ... 9 branches ...
  → else reject 'unsupported_layer_type'
```

B 이후 (rewrite 목표):
```ts
buildObjectForCreateLayerCommand(pageId, command)
  → switch layerType:
    case 'shape' → buildRectObject(bounds, styleTokens.fillColor, styleTokens.secondaryColor, styleTokens.cornerRadius, ...)
    case 'text'  → buildTextObject(bounds, metadata.copyText, { fontSize: metadata.customFontSize, ..., align: styleTokens.textAlign })
    case 'image' → buildPlacedImageObject(bounds, photoFromMetadata, { angle, opacity })
    case 'group' → throw 'group layer from v5 pipeline is not expected — CTA/badge 는 flat sibling 으로 emit 됨'
    case 'sticker' → (미구현 — v5 scope 밖)
```

### RAG interface (C — 실구현 의무)

```ts
// 목표: 실 Qdrant + DB + S3 호출.  no-op default 금지.
interface AssetResolver {
  resolve(query: AssetQuery): Promise<ResolvedAsset | null>;
}
interface AssetQuery {
  role: 'background' | 'hero' | 'product' | 'decoration' | 'logo' | 'icon';
  hint: string;           // Korean free text from data-hint
  aspectRatio: string;    // "W:H"
  intent?: Record<string, unknown>;  // from Intent Normalize stage, optional
}
interface ResolvedAsset {
  sourceOriginUrl: string;   // REAL S3/CDN URL
  sourceWidth: number;
  sourceHeight: number;
  provenance: { assetId: string; sourceCategory: string; qdrantScore: number };
}
```

### Pipeline adapter (D)

```ts
// 목표: AgentCreateLayerCommand[] → SSE events → canvas apply
runV5Pipeline(prompt: string, controller: AgentHappyPathController): Promise<void>
// = callMethodB(prompt) → transpileHtmlToCommands(html) → [optional RAG preprocess] → emit SSE → canvas apply
```

---

## Relevant Files

### 먼저 읽을 것 (순서)

1. `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/AGENTS.md` — authority hierarchy
2. `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md` — v5 normative
3. `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-20-agw-v5-step1-prompt-hardening-handoff.md` — Step 1 predecessor
4. 이 파일 (`2026-04-20-agw-v5-post-step2-handoff.md`)
5. `/home/ubuntu/github/tooldi/toolditor/src/features/agent-workflow-spike/lib/transpile/index.ts` — Step 2 출력물 진입점

### D 작업 대상

- `toolditor/src/features/agent-workflow-spike/ui/AgentHappyPathPanel.tsx` — UI entry (V1~V4 제거 + v5 run 버튼)
- `toolditor/src/features/agent-workflow-spike/hooks/useAgentHappyPathController.ts` — controller wire (Method B 호출 → transpile → SSE)
- `toolditor/src/features/agent-workflow-spike/lib/mutationAdapter.ts` — SSE integration (재사용)
- `toolditor/src/features/agent-workflow-spike/lib/canvasGate.ts` — canvas apply hook
- `toolditor/src/features/agent-workflow-spike/lib/fixedRunRequest.ts` — prompt 입력 형식 (필요 시 v5 용 정리)
- `bench/method-compare-phase1/method-b-system.txt` — system prompt (재사용, 복사 또는 fetch)
- Gemini API 호출 규격: REST `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=<KEY>`. `responseMimeType` 미지정 (HTML text). thinking default.

### B 작업 대상 (삭제/rewrite)

- `mutationObjectBuilder.ts` (rewrite → flat dispatcher)
- `mutationExecutionIdentity.ts` (단순화, null-slot 케이스만)
- `mutationVisualPolicy.ts` (slot-dependent visual presets 정리)
- v5 §3.2 목록의 구현 파일들 (위 "Locked Decisions" 참조 — 파일 이름 grep 하여 확인)
- 관련 `.test.ts` 들 (slot 기반 assertion → v5 용 재작성 or 삭제)

### C 작업 대상 (실구현 의무)

- `sandbox/embedding-test/` — Qdrant + jina-clip-v2 client 패턴
- Tooldi DB 에셋 테이블 조사 (위치 미상 — 새 스레드가 조사 필요)
- S3/CloudFront signer — `toolditor/src/**` 또는 `TOOLDi_API_PHP` 에 있음 (조사 필요)
- v5 pipeline adapter — D 가 만든 runV5Pipeline 에 RAG preprocess 단계 삽입

### 진단에서 보이는 현재 legacy 오류 (B 시 해소됨)

- `AgentHappyPathPanel.tsx` L138,141,144,147,150: `startExperimentalV*` 관련 type errors
- `buildNodes.ts` L15-20: `buildReferenceCompositionV2.js`, `buildReferenceResetPath.js`, `buildTopologyPath.js` import not found
- `buildTemplatePriorBundle.test.ts` L22, L71: retrieval_prior_v1 type mismatch

---

## Open Risks (통합)

- **R-1 E2E 통합 버그 (D)**: 단위테스트에 안 잡히는 SSE/canvas timing. 계측 로깅 + 수동 stepwise 실행으로 완화.
- **R-2 Legacy 파급 (B)**: 삭제가 UI/테스트 까지 연쇄. incremental 커밋 + 파일 1~3개씩.
- **R-3 RAG 실구현 범위 (C)**: 에셋 인덱싱 상태 의존. 첫 결정점에서 C.1/C.2/C.3 중 선택. "concrete only" 원칙 유지.
- **R-4 TS red 지속**: D 중엔 허용 (transpile 영역만 green). B 완료 전까지 CI automation 제한적.
- **R-5 Overflow post-processor (A)**: 조건부. E2E 가 드러내야 시작. 휴리스틱이 과도하면 유효 텍스트 잘림 — conservative default.
- **R-6 Pre-existing unstaged mods (toolditor)**: contracts.ts / fixedRunRequest.ts / useAgentHappyPathController.ts / AgentHappyPathPanel.tsx. 새 스레드 시작 시 `git diff` 로 내용 확인 후 유지/정리 결정. D 작업과 겹치므로 정리 권장.

---

## Acceptance Criteria (종합)

### D 끝날 때
- 수동 prompt 실행 → canvas 에 정확한 layer 들 렌더 (시각 확인)
- Runtime reject 0건
- V1~V4 UI 버튼 제거
- 커밋: `[feat] AGW v5 Step 5 E2E — Method B → transpile → canvas render wire` (1~3개로 나눠도 됨)

### A 끝날 때 (조건부)
- Overflow 케이스 100% 보정
- False positive 0건
- 커밋: `[feat] AGW v5 Step 3 Text Overflow Post-Processor`

### B 끝날 때
- `pnpm tsc --noEmit` green
- `pnpm test` green
- mutationObjectBuilder 라인 수 50% 이상 감소
- `rg executionSlotKey` 결과 type 선언 + identity validator 만 남음
- 커밋: `[refactor] AGW v5 §3.2 legacy purge + mutationObjectBuilder flat dispatcher` (3~5개로 split 권장)

### C 끝날 때
- Qdrant 실 endpoint 호출 성공
- S3 실 URL 반환
- E2E (D 재현) 에 실제 에셋 이미지 표시
- 최소 2개 category (hero + background) 매칭 작동
- 실패 fallback = fail-visible
- 커밋: `[feat] AGW v5 Stage 4 RAG asset swap (<category list>)`
- 또는 handoff 문서 별도 track 으로 분리 + "concrete only" 원칙 재명시

---

## Verification

```bash
# 0. 현재 상태 확인
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test
git checkout feature/v5-agent
git log --oneline -5
# 5f89a49 [feat] AGW v5 Step 1 Method B prompt 하드닝 (...)
# 0b0225a [chore] AGW v5 Step 1 bench harness baseline 스냅샷
# 61992db [docs] AGW v5 Step 1 handoff (...)
# 94c4096 [docs] AGW v5 전환 nit 정리
# 67aa937 [docs] AGW v5 Constrained HTML Pipeline SSOT 전환

cd /home/ubuntu/github/tooldi/toolditor
git branch --list "feature/v5-agent" "feature/ai-agent-base"
git log --oneline -3 feature/ai-agent-base
# f9bd91232 [test] AGW v5 Step 2 runtime integration
# 880418c8c [feat] AGW v5 Step 2 HTML → Layer Graph Transpiler
# f71f5c8de [feat] 새로운 테스트 프리셋 추가

# 1. Step 2 tests 재확인
cd /home/ubuntu/github/tooldi/toolditor
pnpm exec vitest run src/features/agent-workflow-spike/lib/transpile
# 62 passed

# 2. TS state (expected RED — B 전)
pnpm tsc --noEmit 2>&1 | head -30
# AgentHappyPathPanel / buildNodes / buildTemplatePriorBundle.test 에서 legacy import 오류

# 3. Pre-existing unstaged 확인 (D 시작 전 정리 대상)
git status --short
# M contracts.ts / fixedRunRequest.ts / useAgentHappyPathController.ts / AgentHappyPathPanel.tsx
git diff src/features/agent-workflow-spike/ui/AgentHappyPathPanel.tsx | head -40
# 이 변경이 v5 작업과 충돌하는지 판단 후 stash/revert/merge 결정

# 4. bench harness (재사용 가능)
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/bench/method-compare-phase1
cat method-b-system.txt   # hardened system prompt — D 에서 Method B 호출에 그대로 사용
```

---

## Start Prompt

새 스레드에 다음을 그대로 붙여넣어 시작하라:

> `agent-workflow-test/AGENTS.md`, `tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md`, `docs/handoff/2026-04-20-agw-v5-step1-prompt-hardening-handoff.md`, `docs/handoff/2026-04-20-agw-v5-post-step2-handoff.md` 를 순서대로 읽어 현재 상태 파악한 뒤, 이 handoff 문서의 **§Work Order** 에 따라 작업하라. **D (E2E 파이프라인 데모) 가 최우선**. 목표: `transpileHtmlToCommands` 출력을 실제 canvas 에 render 하고 V1~V4 legacy UI 엔트리 포인트를 파괴적으로 제거해 시각 증거 확보. 시작 전 toolditor 의 pre-existing unstaged mods (contracts.ts / fixedRunRequest.ts / useAgentHappyPathController.ts / AgentHappyPathPanel.tsx) 내용을 `git diff` 로 확인하고 유지/stash/정리 결정. 작업 중 해결 곤란한 지점이 있으면 먼저 사용자에게 물어본 뒤 진행. 커밋 규칙: 대괄호 prefix, Co-Authored-By 금지, git add -A 금지, 푸시 금지. **레거시는 청산 대상, 유지보수 대상 아님** (사용자 명시 허가). **RAG 인터페이스는 반드시 실 DB/S3/API 연동으로 구현** (no abstract placeholder) — 범위가 크면 별도 track 분리하되 이 원칙은 handoff 에 계속 고정.
