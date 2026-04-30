#!/usr/bin/env node
// Cross-bench HITL pair builder. Takes two bench output dirs (or two
// variants from one dir) and builds blind L/R composites picking best-of-N
// from each side. Intended for model-vs-model comparison after the original
// in-bench A/B is done.
//
// Usage:
//   node build-cross-hitl-pairs.mjs \
//     --left-dir /tmp/v6-bench-AB/<TS-lite> --left-variant B \
//     --right-dir /tmp/v6-bench-AB/<TS-pro> --right-variant B \
//     --out /tmp/v6-bench-AB/<TS-pro>/cross-hitl \
//     --left-label "lite-B" --right-label "pro-B" \
//     --seed lite-vs-pro

import { readFile, mkdir, readdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = resolve(__dirname, '../..');
const PLAYWRIGHT_PATH = resolve(
  WORKTREE_ROOT,
  'tooldi-agent-runtime/apps/agent-worker/node_modules/playwright/index.mjs',
);
const { chromium } = await import(PLAYWRIGHT_PATH);

function parseArgs(argv) {
  const args = {
    leftDir: null,
    rightDir: null,
    leftVariant: 'B',
    rightVariant: 'B',
    leftLabel: 'left',
    rightLabel: 'right',
    out: null,
    seed: 'cross-hitl',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--left-dir') args.leftDir = resolve(next());
    else if (a === '--right-dir') args.rightDir = resolve(next());
    else if (a === '--left-variant') args.leftVariant = next();
    else if (a === '--right-variant') args.rightVariant = next();
    else if (a === '--left-label') args.leftLabel = next();
    else if (a === '--right-label') args.rightLabel = next();
    else if (a === '--out') args.out = resolve(next());
    else if (a === '--seed') args.seed = next();
    else throw new Error(`Unknown arg ${a}`);
  }
  if (!args.leftDir || !args.rightDir || !args.out)
    throw new Error('--left-dir --right-dir --out required');
  return args;
}

async function readJson(p) {
  return JSON.parse(await readFile(p, 'utf8'));
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

async function loadVariantRuns(rootDir, variant) {
  const variantDir = join(rootDir, variant);
  const runDirs = await listDirs(variantDir);
  const out = [];
  for (const runDir of runDirs) {
    if (!/^run-\d+$/.test(runDir)) continue;
    const cases = await listDirs(join(variantDir, runDir));
    for (const caseId of cases) {
      try {
        const summary = await readJson(
          join(variantDir, runDir, caseId, 'summary.json'),
        );
        summary.previewPath = join(variantDir, runDir, caseId, 'preview.png');
        out.push(summary);
      } catch {}
    }
  }
  return out;
}

function pickBest(runs) {
  return [...runs].sort((a, b) => {
    if ((a.firstPassPassed ? 1 : 0) !== (b.firstPassPassed ? 1 : 0))
      return (b.firstPassPassed ? 1 : 0) - (a.firstPassPassed ? 1 : 0);
    if ((a.attempts?.length ?? 99) !== (b.attempts?.length ?? 99))
      return (a.attempts?.length ?? 99) - (b.attempts?.length ?? 99);
    return (a.runIndex ?? 0) - (b.runIndex ?? 0);
  })[0];
}

function seedFromString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function buildComposite({ page, leftPath, rightPath, outPath, caseSize }) {
  const [leftBuf, rightBuf] = await Promise.all([
    readFile(leftPath),
    readFile(rightPath),
  ]);
  const leftSrc = `data:image/png;base64,${leftBuf.toString('base64')}`;
  const rightSrc = `data:image/png;base64,${rightBuf.toString('base64')}`;
  const totalWidth = caseSize.width * 2 + 60;
  const totalHeight = caseSize.height + 80;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#222;color:#fff;font:14px system-ui,sans-serif;}
.row{display:flex;gap:20px;padding:20px;}
figure{margin:0;flex:0 0 auto;}
figcaption{padding:8px 0;text-align:center;}
img{display:block;max-width:none;background:#fff;border:1px solid #555;}
</style></head><body><div class="row">
<figure><img src="${leftSrc}" width="${caseSize.width}" height="${caseSize.height}"><figcaption>variant1</figcaption></figure>
<figure><img src="${rightSrc}" width="${caseSize.width}" height="${caseSize.height}"><figcaption>variant2</figcaption></figure>
</div></body></html>`;
  await page.setViewportSize({ width: totalWidth, height: totalHeight });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outPath, fullPage: false });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.out, { recursive: true });
  const leftRuns = await loadVariantRuns(args.leftDir, args.leftVariant);
  const rightRuns = await loadVariantRuns(args.rightDir, args.rightVariant);
  const caseIds = Array.from(
    new Set([...leftRuns.map((r) => r.caseId), ...rightRuns.map((r) => r.caseId)]),
  ).sort();

  const rng = mulberry32(seedFromString(args.seed));
  const blinding = {};
  const items = [];
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    for (const caseId of caseIds) {
      const leftBest = pickBest(leftRuns.filter((r) => r.caseId === caseId));
      const rightBest = pickBest(rightRuns.filter((r) => r.caseId === caseId));
      if (!leftBest?.previewPath || !rightBest?.previewPath) {
        console.warn(`[cross-hitl] case ${caseId} missing best`);
        continue;
      }
      const leftIsLeft = rng() < 0.5;
      const visualLeft = leftIsLeft ? leftBest : rightBest;
      const visualRight = leftIsLeft ? rightBest : leftBest;
      const visualLeftLabel = leftIsLeft ? args.leftLabel : args.rightLabel;
      const visualRightLabel = leftIsLeft ? args.rightLabel : args.leftLabel;
      const compositePath = join(args.out, `${caseId}__compare.png`);
      const caseSize = leftBest.size ?? rightBest.size ?? { width: 1200, height: 628 };
      await buildComposite({
        page,
        leftPath: visualLeft.previewPath,
        rightPath: visualRight.previewPath,
        outPath: compositePath,
        caseSize,
      });
      await copyFile(visualLeft.previewPath, join(args.out, `${caseId}__variant1.png`));
      await copyFile(visualRight.previewPath, join(args.out, `${caseId}__variant2.png`));
      blinding[caseId] = {
        variant1: visualLeftLabel,
        variant2: visualRightLabel,
        variant1Source: { dir: args.leftDir, variant: args.leftVariant, runIndex: visualLeft.runIndex },
        variant2Source: { dir: args.rightDir, variant: args.rightVariant, runIndex: visualRight.runIndex },
        leftFirstPass: leftBest.firstPassPassed,
        rightFirstPass: rightBest.firstPassPassed,
      };
      items.push({
        caseId,
        prompt: leftBest.prompt ?? rightBest.prompt,
        size: caseSize,
        composite: compositePath,
      });
      console.log(
        `[cross-hitl] ${caseId}: variant1=${visualLeftLabel} variant2=${visualRightLabel}`,
      );
    }
  } finally {
    await browser.close();
  }
  await writeFile(
    join(args.out, 'blinding-key.json'),
    JSON.stringify(
      {
        seed: args.seed,
        generatedAt: new Date().toISOString(),
        leftSource: { dir: args.leftDir, variant: args.leftVariant, label: args.leftLabel },
        rightSource: { dir: args.rightDir, variant: args.rightVariant, label: args.rightLabel },
        cases: blinding,
      },
      null,
      2,
    ),
    'utf8',
  );
  await writeFile(
    join(args.out, 'items.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2),
    'utf8',
  );
  console.log(`[cross-hitl] wrote ${items.length} composites to ${args.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
