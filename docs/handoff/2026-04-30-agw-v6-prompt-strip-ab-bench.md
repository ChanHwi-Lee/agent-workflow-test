# AGW v6 System Prompt Strip — Mini A/B Offline Bench

## Goal

별도 worktree 에서 v6 system prompt 의 layout-prescriptive 처방을 strip 한 변형 B 를 구현하고, 6 케이스 × N=3 × 2 변형 (총 36 generation) 으로 의도 fidelity / 다양성 / geometry 안전성을 사전 등록 가설에 따라 offline A/B 검증한 뒤 채택/재조정/기각 권장을 보고한다.

## Current State

### 이미 구현되어 있는 것
- v6 파이프라인 전체 (`v6HtmlGen` → `v6BrowserRender` → `v6PrimitiveMapper` → `v6CommandAdapter` → `mutationObjectBuilder` v6 분기) — lossless 검증 완료, 변경 금지.
- 26-prompt 벤치 러너: `toolditor/scripts/agent-workflow-v6-bench.mjs` — `--prompts` / `--out` / `--only` / `--limit` 플래그 지원.
- 26 prompt 정의: `toolditor/scripts/agent-workflow-v6-bench-prompts.json`.
- 비교 이미지 도구: `toolditor/scripts/agent-workflow-v6-visual-check.mjs` (참조용).
- 현재 prompt(=A) 의 26-case 산출물: `/tmp/v6-bench-phase4-after-fixes/2026-04-27T00-56-28-701Z/` 등 `/tmp/v6-bench-*`.
- `V6_SYSTEM_PROMPT` 가 `apps/agent-worker/src/phases/v6SystemPrompt.ts` 에서 단일 export, 사용처는 `v6HtmlGen.ts:87` 한 곳뿐.
- 진단 메모: `vault://작업기록/work-logs/2026-04-30-agw-v6-bench-layout-convergence-prompt-root-cause.md`.

### 아직 안 된 것 (이 핸드오프의 범위)
- prompt B 변형 export + `V6_PROMPT_VARIANT` env 분기.
- `buildCopyLoadSummary` 의 `layoutHint` strip + `formatV6RenderQualityRetryFeedback` 의 슬롯 어휘 trim.
- 6 케이스 × N=3 × 2 변형 batch 실행.
- 자동 메트릭 집계 (geometry pass rate / retry / latency / pHash 분산 cross-case·within-case).
- HITL 블라인드 비교 이미지 + 평가.
- 결과 보고서 (`vault://작업기록/work-logs/`).

## Locked Decisions

### 진단 (변경 금지, 메모로 박혀있음)
- 26개 결과 layout 수렴의 근본 원인은 **결정적 파서가 아니라 system prompt** (`v6SystemPrompt.ts` L57-72 + `buildCopyLoadSummary` 의 `layoutHint`). 파서 / 매퍼 / 어댑터 / Toolditor v6 분기는 lossless.
- `v6DebugHtmlPreview.ts` 의 unrestricted preview 는 **에디터 변환에 안 쓰이는 디버그 전용**. v6-html 과 같은 출력의 변환 전/후가 아니라 독립된 두 LLM 호출. 절대 같이 비교 분석하지 말 것.
- 사용자 axiom: layout 결정 권한은 **user prompt + (옵셔널) trend context** 에 있음. system prompt 는 **security + 렌더 결정성** 두 축만.

### prompt B 의 keep / drop 분류 (사용자와 합의 완료, 임의 재분류 금지)

