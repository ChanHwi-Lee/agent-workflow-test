<!-- generated: 2026-04-22 09:20:11 -->

# AGW v6 HTML Fidelity Handoff

## Goal
Continue improving AGW v6 HTML-to-Toolditor fidelity after the v6-fidelity checkpoint.

## Current State
- Checkpoint name for this handoff: `v6-fidelity`.
- Agent workflow repo: `/home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test`, branch `feature/v6-structure`.
- Toolditor repo: `/home/ubuntu/github/tooldi/toolditor`, branch `feature/v6-primitives`.
- v6 pipeline now renders LLM HTML in Playwright, extracts rendered DOM primitives, maps them to canvas mutation commands, and applies them in Toolditor.
- Debug comparison exists in Toolditor: unrestricted HTML preview and v6-constrained HTML preview can be opened in a new window from `AgentHappyPathPanel`.
- UTF-8 preview wrapping is implemented so Korean text does not mojibake in Blob/new-window previews.
- Text fidelity fixes implemented in this checkpoint:
  - Playwright extraction resets browser `html, body` margin to `0`, preventing root bounds from shifting by the default `8px`.
  - Text primitive bounds get safety expansion to absorb browser/Toolditor font metric and wrapping differences.
  - `<br>` inside text elements is extracted as `\n` instead of causing the whole element to be skipped.
  - Toolditor v6 text objects keep the max of original HTML bounds height, measured renderer height, and a renderer-safe height.
  - Toolditor generated text style maps now support multiline text by creating one style row per line.
- Remaining visible fidelity gap: hero visual frames and rounded/elliptical image placeholders may still degrade, for example circular product frames can become large white rectangular regions.

## Locked Decisions
- v6 SSOT remains: LLM creates free HTML, browser computes layout, deterministic code extracts rendered primitives.
- Do not reintroduce v5 layout-family, slot, role, CTA, topology, or template grammar as v6 contracts.
- `v6CommandAdapter` should stay lossless. Geometry compatibility belongs in browser render/primitive mapper or Toolditor runtime adapter, not hidden adapter rewrites.
- Text width safety belongs in `v6PrimitiveMapper` because it owns text bounds extraction from browser layout.
- Text height safety belongs in Toolditor `normalizeCreatedObjects` because it is renderer-aware and uses Toolditor `getTextSize`.
- Unrestricted HTML preview is debug-only and must never feed canvas mutation or primitive extraction.
- Trend research is optional/premium. It must never be forced; failed trend research should fall back to no-trend HTML generation.
- RAG/asset placeholder replacement is expected later, so empty image placeholders are not the primary quality oracle yet.

## Contracts
- Run request option: `options.debugHtmlPreview?: boolean` enables debug preview artifacts.
- Run request option: `options.trendResearch?: boolean` enables optional trend context only when env mode allows it.
- Trend env keys:
  - `TREND_RESEARCH_MODE=off|shadow|enabled`
  - `TREND_RESEARCH_MODEL`
  - `TREND_CACHE_TTL_SECONDS`
- HTML provider env keys:
  - `HTML_GEN_PROVIDER=gemini|claude_code`
  - `CLAUDE_CODE_MODEL`
  - `CLAUDE_CODE_EFFORT`
  - `CLAUDE_CODE_TIMEOUT_MS`
- Artifact endpoint:
  - Agent API: `GET /api/agent-workflow/runs/:runId/artifacts?key=<object-store-key>`
  - Toolditor proxy: `GET /api/agent-workflow/runs/[runId]/artifacts?key=<object-store-key>`
- Debug artifact keys per run attempt:
  - `runs/<runId>/attempts/<attemptSeq>/debug-v6-html.json`
  - `runs/<runId>/attempts/<attemptSeq>/debug-unrestricted-html.json`
  - `runs/<runId>/attempts/<attemptSeq>/executable-plan.json`
  - `runs/<runId>/artifacts/bundle_<runId>.json`
- Local object-store root used in current runs:
  - `/tmp/tooldi-agent-runtime-toolditor-local/tooldi-agent-runtime-toolditor-local/agent-runtime-toolditor-local/runs/<runId>/`
- Important artifact-reading rule:
  - `debug-v6-html.json.html` shows the actual v6 HTML preview.
  - `executable-plan.json.actions[0].inputs.v6Commands` shows what will be applied to Toolditor.
  - If text exists in HTML but not in `v6Commands`, the bug is in worker extraction/mapping.
  - If text exists in `v6Commands` but not on canvas, the bug is in Toolditor mutation application/rendering.
  - `bundle_<runId>.json.editableCanvasState.commitPayload.mutations` shows the emitted commands and acked save lineage.

