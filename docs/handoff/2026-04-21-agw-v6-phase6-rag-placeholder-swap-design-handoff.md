# AGW v6 Phase 6 — RAG Placeholder Swap (Design Handoff)

**Status**: **Design 전용 — 구현 전 단계**. Phase 4 cutover 완료 후 push 됨 (`agent-workflow-test@feature/v6-structure`, `toolditor@feature/v6-primitives`).
**Date**: 2026-04-21 (handoff 작성)
**Target repo**: `tws-editor-api/agent-workflow-test/tooldi-agent-runtime` + `sandbox/embedding-test` + `toolditor` (경계 확정만)
**Target branch**: 설계 확정 후 새 feature branch (예: `feature/v6-rag-swap`)
**Scope**: 이 handoff 는 **설계 align 용**. 구현/PR/commit 을 포함하지 않는다. 목표는 다음 구현 스레드가 시작 prompt 만 보고도 경계·금지·재사용·철학을 실수 없이 따라갈 수 있게 만드는 것.

---

## 0. 전제 — 왜 지금 Phase 6인가

Phase 4 완료로 다음이 확정됐다:

- LLM 은 `<img src="placeholder://<hint>" width="..." height="...">` 형태로 placeholder 만 출력 (`v6SystemPrompt.ts`).
- Playwright route 인터셉터가 `placeholder://*` 를 1×1 transparent PNG 로 치환해 bounds 만 확보 (`v6BrowserRender.ts`).
- `v6PrimitiveMapper.classifyImage()` 가 `placeholder://*` 를 `bitmap` 으로 분류.
- `v6CommandAdapter` 는 `src` 를 그대로 metadata 에 넣어 Toolditor 에 전달 → 실 렌더에서 **blank box 로 표시됨**.

즉 현재 bitmap primitive 의 `metadata.src` 는 의미 없는 placeholder URI. Phase 6 는 이 gap 을 메워 **`placeholder://<hint>` → 실제 Tooldi asset ID + S3 URL** 로 swap 한다.

Phase 5 (Docker/Lambda warm pool/cold start) 는 **Phase 6 이후 최후반** 으로 user 결정. Phase 6 설계 단계에서 Phase 5 인프라 가정은 하지 않는다 — RAG 모듈은 host Node / ephemeral Chromium 환경에서도 동작해야 한다.

---

## 1. 철학 (Locked — v6 원칙 계승)

Phase 6 는 v6 SSOT (`tooldi-agent-workflow-v6-layout-freedom-ssot.md`) 의 다섯 원칙을 **그대로** 따른다. RAG 는 "새 축" 이 아니라 "Stage 3.5 삽입" 에 불과하다.

| 원칙 | Phase 6 적용 |
|---|---|
| P1 LLM 은 결과를 만든다 | LLM 은 hint 문자열만 내놓는다. asset 선택은 LLM 이 하지 않는다 (2차 LLM 호출 금지). |
| P2 브라우저는 layout 을 계산한다 | placeholder 의 bounds 는 Stage 2 에서 이미 확정. RAG 는 bounds/aspect 를 **수정하지 않는다**. |
| P3 코드는 결과를 추출한다 | asset resolution 은 결정적 embedding + Qdrant search + policy filter. 매번 다른 결과를 낼 여지는 embedding 모델의 semantic 거리뿐. |
| P4 layout family / slot / role / CTA / topology 를 contract 로 승격하지 않는다 | **placeholder hint 에 "cta-button" / "hero-image" 같은 의미 라벨을 강요하지 않는다.** hint 는 한국어 자유 서술. RAG 는 hint 자체를 embedding 한다. |
| P5 completion = editability + renderability + save truth | RAG 결과는 bitmap primitive 의 `src` + `naturalWidth` / `naturalHeight` metadata 만 교체. editability 불변. |

**추가 세부 원칙 (Phase 6 전용)**:

| 세부 원칙 | 의미 |
|---|---|
| Q1 asset resolution 은 bounds/style 에 영향을 주지 않는다 | bitmap primitive 의 `bounds` / `objectFit` / `borderRadius` / `opacity` / `transform` 은 Stage 3 결과를 고정 유지. RAG 가 바꿀 수 있는 것은 `src` + `naturalWidth` + `naturalHeight` + `alt` + `metadata.tooldiAssetId` + `metadata.sourceSerial` / `metadata.sourceUid` 만. |
| Q2 asset family 분류는 hint + aspect + context 로 추론한다 | placeholder URI 자체에 `photo/` `graphic/` 같은 path component 를 강요하지 않는다. LLM 출력 제약 증가는 v6 의 "자유도" 원칙과 충돌. photo vs graphic 분류는 RAG 단계의 책임. |
| Q3 bounded degradation | RAG 실패(embedding 타임아웃 / Qdrant 장애 / 정책 필터 후 후보 0개) 시 bitmap primitive 는 **1×1 회색 fallback** 으로 유지하고 `metadata.unresolvedPlaceholder: true` 를 붙여 Toolditor 에서 사용자 수동 교체 유도. run fail 하지 않는다. |
| Q4 synthetic asset 금지 | DALL-E / Midjourney / Gemini 이미지 생성으로 대체 금지. 오직 Tooldi catalog (Picture::index / Shape::index) 내 실 asset 만 허용. |
| Q5 결정성은 embedding 모델과 index 버전에 종속된다 | 같은 hint + context 입력에 대해 같은 Qdrant index + 같은 embedding 모델 버전이면 top-1 결과가 고정되어야 한다. index 갱신/모델 교체는 수동 trigger. |

---

## 2. 목표

1. **bitmap primitive 의 placeholder src → 실 S3 URL 자동 치환** (top-1 asset).
2. **photo / graphic family 분류**: hint + aspect ratio + 주변 텍스트 기반 결정적 분류기. LLM 재호출 없음.
3. **policy filter**: owner (free/paid) + price + type (pic/rmbg for photo, vector/bitmap for graphic) 적용.
4. **bounded degradation**: 실패 시 run fail 없이 `unresolvedPlaceholder` marker.
5. **latency budget**: RAG stage p50 ≤ 1.0s for 1~3 placeholders (병렬). Phase 4 E2E 총 p50 ~5.5s 에 20% 이내 추가 허용.
6. **acceptance**: Phase 4 smoke 5 sample 중 최소 4개에서 placeholder 개수 ≥ 1 & 전체가 실 Tooldi asset URL 로 치환되어 Toolditor 에서 실 이미지 렌더.

---

## 3. 3단계 파이프라인 내 RAG 의 위치

v6 SSOT §2 의 3단계는 **유지**. RAG 는 Stage 3 (primitive map + adapter + SSE envelope) 내부의 서브단계로 삽입된다.

```
Stage 1  LLM HTML gen                      (unchanged)
Stage 2  security validate + browser render + DOM extraction   (unchanged)
Stage 3  primitive map + adapter + SSE envelope                (extended)
  ├─ 3.1 primitive map          (unchanged - v6PrimitiveMapper)
  ├─ 3.2 placeholder detection  (NEW - trivial, bitmap with placeholder:// src)
  ├─ 3.3 context enrichment     (NEW - 각 placeholder 에 주변 text + canvas theme 붙임)
  ├─ 3.4 asset resolution       (NEW - embedding + Qdrant + policy + catalog)
  ├─ 3.5 adapter                (extended - resolved asset id/url metadata 주입)
  └─ 3.6 SSE envelope           (unchanged - emitV6Mutations)
```

**왜 Stage 3 내부인가**: Stage 2 (browser) 에서 실 asset 로 다시 렌더해 bounds 재측정할 이유가 없다 (bitmap bounds 는 LLM 이 지정한 `<img width height>` 로 Stage 2 에서 이미 결정, Q1). Stage 3 는 "결과 추출" 단계라 asset lookup 성격에 맞는다. Stage 4 (SSE/ack) 는 순수 전송이라 lookup 을 끼지 않는다.

