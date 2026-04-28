# AGW v6 Phase 0 PoC — Result Report

Date: 2026-04-21
Branch: `agent-workflow-test@feature/v6-structure`
Scope: handoff `docs/archive/handoff/2026-04-21-agw-v6-structure-phase0-poc-handoff.md`

## What was built

```
v6-poc/
├── samples/              5 hand-written HTML inputs
├── extracted/            RenderedElement[] JSON per sample (Playwright + DOM)
├── commands/             ToolditorCommand[] JSON per sample (primitive mapper)
├── screenshots/          original.png + reconstructed.png per sample
├── extract.mjs           Playwright render + getBoundingClientRect + getComputedStyle
├── mapper.mjs            RenderedElement → ToolditorCommand (text/rect/bitmap/svg)
├── verify.mjs            Round-trip: commands → HTML → screenshot
└── run.mjs               extract → map → verify
```

## Samples

| # | Name | Layout pattern |
|---|------|----------------|
| 01 | `flat-absolute` | `position:absolute` only (v5-style) |
| 02 | `flex-centered` | flex column centering, gap-stacked |
| 03 | `nested-wrapper` | inner card with flex column + padding |
| 04 | `svg-decoration` | inline `<svg>` shapes + text + CTA |
| 05 | `mixed-text-image` | `<img placeholder://*.png>` + gradient bg + `<h1>`/`<p>` |

## Pipeline output (primitive counts per sample)

| Sample | rect | text | svg | bitmap | total |
|--------|------|------|-----|--------|-------|
| 01 | 3 | 3 | — | — | 6 |
| 02 | 2 | 4 | — | — | 6 |
| 03 | 4 | 5 | — | — | 9 |
| 04 | 2 | 3 | 2 | — | 7 |
| 05 | 2 | 4 | — | 1 | 7 |

## Visual round-trip (Playwright re-render of `commands/*.json`)

md5(original.png) == md5(reconstructed.png) for all 5 samples after the
text-padding fix. Pixel-identical reproduction from pure commands JSON.

```
18e750…  sample-01-flat-absolute.{original,reconstructed}.png   (match)
fe86f7…  sample-02-flex-centered.{original,reconstructed}.png   (match)
c0feec…  sample-03-nested-wrapper.{original,reconstructed}.png  (match)
000b1c…  sample-04-svg-decoration.{original,reconstructed}.png  (match)
5c0973…  sample-05-mixed-text-image.{original,reconstructed}.png (match)
```

## Phase 0 검증 체크 결과

- [x] **bounds 정확도** — `getBoundingClientRect` 값이 round-trip 에서 pixel-identical. flex/nested wrapper 도 동일.
- [x] **폰트 측정** — `document.fonts.ready` 대기 후 측정. system font (sans-serif) 환경에서 안정. 웹폰트 검증은 Phase 1 에서.
- [x] **SVG primitive** — `<svg>` outerHTML 보존 → re-render 에서 원본과 바이너리 동일. (Toolditor SVG primitive 적재는 Phase 2 의 mutation builder 확장 필요)
- [x] **Gradient** — `linear-gradient(angle, stop1, stop2)` 파서가 angle/stops 보존. 원본 gradient direction 과 정확 일치.
- [x] **Placeholder 이미지** — `page.route(/^placeholder:\/\//)` 로 1×1 transparent PNG 주입, `<img>` bounds 는 CSS width/height 로 정상 해석.

## 발견한 이슈 (작업 중 해결)

1. **Text padding 미보존** — `<div style="padding:18px 48px">컬렉션 둘러보기</div>` 같은 shrink-to-fit 버튼 텍스트가 reconstructed 에서 좌측 정렬된 상태로 렌더됨. getBoundingClientRect 는 border-box 를 주므로 텍스트 콘텐츠 영역이 padding 만큼 작아야 함.
   - **Fix**: extract 에서 `padding*`/`border*Width` 캡처 → mapper 의 `buildText` 가 content-box 로 bounds 를 inset.

