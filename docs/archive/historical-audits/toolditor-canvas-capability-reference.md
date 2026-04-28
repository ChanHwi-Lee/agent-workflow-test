# Toolditor Canvas Capability Reference For AGW v5

> Historical audit. 이 문서는 AGW v5 시점의 Toolditor canvas capability 조사 자료다. 현재 v6-only runtime의 구현 기준이 아니다. 현재 기준은 root `README.md`, AS-IS, roadmap, v6 SSOT를 먼저 따른다.

Updated: 2026-04-21

Status: reference only, non-normative. Source of truth is the code paths cited below.

## Purpose

- AGW v5 프롬프트/validator/transpile/contract 설계 시, **Toolditor 캔버스가 원래 지원하는 것**과 **현재 v5 HTML 경로가 실제로 쓸 수 있는 것**을 분리해서 참조하기 위한 문서다.
- 특히 "Toolditor가 못해서 제약이 좁다"는 오해를 막고, 실제 병목이 `agent-workflow-spike` mutation path 와 `v5 HTML -> transpile` subset 에 있다는 점을 명확히 한다.

## Executive Summary

- Toolditor 전체 엔진은 현재 v5 HTML 경로보다 훨씬 넓은 표현력을 가진다.
- 현재 v5 HTML 경로는 사실상 `text + image + rect-like shape` 중심의 좁은 subset 만 노출한다.
- Toolditor는 본래 다음까지 지원한다.
  - richer text: gradient fill, effects, curved text, letterSpacing, lineHeight
  - richer image: crop, flip, scale, filters, clipPath/frame masking, shadow
  - richer shape/vector: circle, ellipse, triangle, polygon, path, stroke, shadow, clipPath, radial gradient
  - extra families: group, svg/icon/illust, chart, qrcode, barcode, table, frame
- 현재 AGW v5에서 바로 넓히기 좋은 저위험 확장 축은 아래다.
  - CTA / badge group 노출
  - image crop / flip / placed transform 노출
  - text lineHeight / letterSpacing 전달
  - gradient angle 보존
  - constrained single shadow
  - catalog/vector decoration metadata 기반 삽입
- 반대로 아래는 prompt 수정만으로 해결되지 않는 고위험 확장이다.
  - arbitrary nested groups / hierarchy
  - raw SVG / vector DOM 직접 해석
  - chart / QR / barcode / table 생성
  - true page background mutation
  - real asset retrieval / Stage 4 grounding

## Key Source Files

### Toolditor element / store / page background

- `toolditor/src/types/element/baseType.ts`
- `toolditor/src/types/element/AllTypes.ts`
- `toolditor/src/types/element/TextType.ts`
- `toolditor/src/types/element/ImageType.ts`
- `toolditor/src/types/element/RectType.ts`
- `toolditor/src/types/element/GroupType.ts`
- `toolditor/src/store/object.ts`
- `toolditor/src/types/canvas/pageType.ts`
- `toolditor/src/types/canvas/BackgroundType.ts`
- `toolditor/src/static/ElementTypeGroup.ts`
- `toolditor/src/util/getObjectData.ts`
- `toolditor/src/util/loadElement.tsx`

### AGW / Toolditor mutation path

- `toolditor/src/features/agent-workflow-spike/model/contracts.ts`
- `toolditor/src/features/agent-workflow-spike/lib/mutationAdapter.ts`
- `toolditor/src/features/agent-workflow-spike/lib/mutationObjectBuilder.ts`
- `toolditor/src/features/agent-workflow-spike/lib/mutationVisualPolicy.ts`
- `toolditor/src/features/agent-workflow-spike/lib/canvasObjectFactories.ts`
- `toolditor/src/features/agent-workflow-spike/lib/mutationCatalogGraphicObject.ts`
- `toolditor/src/features/agent-workflow-spike/lib/mutationExecutionIdentity.ts`

### Current AGW v5 HTML/transpile path

- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v5HtmlValidator.ts`
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v5Transpile/classify.ts`
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v5Transpile/emitCommand.ts`
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v5Transpile/parseInlineStyle.ts`
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v5MethodBSystemPrompt.ts`
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v5PipelineOrchestrator.ts`

## 1. Canonical Layers Of Truth

Toolditor에는 "타입" 관점이 3개 겹쳐 있다.

| Layer | File | Meaning |
| --- | --- | --- |
| Broad runtime type strings | `src/types/element/baseType.ts` | 런타임이 인지하는 넓은 object type 문자열 집합 |
| Strict normalized TS union | `src/types/element/AllTypes.ts` | 현재 store / objectData 기준으로 자주 다루는 정규화된 union |
| UI grouping layer | `src/static/ElementTypeGroup.ts` | 에디터 UI가 object family 를 묶어 다루는 분류 |

중요한 결론:

- `baseType.ts` 기준으로 runtime-recognized type 은 `AllTypes.ts`보다 넓다.
- 즉 "editor가 원래 지원"하는 것과 "현재 AGW path 가 materialize"하는 것은 다르다.

## 2. Persisted Canvas Data Model

### Top-level object store

- top-level canvas objects 는 `objectData[pageId][id]` 형태로 저장된다.
- z-order 는 `objectSort[pageId]` 에 별도 저장된다.

```ts
type ObjectDataByPage = { [id: string]: AllElementTypes };
type ObjectData = { [pageId: string]: ObjectDataByPage };
```

출처:

- `toolditor/src/store/object.ts`

### Nested children

- nested children 는 top-level store 에 flatten 되어 저장되지 않는다.
- group 내부 child 는 `group.objects` 아래에만 산다.

즉:

```text
top-level objects
  ├─ text
  ├─ rect
  ├─ image
  └─ group
       ├─ rect
       └─ text
```

### Page background is separate state

- page background 는 element object 가 아니라 page-level state 다.
- `PageType` 가 `BackgroundType` 을 포함한다.

```ts
interface PageType extends BackgroundType {
  pageId: string;
  objects?: AllElementTypes[];
}
```

배경은 아래 4가지를 지원한다.

- `color`
- `image`
- `pattern`
- `gradient`

중요:

- 현재 AGW v5 는 page background mutation 을 만들지 않고, full-canvas object 로 배경을 흉내내는 경향이 있다.

## 3. Common Base Object Schema

대부분의 object 는 `baseObjectType` 을 공유한다.

### Shared identity / geometry

- `version`
- `pageId`
- `id`
- `type`
- `left`, `top`
- `left_from_zero`, `top_from_zero`
- `width`, `height`
- `scaleX`, `scaleY`
- `angle`

### Shared paint / visibility / transform

- `fill`
- `fillRule`
- `opacity`
- `flipX`, `flipY`
- `originX`, `originY`
- `transformOrigin`
- `group`

### Shared advanced style hooks

- `stroke`, `strokeWidth`, `strokeLineCap`, `strokeLineJoin`, `strokeMiterLimit`
- `strokeDashOffset`, `strokeDasharray`, `strokeUniform`
- `shadow`
- `effects`
- `clipPath`
- `borderRadius`

### Shared editor metadata

- `isLocked`
- `isUse`
- `uid`
- `link`
- `lockRatio`
- `refs`
- `priceType`
- `isUserFile`
- `isAi`
- `isFrame`
- `frameImage`

결론:

- Toolditor object model 자체는 `fill + opacity + transform` 수준을 넘어서, `shadow/effects/clipPath/stroke/frame` 까지 갖고 있다.

## 4. Editor-Supported Object Families

### 4.1 Strict union (`AllElementTypes`)

`AllTypes.ts` 기준 strict union 은 아래다.

- `text`
- `image`
- `group`
- `rect`
- `circle`
- `ellipse`
- `triangle`
- `polygon`
- `path`
- `drawline`
- `chart`
- `qrcode`
- `barcode`

### 4.2 Broader runtime-recognized extras

`baseType.ts` 기준 runtime 은 더 넓게 인지한다.

