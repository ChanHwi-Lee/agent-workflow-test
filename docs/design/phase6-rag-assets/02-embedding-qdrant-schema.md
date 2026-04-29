# Phase 6 RAG Asset Embedding / Qdrant Schema

**Status**: Design note (sections 1–9) + Finalized schema (section 0, authoritative).  
**Scope**: `placeholder://<hint>` 를 실제 Tooldi photo/graphic asset URL 로 바꾸기 위한 embedding, indexing, Qdrant collection 설계.  
**Non-scope**: template 검색 부활, template RAG 재연결, 기존 v1~v5 retrieval chain 재사용.

Phase 6 의 목표는 LLM 이 만든 `placeholder://봄꽃 배경` 같은 힌트를 실제 Tooldi asset 으로 바꾸는 것이다. 여기서 asset 은 template 이 아니라 photo(Picture 계열)와 graphic(Shape 계열)이다.

---

## 0. Finalized Photo Payload Schema (authoritative — 2026-04-29)

이 섹션은 1,024 → 5,000 photos 확장 직전 확정된 authority 문서다.  
아래 결정들은 SSOT 이며, 구현과 불일치 시 이 섹션이 우선한다.

### 0.1 Confirmed Decisions

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| `colorPalette` 필드 | **제거** — payload에 포함하지 않는다 | 코드베이스 전체 검색 결과 consumer 없음 — dead code |
| `isPremium` 필드 | **추가** — `price_type == 'P'` 이면 `true` | 런타임 policy filter 용 bool, MariaDB 재조회 불필요 |
| `thumbnailUrl` 필드 | **추가** — full CDN URL 저장 | display-complete: Qdrant hit만으로 썸네일 렌더 가능 |
| `thumbnailUrl` 포맷 | `{S3_DOCUMENT_ROOT}/picture/{serial%100}/{thumb_file}` | prod: `https://file.tooldi.com`, dev: `https://dev-file.tooldi.com` |
| `file.tooldi.com` 성격 | CloudFront (S3 CDN wrapper) — 이미 CDN URL | presign 불필요, 만료 없음, payload에 직접 저장 안전 |
| Model | `jinaai/jina-clip-v2`, `truncate_dim=512`, cosine, L2-normalized | PoC 검증 완료, 모델 변경 시 전체 reindex 필요 |
| Point ID | `uuid5(NAMESPACE_URL, "photo:{serial}")` | stable, collision-free, serial 로 역산 가능 |
| `priceType` 값 | `"free"` / `"paid"` / `null` | `price_type_raw` (`F`/`P`) 도 병행 보관 |

### 0.2 Qdrant Collection Configuration

```python
# photos collection
client.create_collection(
    collection_name="tooldi_photos_v1",
    vectors_config=models.VectorParams(
        size=512,
        distance=models.Distance.COSINE,
    ),
    on_disk_payload=True,
)
```

| 항목 | 값 |
| --- | --- |
| collection name | `tooldi_photos_v1` |
| vector name | unnamed (single vector) — named vector `clip_512` 는 차기 버전에서 |
| vector size | `512` |
| distance | `Cosine` |
| normalization | L2 (encode 후 반드시 적용) |
| on_disk_payload | `true` |
| model | `jinaai/jina-clip-v2` |

### 0.3 Qdrant Payload Index Declarations

런타임 filter 성능을 위해 아래 필드에 payload index 를 선언한다.  
`upsert` 전에 `create_payload_index` 로 생성해야 한다.

```python
from qdrant_client.http.models import PayloadSchemaType

indexes = [
    ("isPremium",       PayloadSchemaType.BOOL),
    ("priceType",       PayloadSchemaType.KEYWORD),
    ("categorySerial",  PayloadSchemaType.INTEGER),
    ("isUse",           PayloadSchemaType.KEYWORD),
    ("screening",       PayloadSchemaType.KEYWORD),
    ("assetFamily",     PayloadSchemaType.KEYWORD),
    ("photoType",       PayloadSchemaType.KEYWORD),
    ("ownerUid",        PayloadSchemaType.INTEGER),
    ("isAi",            PayloadSchemaType.BOOL),
]
for field, schema_type in indexes:
    client.create_payload_index(
        collection_name="tooldi_photos_v1",
        field_name=field,
        field_schema=schema_type,
    )
```

### 0.4 Final JSON Payload Example

아래는 실제 Tooldi photo row 기준 realistic 예시다 (serial=1230581).

