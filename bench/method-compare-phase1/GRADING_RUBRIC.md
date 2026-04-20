# GRADING_RUBRIC — Phase-1 Method Compare

자동 채점은 **포맷/문법 수준**만 평가한다. 디자인 품질(색조화, 타이포 균형, 카피 적절성 등)은 본 스크립트 범위 밖. 사람이 `outputs/` 를 열어 시각 품질을 확인해야 한다.

## 공통

- Canvas: 1200 × 628, 정수 픽셀.
- 모델: `gemini-2.5-pro`, `temperature=0.2`, `top_p=0.95`.
- Method A 만 `responseMimeType: "application/json"`.
- 실패 시 최대 1회 retry, 그 후에도 실패하면 `outputs/.../<id>.json` 에 `ok:false` 로 기록 → 해당 항목의 모든 체크는 FAIL.

## Method A (native JSON) 체크 항목

| 체크 | 의미 |
| --- | --- |
| `json_parse_ok` | 원문을 JSON.parse 할 수 있는가 (코드펜스 제거 후, 실패 시 `{...}` 구간 추출 재시도) |
| `schema_valid` | root 가 `{canvas, objects:[]}` 이고, 각 obj 가 `rect|text|image` type 과 left/top/width/height (숫자) 를 보유. text 는 text/fontFamily/fontSize, rect 는 fill, image 는 assetId 를 보유 |
| `bounds_ok` | 모든 object 가 `left>=0, top>=0, left+width<=1200, top+height<=628, width>0, height>0` |
| `no_overlap_critical` | 비-배경 object 간 IoU > 0.8 인 stack 없음 (rect+text 조합 CTA 패턴은 허용) |
| `font_enum_ok` | text object 의 fontFamily 가 whitelist(Pretendard / NotoSansKR / NanumSquare / SpoqaHanSans / GmarketSans / BlackHanSans / Cafe24Ssurround) |
| `asset_id_ok` | image object 의 assetId 가 `photo:1001, photo:1002, graphic:2001, graphic:2002` 중 하나 |
| `element_count_ok` | 3 ≤ objects.length ≤ 12 |

## Method B (constrained HTML) 체크 항목

| 체크 | 의미 |
| --- | --- |
| `html_parse_ok` | parse5 fragment parser 로 파싱 성공 |
| `root_structure_ok` | top-level 이 단일 `<div>` 이며 `position:relative`, `width:1200px`, `height:628px`, `overflow:hidden`(옵션) 을 inline style 로 가짐 |
| `dom_grammar_ok` | 루트 포함 모든 태그가 whitelist(`div, span, p, h1-h6, img, svg`) 안 |
| `positioning_ok` | 루트 이외의 모든 element 가 `position:absolute` + left/top/width/height 가 `Npx` 정수 |
| `css_whitelist_ok` | 모든 inline style 의 property 가 whitelist 안 (position, left/top/width/height, font-*, color, text-align, line-height, background-color, background-image, border-radius, opacity, transform, box-shadow, z-index, overflow, display) |
| `no_forbidden` | flex/grid/margin/padding/calc/translate/fixed/sticky/class=/<style>/<link>/<script> 미등장 |
| `placeholder_annotated_ok` | 모든 `<img>` 가 `data-tooldi-role`(화이트리스트) + `data-hint` + `data-aspect` 보유, `src="placeholder://"` |
| `bounds_ok` | 모든 자식 element 의 좌표+크기가 1200×628 안에 들어감 |
| `element_count_ok` | 3 ≤ 직계 자식 수 ≤ 12 |

## 가중 평균 (report 의 pass rate)

각 cell 의 `scorecard.ratio = passed / total` 평균을 method 단위로 냄. Method 간 체크 개수가 다르기 때문에 per-metric 비교는 퍼센트로 별도 표시.

## 실패 분류 힌트 (자동 생성된 `failureReasons` 를 수동 분류할 때 쓰는 라벨)

- `json_parse_failed`, `schema_shape_missing`, `schema:*` → **schema drift**
- `bounds:*` → **bound violation**
- `overlap:*` → **critical overlap**
- `font:*`, `asset:*` → **enum drift**
- `count:*` → **count out of range**
- `html_parse_failed`, `root_missing_*` → **root grammar fail**
- `bad_tags`, `pos_not_absolute`, `*_not_px_int` → **DOM grammar fail**
- `css_prop_forbidden`, `forbidden:*` → **forbidden CSS**
- `img_*` → **placeholder annotation fail**
