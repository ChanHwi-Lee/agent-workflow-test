# Multi-Model Method-Compare Report (Phase-1 extended)

Generated: 2026-04-20T05:52:52.300Z
Canvas: 1200 x 628 · Prompts: 20 · temperature=0.2 top_p=0.95 · concurrency per-run 2-3 · retries 2

## 1. Overview (per-model, per-method)

| alias | modelId | A pass% | B pass% | A med-lat(s) | B med-lat(s) | A $/20p | B $/20p | A $/p | B $/p |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2.5-pro | `gemini-2.5-pro` | 99.3 | 91.7 | 18.68 | 24.36 | $0.5300 | $0.6733 | $0.02650 | $0.03367 |
| 3-pro | `gemini-3-pro-preview` | 100.0 | 98.9 | 23.20 | 36.95 | $0.6130 | $0.9452 | $0.03065 | $0.04726 |
| 3.1-pro | `gemini-3.1-pro-preview` | 100.0 | 98.3 | 25.16 | 37.38 | $0.9853 | $1.4864 | $0.04927 | $0.07432 |
| 3-flash | `gemini-3-flash-preview` | 100.0 | 87.2 | 8.73 | 20.42 | $0.1190 | $0.2607 | $0.00595 | $0.01304 |
| 3.1-flash-lite | `gemini-3.1-flash-lite-preview` | 100.0 | 92.8 | 3.13 | 3.10 | $0.0076 | $0.0074 | $0.00038 | $0.00037 |

> pass% = weighted average of format checks (ratio across metrics).
> $/20p = estimated API cost for all 20 prompts of that method (input + output + thinking billed as output).
> Prices are **approximations** — confirm current Gemini tariffs before relying on absolute figures.

## 2. Token totals (20 prompts per cell)

| alias | Method A | Method B |
| --- | --- | --- |
| 2.5-pro | A: in=24076 / out=14876 / thought=35115 | B: in=21296 / out=12879 / thought=51793 |
| 3-pro | A: in=24076 / out=17560 / thought=40735 | B: in=21296 / out=16612 / thought=75244 |
| 3.1-pro | A: in=24076 / out=17418 / thought=44257 | B: in=21296 / out=17068 / thought=78479 |
| 3-flash | A: in=24076 / out=14384 / thought=30342 | B: in=21296 / out=12382 / thought=89356 |
| 3.1-flash-lite | A: in=24076 / out=12926 / thought=0 | B: in=21296 / out=13105 / thought=0 |

## 3. Per-check pass rates (Method A — JSON format)

| alias | json_parse_ok | schema_valid | bounds_ok | no_overlap_critical | font_enum_ok | asset_id_ok | element_count_ok |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2.5-pro | 20/20 | 20/20 | 19/20 | 20/20 | 20/20 | 20/20 | 20/20 |
| 3-pro | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 |
| 3.1-pro | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 |
| 3-flash | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 |
| 3.1-flash-lite | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 |

## 4. Per-check pass rates (Method B — HTML format)

| alias | html_parse_ok | dom_grammar_ok | css_whitelist_ok | root_structure_ok | positioning_ok | no_forbidden | placeholder_annotated_ok | bounds_ok | element_count_ok |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2.5-pro | 20/20 | 10/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 15/20 | 20/20 |
| 3-pro | 20/20 | 19/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 19/20 | 20/20 |
| 3.1-pro | 20/20 | 18/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 19/20 | 20/20 |
| 3-flash | 20/20 | 8/20 | 19/20 | 19/20 | 19/20 | 19/20 | 19/20 | 15/20 | 19/20 |
| 3.1-flash-lite | 20/20 | 7/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 | 20/20 |

## 5. Cost / Quality / Latency (gasungbi plot)

### Method A (native JSON)
| alias | cost $/20p | pass % | median latency s |
| --- | --- | --- | --- |
| 2.5-pro | $0.5300 | 99.3 | 18.68 |
| 3-pro | $0.6130 | 100.0 | 23.20 |
| 3.1-pro | $0.9853 | 100.0 | 25.16 |
| 3-flash | $0.1190 | 100.0 | 8.73 |
| 3.1-flash-lite | $0.0076 | 100.0 | 3.13 |

**Pareto frontier A** (non-dominated on cost, pass, latency):  3.1-flash-lite

**Best gasungbi A (pass%/$20p)**: 3.1-flash-lite — 100.0% at $0.0076

### Method B (constrained HTML)
| alias | cost $/20p | pass % | median latency s |
| --- | --- | --- | --- |
| 2.5-pro | $0.6733 | 91.7 | 24.36 |
| 3-pro | $0.9452 | 98.9 | 36.95 |
| 3.1-pro | $1.4864 | 98.3 | 37.38 |
| 3-flash | $0.2607 | 87.2 | 20.42 |
| 3.1-flash-lite | $0.0074 | 92.8 | 3.10 |

**Pareto frontier B** (non-dominated):  3.1-flash-lite → 3-pro

**Best gasungbi B (pass%/$20p)**: 3.1-flash-lite — 92.8% at $0.0074

## 6. Failure patterns (top 5 reason keys per model)

### 2.5-pro
- Method A: `bounds`×1
- Method B: `bad_tags`×10, `bounds_oob`×5

### 3-pro
- Method A: clean
- Method B: `bad_tags`×1, `bounds_oob`×1

### 3.1-pro
- Method A: clean
- Method B: `bad_tags`×2, `bounds_oob`×1

### 3-flash
- Method A: clean
- Method B: `bad_tags`×11, `bounds_oob`×4, `root_missing_or_siblings`×1

### 3.1-flash-lite
- Method A: clean
- Method B: `bad_tags`×13

## 7. Conclusions

- **Method A (native JSON) — 가성비 최적 모델**: `3.1-flash-lite` (pass 100.0% @ $0.0076/20p).
- **Method B (constrained HTML) — 가성비 최적 모델**: `3.1-flash-lite` (pass 92.8% @ $0.0074/20p).

## 8. Caveats

- Automated scoring is **format-only**: JSON shape / bounds / DOM grammar / CSS whitelist / placeholder annotation / element count. **Visual design quality is NOT measured** and cannot be reliably diffed between 2.5-pro → 3-pro → 3.1-pro without human review (use `viewer-multi.html`).
- A 2.5→3→3.1 "visible quality jump" may exist in design harmony, layering, typography, copy cadence, yet be invisible to format-level graders. Compare side-by-side in the viewer before concluding.
- Preview model pricing is estimated; update `MODELS[*].price` in multi-report.mjs once Google publishes final numbers.
- Single sample per prompt @ T=0.2 — variance bounded but not zero.
- Thinking tokens (`thoughtsTokenCount`) are included in output-side cost accounting to reflect actual billing.
