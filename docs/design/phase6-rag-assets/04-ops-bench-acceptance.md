# Phase 6 RAG 운영/벤치/수용 기준

**상태**: 설계 문서. 구현, 색인(write/indexing), 커밋을 하지 않는다.  
**범위**: `placeholder://힌트` 를 실제 Tooldi photo/graphic 에셋 URL로 바꾸는 Phase 6 검증 기준.  
**중요 전제**: 현재 `sandbox/embedding-test` 의 실제 적재 데이터는 대부분 template RAG 레거시 데이터다. Phase 6 acceptance 는 이 데이터를 재사용해서 통과 처리하면 안 된다. Phase 6 는 template 검색 복구가 아니라 Tooldi 사진/그래픽 에셋을 새로 색인해서 치환하는 작업이다.

---

## 1. 개발자가 처음부터 재현하는 순서

아래 순서는 구현자가 빈 로컬 환경에서 Phase 6 를 재현할 때의 기준이다. 이 문서 작성 시점에는 색인 명령을 실행하지 않는다.

1. 권위 문서부터 읽는다.
   - `agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md`
   - `agent-workflow-test/docs/archive/handoff/2026-04-21-agw-v6-phase6-rag-placeholder-swap-design-handoff.md`
   - `sandbox/embedding-test/README.md`
2. 런타임 의존성을 설치한다.
   - Node runtime: `agent-workflow-test/tooldi-agent-runtime`
   - 명령: `pnpm install`
   - 검증: `pnpm build`, `pnpm test`
3. Python 임베딩 샌드박스(embedding-test)를 준비한다.
   - 위치: `/home/ubuntu/github/tooldi/sandbox/embedding-test`
   - 명령: `uv sync`
   - Qdrant 상태 확인: `docker compose ps`
4. Qdrant 가 읽기 가능한지 확인한다.
   - `docker ps --filter name='^/qdrant$'`
   - `curl http://localhost:6333/collections`
5. Phase 6 전용 컬렉션이 있는지 확인한다.
   - 사진 컬렉션(photo collection): `tooldi_photos_v1`
   - 그래픽 컬렉션(graphic collection): `tooldi_graphics_v1`
   - 현재 PoC 컬렉션인 `tooldi_real_asset_batch_v1`, `template_preview_embeddings_v1` 는 acceptance 대상이 아니다.
6. 구현 이후에만 새 색인 배치를 실행한다.
   - 입력은 Tooldi 사진(Picture::index)과 그래픽(Shape::index) 에셋이다.
   - template preview, template inner, template JSON 은 Phase 6 색인 대상이 아니다.
7. 런타임 smoke 를 실행한다.
   - Stage 1: LLM 이 `placeholder://힌트` 를 포함한 HTML 생성.
   - Stage 2: 브라우저 렌더(browser render)가 placeholder bounds 를 확정.
   - Stage 3: primitive 추출 후 RAG 치환(asset resolution)이 `metadata.src` 를 실제 URL 또는 unresolved marker 로 바꿈.
8. Toolditor 렌더를 확인한다.
   - bitmap/image 레이어가 빈 박스가 아니라 실제 이미지로 보이는지 확인한다.
   - 실패해도 run 전체는 성공해야 하며 `metadata.unresolvedPlaceholder: true` 가 남아야 한다.

### 1.1 현재 POC 진입점

Phase 6 전용 색인/검색 스크립트는 `embedding-test`에 별도로 둔다. 기존 template PoC 스크립트와 섞지 않는다.

```bash
cd /home/ubuntu/github/tooldi/sandbox/embedding-test

MYSQL_PWD='<dev-db-password>' \
RECREATE=true \
FAMILY=both \
PHOTO_LIMIT=3 \
GRAPHIC_LIMIT=3 \
DEVICE=cuda \
./run_embed_phase6_assets_poc.sh

DEVICE=cuda ./run_search_phase6_assets.sh photo '봄 꽃 배경 사진' 3
DEVICE=cuda ./run_search_phase6_assets.sh graphic '딸기 캐릭터 일러스트' 3
```

