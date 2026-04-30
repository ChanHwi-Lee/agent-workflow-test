# Phase 6 RAG Assets - Runtime Placeholder Swap

## 1. 런타임 목표: layout은 그대로 두고 bitmap src만 교체

Phase 6의 목표는 템플릿 검색을 되살리는 것이 아니다. 현재 LLM은 이미지가 필요한 자리에 `placeholder://힌트`를 넣고, 브라우저 렌더 단계는 그 자리를 1x1 투명 이미지로 통과시킨다. 그 결과 위치와 크기(bounds)는 이미 정해진다.

따라서 런타임 교체(runtime placeholder swap)는 딱 한 가지를 한다.

- `bitmap` primitive의 `src`가 `placeholder://...`이면 실제 Tooldi photo/graphic 에셋 URL로 바꾼다.
- 검색 후보가 없거나 vision selector가 후보를 명시적으로 부적합하다고 판단하고 `V6_ASSET_GENERATION_MODE=enabled`일 때만 native Gemini image generation으로 새 이미지를 만들 수 있다.
- Gemini provider output은 object store에 저장한 뒤 Tooldi-owned artifact URL로만 `src`에 반영한다. raw inline data, provider URL, SDK handle은 command metadata나 canvas mutation으로 넘기지 않는다.
- `bounds`, `objectFit`, `borderRadius`, `opacity`, `transform`, DOM 순서, layer 순서는 바꾸지 않는다.
- 못 찾으면 run 전체를 실패시키지 않고, 사용자가 나중에 바꿀 수 있게 metadata에 unresolved 표시를 남긴다.

이 방식은 v6 원칙과 맞다. LLM은 레이아웃 결과를 만들고, 브라우저는 위치를 계산하며, 코드는 이미 나온 결과를 추출한다. RAG는 새 레이아웃 단계가 아니라 bitmap의 출처만 채우는 후처리다.

## 2. 삽입 위치: `v6PipelineNode` / `runV6Pipeline` / `adaptV6Commands` 사이 어디가 가장 단순한지

가장 단순한 위치는 `v6PipelineNode.ts`에서 `runV6Pipeline(...)`이 끝난 직후, `adaptV6Commands(...)`를 호출하기 직전이다.

현재 흐름은 다음과 같다.

```text
v6PipelineNode
  -> runV6Pipeline
     -> HTML 생성
     -> 보안 검증
     -> 브라우저 렌더/추출
     -> primitive command 생성
  -> adaptV6Commands
  -> synthetic plan 저장
```

권장 흐름은 다음이다.

```text
v6PipelineNode
  -> runV6Pipeline
  -> resolve placeholder assets (retrieve -> generate fallback -> unresolved)
  -> adaptV6Commands
  -> synthetic plan 저장
```

이 위치가 단순한 이유:

- `runV6Pipeline`은 지금도 내부 표현(`V6PrimitiveCommand[]`)까지만 만든다. 여기에 Qdrant, catalog, 권한 정보를 넣으면 순수 파이프라인 경계가 흐려진다.
- `v6PrimitiveMapper`는 DOM을 primitive로 바꾸는 역할이다. asset 검색을 넣으면 "코드는 결과를 추출한다"는 역할보다 커진다.
- `adaptV6Commands`는 Toolditor command metadata를 만드는 마지막 단계다. 그 전에 `V6ImageCommand.src`만 교체해 두면 adapter 변경이 가장 작다.
- `v6PipelineNode`는 이미 request, intent, dependencies, catalog client를 받을 수 있는 그래프 레벨에 있다. 사용자 권한과 외부 I/O가 필요한 RAG를 두기 쉽다.

다만 구현 시에는 pure function을 분리하는 것이 좋다. 예: `resolveV6PlaceholderAssets(commands, context, deps)`는 별도 phase 모듈에 두고, 호출만 `v6PipelineNode`에서 한다.

## 3. placeholder 찾기: 어떤 command를 대상으로 하는지

대상은 `V6PrimitiveCommand` 중 아래 조건을 모두 만족하는 command다.

- `primitive === "bitmap"`
- `src`가 문자열이고 `placeholder://`로 시작한다.
- `type === "create"`인 이미지 계열 command다.

대상이 아닌 것:

