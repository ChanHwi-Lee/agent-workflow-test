// AGW v6 primitive mapper — RenderedElement[] → V6PrimitiveCommand[].
//
// Philosophy lock:
//   - 코드는 결과를 추출한다. 분류/추론/heuristic 금지.
//   - 모든 요소는 individual primitive. group 개념 없음.
//   - slot / role / topology / CTA enumeration 없음.
//
// Rules (handoff §Primitive 매핑 규칙):
//   - 텍스트 leaf  → text
//   - <img src=*.jpg*> → image (실사)
//   - <img src=*.png*|placeholder://*> → bitmap (투명 배경 일러스트)
//   - <svg> inline → svg (outerHTML 보존, 내부 decompose 는 향후 Phase)
//   - visible paint 있는 element (bg-color/gradient/border) → rect
//   - text leaf + padding → text bounds 는 content-box 로 inset
//   - visible paint + text leaf 동시 (CTA 패턴) → rect 와 text 2개 primitive 배출
//
// Text bounds 는 element 의 content-box (padding + border inset) 에서 시작한 뒤
// Toolditor text renderer 의 font metric / wrapping 차이를 흡수할 safety 여백을 둔다.
// 이는 border-box 의 getBoundingClientRect 를 그대로 쓰면 padding shrink-to-fit
// 버튼에서 텍스트가 좌측 정렬되는 Phase 0 이슈를 해결한다.

import type {
  V6BorderRadius,
  V6Canvas,
  V6ExtractionResult,
  V6Fill,
  V6GradientStop,
  V6LinearGradient,
  V6MappingResult,
  V6Paint,
  V6PrimitiveCommand,
  V6RadialGradient,
  V6RenderedElement,
  V6Stroke,
  V6UnsupportedPaint,
} from "./v6Types.js";

export function mapRenderedElements(
  extraction: V6ExtractionResult,
): V6MappingResult {
  const context = buildMappingContext(extraction.elements);
  const commands: V6PrimitiveCommand[] = [];
  for (const el of extraction.elements) {
    for (const cmd of mapElement(el, extraction.canvas, context))
      commands.push(cmd);
  }
  return { canvas: extraction.canvas, commands };
}

interface MappingContext {
  readonly clipRadiusByPath: ReadonlyMap<string, V6BorderRadius>;
  readonly elementByPath: ReadonlyMap<string, V6RenderedElement>;
}

function mapElement(
  el: V6RenderedElement,
  canvas: V6Canvas,
  context: MappingContext,
): V6PrimitiveCommand[] {
  if (!el.visible) return [];
  if (el.tagName === "svg") return [buildSvg(el)];
  if (el.tagName === "img") return [buildImage(el, context)];

  const out: V6PrimitiveCommand[] = [];
  if (hasVisiblePaint(el)) out.push(buildRect(el));
  if (el.isTextLeaf && el.text !== null && el.text.length > 0) {
    out.push(buildText(el, canvas));
  }
  return out;
}

// --------- primitive builders ---------

function buildRect(el: V6RenderedElement): V6PrimitiveCommand {
  const paint = pickPaint(el);
  const fill = legacyFillFromPaint(paint);
  const stroke = pickStroke(el);
  const radius = pickBorderRadius(el);
  const shadow =
    el.style.boxShadow && el.style.boxShadow !== "none"
      ? el.style.boxShadow
      : null;
  const opacity = parseOpacity(el.style.opacity);
  const transform = normalizeTransform(el.style.transform);
  const filter = normalizeEffect(el.style.filter ?? "none");

  const cmd = {
    type: "create" as const,
    primitive: "rect" as const,
    source: { serial: el.serial, path: el.path, tag: el.tagName },
    bounds: roundBounds(el.bounds),
    opacity,
    fill,
    borderRadius: radius,
    stroke,
    shadow,
  };
  return {
    ...cmd,
    ...(paint !== null ? { paint } : {}),
    ...(transform ? { transform } : {}),
    ...(filter !== null ? { filter } : {}),
  };
}

