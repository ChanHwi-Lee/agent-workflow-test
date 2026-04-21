
# AGW v6 Font Registry (SSOT)

Phase 2.5 산출물. Playwright extraction 과 Toolditor render 가 **동일한 webfont**
로 layout 을 계산하도록 정렬하기 위한 단일 SSOT.

## 파일 구조

- `registry.json` — 사용 가능한 폰트 메타데이터 (Toolditor ID, weight, CDN filename, 언어, 카테고리)
- (선택) `assets/` — CDN 접근 실패 대비 로컬 cached woff 파일

## 폰트 선정 기준

1. **Toolditor 에 이미 등록된 폰트만** — `GET /editor/loadFont` 응답에서 pick.
   Phase 2.5 scope 는 1000+ 폰트 중 curated subset (4-6개 이내).
2. 주력 언어 커버리지 (KOR primary, ENG secondary).
3. 가능하면 여러 weight 가 있는 폰트 (디자인 variation 확보).
4. CDN URL (`https://dev-file.tooldi.com/font/{savedFilename}`) 에 네트워크 접근 가능.

## CSS family 네이밍 컨벤션

Toolditor 는 `{serial}_{weight}` (e.g., `701_400`) 를 CSS `font-family` 이름으로
그대로 사용한다. 이 규칙을 Playwright `@font-face` 와 LLM prompt 에서도 동일하게
유지하면 extraction → adapter → FE 사이에 **이름 매핑 step 이 필요 없다**.

LLM 이 HTML 에서:

```css
font-family: "701_400", "1301_400", sans-serif;
```

Playwright 가 동일 이름으로 `@font-face` 를 미리 inject → 측정 정확. Toolditor
FE 의 동적 @font-face 와 자연히 일치 → 렌더 정확.

## 등록 폰트 추가 절차

1. Toolditor dev 계정으로 `/editor/loadFont` 호출 후 응답에서 `serial`, `fontWeights`,
   `savedFilename` 확인.
2. `registry.json.fonts` 배열에 append.
3. URL 접근 검증: `curl -sI https://dev-file.tooldi.com/font/{savedFilename}` → HTTP 200.
4. (선택) `node ../v6-poc/fonts/buildFontFaceCSS.mjs --verify` 로 전체 URL 재검증.

## 제거 / 변경 금지 규칙

- **등록된 `toolditorId` 는 변경 금지**. Toolditor 시리얼은 DB 에 영구 저장되므로
  렌더 side 와 틀어진다.
- CSS name 을 `Pretendard` 같은 사람-읽기용으로 변경하지 말 것 — Toolditor
  컨벤션 어긋남.
- `isDefault: true` 는 단 하나의 폰트에만. 매핑 실패 시 이 폰트로 fallback.