| `v6SystemPrompt.ts` 위치 | 처리 |
|---|---|
| L58-59 (캔버스 안 safe area, root border-box) | **keep** |
| L60 (텍스트 crop/hide 금지, 폰트↓→폭↑→높이↑→자연 wrap) | **keep** |
| L61 (한글 8-14 chars/line, phrase break, dangling 회피) | **keep** — 사용자 결정, 렌더 결정성 축 |
| L62 (contrast/weight/color blocks/spacing/imagery 디자인 처방) | **drop** |
| L63 전반 (한글 헤드라인 12자 이상이면 2-3 lines) | **drop** |
| L63 후반 ("1200×628 헤드라인 ~260px 이하" 픽셀 예산) | **drop** |
| L64 (텍스트 element height 확보) | **keep** (constraint 표현으로 정리) |
| L65 (inline span 분리, 강조는 별도 line/block) | **drop** |
| L66 (`1301_400` 짧은 액센트만, 한글 헤드라인 `701_700`) | **drop** (availability 만 남김) |
| L67 (placeholder 위 텍스트는 backing shape 으로 덮어라) | **rephrase** → "텍스트 bounds 와 `<img>` bounds 가 교차 금지(해결 방식은 자유)" — constraint 어휘로만 |
| L68 (slot enumeration: top labels/headline/supporting copy/CTA/price/details) | **drop** ← 의도 손실 주범 |
| L69 (각자 band, 부족하면 stack/move) | **drop** |
| L70 (top badge 캔버스 위로 잘리지 말 것) | **keep** |
| L71 (한글 line-height 1.05-1.18) | **keep** — 렌더 결정성 |
| L72 (장식 bleed 가능, 가독 텍스트/이미지는 캔버스 안) | **keep** |

### 추가 변형
- `buildCopyLoadSummary` (L124-161) 의 `layoutHint` 한 줄(L146-151) → drop. 통계 4-5줄만 유지.
- `formatV6RenderQualityRetryFeedback` → 슬롯 enumeration 형태의 처방만 trim. 기하 좌표 데이터는 keep.

### A/B 6 케이스 (확정)
1. `23-stress-image-product-ad` (필수, 무선 헤드폰, 어두운 BG, image-first)
2. `25-stress-square-card` (1080×1080, 인스타 정사각, 제품사진 중심)
3. `26-stress-wide-banner` (1600×400, 클라우드 백업 wide banner)
4. `18-mobile-game` (역동적 판타지, 게임 hero)
5. `13-wedding-invitation` (우아하고 따뜻한 무드)
6. `21-stress-long-korean-copy` (안전망 회귀 가드 — 긴 한글 카피)

### 실험 파라미터
- N = 3 / 케이스 / 변형 → 36 generation
- trend context: **OFF** (변수 격리)
- temperature 등 sampling: A/B 동일 (현재 `v6HtmlGen.ts` 값 그대로)
- retry budget: A/B 동일 (현재 코드 값 유지)
- 모델: `gemini-3.1-flash-lite-preview` (architecture lock)
- 변형 스위치: `V6_PROMPT_VARIANT=A|B` env var, 기본 A
- worker 빌드/배포 없이 worker **재시작만**으로 토글되어야 함

### 사전 등록 가설 (결과 분석 전 확정, 변경 금지)
- 23/25/18/13 에서 B 가 의도 fidelity 우위
- 21 에서 B 가 geometry 안전성 동등 (저하 시 한글 safety 부족 신호)
- cross-case pHash 분산에서 B 우위
- **기각 임계**: geometry 1차 통과율 A 대비 -40%p 이상 하락 OR 6 케이스 중 4개 이상에서 HITL 이 B 를 더 안 좋다고 판정 → strip 과함, 재조정

## Contracts

### Env Var 분기
- 변수명: `V6_PROMPT_VARIANT`
- 허용 값: `"A"` | `"B"` | unset (= A)
- 기본값: `"A"` (회귀 zero — unset 일 때 현재 동작과 100% 동일)
- 적용 지점: `apps/agent-worker/src/phases/v6SystemPrompt.ts` 의 `V6_SYSTEM_PROMPT` export, `buildCopyLoadSummary`, retry feedback 함수
- 적용 시점: 프로세스 시작 시 1회 evaluate. 런타임 토글 불필요.

### prompt B 의 텍스트 구조 (구현자가 사용자 검토 받기 전 임의 작성 금지)
- 단계 1 에서 strip 결과를 **텍스트로 사용자에게 먼저 보여주고 OK 받은 뒤** 코드에 박는다.
- L1-9 의 philosophy lock 주석은 그대로 유지 (자기 일관성 회복).
- L19-49 (Output format / Freely allowed / Prohibited / Fonts) 영역은 **변경 금지** — security + I/O 계약.
- L51-54 (Design freedom block) 도 **변경 금지** — 자유도 선언.
- 변경 영역은 **L57-72 만**. 위 표 적용. 결과는 16줄 → 6-7줄로 압축 예상.