function buildText(
  el: V6RenderedElement,
  canvas: V6Canvas,
): V6PrimitiveCommand {
  const color = parseColor(el.style.color);
  const fontSize = parsePx(el.style.fontSize) ?? 16;
  const lineHeightPx = parsePx(el.style.lineHeight);
  const letterSpacing = parsePx(el.style.letterSpacing) ?? 0;
  const opacity = parseOpacity(el.style.opacity);
  const transform = normalizeTransform(el.style.transform);
  const filter = normalizeEffect(el.style.filter ?? "none");
  const textShadow = normalizeEffect(el.style.textShadow ?? "none");

  const pl = parsePx(el.style.paddingLeft) ?? 0;
  const pr = parsePx(el.style.paddingRight) ?? 0;
  const pt = parsePx(el.style.paddingTop) ?? 0;
  const pb = parsePx(el.style.paddingBottom) ?? 0;
  const blw = parsePx(el.style.borderLeftWidth) ?? 0;
  const brw = parsePx(el.style.borderRightWidth) ?? 0;
  const btw = parsePx(el.style.borderTopWidth) ?? 0;
  const bbw = parsePx(el.style.borderBottomWidth) ?? 0;

  const insetBounds = {
    left: round(el.bounds.left + pl + blw),
    top: round(el.bounds.top + pt + btw),
    width: round(Math.max(0, el.bounds.width - pl - pr - blw - brw)),
    height: round(Math.max(0, el.bounds.height - pt - pb - btw - bbw)),
  };
  const textAlign =
    el.style.textAlign === "start"
      ? "left"
      : el.style.textAlign === "end"
        ? "right"
        : el.style.textAlign;
  const safeBounds = computeSafeTextBounds(
    insetBounds,
    fontSize,
    textAlign,
    canvas,
  );

  const cmd = {
    type: "create" as const,
    primitive: "text" as const,
    source: { serial: el.serial, path: el.path, tag: el.tagName },
    bounds: safeBounds,
    opacity,
    text: el.text ?? "",
    fontFamily: el.style.fontFamily,
    fontSize,
    fontWeight: el.style.fontWeight,
    fontStyle: el.style.fontStyle,
    textDecoration: el.style.textDecorationLine,
    textAlign,
    lineHeight:
      lineHeightPx !== null && fontSize > 0
        ? lineHeightPx / fontSize
        : ("normal" as const),
    letterSpacing,
    color: color?.hex ?? "#000000",
  };
  return {
    ...cmd,
    ...(color
      ? { colorAlpha: color.alpha, colorCssColor: color.cssColor }
      : {}),
    ...(textShadow !== null ? { textShadow } : {}),
    ...(transform ? { transform } : {}),
    ...(filter !== null ? { filter } : {}),
  };
}

function computeSafeTextBounds(
  bounds: { left: number; top: number; width: number; height: number },
  fontSize: number,
  textAlign: string,
  canvas: V6Canvas,
): { left: number; top: number; width: number; height: number } {
  const widthPad = Math.max(6, fontSize * 0.25);
  const heightPad = Math.max(8, fontSize * 0.6);
  let left = bounds.left;
  if (textAlign === "center") {
    left -= widthPad / 2;
  } else if (textAlign === "right") {
    left -= widthPad;
  }

  return clampBoundsToCanvas(
    {
      left,
      top: bounds.top,
      width: bounds.width + widthPad,
      height: bounds.height + heightPad,
    },
    canvas,
  );
}

function clampBoundsToCanvas(
  bounds: { left: number; top: number; width: number; height: number },
  canvas: V6Canvas,
): { left: number; top: number; width: number; height: number } {
  const left = Math.max(0, bounds.left);
  const top = Math.max(0, bounds.top);
  const right = Math.min(canvas.width, bounds.left + bounds.width);
  const bottom = Math.min(canvas.height, bounds.top + bounds.height);
  return {
    left: round(left),
    top: round(top),
    width: round(Math.max(0, right - left)),
    height: round(Math.max(0, bottom - top)),
  };
}

