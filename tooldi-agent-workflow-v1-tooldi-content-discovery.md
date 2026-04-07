# Tooldi Content Discovery for Template Agent v1

## 목적

이 문서는 `toolditor`와 `tooldi_dev` MariaDB의 실제 데이터를 기준으로, 템플릿 생성 에이전트가 의미 있는 동작을 하기 위해 알아야 하는 콘텐츠 소스와 실행 seam을 정리한다.

범위:

- 실제 콘텐츠 재고
- 프론트엔드 검색/삽입 경로
- PHP API와 DB 테이블 매핑
- 에이전트 플로우가 필요로 하는 정보 구조
- 현재 바로 쓸 수 있는 것과 아직 부족한 것

비범위:

- LLM / retrieval / RAG 구현
- live DB 쓰기
- 실제 에이전트 로직 구현

future semantic retrieval / embedding / hybrid retrieval 확장 checklist 는 [tooldi-agent-workflow-v1-semantic-retrieval-checklist.md](/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-workflow-v1-semantic-retrieval-checklist.md) 에 분리해 둔다.

## 조사 소스

- `toolditor`
- `TOOLDi_API_PHP`
- MariaDB `tooldi_dev`

## source-of-truth lock

- real Tooldi catalog adapter 의 정식 source-of-truth 는 기존 Tooldi PHP content API 로 고정한다.
- MariaDB 는 inventory 확인, field schema 검증, 샘플링 검증 용도로만 사용한다.
- local runtime host 는 `localhost` 로 고정한다. `127.0.0.1` 은 Tooldi PHP 의 local host/session/cookie policy 와 어긋나므로 v1 real source activation host 로 쓰지 않는다.
- 즉 worker 는 이후 `get_background_contents`, `get_shapes`, `get_pictures`, `loadFont` 같은 API seam 을 호출하고, DB 직접 조회는 v1 runtime path 에 넣지 않는다.

주요 코드 파일:

- 프론트 검색 API: [content.ts](/home/ubuntu/github/tooldi/toolditor/src/apis/content.ts)
- 프론트 로우 API: [editor.ts](/home/ubuntu/github/tooldi/toolditor/src/apis/editor.ts)
- 오브젝트 삽입: [addObject.ts](/home/ubuntu/github/tooldi/toolditor/src/functions/elements/common/addObject.ts)
- 배경 삽입: [addBackground.ts](/home/ubuntu/github/tooldi/toolditor/src/functions/elements/common/addBackground.ts)
- 템플릿 로드: [loadTemplate.tsx](/home/ubuntu/github/tooldi/toolditor/src/util/template/loadTemplate.tsx)
- QR/Barcode draft contract: [qrBarcodeContracts.ts](/home/ubuntu/github/tooldi/toolditor/src/features/qrBarcode/model/qrBarcodeContracts.ts)
- PHP controller: [Editor.php](/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Editor.php)
- PHP model: [Editor_model.php](/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/models/Editor_model.php)

## 실제 콘텐츠 재고

MariaDB `tooldi_dev` 기준 active inventory:

| content | total | active |
| --- | ---: | ---: |
| background | 740 | 491 |
| picture | 185,571 | 40,453 |
| default_shape | 1,567,096 | 1,099,292 |
| template_upload | 70,531 | 39,241 |

active 기준 조건:

- `screening='C'`
- `is_use='Y'`
- `rec_status IS NULL`

### Shape category 분포

active `default_shape` 상위 카테고리:

| category_serial | category_name_en | count |
| --- | --- | ---: |
| 40 | `bitmap` | 682,928 |
| 30 | `illust` | 402,066 |
| 76 | `calligraphy` | 11,514 |
| 50 | `special_character` | 1,111 |
| 38 | `icon` | 528 |
| 2 | `rect` | 465 |
| 49 | `wordart` | 254 |
| 77 | `font_text` | 135 |
| 48 | `mix_text` | 122 |
| 41 | `frame` | 85 |
| 3 | `line` | 78 |

### Background category 분포

active `background`:

| category_serial | category_name_en | count |
| --- | --- | ---: |
| 33 | `image` | 353 |
| 32 | `pattern` | 138 |

### Picture 재고

active `picture`는 모두 category `31 / picutre`로 들어간다.

AI / 가격 분포:

| is_ai | price_type | count |
| --- | --- | ---: |
| Y | F | 5,278 |
| Y | P | 3,797 |
| N | F | 25,660 |
| N | P | 5,718 |

### Template size 상위 분포

active `template_upload` 상위 size:

| size_serial | size_name | width x height | count |
| --- | --- | --- | ---: |
| 5 | 소셜미디어 게시물 | 1080 x 1080 | 12,324 |
| 8 | 소셜미디어 세로 | 1080 x 1350 | 4,683 |
| 6 | 소셜미디어 스토리 | 1080 x 1920 | 1,344 |
| 1 | 유튜브 썸네일 | 1280 x 720 | 1,311 |
| 7 | 소셜미디어 광고 | 1200 x 628 | 551 |

에이전트 vertical slice에서 자주 다루는 preset 대응:

- square: `size_serial=5`
- story: `size_serial=6`
- wide ad: `size_serial=7`
- portrait social: `size_serial=8`

### `봄` 키워드 active 재고

`LOCATE('봄', keyword) > 0` 기준:

| content | count |
| --- | ---: |
| background | 7 |
| picture | 1,941 |
| default_shape | 44,291 |
| template_upload | 1,880 |

의미:

- 봄 seasonal intent는 실제 데이터 기반 vertical slice가 가능하다.
- 특히 `shape(bitmap/illust/calligraphy)` 쪽 봄 재고가 매우 많다.
- `background`는 봄 전용 재고가 적어, 배경은 키워드 직접 매칭보다 `pattern/color fallback`이 더 중요하다.

## 실제 카테고리 taxonomy

`category` 테이블 기준 주요 카테고리:

| serial | category_name_en | category_table | 의미 |
| --- | --- | --- | --- |
| 2 | `rect` | `default_shape` | 기본 도형 |
| 3 | `line` | `default_shape` | 선 |
| 30 | `illust` | `default_shape` | 벡터 요소 |
| 38 | `icon` | `default_shape` | 아이콘 |
| 40 | `bitmap` | `default_shape` | 비트맵 요소 |
| 41 | `frame` | `default_shape` | 프레임 |
| 49 | `wordart` | `default_shape` | 워드아트 |
| 50 | `special_character` | `default_shape` | 특수문자 |
| 76 | `calligraphy` | `default_shape` | 캘리그라피 |
| 77 | `font_text` | `default_shape` | 폰트추천 |
| 31 | `picutre` | `picture` | 사진 |
| 32 | `pattern` | `background` | 패턴 배경 |
| 33 | `image` | `background` | 이미지 배경 |

중요한 점:

- DB/legacy API에서는 오타 포함 `picutre`가 실제 값이다.
- shape 안에서도 `illust`, `bitmap`, `icon`, `calligraphy`, `frame`, `wordart`가 분리된다.
- background는 `pattern`과 `image`가 구조적으로 다르다.

## 프론트엔드에서 실제로 쓰는 seam

### 1. Template

검색:

- `POST /editor/get_templates`

핵심 파라미터:

- `canvas`
- `price`
- `follow`
- `categorySerial`
- `keyword`
- `page`

상세/적용:

- `GET /editor/get_template_pages`
- `GET /editor/get_template_data`
- `GET /editor/get_template_single_data`

실제 적용 seam:

- [loadTemplate.tsx](/home/ubuntu/github/tooldi/toolditor/src/util/template/loadTemplate.tsx)

### 2. Background

검색:

- `POST /editor/get_background_contents`

핵심 파라미터:

- `type: 'pattern' | 'image'`
- `keyword`
- `page`

실제 적용 seam:

- [addBackground.ts](/home/ubuntu/github/tooldi/toolditor/src/functions/elements/common/addBackground.ts)

중요:

- background는 object insert가 아니라 page state mutation이다.
- 결과는 `backgroundType`, `background`, `backgroundPattern`, `backgroundUid`를 바꾼다.

### 3. Picture

검색:

- `POST /editor/get_pictures`
- `GET /editor/get_initial_pictures`
- 외부 보조: `GET /api/pixabay`

핵심 파라미터:

- `orientation`
- `price`
- `follow`
- `backgroundRemoval`
- `keyword`
- `page`
- `isAI`

실제 적용 seam:

- [addObject.ts](/home/ubuntu/github/tooldi/toolditor/src/functions/elements/common/addObject.ts)

로우 로드:

- `POST /editor/loadPicture`

### 4. Shape

검색:

- `GET /editor/get_shapes`
- `GET /editor/get_initial_shapes`

핵심 파라미터:

- `type`
- `format`
- `price`
- `follow`
- `keyword`
- `page`
- `categoryName`
- `isAI`

실제 적용 seam:

- [addObject.ts](/home/ubuntu/github/tooldi/toolditor/src/functions/elements/common/addObject.ts)

로우 로드:

- `POST /editor/loadObject`

중요:

- shape는 `svg`, `json`, `bitmap(.png/.jpg/.jpeg)`가 모두 섞여 있다.
- `type='element'` 로드 후에 실제 fabric/group/image object로 변환된다.

### 5. QR / Barcode

검색형 콘텐츠가 아니다.

