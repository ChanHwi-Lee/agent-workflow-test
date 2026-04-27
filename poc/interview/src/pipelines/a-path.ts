import type { Browser } from "playwright";

import {
  runV6HtmlGen,
  V6HtmlGenerationError,
} from "../lib/agentWorkerImports.js";
import { renderHtmlWithScreenshot } from "../lib/renderWithScreenshot.js";
import type { SeedPrompt } from "../lib/seeds.js";
import type { RunMeta } from "../lib/runs.js";

export interface RunAPathArgs {
  readonly browser: Browser;
  readonly apiKey: string;
  readonly model: string;
  readonly seed: SeedPrompt;
  readonly timestamp: string;
  readonly runIdx: number;
}

export interface RunAPathResult {
  readonly html: string;
  readonly screenshot: Buffer;
  readonly meta: RunMeta;
  readonly extractionElementCount: number;
}

export async function runAPath(args: RunAPathArgs): Promise<RunAPathResult> {
  const runId = `${args.timestamp}-${args.seed.id}-a-${args.runIdx}`;

  let html = "";
  let latencyMs = 0;
  let usage: unknown | null = null;

  try {
    const gen = await runV6HtmlGen({
      apiKey: args.apiKey,
      model: args.model,
      canvasWidth: args.seed.canvas.width,
      canvasHeight: args.seed.canvas.height,
      userPrompt: args.seed.prompt,
    });
    html = gen.html;
    latencyMs = gen.latencyMs;
    usage = gen.usage;
  } catch (e) {
    if (e instanceof V6HtmlGenerationError) {
      throw new Error(
        `V6HtmlGenerationError status=${e.status ?? "null"} msg=${e.message}`,
      );
    }
    throw e;
  }

  const { extraction, screenshot } = await renderHtmlWithScreenshot(
    args.browser,
    html,
    { canvas: args.seed.canvas },
  );

  const meta: RunMeta = {
    runId,
    timestamp: args.timestamp,
    seedId: args.seed.id,
    seedLabel: args.seed.label,
    path: "a",
    runIdx: args.runIdx,
    canvas: args.seed.canvas,
    prompt: args.seed.prompt,
    model: args.model,
    latencyMs,
    usage,
    htmlBytes: Buffer.byteLength(html, "utf-8"),
    extractionElementCount: extraction.elements.length,
  };

  return {
    html,
    screenshot,
    meta,
    extractionElementCount: extraction.elements.length,
  };
}