**왜 Stage 3.5 를 별도로 두지 않는가**: 3단계 계약 (§2) 은 유지하되 내부 서브단계로 표현하면 SSOT 단계 숫자 변경을 피할 수 있다. 향후 Phase 7 이 오더라도 파이프라인 cardinality (LLM 1회 / browser 1회 / extract 1회) 는 그대로.

---

## 4. 레이어 경계 & 책임

### 4.1 Agent Worker (agent-workflow-test/tooldi-agent-runtime/apps/agent-worker)

**새 모듈** (제안):

| 모듈 | 책임 |
|---|---|
| `phases/v6AssetContext.ts` | bitmap primitive 집합 + 주변 text primitive + canvas theme (전체 run 의 intent summary 첫 80자) → `V6AssetContext[]` 생성. **순수 함수, LLM 호출 없음**. |
| `phases/v6AssetFamilyClassifier.ts` | hint + aspect ratio + context 로 `"photo" \| "graphic"` 결정. 결정적 휴리스틱 (aspect > 1.5 and hint 에 인물/풍경 키워드 → photo 편향 등). **no LLM, no slot/role classification (P4)**. |
| `phases/v6AssetResolver.ts` | `V6AssetContext[]` → `V6ResolvedAsset[]`. embedding → Qdrant → policy → catalog 호출. 병렬 실행. 실패는 `unresolvedPlaceholder` marker. |
| `phases/v6EmbeddingClient.ts` | jina-clip-v2 호출 wrapper. 초기엔 HTTP to Python sidecar. |
| `phases/v6QdrantClient.ts` | Qdrant REST wrapper (`tooldi_real_asset_batch_v1` 등). |

**수정 모듈**:

- `phases/v6CommandAdapter.ts`: `V6ResolvedAsset` 정보를 받아 bitmap command 의 `src` + `naturalWidth` + `naturalHeight` + `metadata.tooldiAssetId` 교체. 현재 metadata 에 이미 `src`, `naturalWidth`, `naturalHeight`, `alt` 있음 → 필드 추가만.
- `graph/v6PipelineNode.ts`: `adaptV6Commands` 호출 전에 `resolveAssets` 삽입. browserHandle 과 같은 수명 관리 패턴으로 qdrantClient / embeddingClient 를 lazy init.

### 4.2 Embedding Service (sandbox/embedding-test 확장 또는 별 sidecar)

**옵션 A — Python sidecar 재사용 (권장)**:
- `sandbox/embedding-test/template_embedding_service.py` 를 FastAPI 로 감싸 HTTP endpoint 노출. `POST /embed/text` → 512-dim vector.
- 장점: `jinaai/jina-clip-v2` 의 Python 호환성 보장. PoC 코드 재사용.
- 단점: Python 프로세스 1개 추가. local-docker stack 에 service 추가 필요.

**옵션 B — Node.js 포팅 (`@huggingface/transformers.js`)**:
- 장점: 프로세스 1개 유지. agent-worker 내부에서 완결.
- 단점: jina-clip-v2 의 transformers.js 호환성 확인 필요. 현재 PoC 가 Python 이라 검증 이력 0.

**권장**: A. Phase 6 설계 시 B 의 PoC 를 1회 실행해 feasibility 판정 후 A/B 최종 결정.

### 4.3 Vector DB (Qdrant)

**재사용**: `sandbox/embedding-test/docker-compose.yaml` 의 로컬 Qdrant 컨테이너.

**컬렉션 전략**:
- `tooldi_photos_v1` (Picture::index, `type: pic | rmbg`, 512-dim, metadata: `sourceSerial`, `ownerUid`, `priceType`, `naturalWidth`, `naturalHeight`, `category`)
- `tooldi_graphics_v1` (Shape::index, `type: vector | bitmap`, 512-dim, metadata 동일 + `subType`)
- **template 컬렉션은 Phase 6 범위 아님** (P4 — template reference graph 승격 금지).