## Relevant Files
- `tooldi-agent-runtime/apps/agent-worker/src/phases/v6BrowserRender.ts` - Playwright render/extract. Owns placeholder route, font injection, render reset, text leaf detection, and `<br>` to newline extraction.
- `tooldi-agent-runtime/apps/agent-worker/src/phases/v6PrimitiveMapper.ts` - Converts rendered elements to v6 primitives. Owns text content-box inset, text safety bounds, alignment-aware x expansion, and canvas clamp.
- `tooldi-agent-runtime/apps/agent-worker/src/phases/v6CommandAdapter.ts` - Converts v6 primitives to canvas mutation commands. Should remain mostly lossless.
- `tooldi-agent-runtime/apps/agent-worker/src/phases/v6BrowserRender.test.ts` - Regression tests for body margin reset and `<br>` text extraction.
- `tooldi-agent-runtime/apps/agent-worker/src/phases/v6PrimitiveMapper.test.ts` - Regression tests for text safety bounds and alignment expansion.
- `tooldi-agent-runtime/apps/agent-worker/src/phases/v6CommandAdapter.test.ts` - Regression guard that adapter preserves bounds from mapper.
- `/home/ubuntu/github/tooldi/toolditor/src/features/agent-workflow-spike/lib/canvasObjectFactories.ts` - Builds Toolditor objects. Owns char style maps, including multiline rows.
- `/home/ubuntu/github/tooldi/toolditor/src/features/agent-workflow-spike/lib/mutationAdapter.ts` - Applies AGW mutations in Toolditor. Owns v6 text runtime height normalization.
- `/home/ubuntu/github/tooldi/toolditor/src/features/agent-workflow-spike/lib/mutationAdapter.test.ts` - Regression tests for v6 text height and multiline style maps.
- `/home/ubuntu/github/tooldi/toolditor/src/features/agent-workflow-spike/lib/htmlPreviewDocument.ts` - Wraps debug HTML with UTF-8 document shell for iframe/new-window preview.
- `/home/ubuntu/github/tooldi/toolditor/src/features/agent-workflow-spike/ui/AgentHappyPathPanel.tsx` - Debug UI: prompt input, trend toggle, HTML preview toggle, status, artifact previews, new-window preview.

## Open Risks
- Full `src/features/agent-workflow-spike/lib/mutationAdapter.test.ts` currently has two pre-existing failing expectations around `missing_execution_slot_identity`; targeted v6 tests pass. Do not treat those two failures as introduced by `v6-fidelity`.
- Hero visual fidelity remains imperfect. Rounded product/image frames can render as white rectangles because shape radius/ellipse/clip semantics are still weak.
- `border-radius: 50%`, large pill radii, CSS borders, and SVG/shape clipping need a separate primitive-mapping pass.
- Placeholder images remain blank until RAG replacement is active; evaluate image-frame geometry separately from image content.
- Existing Toolditor lint has many warnings; `npm run check` exits 0 but prints existing warnings.
- Running agent-worker code changes requires restarting the worker process. Toolditor dev usually hot-reloads.

## Acceptance Criteria
- [ ] A v6 HTML element such as `<h1>브릿지잉글리시<br>여름방학 특강 모집</h1>` appears in `v6Commands` as text `브릿지잉글리시\n여름방학 특강 모집`.
- [ ] Root canvas-sized HTML no longer extracts with a browser default `8px` offset.
- [ ] Single-line text with tight measured width gets enough bounds slack to reduce Toolditor wrapping regressions.
- [ ] Toolditor v6 text object height is never reduced below the original HTML bounds height.
- [ ] Toolditor multiline text gets line-indexed style maps and a safe height based on line count.
- [ ] Debug HTML preview opens in a new window without Korean mojibake.
- [ ] New visual work focuses next on shape/image-frame fidelity, not text extraction.

## Verification
- Agent worker:
  - `cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime && pnpm --filter @tooldi/agent-worker build`
  - Expected: TypeScript build exits 0.
- Agent worker v6 tests:
  - `cd /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime && pnpm --filter @tooldi/agent-worker test -- --test-name-pattern='v6|line breaks'`
  - Expected: exits 0; includes `renderAndExtract — resets browser body margin before measuring bounds` and `renderAndExtract — extracts text elements that contain line breaks`.
- Toolditor full check:
  - `cd /home/ubuntu/github/tooldi/toolditor && npm run check`
  - Expected: exits 0; existing warnings may print.
- Toolditor targeted v6 text tests:
  - `cd /home/ubuntu/github/tooldi/toolditor && npx vitest run src/features/agent-workflow-spike/lib/mutationAdapter.test.ts -t "v6 multiline|v6 text normalize"`
  - Expected: exits 0; 4 v6 tests pass and unrelated tests are skipped.
- Toolditor UTF-8 preview test:
  - `cd /home/ubuntu/github/tooldi/toolditor && npx vitest run src/features/agent-workflow-spike/lib/htmlPreviewDocument.test.ts`
  - Expected: exits 0.
- Manual artifact check:
  - Inspect `/tmp/tooldi-agent-runtime-toolditor-local/tooldi-agent-runtime-toolditor-local/agent-runtime-toolditor-local/runs/<runId>/attempts/1/debug-v6-html.json`.
  - Compare with `/tmp/.../runs/<runId>/attempts/1/executable-plan.json`.
  - Expected: major text in HTML also exists in `actions[0].inputs.v6Commands`.

## Start Prompt
```text
Continue AGW v6 HTML-to-Toolditor fidelity from checkpoint `v6-fidelity`.

First read:
- /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/docs/handoff/2026-04-22-agw-v6-html-fidelity-handoff.md
- /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6BrowserRender.ts
- /home/ubuntu/github/tooldi/tws-editor-api/agent-workflow-test/tooldi-agent-runtime/apps/agent-worker/src/phases/v6PrimitiveMapper.ts
- /home/ubuntu/github/tooldi/toolditor/src/features/agent-workflow-spike/lib/mutationAdapter.ts
- /home/ubuntu/github/tooldi/toolditor/src/features/agent-workflow-spike/lib/canvasObjectFactories.ts

Do not change v6 SSOT or introduce layout slots/contracts. Investigate the next fidelity gap: rounded/elliptical product frames and placeholder image geometry becoming rectangular in Toolditor. Use run artifacts to decide whether the issue is extraction, primitive mapping, command adaptation, or Toolditor rendering. Add focused regression tests before changing behavior.
```
