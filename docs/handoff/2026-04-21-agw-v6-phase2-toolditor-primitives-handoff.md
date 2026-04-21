# AGW v6 Phase 2 — Toolditor FE Primitive Extension (Handoff)

**Status**: Active. Phase 0/1/3 + contracts + adapter 완료. Toolditor FE 가 bitmap/svg layerType 를 materialize 해야 Phase 4 E2E cutover 가능.
**Date**: 2026-04-21
**Target repo**: `toolditor/` (심링크 대상 `/home/ubuntu/github/tooldi/toolditor`) — **별도 git 저장소, npm 기반, pnpm workspace 아님**
**Target branch**: `feature/v6-primitives` (base `cb6cc6616`). memory lock 권장.
**Source repo (이 handoff 작성처)**: `tws-editor-api/agent-workflow-test/tooldi-agent-runtime`

---

## 철학 (Locked, 반복 명시)

설계/구현/리뷰의 제1 기준:

- **시스템이 layout family 를 정의하지 않는다.**
- **Slot / topology / CTA / role 같은 개념을 contract 로 올리지 않는다.**
- **LLM 은 결과를 만든다.**
- **브라우저는 layout 을 계산한다.**
- **코드는 결과를 추출한다.**

Phase 2 는 "코드가 추출한 결과를 Toolditor 가 materialize 한다" 구간. 여기서 bitmap/svg 를 `group` 으로 합치거나 layout family 를 추론하면 안 된다. 각 primitive 는 individual.

---

## 목표

Toolditor FE 의 `agent-workflow-spike` mutation path 가 **bitmap / svg layerType 을 lossless materialize** 하도록 확장.

- `bitmap` → Toolditor `bitmap` primitive (투명 배경 PNG 일러스트)
- `svg` → Toolditor `svg` primitive (outerHTML 보존, 네이티브 SVG 렌더)
- **기존 5 layerType (group/shape/text/image/sticker) 동작 변화 없음**
- Phase 4 LangGraph cutover 전에 Phase 2 가 먼저 merge 돼야 v6 출력을 안전하게 소비 가능

---

## Cross-repo sync 방식

- `toolditor/` 는 `tooldi-agent-runtime/packages/contracts` 에 대한 workspace link 가 없다. **수동 복사 유지** 관습.
- Canonical source 는 **toolditor 의 로컬 `contracts.ts`** (capability reference §§Key Source Files 참조). agent-runtime 쪽 `@tooldi/agent-contracts` 는 그것의 mirror 겸 back-end 사용본.
- 이번 Phase 2 에서는 agent-runtime 의 최신 layerType 확장 내용을 toolditor 로 반영.

### agent-runtime 에서 복사해올 핵심 변경

1. `packages/contracts/src/common.ts` — `VisibleLayerTypeValues`:
   ```ts
   export const VisibleLayerTypeValues = [
     "group", "shape", "text", "image", "sticker",
     "bitmap", "svg",  // v6 추가
   ] as const;
   ```
2. `packages/contracts/src/canvas/canvas-mutation.ts` — `CreateLayerCommandSchema.layerBlueprint.layerType` 이 `VisibleLayerTypeValues` 를 인라인으로 사용.

Toolditor 측 반영 대상: `toolditor/src/features/agent-workflow-spike/model/contracts.ts`. enum + TypeScript union 둘 다 bitmap/svg 추가.

---

## v6 adapter 가 전송하는 payload 스키마

`tooldi-agent-runtime/apps/agent-worker/src/phases/v6CommandAdapter.ts` 참조. 모든 command 는:

- `op: "createLayer"`
- `executionSlotKey: null` (v6 는 슬롯-프리)
- `parentRef: { position: "append" }`
- `clientLayerKey: "v6:<runId>:<001>:<layerType>"`
- `layerBlueprint.bounds: { x, y, width, height }` (width/height ≥ 1)

### `bitmap` (투명 배경 일러스트)