```json
{
  "assetFamily": "photo",
  "sourceKind": "picture",
  "sourceSerial": 1230581,
  "sourceUid": "photo:1230581",
  "tooldiAssetId": "photo:1230581",
  "logicalPointId": "photo:1230581",

  "thumbnailUrl": "https://file.tooldi.com/picture/81/1230581_thumb.jpg",
  "bucket": "file.tooldi.com",
  "s3Key": "picture/81/1230581_thumb.jpg",
  "thumbKey": "picture/81/1230581_thumb.jpg",
  "originKey": "picture/81/1230581.jpg",
  "filename": "1230581_thumb.jpg",
  "path": "s3://file.tooldi.com/picture/81/1230581_thumb.jpg",
  "originPath": "s3://file.tooldi.com/picture/81/1230581.jpg",

  "etag": "a3f2c1d8e4b7f9012345678abcde9012",
  "contentType": "image/jpeg",
  "contentLength": 84320,
  "lastModified": "2024-11-15T03:22:41+00:00",

  "naturalWidth": 900,
  "naturalHeight": 600,
  "width": 900,
  "height": 600,
  "aspectRatio": 1.5,
  "orientation": "landscape",

  "categorySerial": 12,
  "categoryName": "자연/풍경",
  "categoryNameEn": "Nature/Landscape",

  "keywords": ["봄", "꽃", "벚꽃", "배경"],

  "screening": "C",
  "isUse": "Y",
  "recStatus": null,

  "priceType": "free",
  "priceTypeRaw": "F",
  "isPremium": false,
  "price": 0,

  "ownerUid": 10042,
  "userSerial": 10042,
  "userType": "U",
  "teamSerial": null,

  "isAi": false,
  "photoType": "pic",
  "pictureName": "봄 벚꽃 배경",
  "extension": ".jpg",
  "fileType": "pic",

  "createdAt": "2024-03-10T09:14:22",
  "modifiedAt": "2024-11-15T03:22:41",
  "confirmedAt": "2024-03-10T09:20:00",
  "dbSavedFilename": "1230581.jpg",
  "dbOrgFilename": "spring_cherry_blossom.jpg",

  "imageMode": "RGB",
  "imageWidth": 900,
  "imageHeight": 600,

  "modelVersion": "jinaai/jina-clip-v2",
  "truncateDim": 512,
  "embeddingVersion": "jina-clip-v2:512:l2:v1",
  "collectionVersion": "tooldi_photos_v1",
  "indexedBy": "embed_phase6_assets_poc.py"
}
```

### 0.5 Field Table

| field | type | source | nullable | Qdrant indexed | notes |
| --- | --- | --- | --- | --- | --- |
| `assetFamily` | keyword | constant | no | YES | 항상 `"photo"` (collection 방어 확인용) |
| `sourceKind` | keyword | constant | no | no | 항상 `"picture"` |
| `sourceSerial` | integer | `picture.serial` | no | no | DB primary key |
| `sourceUid` | keyword | derived | no | no | `"photo:{serial}"` |
| `tooldiAssetId` | keyword | derived | no | no | agent-worker 가 참조하는 stable ID |
| `logicalPointId` | keyword | derived | no | no | Point ID 계산용 기준 문자열 |
| `thumbnailUrl` | keyword | derived | no | no | CDN URL — display-complete |
| `bucket` | keyword | env | no | no | `file.tooldi.com` (prod) / `dev-file.tooldi.com` (dev) |
| `s3Key` | keyword | derived | no | no | `picture/{serial%100}/{thumb_file}` |
| `thumbKey` | keyword | derived | no | no | `s3Key` 와 동일 |
| `originKey` | keyword | derived | YES | no | `saved_filename` 없으면 null |
| `filename` | keyword | `picture.thumb_file` | no | no | |
| `path` | keyword | derived | no | no | `s3://{bucket}/{thumbKey}` |
| `originPath` | keyword | derived | YES | no | |
| `etag` | keyword | S3 response | YES | no | 이미지 변경 감지 |
| `contentType` | keyword | S3 response | YES | no | |
| `contentLength` | integer | S3 response | YES | no | bytes |
| `lastModified` | keyword | S3 response | YES | no | ISO8601 |
| `naturalWidth` | integer | `picture.width` | YES | no | DB 값 (DB가 NULL이면 null) |
| `naturalHeight` | integer | `picture.height` | YES | no | |
| `width` | integer | `picture.width` | YES | no | `naturalWidth` 와 동일 |
| `height` | integer | `picture.height` | YES | no | |
| `aspectRatio` | float | derived | YES | no | `width/height` |
| `orientation` | keyword | derived | YES | no | `landscape` / `portrait` / `square` |
| `categorySerial` | integer | `picture.category_serial` | YES | YES | 카테고리 filter |
| `categoryName` | keyword | `category.category_name` | YES | no | 표시용 |
| `categoryNameEn` | keyword | `category.category_name_en` | YES | no | 표시용 |
| `keywords` | keyword[] | `picture.keyword` split | no | no | `\|:\|` 구분자 split |
| `screening` | keyword | `picture.screening` | YES | YES | 인덱싱 품질 필터. `'C'` 만 색인 |
| `isUse` | keyword | `picture.is_use` | YES | YES | `'Y'` 만 색인 |
| `recStatus` | keyword | `picture.rec_status` | YES | no | `NULL` 만 색인 |
| `priceType` | keyword | derived | YES | YES | `"free"` / `"paid"` / null |
| `priceTypeRaw` | keyword | `picture.price_type` | YES | no | `"F"` / `"P"` 원본 |
| `isPremium` | bool | derived | no | YES | `price_type == 'P'` |
| `price` | float | `picture.price` | YES | no | Decimal→float 변환 |
| `ownerUid` | integer | `picture.user_serial` | YES | YES | 권한 filter |
| `userSerial` | integer | `picture.user_serial` | YES | no | `ownerUid` 와 동일 |
| `userType` | keyword | `picture.user_type` | YES | no | |
| `teamSerial` | integer | `picture.team_serial` | YES | no | |
| `isAi` | bool | `picture.is_ai == 'Y'` | no | YES | AI 생성 여부 |
| `photoType` | keyword | derived | no | YES | `"rmbg"` (배경제거) / `"pic"` |
| `pictureName` | keyword | `picture.picture_name` | YES | no | |
| `extension` | keyword | `picture.extension` | YES | no | |
| `fileType` | keyword | `picture.file_type` | YES | no | |
| `createdAt` | keyword | `picture.created` | YES | no | ISO8601 |
| `modifiedAt` | keyword | `picture.modified` | YES | no | ISO8601 |
| `confirmedAt` | keyword | `picture.confirmed` | YES | no | ISO8601 |
| `dbSavedFilename` | keyword | `picture.saved_filename` | YES | no | |
| `dbOrgFilename` | keyword | `picture.org_filename` | YES | no | |
| `imageMode` | keyword | PIL.Image.mode | no | no | 색인 시 실제 PIL 모드 |
| `imageWidth` | integer | PIL.Image.width | no | no | thumb 실제 크기 |
| `imageHeight` | integer | PIL.Image.height | no | no | |
| `modelVersion` | keyword | constant | no | no | `jinaai/jina-clip-v2` |
| `truncateDim` | integer | constant | no | no | `512` |
| `embeddingVersion` | keyword | derived | no | no | `jina-clip-v2:512:l2:v1` |
| `collectionVersion` | keyword | constant | no | no | `tooldi_photos_v1` |
| `indexedBy` | keyword | constant | no | no | script 식별용 |

