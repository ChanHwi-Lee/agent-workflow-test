// AGW v6 Phase 4 — 5-sample E2E smoke test.
//
// For each of 5 representative bench prompts:
//   1. Run the full v6 pipeline (HTML gen → security validate → browser render
//      → primitive map → adapter) using the agent-worker's built artifacts.
//   2. Build the canvas.mutation envelope via emitV6Mutations.
//   3. Persist envelope JSON + the raw HTML under v6-poc/smoke/.
//   4. Run Playwright on the HTML and save a screenshot for visual inspection.
//
// Acceptance: 5/5 runs complete without render error. Visual inspection of
// smoke/*.png confirms no obvious breakage. Does NOT validate grading metrics
// — that's Phase 3-bis.
//
// Usage:
//   GOOGLE_API_KEY=... node v6-poc/v6-e2e-smoke.mjs
//
// Uses the built TypeScript artifacts at agent-worker/dist so the scripts
// exercise the same code paths that the worker runs in prod.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const WORKER_DIST = join(
  REPO_ROOT,
  "tooldi-agent-runtime/apps/agent-worker/dist",
);
const BENCH_OUTPUTS = join(
  REPO_ROOT,
  "bench/method-compare-phase1/outputs/method-a",
);
const SMOKE_DIR = join(__dirname, "smoke");

const SAMPLES = [
  "prompt_01",
  "prompt_08",
  "prompt_09",
  "prompt_15",
  "prompt_19",
];
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 628;

async function loadPrompt(id) {
  const raw = await readFile(join(BENCH_OUTPUTS, `${id}.json`), "utf8");
  return JSON.parse(raw).prompt;
}

function loadEnv() {
  // Pick up .env.local if no API key in process env.
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  // Minimal parser — just read GOOGLE_API_KEY.
  try {
    const path = join(REPO_ROOT, "tooldi-agent-runtime/.env.local");
    const data = require("node:fs").readFileSync(path, "utf8");
    const match = data.match(/^GOOGLE_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch (_) {}
  throw new Error("GOOGLE_API_KEY not set and .env.local missing");
}

async function runOne(id, { runV6Pipeline, v6Deps, adaptV6Commands, buildEnvelope, apiKey, browser }) {
  const userPrompt = await loadPrompt(id);
  const runId = `smoke_${id}_${Date.now()}`;

  const pipelineDeps = {
    ...v6Deps,
    renderAndExtract: async (html, canvas) => {
      const { renderAndExtract } = await import(
        join(WORKER_DIST, "phases/v6BrowserRender.js")
      );
      return renderAndExtract(browser, html, { canvas });
    },
  };

  const pipelineResult = await runV6Pipeline(
    {
      runId,
      canvasWidth: CANVAS_WIDTH,
      canvasHeight: CANVAS_HEIGHT,
      userPrompt,
      apiKey,
    },
    pipelineDeps,
  );

  const { commands: createLayerCommands } = adaptV6Commands(
    pipelineResult.commands,
    { runId },
  );

  const envelope = buildEnvelope({
    runId,
    traceId: `trace_${runId}`,
    documentId: `doc_${runId}`,
    pageId: `page_${runId}`,
    commands: createLayerCommands,
  });

  // Persist artifacts.
  await writeFile(
    join(SMOKE_DIR, `${id}.html`),
    pipelineResult.html,
    "utf8",
  );
  await writeFile(
    join(SMOKE_DIR, `${id}.envelope.json`),
    JSON.stringify(envelope, null, 2),
    "utf8",
  );

  // Re-render raw HTML for a screenshot.
  const ctx = await browser.newContext({
    viewport: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    deviceScaleFactor: 1,
  });
  try {
    const page = await ctx.newPage();
    await page.setContent(pipelineResult.html, { waitUntil: "networkidle" });
    await page.screenshot({
      path: join(SMOKE_DIR, `${id}.png`),
      fullPage: false,
      clip: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    });
  } finally {
    await ctx.close();
  }

  return {
    id,
    prompt: userPrompt,
    primitiveCount: pipelineResult.commands.length,
    layerCommandCount: createLayerCommands.length,
    model: pipelineResult.model,
    latency: pipelineResult.latency,
  };
}

async function main() {
  await mkdir(SMOKE_DIR, { recursive: true });
  const apiKey = loadEnv();

  const { runV6Pipeline } = await import(
    join(WORKER_DIST, "phases/v6Pipeline.js")
  );
  const { runV6HtmlGen } = await import(
    join(WORKER_DIST, "phases/v6HtmlGen.js")
  );
  const { validateV6Html } = await import(
    join(WORKER_DIST, "phases/v6HtmlValidator.js")
  );
  const { mapRenderedElements } = await import(
    join(WORKER_DIST, "phases/v6PrimitiveMapper.js")
  );
  const { adaptV6Commands } = await import(
    join(WORKER_DIST, "phases/v6CommandAdapter.js")
  );

  const v6Deps = {
    generateHtml: (args) =>
      runV6HtmlGen({
        canvasWidth: args.canvasWidth,
        canvasHeight: args.canvasHeight,
        userPrompt: args.userPrompt,
        apiKey: args.apiKey,
      }),
    validateHtml: validateV6Html,
    renderAndExtract: null, // bound per-run with the shared browser
    mapElements: mapRenderedElements,
  };

  // Minimal envelope builder mirroring emitV6Mutations (keeps the smoke
  // self-contained; does not import the full graphHelpers chain).
  const buildEnvelope = ({ runId, traceId, documentId, pageId, commands }) => ({
    mutationId: `mut_${runId}`,
    mutationVersion: "v1",
    traceId,
    runId,
    draftId: `draft_${runId}`,
    documentId,
    pageId,
    seq: 1,
    commitGroup: `commit_${runId}`,
    idempotencyKey: `mutation_v6_freeform_layout_${runId}`,
    expectedBaseRevision: 0,
    ownershipScope: "draft_only",
    commands,
    rollbackHint: {
      rollbackGroupId: `rollback_${runId}`,
      strategy: "delete_created_layers",
    },
    emittedAt: new Date().toISOString(),
    deliveryDeadlineAt: new Date(Date.now() + 10000).toISOString(),
  });

  const browser = await chromium.launch();
  try {
    const summary = [];
    for (const id of SAMPLES) {
      process.stdout.write(`[smoke] ${id} ... `);
      try {
        const info = await runOne(id, {
          runV6Pipeline,
          v6Deps,
          adaptV6Commands,
          buildEnvelope,
          apiKey,
          browser,
        });
        console.log(
          `OK (${info.primitiveCount} primitives → ${info.layerCommandCount} layer commands, total ${info.latency.totalMs}ms)`,
        );
        summary.push({ ...info, ok: true });
      } catch (err) {
        console.log(`FAIL — ${err.message}`);
        summary.push({ id, ok: false, error: err.message });
      }
    }
    await writeFile(
      join(SMOKE_DIR, "summary.json"),
      JSON.stringify(summary, null, 2),
      "utf8",
    );
    const ok = summary.filter((s) => s.ok).length;
    console.log(`\n[smoke] ${ok}/${summary.length} OK. Artifacts in ${SMOKE_DIR}/`);
    if (ok !== summary.length) process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
