# AGW v5 Post-Step 2 Handoff — agent-worker v5 Stage 구현 (v2, 경계 정정)

## Goal

AGW v5 Step 1 (프롬프트 하드닝) + Step 2 (HTML → Layer Graph Transpiler PoC) 는 완료됨. 이 handoff 는 **v5 6-stage 파이프라인을 `agent-worker` 안에서 구현해 E2E 를 증명**하고, 후속 Work Order A → B → C 를 지정된 우선순위로 진행하도록 새 스레드에 context 를 이전한다.

최상위 목표:
1. v5 6-stage 파이프라인을 **agent-worker 내부 stage chain 으로 구성** 해 end-to-end 동작 증명 (D)
2. v5 §3.2 폐기 모듈 (agent-worker 내부 legacy execution 모듈) 파괴적 청산 (B)
3. RAG Asset Swap 을 **실 Qdrant + DB + S3 연동으로 구현** (C — 이 원칙은 lock)

---

## ⚠️ Critical Correction — 이전 스레드 혼선 (반드시 숙지)

**이전 스레드가 범한 오해**: v5 SSOT §3.2 "폐기 목록" 을 *"agent-workflow 레포 자체를 우회한다 / frontend 에서 모든 파이프라인을 돌린다"* 로 과대 해석. toolditor 에 `prompts/methodB.ts`, `lib/runV5Pipeline.ts`, `lib/applyV5Commands.ts` 를 추가하고 controller 를 SSE 없이 직접 Gemini 호출 + AddObjects 로 rewire 하는 3개 커밋을 만듦.

**정정된 경계** (사용자 확정):

- **§3.2 폐기 대상 = agent-worker 내부 특정 모듈만** (`buildObjectNativePath`, `buildReferenceResetPath`, `buildTopologyPath`, `ReferenceBlockKind`, `ObjectNativeClusterFamily`, `resolveRequiredExecutionSlots`, `ruleJudge`, `selectTemplateComposition` 등)
- **유지 대상 (절대 제거 금지)**:
  - `tws-editor-api/agent-workflow-test/tooldi-agent-runtime/` 레포 전체
  - agent-worker 의 Queue + 별도 배포 관리
  - Canvas Mutation Protocol SSE + ack round-trip
  - toolditor 의 `mutationAdapter.ts` (`executeAgentHappyPathMutation`, envelope, revision check, ack post)
  - `POST /api/agent-workflow/runs` 공개 엔드포인트
  - `AgentWorkflowRunRequest` / `AgentRunAccepted` / `AgentCanvasMutationEvent` public schema
  - Checkpoint / recovery / retry / cancel 경로
- **HITL (langchain / langgraph) 는 차후 고도화 예정 → SSE pause/resume 포인트를 유지해야 하므로 SSE 경로 절대 제거 금지**

**롤백 수행 완료** (2026-04-20, 본 정정 커밋 직전):
- toolditor 에 추가됐던 잘못된 3개 커밋 `reset --hard` 로 삭제
- `feature/ai-agent-base` → `f9bd91232` 복귀, `feature/v5-agent` → `880418c8c` 복귀
- toolditor pre-existing unstaged 4파일 (legacy UI 청소) 은 원래 상태로 복원됨 (시작 상태 = 그 unstaged 포함)
- obsidian 세션 노트도 삭제됨 (잘못된 내용이므로)

---

## Current State (2026-04-20 정정 기준)

### 브랜치 / 커밋 상태

**tws-editor-api** (문서/벤치 리포):
- 브랜치: `feature/v5-agent` (from `feature/retrieval-prior-stack@61992db`)
- 커밋:
  - `0b0225a [chore] AGW v5 Step 1 bench harness baseline 스냅샷`
  - `5f89a49 [feat] AGW v5 Step 1 Method B prompt 하드닝`
  - `3611726 [docs] AGW v5 Post-Step 2 handoff (v1 — 본 v2 가 대체)`
  - 본 정정 커밋 (v2 handoff) 은 이 handoff 저장 후 추가 예정
- 푸시 안 됨.