- text family
  - `text`
  - `textbox`
  - `curvedText`
- image family
  - `picture`
  - `image`
  - `bitmap`
  - `illust`
  - `calligraphy_bitmap`
  - `calligraphy_illust`
  - `svg`
  - `icon`
- vector / line family
  - `line`
  - `line_pattern`
  - `dline`
- chart family
  - `chart`
  - `pieChart`
  - `dounutChart`
  - `percentChart`
  - `lineChart`
  - `barChart`
  - `bulletChart`
- others
  - `frame`
  - `table`
  - `element`
  - `activeSelection`

### 4.3 UI grouping

`ElementTypeGroup.ts` 기준 UI 는 object family 를 대략 이렇게 묶는다.

- `rect` family: rect / ellipse / triangle / polygon / path / circle
- `image` family: image / bitmap / picture / calligraphy_bitmap
- `text` family: text / textbox
- `illust` family: illust / calligraphy_illust / icon / svg
- `drawline`
- `line`
- `chart`
- `group`
- `frame`

## 5. Notable Per-Type Fields

### 5.1 Text

`TextType` 에서 중요한 필드:

- content
  - `text`
- typography
  - `fontSize`
  - `fontFamily`
  - `fontWeight`
  - `fontStyle`
  - `textDecoration`
- layout
  - `textAlign`
  - `lineHeight`
  - `letterSpacing`
  - `fixedWidth`
- style granularity
  - `styles` (per-char style map)
  - `textLines`
- rendering extras
  - `uppercase`
  - `stroke`
  - `strokeWidth`
  - `effects`
  - `curved`

정리:

- Toolditor text model 은 plain text 박스를 넘어서, gradient fill / effects / curved text / per-char style 까지 품고 있다.

### 5.2 Image

`ImageType` 에서 중요한 필드:

- `src`
- `originSrc`
- `thumbnailSrc`
- `filters`
- `cropX`, `cropY`
- `imageWidth`, `imageHeight`
- `imageScaleX`, `imageScaleY`
- `isRemovedBackground`

정리:

- Toolditor image model 은 단순 placed image가 아니라 crop / filter / scale / removed background 상태를 가진다.

### 5.3 Shapes / vectors

대표 필드:

- rect
  - `rx`, `ry`
- circle
  - `radius`
- ellipse
  - `rx`, `ry`, `radius`
- polygon
  - `points`
- path / runtime line
  - `path`
- drawline
  - custom head/tail/object refs 기반의 looser structure

정리:

- rect 외에도 다양한 primitive 가 editor-native 로 존재한다.

### 5.4 Group-like composites

`GroupType` 는 기본적으로:

```ts
type GroupType = baseObjectType & {
  objects: AllElementTypes[];
}
```

또한 runtime handler 는 아래도 group-like composite 로 다룬다.

- `illust`
- `svg`
- `icon`
- `calligraphy_illust`

정리:

- Toolditor는 composite object 를 다룰 수 있지만, 현재 AGW v5 flat HTML path 는 이를 거의 활용하지 않는다.

## 6. What AGW Mutation Contract Can Materialize Today

### 6.1 Contract-level layer types

현재 contract 의 `AgentLayerType`:

- `group`
- `shape`
- `text`
- `image`
- `sticker`

하지만 실제 구현은 이 중 일부만 materialize 한다.

### 6.2 CreateLayer actual materialization

| Contract layerType | Actual object today | Notes |
| --- | --- | --- |
| `shape` | mostly `rect` | `catalog_element` metadata 가 있으면 deferred catalog graphic insert 가능 |
| `text` | `text` | semantic / non-semantic path 존재 |
| `group` | CTA or badge group only | `executionSlotKey=cta` 또는 `badge_text` 에서만 의미 있음 |
| `image` | `image` | generic/background/hero_image path 존재 |
| `sticker` | unsupported | contract 에만 있고 builder 는 미지원 |

### 6.3 UpdateLayer actual materialization

