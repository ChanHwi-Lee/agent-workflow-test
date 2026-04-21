# Phase 6 RAG Asset Indexing - Asset Data Sources

## 1. 목적과 범위

Phase 6의 목적은 LLM이 만든 이미지 자리표시자 힌트(`placeholder://`, `data-hint`)를 실제 Tooldi 사진/그래픽 에셋 URL로 바꾸기 위한 색인 구조를 정하는 것이다.

이번 색인은 템플릿 검색을 되살리는 작업이 아니다. 현재 `embedding-test`에는 템플릿 미리보기와 일부 shape PoC가 섞여 있지만, Phase 6 운영 색인의 주 대상은 새로 수집한 사진(`photo`, DB `picture`)과 그래픽(`graphic`, DB `default_shape`)이다. 템플릿(`template_upload`, `template_upload_inner`)은 제외한다.

범위 안:

- 사진 에셋 색인 후보 조사(`picture`)
- 그래픽 에셋 색인 후보 조사(`default_shape`)
- Catalog API, dev DB, S3 중 색인 배치 입력으로 쓸 소스 판단
- 썸네일/원본 중 임베딩에 쓸 이미지 선택 기준

범위 밖:

- 템플릿 RAG 복구
- 실제 색인 배치 구현
- Qdrant 운영 컬렉션 생성
- placeholder swap 런타임 구현

## 2. 데이터 소스 후보

### Catalog API

현재 agent runtime의 Tooldi catalog client는 그래픽 검색을 `/shape`, 사진 검색을 `/picture`로 보낸다(`TooldiApiCatalogSourceClient`). 응답은 이미 편집기에서 쓰기 쉬운 형태로 정규화된다.

- 그래픽 검색(`searchGraphicAssets`)은 `/shape`에 `keyword`, `type`, `price`, `sort`, `owner`, `theme`, `method`를 보낸다.
- 사진 검색(`searchPhotoAssets`)은 `/picture`에 `keyword`, `type`, `format`, `price`, `sort`, `owner`, `theme`, `source`를 보낸다.
- mapper는 공통 필드로 에셋 ID(`assetId`), 일련번호(`serial`), 소유자(`userSerial` -> `creatorSerial`), 키워드(`keywords` -> `keywordTokens`), 썸네일 URL(`thumbnail`), 원본 URL(`image`), 가격 타입(`priceType`), AI 여부(`isAi`)를 만든다.

장점:

- API가 이미 `thumbnail`, `image`, `uid`, 구매/가격 정책 일부를 계산해 준다.
- placeholder swap 런타임에서 "검색 결과를 바로 쓰는" 형태와 가장 가깝다.
- 필터 이름이 사용자가 기대하는 제품 검색 조건과 맞다. 예: 사진 타입(`type=pic/rmbg`), 그래픽 타입(`type=vector/bitmap`).

한계:

- 페이지 검색 API라 전체 backfill 원천으로는 불안정하다.
- 현재 worker adapter는 Tooldi API transport일 때 base URL host를 `localhost`로 제한한다. 즉 배치 서버에서 직접 원격 API를 때리는 구조는 현재 adapter 전제와 다르다.
- API 응답은 URL 중심이고 S3 key, ETag, content length 같은 증분 색인용 정보는 부족하다.
- 가격/구매 필드는 요청 사용자와 멤버십에 따라 달라질 수 있어, 운영 색인 payload의 source of truth로 쓰기 전에 "공용 색인 기준 가격"을 따로 정해야 한다.

판단: Catalog API는 런타임 hydration/검증용 보조 소스로 좋다. 대량 색인 배치의 1차 원천은 DB + S3가 더 낫다.

### dev DB 직접 조회

dev DB(`tooldi_dev`)에서 사진은 `picture`, 그래픽은 `default_shape`가 원천 후보로 확인됐다. 두 테이블 모두 승인/사용/삭제 상태와 파일명, 키워드, 가격, 소유자, 크기 정보를 갖고 있다.