**indexing 전략**: 
- 초기 scope: 각 family 상위 1k~5k asset 만 (PoC `tooldi_real_asset_batch_v1` 의 300 건 확장). 
- 임베딩 입력: asset 썸네일 이미지 (jina-clip-v2 의 image encoder).
- 쿼리 입력: hint + context text (jina-clip-v2 의 text encoder, 같은 latent space).
- 확장은 별도 운영 작업 (R-V6-3 계승).

### 4.4 Tooldi Catalog API

**재사용**: `packages/tool-adapters/src/catalog/tooldiCatalogSourceClient.ts`. 이미 `TooldiPhotoAsset` / `TooldiGraphicAsset` 타입 정의됨 (`tooldiCatalogSourceTypes.ts` L69/L51).

**역할**:
- Qdrant 검색 결과의 `sourceSerial` → catalog 에서 owner/price/S3 URL 확인.
- signed S3 URL 생성 (`assetStorageClient`).
- policy filter 적용 전/후 모두 authoritative 한 asset metadata 제공.

**주의**: `TooldiCatalogSourceMode` 는 `placeholder | tooldi_api_direct | mock` 셋. dev/test 는 placeholder/mock, local-docker 에서는 `tooldi_api_direct` (PHP API 프록시). Phase 6 RAG 도 동일 모드 스위치 사용.

### 4.5 Toolditor

**변경 없음**. 기존 bitmap primitive 렌더 경로가 `metadata.src` 를 그대로 로드. Phase 6 는 `metadata.src` 를 실 S3 signed URL 로 교체할 뿐.

**단, 신규 marker 1개**: `metadata.unresolvedPlaceholder?: true`. Toolditor 는 이 marker 를 받으면 UI 에 "asset 교체 필요" 힌트 (dashed border + 작은 아이콘) 노출. UI 는 design 만 정의, 구현은 FE 스레드 범위.

---

## 5. 데이터 모델

### 5.1 `V6AssetContext` (Stage 3.2/3.3 출력)

```ts
interface V6AssetContext {
  readonly bitmapCommandIndex: number; // commands[i] 의 i
  readonly placeholderUri: string;     // "placeholder://봄꽃 배경"
  readonly hintText: string;           // "봄꽃 배경" (URI 에서 prefix 제거)
  readonly bounds: V6Bounds;           // Stage 2 결정, Q1 에 의해 불변
  readonly aspectRatio: number;        // width/height
  readonly nearbyText: string[];       // 같은 z-order cluster 의 text leaf 본문 (상위 3개)
  readonly canvasTheme: string;        // intent summary 첫 80 자
  readonly family: "photo" | "graphic"; // 4.1 classifier 결정
}
```

### 5.2 `V6ResolvedAsset` (Stage 3.4 출력)

```ts
interface V6ResolvedAsset {
  readonly bitmapCommandIndex: number;
  readonly status: "resolved" | "unresolved";
  // status === "resolved" 시
  readonly tooldiAssetId?: string;     // catalog asset id
  readonly sourceSerial?: number;
  readonly sourceFamily?: "photo" | "graphic";
  readonly sourceCategory?: string;
  readonly signedUrl?: string;         // S3 signed URL
  readonly naturalWidth?: number;
  readonly naturalHeight?: number;
  readonly owner?: string | null;
  readonly priceType?: "free" | "paid" | null;
  // status === "unresolved" 시
  readonly unresolveReason?: "embedding_failed" | "no_match" | "policy_filtered" | "catalog_fetch_failed";
}
```

### 5.3 bitmap command metadata 확장 (Stage 3.5)

기존 (`v6CommandAdapter.ts` L185-196):
```ts
{ src, naturalWidth, naturalHeight, alt, v6Primitive: "bitmap", sourceSerial, ... }
```