2026-04-21 확인 결과:

- `tooldi_photos_v1`: photo 3개 upsert, text search 동작
- `tooldi_graphics_v1`: graphic 3개 upsert, text search 동작
- template payload field 검색 0 hits
- CPU 실행은 현재 `jina-clip-v2`/xformers 조합에서 실패하므로 로컬 POC는 `DEVICE=cuda` 사용

이후 acceptance 후보 기준으로 다음도 확인했다.

- `tooldi_photos_v1`: 1,024 points
- `tooldi_graphics_v1`: 1,000 points
- `봄 꽃 배경 사진` 검색 결과는 꽃/봄/배경 사진이 상위
- `할인 스티커 아이콘` 검색 결과는 세일 스티커 그래픽이 상위

3개 샘플은 연결 검증용이고, 1,000개 샘플은 검색 가능성 확인용이다. 최종 acceptance는 아래 smoke prompt와 Toolditor 렌더 기준까지 통과해야 한다.

현재 POC 확장 방향:

- smoke prompt에 맞춘 주제별 pool은 만들지 않는다.
- 전체 후보에서 검색하는 방식으로 품질을 본다.
- POC 필터는 active/free/thumbnail/test 제외 같은 사용 가능성 필터로 제한한다.
- 현재는 추가 임베딩 없이 이미 적재된 photo 1,024개 / graphic 1,000개 범위만 사용한다.
- 2,000개 초과 대량 색인은 S3 read, GPU 시간, Qdrant write 비용이 있으므로 별도 승인 후에만 실행한다.

---

## 2. 필요한 로컬/외부 의존성

| 의존성 | 쉬운 설명 | 코드명/근거 | 검증 명령 |
| --- | --- | --- | --- |
| 벡터 DB | 이미지 검색용 로컬 DB | Qdrant | `docker compose ps`, `curl http://localhost:6333/collections` |
| Python 임베딩 서버 | 힌트 문장과 에셋 이미지를 같은 벡터 공간으로 바꿈 | Python sidecar, `jinaai/jina-clip-v2` | `uv sync`, sidecar health endpoint |
| AWS 읽기 권한 | S3 원본/썸네일을 읽기 위한 권한 | `AWS_PROFILE=readonly` | `aws sts get-caller-identity --profile readonly` |
| Tooldi dev DB 읽기 권한 | 오프라인 색인 배치가 sourceSerial, 파일 경로, 메타데이터를 읽음 | dev MariaDB readonly | 비밀번호는 `TOOLDI_DEV_DB_PASSWORD` 또는 `MYSQL_PWD` |
| Catalog API | 런타임에서 Qdrant 후보를 실제 사용 가능한 에셋으로 확인 | Tooldi Catalog API, `/picture`, `/shape` | `tooldi_api_direct` 모드로 photo/graphic search |
| Agent runtime | v6 파이프라인이 돌아가는 Node 워커 | `tooldi-agent-runtime` | `pnpm build`, `pnpm test` |
| 브라우저 렌더러 | HTML bounds 를 계산 | Playwright Chromium | 기존 `v6Pipeline.test.ts`, Phase 4 smoke |

운영 원칙:

- 색인은 오프라인 배치다. 사용자 run 중에 Qdrant collection 을 만들거나 재생성하지 않는다.
- 운영 런타임은 Qdrant query, embedding query, Catalog API 확인만 한다.
- 현재 embedding-test 의 template 중심 컬렉션은 참고 자료일 뿐 Phase 6 품질 증거가 아니다.

---

## 3. 색인 검증 기준

색인 검증은 "자료가 들어갔다"가 아니라 "Phase 6 런타임이 안전하게 쓸 수 있다"를 확인한다.

### 3.1 Collection count

읽기 전용 확인:

```bash
curl -s http://localhost:6333/collections/tooldi_photos_v1
curl -s http://localhost:6333/collections/tooldi_graphics_v1

curl -s -X POST http://localhost:6333/collections/tooldi_photos_v1/points/count \
  -H 'Content-Type: application/json' \
  -d '{"exact":true}'

curl -s -X POST http://localhost:6333/collections/tooldi_graphics_v1/points/count \
  -H 'Content-Type: application/json' \
  -d '{"exact":true}'
```

최소 기준:

- `tooldi_photos_v1`: 1,000개 이상.
- `tooldi_graphics_v1`: 1,000개 이상.
- PoC 초기에는 각 300개 이상으로 개발 가능하지만, acceptance 는 1,000개 이상을 기준으로 한다.
- count 가 0이거나 collection 이 없으면 RAG smoke 를 실행하지 않는다.

### 3.2 Payload sample

읽기 전용 확인:

```bash
curl -s -X POST http://localhost:6333/collections/tooldi_photos_v1/points/scroll \
  -H 'Content-Type: application/json' \
  -d '{"limit":3,"with_payload":true,"with_vector":false}'

curl -s -X POST http://localhost:6333/collections/tooldi_graphics_v1/points/scroll \
  -H 'Content-Type: application/json' \
  -d '{"limit":3,"with_payload":true,"with_vector":false}'
```

필수 payload:

- 공통: `assetFamily`, `sourceSerial`, `sourceUid`, `bucket`, `s3Key`, `width`, `height`, `createdAt`, `modifiedAt`
- 사진(photo): `assetFamily: "photo"`, `type: "pic" | "rmbg"`, `orientation`
- 그래픽(graphic): `assetFamily: "graphic"`, `type: "vector" | "bitmap"`, `graphicKind` 또는 `category`
- 금지: `assetFamily: "template"` 가 Phase 6 컬렉션에 섞이면 실패다.

### 3.3 Sample query 결과

읽기 전용 검색 예:

```bash
uv run python search_images_in_qdrant.py '봄 꽃 배경 사진' \
  --collection tooldi_photos_v1 \
  --top-k 5

uv run python search_images_in_qdrant.py '딸기 캐릭터 일러스트' \
  --collection tooldi_graphics_v1 \
  --top-k 5
```

통과 기준:

- top-5 전부 payload 를 포함한다.
- 사진 쿼리는 photo 컬렉션에서만 나온다.
- 그래픽 쿼리는 graphic 컬렉션에서만 나온다.
- 결과의 `sourceSerial` 로 Catalog API 에서 같은 에셋을 찾을 수 있다.
- 결과 URL 또는 S3 key 가 실제 이미지로 열려야 한다.

---

## 4. 런타임 검증 기준

런타임 검증은 사용자의 자연어 요청이 Toolditor 에 보이는 실제 에셋으로 끝나는지 확인한다.

### 4.1 Smoke prompt 5개

1. `봄 세일 이벤트 배너 만들어줘`
2. `카페 신메뉴 딸기 라떼 배너 만들어줘`
3. `헬스장 신규 회원 모집 포스터 만들어줘`
4. `어린이 영어교실 홍보 배너 만들어줘`
5. `반려동물 미용샵 쿠폰 배너 만들어줘`

각 prompt 에서 확인할 것:

- HTML 에 `placeholder://` 이미지가 1개 이상 있다.
- 최종 Canvas Mutation envelope(`v6_apply_freeform_layout`)에는 unresolved 가 아닌 실제 Tooldi URL 이 들어간 bitmap/image 레이어가 있다.
- `metadata.src` 는 `placeholder://` 로 남지 않는다. 단, 실패한 레이어는 `metadata.unresolvedPlaceholder: true` 를 반드시 가진다.
- bounds, objectFit, borderRadius, opacity, transform 은 RAG 전후에 바뀌지 않는다.

### 4.2 Unresolved 비율

정의:

```text
unresolved 비율 = unresolvedPlaceholder 레이어 수 / 전체 placeholder 레이어 수
```

통과 기준:

- 5개 smoke 전체 합산 unresolved 비율 25% 이하.
- 5개 중 최소 4개 prompt 는 unresolved 비율 0% 또는 25% 이하.
- embedding/Qdrant/Catalog 장애가 있어도 run 전체는 실패하지 않고 unresolved marker 로 끝난다.

### 4.3 Latency

측정 구간:

- RAG stage 시작: placeholder detection 직후.
- RAG stage 종료: adapter 에 resolved metadata 주입 완료.

통과 기준:

- 1~3 placeholders 기준 RAG stage p50 1.0초 이하.
- p95 2.5초 이하.
- Phase 4 E2E p50 약 5.5초 기준, 총 runtime 증가가 20% 안쪽이면 양호하다.

---

## 5. Bench rubric

벤치는 사람이 결과를 보고 판단하는 품질과, 기계가 재는 속도/실패율을 같이 본다.

| 항목 | 측정 방법 | 통과 기준 |
| --- | --- | --- |
| top-1 manual review | 20개 prompt x 각 placeholder top-1 결과를 사람이 `good / acceptable / bad` 로 표시 | `good + acceptable` 80% 이상 |
| top-1 hard fail | 전혀 다른 주제, 깨진 URL, policy 위반, template 결과 | 10% 이하 |
| p50 latency | RAG stage 단독 시간 | 1.0초 이하 |
| p95 latency | RAG stage 단독 시간 | 2.5초 이하 |
| unresolved rate | 전체 placeholder 중 unresolved 비율 | 25% 이하 |
| transport failure rate | embedding/Qdrant/Catalog 호출 실패 비율 | 5% 이하 |
| determinism | 같은 index/version 으로 같은 prompt 3회 반복 | top-1 sourceSerial 동일 |

Manual review 기준:

- `good`: 힌트, 주변 텍스트, 디자인 의도와 잘 맞음.
- `acceptable`: 완벽하지 않지만 사용자가 바로 교체하지 않아도 되는 수준.
- `bad`: 의도와 다르거나, template/폰트/비에셋 결과거나, 실제로 렌더 불가.

벤치 산출물은 Phase 6 전용 경로에 둔다.

- 권장: `agent-workflow-test/bench/rag-phase6/`
- v5 벤치(`bench/method-compare-phase1/`) 산출물은 건드리지 않는다.

---

## 6. 레거시 재연결 방지 검증

Phase 6 구현은 v5 이전 template retrieval 을 다시 연결하면 실패다. 아래 명령은 구현 PR에서 필수로 돌린다.

```bash
rg -n "buildAssetPlan|buildSearchProfile|runRetrievalStage|candidateSearchers|assembleTemplateCandidates|selectTemplateComposition|selectTypography|buildTemplatePriorBundle|templatePriorVectorRecall|compositionEngine|buildAdaptiveCompositionDecision|projectTemplateGraph" \
  apps/agent-worker/src/graph apps/agent-worker/src/phases/v6* \
  --glob '!dist/**'
```

기준:

- 0 hits.
- 새 v6 asset resolver 가 위 모듈을 import 하면 실패.
- 단순 historical test 파일의 기존 존재는 별도 cleanup 대상이며 Phase 6 에서 삭제하지 않는다.

v6 자체 전환 잔재 확인:

```bash
rg -n "v5HtmlValidator|v5MethodBHtmlGen|v5MethodBSystemPrompt|v5PipelineOrchestrator|emitV5SkeletonMutations|v5Transpile|v5PipelineNode|V5PipelineDependencies|V5_APPLY_OPERATION" \
  agent-workflow-test/tooldi-agent-runtime \
  --glob '!dist/**'
```

기준:

- v6 SSOT 의 AC-V6-P6 과 같이 0 hits 가 최종 전환 완료 조건이다.

Qdrant payload 에 template 이 섞였는지 확인:

```bash
curl -s -X POST http://localhost:6333/collections/tooldi_photos_v1/points/scroll \
  -H 'Content-Type: application/json' \
  -d '{"limit":20,"with_payload":true,"with_vector":false}' | rg '"assetFamily":"template"|templateSerial|templateCode'

curl -s -X POST http://localhost:6333/collections/tooldi_graphics_v1/points/scroll \
  -H 'Content-Type: application/json' \
  -d '{"limit":20,"with_payload":true,"with_vector":false}' | rg '"assetFamily":"template"|templateSerial|templateCode'
```

기준:

- 0 hits.

---

## 7. 문서/핸드오프 산출물 흐름

권장 흐름:

1. 설계 문서(design)
   - 위치: `agent-workflow-test/docs/design/phase6-rag-assets/`
   - 이 문서와 병렬 설계 문서들이 Phase 6 의 결정 근거가 된다.
2. 구현 핸드오프(implementation handoff)
   - 위치 예: `agent-workflow-test/docs/archive/handoff/2026-XX-XX-agw-v6-phase6-implementation-handoff.md`
   - 포함할 것: 결정된 컬렉션 이름, sidecar 방식, resolver 파일 목록, test plan, bench plan.
3. SSOT 갱신(SSOT update)
   - 위치: `agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md`
   - 추가할 것: Phase 6 Asset Resolution 섹션, Stage 3 내부 sub-step, acceptance anchor.
4. 구현 PR
   - 구현은 SSOT 갱신과 implementation handoff 뒤에 시작한다.
   - PR 본문에 bench artifact 경로와 legacy rg 결과를 붙인다.

문서 권위:

- 철학과 금지 패턴은 v6 SSOT 가 이긴다.
- Phase 6 asset swap 상세는 Phase 6 design/handoff 가 이긴다.
- 코드 구현 중 새 결정이 생기면 먼저 design/handoff 를 업데이트하고, 원칙 변경이면 SSOT 를 먼저 업데이트한다.

---

## 8. 권장 acceptance checklist

- [ ] `tooldi_photos_v1`, `tooldi_graphics_v1` 컬렉션이 존재한다.
- [ ] 각 컬렉션 count 가 1,000개 이상이다.
- [ ] payload sample 에 `assetFamily: "template"` 이 없다.
- [ ] sample query top-5 가 photo/graphic family 안에서만 나온다.
- [ ] Qdrant 결과의 `sourceSerial` 을 Catalog API 로 다시 확인할 수 있다.
- [ ] 5개 smoke prompt 에서 placeholder 가 1개 이상 생성된다.
- [ ] 최종 `metadata.src` 가 실제 Tooldi URL 또는 `unresolvedPlaceholder: true` 로 끝난다.
- [ ] unresolved 비율이 25% 이하이다.
- [ ] RAG stage p50 1.0초 이하, p95 2.5초 이하이다.
- [ ] 20 prompt bench top-1 manual review 에서 `good + acceptable` 80% 이상이다.
- [ ] 레거시 retrieval 재연결 방지 `rg` 명령이 0 hits 다.
- [ ] `pnpm build`, `pnpm test` 가 `agent-workflow-test/tooldi-agent-runtime` 에서 통과한다.
- [ ] 실패 케이스도 run 전체 실패가 아니라 unresolved marker 로 끝난다.
- [ ] SSOT 에 Phase 6 Asset Resolution acceptance anchor 가 반영됐다.

---

## 9. 아직 확인할 질문