```jsonc
{
  "layerBlueprint": {
    "layerType": "bitmap",
    "bounds": { "x": 680, "y": 94, "width": 440, "height": 440 },
    "styleTokens": {
      "opacity": 1,
      "objectFit": "cover",     // "cover" | "contain" | "fill" | ...
      "borderRadius": 32         // number 또는 { topLeft, topRight, bottomRight, bottomLeft }
      // "transform": "rotate(5deg)"  optional
    },
    "metadata": {
      "v6Primitive": "bitmap",
      "sourceSerial": 5,
      "sourcePath": "0.1",
      "sourceTag": "img",
      "src": "placeholder://hero-product.png",
      "naturalWidth": 1,          // placeholder 경유 1×1, 실 에셋 주입 시 실제 크기
      "naturalHeight": 1,
      "alt": "hero"
    }
  }
}
```

적재 규칙:
- Toolditor `bitmap` primitive factory 사용 (이미 존재 — capability reference §4.2 `bitmap` family)
- `src` 를 image source 로 바인딩. placeholder 면 로컬 placeholder 에셋 (기존 스펙 재사용)
- `borderRadius` object 형태면 4-corner 개별 적용. number 면 전체 동일.
- `objectFit` 는 image 의 crop/fit 전략. Toolditor ImageType 의 `filters`/`cropX/cropY`/`imageScaleX/imageScaleY` 에 매핑.

### `svg` (inline vector)

```jsonc
{
  "layerBlueprint": {
    "layerType": "svg",
    "bounds": { "x": 60, "y": 60, "width": 140, "height": 140 },
    "styleTokens": {
      "opacity": 1
      // "transform": "rotate(...)"  optional
    },
    "metadata": {
      "v6Primitive": "svg",
      "sourceSerial": 1,
      "sourcePath": "0.0",
      "sourceTag": "svg",
      "outerHTML": "<svg viewBox=\"0 0 140 140\">...</svg>"
    }
  }
}
```

적재 규칙:
- Toolditor `svg` primitive (capability reference §4.2 `svg` 항목; `GroupType`-like composite 로 처리되지만 v6 에서는 outerHTML 통째로 보관).
- `outerHTML` 를 innerSVG 소스로 저장. 렌더 시 그대로 embed.
- **SVG 내부 decompose 금지** — 향후 Phase 에서 별도 primitive (circle/polygon/path) 로 쪼갤지 검토. Phase 2 범위 아님.

### 기존 primitive (변화 없음 재확인)

- `shape` (= v6 rect): `styleTokens.fillColor` | `styleTokens.fill` (linear-gradient object), `borderRadius`, `stroke`, `shadow`
- `text`: `styleTokens.fillColor`, `fontFamily/fontSize/fontWeight/fontStyle`, `textAlign`, `lineHeight`, `letterSpacing`, `textDecoration`; `metadata.text`
- `image` (= v6 image/jpg): `styleTokens.objectFit`, `borderRadius`; `metadata.{src, naturalWidth, naturalHeight, alt}`

---

## 건드릴 파일 (toolditor 측)

capability reference 의 경로 기준:

| 파일 | 수정 내용 |
|---|---|
| `src/features/agent-workflow-spike/model/contracts.ts` | `layerType` union 에 `bitmap` / `svg` 추가. metadata 필드 타입 확장 (특히 svg.outerHTML) |
| `src/features/agent-workflow-spike/lib/mutationObjectBuilder.ts` | `layerType === "bitmap"` / `"svg"` case 추가. 각 case 가 적절한 factory 로 라우팅 |
| `src/features/agent-workflow-spike/lib/canvasObjectFactories.ts` | bitmap/svg factory 가 이미 있으면 wiring 만, 없으면 추가 |
| `src/features/agent-workflow-spike/lib/mutationVisualPolicy.ts` | visibility / default style 정책에 bitmap/svg 포함 여부 확인 |
| `src/types/element/AllTypes.ts` | strict union 확장 여부 검토 (기존 `bitmap` 이 `baseType.ts` runtime 엔 있으나 strict 엔 없을 수 있음) |
| `src/static/ElementTypeGroup.ts` | UI grouping 에서 bitmap/svg 노출 여부 결정 (capability reference §4.3 참조) |

**참고**: capability reference `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/toolditor-canvas-capability-reference.md` §§5.2 / §6.2 / §7.2 에 image/svg factory 의 기존 인터페이스 문서화되어 있음.

---

## 검증

### 단위 테스트 (필수)

