import { parseLinearGradient } from "./parseGradient.js";
import {
  parseFontWeight,
  parseNumber,
  parsePxNumber,
  parseRotationDeg,
} from "./parseInlineStyle.js";
import type {
  AgentExecutionSlotKey,
  AgentLayerType,
  ParsedDomNode,
} from "./types.js";

const TEXT_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "span"]);

export interface NodeClassification {
  readonly kind: "emit";
  readonly layerType: AgentLayerType;
  readonly slotKey: AgentExecutionSlotKey | null;
  readonly styleTokens: Record<string, unknown>;
  readonly metadata: Record<string, string | number | boolean | null>;
}

export interface NodeRecursion {
  readonly kind: "recurse";
}

export interface NodeSkip {
  readonly kind: "skip";
  readonly reason: "unknown_tag" | "invisible_block" | "text_empty";
}

export type ClassificationResult =
  | NodeClassification
  | NodeRecursion
  | NodeSkip;

export function classifyNode(node: ParsedDomNode): ClassificationResult {
  const tag = node.tag;
  if (tag === "img") return classifyImage(node);
  if (TEXT_TAGS.has(tag)) return classifyText(node);
  if (tag === "div") return classifyDiv(node);
  return { kind: "skip", reason: "unknown_tag" };
}

function classifyText(node: ParsedDomNode): ClassificationResult {
  const text = node.text;
  if (!text) return { kind: "skip", reason: "text_empty" };
  const style = node.style;
  const styleTokens: Record<string, unknown> = {};
  const metadata: Record<string, string | number | boolean | null> = {
    copyText: text,
  };

  const fontSize = parsePxNumber(style["font-size"]);
  if (fontSize !== null) metadata.customFontSize = fontSize;
  if (style["font-family"]) metadata.customFontFamily = style["font-family"];
  const weight = parseFontWeight(style["font-weight"]);
  if (weight !== null) metadata.customFontWeight = weight;

  const align = style["text-align"];
  if (align === "left" || align === "center" || align === "right") {
    styleTokens.textAlign = align;
  }
  if (style.color) styleTokens.fillColor = style.color;

  const lineHeight = parseNumber(style["line-height"]);
  if (lineHeight !== null) metadata.customLineHeight = lineHeight;

  const letterSpacing = parsePxNumber(style["letter-spacing"]);
  if (letterSpacing !== null) metadata.customLetterSpacing = letterSpacing;

  const angle = parseRotationDeg(style.transform);
  if (angle !== null) styleTokens.angle = angle;

  const opacity = parseNumber(style.opacity);
  if (opacity !== null) styleTokens.opacity = opacity;

  return {
    kind: "emit",
    layerType: "text",
    slotKey: null,
    styleTokens,
    metadata,
  };
}

function classifyImage(node: ParsedDomNode): ClassificationResult {
  const src = node.attrs.src ?? "";
  const styleTokens: Record<string, unknown> = {};
  const metadata: Record<string, string | number | boolean | null> = {
    sourceOriginUrl: src || "placeholder://unresolved",
  };

  const aspect = node.attrs["data-aspect"];
  const aspectDims = parseAspect(aspect);
  metadata.sourceWidth = aspectDims.width;
  metadata.sourceHeight = aspectDims.height;
  if (!aspect) metadata.sourceAspectHint = "1:1_default";

  const role = node.attrs["data-tooldi-role"];
  if (role) metadata.role = role;
  const hint = node.attrs["data-hint"];
  if (hint) metadata.hint = hint;

  const angle = parseRotationDeg(node.style.transform);
  if (angle !== null) styleTokens.angle = angle;
  const opacity = parseNumber(node.style.opacity);
  if (opacity !== null) styleTokens.opacity = opacity;

  return {
    kind: "emit",
    layerType: "image",
    slotKey: null,
    styleTokens,
    metadata,
  };
}

function classifyDiv(node: ParsedDomNode): ClassificationResult {
  if (node.children.length > 0) return { kind: "recurse" };
  const style = node.style;
  const hasBgColor = Boolean(style["background-color"]);
  const gradient = parseLinearGradient(
    style["background-image"] ?? style.background,
  );
  const hasBorderRadius = parsePxNumber(style["border-radius"]) !== null;
  if (!hasBgColor && !gradient && !hasBorderRadius) {
    return { kind: "skip", reason: "invisible_block" };
  }
  const styleTokens: Record<string, unknown> = {};
  const metadata: Record<string, string | number | boolean | null> = {
    role: "decoration",
  };

  if (gradient) {
    styleTokens.fillColor = gradient.startColor;
    styleTokens.secondaryColor = gradient.endColor;
    styleTokens.gradientAngle = gradient.angle;
  } else if (hasBgColor) {
    styleTokens.fillColor = style["background-color"] ?? null;
  }
  const cornerRadius = parsePxNumber(style["border-radius"]);
  if (cornerRadius !== null) styleTokens.cornerRadius = cornerRadius;

  const opacity = parseNumber(style.opacity);
  if (opacity !== null) styleTokens.opacity = opacity;
  const angle = parseRotationDeg(style.transform);
  if (angle !== null) styleTokens.angle = angle;

  return {
    kind: "emit",
    layerType: "shape",
    slotKey: null,
    styleTokens,
    metadata,
  };
}

interface AspectDims {
  readonly width: number;
  readonly height: number;
}

export function parseAspect(value: string | undefined): AspectDims {
  if (!value) return { width: 100, height: 100 };
  const match = value.match(/^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/);
  if (!match || match[1] === undefined || match[2] === undefined) {
    return { width: 100, height: 100 };
  }
  const w = Number.parseFloat(match[1]);
  const h = Number.parseFloat(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { width: 100, height: 100 };
  }
  const scale = 100;
  return { width: w * scale, height: h * scale };
}
