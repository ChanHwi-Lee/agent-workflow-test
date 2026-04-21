# AGW v6 Phase 4 — LangGraph Swap + SSE + v5 Legacy Removal (Handoff)

**Status**: **Ready to start** (as of 2026-04-21 afternoon). Phase 2 + 2.5 MVP 완료.
**Date**: 2026-04-21 (handoff 작성), 2026-04-21 prerequisites 업데이트
**Target repo**: `tws-editor-api/agent-workflow-test/tooldi-agent-runtime` (이 repo)
**Target branch**: `feature/v6-structure` 계속 (Phase 0/1/2.5/3 + contracts + adapter + bench 커밋 이미 있음)
**Prerequisites (현재 상태)**:
- ✅ Phase 2 toolditor 구현 push: `toolditor@feature/v6-primitives` (`5b6926326`) — main merge 는 Phase 4 완료 후 PR 묶음으로
- ✅ toolditor 가 bitmap/svg layerType 을 실제 렌더 (사용자 시각 검증 완료)
- ✅ Phase 2.5 font pipeline MVP — `agent-workflow-test@feature/v6-structure` (`36ec99a`) — extraction(v6-poc) 경로 완료, **prod 경로(v6BrowserRender/v6CommandAdapter/v6SystemPrompt) 는 Phase 4 의 1번 커밋에서 이어받아 반영**
- ⚠ Chromium docker image `mcr.microsoft.com/playwright:v1.58.2-noble` 사용 가능 여부 — 세션 시작 시 확인 필요
- ⚠ Phase 2 의 임시 fixture 주입 UI (`toolditor/src/features/agent-workflow-spike/fixtures/` + AgentHappyPathPanel 의 임시 섹션) — Phase 4 완료 시 같이 제거

---

## 철학 (Locked)

- 시스템이 layout family 를 정의하지 않는다.
- Slot / topology / CTA / role contract 승급 금지.
- LLM 은 결과를 만든다. 브라우저는 layout 을 계산한다. 코드는 결과를 추출한다.

Phase 4 는 v5 경로를 v6 경로로 교체할 뿐. 새 semantic 추가 금지.

---

## 목표

1. 현재 LangGraph 내 v5 pipeline node 를 v6 로 **즉시 cutover** (feature flag 없음, 사용자 명시 결정).
2. SSE canvas.mutation envelope 경로 재사용 (adapter 출력이 이미 schema-compatible).
3. v5 legacy 전 파일 제거.
4. 20-sample E2E smoke: 자연어 → v6 pipeline → toolditor 렌더 → screenshot 확인.
5. v6 를 새 SSOT 로 승격, v5 SSOT 는 historical 로 이동.

---

## Prerequisites 체크 (세션 시작 시 확인)

- [ ] Phase 2 merge 확인: toolditor `feature/v6-primitives` 가 base 에 반영
- [ ] toolditor localhost:3010 로컬 실행 OK (npm run local:agent)
- [ ] Chromium docker 이미지 pull 상태: `docker images mcr.microsoft.com/playwright`
- [ ] Playwright 버전 정합성 결정 (아래 §Version drift)
- [ ] `.env.local` 의 `GOOGLE_API_KEY` 유효

---

## Version drift 처리 (세션 시작 즉시 결정)

- agent-worker 설치본: `playwright@1.59.1` (현재)
- Docker 이미지: `mcr.microsoft.com/playwright:v1.58.2-noble`

**권장**: 이미지를 1.59.x 계열로 재-pull 하여 맞춤.

```bash
# 후보 이미지
docker pull mcr.microsoft.com/playwright:v1.59.1-noble  # 매칭
```

또는 `agent-worker/package.json` 의 `playwright` 를 `1.58.x` 로 내리고 재설치.

**금지**: 버전 드리프트 유지. Lambda 배포 (Phase 5) 에서 `@sparticuz/chromium` 과 호환 대역 좁아지는 문제 예방.

---

## 작업 단계

### 0. Phase 2.5 prod 경로 반영 (선행)

v6-poc 로컬에서 검증된 font pipeline 로직을 agent-worker prod 경로에도 동일하게 반영. **이 작업 없이 LangGraph swap 하면 prod 출력이 여전히 OS 시스템 폰트로 측정된다.**

- `agent-workflow-test/fonts/registry.json` 을 SSOT 로 유지 (변경 없이 read-only 참조)
- `apps/agent-worker/src/phases/v6FontRegistry.ts` 신규: `readFileSync + JSON.parse` 로 `../../../../fonts/registry.json` 읽고 `buildFontFaceStyleBlock()` export
  - v6-poc 의 `v6-poc/fonts/buildFontFaceCSS.mjs` 와 **동일 로직**. 중복 없애려면 repo 공통 package 으로 추출 가능하지만 Phase 4 scope 에서는 TS 복제로 충분