### Bench 출력 디렉토리 규약 (제안)
- A: `/tmp/v6-bench-AB/<timestamp>/A/<case-id>/<run-i>/`
- B: `/tmp/v6-bench-AB/<timestamp>/B/<case-id>/<run-i>/`
- 각 run 디렉토리 안에 `04-v6-html-preview.png`, `02-toolditor-canvas.png`, `summary.json`, `v6-render-quality-report.json`, `debug-v6-html.json`, `debug-unrestricted-html.json` 존재.
- 매핑 키 (HITL 블라인드용): `/tmp/v6-bench-AB/<timestamp>/blinding-key.json`.

### 메트릭 산출 규약
- pHash: `phash` library or 직접 구현. 8x8 또는 16x16 DCT.
- cross-case 분산: 같은 변형의 6 케이스 N=3 → 18장 pairwise hamming distance 평균.
- within-case 분산: 같은 케이스 N=3 → 3장 pairwise hamming distance 평균. 케이스별로 산출 후 변형별 평균.
- geometry 1차 통과율: `v6-render-quality-report.json` 의 `flags` 가 빈 배열이면 통과로 카운트.
- retry 횟수: `summary.json` 또는 attempts 디렉토리 카운트.

## Relevant Files

### 수정 대상
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6SystemPrompt.ts` — `V6_SYSTEM_PROMPT_A` / `V6_SYSTEM_PROMPT_B` 두 export + 분기. `buildCopyLoadSummary` 에 variant 분기. L57-72 영역만 손댐.
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6Pipeline.ts` 또는 retry feedback 모듈 — `formatV6RenderQualityRetryFeedback` 의 variant 분기 (슬롯 어휘 trim).

### 단일 사용처 (자동 분기되면 변경 불필요)
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6HtmlGen.ts:87` — `V6_SYSTEM_PROMPT` import 사용 지점.

### 변경 금지 (lossless 검증 완료)
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6HtmlValidator.ts`
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6BrowserRender.ts`
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6PrimitiveMapper.ts`
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6CommandAdapter.ts`
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6DebugHtmlPreview.ts`
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6Types.ts`
- `toolditor/src/features/agent-workflow-spike/lib/mutationObjectBuilder.ts` (v6 분기)
- `toolditor/src/features/agent-workflow-spike/lib/canvasObjectFactories.ts` (`buildV6*`)
- `toolditor/src/features/agent-workflow-spike/lib/v6StyleTokenMaterializer.ts`

### 벤치 / 평가 (재사용)
- `toolditor/scripts/agent-workflow-v6-bench.mjs` — bench runner, 그대로 사용.
- `toolditor/scripts/agent-workflow-v6-bench-prompts.json` — 26 케이스, 6 케이스만 `--only` 로 필터.
- `toolditor/scripts/agent-workflow-v6-visual-check.mjs` — 비교 이미지 참조 패턴.

### 참조
- `vault://작업기록/work-logs/2026-04-30-agw-v6-bench-layout-convergence-prompt-root-cause.md` — 진단 본문.
- `/mnt/c/Users/USER/Documents/llm-store/MEMORY.md` 의 `project_nl_agent_architecture_lock` — Method B + 모델 고정.
- `/tmp/v6-bench-phase4-after-fixes/2026-04-27T00-56-28-701Z/` — A 변형의 baseline 산출물 (이미 존재).
- `/tmp/v6-bench-labeled/` — triptych 포맷(FREE/V6/CANVAS) 참조용.

### 인프라
- `local-docker` 스택에서 worker 가 실행됨. `V6_PROMPT_VARIANT` env 주입 위치 확인 필요 (`docker-compose.editor-local.yml` 또는 worker entry script).

## Open Risks

