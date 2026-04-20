# Method-Compare Phase-1 Report

Generated: 2026-04-20T05:11:26.818Z
Model: gemini-2.5-pro (temperature 0.2, top_p 0.95)
Canvas: 1200 x 628
Prompts: 20

## Pass-rate summary (weighted average of format checks)

- Method A (native JSON): **99.3%** (call_ok=20/20)
- Method B (constrained HTML): **91.7%** (call_ok=20/20)
- Delta (A - B): **+7.6pp**

## Per-metric pass rates (only metrics applicable to each method)

### Method A — JSON format checks
| metric | pass rate |
| --- | --- |
| json_parse_ok | 20/20 (100%) |
| schema_valid | 20/20 (100%) |
| bounds_ok | 19/20 (95%) |
| no_overlap_critical | 20/20 (100%) |
| font_enum_ok | 20/20 (100%) |
| asset_id_ok | 20/20 (100%) |
| element_count_ok | 20/20 (100%) |

### Method B — HTML format checks
| metric | pass rate |
| --- | --- |
| html_parse_ok | 20/20 (100%) |
| dom_grammar_ok | 10/20 (50%) |
| css_whitelist_ok | 20/20 (100%) |
| root_structure_ok | 20/20 (100%) |
| positioning_ok | 20/20 (100%) |
| no_forbidden | 20/20 (100%) |
| placeholder_annotated_ok | 20/20 (100%) |
| bounds_ok | 15/20 (75%) |
| element_count_ok | 20/20 (100%) |

## Latency (ms)

| method | mean | median | p95 | min | max |
| --- | --- | --- | --- | --- | --- |
| method-a | 18965 | 18677 | 26729 | 14124 | 26729 |
| method-b | 24449 | 24361 | 40517 | 16645 | 40517 |

## Output size (bytes)

| method | mean | median | p95 | min | max |
| --- | --- | --- | --- | --- | --- |
| method-a | 1742 | 1734 | 2093 | 1416 | 2093 |
| method-b | 1652 | 1663 | 2016 | 1233 | 2016 |

## Input tokens (prompt)

| method | mean | median | p95 | min | max |
| --- | --- | --- | --- | --- | --- |
| method-a | 1204 | 1203 | 1211 | 1197 | 1211 |
| method-b | 1065 | 1064 | 1072 | 1058 | 1072 |

## Output tokens (candidate)

| method | mean | median | p95 | min | max |
| --- | --- | --- | --- | --- | --- |
| method-a | 744 | 734 | 897 | 618 | 897 |
| method-b | 644 | 645 | 776 | 476 | 776 |

## Element count

| method | mean | median | p95 | min | max |
| --- | --- | --- | --- | --- | --- |
| method-a | 7.3 | 7.0 | 9.0 | 6.0 | 9.0 |
| method-b | 8.1 | 8.0 | 10.0 | 6.0 | 10.0 |

## Failure samples

### Method A failures (first 3)
- **prompt_19** (kids) — callOk=true ratio=86%
  reasons: bounds:obj_1_oob(-50,450,250,250)

### Method B failures (first 3)
- **prompt_01** (restaurant) — callOk=true ratio=89%
  reasons: bounds_oob:div(-150,-150,400,400)

- **prompt_02** (cafe) — callOk=true ratio=89%
  reasons: bad_tags:br,br

- **prompt_03** (fashion) — callOk=true ratio=78%
  reasons: bad_tags:br; bounds_oob:img(680,40,450,590)

## Conclusion

Gemini 2.5 Pro zero-shot 기준, format-level 합격률은 Method A 가 99.3% (vs 91.7%, Δ 7.6pp) 우세.

## Limitations

- 자동 채점은 format-only (JSON parse / schema / bounds / DOM grammar / CSS whitelist / placeholder annotation / element count).
- **시각 품질(디자인 완성도)는 이 수치에 반영되지 않음.** 사람이 outputs/method-a, outputs/method-b 안의 원본을 직접 열어 확인 필요.
- 20 prompts × 1 sample/prompt. temperature 0.2 이므로 variance 제한적.