- 생성은 client-side
- draft contract는 [qrBarcodeContracts.ts](/home/ubuntu/github/tooldi/toolditor/src/features/qrBarcode/model/qrBarcodeContracts.ts)
- render는 [qrBarcodeRenderer.ts](/home/ubuntu/github/tooldi/toolditor/src/features/qrBarcode/lib/qrBarcodeRenderer.ts)
- object factory는 [qrBarcodeObject.ts](/home/ubuntu/github/tooldi/toolditor/src/features/qrBarcode/model/qrBarcodeObject.ts)

즉 QR/Barcode는 DB에서 후보를 고르는 문제가 아니라:

- draft 생성
- render
- canvas 삽입

문제다.

## PHP API / DB 매핑

### `get_templates`

구현:

- [Editor.php](/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Editor.php)
- [Editor_model.php](/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/models/Editor_model.php)

읽는 테이블:

- `template_upload`
- `template_upload_inner`
- `template_size`
- `template_size_category`
- `user`
- `creator_team_member`
- `template_like`

추가:

- `partialPaid` 계산 시 `contributor`, `default_shape`, `picture`, `background`

### `get_pictures`

읽는 테이블:

- `picture`
- `category`
- `user`
- `image_like`
- 팔로우 계산용 `creator_follow`, `creator_team_member`

중요:

- `backgroundRemoval`은 dedicated column이 아니라 `keyword`에 `배경제거` 포함 여부
- `orientation`은 width/height 비교

### `get_shapes`

읽는 테이블:

- `default_shape`
- `category`
- `user`
- `shape_like`

중요:

- `graphics`는 `30,38,40,76`
- `frames`는 `41`
- `figure`는 `rect|line`
- `format=bitmap`이면 `png/jpg/jpeg`, 아니면 `svg/json`

### `get_background_contents`

읽는 테이블:

- `background`
- `category`
- `user`
- `background_like`

중요:

- 가격/팔로우/AI 필터 없음
- 검색 단위가 `pattern` / `image` 두 family

### `get_creator_contents`

중요 caveat:

- `template/shape/picture` helper는 `creator_serial`을 실제로 쓰지 않고 현재 session 사용자 기준으로 조회한다.
- 현재 엔드포인트 계약은 에이전트가 creator inventory source로 쓰기엔 신뢰성이 낮다.

## 실제 삽입 시 필요한 정보

### Shape / Graphic

최소 필요 필드:

- `serial`
- `category_serial`
- `category_name_en`
- `extension`
- `saved_filename`
- `thumb_file`
- `width`
- `height`
- `uid`
- `price_type`
- `is_ai`

실제 주의점:

- `svg`와 `json`은 fabric/group object로 풀린다.
- `bitmap` shape는 image object로 들어간다.
- `uid`는 `category_serial + serial` 기반 암호화 값이다.

### Picture / Photo

최소 필요 필드:

- `serial`
- `saved_filename`
- `thumb_file`
- `width`
- `height`
- `uid`
- `price_type`
- `is_ai`
- `keyword`

실제 주의점:

- object는 `type: 'image'`
- `src`, `originSrc`, `thumbnailSrc`, `uid`, `imageWidth`, `imageHeight`가 중요
- remove-background, AI rewrite 같은 후속 기능은 `originSrc` / `uid`를 본다

### Background

최소 필요 필드:

- `serial`
- `category_serial`
- `category_name_en`
- `extension`
- `saved_filename`
- `thumb_file`
- `uid`
- `width`
- `height`

실제 주의점:

- `pattern`은 `backgroundPattern` page state로 들어간다
- `image`는 background image state로 들어간다
- same shape/picture insert 경로가 아니다

### Template

최소 필요 필드:

- `serial`
- `code`
- `template`
- `size_serial`
- `width`
- `height`
- `keyword`
- `price_type`
- `price`
- `pr_obj`
- first `inner_code`

실제 주의점:

- 템플릿은 “콘텐츠 후보”이자 “완성물 reference”다.
- agent가 템플릿 자체를 참고 사례로 쓸 수도 있고, 완성 템플릿을 바로 load하는 경로도 있다.

### Text / Font

현재 템플릿 생성에 빠지면 안 되는 별도 source:

- `default_font` active count: 1,538
- `replace_font`: 48

실제 seam:

- [editor.ts](/home/ubuntu/github/tooldi/toolditor/src/apis/editor.ts) `loadFontData()`
- PHP `loadFont` / `default_font` / `default_font_weight`

즉 템플릿 agent는 text slot에 대해 최소한:

- font inventory
- weight inventory
- language support
- font category

를 알아야 한다.

## 에이전트 플로우가 실제로 필요로 하는 정보

### 반드시 필요한 것

1. Canvas context

- `size_serial`
- `width`, `height`
- 현재 page initial/empty 여부
- background state

2. Asset capability catalog

