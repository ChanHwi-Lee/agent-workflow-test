# Phase 6 RAG Assets - Reference Index

**Status**: 조사/설계 참조 문서. 구현하지 않는다.

이 폴더는 Phase 6에서 `placeholder://힌트`를 실제 Tooldi 사진/그래픽 에셋으로 바꾸기 위한 기준 자료다.

가장 중요한 전제:

- 현재 `embedding-test`에 남아 있는 색인 데이터는 template RAG 레거시 성격이 강하다.
- Phase 6는 template 검색을 되살리지 않는다.
- Phase 6는 Tooldi 사진(`picture`)과 그래픽(`default_shape`)을 새로 색인한다.
- 런타임에서는 이미 정해진 bitmap 위치와 스타일을 바꾸지 않고 `src`와 에셋 metadata만 바꾼다.

## 읽는 순서

1. [01-asset-data-sources.md](./01-asset-data-sources.md)
   - 사진/그래픽 원천 데이터, DB/API/S3 경로, 필요한 payload 필드를 정리한다.
2. [02-embedding-qdrant-schema.md](./02-embedding-qdrant-schema.md)
   - `jina-clip-v2`, Python sidecar, Qdrant 컬렉션과 payload 구조를 정리한다.
3. [03-runtime-placeholder-swap.md](./03-runtime-placeholder-swap.md)
   - v6 runtime 안에서 placeholder를 찾고 실제 에셋으로 바꾸는 위치와 흐름을 정리한다.
4. [04-ops-bench-acceptance.md](./04-ops-bench-acceptance.md)
   - 개발자가 재현할 순서, smoke/bench 기준, legacy 재연결 방지 검증을 정리한다.

## 현재 권장 결정

| 주제 | 권장 방향 |
| --- | --- |
| 색인 대상 | template 제외. photo/graphic 신규 색인 |
| 1차 데이터 원천 | DB + S3 read. Catalog API는 runtime 확인/hydration 후보 |
| 임베딩 모델 | `jinaai/jina-clip-v2`, 512차원 유지 |
| 임베딩 입력 | 기본은 썸네일 이미지. 원본 URL/key는 payload에 보존 |
| Qdrant 구조 | `tooldi_photos_v1`, `tooldi_graphics_v1` 분리 |
| POC 색인 범위 | 주제별 pool 없음. active/free/thumbnail/test 제외 필터로 가능한 넓게 색인 |
| Runtime 위치 | `v6PipelineNode.ts`에서 `runV6Pipeline()` 이후, `adaptV6Commands()` 이전 |
| Resolver 책임 | bitmap `src`와 에셋 metadata만 교체. bounds/style 변경 없음 |
| 실패 처리 | run fail이 아니라 `unresolvedPlaceholder: true` |
| 레거시 경계 | v5 retrieval/template prior 계열 import 금지 |

## POC 진입점

`embedding-test`에 Phase 6 전용 POC 스크립트를 추가했다. 이 경로는 template을 읽지 않는다.

- 색인: `/home/ubuntu/github/tooldi/sandbox/embedding-test/embed_phase6_assets_poc.py`
- 검색: `/home/ubuntu/github/tooldi/sandbox/embedding-test/search_phase6_assets.py`
- 실행 래퍼:
  - `/home/ubuntu/github/tooldi/sandbox/embedding-test/run_embed_phase6_assets_poc.sh`
  - `/home/ubuntu/github/tooldi/sandbox/embedding-test/run_search_phase6_assets.sh`
- 텍스트 임베딩 endpoint:
  - `/home/ubuntu/github/tooldi/sandbox/embedding-test/template_embedding_service.py`
  - `POST /embed/text`
  - template `/search`는 Phase 6 runtime에서 쓰지 않는다.

검증된 작은 샘플:

- `tooldi_photos_v1`: photo 3개 upsert, search 동작 확인
- `tooldi_graphics_v1`: graphic 3개 upsert, search 동작 확인
- Qdrant payload에서 template 관련 필드 0 hits 확인
- CPU 실행은 현재 `jina-clip-v2`/xformers 조합에서 실패했다. 로컬 POC는 `DEVICE=cuda`로 실행한다.

1,000개 색인 확인:

- `tooldi_photos_v1`: 1,024 points
- `tooldi_graphics_v1`: 1,000 points
- `봄 꽃 배경 사진` 검색: 꽃/봄/배경 사진이 top-k 상위
- `할인 스티커 아이콘` 검색: 세일 스티커 그래픽이 top-k 상위

이 결과는 POC 기준의 검색 가능성 확인이다. 최종 품질 판단은 v6 smoke prompt와 Toolditor 렌더까지 연결해서 본다.

POC 확장 결정:

- 주제별로 인위적으로 고른 asset pool은 쓰지 않는다.
- 전체 후보에서 실제 검색하는 방향으로 간다.
- 다만 POC 안정성을 위해 `screening='C'`, `is_use='Y'`, `rec_status IS NULL`, `thumb_file IS NOT NULL`, 기본 `price_type='F'`, `test/테스트` 제외 필터를 둔다.
- 현재 POC는 추가 임베딩 없이 `tooldi_photos_v1` 1,024개, `tooldi_graphics_v1` 1,000개 범위만 사용한다.
- 전체 색인 또는 2,000개 초과 대량 색인은 S3 read, GPU 시간, Qdrant write 비용이 있으므로 별도 명시 결정 후에만 실행한다.

현재 runtime 적용 상태:

- `agent-worker`에 `v6AssetResolver` POC를 연결했다.
- 위치는 `runV6Pipeline()` 직후, `adaptV6Commands()` 직전이다.
- resolver는 `bitmap + placeholder://`만 대상으로 삼는다.
- Qdrant top-40 후보 중 최대 6개를 Gemini vision reranker에 넘기고, 선택된 후보의 URL로 `src`만 교체한다.
- photo는 origin URL을 쓰고, graphic vector/json은 Toolditor 렌더를 위해 thumbnail PNG URL을 우선 사용한다.
- smoke에서 `placeholder://봄 꽃 배경 사진`이 `https://dev-file.tooldi.com/picture/49/182949.jpeg`로 교체되는 것을 확인했다.

## 다음 설계에서 닫아야 할 질문

1. 운영 색인은 dev DB 샘플부터 시작할지, live snapshot/export를 기준으로 할지.
2. Catalog API에 `sourceSerial` 기준 단건 확인 경로가 있는지.
3. 사용자의 유료/무료 에셋 권한을 request에 어떤 필드로 넣을지.
4. vector graphic 원본이 `.json`일 때 최종 Toolditor 삽입에 URL 외 어떤 payload가 필요한지.
5. fallback `src`를 data URL, Toolditor 기본 placeholder, 또는 다른 안전 이미지로 둘지.
6. Qdrant named vector와 alias를 운영에서 쓸 수 있는지.

## 구현 전 체크

- 이 폴더의 네 문서를 읽고 결정을 확정한다.
- Phase 6 implementation handoff를 별도로 작성한다.
- v6 SSOT에 Phase 6 Asset Resolution 섹션을 추가한다.
- 구현 PR에서는 `template` 컬렉션을 acceptance 근거로 쓰지 않는다.