확장:
```ts
{
  src: signedUrl || placeholderUri,
  naturalWidth: resolvedNaturalWidth ?? placeholderNaturalWidth,
  naturalHeight: resolvedNaturalHeight ?? placeholderNaturalHeight,
  alt, v6Primitive: "bitmap",
  sourceSerial, sourcePath, sourceTag,              // 기존 source 추적
  tooldiAssetId?: string,
  tooldiSourceSerial?: number,
  tooldiSourceFamily?: "photo" | "graphic",
  unresolvedPlaceholder?: true,
  unresolveReason?: string,
}
```

---

## 6. Anti-pattern (즉시 제동)

| 안티패턴 | 왜 금지인가 |
|---|---|
| `placeholder://photo/봄꽃` 처럼 path component 로 family 명시 요구 | P1/P4 위반. LLM 출력 제약 증가 + family classification 을 LLM 에 위임. family 결정은 RAG 단계의 책임 (Q2). |
| LLM 에게 "더 좋은 asset 후보 고르기" 2차 호출 | P1 위반. Qdrant top-N → deterministic policy filter → top-1 만 허용. |
| RAG 결과로 bitmap primitive 의 bounds/objectFit/borderRadius 재계산 | Q1 위반. `src` + `naturalWidth` / `naturalHeight` 만 교체. |
| 실패 시 synthetic asset 생성 (DALL-E 등) | Q4 위반. Tooldi catalog 내부에서만 resolve. bounded degradation 으로 대체. |
| RAG 실패로 run 전체 fail | Q3 위반. run 은 성공, bitmap 은 unresolvedPlaceholder marker. |
| template 컬렉션을 RAG target 에 포함 | P4 위반. template reference graph 부활. Phase 6 target 은 photo + graphic 만. |
| `buildAssetPlan`, `buildSearchProfile`, `runRetrievalStage`, `candidateSearchers`, `assembleTemplateCandidates`, `selectTemplateComposition`, `selectTypography` 재사용/재-wire | v5 이전 retrieval 경로. LEGACY_CHAIN_SKIP 으로 이미 unreachable. Phase 6 는 **신규 구현**. 재-wire 는 v5 설계철학 (adaptive composition / template prior) 을 다시 불러오는 것. |
| asset swap 결과를 Toolditor 에 **별도 mutation event** 로 emit (2단 스트리밍) | 현재 단일 envelope 계약 유지. asset resolution 완료 **후** 1회 envelope emit. 2단 emit 은 completion gate 재설계를 동반하므로 Phase 6 범위 외. |
| Qdrant index schema 를 매 run 마다 재생성 | Q5 위반. index 갱신은 수동 trigger. |
| jina-clip-v2 외 다른 embedding 모델 병행 (ensemble) | Q5 결정성 깨짐. 모델 교체는 bench 증거 + index 재구축 동반. |
| placeholder hint 를 keyword rule 로 photo/graphic 강제 매핑 ("배경" → photo 만, "아이콘" → graphic 만) | **soft prior 로는 허용**, hard rule 은 금지. aspect + nearby text 도 반드시 섞어서 분류. hint 단독 rule 은 P4 의 slot/role 분류 변형. |

---

## 7. Legacy 유의사항

### 7.1 v5 이전 retrieval 모듈 — **절대 재-wire 금지**

다음 파일들은 **LEGACY_CHAIN_SKIP 으로 이미 unreachable** 하지만 source tree 에는 남아있다 (types.ts 의존성으로 인한 ts 컴파일 의존). Phase 6 에서는 import 자체를 **금지**.

```
apps/agent-worker/src/phases/runRetrievalStage.ts
apps/agent-worker/src/phases/buildAssetPlan.ts
apps/agent-worker/src/phases/buildSearchProfile.ts
apps/agent-worker/src/phases/assembleTemplateCandidates.ts
apps/agent-worker/src/phases/candidateSearchers.ts
apps/agent-worker/src/phases/selectTemplateComposition.ts
apps/agent-worker/src/phases/selectTypography.ts
apps/agent-worker/src/phases/buildTemplatePriorBundle.ts
apps/agent-worker/src/phases/templatePriorVectorRecall.ts
apps/agent-worker/src/phases/compositionEngine.ts
apps/agent-worker/src/phases/buildAdaptiveCompositionDecision.ts
apps/agent-worker/src/phases/projectTemplateGraph.ts
```

