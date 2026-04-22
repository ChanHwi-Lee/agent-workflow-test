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
  V6PrimitiveCommand,
  V6RenderedElement,
  V6Stroke,
} from "./v6Types.js";

export function mapRenderedElements(
  extraction: V6ExtractionResult,
): V6MappingResult {
  const commands: V6PrimitiveCommand[] = [];
  for (const el of extraction.elements) {
    for (const cmd of mapElement(el, extraction.canvas)) commands.push(cmd);
  }
  return { canvas: extraction.canvas, commands };
}

function mapElement(
  el: V6RenderedElement,
  canvas: V6Canvas,
): V6PrimitiveCommand[] {
  if (!el.visible) return [];
  if (el.tagName === "svg") return [buildSvg(el)];
  if (el.tagName === "img") return [buildImage(el)];

  const out: V6PrimitiveCommand[] = [];
  if (hasVisiblePaint(el)) out.push(buildRect(el));
  if (el.isTextLeaf && el.text !== null && el.text.length > 0) {
    out.push(buildText(el, canvas));
  }
  return out;
}

// --------- primitive builders ---------

function buildRect(el: V6RenderedElement): V6PrimitiveCommand {
  const fill = pickFill(el);
  const stroke = pickStroke(el);
  const radius = pickBorderRadius(el);
  const shadow =
    el.style.boxShadow && el.style.boxShadow !== "none"
      ? el.style.boxShadow
      : null;
  const opacity = parseOpacity(el.style.opacity);
  const transform = normalizeTransform(el.style.transform);

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
  return transform ? { ...cmd, transform } : cmd;
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
  return transform ? { ...cmd, transform } : cmd;
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

function buildImage(el: V6RenderedElement): V6PrimitiveCommand {
  const img = el.img;
  if (!img) {
    throw new Error(
      `buildImage called on element without img payload: ${el.path}`,
    );
  }
  const opacity = parseOpacity(el.style.opacity);
  const transform = normalizeTransform(el.style.transform);
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
    borderRadius: pickBorderRadius(el),
    alt: img.alt,
  };
  return transform ? { ...cmd, transform } : cmd;
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
  const cmd = {
    type: "create" as const,
    primitive: "svg" as const,
    source: { serial: el.serial, path: el.path, tag: el.tagName },
    bounds: roundBounds(el.bounds),
    opacity,
    outerHTML: svg.outerHTML,
  };
  return transform ? { ...cmd, transform } : cmd;
}

// --------- style helpers ---------

function hasVisiblePaint(el: V6RenderedElement): boolean {
  const bg = parseColor(el.style.backgroundColor);
  if (bg && bg.alpha > 0) return true;
  if (el.style.backgroundImage && el.style.backgroundImage !== "none")
    return true;
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

function pickFill(el: V6RenderedElement): V6Fill {
  const grad = parseLinearGradient(el.style.backgroundImage);
  if (grad) return grad;
  const c = parseColor(el.style.backgroundColor);
  return c ? c.hex : null;
}

function pickStroke(el: V6RenderedElement): V6Stroke | null {
  const w = parsePx(el.style.borderTopWidth);
  const color = parseColor(el.style.borderTopColor);
  if (!w || w === 0 || !color) return null;
  return { color: color.hex, width: w };
}

function pickBorderRadius(el: V6RenderedElement): V6BorderRadius {
  const tl = parsePx(el.style.borderTopLeftRadius) ?? 0;
  const tr = parsePx(el.style.borderTopRightRadius) ?? 0;
  const br = parsePx(el.style.borderBottomRightRadius) ?? 0;
  const bl = parsePx(el.style.borderBottomLeftRadius) ?? 0;
  if (tl === tr && tr === br && br === bl) return tl;
  return [tl, tr, br, bl];
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

function parseOpacity(s: string): number {
  const v = parseFloat(s);
  return isFinite(v) ? v : 1;
}

function normalizeTransform(s: string): string | undefined {
  if (!s || s === "none") return undefined;
  return s;
}

interface ParsedColor {
  readonly hex: string;
  readonly alpha: number;
}

export function parseColor(s: string): ParsedColor | null {
  if (!s || s === "none" || s === "transparent") return null;
  const m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (!m || m[1] === undefined) return null;
  const nums = m[1].split(",").map((p) => parseFloat(p.trim()));
  const r = nums[0];
  const g = nums[1];
  const b = nums[2];
  const a = nums.length >= 4 && nums[3] !== undefined ? nums[3] : 1;
  if (r === undefined || g === undefined || b === undefined) return null;
  if (a === 0) return null;
  const hex =
    "#" +
    [r, g, b]
      .map((n) =>
        Math.max(0, Math.min(255, Math.round(n)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase();
  return { hex, alpha: a };
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
  const m = /^linear-gradient\(([\s\S]+)\)$/i.exec(bgImage.trim());
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

  const stops: V6GradientStop[] = stopParts.map((sp, idx) => {
    const colorMatch =
      /^(rgba?\([^)]+\)|#[0-9a-fA-F]+|[a-zA-Z]+)(?:\s+(\d+(?:\.\d+)?%))?$/.exec(
        sp,
      );
    const rawColor = colorMatch?.[1] ?? "";
    const parsed = parseColor(rawColor);
    const hex = parsed?.hex ?? rawColor.toUpperCase();
    const percent = colorMatch?.[2];
    const offset =
      percent !== undefined
        ? parseFloat(percent) / 100
        : stopParts.length <= 1
          ? 0
          : idx / (stopParts.length - 1);
    return { color: hex, offset };
  });

  return { type: "linear-gradient", angle, stops };
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