- `shape`
- `picture`
- `background.pattern`
- `background.image`
- `template`
- `font`
- `qr/barcode`

각 family별로:

- 검색 가능한가
- 삽입 방식이 object인가 page state인가
- 필수 필드가 무엇인가
- 후속 편집/AI 기능이 어떤 field를 요구하는가

3. Search / filter surface

- 어떤 endpoint로 찾는가
- page base가 0인지 1인지
- keyword가 fulltext인지 plain like인지
- orientation / format / AI / paid filter가 있는가

4. Selection metadata

- `keyword`
- `category`
- `price_type`
- `is_ai`
- `creator`
- `width`, `height`
- `confirmed`

5. Insert metadata

- `uid`
- `saved_filename`
- `thumb_file`
- `extension`
- `src/originSrc`로 이어질 수 있는 path 정보

### 있으면 좋은 것

- 템플릿 contributor graph
- seasonal / campaign taxonomy
- quality/engagement signal
- usage frequency
- style embedding

하지만 현재 확인 결과 `contributor`는 uploaded template 쪽에서 활용도가 낮아 보인다. 샘플 `봄` 템플릿들에서도 실질적인 contributor breakdown이 거의 나오지 않았다. v1 기준으로는 primary source로 삼기 어렵다.

## 지금 바로 가능한 구조적 결론

### 1. `봄 템플릿` vertical slice는 실제 데이터로 갈 수 있다

근거:

- `봄` keyword active
  - background 7
  - picture 1,941
  - shape 44,291
  - template 1,880

즉 curated fixture 없이도 real data candidate set을 만들 수 있는 수준이다.

### 2. 가장 안정적인 v1 execution family는 여전히 `background + shape + text`

이유:

- `background.pattern` / `background.image`는 stable page seam이 있다
- `shape`는 inventory가 매우 풍부하다
- `font` inventory도 충분하다
- `picture/photo`는 가능하지만 crop/remove-background/rewrite 연동까지 생각하면 추가 복잡도가 있다

즉 real data 기반 첫 단계는:

- background candidate
- graphic/bitmap/calligraphy candidate
- font candidate

이 셋으로 가는 것이 가장 안정적이다.

### 3. QR/Barcode는 retrieval 대상이 아니라 generation tool family다

즉 content catalog가 아니라:

- draft schema
- validation
- renderer
- insertion

으로 다뤄야 한다.

### 4. `creator_contents`는 현재 바로 trust하기 어렵다

구현상 `creator_serial`이 일부 경로에서 무시된다. creator inventory를 real source로 쓸 거면 이 엔드포인트를 먼저 검증하거나 별도 source를 써야 한다.

## 다음 구현에 필요한 최소 데이터 모델

### Candidate 공통

- `sourceFamily`
- `serial`
- `uid`
- `categorySerial`
- `categoryNameEn`
- `title`
- `keywords`
- `width`
- `height`
- `priceType`
- `price`
- `isAi`
- `creatorSerial`
- `creatorName`
- `previewSrc`
- `originSrc`
- `insertMode`
  - `object_insert`
  - `background_replace`
  - `template_load`
  - `local_generate`

### Source family별 추가

- shape
  - `extension`
  - `formatClass = bitmap | svg | json`
- picture
  - `orientationClass`
- background
  - `backgroundKind = pattern | image`
- font
  - `fontSerial`
  - `fontWeights`
  - `fontLanguage`
- qr/barcode
  - `draftSchemaName`

## 권장 다음 단계

1. `real Tooldi catalog adapter` 만들기

- `searchBackgroundAssets`
- `searchGraphicAssets`
- `searchPhotoAssets`
- `listFontAssets`

각 adapter는 현재 확인한 실제 PHP endpoint contract를 그대로 사용

2. `spring vertical slice`를 curated fixture에서 real DB/API source로 교체

우선순위:

- background
- shape(bitmap/illust/calligraphy)
- font

photo는 optional 2차

3. candidate selection log를 남기기

- 어떤 keyword로 검색했는지
- 어떤 filters를 썼는지
- 어떤 family에서 몇 개를 받았는지
- 최종 선택 이유

4. QR/barcode는 별도 generation tool로 분리

- content search pipeline에 섞지 않음

## 결론

지금 확인된 기준으로, Tooldi 안에는 템플릿 생성 에이전트를 실제 데이터로 돌리기에 충분한 콘텐츠 재고와 프론트/백엔드 seam이 이미 있다.

다만 바로 image-heavy autonomous design으로 가기보다, 첫 real-data 단계는 아래가 가장 맞다.

- `background.pattern | background.image`
- `shape(bitmap / illust / calligraphy / icon)`
- `font`
- `text slots`

그리고 `picture/photo`는 두 번째 단계에서 붙이는 것이 안정적이다.