**toolditor** (코드 리포):
- 브랜치 `feature/ai-agent-base` @ `f9bd91232` (Step 2 integration test)
- 브랜치 `feature/v5-agent` @ `880418c8c` (Step 2 transpiler)
- 두 브랜치 시작 상태 동일 (Step 2 까지만).
- **Pre-existing unstaged 4파일** (이전 이전 세션 작업 잔재 — 아직 커밋 전):
  - `model/contracts.ts` : `workflowVariant` 유니언을 `'object_native_v1'` 하나로 narrow
  - `lib/fixedRunRequest.ts` : 기본값 `'object_native_v1'`
  - `ui/AgentHappyPathPanel.tsx` : V1~V4 experimental 버튼 + topology evidence UI 제거
  - `hooks/useAgentHappyPathController.ts` : `startExperimental*` 메서드 5개 + topology evidence state/분기 제거, `canStartExperimentalV2` → `canStartObjectNative` rename
  - **이 diff 들은 v5 방향과 정렬** (SSE 경로 유지, `/api/agent-workflow/runs` POST 유지) — 별도 커밋으로 정리 권장.
- 푸시 안 됨.

**agent-worker** (`agent-workflow-test/tooldi-agent-runtime/`):
- legacy engine removal 작업이 이전 스레드에서 진행 중. 상태 확인 필요 — `docs/handoff/2026-04-20-agw-legacy-engine-removal-handoff.md` 참조.
- `processRunJob orchestrates phases and backend callbacks in order` 테스트 1건 실패가 남아있을 가능성. D 착수 전 green 확보 필수.

### 검증 상태

- toolditor transpile 62/62 pass
- toolditor 전체 tsc: prosemirror dedup 2건 제외 0 error (pre-existing)
- Bench (`outputs-3.1-flash-lite-v2/method-b`) 20개 fixture: `buildObjectForCreateLayerCommand` 전부 outcome='apply'
- Bench Method B 최종 지표 (flash-lite): weighted pass rate **100%**, `dom_grammar_ok` 20/20, `bounds_ok` 20/20

---

## Locked Decisions — v5 핵심 원칙 (normative, **재오픈 금지**)

### 아키텍처 철학 (v5 SSOT 에서 계승)

- **v5 SSOT** (`tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md`) = authority hierarchy #1
- **6-stage 파이프라인** (**agent-worker 안에서 실행**):
  1. Intent Normalize (backend stage)
  2. HTML Design Pass = **Method B LLM call** (backend stage, Gemini flash-lite)
  3. Validator + Self-Repair (backend stage)
  4. RAG Asset Swap (backend stage, C 에서 실구현)
  5. DOM → Layer Graph Transpiler (backend stage; Step 2 toolditor PoC 를 agent-worker 로 이식)
  6. Text Overflow Post-Processor (backend stage; A 에서 조건부)
- **Default 모델**: `gemini-3.1-flash-lite-preview`. 교체는 재벤치 증거 필수.
- **Completion 판정 3축**: editability + renderability + save truth. slot/cluster completeness 금지.
- **V1 axiom**: LLM 은 디자인 판단만, 코드는 직렬화만 (Method B Pass-1 단 한 번).
- **V2 axiom**: Pass-2 이후 단계는 결정적 (no LLM in transpile/RAG/post-process).

### 프론트 ↔ 백엔드 경계 (정정됨 — lock)

- **Frontend (toolditor) 는 기존 경로 유지**:
  - `POST /api/agent-workflow/runs` 로 run 시작
  - `accepted.streamUrl` 에서 SSE subscribe
  - `canvas.mutation` event 수신 시 `executeAgentHappyPathMutation` 으로 planning → Add/Update/Delete Object commands 실행 → `accepted.mutationAckUrl` 로 ack post
  - Cancel 시 `accepted.cancelUrl` 로 POST
- **Backend (agent-worker) 는 v5 6-stage 를 실행**:
  - run accepted 즉시 Queue 에 enqueue (기존 동일)
  - worker 가 stage chain 실행 → 각 단계에서 `run.phase` SSE emit
  - transpile 결과 commands 를 `canvas.mutation` envelope 에 담아 SSE emit (기존 envelope 구조 유지: `mutationId`, `seq`, `expectedBaseRevision`, `rollbackHint`)
  - frontend 로부터 ack 수신 → 다음 stage 진행 or 완료 처리