- `primitive === "image"`: 이미 실사 이미지로 분류된 일반 URL 또는 jpg 계열이다.
- `primitive === "svg"`: inline SVG는 asset URL 교체 대상이 아니다.
- `primitive === "bitmap"`이지만 `src`가 실제 `.png`, signed URL, data URL이면 교체하지 않는다.
- `rect`, `text`는 주변 문맥으로만 쓴다.

현재 `v6PrimitiveMapper.classifyImage()`는 `placeholder://`를 `bitmap`으로 분류한다. 그래서 placeholder 검출은 adapter 이후의 `CreateLayerCommand`보다 adapter 이전의 `V6ImageCommand`에서 하는 편이 쉽다. command의 `bounds`, `alt`, `naturalWidth`, `naturalHeight`, `source`를 그대로 쓸 수 있기 때문이다.

## 4. 주변 문맥 만들기: hint, 주변 text, canvas prompt/intent를 어떻게 붙일지

검색 문장은 너무 길지 않게, 사람이 보아도 무슨 이미지를 찾는지 알 수 있어야 한다.

권장 입력 조합:

- hint: `placeholder://봄꽃 배경`에서 `봄꽃 배경`만 꺼낸다. URL decoding도 한다.
- 주변 text: 같은 command 배열 안의 `text` primitive 중 placeholder와 화면상 가까운 것 2~4개를 붙인다.
- canvas prompt: 원래 사용자 요청(`userInput.prompt`)을 짧게 붙인다.
- intent: 있으면 `state.intent.operationFamily`, `state.intent.artifactType` 정도만 붙인다. slot/role/CTA 같은 새 의미 구조를 만들지 않는다.
- 크기 힌트: `aspectRatio`, 넓은 이미지/세로 이미지/정사각 이미지 정도의 쉬운 표현만 붙인다.

예시:

```text
hint: 봄꽃 배경
nearbyText: 봄 세일, 최대 40%, 이번 주말까지
canvasPrompt: 봄 세일 이벤트 배너 만들어줘
artifact: banner
shape: wide
```

주변 text 선택은 deterministic해야 한다. 예를 들어 다음 순서로 고른다.

1. placeholder 중심점과 text 중심점의 거리
2. 겹치는 축이 있으면 우선
3. command 배열 순서가 앞선 것 우선

이 문맥은 검색 품질을 높이기 위한 보조 정보다. 레이아웃 의미를 새 contract로 올리면 안 된다.

## 5. photo/graphic 분류: deterministic heuristic 방향, hard rule 금지

photo/graphic 분류는 LLM에게 맡기지 않는다. 하지만 `"배경"이면 무조건 photo`, `"아이콘"이면 무조건 graphic` 같은 hard rule도 피한다. 같은 단어라도 배너 문맥, 크기, 주변 텍스트에 따라 달라질 수 있기 때문이다.

권장 방향:

- hint 단어는 soft signal로만 쓴다.
- aspect ratio를 함께 본다. 넓은 배경형은 photo 쪽 신호가 될 수 있고, 작은 장식형은 graphic 쪽 신호가 될 수 있다.
- 주변 text와 사용자 prompt도 같이 본다.
- `alt`가 있으면 보조 신호로만 쓴다.
- 동률이면 안전한 기본값을 정한다. 예: 투명 장식이 더 편집 친화적이면 graphic 우선, 사진 배경을 더 기대하는 surface면 photo 우선. 이 기본값은 별도 결정 필요.

표현은 "확률 0.73" 같은 모델 흉내보다 "photo 신호 2개, graphic 신호 1개라 photo 선택"처럼 단순하게 남긴다. 중요한 것은 같은 입력이면 같은 family가 나오는 것이다.

분류 결과는 검색할 컬렉션을 고르기 위한 내부 판단이다. Toolditor command나 public contract에 "hero image", "cta icon", "background slot" 같은 의미 라벨을 새로 만들지 않는다.

## 6. 검색/필터/선택: embed text -> qdrant top-k -> selector -> selected/generate/unresolved

권장 런타임 순서:

1. 검색 텍스트를 만든다.
2. 검색 텍스트를 embedding한다. 모델은 새 asset index와 같은 모델/버전이어야 한다.
3. family에 맞는 Qdrant 컬렉션을 top-k로 검색한다.
4. Qdrant payload에서 후보 id, serial, family, width/height 같은 최소 정보를 받는다.
5. policy filter를 적용한다. 예: 무료 사용자에게 유료 에셋을 바로 넣지 않는다.
6. catalog/API로 후보가 아직 사용 가능한지 다시 확인한다.
7. 실제 URL, natural size, 가격/소유자 정보를 확인한다.
8. vision selector가 후보 1개를 선택하거나, 후보 전체를 부적합하다고 보고 `generate`를 선택하거나, `unresolved`를 선택한다.
9. 선택된 asset의 URL과 metadata만 bitmap command에 반영한다.
10. `generate`일 때는 native Gemini image generation을 호출하고, 반환된 bytes/base64를 object store에 저장한 뒤 Tooldi-owned artifact URL과 generated metadata만 bitmap command에 반영한다.

Qdrant는 빠른 후보 찾기용이다. 최종 권위는 catalog/API가 가져야 한다. Qdrant payload가 오래됐을 수 있고, 에셋이 삭제/비공개/유료 전환됐을 수 있기 때문이다.

Selector output은 아래 union으로 닫는다.

```json
{
  "decision": "selected | generate | unresolved",
  "selectedCandidateId": "C01-C06 or null",
  "confidence": "high | medium | low",
  "reason": "short Korean reason",
  "generationPrompt": "English prompt, required when decision=generate",
  "generationOptions": {
    "aspectRatio": "1:1 | 16:9 | 9:16 | match_layout",
    "outputFormat": "png | jpg"
  }
}
```

Generation은 Qdrant-first 흐름의 fallback이다. 검색 전에 생성으로 건너뛰거나, selector의 부적합 판단 없이 catalog 후보를 무시하는 경로는 허용하지 않는다.

중요한 색인 전제:

- 현재 `embedding-test`의 데이터는 template RAG 레거시 성격이 강하다. README 기준 소형 배치도 template preview와 shape 중심이다.
- Phase 6는 template 검색 부활이 아니다.
- Phase 6용으로 Tooldi photo(Picture)와 graphic(Shape)을 새로 색인해야 한다.
- template 컬렉션은 검색 대상에 넣지 않는다.

## 7. 요청 필드 추가: `assetPolicy` / `requesterEntitlement` 같은 사용자 권한 정보가 왜 필요한지

현재 public run request(`StartAgentWorkflowRunRequestSchema`)에는 사용자 에셋 권한을 판단할 필드가 없다. `editorContext`에는 문서와 캔버스 정보가 있고, `runPolicy`에는 live commit/time budget 같은 실행 정책이 있지만, "이 사용자가 어떤 에셋을 쓸 수 있는지"는 없다.

이 정보가 없으면 런타임은 다음을 안전하게 판단할 수 없다.

- 무료 사용자에게 paid asset을 넣어도 되는가
- 이미 구매한 asset인가
- 팔로우/소유자 기반 필터를 적용해야 하는가
- AI 생성/내부 에셋 허용 여부가 asset 선택에도 영향을 주는가
- signed URL을 만들 권한이 있는가

그래서 Phase 6 구현 전 request contract에 권한 정보를 추가하는 결정을 내려야 한다.

쉬운 모델:

```text
assetPolicy:
  allowedFamilies: photo/graphic
  paidAssetMode: allow | free_only | mark_unresolved
  allowAiAssets: boolean

requesterEntitlement:
  requesterUserId
  planTier
  purchasedAssetIds or purchaseCheckRef
  canUsePaidAssets
```

정확한 필드명은 contract owner가 정해야 한다. 핵심은 RAG resolver가 "좋아 보이는 이미지"가 아니라 "이 run에서 넣어도 되는 이미지"를 골라야 한다는 점이다.

## 8. fallback: 못 찾거나 생성 실패할 때 src/metadata를 어떻게 둘지

fallback은 run 실패가 아니라 bitmap 하나의 미해결 상태로 처리한다. Generation mode가 꺼져 있거나 Gemini 호출/저장에 실패해도 run 전체를 깨지 않고 unresolved bitmap으로 닫는다.

권장 metadata:

```ts
{
  src: fallbackSrc,
  naturalWidth: originalNaturalWidth,
  naturalHeight: originalNaturalHeight,
  alt: originalAlt,
  unresolvedPlaceholder: true,
  placeholderUri: "placeholder://봄꽃 배경",
  placeholderHint: "봄꽃 배경",
  unresolveReason: "embedding_failed" | "no_match" | "policy_filtered" | "catalog_fetch_failed"
}
```