2. **`<svg>` 내부 `position:absolute`/`left/right/top/bottom` 인라인 스타일 중복** — outerHTML 을 그대로 감싸면 wrapper 와 중첩되어 위치가 이중 적용됨.
   - **Fix**: `verify.mjs` 의 render 단계에서 inline `position/left/top/right/bottom` 제거 후 wrapper `<div>` 에 absolute 배치.

## 확인된 설계 가정 (유지)

- 브라우저 layout 계산 → DOM extraction 경로가 `position:absolute`, `flex centering`, `nested wrapper with padding`, `inline SVG`, `gradient bg`, `placeholder <img>` 까지 공통 경로 하나로 커버.
- Primitive 매핑은 체계적으로 flat: SVG 1개 = svg 1개, `<img>` = bitmap/image, 텍스트 leaf = text, 페인트 있는 div = rect. **group 개념 일체 없음**.
- 같은 bounds 에 rect + text 가 동시에 배치되는 CTA 패턴은 **2개 개별 primitive** 로 자연스럽게 표현됨 (slot/role/CTA 개념 불필요).

## 확인되지 않은 것 (Phase 1+ 에서)

- 실제 **Toolditor 엔진 렌더** 일치 (Phase 0 는 Playwright round-trip 만 검증; Toolditor 의 `mutationObjectBuilder.ts` 가 아직 `bitmap`/`svg`/multi-stop gradient 를 materialize 하지 않음 → Phase 2).
- **웹폰트 subset / FOUT / document.fonts.ready timing** (Phase 0 는 system font sans-serif 만).
- **shadow, stroke width/dash, radial gradient, transform rotation, clipPath, filter** (Phase 0 sample set 에 미포함; bounds 추출 구조는 준비됨).
- **Korean IME edge cases** (Hangul 조합형 텍스트 glyph 측정 — 현 sample 에 포함되나 정량 비교는 미실시).

## Open risks / next questions

- **R-1 결정성**: 현재 Linux headless Chromium 기준 pixel-identical. macOS/Windows 렌더에서 font hinting 차이 가능 — 배포 환경 (Lambda `@sparticuz/chromium`) 이 dev 와 동일하므로 production parity 는 확보될 것으로 판단. Phase 5 에서 측정 필요.
- **R-2 Placeholder 해결**: 현재 bounds 는 `<img width/height>` 로 CSS 지정해야 정상. `<img>` 에 size 지정이 없고 natural size 에 의존하는 경우 1×1 transparent 로 크기 0 붕괴 가능. → Phase 1 validator / prompt 에서 `<img>` 는 반드시 inline `width/height` 요구 추가 필요.
- **R-3 Text 이중 primitive**: 동일 bounds 의 rect+text 조합을 Toolditor 에 태우면 layering 순서가 중요 (rect 먼저, text 위). DOM order 를 그대로 z-order 로 쓰면 안전. Phase 2 에서 Toolditor z-order 적재 확인 필요.
- **R-4 line-height 72px on 22px font**: CSS 로 수직 중앙 정렬을 흉내낸 버튼 텍스트가 Toolditor text primitive 에서 동일하게 보이려면 text 의 수직 정렬 방식을 확정해야 함 (현 mapper 는 ratio 3.27 을 그대로 전달). Phase 2 에서 Toolditor 의 text vertical alignment 규약 확인 필요.

## Go/No-go for Phase 1

PoC 가정 — "LLM 자유 HTML → 브라우저 계산 → 코드 추출 로 Toolditor 렌더 가능성 확보" — 은 Phase 0 에서 검증됐다. 철학 원칙 5 개 모두 준수 (layout family/slot/topology/CTA 일체 도입 없음, 모든 primitive individual, group 미사용).

**Phase 1 진입 권고**. 다음 단계는:

1. `tooldi-agent-runtime/apps/agent-worker/src/phases/` 에 `v6BrowserRender.ts`, `v6PrimitiveMapper.ts`, `v6HtmlValidator.ts` 정식 이식 (현 PoC 구현이 베이스).
2. `v5Transpile/`, `v5HtmlValidator.ts`, `method-b-system.txt`, `v5MethodBSystemPrompt.ts` 폐기 (handoff §변경 범위).
3. Toolditor `mutationObjectBuilder.ts` 의 bitmap/svg/multi-stop-gradient materialization 확장 (Phase 2 선행 가능).