- `v6BrowserRender.ts` 수정: `setContent` 전에 HTML `</head>` 앞에 font `<style>` 블록 inject (v6-poc/extract.mjs 와 동일 패턴)
- `v6CommandAdapter.ts` 수정: text token 생성 시 `parseFirstFontFamily(cmd.fontFamily)` 로 CSS cascade 첫 이름만 Toolditor ID 로 전달
- `v6SystemPrompt.ts` 수정: 사용 가능한 font-family 목록 명시 ("Available fonts: 701_400, 701_700, 1301_400. Use only these CSS family names with matching font-weight.")
- 기존 `v6CommandAdapter.test.ts` / `v6BrowserRender.test.ts` 업데이트: fontFamily expectation 을 Toolditor ID 로

커밋: `[feat] AGW v6 Phase 2.5 prod — font pipeline 반영 (agent-worker side)`

### 1. Dev Chromium 인프라 (agent-worker 프로세스 안에서 Playwright 기동)

Option A — 개발 Docker 에 Playwright 이미지 상속:
- `agent-workflow-test/tooldi-agent-runtime` 또는 `local-docker` stack 에 playwright image base
- `agent-worker` 컨테이너가 그 위에서 실행

Option B — host-mode 개발: agent-worker 를 host Node 에서 실행하고 Playwright 는 로컬 chromium 사용 (현재 PoC 방식 연장).

**권장 A** (production parity). 단 Phase 4 이 세션 안에 끝내려면 B 로 시작해도 됨. Phase 5 에서 정식 Docker 화.

### 2. LangGraph v5 → v6 node swap

진입점 파악:
- `apps/agent-worker/src/graph/` 의 현재 그래프 구성 확인
- `runJobGraph`, `graphHelpers` 에서 v5 파이프라인 진입 노드 식별 (예: `plan_v5_html` / `transpile_v5` 등)

치환:
- 기존 노드를 하나의 **v6 node** 로 교체. 내부에서:
  ```
  runV6Pipeline({ runId, canvasWidth, canvasHeight, userPrompt, apiKey }, {
    generateHtml: runV6HtmlGen,
    validateHtml: validateV6Html,
    renderAndExtract: (html, canvas) => renderAndExtract(browser, html, { canvas }),
    mapElements: mapRenderedElements,
  })
  → adaptV6Commands(result.commands, { runId })
  → SSE envelope 구성
  ```
- Browser 는 worker 기동 시 warm instance 1-3개 유지 (Phase 5 full pool 이전의 경량 버전).
- `editorContext.canvasWidth/canvasHeight` 를 반드시 variable 로 흘려보냄 (하드코딩 금지).

### 3. SSE canvas.mutation envelope 생성

- 기존 v5 의 mutation envelope builder 확인 (`emitV5SkeletonMutations.ts` 등)
- 동일 `CanvasMutationEnvelopeSchema` 재사용
- `commands` 배열에 `adaptV6Commands` 결과 주입
- `rollbackHint`, `ownershipScope`, `idempotencyKey`, `commitGroup`, `seq` 기존 규칙 유지

### 4. 20-sample E2E smoke

PoC round-trip 확장:
- bench 20 prompt 중 5개 선택 (예: prompt_01 restaurant, prompt_08 product_launch, prompt_09 education, prompt_15 healthcare, prompt_19 kids — layout 다양성 확보)
- 각각 자연어 prompt → runV6Pipeline 종점까지 가서 SSE envelope 생성 → toolditor 에 주입 → Playwright screenshot → 저장
- 시각 품질 metric 은 이 session 외 (Phase 3 rebench 의 후속 grading 에서 처리)
- Acceptance: 5/5 렌더 에러 없음, 스크린샷 인스펙션 OK

샘플 스크립트 원형:

```js
// v6-e2e-smoke.mjs (비-커밋)
import { runV6Pipeline, adaptV6Commands } from '../apps/agent-worker/dist/phases/...';
// ... pipeline call, adapter, SSE envelope write, Playwright screenshot
```

### 5. v5 legacy 제거

삭제 대상:

```
apps/agent-worker/src/phases/v5HtmlValidator.ts
apps/agent-worker/src/phases/v5HtmlValidator.test.ts
apps/agent-worker/src/phases/v5MethodBHtmlGen.ts
apps/agent-worker/src/phases/v5MethodBHtmlGen.test.ts
apps/agent-worker/src/phases/v5MethodBSystemPrompt.ts
apps/agent-worker/src/phases/v5PipelineOrchestrator.ts
apps/agent-worker/src/phases/v5PipelineOrchestrator.test.ts
apps/agent-worker/src/phases/v5Transpile/              (전체 디렉토리)
apps/agent-worker/src/phases/emitV5SkeletonMutations.ts
apps/agent-worker/src/phases/emitV5SkeletonMutations.test.ts
bench/method-compare-phase1/method-b-system.txt        (v5 prompt — historical 로 이동하거나 삭제)
```

삭제 전 확인:
- `rg 'v5Transpile|v5HtmlValidator|v5MethodBHtmlGen|v5PipelineOrchestrator|emitV5SkeletonMutations' apps/ packages/ --glob '!dist/**'` → hit 0
- `apps/agent-worker/package.json` 의 test script 에서 대응 경로 제거
- tsconfig include / dist artifact 정리

### 6. 문서 / SSOT 승격

- `agent-workflow-test/tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md` → historical 로 분류 (AGENTS.md 의 "대체됨, 배경 참조만" 섹션으로 이동)
- 신규 `tooldi-agent-workflow-v6-layout-freedom-ssot.md` 작성:
  - 철학 원칙 5
  - 3-stage pipeline (free HTML → browser layout → primitive extraction)
  - primitive 매핑 규칙 (bitmap/svg 포함)
  - security-only validator
  - anti-pattern 목록
  - 모델 선택 근거 (`gemini-3.1-flash-lite-preview`, bench 근거)
- `AGENTS.md` 의 "현재 authority / design lock" 링크 갱신
- `tooldi-agent-workflow-v1-doc-index.md` v6 반영 (v5 는 historical 표시)
- `tooldi-natural-language-agent-v1-architecture.md` — v6 pipeline 명시적 언급으로 소규모 업데이트 (architecture 는 runtime contract 레이어라 대체로 v6 에서도 유효)

---

## v6 default cutover — 구체 정책

- `runV6Pipeline` 이 호출 시 **예외 발생 (예: Gemini 5xx, Playwright launch fail) 시 작업은 fail**. v5 fallback 없음.
- 사용자 결정: `feature flag 없음, v6 즉시 default`.
- 에러 핸들링: 기존 runStatus 전이 (`failed`) 와 error summary 포맷 유지.
- retry: 기존 v5 retry 로직을 v6 에 그대로 복사 (htmlGen 단계 Gemini 호출).

---

## Acceptance criteria

- [ ] `pnpm -r typecheck` 통과
- [ ] `pnpm -r test` 통과 (v5 테스트 제거로 총 테스트 수 감소, v6 테스트 유지)
- [ ] `rg 'v5(Transpile|HtmlValidator|MethodB|PipelineOrchestrator)|emitV5Skeleton'` hit 0
- [ ] `runJobGraph` 의 default 경로가 runV6Pipeline 을 거침 (unit test 로 확인)
- [ ] 5-sample E2E smoke: 자연어 → toolditor 렌더 → screenshot 저장 성공
- [ ] AGENTS.md / doc-index / v6 SSOT 문서 갱신
- [ ] 기존 canvas.mutation envelope schema 준수 (MutationAck / ack 경로 작동)

---

## 커밋 단위 제안 (한 세션 안에서 6-7개)

0. `[feat] AGW v6 Phase 2.5 prod — font pipeline 반영 (agent-worker side)` ← Phase 2.5 선행분
1. `[chore] agent-worker dev Chromium infra — Playwright 1.59.x 정합 + docker/host 실행 경로`
2. `[feat] AGW v6 LangGraph node — v5 pipeline 을 v6Pipeline+adapter 로 교체`
3. `[chore] AGW v5 legacy 제거 — validator/transpile/pipeline/prompt 파일 + test path`
4. `[feat] AGW v6 E2E smoke — 5 sample screenshot, bench → SSE → toolditor`
5. `[chore] Toolditor Phase 2 temp harness 제거 — fixture 주입 UI + v6Fixtures.ts 삭제`
6. `[docs] AGW v6 SSOT 승격 — AGENTS.md + doc-index + v6 ssot + v5 historical`

---

## Anti-pattern (즉시 제동)