### 0.6 Fields Sufficient for Display + Filter WITHOUT MariaDB Lookup

런타임 agent-worker가 Qdrant hit만으로 처리 가능한 필드 집합.

| 목적 | 사용 필드 |
| --- | --- |
| 썸네일 렌더 | `thumbnailUrl` (CDN URL, 만료 없음) |
| Asset 식별 | `tooldiAssetId`, `sourceSerial` |
| 정책 필터 (free/paid) | `isPremium`, `priceType` |
| 카테고리 필터 | `categorySerial`, `categoryName` |
| 품질 확인 | `screening`, `isUse`, `recStatus` |
| AI 생성 여부 | `isAi` |
| 배경제거 여부 | `photoType` == `"rmbg"` |
| 화면비/방향 | `aspectRatio`, `orientation` |
| 소유자 권한 | `ownerUid` |
| 키워드 표시 | `keywords` |
| 임베딩 메타 검증 | `modelVersion`, `truncateDim`, `embeddingVersion` |

### 0.7 Fields That Still Need MariaDB for Enrichment (Lazy-Load Only)

Qdrant payload에는 없거나 갱신이 필요해 DB 조회가 필요한 정보.

| 정보 | 이유 |
| --- | --- |
| 원본 full-size URL (originKey → presign) | S3 presign이 필요하거나 원본 사용 시점에 발급 |
| 다운로드 카운트, 좋아요 수 | 실시간 집계, payload에 캐시하지 않음 |
| 상세 가격 정책 (할인, 쿠폰) | 런타임 계산, Qdrant 에 저장 불가 |
| 사용자 plan 기반 접근 가능 여부 | user plan은 payload에 없음, 런타임 체크 |
| 라이선스/저작권 상세 | 법적 상세는 DB SSOT |
| 카테고리 계층 (부모/자식) | category join 필요 |

### 0.8 Delta from PoC `common_payload()` — Required Changes

`embed_phase6_assets_poc.py` 의 `common_payload()` 와 `build_photo_record()` 에 적용해야 하는 변경 사항.

#### 추가할 필드

```python
# common_payload() 반환값에 추가
"isPremium": row.get("price_type") == "P",
"thumbnailUrl": f"{s3_document_root}/picture/{source_serial % 100}/{row['thumb_file']}",
```

`s3_document_root` 는 환경별로 주입:
- prod: `https://file.tooldi.com`
- dev: `https://dev-file.tooldi.com`

`--s3-document-root` CLI 인자 또는 `S3_DOCUMENT_ROOT` 환경변수로 받도록 수정 권장.

#### 제거할 필드 (있으면)

- `colorPalette` — consumer 없는 dead field, 추가하지 않는다.

#### Payload Index 선언 추가

`ensure_collection()` 이후, `index_family()` 시작 전에 아래 호출 추가:

```python
from qdrant_client.http.models import PayloadSchemaType

def ensure_payload_indexes(client: QdrantClient, collection_name: str) -> None:
    indexes = [
        ("isPremium",      PayloadSchemaType.BOOL),
        ("priceType",      PayloadSchemaType.KEYWORD),
        ("categorySerial", PayloadSchemaType.INTEGER),
        ("isUse",          PayloadSchemaType.KEYWORD),
        ("screening",      PayloadSchemaType.KEYWORD),
        ("assetFamily",    PayloadSchemaType.KEYWORD),
        ("photoType",      PayloadSchemaType.KEYWORD),
        ("ownerUid",       PayloadSchemaType.INTEGER),
        ("isAi",           PayloadSchemaType.BOOL),
    ]
    for field, schema_type in indexes:
        client.create_payload_index(
            collection_name=collection_name,
            field_name=field,
            field_schema=schema_type,
        )
```

#### `common_payload()` 전체 delta 요약

| 변경 | 상세 |
| --- | --- |
| 추가 | `isPremium: bool` — `row["price_type"] == "P"` |
| 추가 | `thumbnailUrl: str` — CDN full URL |
| 제거 | `colorPalette` — 절대 추가하지 않음 |
| 추가 | `ensure_payload_indexes()` 함수 및 호출 |
| 추가 | `--s3-document-root` / `S3_DOCUMENT_ROOT` 주입 경로 |

---

## 1. 현재 embedding-test의 의미: template 레거시와 재사용 가능한 실행 경험

`embedding-test` 는 두 가지 성격이 섞여 있다.

첫째, `template_embedding_service.py` 는 R1 template vector recall 용 local sidecar 다. 이 파일은 `template_preview_embeddings_v1` 컬렉션을 대상으로 `/search` 를 제공하고, 결과도 `templateCode`, `templateSerial`, `innerSerial`, `thumbnailUrl` 중심이다. 이 경로는 Phase 6 에서 재사용하지 않는다. Phase 6 는 template 후보를 찾는 작업이 아니고, placeholder bitmap 을 실제 photo/graphic 으로 바꾸는 작업이다.

둘째, `embed_real_assets_poc.py` 와 `search_images_in_qdrant.py` 는 실행 경험으로 재사용할 가치가 있다. 여기에는 dev DB metadata 조회, S3 image fetch, `bytes -> PIL.Image -> encode_image`, Qdrant collection 생성/upsert, text query 검색, payload filter 같은 실제 운영에 가까운 흐름이 있다.

현재 Qdrant 에 들어 있는 데이터는 그대로 믿으면 안 된다. README 기준으로 검증된 컬렉션은 `tooldi_real_asset_poc_v1`, `tooldi_real_asset_batch_v1` 이며, 샘플에는 template preview 와 bitmap shape 이 섞여 있다. 사용자가 전제로 둔 것처럼 대부분/전부가 template RAG 레거시 데이터일 수 있으므로, Phase 6 에서는 기존 collection 을 production source 로 승격하지 않는다. 필요한 것은 새 photo/graphic catalog 를 다시 색인하는 구조다.

재사용할 것:

- `jinaai/jina-clip-v2` 로 image/text 를 같은 512차원 공간에 넣는 방식.
- image fetch 를 디스크 저장 없이 `S3 bytes -> PIL.Image.convert("RGB")` 로 처리하는 방식.
- batch encode 후 Qdrant `upsert(wait=True)` 하는 방식.
- `assetFamily` 같은 payload field 로 family filter 를 거는 방식.
- `uv`, Docker Qdrant, Python sidecar 실행 경험.

버릴 것:

- `template_preview_embeddings_v1` 와 template 전용 `/search` 응답 shape.
- `templateCode`, `templateSerial`, `innerSerial` 중심 ranking 계약.
- 기존 Qdrant data 를 Phase 6 index 로 간주하는 판단.
- template preview 를 photo/graphic 대체재로 쓰는 shortcut.

## 2. embedding 모델 선택: jina-clip-v2 유지 이유, 이미지 임베딩/텍스트 임베딩 흐름

권장 모델은 `jinaai/jina-clip-v2` 유지다.

이유:

- 이미 `embedding-test` 에서 image encoder 와 text encoder 모두 검증했다.
- 이미지와 텍스트를 같은 벡터 공간(서로 비교 가능한 숫자 배열)에 넣을 수 있다.
- `truncate_dim=512` 로 Qdrant 에 저장하고 검색하는 흐름이 PoC 에 있다.
- 한국어 query 예시인 `봄 꽃 포스터`, `딸기 캐릭터 과일` 로 최소 검색 검증을 했다.
- Phase 6 는 모델 연구가 아니라 placeholder swap 구조를 닫는 단계다. 모델을 바꾸면 index 를 다시 만들고 품질 기준도 다시 잡아야 한다.

색인 시 이미지 흐름:

```text
Tooldi DB metadata
-> S3 thumbnail/image bytes
-> PIL.Image RGB
-> jina-clip-v2 encode_image(truncate_dim=512)
-> L2 normalize(벡터 길이를 1로 맞춤)
-> Qdrant upsert
```