function buildImage(
  el: V6RenderedElement,
  context: MappingContext,
): V6PrimitiveCommand {
  const img = el.img;
  if (!img) {
    throw new Error(
      `buildImage called on element without img payload: ${el.path}`,
    );
  }
  const opacity = parseOpacity(el.style.opacity);
  const transform = normalizeTransform(el.style.transform);
  const filter = normalizeEffect(el.style.filter ?? "none");
  const cmd = {
    type: "create" as const,
    primitive: classifyImage(img.src),
    source: { serial: el.serial, path: el.path, tag: el.tagName },
    bounds: roundBounds(el.bounds),
    opacity,
    src: img.src,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    objectFit: el.style.objectFit,
    borderRadius: pickImageBorderRadius(el, context),
    alt: img.alt,
  };
  return {
    ...cmd,
    ...(transform ? { transform } : {}),
    ...(filter !== null ? { filter } : {}),
  };
}

function buildSvg(el: V6RenderedElement): V6PrimitiveCommand {
  const svg = el.svg;
  if (!svg) {
    throw new Error(
      `buildSvg called on element without svg payload: ${el.path}`,
    );
  }
  const opacity = parseOpacity(el.style.opacity);
  const transform = normalizeTransform(el.style.transform);
  const filter = normalizeEffect(el.style.filter ?? "none");
  const cmd = {
    type: "create" as const,
    primitive: "svg" as const,
    source: { serial: el.serial, path: el.path, tag: el.tagName },
    bounds: roundBounds(el.bounds),
    opacity,
    outerHTML: svg.outerHTML,
  };
  return {
    ...cmd,
    ...(transform ? { transform } : {}),
    ...(filter !== null ? { filter } : {}),
  };
}

// --------- style helpers ---------

function buildMappingContext(
  elements: ReadonlyArray<V6RenderedElement>,
): MappingContext {
  const clipRadiusByPath = new Map<string, V6BorderRadius>();
  const elementByPath = new Map<string, V6RenderedElement>();
  for (const el of elements) {
    elementByPath.set(el.path, el);
    if (!el.visible || !hasClippingOverflow(el)) continue;
    const radius = pickBorderRadius(el);
    if (!isZeroBorderRadius(radius)) {
      clipRadiusByPath.set(el.path, radius);
    }
  }
  return { clipRadiusByPath, elementByPath };
}

function hasVisiblePaint(el: V6RenderedElement): boolean {
  if (pickPaint(el) !== null) return true;
  const topBorderWidth = parsePx(el.style.borderTopWidth);
  const topBorderColor = parseColor(el.style.borderTopColor);
  if (
    topBorderWidth &&
    topBorderWidth > 0 &&
    topBorderColor &&
    topBorderColor.alpha > 0
  ) {
    return true;
  }
  return false;
}

function hasClippingOverflow(el: V6RenderedElement): boolean {
  const overflow = el.style.overflow
    .split(/\s+/)
    .map((value) => value.trim().toLowerCase());
  return overflow.includes("hidden") || overflow.includes("clip");
}

function pickPaint(el: V6RenderedElement): V6Paint | null {
  const bgImage = el.style.backgroundImage.trim();
  if (bgImage && bgImage !== "none") {
    return (
      parseLinearGradient(bgImage) ??
      parseRadialGradient(bgImage) ??
      unsupportedPaint(bgImage)
    );
  }

  const c = parseColor(el.style.backgroundColor);
  if (!c || c.alpha <= 0) return null;
  return {
    type: "solid",
    color: c.hex,
    alpha: c.alpha,
    cssColor: c.cssColor,
  };
}

function legacyFillFromPaint(paint: V6Paint | null): V6Fill {
  if (paint === null) return null;
  if (paint.type === "solid") return paint.color;
  return paint;
}

function unsupportedPaint(css: string): V6UnsupportedPaint {
  return {
    type: "unsupported-paint",
    css,
    reason: "unsupported-background-image",
  };
}