- **HITL 대비**: LangGraph state machine 도입 시 각 stage 경계가 pause/resume 포인트. 향후 `run.human_review_requested` SSE event type 추가 예정 — 현재 auto-apply (approvalMode='none') 이지만 stage 분할은 LangGraph 로 시작할 것.

### executionSlotKey = null 정책

- v5 가 생성한 commands 는 slot 을 semantic 계획 primitive 로 사용하지 않음 (transpiler 가 null emit).
- Runtime `mutationObjectBuilder` 는 null slot 을 non-semantic 경로로 dispatch, `styleTokens.fillColor/secondaryColor/cornerRadius/textAlign` + `metadata.customFontSize/Family/Weight/copyText` 가 semantic fallback 값을 override.
- B stage 에서 `mutationObjectBuilder` 를 flat dispatcher 로 rewrite 시 이 규약 고정.

### 재사용 vs 폐기 (inventory 재확인)

**재사용 (건드리지 말 것)**:
- agent-worker 레포/deploy/Queue
- Canvas Mutation Protocol SSE envelope + ack round-trip
- toolditor `mutationAdapter.ts` (`executeAgentHappyPathMutation`)
- toolditor `canvasObjectFactories.ts` (buildRect/Text/CoverImage/PlacedImage/CtaGroup/LinearGradientFill)
- toolditor `contracts.ts` 의 `AgentLayerType`, `AgentCreateLayerCommand`, `AgentUpdateLayerCommand`, `AgentSaveTemplateCommand`
- Completion gate 3축
- `sandbox/embedding-test/` Qdrant + jina-clip-v2 PoC (C 레퍼런스)
- toolditor Step 2 `transpile/` 모듈 (단기 유지; B 에서 agent-worker 로 포팅 검토)

**폐기 (§3.2, agent-worker 내부 모듈 한정)**:
- `buildObjectNativePath`, `buildReferenceResetPath`, `buildReferenceCompositionV2`, `buildTopologyPath`
- `ReferenceBlockKind`, `ObjectNativeClusterFamily`, `classifyTextBlock`, `classifySurfaceBlock`
- `resolveRequiredExecutionSlots`, addable vocabulary registry, projected object graph extractor, computable annotation generator
- `buildSearchProfile`, `assembleTemplateCandidates`, `buildTemplatePriorBundle`, `selectTemplateComposition`, `selectTypography`
- `ruleJudge`, `buildJudgePlan`, `buildRefineDecision`, patch-only refine loop

**폐기 (toolditor 한정, B stage)**:
- `mutationObjectBuilder.ts` 의 slot-dispatch 분기 전체 → flat dispatcher 로 rewrite

### 레거시 & RAG 원칙 (사용자 확정 — 반드시 준수)

- **레거시 = 청산 대상, not 유지보수 대상**: v5 §3.2 폐기 모듈은 파괴적 제거 OK. 의존하는 테스트/UI 도 함께 삭제 또는 v5 버전으로 교체. **단 agent-workflow 레포/Queue/SSE/배포는 청산 대상이 아님 (재확인)**.
- **RAG 인터페이스 = 실 DB/S3/API 연동**: `AssetResolver` 같은 인터페이스를 "나중에 구현할 placeholder" 로 두는 것 금지. 실 Qdrant + DB + S3 + API 호출. 범위가 크면 별도 track 으로 분리하되 원칙은 문서에 계속 고정.
- **이 원칙 deviation 필요 시 사용자에게 먼저 문의**.

### 커밋 규칙 (locked)

- 대괄호 prefix: `[feat]` / `[fix]` / `[refactor]` / `[docs]` / `[test]` / `[chore]`
- `Co-Authored-By` 금지
- `git add -A` 금지 (파일 개별 add)
- **푸시 금지** unless 사용자 명시 요청
- Toolditor 는 **npm/package-lock.json** (pnpm add 금지)
- agent-worker 는 **pnpm/pnpm-lock.yaml**

---

## Work Order (사용자 승인된 순서)

### Pre-D (선행 정리, toolditor, 독립 커밋)

**목표**: Pre-existing unstaged 4파일을 별도 커밋으로 정리 (V1~V4 legacy UI/controller 제거).

Scope:
- `contracts.ts`, `fixedRunRequest.ts` : workflowVariant narrow 반영
- `AgentHappyPathPanel.tsx` : V1~V4 buttons + topology evidence UI 제거, 단일 "object-native 생성" 버튼 유지
- `useAgentHappyPathController.ts` : `startExperimental*` 5개 + topology evidence state/분기 제거, `canStartExperimentalV2` → `canStartObjectNative` rename