런타임 검색 시 텍스트 흐름:

```text
placeholder hint + nearby text + canvas theme
-> jina-clip-v2 encode_text(truncate_dim=512)
-> L2 normalize
-> Qdrant top-k search
-> policy/catalog check
-> top-1 asset 선택
```

`search_images_in_qdrant.py` 는 `encode_text(..., task="retrieval.query", truncate_dim=512)` 를 사용한다. Phase 6 runtime text encoder 도 이쪽에 맞추는 것이 좋다. 다만 `template_embedding_service.py` 는 `task` 없이 encode 하므로, 구현 전에는 같은 query 로 두 방식의 top-k 차이를 한 번 확인해야 한다.

## 3. sidecar 형태: /embed/text, /embed/image 또는 indexing-only encoder와 runtime text encoder 분리

권장 구조는 "색인용 image encoder" 와 "런타임 text encoder" 를 역할로 분리하되, 같은 Python sidecar 코드베이스와 같은 모델 버전을 쓰는 것이다.

초기 설계:

- indexing job: `/embed/image` 또는 CLI batch path 를 사용한다.
- runtime agent-worker: `/embed/text` 만 호출한다.
- Qdrant query 는 agent-worker 가 직접 하거나 sidecar 가 하지 않는다. sidecar 는 embedding 계산만 책임지는 편이 경계가 단순하다.

권장 endpoint:

```text
GET /health
POST /embed/text
  input:  { "texts": ["봄꽃 배경"], "modelVersion": "jinaai/jina-clip-v2", "truncateDim": 512 }
  output: { "vectors": [[...512 floats]], "modelVersion": "...", "truncateDim": 512 }

POST /embed/image
  input:  multipart image files 또는 s3 object reference batch
  output: { "vectors": [[...512 floats]], "modelVersion": "...", "truncateDim": 512 }
```

운영 관점에서는 `/embed/image` 를 runtime sidecar 에 꼭 열 필요가 없다. 이미지 색인은 offline batch 에서만 돌려도 된다. Phase 6 최소 구현은 다음 둘 중 하나면 충분하다.

| 선택 | 설명 | 판단 |
| --- | --- | --- |
| A. sidecar 에 `/embed/text` 만 제공, image encode 는 indexing CLI 에서 수행 | runtime 표면이 작다. 이미지 색인은 배치 전용이다. | Phase 6 초기 권장 |
| B. sidecar 에 `/embed/text`, `/embed/image` 둘 다 제공 | API 는 통일된다. 하지만 runtime 프로세스에 불필요한 image upload 경로가 열린다. | 대량 운영 전까지 보류 |

중요한 점은 모델 프로세스를 매 placeholder 마다 새로 띄우지 않는 것이다. `template_embedding_service.py` 처럼 startup 때 모델을 1회 load 하고 요청마다 encode 해야 한다.

## 4. Qdrant 컬렉션 설계: photos_v1, graphics_v1 분리 여부, 벡터 차원, distance, payload 필드

권장 결정은 `photos_v1` 와 `graphics_v1` 분리다. 실제 배포 이름은 prefix 를 붙여 `tooldi_photos_v1`, `tooldi_graphics_v1` 로 둘 수 있지만, 논리 collection 은 둘로 나눈다.

분리 이유:

- photo 와 graphic 은 catalog source, type, 정책 필드가 다르다.
- Phase 6 family classifier 가 먼저 `photo | graphic` 을 고른 뒤 해당 collection 만 검색하면 query filter 가 단순하다.
- photo 검색 품질과 graphic 검색 품질을 따로 측정하고 rebuild 할 수 있다.
- template collection 과 섞일 위험을 줄인다.

공통 vector 설정:

| 항목 | 값 |
| --- | --- |
| vector size | `512` |
| distance | `Cosine` |
| vector name | `clip_512` 권장 |
| model | `jinaai/jina-clip-v2` |
| normalize | yes, encode 후 L2 normalize |
| on_disk_payload | yes |

기존 PoC 는 단일 unnamed vector collection 을 만들고, template sidecar 는 named vector `image_clip_512` 를 조회한다. Phase 6 는 새 collection 이므로 named vector `clip_512` 로 맞추는 것을 권장한다. 이름을 두면 나중에 `clip_768` 또는 다른 모델을 병행 검증할 때 schema 충돌이 적다. 단, 구현 스레드가 단순성을 우선하면 unnamed vector 도 가능하다. 이 경우 collection version 으로 모델 변경을 관리해야 한다.

공통 payload 필드:

| field | 예 | 설명 |
| --- | --- | --- |
| `assetFamily` | `photo`, `graphic` | collection 과 같은 값. 방어적 확인용 |
| `sourceKind` | `picture`, `shape_bitmap`, `shape_vector` | 원본 종류 |
| `sourceSerial` | `1528532` | Tooldi DB serial |
| `tooldiAssetId` | `photo:123`, `graphic:456` | agent-worker 가 쓰는 안정 ID |
| `catalogMode` | `tooldi_api_direct` | 어떤 catalog source 기준인지 |
| `bucket` | `dev-file.tooldi.com` | 원본 bucket |
| `s3Key` | `shape/32/1528532_thumb.png` | 원본 key |
| `thumbKey` | `..._thumb.png` | 검색용 이미지 key |
| `assetUrl` | optional | signed URL 은 payload 에 저장하지 않는 것을 권장 |
| `filename` | `1528532_thumb.png` | 파일명 |
| `etag` | S3 ETag | 이미지 변경 감지 |
| `contentType` | `image/png` | fetch 확인 |
| `contentLength` | number | fetch 확인 |
| `naturalWidth` | number | 원본 또는 thumb width |
| `naturalHeight` | number | 원본 또는 thumb height |
| `aspectRatio` | number | width / height |
| `categorySerial` | number | category filter 용 |
| `categoryName` | string | review 출력용 |
| `keywords` | string[] | DB keyword split 결과 |
| `screening` | `C` | 승인 상태 |
| `isUse` | `Y` | 사용 여부 |
| `recStatus` | null | 삭제/비활성 확인 |
| `priceType` | `free`, `paid`, null | policy filter 용 |
| `ownerUid` | string/null | 권한 filter 용 |
| `createdAt` | ISO string | 정렬/감사 |
| `modifiedAt` | ISO string | rebuild 판단 |
| `indexedAt` | ISO string | 색인 시각 |
| `modelVersion` | `jinaai/jina-clip-v2` | 결정성 기록 |
| `truncateDim` | `512` | 결정성 기록 |
| `embeddingVersion` | `jina-clip-v2:512:l2:v1` | 내부 버전 |
| `collectionVersion` | `photos_v1` | index version |
| `sourceHash` | `etag` 또는 content hash | 이미지 변경 감지 |

`photos_v1` 추가 payload:

| field | 예 | 설명 |
| --- | --- | --- |
| `photoType` | `pic`, `rmbg` | Picture type |
| `subjectHint` | optional | 배치 후처리로 붙일 수 있는 짧은 설명. Phase 6 필수 아님 |

`graphics_v1` 추가 payload:

| field | 예 | 설명 |
| --- | --- | --- |
| `graphicType` | `bitmap`, `vector` | Shape type |
| `extension` | `.png`, `.svg` | 렌더 가능성 확인 |
| `shapeName` | string | review 출력용 |
| `subType` | optional | icon, sticker 등. hard contract 로 쓰지 않는다 |

payload 에 signed URL 을 저장하지 않는 편이 좋다. signed URL 은 만료되므로 Qdrant payload 는 source 식별자만 들고, runtime 에서 catalog/storage adapter 가 fresh URL 을 발급해야 한다.

## 5. 색인 배치 흐름: fetch metadata -> fetch image -> encode image -> upsert -> verify

색인은 runtime 요청 중에 하지 않는다. offline batch 로 만든다.

권장 흐름:

```text
1. fetch metadata
   - Tooldi catalog/API 또는 read-only DB 에서 active photo/graphic 목록 조회
   - screening/is_use/rec_status 정책을 먼저 적용

2. fetch image
   - S3 thumb 또는 preview image 를 가져온다
   - PIL.Image.open(bytes).convert("RGB")
   - width/height/contentType/etag 를 payload 에 기록

3. encode image
   - jina-clip-v2 encode_image(batch_size=32 등)
   - truncate_dim=512
   - L2 normalize

4. upsert
   - stable point id 사용: uuid5("photo:<serial>") 또는 uuid5("graphic:<serial>:<variant>")
   - collection: photos_v1 또는 graphics_v1
   - vector: clip_512
   - payload: source 식별자 + 정책/품질 필드

5. verify
   - collection count 확인
   - 실패 row 수와 사유 출력
   - sample query top-k 를 사람이 본다
```

배치 입력 source 는 Phase 6 설계에서 두 단계로 나눈다.

- PoC: dev DB read-only + S3 readonly 로 가능한 넓은 active/free 후보를 색인하되, 현재는 추가 임베딩 없이 이미 적재된 photo 1,024개 / graphic 1,000개 범위만 사용한다. 주제별로 인위적으로 고른 pool은 쓰지 않는다.
- 운영: catalog/export 또는 운영 배치 source 로 색인. production runtime 에 dev DB 직접 조회를 넣지 않는다.

POC 필터:

- `screening='C'`
- `is_use='Y'`
- `rec_status IS NULL`
- `thumb_file IS NOT NULL`
- 기본은 `price_type='F'`
- `keyword`/이름에 명백한 `test`, `테스트`가 있는 row 제외

이 필터는 smoke prompt를 맞추기 위한 주제 샘플링이 아니라, 실제로 넣기 어려운 후보를 제거하는 품질 필터다. 품질 판단은 전체 후보에서 Qdrant top-N과 reranker가 고르는 결과로 본다.

