import { chromium } from "playwright";

import { V6_DEFAULT_MODEL } from "./lib/agentWorkerImports.js";
import { requireGoogleApiKey } from "./lib/env.js";
import { loadSeeds } from "./lib/seeds.js";
import {
  makeTimestamp,
  saveRun,
  writeManifest,
  type RunMeta,
} from "./lib/runs.js";
import { runAPath } from "./pipelines/a-path.js";

const REPEATS = Number(process.env.RUN_REPEATS ?? "3");

async function main(): Promise<void> {
  const apiKey = requireGoogleApiKey();
  const seeds = await loadSeeds();
  const timestamp = makeTimestamp();
  const model = V6_DEFAULT_MODEL;

  console.log(
    `[run-a] start ts=${timestamp} seeds=${seeds.length} repeats=${REPEATS} model=${model}`,
  );

  const browser = await chromium.launch();
  const metas: RunMeta[] = [];
  let ok = 0;
  let fail = 0;

  try {
    for (const seed of seeds) {
      for (let idx = 0; idx < REPEATS; idx++) {
        const label = `seed=${seed.id} run=${idx}`;
        const startedAt = Date.now();
        console.log(`[run-a] ${label} begin`);
        try {
          const res = await runAPath({
            browser,
            apiKey,
            model,
            seed,
            timestamp,
            runIdx: idx,
          });
          const dir = await saveRun({
            timestamp,
            seedId: seed.id,
            path: "a",
            runIdx: idx,
            html: res.html,
            screenshot: res.screenshot,
            meta: res.meta,
          });
          metas.push(res.meta);
          ok++;
          const took = Date.now() - startedAt;
          console.log(
            `[run-a] ${label} ok latency=${res.meta.latencyMs}ms total=${took}ms elems=${res.extractionElementCount} dir=${dir}`,
          );
        } catch (e) {
          fail++;
          const took = Date.now() - startedAt;
          console.error(
            `[run-a] ${label} FAIL after=${took}ms: ${(e as Error).message}`,
          );
        }
      }
    }
  } finally {
    await browser.close();
  }

  const manifestPath = await writeManifest(timestamp, metas);
  console.log(
    `[run-a] done ok=${ok} fail=${fail}/${seeds.length * REPEATS} manifest=${manifestPath}`,
  );
  if (fail > 0 && ok === 0) process.exit(2);
}

main().catch((e) => {
  console.error("[run-a] FATAL", e);
  process.exit(1);
});