Don't:
- **SSE / EventSource / mutationAdapter / ack round-trip 경로는 절대 제거하지 말 것**
- **frontend 에서 Gemini 직접 호출 코드 추가 금지 (이전 스레드 오류 재발 방지)**
- `start()` 는 여전히 `POST /api/agent-workflow/runs` 로 가는 것.

Acceptance:
- toolditor 단일 커밋: `[refactor] AGW legacy 변종 UI 제거 — object_native_v1 단일 entry`
- transpile 62/62 유지, 기존 SSE 경로 회귀 없음.

---

### D (최우선) — agent-worker v5 Stage 구현 + E2E

**목표**: agent-worker 안에 v5 6-stage 를 stage chain 으로 구성해 E2E 증명. 프론트 경로 변경 없음.

**Scope (do)**:

1. **사전 그린 확보**: `docs/handoff/2026-04-20-agw-legacy-engine-removal-handoff.md` 의 잔여 task (processRunJob 테스트 1건) 먼저 해소. `pnpm test`, `pnpm smoke:object-native` 그린 상태에서 D 착수.

2. **v5 stage 모듈 구현** (`apps/agent-worker/src/phases/` 아래):
   - `methodBHtmlGen.ts` — Gemini REST 호출. bench `run.mjs` 의 `callGeminiRest({ method: 'method-b', prompt })` 패턴 재사용. 환경변수 `GOOGLE_API_KEY` (agent-runtime `.env.local`, 서버사이드 전용).
   - `methodBSystemPrompt.ts` — `bench/method-compare-phase1/method-b-system.txt` 내용을 복사해 const 로 embed (주석에 canonical source 경로 박제; 재동기화 규약 명시). 또는 공용 package 로 추출해 bench/runtime 양쪽이 공유 (권장).
   - `htmlValidator.ts` — root div 존재, forbidden tag (`br`, `a`, `button`, `style`…), inline style 필수, 픽셀 단위 bounds 등 grammar guard. 실패 시 self-repair 한 번 재시도 or fail-visible.
   - `transpileHtmlToCommands.ts` — toolditor `src/features/agent-workflow-spike/lib/transpile/` 를 agent-worker 로 포팅. 의존: `htmlparser2`. 단기적으로 file copy, 중기적으로 `packages/transpile/` 공용 package 추출.
   - (defer, stage 5) `ragAssetSwap.ts` — 기본 pass-through (placeholder:// 유지). C 에서 실구현.
   - (optional, stage 6) `overflowPostProcessor.ts` — A 에서 조건부.

3. **Stage chain orchestration**:
   - 기존 `buildExecutablePlan.ts` 의 `object_native_v1` 경로를 v5 stage chain 으로 교체.
   - 각 stage 완료 시 `run.phase` SSE emit.
   - transpile 결과 commands 를 `canvas.mutation` envelope 으로 감싸 emit. envelope 구조 (mutationId, seq, expectedBaseRevision, rollbackHint) 기존 유지.
   - chunk 전략: 모든 commands 를 single envelope 으로 emit 해도 되고 (Step 2 transpile 은 3~12 commands), 추후 HITL pause point 마다 multiple envelope 으로 분할 가능 (이번 D 는 single envelope 기본).

4. **단위 + 통합 테스트**:
   - 각 stage 단위테스트 (mock Gemini, HTML grammar fixtures)
   - `processRunJob` 통합테스트에 v5 happy path 1 case 추가: mock Gemini → stage chain → canvas.mutation envelope emit 확인 → mock ack → run.completed

5. **수동 E2E**:
   - toolditor dev server 기동 + agent-worker 로컬 기동
   - 빈 canvas → prompt 선택 → "object-native 생성" 클릭 → backend run → SSE → canvas 에 3~12 layer 렌더 (placeholder 이미지는 빈 박스)

**Scope (don't)**:
- RAG asset resolution (C 에서)
- Overflow post-processing (A 에서)
- toolditor 쪽 SSE/mutationAdapter 경로 변경
- frontend 에 Gemini 직접 호출 코드 추가

**Acceptance**:
- agent-worker `pnpm test` green (v5 단위테스트 포함)
- `pnpm smoke:object-native` 가 v5 stage chain 으로 통과
- `processRunJob` 통합테스트에 v5 happy path 추가됐고 green
- 수동 E2E: toolditor 에서 버튼 클릭 → 캔버스에 레이어 3~12개 렌더
- SSE pause/resume 확장 포인트 식별 + 문서화 (HITL 대비)

**Risks**:
- **R-D1**: agent-worker 가 legacy cleanup 직후여서 dirty. D 시작 전 테스트 그린 확보 필수.
- **R-D2**: `transpileHtmlToCommands` 포팅 — htmlparser2 의존 추가. toolditor 와 agent-worker 두 구현 divergence 위험. 공용 package 추출 시점 결정 (본 D 에서 공용화 or B stage).
- **R-D3**: Method B system prompt drift (bench txt vs runtime const). 초기엔 copy + 주석, 장기는 공용 package.
- **R-D4**: Queue/worker 재시도 정책이 Gemini 호출 실패 (429, timeout) 에 어떻게 반응할지 — 기존 retry 규약 재사용 가능 여부 확인.

---

### A (조건부, D 결과에 따라) — Stage 6 Text Overflow Post-Processor

(기존 handoff v1 §A 그대로)

**Trigger**: D 의 E2E 실행에서 overflow 가 실제로 자주 발생하면 착수.

**Scope**: agent-worker 안에 순수 함수 `postProcessTextOverflow(html)` stage 로 구현. font-size × char_count × CJK/Latin 계수 > width × 1.1 위반 시 font-size 축소 or sibling 분할. transpile 직전에 HTML 에 적용.

---

### B (D 완료 후) — agent-worker §3.2 legacy purge + toolditor flat dispatcher

**목표**: v5 §3.2 폐기 목록 (agent-worker 내부 + toolditor `mutationObjectBuilder`) 전부 삭제 + toolditor 의 slot-dispatch 분기 → flat dispatcher rewrite. TS green.

**Scope**:
1. agent-worker `apps/agent-worker/src/phases/` 의 §3.2 파일 삭제 (buildReferenceCompositionV2, buildReferenceResetPath, buildTopologyPath, buildTemplatePriorBundle 등)
2. 관련 consumer (buildNodes.ts 등) import 정리
3. toolditor `mutationObjectBuilder.ts` rewrite — `executionSlotKey` 분기 제거, `layerType` + `styleTokens.*` + `metadata.role` 기반 flat dispatcher
4. 관련 `.test.ts` 정리 (slot 기반 assertion 제거 + v5 용 재작성)
5. toolditor `pnpm tsc --noEmit` green, agent-worker `pnpm tsc --noEmit` green

**Acceptance**:
- 양쪽 tsc green
- 양쪽 test green
- `mutationObjectBuilder.ts` 라인 수 50% 이상 감소
- `rg "executionSlotKey" toolditor/src/features/agent-workflow-spike/` → contracts.ts type 선언 + identity validator 만 남음

---

### C (마지막) — Stage 4 RAG Asset Swap (실구현 의무)

**중요 원칙 (locked)**: abstract interface + no-op default 금지. 실 Qdrant + DB + S3 + API 호출 필수.

**실행 결정점** (새 스레드에서 맨 먼저 확인):
- **C.1** (권장 기본값): 에셋 단위 인덱싱 아직 준비 안 됨 → C 는 별도 track 으로 미룸. 본 handoff 와 별개 handoff 로 분리. agent-worker stage 5 는 pass-through 유지.
- **C.2** (인덱싱 일부 준비됨): 준비된 카테고리 (e.g., background only, hero only) 로 먼저 구현. 실 Qdrant endpoint + 실 S3 URL.
- **C.3** (인덱싱 완료): 전 카테고리 구현.

**Scope (C.2/C.3)**:
1. Qdrant 클라이언트 (`sandbox/embedding-test/` 패턴 재사용, `@qdrant/js-client-rest` + jina-clip-v2)
2. Query embedding: HTML `<img>` 의 `data-hint` + `data-tooldi-role` → vector → Qdrant 조회
3. 결과 → Tooldi DB 메타데이터 join — 실재 테이블/ORM 경로 조사 후 호출
4. S3/CloudFront URL resolution (서명 필요 시 실재 signer)
5. agent-worker stage 5 삽입 모드:
   - **preprocess** 권장: HTML → HTML rewrite (`<img src="placeholder://">` → `<img src="https://...">`). v5 SSOT "Stage 4 가 Stage 5 앞" 과 정렬.
   - **postprocess** 대안: transpile 후 updateLayer(assetBinding) 추가 emit.

**Out of scope**: 에셋 인덱싱 자체 (별도 workstream), 새 embedding 모델 선택, 에셋 리사이징.

**Acceptance**:
- 실 Qdrant endpoint 호출 성공 (mock 없음)
- 실 S3 URL 반환
- E2E (D 재현) 에서 placeholder 이미지 → 실 에셋 URL 교체
- 최소 카테고리 (background + hero) 매칭 작동
- 실패 시 visible fallback (숨김 금지)

**Risks**:
- **R-C1**: DB 스키마 / S3 경로 / API 엔드포인트 신규 조사 필요. sub-agent 로 병렬 조사 권장.
- **R-C2**: scope 비대 → 별도 track 분리 시 "concrete only" 원칙 handoff 에 박제.
- **R-C3**: `data-hint` (Korean 자유 문장) 의 embedding 매칭 품질 실험 — `sandbox/embedding-test` 로 선검증.

---

## Contracts

### Frontend run entry (unchanged — v5 에서도 동일)

```
POST /api/agent-workflow/runs
body: AgentWorkflowRunRequest { workflowVariant: 'object_native_v1', userInput.prompt, editorContext, ... }
→ AgentRunAccepted { runId, traceId, streamUrl, cancelUrl, mutationAckUrl }

SSE subscribe streamUrl → events:
  run.accepted, run.phase, run.log, canvas.mutation, run.completed, run.failed, run.cancelled, ...

canvas.mutation event payload: AgentCanvasMutationEvent (envelope with mutationId/seq/expectedBaseRevision/rollbackHint + commands)
frontend executeAgentHappyPathMutation(event, context) → AgentMutationApplyAckRequest
POST mutationAckUrl body: AgentMutationApplyAckRequest
```

### Backend v5 stage chain (신규)

```ts
// apps/agent-worker/src/phases/buildExecutablePlan.ts (replace object_native_v1 branch)
async function runV5Pipeline(request: AgentWorkflowRunRequest): Promise<v5Result> {
  const brief = await intentNormalize(request);
  const html = await methodBHtmlGen(brief, { apiKey: env.GOOGLE_API_KEY });
  const validated = await validateHtml(html);         // may self-repair once
  const ragResolved = await ragAssetSwap(validated);  // passthrough until C
  const commands = await transpileHtmlToCommands(ragResolved, { runId: request.runId });
  // optional A: const commands2 = await overflowPostProcess(commands);
  return { commands, warnings: [...] };
}

// emit as canvas.mutation envelope (chunking strategy: single envelope for now)
emitCanvasMutation(runId, traceId, {
  mutationId, seq: 1, expectedBaseRevision: 0,
  commands,
  rollbackHint: { strategy: 'delete_created_layers', ... }
});
```

### Transpile interface (Step 2 — toolditor, 포팅 대상)

```ts
export function transpileHtmlToCommands(
  html: string,
  options: { runId: string }
): { commands: AgentCreateLayerCommand[]; warnings: TranspileWarning[] };
```

순수, 결정적, no side effect. htmlparser2 의존.

### RAG interface (C — 실구현 의무)

```ts
interface AssetResolver {
  resolve(query: AssetQuery): Promise<ResolvedAsset | null>;
}
interface AssetQuery {
  role: 'background' | 'hero' | 'product' | 'decoration' | 'logo' | 'icon';
  hint: string;
  aspectRatio: string;
  intent?: Record<string, unknown>;
}
interface ResolvedAsset {
  sourceOriginUrl: string;   // REAL S3/CDN URL
  sourceWidth: number;
  sourceHeight: number;
  provenance: { assetId: string; sourceCategory: string; qdrantScore: number };
}
```

---

## Relevant Files

### 먼저 읽을 것 (순서)

1. `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/AGENTS.md` — authority hierarchy
2. `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md` — v5 normative
3. `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-20-agw-v5-step1-prompt-hardening-handoff.md` — Step 1
4. `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-20-agw-legacy-engine-removal-handoff.md` — agent-worker cleanup 잔여 task
5. 이 파일 (`2026-04-20-agw-v5-post-step2-handoff.md`, v2)
6. `/home/ubuntu/github/tooldi/toolditor/src/features/agent-workflow-spike/lib/transpile/index.ts` — Step 2 PoC (포팅 대상)
7. `/home/ubuntu/github/tooldi/toolditor/src/features/agent-workflow-spike/lib/mutationAdapter.ts` — frontend SSE+ack (재사용)

### Pre-D 정리 대상 (toolditor)

- `src/features/agent-workflow-spike/model/contracts.ts` (unstaged)
- `src/features/agent-workflow-spike/lib/fixedRunRequest.ts` (unstaged)
- `src/features/agent-workflow-spike/ui/AgentHappyPathPanel.tsx` (unstaged)
- `src/features/agent-workflow-spike/hooks/useAgentHappyPathController.ts` (unstaged)

### D 작업 대상 (agent-worker)

- `apps/agent-worker/src/phases/buildExecutablePlan.ts` — object_native_v1 분기를 v5 stage chain 으로 교체
- `apps/agent-worker/src/phases/planningContext.ts` — 필요 시 stage context 확장
- 새 파일 후보:
  - `apps/agent-worker/src/phases/methodBHtmlGen.ts`
  - `apps/agent-worker/src/phases/methodBSystemPrompt.ts` (또는 공용 package)
  - `apps/agent-worker/src/phases/htmlValidator.ts`
  - `apps/agent-worker/src/phases/transpileHtmlToCommands.ts` (toolditor 포팅)
- `apps/agent-worker/src/jobs/processRunJob.test.ts` — v5 happy path 추가
- `scripts/smoke-in-process.mjs` — v5 stage chain 용 adaptive decision 스텁 업데이트 (필요 시)

### Bench 참조

- `agent-workflow-test/bench/method-compare-phase1/method-b-system.txt` — Method B canonical prompt (copy source)
- `agent-workflow-test/bench/method-compare-phase1/run.mjs` — Gemini REST 호출 패턴 참조

---

## Open Risks (통합)

- **R-1 E2E 통합 버그 (D)**: stage chain → envelope → SSE → canvas. Unit test 로는 안 잡히는 경계 버그 가능. 수동 stepwise 실행 + agent-worker 로그 계측.
- **R-2 Legacy purge 파급 (B)**: agent-worker + toolditor 양쪽 파급. incremental 커밋.
- **R-3 RAG 실구현 범위 (C)**: 에셋 인덱싱 상태 의존. C.1/C.2/C.3 결정점. "concrete only" 원칙 유지.
- **R-4 transpile 중복 유지비**: toolditor + agent-worker 에 동일 구현. 공용 package 추출 시점 결정 (본 D or B).
- **R-5 Method B prompt drift**: bench txt vs runtime. 본 D 초기엔 copy + 주석, 장기는 공용 package.
- **R-6 Overflow (A)**: 조건부. E2E 에서 드러나야 시작. conservative default.
- **R-7 Pre-existing unstaged (toolditor)**: Pre-D 커밋으로 정리 권장.

---

## Acceptance Criteria (종합)

### Pre-D 끝날 때
- toolditor 단일 커밋: V1~V4 legacy UI + startExperimental* 제거
- transpile 62/62 유지, SSE 경로 회귀 없음

### D 끝날 때
- agent-worker 에 v5 stage chain 구현됨 (methodBHtmlGen + validateHtml + transpile)
- `pnpm test`, `pnpm smoke:object-native` green
- `processRunJob` 통합테스트에 v5 happy path case 있음
- 수동 E2E: toolditor 버튼 → canvas 에 3~12 layer 시각 렌더
- SSE pause/resume 확장 포인트 문서화 (HITL 대비)

### A 끝날 때 (조건부)
- overflow 케이스 보정, false positive 0건

### B 끝날 때
- 양쪽 리포 `pnpm tsc --noEmit` green, `pnpm test` green
- `mutationObjectBuilder` flat dispatcher rewrite (라인 50% 감소)
- `executionSlotKey` residue 제거

### C 끝날 때
- 실 Qdrant endpoint, 실 S3 URL
- E2E 에서 실 에셋 이미지 표시
- 최소 2개 카테고리 매칭, fail-visible fallback

---

## Verification

```bash
# 0. 현재 상태 확인
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test
git log --oneline -5
# 본 v2 handoff 커밋
# 3611726 [docs] AGW v5 Post-Step 2 handoff (v1)
# 5f89a49 [feat] AGW v5 Step 1 Method B prompt 하드닝
# 0b0225a [chore] AGW v5 Step 1 bench harness baseline 스냅샷
# 61992db [docs] AGW v5 Step 1 handoff

cd /home/ubuntu/github/tooldi/toolditor
git log --oneline -3 feature/ai-agent-base
# f9bd91232 [test] AGW v5 Step 2 runtime integration
# 880418c8c [feat] AGW v5 Step 2 HTML → Layer Graph Transpiler
# f71f5c8de [feat] 새로운 테스트 프리셋 추가

git status --short
#  M contracts.ts / fixedRunRequest.ts / useAgentHappyPathController.ts / AgentHappyPathPanel.tsx
# → Pre-D 커밋 대상

# 1. toolditor Step 2 tests 재확인
cd /home/ubuntu/github/tooldi/toolditor
npx vitest run src/features/agent-workflow-spike/lib/transpile
# 62 passed

# 2. agent-worker green 확보 (D 착수 전)
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime
pnpm typecheck    # expected pass
pnpm build        # expected pass
pnpm smoke:object-native   # expected pass
pnpm test         # 현재 processRunJob 1건 실패 가능 — 선 해소

# 3. bench harness (재사용 가능)
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/bench/method-compare-phase1
cat method-b-system.txt   # hardened Method B system prompt — D methodBSystemPrompt.ts copy source
cat run.mjs | head -140   # Gemini REST 호출 패턴 — methodBHtmlGen.ts 구현 참조
```

---

## Start Prompt

새 스레드에 다음을 그대로 붙여넣어 시작하라:

> `agent-workflow-test/AGENTS.md`, `tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md`, `docs/handoff/2026-04-20-agw-v5-step1-prompt-hardening-handoff.md`, `docs/handoff/2026-04-20-agw-legacy-engine-removal-handoff.md`, `docs/handoff/2026-04-20-agw-v5-post-step2-handoff.md` (v2, 본 파일) 를 순서대로 읽어 현재 상태 파악한 뒤, 이 handoff 의 **§Work Order** 에 따라 작업하라.
>
> **⚠️ 이전 스레드 오류 재발 방지 (§Critical Correction 필독)**: v5 §3.2 폐기 대상은 **agent-worker 내부 특정 모듈만** 이며 agent-workflow 레포/Queue/SSE/배포/HITL(langgraph) 기반은 **모두 유지** 대상이다. frontend 에서 Gemini 직접 호출 경로 **절대 추가 금지**. v5 6-stage 는 **agent-worker 안에서** 돈다. toolditor 는 기존 `POST /api/agent-workflow/runs` + SSE + mutationAdapter ack round-trip 경로를 그대로 사용한다.
>
> **우선순위**: Pre-D (toolditor legacy UI 단독 커밋) → D (agent-worker v5 stage chain 구현 + E2E) → A (overflow, 조건부) → B (agent-worker §3.2 purge + toolditor flat dispatcher) → C (RAG 실구현).
>
> **D 목표**: agent-worker 에 Method B HTML gen + grammar validator + transpile stage 를 조립해 기존 SSE 경로로 canvas 에 3~12 layer 렌더 증명. Step 2 의 `transpileHtmlToCommands` 는 toolditor 에서 agent-worker 로 포팅 (또는 공용 package 추출).
>
> **D 착수 전 필수**: `docs/handoff/2026-04-20-agw-legacy-engine-removal-handoff.md` 의 잔여 task (processRunJob 테스트 1건) 를 먼저 그린 확보.
>
> 작업 중 해결 곤란한 지점이 있으면 사용자에게 먼저 물어본 뒤 진행. 커밋 규칙: 대괄호 prefix, Co-Authored-By 금지, `git add -A` 금지, 푸시 금지. **RAG 인터페이스는 반드시 실 DB/S3/API 연동으로 구현** (abstract placeholder 금지).