대량 색인은 별도 결정이 필요하다. family별 2,000개 초과 색인은 S3 read, GPU 시간, Qdrant write 비용이 있으므로 `ALLOW_LARGE_RUN=true` 같은 명시 승인 없이는 실행하지 않는다.

이미지 fetch 실패는 전체 배치를 멈추지 않고 row 단위 실패로 기록한다. 단, 실패율이 임계값을 넘으면 batch 를 실패로 본다. 예: 전체의 5% 초과 실패, 또는 특정 category 20% 초과 실패.

## 6. 결정성/버전관리: model version, collection version, rebuild trigger

Phase 6 의 결정성은 "같은 hint + 같은 context + 같은 model + 같은 collection" 이면 같은 top-1 이 나오는 수준으로 정의한다.

버전으로 고정할 값:

| 항목 | 권장 값/형식 |
| --- | --- |
| `modelVersion` | `jinaai/jina-clip-v2` |
| `transformersVersion` | `4.51.3` 등 실행 환경 값 |
| `torchVersion` | `2.5.1+cu124` 등 실행 환경 값 |
| `truncateDim` | `512` |
| `normalization` | `l2` |
| `distance` | `cosine` |
| `collectionVersion` | `photos_v1`, `graphics_v1` |
| `embeddingVersion` | `jina-clip-v2:512:l2:v1` |
| `indexBuildId` | timestamp 또는 git sha |

rebuild trigger:

- embedding model 변경.
- `truncateDim`, normalize 방식, distance 변경.
- image source 가 thumb 에서 원본/다른 preview 로 바뀜.
- payload policy field 의미 변경. 예: `priceType`, `ownerUid`, `isUse` 기준 변경.
- source image 의 `etag` 또는 content hash 변경.
- catalog 에서 대량 asset 추가/삭제가 발생.
- sample query manual review 가 기준 미달.

collection 은 in-place 덮어쓰기보다 새 version 을 만들고 alias 를 옮기는 방식을 권장한다.

```text
photos_v1_build_20260421 -> 검증 통과 -> alias photos_v1
graphics_v1_build_20260421 -> 검증 통과 -> alias graphics_v1
```

Qdrant alias 사용 여부는 구현 시 확인이 필요하다. alias 를 쓰지 않더라도 `photos_v2` 같은 새 collection 을 만든 뒤 runtime 설정을 바꾸는 방식이면 된다.

## 7. 실패/품질 점검: count, sample query, top-k manual review

색인 검증은 "정상 종료" 만으로 충분하지 않다. 검색 품질을 사람 눈으로 확인해야 한다.

필수 점검:

- count: 예상 row 수와 Qdrant point count 비교.
- missing image: metadata 는 있는데 S3 image fetch 실패한 row 수.
- invalid image: PIL 로 열 수 없는 row 수.
- duplicate point id: 같은 sourceSerial 이 덮어써진 수.
- vector dimension: collection size 512 와 query vector 512 일치 확인.
- payload sample: top-k 출력에서 `sourceSerial`, `s3Key`, `categoryName`, `naturalWidth`, `naturalHeight`, `modelVersion` 확인.

sample query set 예시:

| family | query |
| --- | --- |
| photo | `봄 꽃 배경 사진` |
| photo | `카페 음료 사진` |
| photo | `아이와 가족 행사 이미지` |
| graphic | `딸기 캐릭터 일러스트` |
| graphic | `할인 스티커 아이콘` |
| graphic | `꽃 장식 그래픽` |

manual review 기준:

- top-1 이 명백히 맞으면 pass.
- top-3 안에 쓸 만한 asset 이 있으면 weak pass.
- top-5 가 모두 엉뚱하면 fail.
- photo query 에 graphic 이 나오거나 graphic query 에 photo 가 나오면 family classifier 또는 collection routing 을 다시 본다.
- 정책 필터 후 후보가 0개가 되는 query 는 fallback 동작까지 확인한다.

runtime 실패 처리:

- embedding sidecar timeout: unresolved placeholder 로 둔다.
- Qdrant 장애: unresolved placeholder 로 둔다.
- Qdrant 후보 0개: unresolved placeholder 로 둔다.
- catalog fetch 실패: 다음 후보를 시도하고, 모두 실패하면 unresolved 로 둔다.
- policy filter 후 후보 0개: unresolved 로 둔다.

실패해도 run 전체를 fail 하지 않는다. bitmap command 에 `metadata.unresolvedPlaceholder: true` 와 `unresolveReason` 을 남긴다.

## 8. 권장 결정과 아직 확인할 질문

권장 결정:

- `jinaai/jina-clip-v2`, `truncate_dim=512`, cosine distance 를 유지한다.
- `photos_v1`, `graphics_v1` 를 분리한다.
- Phase 6 index 는 새로 만든다. 기존 template collection 또는 `tooldi_real_asset_batch_v1` 을 production source 로 쓰지 않는다.
- sidecar 는 우선 `/embed/text` 중심으로 둔다. image embedding 은 offline indexing CLI 에 둔다.
- Qdrant payload 에 signed URL 을 저장하지 않는다. sourceSerial/s3Key 를 저장하고 runtime 에서 fresh URL 을 발급한다.
- rebuild 는 수동 trigger + 새 collection version 방식으로 시작한다.