이유:
- 이들은 template prior + adaptive composition + slot/role 기반 retrieval 을 전제로 짜여있다 (v1~v4 철학).
- v6 의 "layout family contract 승격 금지" (P4) 원칙을 깨는 구조.
- 일부는 함수 시그니처상 `ReferenceBlockGraph`, `ProjectedObjectGraph`, `AdaptiveCompositionDecision` 같은 폐기 개념을 직접 입출력.
- Phase 6 에서 재-wire 하면 `rg "ReferenceBlockKind|addableVocabulary|resolveRequiredExecutionSlots" --glob '!*historical*'` 이 0 초과로 돌아와 AGENTS.md 검증 힌트 위반.

**별도 cleanup**: Phase 6 는 이 파일들을 지우지 않는다. types.ts 가 공유 타입을 품고 있어 순수 RAG 구현과 독립적으로 정리해야 한다. cleanup 은 별도 PR.

### 7.2 Stage 1 system prompt 변경 유의

`v6SystemPrompt.ts` L28 "the placeholder is resolved later by asset retrieval; dimensions you specify are final" 문구 유지. 추가 지침으로 "hint 는 한국어 자유 서술, 10자 이내 권장" 정도의 soft guidance 만 고려. path component (`photo/`, `graphic/`) 요구하면 안티패턴 위반.

### 7.3 v5 grading / bench outputs 보존

`bench/method-compare-phase1/outputs-*/`, `grades-*/`, `logs/` 는 v5 증거. Phase 6 RAG bench 는 별도 경로 (`bench/rag-phase6/` 등) 에 두고 v5 outputs 는 건드리지 않는다. Phase 4 R-V6-6 계승.

### 7.4 font registry 와 RAG 의 경계

폰트 resolution 은 Phase 2.5 에서 완결 (`agent-workflow-test/fonts/registry.json` 참조, `v6SystemPrompt.ts` 에서 Toolditor ID 직접 명시). **폰트는 Phase 6 RAG 범위 아님**. `selectTypography.ts` 재-wire 금지도 이 경계를 지키기 위함.

### 7.5 sandbox/embedding-test 의 Python 환경

- 의존성: `uv`, Docker, AWS `readonly` profile, dev MariaDB password.
- 현재 PoC: 300 건 소형 배치 (`tooldi_real_asset_batch_v1`).
- Phase 6 운영에서는 **dev DB read-only 직접 조회를 prod 경로에 두지 않는다**. 임베딩/인덱싱은 offline 배치, prod 런타임은 Qdrant query 만.
- 인덱싱 범위/주기는 별도 운영 결정. Phase 6 설계 단계에서는 "초기 1k~5k, 상위 카테고리, 수동 재인덱싱" 정도만 명시.

### 7.6 Chromium + RAG 공존

Phase 4 는 Chromium ephemeral launch. Phase 6 의 embedding sidecar / Qdrant 도 외부 프로세스. agent-worker 한 job 내부에서 **세 외부 프로세스** (Chromium + Python embedding sidecar + Qdrant) 와 통신하게 됨. latency/에러 처리를 처음부터 설계.

---

## 8. 설계 단계에서 반드시 답할 질문

Phase 6 구현 스레드 시작 전, 이 handoff 에 후속 섹션으로 답을 적어 merge 한다:

1. **embedding sidecar**: 옵션 A (Python FastAPI) vs B (Node.js transformers.js) 중 어느 쪽인가. 결정 근거 bench (cold start, throughput, 설치 복잡도).
2. **Qdrant 수명**: local-docker stack 에 컨테이너 추가 vs agent-worker 외부 의존성으로 둘 것인가. dev vs prod/Lambda (Phase 5) 시나리오 모두 고려.
3. **family classifier** 의 휴리스틱 정의: aspect / hint 키워드 사전 / nearby text. **확률 스코어 표현 금지** (slot/role classification 변형). deterministic 분류.
4. **policy filter**: 현재 run 의 requester 의 tier (free/paid) 가 어디서 주입되는가. `editorContext` 에 이미 있는가, 추가 필드 필요인가.
5. **병렬 처리**: placeholder 3개일 때 embedding 3회 + Qdrant 3회. Promise.all 이면 충분한가. sidecar/Qdrant 의 동시성 한계 확인.
6. **캐싱**: 같은 hint + family 가 동일 run 내 2회 이상 나오면 embedding 결과 재사용? 구현 단순성 vs 비용 트레이드오프.
7. **unresolvedPlaceholder fallback 의 src**: 1×1 회색 vs placeholder URI 유지 vs Toolditor 내장 placeholder thumb. FE 경계와 같이 결정.
8. **indexing pipeline** 의 trigger: 수동 CLI vs CI job vs scheduled. Phase 6 scope 에 indexing 자동화가 들어가는가, 별도 operational PR 인가.
9. **bench rubric**: top-1 recall @ manual eval 20 prompt / latency p50·p95 / cost per run / failure rate. Phase 3-bis rebench 와 어떻게 정렬.
10. **Phase 5 (Lambda) 사전 고려**: RAG sidecar 를 Lambda 환경에서 어떻게 배포할지 대략 시나리오. Phase 5 범위지만 Phase 6 의 sidecar 선택이 Phase 5 를 제약하지 않도록.

---

## 9. Acceptance Criteria (Phase 6 완료 시점)

- [ ] bitmap primitive 의 `metadata.src` 가 실 Tooldi S3 signed URL 또는 `unresolvedPlaceholder: true` 중 하나.
- [ ] Phase 4 smoke 5 sample 중 최소 4개에서 `unresolvedPlaceholder` 비율 ≤ 25%.
- [ ] `rg "buildAssetPlan|runRetrievalStage|candidateSearchers|selectTypography|selectTemplateComposition|projectTemplateGraph|compositionEngine" apps/agent-worker/src/graph apps/agent-worker/src/phases/v6*` → 0 hits (새 v6 경로가 레거시 의존 없음).
- [ ] 단위 테스트: family classifier / policy filter / adapter extension.
- [ ] 통합 테스트: fake embedding client + fake Qdrant + fake catalog → resolved envelope 까지 pipeline 한 번 흐름.
- [ ] E2E smoke (Phase 4 확장): 실 Qdrant + 실 embedding sidecar + 실 catalog 로 5 sample 실행, 스크린샷 Toolditor 에서 실 이미지 렌더 확인.
- [ ] Phase 4 의 모든 AC-V6-P1~P8 여전히 통과.
- [ ] 신규 SSOT 섹션: v6 SSOT 에 §3.5 "Phase 6 Asset Resolution" 추가. P4 불변 명시.

---

## 10. Start Prompt (다음 스레드용)