function pickStroke(el: V6RenderedElement): V6Stroke | null {
  const w = parsePx(el.style.borderTopWidth);
  const color = parseColor(el.style.borderTopColor);
  if (!w || w === 0 || !color || color.alpha <= 0) return null;
  return {
    color: color.hex,
    width: w,
    alpha: color.alpha,
    cssColor: color.cssColor,
  };
}

function pickBorderRadius(el: V6RenderedElement): V6BorderRadius {
  const tl = parseRadiusPx(el.style.borderTopLeftRadius, el.bounds) ?? 0;
  const tr = parseRadiusPx(el.style.borderTopRightRadius, el.bounds) ?? 0;
  const br = parseRadiusPx(el.style.borderBottomRightRadius, el.bounds) ?? 0;
  const bl = parseRadiusPx(el.style.borderBottomLeftRadius, el.bounds) ?? 0;
  if (tl === tr && tr === br && br === bl) return tl;
  return [tl, tr, br, bl];
}

function pickImageBorderRadius(
  el: V6RenderedElement,
  context: MappingContext,
): V6BorderRadius {
  const selfRadius = pickBorderRadius(el);
  if (!isZeroBorderRadius(selfRadius)) return selfRadius;

  const parentClip = findSameBoundsAncestorClip(el, context);
  return parentClip ?? selfRadius;
}

function findSameBoundsAncestorClip(
  el: V6RenderedElement,
  context: MappingContext,
): V6BorderRadius | null {
  for (const ancestorPath of ancestorPaths(el.path)) {
    const clipRadius = context.clipRadiusByPath.get(ancestorPath);
    if (!clipRadius) continue;
    const ancestor = context.elementByPath.get(ancestorPath);
    if (ancestor && sameBounds(ancestor.bounds, el.bounds)) return clipRadius;
  }
  return null;
}

function ancestorPaths(path: string): string[] {
  const parts = path.split(".");
  const out: string[] = [];
  for (let i = parts.length - 1; i > 0; i -= 1) {
    out.push(parts.slice(0, i).join("."));
  }
  return out;
}

function sameBounds(
  a: V6RenderedElement["bounds"],
  b: V6RenderedElement["bounds"],
): boolean {
  const tolerance = 2;
  return (
    Math.abs(a.left - b.left) <= tolerance &&
    Math.abs(a.top - b.top) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

function isZeroBorderRadius(radius: V6BorderRadius): boolean {
  return Array.isArray(radius)
    ? radius.every((value) => value === 0)
    : radius === 0;
}

function classifyImage(src: string): "image" | "bitmap" {
  const lower = src.toLowerCase();
  if (lower.startsWith("placeholder://")) return "bitmap";
  if (/\.(jpg|jpeg)(?:$|\?)/i.test(lower)) return "image";
  if (/\.png(?:$|\?)/i.test(lower)) return "bitmap";
  if (lower.startsWith("data:image/jpeg")) return "image";
  if (lower.startsWith("data:image/png")) return "bitmap";
  return "bitmap";
}

// --------- parsers ---------

function parsePx(s: string): number | null {
  if (!s || s === "normal" || s === "auto" || s === "none") return null;
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(s);
  return m && m[1] !== undefined ? parseFloat(m[1]) : null;
}

function parseRadiusPx(
  s: string,
  bounds: V6RenderedElement["bounds"],
): number | null {
  if (!s || s === "normal" || s === "auto" || s === "none") return null;
  const tokens = s.split(/\s+/).filter(Boolean);
  const x = parseLengthOrPercentPx(tokens[0] ?? "", bounds.width);
  const y = parseLengthOrPercentPx(tokens[1] ?? tokens[0] ?? "", bounds.height);
  if (x === null && y === null) return null;
  if (x === null) return y;
  if (y === null) return x;
  return round(Math.min(x, y));
}

function parseLengthOrPercentPx(
  token: string,
  axisSize: number,
): number | null {
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(token);
  if (px?.[1] !== undefined) return parseFloat(px[1]);
  const pct = /^(-?\d+(?:\.\d+)?)%$/.exec(token);
  if (pct?.[1] !== undefined) {
    return (Math.max(0, axisSize) * parseFloat(pct[1])) / 100;
  }
  return null;
}

function parseOpacity(s: string): number {
  const v = parseFloat(s);
  return isFinite(v) ? v : 1;
}

function normalizeTransform(s: string): string | undefined {
  if (!s || s === "none") return undefined;
  return s;
}

function normalizeEffect(s: string): string | null {
  if (!s || s === "none") return null;
  return s;
}

interface ParsedColor {
  readonly hex: string;
  readonly alpha: number;
  readonly cssColor: string;
}

export function parseColor(s: string): ParsedColor | null {
  const raw = s.trim();
  if (!raw || raw === "none") return null;
  if (raw.toLowerCase() === "transparent") {
    return { hex: "#000000", alpha: 0, cssColor: "transparent" };
  }

  const hex = parseHexColor(raw);
  if (hex) return hex;

  const m = /^rgba?\(([^)]+)\)$/i.exec(raw);
  if (!m || m[1] === undefined) return null;

  const channels = parseRgbChannels(m[1]);
  if (!channels) return null;
  return parsedColorFromChannels(
    channels.r,
    channels.g,
    channels.b,
    channels.alpha,
    raw,
  );
}

function parseHexColor(raw: string): ParsedColor | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw);
  const body = m?.[1];
  if (body === undefined) return null;

  const expanded =
    body.length === 3 || body.length === 4
      ? body
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : body;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  const alpha =
    expanded.length === 8
      ? roundAlpha(parseInt(expanded.slice(6, 8), 16) / 255)
      : 1;
  return parsedColorFromChannels(r, g, b, alpha, raw.toUpperCase());
}

