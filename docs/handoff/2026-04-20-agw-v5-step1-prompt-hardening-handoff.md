# AGW v5 Step 1 — Prompt Hardening Handoff

## Goal

`bench/method-compare-phase1/method-b-system.txt` 의 Method B system prompt 를 하드닝(`<br>` 금지 + 줄바꿈 분리 규칙 + text overflow 힌트 추가)하고, `gemini-3.1-flash-lite-preview` 로 재벤치해 format-level `dom_grammar_ok ≥ 97%`, 전체 weighted pass rate `≥ 95%` 를 증명한다. v5 SSOT 구현 로드맵의 **Step 1** 에 해당.

## Current State

- 2026-04-20 v5 SSOT(`tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md`) 제정됨 — Constrained HTML Pipeline 철학/6단계/재사용·폐기 경계/모델 lock 이 normative.
- downstream 문서 12개에 v5 pointer/historical 배너 부착 완료. 커밋 `67aa937` + nit 커밋 `94c4096` 로 로컬 저장됨. 푸시 안 됨.
- 브랜치: `feature/retrieval-prior-stack` (on `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test`).
- 5-모델 × 20 prompts 벤치 완료 상태 — `outputs-3.1-flash-lite/method-b` 기준 `dom_grammar_ok` 가 **50%** (주요 실패 원인: `<br>` 태그 삽입). 프롬프트 한 줄만 고치면 95%대 진입 가능하다는 것이 bench 결론.
- `method-b-system.txt` 는 기존 기준선 그대로. 아직 `<br>` 금지 / overflow 힌트 없음.
- `python3 -m http.server 8789` (pid 32964) 로 뷰어가 돌고 있었으나 세션 종료 시 죽었을 가능성 있음 — 필요 시 재기동.
- Unstaged: `tooldi-agent-runtime/apps/*` 수정과 `bench/` 디렉토리 전체 — Step 1/4 범위라 이번 커밋에는 제외.

## Locked Decisions

- **설계 철학**: Constrained HTML Pipeline (v5 SSOT, V1~V5 axiom). LLM 은 디자인 판단만, 코드는 직렬화만. Pass-2 는 결정적.
- **Default 모델**: `gemini-3.1-flash-lite-preview`. 교체는 `bench/method-compare-phase1/` 재실행 + parity/cost/latency 증거 필수.
- **6단계 파이프라인**: Intent Normalize → HTML Design Pass → Validator + Self-Repair → RAG Asset Swap → DOM → Layer Graph Transpiler → Text Overflow Post-Processor. Canvas Mutation / SSE / completion gate 는 재사용.
- **Completion 판정**: editability + renderability + save truth 3 축만. slot/cluster completeness 는 금지.
- **폐기 모듈 (v5 §3.2)**: `buildObjectNativePath`, `buildReferenceResetPath`, `buildReferenceCompositionV2`, `buildTopologyPath`, `ReferenceBlockKind`, `ObjectNativeClusterFamily`, `classifyTextBlock`, `classifySurfaceBlock`, `resolveRequiredExecutionSlots`, addable vocabulary registry, projected object graph extractor, computable annotation generator, `buildSearchProfile`, `assembleTemplateCandidates`, `buildTemplatePriorBundle`, `selectTemplateComposition`, `selectTypography`, `ruleJudge`, `buildJudgePlan`, `buildRefineDecision`, patch-only refine loop.
- **재사용 모듈**: `normalize_intent`, `canvasObjectFactories.ts` (`buildTextObject`, `buildCoverImageObject`, `buildCtaGroupObject`), `contracts.ts` (AgentLayerType, mutation blueprint), Canvas Mutation Protocol SSE, completion gate, `sandbox/embedding-test/` Qdrant + jina-clip-v2 PoC.
- **DOM grammar whitelist (v5 SSOT §2 Stage 2)**: root `<div style="position:relative; width:1200px; height:628px; overflow:hidden;">` 강제. 허용 태그 `div, span, p, h1~h6, img, svg`. 금지 `button, a, ul, table, form, br, style, script, link`. 허용 CSS 속성 whitelist 는 left/top/width/height, font-*, color, text-align, line-height, letter-spacing, background-color, linear-gradient, border-radius, box-shadow (single), opacity, transform:rotate, z-index 로 제한.
- **이미지 placeholder 규격**: `<img data-tooldi-role="..." data-hint="..." data-aspect="..." src="placeholder://">`.
- **커밋 규칙**: `[docs]` / `[refactor]` / `[fix]` / `[feat]` 등 대괄호 prefix 필수. `Co-Authored-By` 절대 금지. `git add -A` 금지 — 파일 개별 add.
- **푸시 금지**: 사용자 명시 요청 없으면 로컬 커밋까지만.