- [ ] v5 legacy 파일을 "경험 자료" 라는 이유로 남김 → handoff 명시: 전원 삭제
- [ ] v5/v6 병행 feature flag 도입 → 사용자 명시: **cutover 즉시**
- [ ] canvas-mutation envelope 에 `v6Primitive` 같은 사내 필드 승급 → metadata 레벨 그대로 (schema 변경 금지)
- [ ] v5 SSE envelope 과 v6 SSE envelope 을 분리 → 하나의 envelope schema 재사용
- [ ] "v6 도 hero-right 가 50% 차지하니 다시 layout family 정의하자" → 절대 금지 (bench 근거로 layout prior 소거 확인됨, 재도입 시 v6 의 근본 이유 파괴)

---

## 리스크

- **R-1 Browser pool 장애**: Playwright launch 실패 시 전체 실행 실패. warm pool 의 crash recovery 가 Phase 5 full 구현 전에도 최소한은 필요 (재시작 + fallback).
- **R-2 Chromium 이미지 버전 드리프트**: 위 §Version drift 참조.
- **R-3 runJobGraph 내부 의존성**: v5 node 가 다른 노드 (예: intent normalize, asset plan) 와 데이터 교환할 수 있음. v6 node 가 동일 입력/출력 계약 지키는지 확인.
- **R-4 SSE ack 호환**: toolditor 클라이언트가 mutation ack 에 특정 필드 기대할 수 있음. Phase 2 후에도 ack 경로 동작 확인.
- **R-5 20-sample E2E 실행 비용**: Gemini 호출 20 × = 유료. 5 샘플로 축약 권장.
- **R-6 v5 bench outputs 보존**: `outputs-3.1-flash-lite/`, `outputs-3.1-flash-lite-v2/` 등은 **보존**. v5 증거 자료. 삭제 금지.

---

## Start Prompt (다음 스레드용)

```
이 handoff (tws-editor-api/agent-workflow-test/docs/handoff/
2026-04-21-agw-v6-phase4-langgraph-swap-handoff.md) +
Phase 2 + 2.5 완료 상태 + memory lock 을 읽고 Phase 4 를 실행하라.

Prerequisites 체크부터:
1. toolditor feature/v6-primitives (5b6926326) 최신 확인
2. agent-workflow-test feature/v6-structure (36ec99a) 최신 확인
3. Chromium 이미지 / Playwright 버전 정합 (1.59.x 권장)
4. npm run local:agent 로 toolditor 실렌더 가능 확인

순서:
0. Phase 2.5 prod 경로 반영 (agent-worker side — v6BrowserRender / v6CommandAdapter / v6SystemPrompt 에 font pipeline 동일 로직)
1. playwright 버전 정합 (1.59.x 으로 맞춤)
2. LangGraph v5 node 파악 → v6Pipeline + adapter 로 교체
3. SSE canvas.mutation envelope 재사용 (기존 builder 패턴)
4. 5-sample E2E smoke: 자연어 → pipeline → toolditor → screenshot
5. v5 legacy 파일 전체 삭제 (쉘 기준 handoff §5 목록)
6. toolditor 쪽 Phase 2 임시 fixture harness 제거 (v6Fixtures.ts + AgentHappyPathPanel 임시 섹션)
7. AGENTS.md + doc-index + v6 SSOT 문서 갱신

경계 (철학 5):
- layout family 재정의 금지.
- slot/role/topology/CTA 재도입 금지.
- feature flag 없음 — v6 즉시 cutover.
- v5 bench outputs 보존 (outputs-*/method-a, method-b 디렉토리는 건드리지 말 것).
- Phase 2.5 prod 반영 시 v6-poc 와 agent-worker 양쪽 font registry 경로가 같은 JSON 파일을 참조 (중복 복사 금지).

커밋 (대략 6-7 단위):
- [feat] Phase 2.5 prod (font pipeline agent-worker 측)
- [chore] dev Chromium infra
- [feat] v6 LangGraph node
- [chore] v5 legacy 제거
- [feat] v6 E2E smoke
- [chore] toolditor Phase 2 temp harness 제거
- [docs] v6 SSOT 승격
```

---

## 완료 후 다음

- **Phase 5 (인프라)**: Docker production image, Lambda + @sparticuz/chromium layer, warm pool, cold start benchmark.
- **Phase 6 (RAG)**: `placeholder://` → Tooldi asset catalog 매핑. 별도 plan 필요.
- **Phase 3-bis (rebench)**: Phase 2+4 완료 후 전체 파이프라인 기준 재측정. 이번 세션의 bench 는 Stage 1 (LLM HTML gen) 만 측정. 전체 E2E latency / primitive 품질 / rendered-visual quality 는 새 rubric 필요.