function parseRgbChannels(
  body: string,
): { r: number; g: number; b: number; alpha: number } | null {
  if (body.includes(",")) {
    const parts = body.split(",").map((p) => p.trim());
    const r = parseCssNumber(parts[0]);
    const g = parseCssNumber(parts[1]);
    const b = parseCssNumber(parts[2]);
    const alpha = parts[3] !== undefined ? parseAlpha(parts[3]) : 1;
    if (r === null || g === null || b === null || alpha === null) return null;
    return { r, g, b, alpha };
  }

  const [channelPart, alphaPart] = body.split("/").map((p) => p.trim());
  if (channelPart === undefined) return null;
  const channels = channelPart.split(/\s+/).filter(Boolean);
  const r = parseCssNumber(channels[0]);
  const g = parseCssNumber(channels[1]);
  const b = parseCssNumber(channels[2]);
  const alpha = alphaPart !== undefined ? parseAlpha(alphaPart) : 1;
  if (r === null || g === null || b === null || alpha === null) return null;
  return { r, g, b, alpha };
}

function parseCssNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw.length === 0) return null;
  if (raw.endsWith("%")) {
    return (parseFloat(raw) / 100) * 255;
  }
  const n = parseFloat(raw);
  return isFinite(n) ? n : null;
}

function parseAlpha(raw: string): number | null {
  const n = raw.trim().endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
  if (!isFinite(n)) return null;
  return roundAlpha(Math.max(0, Math.min(1, n)));
}

function parsedColorFromChannels(
  r: number,
  g: number,
  b: number,
  alpha: number,
  cssColor: string,
): ParsedColor {
  const rounded = [r, g, b].map((n) =>
    Math.max(0, Math.min(255, Math.round(n))),
  );
  const hex =
    "#" +
    rounded
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  return { hex, alpha, cssColor };
}

function roundAlpha(n: number): number {
  return Math.round(n * 10000) / 10000;
}

const DIRECTIONAL_ANGLES: Readonly<Record<string, number>> = {
  top: 0,
  "top right": 45,
  right: 90,
  "bottom right": 135,
  bottom: 180,
  "bottom left": 225,
  left: 270,
  "top left": 315,
};

