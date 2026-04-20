import type { AgentBounds, ParsedStyle } from "./types.js";

export function parseInlineStyle(
  input: string | undefined | null,
): ParsedStyle {
  if (!input) return Object.freeze({});
  const decls: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === ";" && depth === 0) {
      if (buf.trim()) decls.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) decls.push(buf);
  const result: Record<string, string> = {};
  for (const decl of decls) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;
    const key = decl.slice(0, colonIdx).trim().toLowerCase();
    const value = decl.slice(colonIdx + 1).trim();
    if (!key || !value) continue;
    result[key] = value;
  }
  return Object.freeze(result);
}

export function parsePxNumber(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*(?:px)?$/);
  if (!match || match[1] === undefined) return null;
  return Number.parseFloat(match[1]);
}

export function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const FONT_WEIGHT_KEYWORDS: Record<string, number> = {
  normal: 400,
  bold: 700,
  bolder: 800,
  lighter: 300,
};

export function parseFontWeight(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  const keyword = FONT_WEIGHT_KEYWORDS[trimmed];
  if (keyword !== undefined) return keyword;
  return parseNumber(trimmed);
}

export function parseRotationDeg(
  transformValue: string | undefined,
): number | null {
  if (!transformValue) return null;
  const match = transformValue.match(
    /rotate\(\s*(-?\d+(?:\.\d+)?)\s*deg\s*\)/i,
  );
  if (!match || match[1] === undefined) return null;
  return Number.parseFloat(match[1]);
}

export function parseBounds(style: ParsedStyle): AgentBounds | null {
  const x = parsePxNumber(style.left);
  const y = parsePxNumber(style.top);
  const width = parsePxNumber(style.width);
  const height = parsePxNumber(style.height);
  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width, height };
}