기본 필터 후보:

```sql
screening = 'C'
AND is_use = 'Y'
AND rec_status IS NULL
AND thumb_file IS NOT NULL
```

API model은 여기에 캐시 안정화를 위해 `confirmed`, `modified`, `created`가 `getLastCacheTime()`보다 이전인지도 본다. 색인 배치도 운영 API 노출 상태와 맞추려면 같은 시간 지연 정책을 검토해야 한다.

dev DB에서 확인한 활성 후보 수:

- 사진(`picture`): `40,450`
- 그래픽 전체(`default_shape`): `1,099,294`
- 그래픽 중 bitmap 확장자(`.png`, `.jpg`, `.jpeg`): `689,417`

카테고리 단서:

- 사진은 현재 활성 샘플이 모두 사진 카테고리(`category.serial=31`, `category_table=picture`)였다.
- 그래픽은 비트맵 요소(`40`), 벡터 요소(`30`), 캘리그라피(`76`), 아이콘(`38`), 도형(`2`), 워드아트(`49`), 폰트추천(`77`), 조합 텍스트(`48`), 프레임(`41`) 등이 섞여 있다.

판단: DB 직접 조회는 대량 backfill과 증분 sync의 1차 원천으로 권장한다. Catalog API와 같은 필터/카테고리 의미를 맞추는 검증이 필요하다.

### S3 path/payload

S3는 임베딩 이미지 bytes와 최종 삽입 URL의 원천이다. dev에서 확인한 bucket은 `dev-file.tooldi.com`이고, `embedding-test` PoC도 기본 bucket으로 이를 사용한다.

PHP helper 기준 경로 규칙:

- 사진: `picture/{serial % 100}/{filename}`
- 그래픽: `shape/{serial % 100}/{filename}`

예:

- 사진 썸네일 key: `picture/30/186230_thumb.png`
- 사진 원본 key: `picture/30/186230.jpg`
- 그래픽 벡터 썸네일 key: `shape/95/1732795_thumb.png`
- 그래픽 벡터 원본 key: `shape/95/1732795.json`
- 그래픽 bitmap 원본 key: `shape/18/1567518.png`

S3 `head-object`로 content type, size, ETag, last modified를 읽을 수 있었다. 색인 payload에는 DB row의 `modified`뿐 아니라 S3 `ETag`/`LastModified`도 넣는 편이 증분 재색인 판단에 유리하다.

판단: 색인 배치는 DB에서 후보 row를 고르고, S3에서 썸네일/원본 head 및 필요한 image bytes를 읽는 구조가 가장 단순하다.

## 3. photo asset에 필요한 필드

사진은 실제 이미지 레이어 후보다. 쉬운 말로는 "사진 한 장을 찾고, 어디서 불러오며, 쓸 수 있는지 판단할 최소 정보"가 필요하다.

권장 payload:

- 고유 번호(`serial`): `picture.serial`
- 에셋 ID(`assetId`): `photo:{serial}`
- 편집기 uid(`uid`): API는 `category_serial + "_" + serial`을 암호화해 만든다. DB만으로 재현할지, swap 시 API hydration으로 받을지 결정 필요
- 소유자(`owner`, `user_serial`, `user_type`, `username`): 가격/저작권/필터용
- 가격(`price_type`, `price`): DB는 `F/P`, API mapper는 `free/paid`로 정규화
- 사진 타입(`type`): 제품 필터는 `pic/rmbg`; DB에는 별도 컬럼이 없고 현재 API는 배경제거 키워드(`배경제거`)로 rmbg를 가른다
- 카테고리(`category_serial`, `category_name`): 보통 `31/사진`
- 파일 형식(`extension`, `file_type`): 예 `.jpg`, `image/jpeg`
- 크기(`width`, `height`): 방향과 배치 적합도 계산
- 방향(`orientation`): `width/height`로 `portrait/landscape/square` 산출
- 썸네일 URL 또는 key(`thumbnailUrl`, `thumbKey`, `thumb_file`)
- 원본 URL 또는 key(`originUrl`, `originKey`, `saved_filename`)
- 키워드(`keyword`, `keywords`, `keywordTokens`): `|:|` 구분자를 배열로 정규화
- AI 여부(`is_ai`, `isAi`)
- 상태(`screening`, `is_use`, `rec_status`)
- 시간(`created`, `modified`, `confirmed`)
- S3 검증값(`bucket`, `etag`, `contentType`, `contentLength`, `lastModified`)

