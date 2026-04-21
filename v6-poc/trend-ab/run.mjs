// AGW v6 trend-ab runner —
//   A = current v6 HTML gen (no trend context)
//   B = trend research (Gemini + google_search) → HTML gen with trend context
//
// Writes per-prompt outputs to out/:
//   sample-NN-A.html             — path A HTML snippet wrapped for iframe preview
//   sample-NN-B.html             — path B HTML snippet wrapped for iframe preview
//   sample-NN-trend.json         — trend research result (summary + citations)
//   sample-NN-meta.json          — model/latency/usage/err for both paths
//
// Then writes viewer.html at trend-ab/ root for side-by-side comparison.
//
// Usage:
//   node v6-poc/trend-ab/run.mjs                  (all 10 prompts, concurrency=2)
//   node v6-poc/trend-ab/run.mjs --limit=2
//   node v6-poc/trend-ab/run.mjs --only=05-summer-aircon-promo

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGoogleApiKey } from './lib/loadEnv.mjs';
import { generateHtml } from './lib/generateHtml.mjs';
import { researchTrends } from './lib/researchTrends.mjs';
import { buildFontFaceStyleBlock } from '../fonts/buildFontFaceCSS.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, 'out');
const PROMPTS_PATH = resolve(__dirname, 'prompts.json');
const VIEWER_PATH = resolve(__dirname, 'viewer.html');

const MAX_RETRIES = 2;
const CONCURRENCY = 2;