- `mutationObjectBuilder` 의 bitmap/svg case 각각에 대한 테스트 추가 (기존 text/shape/image 테스트 스타일 따라감).
- payload 주입 → 생성된 Toolditor object 의 `type`, `src` or `innerHTML`, bounds, styleTokens 확인.

### 시각 검증 (권장)

샘플 commands JSON 두 소스 재활용:

1. **PoC 5 samples**: `tws-editor-api/agent-workflow-test/v6-poc/commands/*.json` (svg / bitmap 포함한 deterministic 입력)
2. **Bench 20 Gemini outputs**: `tws-editor-api/agent-workflow-test/bench/method-compare-phase1/outputs-3.1-flash-lite-v6/method-c/*.json` (실제 LLM 출력)
   - 이 JSON 에는 원본 HTML (`outputText`) 만 있음. Toolditor 로 주입하려면 Phase 1 agent-worker 의 pipeline (validator → render → mapper → adapter) 을 먼저 돌려 `CreateLayerCommand[]` 를 얻어야 함.
   - 스크립트: `tws-editor-api/agent-workflow-test/tmp-validate-style` 참고 (세션 산출물). 필요 시 이 파일을 commit 해서 공유.

검증 플로우:
- `npm run local:agent` → `http://localhost:3010/editor`
- 테스트 harness (agent-workflow-spike 기존 SSE stub) 로 command 주입
- 혹은 개별 primitive 생성 후 Playwright 스크린샷으로 PoC 스타일 round-trip

### Acceptance criteria

- [ ] `mutationObjectBuilder` 단위 테스트 bitmap/svg 통과
- [ ] 5 PoC samples (svg-decoration, mixed-text-image 포함) 를 toolditor 에서 렌더 시 요소 누락/에러 없음
- [ ] 20 Gemini bench outputs 중 최소 5개 선택 렌더 성공 (시각 품질은 Phase 2 범위 아님; "표시됨"만 확인)
- [ ] 기존 v5 mutation 경로 회귀 없음 (v5 HTML 입력이 여전히 작동)
- [ ] Toolditor 타입 시스템 (tsc) 통과

---

## 범위 제외 (Phase 2 에서 하지 말 것)

- **Gradient angle 보존 fix** (현재 Toolditor builder 가 fixed `105deg` 로 재생성) — 별도 low-risk 개선, Phase 2-bis 혹은 Phase 4 adapter 측에서 전달 확인 후 Toolditor 쪽 수용.
- **Text content-box bounds 미세조정** (Phase 0 open risk R-4 — `line-height:72px` 등 수직 중앙 정렬 트릭이 Toolditor text vertical alignment 와 어떻게 어우러지는지). Adapter 가 이미 content-box 로 inset 한 bounds 를 emit 하므로, Toolditor 는 bounds 그대로 사용하면 됨. 시각 불일치 발견 시 Phase 2 내에서 소규모 조정 허용.
- **v5 legacy 제거** — Phase 4 범위.
- **SSE 경로 변경** — Phase 4 범위.
- **Circle/ellipse/polygon/path 개별 primitive 확장** — 향후 Phase (SVG decompose 와 묶어).

---

## Anti-pattern (즉시 제동)

- [ ] bitmap 을 `image` 로 또는 svg 를 `group` 으로 downcast → **무손실 실패**
- [ ] `data-slot`, `role=...` 같은 semantic attribute 신설
- [ ] `layerType === "bitmap"` 일 때만 "아이콘이니까 24x24 미만이어야" 같은 type-conditional layout 가정
- [ ] v5 의 `executionSlotKey` 기반 분기 경로로 v6 bitmap/svg 를 흘려보내기 (v6 는 `executionSlotKey: null`; semantic-less path 로만 처리)
- [ ] `<svg>` outerHTML 파싱해 내부 shape 를 별도 primitive 로 decompose — Phase 2 범위 아님

---

## 커밋 규칙

- `[feat]/[chore]/[docs]/[test]` 대괄호 prefix
- Co-Authored-By 금지
- `git add -A` 금지 — specific file 만
- push 는 사용자 명시 요청 시만
- 예: `[feat] Toolditor v6 bitmap + svg materialization — mutationObjectBuilder + factories`

---

## 리스크