```
이 handoff (tws-editor-api/agent-workflow-test/docs/handoff/
2026-04-21-agw-v6-phase6-rag-placeholder-swap-design-handoff.md) +
v6 SSOT (tooldi-agent-workflow-v6-layout-freedom-ssot.md) +
Phase 4 handoff + sandbox/embedding-test/README.md 를 읽고
Phase 6 RAG placeholder swap 을 **설계**하라.

Prerequisites 체크부터:
1. agent-workflow-test@feature/v6-structure 최신 (Phase 4 push 완료)
2. toolditor@feature/v6-primitives 최신
3. sandbox/embedding-test 로컬 Qdrant 컨테이너 상태 (docker ps --filter name=^/qdrant$)
4. jina-clip-v2 embedding sidecar PoC 실행 가능 여부 (uv sync + AWS profile)
5. packages/tool-adapters 의 TooldiPhotoAsset / TooldiGraphicAsset 타입 확인

이 세션의 산출물은 **설계 문서** 전용이다. 구현/커밋 금지.
설계 산출물 위치: docs/design/2026-XX-YY-agw-v6-phase6-rag-design.md (신규)

설계 범위 (handoff §8 질문 전부 답):
- embedding sidecar 구조 (Python FastAPI vs Node.js transformers.js)
- Qdrant 수명/배포 경계
- family classifier heuristic (hint + aspect + nearby text)
- policy filter 데이터 경로 (editorContext → requester tier)
- 병렬 처리 / 캐싱 전략
- unresolvedPlaceholder fallback src 정책 (FE와 align)
- indexing pipeline trigger
- bench rubric 정의
- Phase 5 (Lambda) 사전 고려
- 최종 모듈 목록 + 파일 레벨 경계

경계 (handoff §6 anti-pattern 숙지):
- LLM 2차 호출 없음.
- slot/role/CTA/template reference 승격 없음.
- bounds/style 변경 없음 (Q1).
- synthetic asset 없음 (Q4).
- 레거시 retrieval 모듈 재-wire 금지 (§7.1).

설계 acceptance:
- handoff §8 질문 10개 모두에 결정 + 근거 기록.
- §5 의 V6AssetContext / V6ResolvedAsset 스키마 최종 확정.
- §4 의 레이어별 책임이 파일 경로 레벨까지 내려옴.
- 다음 구현 스레드가 이 설계 문서 + 이 handoff 만으로 feature/v6-rag-swap 브랜치에서 작업 시작 가능.

설계 완료 후:
- 설계 문서 경로 + 핵심 결정 요약을 세션 종료 시 저장 (obsidian-memory-sync 스킬).
- 이 handoff 에 "설계 완료 참조" 섹션 append (별도 PR).
- 구현 스레드용 새 handoff (2026-XX-YY-agw-v6-phase6-implementation-handoff.md) 작성.
```

---

## 11. 참고 문서 & 모듈

- v6 SSOT: `tooldi-agent-workflow-v6-layout-freedom-ssot.md` (§1 원칙, §2 3단계, §3 font pipeline)
- Phase 4 handoff: `docs/handoff/2026-04-21-agw-v6-phase4-langgraph-swap-handoff.md`
- Phase 4 work-log: `obsidian-vault/작업기록/work-logs/2026-04-21-agw-v6-phase4-langgraph-cutover.md`
- embedding PoC: `sandbox/embedding-test/README.md` + `embed_real_assets_poc.py`
- Tooldi catalog types: `packages/tool-adapters/src/catalog/tooldiCatalogSourceTypes.ts`
- 현재 bitmap classification: `apps/agent-worker/src/phases/v6PrimitiveMapper.ts` L208 `classifyImage()`
- 현재 adapter metadata: `apps/agent-worker/src/phases/v6CommandAdapter.ts` L185-196 `metadataForImage()`
- 현재 system prompt: `apps/agent-worker/src/phases/v6SystemPrompt.ts`
- Legacy retrieval 경로 (재-wire 금지): §7.1 목록 13개 파일

---

## 12. 이 handoff 가 **하지 않는** 것

- 구현 PR 만들기 — 설계 스레드 전용.
- Phase 5 (Docker/Lambda) 와의 통합 상세 — Phase 5 handoff 에서 다룸.
- Phase 7 이상 로드맵 — 별도.
- v5 legacy 파일의 추가 cleanup — 별도 PR. Phase 6 는 재-wire 금지만 강제.
- Toolditor UI 의 "asset 교체" FE 설계 — FE 스레드 범위. 이 handoff 는 `metadata.unresolvedPlaceholder` marker 정의만.

---

**Status**: Ready. 다음 스레드는 §10 Start Prompt 로 진입.
**Owner (다음)**: Phase 6 설계 스레드 → 설계 문서 → 구현 스레드.
