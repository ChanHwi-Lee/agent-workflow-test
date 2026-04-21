// AGW v6 Phase 0 PoC — visual round-trip verification.
//
// For each sample:
//   1. Render samples/<name>.html        → screenshots/<name>.original.png
//   2. Reconstruct commands/<name>.json as minimal HTML → screenshots/<name>.reconstructed.png
//   3. Emit screenshots/<name>.side-by-side.png (original | reconstructed)
//
// This lets us inspect whether extract → map preserves visual fidelity,
// without yet standing up a real Toolditor render path.

import { chromium } from 'playwright';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(__dirname, 'samples');
const COMMANDS_DIR = join(__dirname, 'commands');
const OUT_DIR = join(__dirname, 'screenshots');

const TRANSPARENT_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const TRANSPARENT_PNG = Buffer.from(TRANSPARENT_PNG_B64, 'base64');

function fillToCss(fill) {
  if (!fill) return 'transparent';
  if (typeof fill === 'string') return fill;
  if (fill.type === 'linear-gradient') {
    const stops = fill.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ');
    return `linear-gradient(${fill.angle}deg, ${stops})`;
  }
  return 'transparent';
}

function radiusToCss(r) {
  if (r == null) return '0';
  if (typeof r === 'number') return `${r}px`;
  if (Array.isArray(r)) return r.map((v) => `${v}px`).join(' ');
  return '0';
}

function renderCommand(cmd) {
  const { bounds, opacity } = cmd;
  const base = `position:absolute;left:${bounds.left}px;top:${bounds.top}px;width:${bounds.width}px;height:${bounds.height}px;opacity:${opacity};`;

  if (cmd.primitive === 'rect') {
    const fill = fillToCss(cmd.fill);
    const radius = radiusToCss(cmd.borderRadius);
    let border = '';
    if (cmd.stroke) border = `border:${cmd.stroke.width}px solid ${cmd.stroke.color};box-sizing:border-box;`;
    const bgKey = typeof cmd.fill === 'string' ? 'background-color' : 'background-image';
    return `<div style="${base}${bgKey}:${fill};border-radius:${radius};${border}"></div>`;
  }

  if (cmd.primitive === 'text') {
    const lh =
      cmd.lineHeight === 'normal'
        ? 'normal'
        : typeof cmd.lineHeight === 'number'
          ? cmd.lineHeight
          : 'normal';
    return `<div style="${base}color:${cmd.color};font-family:${cmd.fontFamily};font-size:${cmd.fontSize}px;font-weight:${cmd.fontWeight};font-style:${cmd.fontStyle};text-align:${cmd.textAlign};line-height:${lh};letter-spacing:${cmd.letterSpacing}px;text-decoration:${cmd.textDecoration};white-space:pre-wrap;">${escapeHtml(cmd.text)}</div>`;
  }

  if (cmd.primitive === 'bitmap' || cmd.primitive === 'image') {
    const radius = radiusToCss(cmd.borderRadius);
    return `<img src="${escapeHtml(cmd.src)}" style="${base}object-fit:${cmd.objectFit};border-radius:${radius};"/>`;
  }

  if (cmd.primitive === 'svg') {
    // outerHTML already carries width/height/viewBox; wrap in absolutely positioned div.
    return `<div style="${base}">${cmd.outerHTML.replace(/position:absolute;/g, '').replace(/left:\s*\d+(?:\.\d+)?px;/g, '').replace(/top:\s*\d+(?:\.\d+)?px;/g, '').replace(/right:\s*\d+(?:\.\d+)?px;/g, '').replace(/bottom:\s*\d+(?:\.\d+)?px;/g, '')}</div>`;
  }

  return '';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function commandsToHtml(doc) {
  const parts = doc.commands.map(renderCommand).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;">
<div style="position:relative;width:${doc.canvas.width}px;height:${doc.canvas.height}px;overflow:hidden;">
${parts}
</div>
</body></html>`;
}

async function screenshot(page, html, outPath, width, height) {
  await page.route(/^placeholder:\/\//, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG })
  );
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  });
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width, height } });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const samples = (await readdir(SAMPLES_DIR)).filter((f) => f.endsWith('.html')).sort();

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 628 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();

    for (const f of samples) {
      const name = basename(f, '.html');
      const originalHtml = await readFile(join(SAMPLES_DIR, f), 'utf8');
      const doc = JSON.parse(await readFile(join(COMMANDS_DIR, `${name}.json`), 'utf8'));
      const reconHtml = commandsToHtml(doc);

      const originalPath = join(OUT_DIR, `${name}.original.png`);
      const reconPath = join(OUT_DIR, `${name}.reconstructed.png`);
      const reconHtmlPath = join(OUT_DIR, `${name}.reconstructed.html`);

      await writeFile(reconHtmlPath, reconHtml, 'utf8');
      await screenshot(page, originalHtml, originalPath, doc.canvas.width, doc.canvas.height);
      await screenshot(page, reconHtml, reconPath, doc.canvas.width, doc.canvas.height);

      console.log(`[verify] ${name}: original + reconstructed written`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
