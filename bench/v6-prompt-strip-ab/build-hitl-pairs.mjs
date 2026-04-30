#!/usr/bin/env node
// AGW v6 system-prompt strip — HITL blind comparison pair builder.
//
// For each case, pick best-of-3 per variant (priority: firstPassPassed > 0
// retries > earliest run). Build a side-by-side composite image with anonymized
// "variant1" / "variant2" labels. Save mapping in blinding-key.json so the
// reveal happens only after HITL scoring is logged.

import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
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
  const args = { dir: null, seed: 'agw-v6-strip' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') args.dir = resolve(argv[++i]);
    else if (a.startsWith('--dir=')) args.dir = resolve(a.slice('--dir='.length));
    else if (a === '--seed') args.seed = argv[++i];
    else if (a.startsWith('--seed=')) args.seed = a.slice('--seed='.length);
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
  const variants = (await listDirs(rootDir)).filter((v) => v === 'A' || v === 'B');
  const all = [];
  for (const variant of variants) {
    const runDirs = await listDirs(join(rootDir, variant));
    for (const runDir of runDirs) {
      if (!/^run-\d+$/.test(runDir)) continue;
      const cases = await listDirs(join(rootDir, variant, runDir));
      for (const caseId of cases) {
        try {
          const summary = await readJson(
            join(rootDir, variant, runDir, caseId, 'summary.json'),
          );
          summary.previewPath = join(rootDir, variant, runDir, caseId, 'preview.png');
          summary.htmlPath = join(rootDir, variant, runDir, caseId, 'html.html');
          all.push(summary);
        } catch {}
      }
    }
  }
  return all;
}

function pickBest(runsOfOneVariantOneCase) {
  // Priority: firstPassPassed (true preferred) → fewer attempts → lower runIndex.
  const sorted = [...runsOfOneVariantOneCase].sort((a, b) => {
    if ((a.firstPassPassed ? 1 : 0) !== (b.firstPassPassed ? 1 : 0)) {
      return (b.firstPassPassed ? 1 : 0) - (a.firstPassPassed ? 1 : 0);
    }
    if ((a.attempts?.length ?? 99) !== (b.attempts?.length ?? 99)) {
      return (a.attempts?.length ?? 99) - (b.attempts?.length ?? 99);
    }
    return (a.runIndex ?? 0) - (b.runIndex ?? 0);
  });
  return sorted[0] ?? null;
}

// Mulberry32 PRNG, deterministic from seed string.
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

async function buildCompositeImage({ page, leftPath, rightPath, outPath, caseSize }) {
  // Render a small HTML page with two preview.png side by side. file:// is
  // blocked by Chromium's default policy in setContent pages, so embed PNG
  // bytes as data URLs.
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
  const rows = await loadAllRuns(args.dir);
  if (rows.length === 0) throw new Error(`No runs found under ${args.dir}`);

  const caseIds = Array.from(new Set(rows.map((r) => r.caseId))).sort();
  const hitlDir = join(args.dir, 'hitl');
  await mkdir(hitlDir, { recursive: true });

  const rng = mulberry32(seedFromString(args.seed));
  const blinding = {};
  const items = [];
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    for (const caseId of caseIds) {
      const aRuns = rows.filter((r) => r.caseId === caseId && r.variant === 'A');
      const bRuns = rows.filter((r) => r.caseId === caseId && r.variant === 'B');
      const aBest = pickBest(aRuns);
      const bBest = pickBest(bRuns);
      if (!aBest?.previewPath || !bBest?.previewPath) {
        console.warn(`[hitl] case ${caseId} missing best (A=${!!aBest} B=${!!bBest})`);
        continue;
      }
      const sideAleft = rng() < 0.5;
      const left = sideAleft ? aBest : bBest;
      const right = sideAleft ? bBest : aBest;
      const compositePath = join(hitlDir, `${caseId}__compare.png`);
      const caseSize = aBest.size ?? bBest.size ?? { width: 1200, height: 628 };
      await buildCompositeImage({
        page,
        leftPath: left.previewPath,
        rightPath: right.previewPath,
        outPath: compositePath,
        caseSize,
      });
      // Also copy individual sides for full-resolution viewing
      await copyFile(left.previewPath, join(hitlDir, `${caseId}__variant1.png`));
      await copyFile(right.previewPath, join(hitlDir, `${caseId}__variant2.png`));
      blinding[caseId] = {
        variant1: left.variant,
        variant2: right.variant,
        leftRunIndex: left.runIndex,
        rightRunIndex: right.runIndex,
        aFirstPass: aBest.firstPassPassed,
        bFirstPass: bBest.firstPassPassed,
        aAttempts: aBest.attempts?.length ?? null,
        bAttempts: bBest.attempts?.length ?? null,
      };
      items.push({
        caseId,
        prompt: aBest.prompt,
        size: caseSize,
        composite: compositePath,
        variant1Image: join(hitlDir, `${caseId}__variant1.png`),
        variant2Image: join(hitlDir, `${caseId}__variant2.png`),
      });
      console.log(`[hitl] ${caseId}: left=${left.variant} right=${right.variant} → variant1/${left.variant} variant2/${right.variant}`);
    }
  } finally {
    await browser.close();
  }
  await writeFile(
    join(args.dir, 'blinding-key.json'),
    JSON.stringify(
      {
        seed: args.seed,
        generatedAt: new Date().toISOString(),
        cases: blinding,
      },
      null,
      2,
    ),
    'utf8',
  );
  await writeFile(
    join(hitlDir, 'items.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 2),
    'utf8',
  );
  console.log(`[hitl] wrote ${items.length} comparison composites and blinding key`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