1. **다른 에이전트가 v6 별도 버그 수정 진행 중** — 충돌 회피 위해 반드시 `isolation: "worktree"` 로 작업. 메인 브랜치 커밋 금지. 시작 시 main fetch + status 로 충돌 영역 확인.
2. **prompt strip 과함 함정 (메타 규칙)** — geometry 결함을 prompt 처방으로 누르려는 유혹 차단. 기각 임계 넘으면 *prompt B 를 더 다듬는 게 아니라* sampling 파라미터 / 모델 라인으로 이동 검토. 이 핸드오프의 가장 중요한 메타 규칙.
3. **변수 누수** — A/B 모두 `trend OFF`, 동일 temperature, 동일 retry budget. "B 만 trend ON 으로 해보자" 같은 변형 추가 금지.
4. **placeholder→실 이미지 후 가독성 미검증** — L67 backing-shape drop 의 진짜 위험은 실제 광고 이미지 합성 후 텍스트 가독성. bench 는 placeholder 라 못 잡음. 23 케이스만은 placeholder 결과 + 가능하면 실 헤드폰 이미지 합성 1회 추가 검증 권장. 미검증 시 결정 보류.
5. **N=3 통계적 한계** — 방향 신호용. 통계 유의성 못 줌. 결과 애매하면 N 늘리거나 케이스 추가. 보고서에 명시.
6. **gemini API seed 미지원** — 완전 재현 불가. 같은 회차 안에서 A→B→A 순서 섞어서 한 번 더 돌리면 noise vs 변형 영향 sanity check 가능.
7. **임의 keep/drop 재분류 금지** — 위 표는 사용자 합의 완료. 구현 중 "이건 빼는 게 더 나을 듯" 판단은 사용자 확인 후에만.
8. **`V6_PROMPT_VARIANT` 가 worker 재기동 없이 토글 안 될 수 있음** — module-level 상수로 export 하면 프로세스 시작 시 1회 evaluate. 이 동작이면 OK. 만약 hot reload 가 필요하다고 판단되면 사용자 확인 후 함수형으로 변경.

## Acceptance Criteria

- [ ] `V6_PROMPT_VARIANT=A` 또는 unset 일 때 동작이 현재와 100% 동일 (회귀 zero). 1 케이스 sample run 으로 sanity 확인.
- [ ] `V6_PROMPT_VARIANT=B` 일 때 strip 된 prompt 가 실제 LLM 에 전달됨. `debug-v6-html.json` 의 system prompt 필드 또는 임시 console.log 로 검증.
- [ ] 6 케이스 × N=3 × 2 변형 = 36 generation 결과 디렉토리 존재. 각 디렉토리에 `04-v6-html-preview.png`, `02-toolditor-canvas.png`, `summary.json`, `v6-render-quality-report.json` 모두 있음.
- [ ] 자동 메트릭 표 산출:
  - 케이스별 1차 geometry 통과율 (A vs B)
  - 케이스별 평균 retry 횟수 (A vs B)
  - 케이스별 최종 통과율 (A vs B)
  - 케이스별 평균 latency / 총 LLM 호출
  - cross-case pHash 분산 (A vs B) — 같은 변형의 6 케이스 N=3 = 18장 기준
  - within-case 분산 (A vs B) — 같은 케이스 N=3 회 출력 기준, 케이스별 후 평균
- [ ] HITL 블라인드 비교 이미지 생성: 케이스당 best-of-3 1쌍 × 6 = 6 비교 (또는 9 쌍 × 2 = 18 비교 중 택1). 좌/우 라벨은 `variant1` / `variant2` 로 익명화, 매핑은 `blinding-key.json` 별도 저장.
- [ ] HITL 평가 완료 (`hitl-eval-dashboard` 스킬 사용, 사용자 채점).
- [ ] 결과 보고서 `vault://작업기록/work-logs/2026-MM-DD-agw-v6-prompt-strip-ab-result.md` 작성. 자동 메트릭 표 + 사전 등록 가설 대조 + HITL 결과 + 결정 권장(B 채택 / B 재조정 / 기각).
- [ ] 코드는 worktree 에 머무름. 메인 브랜치 커밋/머지 금지. "B 채택" 결정시에만 다음 스레드에서 정식 PR.

## Verification

### 1. Variant 분기 sanity (자동)
- 명령: `cd agent-workflow-test/tooldi-agent-runtime && pnpm test --filter agent-worker -- v6SystemPrompt` (또는 임시 단위 테스트 추가)
- 기대: `V6_PROMPT_VARIANT=A` → `V6_SYSTEM_PROMPT_A` export, `V6_PROMPT_VARIANT=B` → `V6_SYSTEM_PROMPT_B` export. 두 prompt 의 `length` 가 다르고, B 에는 `top labels` 문자열이 없고 A 에는 있음.