function parseArgs(argv) {
  const out = {};
  for (const tok of argv) {
    if (tok.startsWith('--')) {
      const [k, v] = tok.slice(2).split('=');
      out[k] = v ?? true;
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries(label, fn) {
  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const is429 =
        err?.status === 429 ||
        /rate|quota|RESOURCE_EXHAUSTED/i.test(err?.message ?? '');
      const backoff = is429 ? 8000 * (attempt + 1) : 2000 * (attempt + 1);
      console.warn(
        `[retry] ${label} attempt=${attempt} err=${(err?.message ?? String(err)).slice(0, 160)} backoff=${backoff}ms`,
      );
      if (attempt < MAX_RETRIES) await sleep(backoff);
    }
  }
  throw lastErr;
}

function wrapForIframe({ snippet, canvas, fontFaceStyle }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
${fontFaceStyle}
<style>
  html, body { margin:0; padding:0; background:#fff; }
  body { width:${canvas.width}px; height:${canvas.height}px; overflow:hidden; }
</style>
</head>
<body>
${snippet}
</body>
</html>`;
}

async function runOne({ apiKey, promptDef, fontFaceStyle }) {
  const { id, prompt, canvas, domain } = promptDef;
  const meta = { id, domain, canvas, startedAt: new Date().toISOString() };

  // --- path A: no trend ---
  const pathA = await withRetries(`${id}:A`, () =>
    generateHtml({ apiKey, canvasWidth: canvas.width, canvasHeight: canvas.height, userPrompt: prompt }),
  );
  await writeFile(
    resolve(OUT_DIR, `${id}-A.html`),
    wrapForIframe({ snippet: pathA.html, canvas, fontFaceStyle }),
    'utf8',
  );
  meta.pathA = {
    model: pathA.model,
    latencyMs: pathA.latencyMs,
    finishReason: pathA.finishReason,
    usage: pathA.usage,
    bytes: Buffer.byteLength(pathA.html, 'utf8'),
  };

  // --- path B: research → generate ---
  const trendRes = await withRetries(`${id}:trend`, () =>
    researchTrends({ apiKey, userPrompt: prompt }),
  );
  await writeFile(
    resolve(OUT_DIR, `${id}-trend.json`),
    JSON.stringify(
      {
        id,
        prompt,
        model: trendRes.model,
        latencyMs: trendRes.latencyMs,
        trend: trendRes.trend,
        contextForHtmlGen: trendRes.contextForHtmlGen,
        citations: trendRes.citations,
        searchQueries: trendRes.searchQueries,
        rawText: trendRes.rawText,
        usage: trendRes.usage,
      },
      null,
      2,
    ),
    'utf8',
  );

  const pathB = await withRetries(`${id}:B`, () =>
    generateHtml({
      apiKey,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      userPrompt: prompt,
      trendContext: trendRes.contextForHtmlGen,
    }),
  );
  await writeFile(
    resolve(OUT_DIR, `${id}-B.html`),
    wrapForIframe({ snippet: pathB.html, canvas, fontFaceStyle }),
    'utf8',
  );
  meta.pathB = {
    model: pathB.model,
    latencyMs: pathB.latencyMs,
    finishReason: pathB.finishReason,
    usage: pathB.usage,
    bytes: Buffer.byteLength(pathB.html, 'utf8'),
    trendModel: trendRes.model,
    trendLatencyMs: trendRes.latencyMs,
    trendCitationCount: trendRes.citations.length,
    trendSearchQueries: trendRes.searchQueries,
  };

  await writeFile(resolve(OUT_DIR, `${id}-meta.json`), JSON.stringify(meta, null, 2), 'utf8');
  console.log(
    `[done] ${id.padEnd(28)} A=${pathA.latencyMs}ms B=${pathB.latencyMs}ms trend=${trendRes.latencyMs}ms searches=${trendRes.searchQueries.length} cites=${trendRes.citations.length}`,
  );
  return meta;
}

async function runWithPool(tasks, concurrency) {
  const queue = tasks.slice();
  const results = [];
  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) return;
      try {
        results.push(await task());
      } catch (err) {
        console.error(`[pool] task failed: ${err?.message ?? String(err)}`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );
  return results;
}

async function buildViewerHtml(promptDefs) {
  const rows = await Promise.all(
    promptDefs.map(async (p, i) => {
      const n = i + 1;
      const trendJsonUrl = `out/${p.id}-trend.json`;
      const aUrl = `out/${p.id}-A.html`;
      const bUrl = `out/${p.id}-B.html`;
      const canvasLabel = `${p.canvas.width}×${p.canvas.height}`;
      // Inline the trend summary so the viewer works from file:// without fetch.
      let trendInline = '(trend.json not found)';
      try {
        const raw = await readFile(resolve(OUT_DIR, `${p.id}-trend.json`), 'utf8');
        const j = JSON.parse(raw);
        const short = {
          summary: j.trend?.summary,
          palette: j.trend?.palette,
          typography: j.trend?.typography,
          composition: j.trend?.composition,
          motifs: j.trend?.motifs,
          tone: j.trend?.tone,
          searchQueries: j.searchQueries,
          citationCount: (j.citations || []).length,
          citations: (j.citations || []).slice(0, 6),
        };
        trendInline = escapeHtml(JSON.stringify(short, null, 2));
      } catch {
        /* leave placeholder */
      }
      const searchMatch = /"searchQueries":\s*\[([^\]]*)\]/.exec(trendInline);
      const searches = searchMatch
        ? (searchMatch[1].match(/"[^"]+"/g) || []).length
        : 0;
      const citesMatch = /"citationCount":\s*(\d+)/.exec(trendInline);
      const cites = citesMatch ? Number(citesMatch[1]) : 0;
      return `<section class="row" data-id="${p.id}">
  <header>
    <div class="n">#${String(n).padStart(2, '0')}</div>
    <div class="meta">
      <div class="id">${p.id}</div>
      <div class="sub"><span class="dom">${p.domain}</span> · ${canvasLabel} · <span class="badge">searches ${searches}</span> <span class="badge">cites ${cites}</span></div>
      <div class="prompt">${escapeHtml(p.prompt)}</div>
    </div>
    <div class="actions">
      <a class="btn" href="${trendJsonUrl}" target="_blank">trend.json</a>
      <a class="btn" href="${aUrl}" target="_blank">A ↗</a>
      <a class="btn" href="${bUrl}" target="_blank">B ↗</a>
    </div>
  </header>
  <div class="frames">
    <div class="frame-box"><div class="frame-label a">A · current (no trend)</div>
      <div class="frame-wrap" style="--cw:${p.canvas.width}px;--ch:${p.canvas.height}px;">
        <iframe loading="lazy" src="${aUrl}" width="${p.canvas.width}" height="${p.canvas.height}"></iframe>
      </div>
    </div>
    <div class="frame-box"><div class="frame-label b">B · + trend research</div>
      <div class="frame-wrap" style="--cw:${p.canvas.width}px;--ch:${p.canvas.height}px;">
        <iframe loading="lazy" src="${bUrl}" width="${p.canvas.width}" height="${p.canvas.height}"></iframe>
      </div>
    </div>
  </div>
  <details class="trend-preview"><summary>Trend summary (click to expand)</summary>
    <pre>${trendInline}</pre>
  </details>
</section>`;
    }),
  );
  const rowsHtml = rows.join('\n');

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"/>
<title>AGW v6 · trend A/B</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; background:#0f172a; color:#e2e8f0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  h1 { margin:0; padding:20px 24px 12px; font-size:18px; font-weight:700; letter-spacing:.02em; }
  h1 .sub { display:block; font-size:12px; font-weight:400; color:#94a3b8; margin-top:4px; }
  .row { border-top:1px solid #1e293b; padding:16px 24px 28px; }
  .row header { display:flex; align-items:flex-start; gap:16px; }
  .row .n { font-variant-numeric: tabular-nums; font-size:22px; font-weight:700; color:#64748b; min-width:48px; }
  .row .meta { flex:1; min-width:0; }
  .row .id { font-size:12px; color:#94a3b8; margin-bottom:2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .row .sub { font-size:12px; color:#94a3b8; }
  .row .sub .dom { background:#1e293b; padding:1px 8px; border-radius:10px; }
  .row .sub .badge { display:inline-block; margin-left:4px; padding:1px 8px; background:#0b1220; border:1px solid #334155; border-radius:10px; font-variant-numeric: tabular-nums; }
  .row .prompt { margin-top:6px; font-size:13.5px; color:#e2e8f0; line-height:1.5; }
  .row .actions { display:flex; gap:8px; }
  .btn { display:inline-block; padding:6px 10px; background:#1e293b; border:1px solid #334155; color:#cbd5e1; border-radius:8px; font-size:12px; text-decoration:none; }
  .btn:hover { background:#334155; color:#fff; }
  .frames { display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-top:14px; }
  .frame-box { background:#020617; border:1px solid #1e293b; border-radius:10px; overflow:hidden; }
  .frame-label { padding:8px 12px; font-size:12px; color:#cbd5e1; background:#0b1220; border-bottom:1px solid #1e293b; }
  .frame-label.a { border-left:3px solid #64748b; }
  .frame-label.b { border-left:3px solid #f59e0b; }
  .frame-wrap {
    position:relative;
    width:100%;
    aspect-ratio: var(--cw) / var(--ch);
    overflow:hidden;
    background:#fff;
  }
  .frame-wrap iframe {
    position:absolute; inset:0;
    width: var(--cw); height: var(--ch);
    transform-origin: top left;
    /* viewer JS sets --scale */
    transform: scale(var(--scale, 1));
    border:0;
  }
  details.trend-preview { margin-top:10px; }
  details.trend-preview summary { cursor:pointer; font-size:12px; color:#94a3b8; padding:4px 0; }
  details.trend-preview pre { background:#0b1220; border:1px solid #1e293b; border-radius:6px; padding:10px 12px; font-size:12px; line-height:1.5; white-space:pre-wrap; overflow:auto; max-height:300px; color:#cbd5e1; }
</style>
</head>
<body>
<h1>AGW v6 · Trend A/B Comparison
  <span class="sub">Left = current v6 HTML gen (no trend context) · Right = trend research (Gemini + google_search) → HTML gen with trend context</span>
</h1>
${rowsHtml}
<script>
  // Fit each iframe into its aspect-ratio wrapper. iframe renders at canvas
  // size; we CSS-scale it to fit the column width.
  function fit() {
    for (const wrap of document.querySelectorAll('.frame-wrap')) {
      const cw = parseFloat(getComputedStyle(wrap).getPropertyValue('--cw'));
      const boxW = wrap.clientWidth;
      const scale = boxW / cw;
      wrap.style.setProperty('--scale', scale);
    }
  }
  window.addEventListener('resize', fit);
  fit();
  // Re-fit after iframes load (content might change wrap width timing).
  for (const f of document.querySelectorAll('iframe')) {
    f.addEventListener('load', fit);
  }
</script>
</body></html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(OUT_DIR, { recursive: true });
  const allPrompts = JSON.parse(await readFile(PROMPTS_PATH, 'utf8'));

  if (!args['viewer-only']) {
    const apiKey = loadGoogleApiKey();
    const fontFaceStyle = buildFontFaceStyleBlock();
    let prompts = allPrompts;
    if (args.only) prompts = prompts.filter((p) => p.id.startsWith(args.only));
    if (args.limit) prompts = prompts.slice(0, Number.parseInt(args.limit, 10));

    console.log(`[trend-ab] start prompts=${prompts.length} concurrency=${CONCURRENCY}`);
    const startedAt = Date.now();
    const tasks = prompts.map((p) => () => runOne({ apiKey, promptDef: p, fontFaceStyle }));
    await runWithPool(tasks, CONCURRENCY);
    const elapsedMs = Date.now() - startedAt;
    console.log(`[trend-ab] done elapsed=${elapsedMs}ms (~${(elapsedMs / 1000).toFixed(1)}s)`);
  }

  await writeFile(VIEWER_PATH, await buildViewerHtml(allPrompts), 'utf8');
  console.log(`[trend-ab] viewer: file://${VIEWER_PATH}`);
}

main().catch((err) => {
  console.error('[trend-ab] fatal', err);
  process.exit(1);
});
