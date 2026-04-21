// AGW v6 Phase 0 PoC — RenderedElement[] → ToolditorCommand[]
//
// 철학:
//   - 시스템이 layout family 를 정의하지 않는다.
//   - 모든 primitive 는 individual. group 개념 사용 안 함.
//
// Input:  extracted/<name>.json  (from extract.mjs)
// Output: commands/<name>.json   (intermediate ToolditorCommand[] for Phase 0)

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IN_DIR = join(__dirname, 'extracted');
const OUT_DIR = join(__dirname, 'commands');

// ---------- parsing helpers ----------

function parsePx(s) {
  if (!s || s === 'normal' || s === 'auto' || s === 'none') return null;
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(s);
  return m ? parseFloat(m[1]) : null;
}

function parseColor(s) {
  if (!s || s === 'none' || s === 'transparent') return null;
  let m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (!m) return null;
  const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
  const [r, g, b, a = 1] = parts;
  if (a === 0) return null;
  const hex =
    '#' +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  return { hex, alpha: a };
}

// linear-gradient(135deg, rgb(255, 179, 71), rgb(255, 112, 67))
function parseLinearGradient(bgImage) {
  if (!bgImage || bgImage === 'none') return null;
  const m = /^linear-gradient\(([\s\S]+)\)$/i.exec(bgImage.trim());
  if (!m) return null;

  // Split top-level commas (not inside rgb(...) parens).
  const parts = [];
  let depth = 0;
  let buf = '';
  for (const ch of m[1]) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf.trim());

  // First token may be an angle or "to ..." or a color (defaults to 180deg / "to bottom").
  let angle = 180;
  let stopParts = parts;
  const angleMatch = /^(-?\d+(?:\.\d+)?)deg$/i.exec(parts[0]);
  const toMatch = /^to\s+(.+)$/i.exec(parts[0]);
  if (angleMatch) {
    angle = parseFloat(angleMatch[1]);
    stopParts = parts.slice(1);
  } else if (toMatch) {
    const dir = toMatch[1].trim().toLowerCase();
    const map = {
      top: 0,
      'top right': 45,
      right: 90,
      'bottom right': 135,
      bottom: 180,
      'bottom left': 225,
      left: 270,
      'top left': 315,
    };
    angle = map[dir] ?? 180;
    stopParts = parts.slice(1);
  }

  const stops = stopParts.map((sp, idx) => {
    const colorMatch = /^(rgba?\([^)]+\)|#[0-9a-fA-F]+|[a-z]+)(?:\s+(\d+(?:\.\d+)?%))?$/i.exec(sp);
    if (!colorMatch) return { color: null, offset: idx / Math.max(1, stopParts.length - 1) };
    const color = parseColor(colorMatch[1]) || { hex: colorMatch[1].toUpperCase(), alpha: 1 };
    const offset = colorMatch[2]
      ? parseFloat(colorMatch[2]) / 100
      : stopParts.length === 1
        ? 0
        : idx / (stopParts.length - 1);
    return { color: color.hex, offset };
  });

  return { type: 'linear-gradient', angle, stops };
}

function hasVisiblePaint(style) {
  const bg = parseColor(style.backgroundColor);
  if (bg && bg.alpha > 0) return true;
  if (style.backgroundImage && style.backgroundImage !== 'none') return true;
  const bw = parsePx(style.borderTopWidth);
  if (bw && parseColor(style.borderTopColor)) return true;
  return false;
}

function pickBorderRadius(style) {
  const tl = parsePx(style.borderTopLeftRadius) ?? 0;
  const tr = parsePx(style.borderTopRightRadius) ?? 0;
  const br = parsePx(style.borderBottomRightRadius) ?? 0;
  const bl = parsePx(style.borderBottomLeftRadius) ?? 0;
  if (tl === tr && tr === br && br === bl) return tl;
  return [tl, tr, br, bl];
}

function pickStroke(style) {
  const w = parsePx(style.borderTopWidth);
  const color = parseColor(style.borderTopColor);
  if (!w || w === 0 || !color) return null;
  return { color: color.hex, width: w };
}

function pickFill(style) {
  const bgImage = parseLinearGradient(style.backgroundImage);
  if (bgImage) return bgImage;
  const c = parseColor(style.backgroundColor);
  return c ? c.hex : null;
}

// ---------- image classification ----------

function classifyImage(src) {
  const lower = (src || '').toLowerCase();
  if (lower.startsWith('placeholder://')) return 'bitmap';
  if (/\.(jpg|jpeg)(?:$|\?)/i.test(lower)) return 'image';
  if (/\.png(?:$|\?)/i.test(lower)) return 'bitmap';
  if (lower.startsWith('data:image/jpeg')) return 'image';
  if (lower.startsWith('data:image/png')) return 'bitmap';
  return 'bitmap';
}

// ---------- primitive builders ----------