## Contracts

### Bench runner 호출 규격

```bash
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/bench/method-compare-phase1
# single-method, single-model
node run.mjs --model gemini-3.1-flash-lite-preview --outputSubdir outputs-3.1-flash-lite-v2 --concurrency 3
# grade same outputSubdir
node grade.mjs --outputSubdir outputs-3.1-flash-lite-v2 --gradesSubdir grading-3.1-flash-lite-v2
# update multi-model aggregate report
node multi-report.mjs
```

- `run.mjs` 는 `prompts.json` 의 20 prompts 를 `method-a-system.txt` + `method-b-system.txt` 로 각각 호출한다. 이번 작업에선 Method B 변경만 검증 목적이므로 Method A 도 같이 돌아가는 것은 허용. concurrency 3 유지.
- API key 소스: `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/.env.local` 의 `GOOGLE_API_KEY`. `run.mjs` 는 이를 env 또는 직접 로드한다 — 기존 구현 방식 유지.
- retry 1 회, 429 backoff max 2 회 (기존 구현 동작).
- 모델 preview 여서 rate limit 엄격 — concurrency 올리지 말 것.

### Grading rubric (`grade.mjs`)

Method B 체크 항목 9개 — 모두 bool 로 집계되고 weighted average 가 pass rate 로 환산됨:
- `html_parse_ok` — `htmlparser2`/`parse5` 로 parse 가능
- `dom_grammar_ok` — 허용 태그만 사용 (`<br>` 등 금지 태그 감지)
- `css_whitelist_ok` — inline style 이 허용 CSS 속성만 포함
- `root_structure_ok` — root `<div>` 의 width/height 가 1200×628 spec
- `positioning_ok` — 모든 자식이 `position:absolute`
- `no_forbidden` — `flex`, `grid`, `calc(`, `translate(` 등 금지 패턴 부재
- `placeholder_annotated_ok` — `<img>` 전부 `data-tooldi-role` + `data-hint` 포함
- `element_count` — 3~12 사이
- `bounds_ok` — canvas 바깥으로 나가는 element 없음

### Gemini API 경로

- REST base: `https://generativelanguage.googleapis.com/v1beta/`
- model id: `gemini-3.1-flash-lite-preview` (정확히 이 이름 — typo 주의)
- `responseMimeType`: Method A 만 `application/json`. Method B 는 plain text (HTML) 이므로 미지정.
- thinking config: **기본값 유지** (production 시뮬레이션). `thoughtsTokenCount` 는 usageMetadata 에서 기록됨.

## Relevant Files

### 반드시 먼저 읽을 것

- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/AGENTS.md` — authority hierarchy 1번 = v5 SSOT.
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md` — 철학/파이프라인/재사용·폐기 경계/모델 lock/로드맵.
- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-natural-language-agent-v1-architecture.md` — runtime semantic contract (여전히 normative).

### Step 1 작업 대상

- `bench/method-compare-phase1/method-b-system.txt` — **수정 대상** (Method B system prompt).
- `bench/method-compare-phase1/prompts.json` — 20 Korean banner prompts, 변경 금지 (baseline 비교용).
- `bench/method-compare-phase1/run.mjs` — `--model`, `--outputSubdir`, `--concurrency` 플래그 지원.
- `bench/method-compare-phase1/grade.mjs` — `--outputSubdir`, `--gradesSubdir` 플래그 지원.
- `bench/method-compare-phase1/multi-report.mjs` — 모델별 pass rate × latency × cost 집계.
- `bench/method-compare-phase1/outputs-3.1-flash-lite/method-b/prompt_*.json` — **기존 baseline 보존**. `<br>` 실패 케이스 분석용.
- `bench/method-compare-phase1/MULTI_MODEL_REPORT.md` — 기존 리포트. Step 1 완료 시 before/after delta 섹션 추가.

### Step 2~4 사전 읽기용 (이번 Step 1 작업 범위 아님, 다음 Step 준비)

- `/home/ubuntu/github/tooldi/toolditor/src/features/agent-workflow-spike/model/contracts.ts` — AgentLayerType enum, mutation blueprint.
- `/home/ubuntu/github/tooldi/toolditor/src/features/agent-workflow-spike/lib/canvasObjectFactories.ts` — `buildTextObject` (L70), `buildCoverImageObject` (L127), `buildCtaGroupObject` (L244).
- `/home/ubuntu/github/tooldi/toolditor/src/types/element/baseType.ts`, `TextType.ts`, `ImageType.ts`, `PathType.ts` — Tooldi layer schema.

### 뷰어 (선택적 육안 확인)

- `bench/method-compare-phase1/viewer-multi.html` — 5-모델 × 2-methods × 20-prompts 그리드 뷰어. 새 `outputs-3.1-flash-lite-v2` 를 추가하려면 `build-viewer-multi.mjs` 를 편집하거나 별도 viewer 스크립트 호출.
- 서버 재기동: `cd bench/method-compare-phase1 && python3 -m http.server 8789 --bind 127.0.0.1 &`.

## Open Risks

- **R-1 `<br>` 외 다른 실패 패턴 잠재**: bench 기록상 flash-lite 실패 주원인은 `<br>` 이지만, 프롬프트 하드닝 후 다른 long-tail (예: `calc()`, inline-block, transform:translate) 가 드러날 수 있음. 하드닝 후 재벤치 결과 실패 케이스 3개를 직접 열어 추가 패턴 확인할 것.
- **R-2 overflow 힌트가 디자인을 단조롭게 만들 수 있음**: 힌트가 너무 강하면 flash-lite 가 과도하게 안전한 여백/크기만 쓴다. 육안 체크 필요 — `viewer-multi.html` 로 before/after 샘플 5개 비교.
- **R-3 재벤치 비용**: 20 prompts × flash-lite ≈ $0.008, 무시 가능한 수준. 단 3회 이상 반복되면 누적 고려.
- **R-4 Method A 영향 없음 확인 필요**: `method-a-system.txt` 는 이번에 건드리지 않지만, `run.mjs` 가 두 방식을 같이 돌리면 Method A 결과도 `outputs-3.1-flash-lite-v2/method-a/` 에 덮어써진다. 기존 baseline(`outputs-3.1-flash-lite/method-a/`)은 **디렉토리 분리로 보존**되므로 위험 없음.
- **R-5 TypeScript 상태**: `tooldi-agent-runtime/` 과 `toolditor/` 에는 adaptive composition 잔재 때문에 현재 `pnpm tsc` 가 green 불가. v5 §3.2 폐기는 Step 4 Legacy cleanup 에서 처리. **이번 Step 1 은 bench 하나만 건드리므로 TS 빌드 의존 없음**.
- **R-6 JSON 파서 엣지**: `method-b-system.txt` 에 `<br>` 금지를 너무 강하게 쓰면 모델이 `\n` 을 출력할 수도 있음. `dom_grammar_ok` 가 이를 허용하는지 grade.mjs 를 확인하고 필요시 rubric 에 명시적 조건 추가.

## Acceptance Criteria

- `bench/method-compare-phase1/method-b-system.txt` 에 다음 3 항목이 명시적으로 추가됨:
  1. `<br>` 태그 사용 금지 (예시 포함).
  2. 줄바꿈은 별도 `<p>` 또는 `<span>` 요소로 분리.
  3. 텍스트 overflow 방지 (fontSize 대비 container width 최소 비율 힌트 또는 `fontSize * char_count ≤ width * K` 같은 정량 규칙).
- 새 outputs 디렉토리 `outputs-3.1-flash-lite-v2/` 에 20/20 prompts 재실행 결과 저장.
- Grading 결과:
  - `dom_grammar_ok` ≥ **97%** (19/20 이상).
  - 전체 weighted pass rate ≥ **95%**.
  - `bounds_oob` 비율은 baseline 대비 **악화되지 않음** (동점 허용, 상승만 금지).
- `MULTI_MODEL_REPORT.md` 하단에 `Step 1 프롬프트 하드닝 delta` 섹션 추가 — before/after metric 대조표 + before/after 실패 샘플 3개 링크.
- 변경 파일만 스테이지한 단일 `[docs]` 커밋 1개 또는 `[feat]` bench harness 커밋 1개 (관점에 따라 선택).

## Verification

```bash
# 0. 현재 상태 확인
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test
git log --oneline -5                # 94c4096, 67aa937, 3c4a220, f427ca4 보여야 함
cat AGENTS.md | head -10            # v5 SSOT 가 authority 1번
rg -l "Template-Aware Adaptive Composition" --glob '*.md' | head
# → 결과가 전부 historical/supersede banner 문서여야 함 (adaptive-composition SSOT,
#   representation-design-lock, template-intelligence-design-lock, v5 SSOT 자체의 anti-pattern 인용)