- **R-1** `AllTypes.ts` strict union 과 `baseType.ts` runtime 의 불일치: strict 에 bitmap 추가 필요 여부. 기존 `baseType.ts` 는 이미 bitmap/svg 를 인지하므로 (capability reference §4.2), strict 만 보강하면 될 수 있음.
- **R-2** `svg` composite 의 z-order: Toolditor `GroupType`-like 로 취급되면 내부 children 관리 필요. v6 에서는 outerHTML 통째로 저장 → composite child array 는 비우거나 1-element (svg root) 로 처리.
- **R-3** bitmap 의 placeholder src: `placeholder://hero-product.png` 같은 URL 은 실제 로드 실패. Toolditor 의 기존 placeholder 처리 (v5 path) 와 호환되는지 확인. 필요 시 adapter 가 default asset 에 바인딩.
- **R-4** npm / pnpm 생태계 차이: toolditor 는 npm, agent-runtime 은 pnpm. cross-repo 의존성 확인 시 lockfile 경로 다름.
- **R-5** Toolditor 렌더 엔진 (Fabric? Konva? 자체?) 이 inline SVG 를 embed 하는 방식에 따라 `outerHTML` 주입 vs SVG DOM 파싱 중 선택 필요. 기존 Toolditor svg primitive 의 렌더 경로 확인 필수.

---

## Verification script (다음 스레드 참고용)

```bash
# toolditor repo 이동
cd /home/ubuntu/github/tooldi/toolditor
git checkout -b feature/v6-primitives cb6cc6616

# 기존 test run
npm install
npm test -- --run  # 또는 해당 프로젝트 runner

# 개발 서버
npm run local:agent  # → http://localhost:3010/editor
```

---

## Start Prompt (다음 스레드용)

```
이 handoff (tws-editor-api/agent-workflow-test/docs/handoff/
2026-04-21-agw-v6-phase2-toolditor-primitives-handoff.md) +
capability reference (tws-editor-api/agent-workflow-test/docs/
toolditor-canvas-capability-reference.md) + memory lock
(project_nl_agent_architecture_lock) 를 읽고 Phase 2 를 실행하라.

목표:
- toolditor FE 가 bitmap / svg layerType 을 lossless materialize.
- 기존 5 layerType 동작 변화 없음.

순서:
1. toolditor repo 이동, feature/v6-primitives 브랜치 생성 (base cb6cc6616).
2. src/features/agent-workflow-spike/model/contracts.ts 에 bitmap/svg
   layerType + metadata 필드 추가.
3. mutationObjectBuilder.ts 에 bitmap/svg case 추가 (factory 라우팅).
4. canvasObjectFactories.ts / mutationVisualPolicy.ts wiring.
5. AllTypes.ts strict union, ElementTypeGroup.ts UI grouping 보강.
6. mutationObjectBuilder 단위 테스트 bitmap/svg 케이스 추가.
7. 시각 검증: v6-poc/commands/*.json 5 samples + bench 20 Gemini outputs
   중 최소 5개를 toolditor 에서 렌더 성공 확인.

경계 (철학 원칙 5):
- 시스템이 layout family 정의 안 함.
- slot / topology / CTA / role 신설 금지.
- group 으로 합치기 금지 — 모든 primitive individual.
- SVG 내부 decompose 금지.
- bitmap 을 image 로, svg 를 group 으로 downcast 금지.

범위 제외:
- gradient angle 보존 fix (별도 작업).
- v5 legacy 제거 (Phase 4).
- SSE 경로 변경 (Phase 4).

커밋:
- 대괄호 prefix `[feat]/[test]/[chore]`
- Co-Authored-By 금지, git add -A 금지, push 는 명시 요청 시만
- 예: [feat] Toolditor v6 bitmap + svg materialization
```

---

## 완료 조건 (Phase 2 → Phase 4 넘어가는 기준)

1. toolditor `feature/v6-primitives` 브랜치가 main/base 로 merge (또는 ready-to-merge)
2. Acceptance criteria 4 항목 모두 충족
3. agent-runtime 쪽 `@tooldi/agent-contracts` 의 v6 확장과 toolditor 로컬 contracts.ts 가 일치 (field 수준 diff 없음)
4. Phase 4 handoff (`2026-04-21-agw-v6-phase4-langgraph-swap-handoff.md`) 의 Prerequisites 만족 선언