function commonProps(el) {
  const opacity = parseFloat(el.style.opacity);
  const props = {
    bounds: {
      left: round(el.bounds.left),
      top: round(el.bounds.top),
      width: round(el.bounds.width),
      height: round(el.bounds.height),
    },
    opacity: isFinite(opacity) ? opacity : 1,
  };
  if (el.style.transform && el.style.transform !== 'none') {
    props.transform = el.style.transform;
  }
  return props;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function buildRect(el) {
  const fill = pickFill(el.style);
  const stroke = pickStroke(el.style);
  const radius = pickBorderRadius(el.style);
  const shadow = el.style.boxShadow && el.style.boxShadow !== 'none' ? el.style.boxShadow : null;

  return {
    type: 'create',
    primitive: 'rect',
    source: { serial: el.serial, path: el.path, tag: el.tagName },
    ...commonProps(el),
    fill,
    borderRadius: radius,
    stroke,
    shadow,
  };
}

function buildText(el) {
  const color = parseColor(el.style.color);
  const fontSize = parsePx(el.style.fontSize) ?? 16;
  const lineHeightPx = parsePx(el.style.lineHeight);
  const letterSpacing = parsePx(el.style.letterSpacing) ?? 0;

  // Inset text bounds by padding + border so the text primitive sits in
  // the element's content box, matching what the browser actually rendered.
  const pt = parsePx(el.style.paddingTop) ?? 0;
  const pr = parsePx(el.style.paddingRight) ?? 0;
  const pb = parsePx(el.style.paddingBottom) ?? 0;
  const pl = parsePx(el.style.paddingLeft) ?? 0;
  const btw = parsePx(el.style.borderTopWidth) ?? 0;
  const brw = parsePx(el.style.borderRightWidth) ?? 0;
  const bbw = parsePx(el.style.borderBottomWidth) ?? 0;
  const blw = parsePx(el.style.borderLeftWidth) ?? 0;

  const base = commonProps(el);
  const insetBounds = {
    left: round(base.bounds.left + pl + blw),
    top: round(base.bounds.top + pt + btw),
    width: round(Math.max(0, base.bounds.width - pl - pr - blw - brw)),
    height: round(Math.max(0, base.bounds.height - pt - pb - btw - bbw)),
  };

  return {
    type: 'create',
    primitive: 'text',
    source: { serial: el.serial, path: el.path, tag: el.tagName },
    bounds: insetBounds,
    opacity: base.opacity,
    ...(base.transform ? { transform: base.transform } : {}),
    text: el.text,
    fontFamily: el.style.fontFamily,
    fontSize,
    fontWeight: el.style.fontWeight,
    fontStyle: el.style.fontStyle,
    textDecoration: el.style.textDecorationLine,
    textAlign: el.style.textAlign === 'start' ? 'left' : el.style.textAlign,
    lineHeight: lineHeightPx ? lineHeightPx / fontSize : 'normal',
    letterSpacing,
    color: color ? color.hex : '#000000',
  };
}

function buildImage(el) {
  const primitive = classifyImage(el.img.src);
  return {
    type: 'create',
    primitive, // 'image' for jpg (photo), 'bitmap' for png (transparent illust)
    source: { serial: el.serial, path: el.path, tag: el.tagName },
    ...commonProps(el),
    src: el.img.src,
    naturalWidth: el.img.naturalWidth,
    naturalHeight: el.img.naturalHeight,
    objectFit: el.style.objectFit,
    borderRadius: pickBorderRadius(el.style),
    alt: el.img.alt,
  };
}

function buildSvg(el) {
  return {
    type: 'create',
    primitive: 'svg',
    source: { serial: el.serial, path: el.path, tag: el.tagName },
    ...commonProps(el),
    outerHTML: el.svg.outerHTML,
  };
}

// ---------- mapping logic ----------

function mapElement(el) {
  if (!el.visible) return [];
  if (el.tagName === 'svg') return [buildSvg(el)];
  if (el.tagName === 'img') return [buildImage(el)];

  const out = [];
  const paint = hasVisiblePaint(el.style);
  if (paint) out.push(buildRect(el));
  if (el.isTextLeaf && el.text) out.push(buildText(el));
  return out;
}

function mapDocument(doc) {
  const commands = [];
  for (const el of doc.elements) {
    // Skip the root <div> only if it's the canvas-sized wrapper with no paint.
    // With paint (bg color/gradient), emit it as a page-sized rect.
    for (const cmd of mapElement(el)) commands.push(cmd);
  }
  return { canvas: doc.canvas, commands };
}

// ---------- main ----------

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const files = (await readdir(IN_DIR)).filter((f) => f.endsWith('.json')).sort();

  for (const f of files) {
    const doc = JSON.parse(await readFile(join(IN_DIR, f), 'utf8'));
    const name = basename(f, '.json');
    const out = mapDocument(doc);
    const outPath = join(OUT_DIR, `${name}.json`);
    await writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
    const counts = out.commands.reduce((acc, c) => {
      acc[c.primitive] = (acc[c.primitive] || 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    console.log(`[map] ${name}: ${out.commands.length} cmds (${summary}) → ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