생성에 성공한 경우 command metadata는 unresolved 대신 아래 family를 남긴다.

```ts
{
  generatedAssetId: "generated:<runId>:001",
  generatedAssetProvider: "gemini",
  generatedAssetModel: "gemini-2.5-flash-image",
  generatedAssetPrompt: "<selector or default generation prompt>",
  generatedAssetMethod: "gemini-native-generation",
  placeholderUri: "placeholder://...",
  placeholderHint: "..."
}
```

`fallbackSrc`는 아직 결정이 필요하다.

- placeholder URI 유지: 원인 추적은 쉽지만 Toolditor 실 렌더에서 깨질 수 있다.
- 1x1 회색/투명 data URL: 렌더는 안전하지만 사용자에게 빈 박스로 보일 수 있다.
- Toolditor 내장 placeholder thumbnail URL: UX는 낫지만 FE/asset 경계 결정이 필요하다.

권장 결정은 "렌더가 깨지지 않는 작은 fallback src + `unresolvedPlaceholder: true` marker"다. 사용자가 수동 교체할 수 있어야 하므로 원래 hint는 metadata에 꼭 남긴다.

## 9. 테스트 포인트: unit/integration/E2E에서 뭘 봐야 하는지

Unit:

- placeholder 검출: `bitmap + placeholder://`만 잡고, 실제 URL/png/svg/text는 건드리지 않는다.
- context builder: 같은 commands 입력이면 같은 nearby text 순서가 나온다.
- hint parser: 한글/공백/URL encoded hint를 안정적으로 복원한다.
- family classifier: hard rule이 아니라 hint + aspect + 주변 text를 함께 본다.
- policy filter: free_only, paid 허용, catalog stale 후보 제거를 검증한다.
- fallback builder: 실패 이유별 metadata가 유지된다.

Integration:

- fake embedding client, fake Qdrant, fake catalog/API를 연결해 `V6PrimitiveCommand[] -> resolved V6PrimitiveCommand[] -> adaptV6Commands`까지 본다.
- `adaptV6Commands` 결과의 bitmap metadata에 실제 `src`, `tooldiAssetId`, `sourceFamily`, `unresolvedPlaceholder`가 의도대로 들어가는지 본다.
- `v6PipelineNode`에서 `runV6Pipeline` 후 `adaptV6Commands` 전 resolver가 한 번만 호출되는지 본다.
- resolver 장애가 run 실패로 번지지 않고 unresolved bitmap으로 내려오는지 본다.

E2E:

- Phase 4 smoke prompt 5개를 확장해 placeholder가 1개 이상 생기는지 본다.
- 실제 embedding sidecar + Qdrant + catalog/API로 실행해 bitmap `metadata.src`가 Tooldi 실 URL 또는 unresolved marker 중 하나인지 본다.
- Toolditor에서 이미지가 렌더되는지 스크린샷으로 확인한다.
- RAG 추가 후 전체 latency가 허용 범위 안에 있는지 본다.
- legacy retrieval 모듈 import가 없는지 `rg`로 확인한다.

## 10. 권장 결정과 아직 확인할 질문

권장 결정:

- 삽입 위치는 `v6PipelineNode.ts`의 `runV6Pipeline` 직후, `adaptV6Commands` 직전으로 둔다.
- `runV6Pipeline`과 `v6PrimitiveMapper`에는 Qdrant/catalog I/O를 넣지 않는다.
- 대상은 `V6ImageCommand` 중 `primitive: "bitmap"`이고 `src`가 `placeholder://`인 command만이다.
- layout은 고정하고 bitmap `src`와 asset metadata만 바꾼다.
- Phase 6용 photo/graphic index를 새로 만든다. 기존 template 중심 컬렉션은 재사용하지 않는다.
- 레거시 retrieval 모듈은 import 금지다.
- 권한 정보는 request contract에 새로 들어와야 한다.
- 실패는 run 실패가 아니라 unresolved bitmap fallback이다.

아직 확인할 질문:

- request contract에 넣을 최종 필드명은 `assetPolicy`, `requesterEntitlement`, 또는 다른 이름인가?
- paid asset 정책은 free user에서 "제외"인가, "넣되 결제 필요 표시"인가, "unresolved 처리"인가?
- fallback src는 placeholder URI 유지, data URL, Toolditor 내장 thumbnail 중 무엇인가?
- photo/graphic 동률 기본값은 무엇인가?
- Qdrant 컬렉션을 `tooldi_photos_v1` / `tooldi_graphics_v1`로 분리할지, 단일 컬렉션 + family filter로 둘지?
- catalog/API는 serial 단건 hydration endpoint가 있는가, 아니면 search API로 다시 확인해야 하는가?
- embedding sidecar는 Python FastAPI로 둘지 Node로 포팅할지?
- 같은 run 안에서 같은 hint/context가 반복될 때 embedding cache를 둘지?

## 11. 조사 근거: 파일 경로와 확인 내용

- `agent-workflow-test/AGENTS.md`: v6 SSOT가 현재 authority이며 v5 constrained HTML과 template-aware adaptive composition은 historical로 밀려 있다.
- `agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md`: v6는 free HTML, browser layout, primitive extract 3단계이며 `placeholder://<hint>` 이미지를 허용한다. `sandbox/embedding-test`는 Phase 6 RAG 재사용 후보로만 언급된다.
- `agent-workflow-test/docs/archive/handoff/2026-04-21-agw-v6-phase6-rag-placeholder-swap-design-handoff.md`: Phase 6는 `placeholder://<hint>`를 실제 Tooldi asset ID/S3 URL로 바꾸는 설계 단계였다. 2026-04-30 기준 synthetic asset 금지는 좁은 범위에서 개정되어, 검색 후보가 없거나 selector가 부적합하다고 판단한 경우에만 native Gemini generation fallback을 허용한다. bounds/style 변경 금지, template 컬렉션 제외, 레거시 retrieval 재-wire 금지는 유지된다.
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/graph/v6PipelineNode.ts`: 현재 node는 `runV6Pipeline` 결과를 받은 뒤 바로 `adaptV6Commands`를 호출한다. request, intent, dependencies가 있는 위치라 RAG 호출을 넣기 가장 단순하다.
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6Pipeline.ts`: pipeline은 HTML 생성, 검증, 브라우저 렌더, primitive mapping까지만 수행한다. 외부 catalog/Qdrant I/O를 넣지 않는 것이 현재 DI 경계와 맞다.
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6PrimitiveMapper.ts`: `placeholder://` 이미지는 `bitmap`으로 분류되고, `src`, `naturalWidth`, `naturalHeight`, `alt`, `bounds`가 primitive command에 보존된다.
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6CommandAdapter.ts`: image/bitmap metadata는 현재 `src`, `naturalWidth`, `naturalHeight`, `alt`를 그대로 담는다. 따라서 adapter 전 command의 `src`를 교체하거나 adapter에 resolved metadata를 넘기는 방식이 가능하다.
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6Types.ts`: `V6ImageCommand`는 `primitive: "image" | "bitmap"`과 `src`, `bounds`, `objectFit`, `borderRadius`를 가진다. 이 타입이 runtime swap의 직접 대상이다.
- `agent-workflow-test/tooldi-agent-runtime/packages/contracts/src/public/run-request.ts`: public request에는 prompt, canvas, brand, referenceAssets, runPolicy는 있지만 requester entitlement나 asset usage 권한 필드는 없다.
- `agent-workflow-test/tooldi-agent-runtime/packages/tool-adapters/src/catalog/tooldiCatalogSourceTypes.ts`: Tooldi catalog에는 `TooldiPhotoAsset`, `TooldiGraphicAsset`, `priceType`, `uid`, `width`, `height`, `originUrl`, `thumbnailUrl` 등 policy/catalog 확인에 필요한 필드가 있다.
- `agent-workflow-test/tooldi-agent-runtime/packages/tool-adapters/src/catalog/tooldiCatalogSourceClient.ts`: photo는 `/picture`, graphic은 `/shape` 검색으로 가져오며 price/owner/type filter를 API query로 보낼 수 있다.
- `/home/ubuntu/github/tooldi/sandbox/embedding-test/README.md`: 현재 sandbox는 Qdrant + `jinaai/jina-clip-v2` PoC이고, 소형 배치 컬렉션은 template preview와 shape 중심이다. Phase 6용 photo/graphic asset index는 별도 설계가 필요하다.
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/runRetrievalStage.ts` 및 handoff의 legacy 목록: 기존 retrieval은 template prior, search profile, adaptive composition, slot/role 성격을 가진다. Phase 6 runtime swap에서는 import/재사용하지 않는다.