사진의 검색 텍스트에는 최소한 키워드, 카테고리명, 파일 타입, 방향, 배경제거 여부를 넣는다. 예: "사진, 봄, 꽃, 가로형, 배경제거 아님".

## 4. graphic asset에 필요한 필드

그래픽은 장식/아이콘/일러스트/프레임/비트맵 요소 후보다. 쉬운 말로는 "이미지처럼 보이지만 편집기에 넣을 때 vector/bitmap 처리가 달라질 수 있는 요소"다.

권장 payload:

- 고유 번호(`serial`): `default_shape.serial`
- 에셋 ID(`assetId`): `graphic:{serial}`
- 편집기 uid(`uid`): API는 `category_serial + "_" + serial` 암호화값을 내려준다
- 그래픽 타입(`type`): 검색 필터는 `vector/bitmap`
- 그래픽 종류(`graphicKind`): category 기준으로 `bitmap`, `illust`, `icon`, `calligraphy`, `frame`, `figure`, `wordart`, `font_text`, `mix_text`, `unknown`
- 카테고리(`category_serial`, `category_name`, `category_name_en`)
- 확장자/파일 타입(`extension`, `file_type`): 예 `.png`, `.json`, `image/svg+xml`
- 소유자(`owner`, `user_serial`, `user_type`, `username`)
- 가격(`price_type`, `price`)
- 크기(`width`, `height`): vector 계열은 0 또는 작은 값일 수 있어 신뢰도 플래그 필요
- 썸네일 URL 또는 key(`thumbnailUrl`, `thumbKey`, `thumb_file`)
- 원본 URL 또는 key(`originUrl`, `originKey`, `saved_filename`)
- 키워드(`keyword`, `keywords`, `keywordTokens`)
- AI 여부(`is_ai`, `isAi`)
- 좌표/해시 보조값(`is_coordinate`, `is_hash`, `hash_data`): vector/shape 후처리에서 필요할 수 있으나 Phase 6 색인 최소값은 아님
- 상태(`screening`, `is_use`, `rec_status`)
- 시간(`created`, `modified`, `confirmed`)
- S3 검증값(`bucket`, `etag`, `contentType`, `contentLength`, `lastModified`)

그래픽의 검색 텍스트에는 키워드, 카테고리명, 그래픽 종류, vector/bitmap 여부를 넣는다. 예: "그래픽, 비트맵 요소, 딸기, 과일, png".

## 5. S3 접근/이미지 선택

임베딩 입력은 기본적으로 썸네일(`thumb_file`)을 권장한다.

이유:

- 모든 타입에서 이미지로 열기 쉽다.
- vector 원본은 `.json`일 수 있어 CLIP 입력으로 바로 쓸 수 없다.
- 원본 사진은 크고 비용이 높다.
- 편집기 목록에서 사용자가 보는 대표 이미지와 검색 임베딩이 가까워진다.

단, 최종 swap payload에는 원본(`saved_filename`)도 반드시 남긴다. 실제 편집기에 넣을 URL은 썸네일이 아니라 원본이 필요할 수 있다.

주의점:

- 투명 PNG는 배경이 투명하면 CLIP 입력에서 보이는 내용이 약해질 수 있다. 현재 PoC는 `PIL.Image.convert("RGB")`로 알파를 버리므로, 운영 배치에서는 흰 배경/체커보드/밝은 배경 합성 중 하나를 명시해야 한다.
- 벡터 그래픽은 원본이 `.json`이고 썸네일이 `.png`인 경우가 많다. 검색 임베딩은 썸네일로 만들고, 삽입은 원본 JSON/SVG 처리 경로를 따로 태워야 한다.
- 비트맵 그래픽은 원본 PNG가 투명도를 가질 수 있다. 검색에는 썸네일, 최종 삽입에는 원본 PNG를 쓰는 분리가 안전하다.
- 썸네일이 너무 작거나 여백이 큰 요소는 검색 품질이 떨어질 수 있다. 이런 경우 원본 bitmap을 일정 크기로 리사이즈해서 보조 벡터를 만드는 옵션을 열어둔다.
- dev 검증은 `AWS_PROFILE=readonly`로 `dev-file.tooldi.com` head/read가 가능했다. 운영 bucket/profile은 별도 확인이 필요하다.

## 6. 권장 결정과 아직 확인할 질문

권장 결정:

- Phase 6 운영 색인은 template을 제외하고 `photo`/`graphic` 컬렉션을 새로 만든다.
- 1차 데이터 원천은 dev/live DB 직접 조회 + S3 read다.
- Catalog API는 backfill 원천이 아니라 런타임 결과 형태 검증과 hydration 후보로 둔다.
- 임베딩 이미지는 기본 썸네일을 사용하고, payload에는 썸네일과 원본 key/URL을 모두 저장한다.
- Qdrant payload의 공통 ID는 `photo:{serial}`, `graphic:{serial}`로 둔다.
- 가격은 DB 원값(`F/P`, `price`)과 검색용 정규값(`free/paid`)을 둘 다 저장한다.
- 배경제거 사진은 별도 컬럼이 아니라 `type=rmbg` 필터/키워드(`배경제거`) 기반 추정으로 시작하되, 제품팀 확인 전에는 hard guarantee로 쓰지 않는다.
- 그래픽 vector/bitmap은 API 필터 이름(`type=vector/bitmap`)과 DB category/extension 매핑을 함께 저장한다.

아직 확인할 질문:

- 운영 색인은 dev DB로 먼저 만들지, live DB snapshot으로 만들지?
- live S3 bucket 이름과 read-only profile은 dev와 같은 규칙으로 접근 가능한가?
- `uid`는 색인 배치에서 암호화 재현까지 해야 하나, 아니면 swap 직전 Catalog API/contents API로 hydrate할 것인가?
- `priceType`은 비로그인/일반회원/Pro 회원 중 어느 관점의 값을 색인 payload에 저장해야 하나?
- 사진 `rmbg` 판정은 키워드 `배경제거`로 충분한가, 별도 category 또는 처리 이력 테이블이 있는가?
- 그래픽 vector 원본 `.json`을 편집기에 삽입할 때 필요한 payload는 `saved_filename` URL만으로 충분한가, 아니면 JSON 내부 구조 일부도 색인 payload에 필요할까?
- S3 썸네일이 없는 row를 제외할지, 원본으로 썸네일을 대체할지?
- 증분 색인은 DB `modified/confirmed` 기준으로 할지, S3 `ETag/LastModified`까지 함께 볼지?

## 7. 조사 근거

읽은 파일:

- `AGENTS.md`: 이 workspace는 문서/조정용이며 실제 코드는 linked repo에서 확인한다는 지침 확인
- `agent-workflow-test/AGENTS.md`: v6 SSOT가 현재 authority이고 Phase 6 placeholder asset catalog가 별도 미정 영역임을 확인
- `embedding-test/AGENTS.md`: embedding sandbox는 `uv`, Qdrant, read-only 원본 보존 규칙을 따른다는 지침 확인
- `embedding-test/README.md`: 현재 PoC가 `tooldi_real_asset_poc_v1`, `tooldi_real_asset_batch_v1`에 template/shape 중심으로 적재됐고, AWS `readonly`, dev DB read-only query를 쓴다는 점 확인
- `embedding-test/embed_real_assets_poc.py`: DB row -> S3 key -> bytes -> PIL -> CLIP -> Qdrant payload 흐름과 `shape/{serial%100}`, template key 계산 확인
- `agent-workflow-test/tooldi-agent-runtime/packages/tool-adapters/src/catalog/tooldiCatalogSourceTypes.ts`: photo/graphic query type과 normalized asset field 확인
- `agent-workflow-test/tooldi-agent-runtime/packages/tool-adapters/src/catalog/tooldiCatalogSourceClient.ts`: `/shape`, `/picture` Catalog API 호출 확인
- `agent-workflow-test/tooldi-agent-runtime/packages/tool-adapters/src/catalog/tooldiCatalogAssetMapper.ts`: API row를 `graphic:{serial}`, `photo:{serial}`, `thumbnailUrl`, `originUrl`, `priceType`, `orientation`, `graphicKind`로 정규화하는 규칙 확인
- `agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/tools/adapters/tooldiCatalogSourceAdapter.ts`: real Tooldi API mode가 `TOOLDI_CONTENT_API_BASE_URL`와 localhost host 제한을 갖는 점 확인
- `platform/pages/api/picture.ts`, `platform/pages/api/shape.ts`: platform API wrapper의 `/picture`, `/shape` request parameter 확인
- `TOOLDi_API_PHP/application/models/Picture_model.php`: `picture` 목록 조회 필드, 기본 category `31/33`, keyword/theme/rmbg 필터 확인
- `TOOLDi_API_PHP/application/models/Shape_model.php`: `default_shape` 목록 조회 필드, 기본 category 후보, keyword/theme 필터 확인
- `TOOLDi_API_PHP/application/controllers/Editor.php`: API 응답에서 `thumbnail`, `image`, `uid`, `priceType`를 만드는 방식 확인
- `TOOLDi_API_PHP/application/helpers/common_function_helper.php`: `get_s3_folder()`의 `shape/picture/{serial % 100}` 경로 규칙 확인

실행한 읽기 전용 명령/쿼리 요약:

- `obsidian-memory recall "Phase 6 RAG placeholder asset indexing Tooldi photo graphic" --vault-root /mnt/c/Users/USER/Documents/work-vault --json`: promoted memory 후보를 확인했지만 직접적인 Phase 6 asset indexing 결정 기록은 발견하지 못함
- `rg -n "catalog|Catalog|photo|graphic|asset|placeholder|RAG|embedding|qdrant" ...`: 관련 adapter, PoC, placeholder 문서 위치 확인
- MariaDB schema: `picture`, `default_shape`, `category` 테이블 구조 확인
- MariaDB count: active `picture` 40,450건, active `default_shape` 1,099,294건, bitmap-like shape 689,417건 확인
- MariaDB sample: 최신 active `picture` 5건과 `default_shape` 5건의 `serial`, `category_serial`, `saved_filename`, `thumb_file`, `keyword`, `width`, `height`, `price_type`, `price`, `is_ai` 확인
- MariaDB category: `31`, `30`, `40`, `38`, `76`, `41`, `49`, `77`, `48`, `2`, `3`, `32`, `50`, `39` 카테고리명 확인
- AWS read-only head: `AWS_PROFILE=readonly aws s3api head-object --bucket dev-file.tooldi.com --key picture/30/186230_thumb.png`
- AWS read-only head: `AWS_PROFILE=readonly aws s3api head-object --bucket dev-file.tooldi.com --key picture/30/186230.jpg`
- AWS read-only head: `AWS_PROFILE=readonly aws s3api head-object --bucket dev-file.tooldi.com --key shape/95/1732795_thumb.png`
- AWS read-only head: `AWS_PROFILE=readonly aws s3api head-object --bucket dev-file.tooldi.com --key shape/95/1732795.json`
- AWS read-only head: `AWS_PROFILE=readonly aws s3api head-object --bucket dev-file.tooldi.com --key shape/18/1567518.png`