현재 update 는 사실상 아래만 안전하다.

- `text`
- `rect`
- `group`

현재 update 가 약하거나 미지원인 것:

- generic image update
- sticker
- catalog graphic insert result

### 6.4 Effective styleTokens / metadata by layer type

#### Shape create

실제로 읽는 값:

- styleTokens
  - `fillColor`
  - `secondaryColor`
  - `cornerRadius`
  - `opacity`
  - `angle`
  - `backgroundVisualMode` (background shape 특수)
- metadata
  - `role`
  - `renderPrimitive`
  - `sourceSerial`
  - `sourceCategory`

#### Text create

실제로 읽는 값:

- metadata
  - `copyText`
  - `text`
  - `customFontSize`
  - `customFontFamily`
  - `customFontWeight`
  - `fontRole`
  - `displayFontFamily`
  - `displayFontWeight`
  - `bodyFontFamily`
  - `bodyFontWeight`
  - `role`
- styleTokens
  - `fillColor`
  - `textAlign`
  - `angle`
  - `opacity`

#### Group create

현재 group builder 는 CTA / badge only 이다.

- requires semantic slot usage
  - `executionSlotKey = cta`
  - `executionSlotKey = badge_text`
- styleTokens
  - `surfaceColor`
  - `secondaryColor`
  - `textColor`
  - `ctaShapeLanguage`

#### Image create

실제로 읽는 값:

- metadata
  - `sourceOriginUrl`
  - `sourceWidth`
  - `sourceHeight`
  - `role`
  - `hint`
- styleTokens
  - `angle`
  - `opacity`
  - `flipX`
  - `flipY`
  - `cropX`
  - `cropY`
  - `objectScaleX`
  - `objectScaleY`
  - `imageScaleX`
  - `imageScaleY`

중요:

- builder 는 crop/flip/scale token 을 받을 수 있다.
- 하지만 현재 v5 HTML transpile path 가 이 값들을 거의 만들지 않는다.

### 6.5 Semantic vs non-semantic

현재 `executionSlotKey` 가 있을 때만 semantic compatibility 검사가 의미가 있다.

예:

- `background -> shape | image`
- `cta -> text | group`
- `badge_text -> text | group`
- `hero_image -> image`
- 나머지 대부분 text slot

하지만 현재 HTML transpile path 는:

- `slotKey = null`
- `executionSlotKey = null`

즉 현재 v5 HTML path 는 **non-semantic path** 로만 흘러간다.

이게 의미하는 것:

- 현재 AGW v5 는 latent capability 로 CTA/badge group path 를 갖고 있지만,
- HTML path 가 그걸 아직 사용하지 않는다.

### 6.6 Hidden restrictions

다음은 contract 상 넓어 보여도 현재 path 에서는 사실상 무의미하거나 제한되는 것들이다.

- `patchMask`
- `ifMatch`
- `targetLayerVersion`
- `allowNoop`
- `parentRef`
- `zOrder`
- `visibility`
- `transform`
- `assetBinding`
- `editable`
- `metadataTags`

또한:

- created text 는 remeasure 되어 height 가 보정된다.
- updated text 는 remeasure 되지 않아 copy 교체 후 stale height 문제가 남을 수 있다.
- background gradient 는 현재 builder 에서 fixed `105deg` 로 재생성된다.

## 7. What Current v5 HTML -> Transpile Can Reach

현재 `v5 HTML -> transpile` path 는 매우 좁다.

### 7.1 Reachable tags / primitives

- text tags
  - `h1..h6`
  - `p`
  - `span`
- image
  - `img`
- shape-like block
  - leaf `div`

다른 태그는 현재 대부분 skip 된다.

중요:

- `div` 에 child 가 있으면 shape 로 emit 되지 않고 recurse 한다.
- 즉 wrapper 자체의 시각 정보는 현재 잃어버리기 쉽다.

### 7.2 Reachable data by primitive

#### Text from HTML

도달 가능한 값:

- copy text
- font family
- font size
- font weight
- fill color
- text align
- angle
- opacity

파싱은 되지만 builder 에서 버려지는 값:

- `lineHeight`
- `letterSpacing`

#### Image from HTML

도달 가능한 값:

- source URL
- aspect hint
- role / hint metadata
- angle
- opacity

현재 거의 도달하지 못하는 값:

- crop
- flip
- placed image transform
- filter stack
- shadow
- clipPath

#### Shape from HTML

도달 가능한 값:

- solid fill
- 2-color linear gradient
- corner radius
- angle
- opacity

현재 도달하지 못하는 값:

- circle / ellipse / triangle / polygon / path
- stroke / dash
- shadow
- clipPath
- radial gradient
- richer gradient data

### 7.3 Important current limitations

- `executionSlotKey = null` 이라 semantic group path 를 활용하지 못한다.
- `gradientAngle` 는 파싱되지만 builder 에서 보존되지 않는다.
- image asset grounding 은 structural only 이고, real swap 은 Stage 4 deferred 상태다.
- append-only flat create path 라 parent/child hierarchy 를 표현하지 못한다.

## 8. Capability Gap Matrix

| Capability | Editor support | Reachable by current v5 | Expansion risk |
| --- | --- | --- | --- |
| Solid text | yes | yes | none |
| Font family/size/weight | yes | yes | none |
| Text align | yes | yes | none |
| Text angle / opacity | yes | yes | none |
| Text lineHeight | yes | parsed but dropped | low |
| Text letterSpacing | yes | parsed but dropped | low |
| Text gradient fill | yes | no | medium |
| Text effects | yes | no | medium |
| Curved text | yes | no | medium-high |
| Image angle / opacity | yes | yes | none |
| Image crop / flip / scale | yes | builder supports, transpile does not emit | low |
| Image filters | yes | no | medium |
| Shape solid fill | yes | yes | none |
| Shape linear gradient | yes | yes, lossy | low |
| Gradient angle | yes | parsed but dropped | low |
| Radial gradient | yes | no | medium |
| Corner radius | yes | yes | none |
| Shadow | yes | no | low-medium |
| Stroke / dash | yes | no | medium |
| Circle / ellipse / triangle / polygon / path | yes | no | medium |
| CTA / badge group | yes | latent support exists | low |
| Catalog / vector decoration | yes | latent support exists | low |
| Nested groups | yes | no | high |
| Raw SVG | yes | no | high |
| Charts / QR / barcode / table | yes | no | high |
| Page background mutation | yes | no | high |

## 9. Low-Risk Expansions Worth Prioritizing

다음은 prompt/contract/transpile/builder 를 조금만 넓혀도 효과가 큰 축이다.

### 9.1 CTA / badge group

현재 latent capability:

- contract 에 `executionSlotKey`
- builder 에 `group` path
- factories 에 CTA / badge group object 생성기

따라서 아래 같은 얇은 contract 추가가 가능하다.

- `data-slot`
- `data-surface-color`
- `data-text-color`
- `data-cta-shape`

의미:

- 단순 rect + text 2개로 흉내내던 CTA/badge 를 editor-native composite 로 올릴 수 있다.

### 9.2 Image transform tokens

열 가치가 큰 값:

- `cropX`, `cropY`
- `flipX`, `flipY`
- `objectScaleX`, `objectScaleY`
- `imageScaleX`, `imageScaleY`

의미:

- 같은 image primitive 여도 cover-only 에서 벗어나 훨씬 다양한 배치를 만들 수 있다.

### 9.3 Text metrics propagation

현재 transpile 은 `lineHeight`, `letterSpacing` 를 읽지만 builder 가 버린다.

이 둘을 통과시키면:

- 텍스트 밀도 조절
- editorial layout
- 고급 typographic rhythm

이 가능해진다.

### 9.4 Preserve gradient angle

현재 gradient 는 살아남지만 angle 이 fixed `105deg` 로 뭉개진다.

이걸 보존하면:

- diagonal / vertical / horizontal gradient 차별화
- 배경 다양성 증가

효과가 크다.

### 9.5 Constrained single shadow

현재 prompt 는 single `box-shadow` 를 이미 허용하는 방향이 가능하고, editor 렌더러도 shadow 를 지원한다.

이는:

- CTA depth
- image card separation
- spotlight element

에 바로 쓰인다.

### 9.6 Catalog / vector decoration insertion

Toolditor 는 `catalog_element` metadata 를 통한 vector/graphic insert path 를 이미 갖고 있다.

즉:

- raw SVG parser 를 만드는 대신
- metadata 기반 vector decoration 삽입

이 현실적인 확장 경로다.

## 10. High-Risk Expansions

다음은 prompt 수정이 아니라 deeper contract / engine work 이다.

### 10.1 Arbitrary nested groups / hierarchy

현재 flat append-only create path 가 전제다.

필요 작업:

- parent/child transform semantics
- hierarchy-aware mutation
- nested editability guarantees

### 10.2 Raw SVG / vector HTML support

현재 validator 는 `<svg>` 를 허용해도 transpile 은 skip 한다.

지원하려면:

- SVG DOM parser
- shape/path/gradient/clip mapping
- editor object materialization 규약

이 필요하다.

### 10.3 Chart / QR / barcode / table generation

Toolditor 는 object family 를 갖고 있지만, 현재 AGW contract 는 해당 structured payload 를 들고 다니지 않는다.

필요 작업:

- dedicated schema
- validator
- builder
- prompt-level semantic generation rule

### 10.4 True page background mutation

현재 v5 는 background object 를 full-canvas rect/image 로 흉내낸다.

진짜 page background 는 separate page state 이므로, 별도 mutation family 가 필요하다.

### 10.5 Real asset grounding

Stage 4 RAG / asset swap 이 아직 deferred 상태다.

따라서:

- 사진
- 아이콘
- vector asset

실물 grounding 확장은 prompt-only change 가 아니다.

## 11. Practical Guidance For Prompt Authors

### Safe to promise now

- flat canvas layout
- text / image / simple shape 기반 구성
- solid or simple linear gradient shapes
- image-centered, text-centered, asymmetric, centered composition
- simple decorative blocks

### Safe to promise after low-risk contract work

- richer CTA / badge composites
- crop/flip 기반 image placement
- better text spacing / line rhythm
- gradient angle preservation
- constrained shadow
- catalog-backed vector decoration

### Do not promise yet

- arbitrary nested hierarchy
- raw SVG generation
- curved/effect-heavy text as a stable supported path
- chart / barcode / QR / table generation
- true page background mutation
- real asset retrieval / grounded photo/icon search

## 12. Recommended Capability Target For Next v5 Iteration

목표는 "editor 전체 능력 전부"가 아니라 아래 subset 을 우선 여는 것이다.

### Phase A: immediate practical design widening

- current text / image / rect support 유지
- CTA / badge group 노출
- image crop / flip / placed transform 노출
- lineHeight / letterSpacing 통과
- gradient angle 보존
- constrained single shadow
- catalog decoration insert

### Phase B: medium-complexity visual vocabulary expansion

- circle / ellipse / triangle / polygon / path primitive
- richer text fill / stroke
- radial gradient

### Phase C: architecture-level expansions

- page background mutation
- nested groups
- raw SVG
- specialized data objects

## 13. Bottom Line

- Toolditor는 현재 AGW v5가 보여주는 것보다 훨씬 넓은 캔버스 능력을 가진다.
- 현재 병목은 editor가 아니라 `HTML grammar -> transpile -> mutation builder` 경로의 좁은 subset 이다.
- 따라서 디자인 능력을 넓히는 가장 현실적인 전략은:
  1. prompt 를 layout-template 에서 layout-grammar 로 유지하고,
  2. low-risk contract expansion 으로 latent capability 를 노출하고,
  3. high-risk vector/hierarchy/background 문제는 별도 작업으로 분리하는 것이다.
