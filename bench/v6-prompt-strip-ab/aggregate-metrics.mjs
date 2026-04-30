#!/usr/bin/env node
// AGW v6 system-prompt strip — A/B metrics aggregator.
//
// Scans a /tmp/v6-bench-AB/<TS>/ directory and computes:
//   - per-case 1st-pass geometry rate (A vs B)
//   - per-case mean retry count (A vs B)
//   - per-case final pass rate (A vs B)
//   - per-case mean latency / total LLM calls
//   - cross-case pHash variance (A vs B) — 18 imgs/variant, mean pairwise hamming
//   - within-case pHash variance (A vs B) — 3-img pairwise mean, averaged across cases
//
// Outputs:
//   <TS>/metrics.json
//   <TS>/metrics.md
//
// pHash: 16x16 average hash via Playwright canvas. No extra deps.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = resolve(__dirname, '../..');

// Resolve playwright through the agent-worker package location.
const PLAYWRIGHT_PATH = resolve(
  WORKTREE_ROOT,
  'tooldi-agent-runtime/apps/agent-worker/node_modules/playwright/index.mjs',
);
const playwrightModule = await import(PLAYWRIGHT_PATH);
const { chromium } = playwrightModule;

function parseArgs(argv) {
  const args = { dir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') args.dir = resolve(argv[++i]);
    else if (a.startsWith('--dir=')) args.dir = resolve(a.slice('--dir='.length));
    else if (!a.startsWith('--')) args.dir = resolve(a);
    else throw new Error(`Unknown arg ${a}`);
  }
  if (!args.dir) throw new Error('--dir <bench-output-dir> required');
  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function listDirs(root) {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

async function loadAllRuns(rootDir) {
  // Layout: rootDir/<variant>/run-<i>/<case-id>/{summary.json, preview.png}
  const variants = (await listDirs(rootDir)).filter((v) => v === 'A' || v === 'B');
  const all = [];
  for (const variant of variants) {
    const runDirs = await listDirs(join(rootDir, variant));
    for (const runDir of runDirs) {
      const m = /^run-(\d+)$/.exec(runDir);
      if (!m) continue;
      const runIndex = Number.parseInt(m[1], 10);
      const cases = await listDirs(join(rootDir, variant, runDir));
      for (const caseId of cases) {
        const summaryPath = join(rootDir, variant, runDir, caseId, 'summary.json');
        try {
          const summary = await readJson(summaryPath);
          summary.previewPath = join(rootDir, variant, runDir, caseId, 'preview.png');
          summary.htmlPath = join(rootDir, variant, runDir, caseId, 'html.html');
          all.push(summary);
        } catch {
          // missing/partial; record as failure
          all.push({
            variant,
            runIndex,
            caseId,
            missing: true,
          });
        }
      }
    }
  }
  return all;
}

function mean(arr) {
  const filtered = arr.filter((x) => Number.isFinite(x));
  if (filtered.length === 0) return null;
  return filtered.reduce((s, x) => s + x, 0) / filtered.length;
}

function pct(numer, denom) {
  if (!denom) return null;
  return numer / denom;
}

// Compute 16x16 average hash via Playwright canvas. Returns a 256-bit string.
async function pHashFile(page, filePath) {
  // Read PNG bytes in Node (avoid Chromium file:// CORS) and pass as data URL.
  const buf = await readFile(filePath);
  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  return await page.evaluate(async (src) => {
    const N = 16;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, N, N);
    const data = ctx.getImageData(0, 0, N, N).data;
    const luminance = new Float32Array(N * N);
    let sum = 0;
    for (let i = 0; i < N * N; i += 1) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      luminance[i] = y;
      sum += y;
    }
    const avg = sum / (N * N);
    let hash = '';
    for (let i = 0; i < N * N; i += 1) {
      hash += luminance[i] > avg ? '1' : '0';
    }
    return hash;
  }, dataUrl);
}

function hamming(a, b) {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  let d = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) d += 1;
  return d;
}

function pairwiseMean(hashes) {
  if (hashes.length < 2) return null;
  const dists = [];
  for (let i = 0; i < hashes.length; i += 1) {
    for (let j = i + 1; j < hashes.length; j += 1) {
      dists.push(hamming(hashes[i], hashes[j]));
    }
  }
  return mean(dists);
}