아직 확인할 질문:

- Tooldi photo source 의 authoritative API/DB field 는 무엇인가. Picture::index 의 serial/type/price/owner/URL 필드명을 확인해야 한다.
- Shape 중 vector graphic 은 어떤 preview image 로 embedding 할 것인가. SVG 자체인지, rasterized thumb 인지 결정이 필요하다.
- `photos_v1` / `graphics_v1` 의 실제 운영 이름에 `tooldi_` prefix 를 붙일 것인가.
- Qdrant named vector `clip_512` 를 쓸 것인가, PoC 처럼 unnamed vector 를 쓸 것인가.
- runtime Qdrant query 를 agent-worker 가 직접 할 것인가, sidecar 가 `/search` 까지 맡을 것인가.
- policy filter 의 정확한 기준은 무엇인가. free/paid, owner, user plan, hidden category 기준이 필요하다.
- sample query review 의 pass 기준을 몇 개 query, 몇 % pass 로 둘 것인가.
- Qdrant alias 를 운영 환경에서 사용할 수 있는지 확인해야 한다.

## 9. 조사 근거: 파일 경로와 확인 내용

- `/home/ubuntu/github/tooldi/tws-editor-api/AGENTS.md`
  - 현재 루트는 문서/조정용 워크스페이스이며, Qdrant 관련 작업은 `embedding-test` 심링크를 보라고 되어 있다.

- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/AGENTS.md`
  - v6 SSOT 가 현재 design lock 이며, Phase 6 는 v6 원칙을 따라야 한다.

- `/home/ubuntu/github/tooldi/tws-editor-api/embedding-test/AGENTS.md`
  - `embedding-test` 는 Qdrant + CLIP sandbox 이고, `uv run`, Docker Qdrant, `run_*.sh` 실행 규칙을 가진다.

- `/home/ubuntu/github/tooldi/tws-editor-api/embedding-test/README.md`
  - 모델은 `jinaai/jina-clip-v2`, 벡터 차원은 512, Qdrant 는 local Docker 를 사용한다.
  - 검증 collection 은 `tooldi_real_asset_poc_v1`, `tooldi_real_asset_batch_v1` 이다.
  - 샘플은 template preview 와 bitmap shape 이 섞여 있으며, 300건 소형 배치 검증이 있다.
  - payload 예시로 `assetFamily`, `logicalPointId`, `serial`, `bucket`, `s3Key`, `etag`, `width`, `height`, `keywords` 등이 정리되어 있다.

- `/home/ubuntu/github/tooldi/tws-editor-api/embedding-test/template_embedding_service.py`
  - FastAPI sidecar 로 모델을 startup 에 1회 load 한다.
  - `encode_text` 후 Qdrant 에 검색한다.
  - collection 기본값은 `template_preview_embeddings_v1`, vector name 은 `image_clip_512` 이다.
  - 응답 shape 는 template recall 전용이므로 Phase 6 에 그대로 쓰면 안 된다.

- `/home/ubuntu/github/tooldi/tws-editor-api/embedding-test/embed_real_assets_poc.py`
  - dev DB 에서 template/shape metadata 를 조회하고 S3 key 를 만든다.
  - S3 object 를 bytes 로 읽어 `PIL.Image` 로 열고 `encode_image` 한다.
  - `truncate_dim=512`, cosine collection, `on_disk_payload=True`, `upsert(wait=True)` 흐름이 있다.
  - payload 구성과 stable point id(`uuid5`) 방식은 Phase 6 색인 설계에 재사용할 수 있다.

- `/home/ubuntu/github/tooldi/tws-editor-api/embedding-test/search_images_in_qdrant.py`
  - text query 를 `encode_text(..., task="retrieval.query")` 로 512차원 벡터화한다.
  - collection dimension 호환성 확인, `assetFamily` filter, top-k 출력이 있다.
  - Phase 6 sample query/manual review 도 이 구조를 확장하면 된다.

- `/home/ubuntu/github/tooldi/tws-editor-api/embedding-test/pyproject.toml`
  - Python 3.12, `qdrant-client`, `transformers==4.51.3`, `torch==2.5.1+cu124`, `pillow`, `boto3`, `pymysql`, `fastapi`, `uvicorn` 조합이다.

- `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/archive/handoff/2026-04-21-agw-v6-phase6-rag-placeholder-swap-design-handoff.md`
  - Phase 6 는 `placeholder://<hint>` 를 실제 Tooldi asset ID + S3 URL 로 바꾸는 단계다.
  - template collection 은 Phase 6 범위가 아니고, photo/graphic collection 이 대상이다.
  - RAG 실패는 run fail 이 아니라 `unresolvedPlaceholder` marker 로 degrade 한다.