export function parseLinearGradient(bgImage: string): V6LinearGradient | null {
  if (!bgImage || bgImage === "none") return null;
  const css = bgImage.trim();
  const m = /^linear-gradient\(([\s\S]+)\)$/i.exec(css);
  if (!m || m[1] === undefined) return null;

  const parts = splitTopLevelCommas(m[1]);
  if (parts.length < 2) return null;

  let angle = 180;
  let stopParts = parts;
  const first = parts[0]?.trim() ?? "";
  const angleMatch = /^(-?\d+(?:\.\d+)?)deg$/i.exec(first);
  const toMatch = /^to\s+(.+)$/i.exec(first);
  if (angleMatch && angleMatch[1] !== undefined) {
    angle = parseFloat(angleMatch[1]);
    stopParts = parts.slice(1);
  } else if (toMatch && toMatch[1] !== undefined) {
    const dir = toMatch[1].trim().toLowerCase();
    angle = DIRECTIONAL_ANGLES[dir] ?? 180;
    stopParts = parts.slice(1);
  }
  if (stopParts.length < 2) return null;

  const stops = parseGradientStops(stopParts);
  if (stops === null) return null;

  return { type: "linear-gradient", angle, stops, css };
}

export function parseRadialGradient(bgImage: string): V6RadialGradient | null {
  if (!bgImage || bgImage === "none") return null;
  const css = bgImage.trim();
  const m = /^radial-gradient\(([\s\S]+)\)$/i.exec(css);
  if (!m || m[1] === undefined) return null;

  const parts = splitTopLevelCommas(m[1]);
  if (parts.length < 2) return null;

  let shape: "circle" | "ellipse" | null = null;
  let position: string | null = null;
  let stopParts = parts;

  const first = parts[0]?.trim() ?? "";
  if (!looksLikeGradientStop(first)) {
    const descriptor = first.toLowerCase();
    if (/\bcircle\b/.test(descriptor)) shape = "circle";
    else if (/\bellipse\b/.test(descriptor)) shape = "ellipse";
    const positionMatch = /\bat\s+(.+)$/i.exec(first);
    position = positionMatch?.[1]?.trim() ?? null;
    stopParts = parts.slice(1);
  }

  if (stopParts.length < 2) return null;
  const stops = parseGradientStops(stopParts);
  if (stops === null) return null;

  return { type: "radial-gradient", shape, position, stops, css };
}

function parseGradientStops(
  stopParts: ReadonlyArray<string>,
): V6GradientStop[] | null {
  const stops: V6GradientStop[] = [];
  for (let idx = 0; idx < stopParts.length; idx += 1) {
    const stop = parseGradientStop(stopParts[idx] ?? "", idx, stopParts.length);
    if (stop === null) return null;
    stops.push(stop);
  }
  return stops;
}

function parseGradientStop(
  rawStop: string,
  idx: number,
  count: number,
): V6GradientStop | null {
  const colorMatch =
    /^(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)(?:\s+(-?\d+(?:\.\d+)?%))?(?:\s+-?\d+(?:\.\d+)?%)?$/.exec(
      rawStop.trim(),
    );
  const rawColor = colorMatch?.[1] ?? "";
  if (!rawColor) return null;

  const parsed = parseColor(rawColor);
  const percent = colorMatch?.[2];
  const offset =
    percent !== undefined
      ? parseFloat(percent) / 100
      : count <= 1
        ? 0
        : idx / (count - 1);

  if (parsed) {
    return {
      color: parsed.hex,
      offset,
      alpha: parsed.alpha,
      cssColor: parsed.cssColor,
    };
  }

  return {
    color: rawColor.toUpperCase(),
    offset,
    alpha: 1,
    cssColor: rawColor,
  };
}

function looksLikeGradientStop(part: string): boolean {
  const trimmed = part.trim();
  const lower = trimmed.toLowerCase();
  if (/^(circle|ellipse)\b/.test(lower) || /\bat\s+/.test(lower)) return false;
  return /^(rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)(?:\s|$)/.test(trimmed);
}

function splitTopLevelCommas(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of s) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(buf.trim());
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

// --------- small utils ---------

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundBounds(
  b: V6RenderedElement["bounds"],
): V6RenderedElement["bounds"] {
  return {
    left: round(b.left),
    top: round(b.top),
    width: round(b.width),
    height: round(b.height),
  };
}