function fmtPct(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '-';
  return `${(x * 100).toFixed(1)}%`;
}

function fmtNum(x, digits = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '-';
  return Number(x).toFixed(digits);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await loadAllRuns(args.dir);
  if (rows.length === 0) throw new Error(`No runs found under ${args.dir}`);

  const variantsPresent = Array.from(new Set(rows.map((r) => r.variant)));
  const caseIds = Array.from(new Set(rows.map((r) => r.caseId))).sort();

  // Per-case metrics
  const perCase = {};
  for (const caseId of caseIds) {
    perCase[caseId] = {};
    for (const v of variantsPresent) {
      const runs = rows.filter((r) => r.caseId === caseId && r.variant === v && !r.missing);
      const firstPass = runs.filter((r) => r.firstPassPassed).length;
      const finalPass = runs.filter((r) => r.finalPassed).length;
      const meanRetries = mean(runs.map((r) => Math.max(0, (r.attempts?.length ?? 0) - 1)));
      const meanLatency = mean(runs.map((r) => r.totalLatencyMs));
      const totalLlmCalls = runs.reduce((s, r) => s + (r.llmCallCount ?? 0), 0);
      const meanBlocking = mean(runs.map((r) => r.blockingIssueCount ?? 0));
      perCase[caseId][v] = {
        n: runs.length,
        firstPassRate: pct(firstPass, runs.length),
        finalPassRate: pct(finalPass, runs.length),
        meanRetries,
        meanLatencyMs: meanLatency,
        totalLlmCalls,
        meanBlockingIssues: meanBlocking,
      };
    }
  }

  // pHash collection
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  // Need a base page so we can drawImage from file://.
  await page.setContent('<html><body></body></html>');
  const hashByRun = new Map(); // key=variant|caseId|runIndex -> hash
  for (const r of rows) {
    if (r.missing || !r.previewPath) continue;
    try {
      const h = await pHashFile(page, r.previewPath);
      hashByRun.set(`${r.variant}|${r.caseId}|${r.runIndex}`, h);
    } catch (error) {
      console.error(
        `pHash failed for ${r.variant}/run-${r.runIndex}/${r.caseId}: ${error?.message ?? error}`,
      );
    }
  }
  await browser.close();

  // pHash metrics: per variant, cross-case (all 18) and within-case (mean over cases of 3-pairs).
  const phashMetrics = {};
  for (const v of variantsPresent) {
    const allHashes = [];
    const withinCaseDists = [];
    for (const caseId of caseIds) {
      const caseHashes = [];
      for (const r of rows) {
        if (r.variant !== v || r.caseId !== caseId || r.missing) continue;
        const k = `${v}|${caseId}|${r.runIndex}`;
        const h = hashByRun.get(k);
        if (h) {
          caseHashes.push(h);
          allHashes.push(h);
        }
      }
      const within = pairwiseMean(caseHashes);
      if (within !== null) withinCaseDists.push(within);
    }
    phashMetrics[v] = {
      crossCaseMeanHamming: pairwiseMean(allHashes),
      withinCaseMeanHamming: mean(withinCaseDists),
      sampleCount: allHashes.length,
    };
  }

  const totals = {};
  for (const v of variantsPresent) {
    const runs = rows.filter((r) => r.variant === v && !r.missing);
    const firstPass = runs.filter((r) => r.firstPassPassed).length;
    const finalPass = runs.filter((r) => r.finalPassed).length;
    totals[v] = {
      n: runs.length,
      firstPassRate: pct(firstPass, runs.length),
      finalPassRate: pct(finalPass, runs.length),
      meanRetries: mean(runs.map((r) => Math.max(0, (r.attempts?.length ?? 0) - 1))),
      meanLatencyMs: mean(runs.map((r) => r.totalLatencyMs)),
      totalLlmCalls: runs.reduce((s, r) => s + (r.llmCallCount ?? 0), 0),
    };
  }

  const out = {
    benchDir: args.dir,
    generatedAt: new Date().toISOString(),
    variants: variantsPresent,
    cases: caseIds,
    perCase,
    totals,
    phashMetrics,
    runCount: rows.length,
  };
  await writeFile(join(args.dir, 'metrics.json'), JSON.stringify(out, null, 2), 'utf8');

  // Markdown report
  const lines = [];
  lines.push(`# AGW v6 Prompt Strip — A/B Metrics`);
  lines.push('');
  lines.push(`- bench dir: \`${args.dir}\``);
  lines.push(`- generatedAt: ${out.generatedAt}`);
  lines.push(`- variants: ${variantsPresent.join(', ')}`);
  lines.push(`- cases: ${caseIds.length} (${caseIds.join(', ')})`);
  lines.push(`- runs: ${rows.length}`);
  lines.push('');
  lines.push(`## Totals (across all 6 cases)`);
  lines.push('');
  lines.push('| variant | n | 1st-pass | final-pass | mean retries | mean latency (ms) | total LLM calls |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const v of variantsPresent) {
    const t = totals[v];
    lines.push(
      `| ${v} | ${t.n} | ${fmtPct(t.firstPassRate)} | ${fmtPct(t.finalPassRate)} | ${fmtNum(t.meanRetries, 2)} | ${fmtNum(t.meanLatencyMs, 0)} | ${t.totalLlmCalls} |`,
    );
  }
  lines.push('');
  lines.push(`## pHash variance (16x16 avg-hash, hamming distance, 0-256 range)`);
  lines.push('');
  lines.push('| variant | sample | cross-case mean | within-case mean (avg over cases) |');
  lines.push('|---|---:|---:|---:|');
  for (const v of variantsPresent) {
    const p = phashMetrics[v];
    lines.push(
      `| ${v} | ${p.sampleCount} | ${fmtNum(p.crossCaseMeanHamming, 1)} | ${fmtNum(p.withinCaseMeanHamming, 1)} |`,
    );
  }
  lines.push('');
  lines.push(`## Per-case`);
  lines.push('');
  lines.push('| case | metric | A | B |');
  lines.push('|---|---|---:|---:|');
  for (const caseId of caseIds) {
    const a = perCase[caseId].A ?? {};
    const b = perCase[caseId].B ?? {};
    lines.push(`| ${caseId} | 1st-pass | ${fmtPct(a.firstPassRate)} | ${fmtPct(b.firstPassRate)} |`);
    lines.push(`| ${caseId} | final-pass | ${fmtPct(a.finalPassRate)} | ${fmtPct(b.finalPassRate)} |`);
    lines.push(`| ${caseId} | mean retries | ${fmtNum(a.meanRetries, 2)} | ${fmtNum(b.meanRetries, 2)} |`);
    lines.push(`| ${caseId} | mean latency (ms) | ${fmtNum(a.meanLatencyMs, 0)} | ${fmtNum(b.meanLatencyMs, 0)} |`);
    lines.push(`| ${caseId} | LLM calls | ${a.totalLlmCalls ?? '-'} | ${b.totalLlmCalls ?? '-'} |`);
    lines.push(`| ${caseId} | mean blocking issues | ${fmtNum(a.meanBlockingIssues, 2)} | ${fmtNum(b.meanBlockingIssues, 2)} |`);
  }
  lines.push('');
  lines.push(`## Hypothesis check (pre-registered, see handoff)`);
  lines.push('');
  lines.push('Threshold for B-rejection: geometry 1st-pass rate -40%p vs A.');
  for (const v of variantsPresent) {
    const t = totals[v];
    lines.push(`- variant ${v}: 1st-pass=${fmtPct(t.firstPassRate)}, final=${fmtPct(t.finalPassRate)}`);
  }
  if (totals.A && totals.B && totals.A.firstPassRate !== null && totals.B.firstPassRate !== null) {
    const delta = totals.B.firstPassRate - totals.A.firstPassRate;
    lines.push(`- Δ(B-A) 1st-pass: ${(delta * 100).toFixed(1)}pp`);
    lines.push(`- rejection threshold reached: ${delta <= -0.40 ? 'YES (kill B)' : 'no'}`);
  }
  lines.push('');
  await writeFile(join(args.dir, 'metrics.md'), lines.join('\n') + '\n', 'utf8');
  console.log(`[metrics] wrote ${join(args.dir, 'metrics.json')} and metrics.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