# 1. 하드닝 전 baseline 숫자 확인
jq '.methodB.weightedPassRate, .methodB.metrics.dom_grammar_ok.passRate' \
  bench/method-compare-phase1/grading-3.1-flash-lite/summary.json 2>/dev/null \
  || cat bench/method-compare-phase1/MULTI_MODEL_REPORT.md | rg -A2 '3.1-flash-lite'
# → flash-lite Method B dom_grammar_ok 가 50% 수준인 기존 숫자 확인

# 2. 하드닝 후 재벤치
cd bench/method-compare-phase1
node run.mjs --model gemini-3.1-flash-lite-preview --outputSubdir outputs-3.1-flash-lite-v2 --concurrency 3
node grade.mjs --outputSubdir outputs-3.1-flash-lite-v2 --gradesSubdir grading-3.1-flash-lite-v2
node multi-report.mjs
# → grading-3.1-flash-lite-v2/summary.json 의 methodB.weightedPassRate ≥ 0.95,
#   metrics.dom_grammar_ok.passRate ≥ 0.97

# 3. 실패 샘플 3개 직접 열어 잔여 패턴 확인
ls outputs-3.1-flash-lite-v2/method-b/*.json | head -20
# 실패(`ok:true` 이지만 grade 에서 하나라도 false) 케이스 3개를 `cat` 으로 열어 구조 확인

# 4. 육안 품질 regression 없음 확인 (선택)
python3 -m http.server 8789 --bind 127.0.0.1 &
# → viewer-multi.html 또는 전용 v2 viewer 로 before/after 5개 쌍 비교

# 5. 커밋 + 로그 확인
cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test
git add bench/method-compare-phase1/method-b-system.txt
git add bench/method-compare-phase1/MULTI_MODEL_REPORT.md
# outputs-3.1-flash-lite-v2/** 는 용량 크면 .gitignore 또는 별도 artifact 저장 결정
git commit -m "[feat] AGW v5 Step 1 Method B prompt 하드닝 — <br> 금지 + overflow 힌트"
git log --oneline -3
```

자동 oracle 없음 — pass rate 임계값(≥95%, ≥97%) 과 육안 샘플 비교가 최종 판정자.

## Start Prompt

새 스레드에 다음 프롬프트 그대로 붙여넣어 시작하라:

> `agent-workflow-test/AGENTS.md`, `tooldi-agent-workflow-v5-constrained-html-pipeline-ssot.md`, 그리고 `docs/handoff/2026-04-20-agw-v5-step1-prompt-hardening-handoff.md` 를 순서대로 읽어 현재 상태 파악한 뒤, Step 1 "프롬프트 하드닝" 을 실행하라. `bench/method-compare-phase1/method-b-system.txt` 에 (a) `<br>` 금지 (b) 줄바꿈은 `<p>` 또는 `<span>` 별도 요소로 분리 (c) 텍스트 overflow 방지 정량 힌트 3가지를 추가한 뒤, `node run.mjs --model gemini-3.1-flash-lite-preview --outputSubdir outputs-3.1-flash-lite-v2 --concurrency 3` → `node grade.mjs --outputSubdir outputs-3.1-flash-lite-v2 --gradesSubdir grading-3.1-flash-lite-v2` → `node multi-report.mjs` 순으로 실행. Acceptance criteria(`dom_grammar_ok ≥ 97%`, weighted pass rate ≥ 95%, bounds 비악화) 달성 확인 후 `MULTI_MODEL_REPORT.md` 에 before/after delta 섹션을 추가하고 `[feat]` 대괄호 prefix 커밋 1개로 마무리하라. 커밋 시 Co-Authored-By 금지, `git add -A` 금지, 푸시 금지.