1. Phase 6 정식 컬렉션 이름을 `tooldi_photos_v1` / `tooldi_graphics_v1` 로 고정할지, 단일 컬렉션 + `assetFamily` filter 로 갈지 결정이 필요하다.
2. Python sidecar 는 검색 전용 endpoint(`/embed/text`)만 둘지, Qdrant search 까지 포함한 endpoint(`/resolve`)로 둘지 결정이 필요하다.
3. Catalog API 에서 Qdrant 후보를 sourceSerial 기준으로 단건 hydrate 하는 endpoint 가 있는지 확인해야 한다. 없으면 search 결과에서 page scan 을 해야 해서 느려질 수 있다.
4. paid/free 정책은 requester tier 를 어디서 받을지 확인해야 한다. `editorContext` 확장인지, backend run context 인지 아직 열려 있다.
5. 사진(photo)과 그래픽(graphic)의 초기 색인 범위 1k~5k 를 어떤 카테고리/정렬 기준으로 뽑을지 결정해야 한다.
6. unresolved fallback 의 실제 `src` 를 1x1 회색 이미지로 할지, Toolditor 기본 placeholder asset 으로 할지 FE와 맞춰야 한다.
7. vector graphic 의 원본 파일이 이미지 embedding 에 적합한 thumb 를 항상 갖는지 확인해야 한다.
8. AWS readonly + dev DB direct read 를 개발 색인에는 써도 되지만, 운영 배치에서는 어떤 네트워크/권한 경계로 승격할지 결정해야 한다.

---

## 10. 조사 근거

| 파일 경로 | 확인 내용 |
| --- | --- |
| `agent-workflow-test/AGENTS.md` | v6 SSOT 가 현재 authority 이고, v5 grammar/transpiler 경로는 폐기됐으며, v6 legacy rg 검증 힌트가 있다. |
| `agent-workflow-test/tooldi-agent-workflow-v6-layout-freedom-ssot.md` | v6 원칙(P1~P5), 3단계 파이프라인, AC-V6-P1~P8, Phase 4 smoke p50 약 5.5초, AC-V6-P6 legacy 0-hit 기준을 확인했다. |
| `agent-workflow-test/docs/archive/handoff/2026-04-21-agw-v6-phase6-rag-placeholder-swap-design-handoff.md` | Phase 6 는 `placeholder://힌트` 를 실제 Tooldi asset ID/S3 URL 로 바꾸는 설계이며, template 컬렉션 재사용과 legacy retrieval 재연결이 금지임을 확인했다. |
| `sandbox/embedding-test/README.md` | 현재 PoC 컬렉션은 `tooldi_real_asset_poc_v1`, `tooldi_real_asset_batch_v1` 이고, 소형 배치는 template 100 + bitmap shape 200 중심이라 Phase 6 acceptance 로 쓰면 안 됨을 확인했다. |
| `sandbox/embedding-test/AGENTS.md` | Python 실행은 `uv run`, Qdrant 는 Docker Compose, 작업 전 `docker compose ps` 확인이 원칙임을 확인했다. |
| `sandbox/embedding-test/docker-compose.yaml` | Qdrant 컨테이너 이름은 `qdrant`, 포트는 localhost `6333`/`6334` 임을 확인했다. |
| `sandbox/embedding-test/pyproject.toml` | `jinaai/jina-clip-v2` 실행에 필요한 Python 의존성, Qdrant client, FastAPI/uvicorn, boto3, PyMySQL 이 이미 포함되어 있음을 확인했다. |
| `agent-workflow-test/tooldi-agent-runtime/package.json` | 루트 검증은 `pnpm build`, `pnpm test`, `pnpm typecheck` 구조이며 `pnpm test` 는 build 후 workspace test 를 실행함을 확인했다. |
| `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/package.json` | agent-worker test 는 TypeScript build 후 `node --test dist/...` 파일을 직접 나열해 실행하는 구조임을 확인했다. |
| `agent-workflow-test/tooldi-agent-runtime/packages/tool-adapters/src/catalog/tooldiCatalogSourceTypes.ts` | `TooldiPhotoAsset`, `TooldiGraphicAsset`, photo/graphic search query 타입과 price/owner/type 필터를 확인했다. |
| `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6PrimitiveMapper.ts` | `placeholder://` 이미지는 현재 bitmap 으로 분류됨을 확인했다. |
| `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6CommandAdapter.ts` | 현재 image/bitmap metadata 가 `src`, `naturalWidth`, `naturalHeight`, `alt` 를 담아 Toolditor 로 전달됨을 확인했다. |