### 2. End-to-end smoke (수동)
- 명령: `V6_PROMPT_VARIANT=B node toolditor/scripts/agent-workflow-v6-bench.mjs --only=23-stress-image-product-ad --out=/tmp/v6-bench-AB-smoke`
- 기대: 정상 종료, `04-v6-html-preview.png` 생성, `debug-v6-html.json` 의 system prompt 필드에 strip 된 텍스트 포함, `top labels` 문자열 부재.
- 명령: `V6_PROMPT_VARIANT=A node toolditor/scripts/agent-workflow-v6-bench.mjs --only=23-stress-image-product-ad --out=/tmp/v6-bench-AB-smoke-A`
- 기대: A 결과의 system prompt 가 현재 production 과 동일.

### 3. 36-generation batch (자동, ~30분)
- 명령:
  ```bash
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  ONLY="23-stress-image-product-ad,25-stress-square-card,26-stress-wide-banner,18-mobile-game,13-wedding-invitation,21-stress-long-korean-copy"
  for v in A B; do
    for i in 1 2 3; do
      V6_PROMPT_VARIANT=$v node toolditor/scripts/agent-workflow-v6-bench.mjs \
        --only="$ONLY" --out="/tmp/v6-bench-AB/$TS/$v/run-$i"
    done
  done
  ```
- 기대: 36 디렉토리 각각에 4종 산출물 모두 존재. 누락 없음.

### 4. 메트릭 집계 (자동)
- 스크립트(추가 필요): `toolditor/scripts/agent-workflow-v6-ab-metrics.mjs` — `summary.json` + `v6-render-quality-report.json` 스캔, `04-v6-html-preview.png` pHash 산출, 표 출력.
- 기대: stdout 에 위 acceptance #4 의 메트릭 표가 markdown 으로 나옴. JSON 도 함께 dump 해서 보고서에 그대로 포함.

### 5. HITL 평가 (수동)
- 단계: `hitl-eval-dashboard` 스킬 호출 → 6 비교 이미지 + 변경 의도 설명(케이스별 user prompt) 표시 → 사용자가 (a) 의도 fidelity (b) 디자인 quality 두 축으로 1-5 점 채점 + 케이스별 winner 선택.
- 기대: 6 케이스 모두 점수와 winner 기록.

### 6. 가설 대조 + 결정
- 단계: 보고서에 사전 등록 가설 4개를 그대로 옮기고, 메트릭 + HITL 결과로 각각 satisfied / failed / inconclusive 판정. 기각 임계 도달 여부 명시. 결정 권장.
- 기대: 보고서 `## 결정` 섹션에 명확한 권장(채택 / 재조정 / 기각).

### 자동화 불가 항목 (명시)
- placeholder→실 이미지 합성 후 가독성 검증은 자동화 안 됨. 23 케이스 best B 결과 1장 + 실 헤드폰 이미지 1장으로 사용자 manual 합성 검토. 가능하면 진행, 불가하면 보고서에 "결정 보류 사유" 로 명시.

## Start Prompt

```text
이 스레드는 v6 system prompt strip 의 mini A/B offline bench 를 구현/실행/평가하는 작업이다.

기획은 별도 스레드에서 끝났고 합의된 결정이 핸드오프 문서에 박혀있음:
- 핸드오프 문서: /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-30-agw-v6-prompt-strip-ab-bench.md
- 진단 메모: /mnt/c/Users/USER/Documents/llm-store/작업기록/work-logs/2026-04-30-agw-v6-bench-layout-convergence-prompt-root-cause.md

먼저 핸드오프 문서를 통째로 읽고, "Locked Decisions" 의 keep/drop 표 그대로 prompt B 초안을 작성해서 텍스트로 보여줘. 절대 임의로 더 빼거나 더 넣지 말 것 — 의문이 들면 사용자에게 물어봐.

작업 위치는 worktree (Agent isolation: "worktree" 또는 git worktree 직접 생성). 다른 에이전트가 v6 별도 버그 수정 중이라 메인 브랜치는 절대 손대지 말 것. 시작 시 main fetch + status 로 충돌 영역 확인.

진행 순서는 핸드오프 문서의 "Verification" 1~6 단계를 그대로 따라간다. 단, **단계 1 (B prompt 사용자 검토) 통과 전에 코드 수정 들어가지 말 것**. 첫 메시지에 prompt B 초안 텍스트만 보여줘.

기각 임계가 넘으면 prompt B 를 더 다듬는 방향이 아니라 sampling 파라미터 / 모델 라인으로 이동 검토 — 이게 가장 중요한 메타 규칙.
```
