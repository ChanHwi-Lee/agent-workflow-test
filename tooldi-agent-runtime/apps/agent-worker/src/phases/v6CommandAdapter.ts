// AGW v6 command adapter — V6PrimitiveCommand[] → CreateLayerCommand[].
//
// Phase 2 (contracts 확장) 를 전제로 한 lossless 변환.
//   - rect    → layerType "shape"
//   - text    → layerType "text"
//   - image   → layerType "image"   (실사 jpg)
//   - bitmap  → layerType "bitmap"  (투명 일러스트 png / placeholder)
//   - svg     → layerType "svg"     (outerHTML 보존)
//
// executionSlotKey 는 **항상 null**. v6 는 semantic slot / role / CTA 개념을
// 쓰지 않는다. 모든 primitive 는 individual, slot-free.
//
// parentRef.position 은 "append" 로 고정. v6 mapper 가 browser computed
// z-index 기반 stacking order 로 commands 를 정렬하므로 append 가 visual
// z-order 를 재현한다.
//
// clientLayerKey / commandId 는 runId + sequence 로 결정적 생성해 리플레이 가능.

import type { CreateLayerCommand, JsonValue } from "@tooldi/agent-contracts";

import { parseFirstFontFamily } from "./v6FontRegistry.js";
import type {
  V6ImageCommand,
  V6LinearGradient,
  V6Paint,
  V6PrimitiveCommand,
  V6RadialGradient,
  V6RectCommand,
  V6SvgCommand,
  V6SolidPaint,
  V6Stroke,
  V6TextCommand,
  V6UnsupportedPaint,
} from "./v6Types.js";

type VisibleLayerType = CreateLayerCommand["layerBlueprint"]["layerType"];

export interface V6AdapterOptions {
  readonly runId: string;
}

export interface V6AdapterResult {
  readonly commands: ReadonlyArray<CreateLayerCommand>;
}

export function adaptV6Commands(
  commands: ReadonlyArray<V6PrimitiveCommand>,
  options: V6AdapterOptions,
): V6AdapterResult {
  const out: CreateLayerCommand[] = [];
  for (const cmd of commands) {
    out.push(adaptOne(cmd, options, out.length + 1));
  }
  return { commands: out };
}

function adaptOne(
  cmd: V6PrimitiveCommand,
  options: V6AdapterOptions,
  seq: number,
): CreateLayerCommand {
  const layerType = mapLayerType(cmd);
  const clientLayerKey = buildClientLayerKey(options.runId, seq, layerType);
  const commandId = buildCommandId(options.runId, seq);
  const bounds = {
    x: cmd.bounds.left,
    y: cmd.bounds.top,
    width: Math.max(1, cmd.bounds.width),
    height: Math.max(1, cmd.bounds.height),
  };
  const styleTokens = buildStyleTokens(cmd) as Record<string, JsonValue>;
  const metadata = buildMetadata(cmd);

  return {
    commandId,
    op: "createLayer",
    executionSlotKey: null,
    clientLayerKey,
    targetRef: { layerId: null, clientLayerKey },
    targetLayerVersion: null,
    parentRef: { position: "append" },
    expectedLayerType: null,
    allowNoop: false,
    metadataTags: {},
    layerBlueprint: {
      layerType,
      bounds,
      styleTokens,
      metadata,
    },
    editable: true,
  };
}

function mapLayerType(cmd: V6PrimitiveCommand): VisibleLayerType {
  switch (cmd.primitive) {
    case "rect":
      return "shape";
    case "text":
      return "text";
    case "image":
      return "image";
    case "bitmap":
      return "bitmap";
    case "svg":
      return "svg";
  }
}

function buildStyleTokens(cmd: V6PrimitiveCommand): Record<string, unknown> {
  const base: Record<string, unknown> = {
    opacity: cmd.opacity,
  };
  if (cmd.transform !== undefined) {
    base.transform = cmd.transform;
  }
  if (cmd.filter) {
    base.filter = cmd.filter;
  }
  switch (cmd.primitive) {
    case "rect":
      return { ...base, ...rectTokens(cmd) };
    case "text":
      return { ...base, ...textTokens(cmd) };
    case "image":
    case "bitmap":
      return { ...base, ...imageTokens(cmd) };
    case "svg":
      return base;
  }
}

function rectTokens(cmd: V6RectCommand): Record<string, unknown> {
  const tokens: Record<string, unknown> = {};
  const paint = resolveRectPaint(cmd);
  if (paint !== null) {
    appendPaintTokens(tokens, paint);
  }
  tokens.borderRadius = normalizeBorderRadius(cmd.borderRadius);
  if (cmd.stroke !== null) {
    tokens.stroke = { color: cmd.stroke.color, width: cmd.stroke.width };
    tokens.strokePaint = strokePaintTokens(cmd.stroke);
  }
  if (cmd.shadow !== null) {
    tokens.shadow = cmd.shadow;
    tokens.boxShadow = cmd.shadow;
  }
  return tokens;
}

function textTokens(cmd: V6TextCommand): Record<string, unknown> {
  const fontFamily = parseFirstFontFamily(cmd.fontFamily);
  const fontWeight = normalizeToolditorFontWeight(fontFamily, cmd.fontWeight);
  const tokens: Record<string, unknown> = {
    fillColor: cmd.color,
    fillPaint: solidPaintTokens({
      type: "solid",
      color: cmd.color,
      alpha: cmd.colorAlpha ?? 1,
      cssColor: cmd.colorCssColor ?? cmd.color,
    }),
    // Phase 2.5: Playwright's computed-style fontFamily is the full CSS cascade
    // ("\"701_400\", sans-serif"). Toolditor expects the first token only,
    // which is the Toolditor ID we injected in v6FontRegistry.
    fontFamily,
    fontSize: cmd.fontSize,
    fontWeight,
    fontStyle: cmd.fontStyle,
    textAlign: cmd.textAlign,
    lineHeight: cmd.lineHeight === "normal" ? null : cmd.lineHeight,
    letterSpacing: cmd.letterSpacing,
    textDecoration: cmd.textDecoration,
  };
  if (cmd.textShadow) {
    tokens.textShadow = cmd.textShadow;
  }
  return tokens;
}

function imageTokens(cmd: V6ImageCommand): Record<string, unknown> {
  return {
    objectFit: cmd.objectFit,
    borderRadius: normalizeBorderRadius(cmd.borderRadius),
  };
}

function buildMetadata(
  cmd: V6PrimitiveCommand,
): Record<string, string | number | boolean | null> {
  const base: Record<string, string | number | boolean | null> = {
    v6Primitive: cmd.primitive,
    sourceSerial: cmd.source.serial,
    sourcePath: cmd.source.path,
    sourceTag: cmd.source.tag,
  };
  switch (cmd.primitive) {
    case "text":
      return metadataForText(base, cmd);
    case "image":
    case "bitmap":
      return metadataForImage(base, cmd);
    case "svg":
      return metadataForSvg(base, cmd);
    case "rect":
      return metadataForRect(base, cmd);
  }
}

function normalizeToolditorFontWeight(
  fontFamily: string,
  computedFontWeight: string,
): string {
  const suffix = /_(\d{3,4})$/.exec(fontFamily)?.[1];
  return suffix ?? computedFontWeight;
}

function metadataForRect(
  base: Record<string, string | number | boolean | null>,
  cmd: V6RectCommand,
): Record<string, string | number | boolean | null> {
  const paint = resolveRectPaint(cmd);
  if (paint?.type !== "unsupported-paint") return base;
  return {
    ...base,
    v6PaintWarning: paint.reason,
    unsupportedPaintCss: paint.css,
    unsupportedPaintReason: paint.reason,
  };
}

function metadataForText(
  base: Record<string, string | number | boolean | null>,
  cmd: V6TextCommand,
): Record<string, string | number | boolean | null> {
  const fontFamily = parseFirstFontFamily(cmd.fontFamily);
  const normalizedWeight = normalizeToolditorFontWeight(
    fontFamily,
    cmd.fontWeight,
  );
  const metadata: Record<string, string | number | boolean | null> = {
    ...base,
    text: cmd.text,
  };
  if (normalizedWeight !== cmd.fontWeight) {
    metadata.computedFontWeight = cmd.fontWeight;
    metadata.normalizedFontWeight = normalizedWeight;
  }
  return metadata;
}

function metadataForImage(
  base: Record<string, string | number | boolean | null>,
  cmd: V6ImageCommand,
): Record<string, string | number | boolean | null> {
  const metadata: Record<string, string | number | boolean | null> = {
    ...base,
    src: cmd.src,
    naturalWidth: cmd.naturalWidth,
    naturalHeight: cmd.naturalHeight,
    alt: cmd.alt,
  };
  if (cmd.resolvedAssetId !== undefined) {
    metadata.resolvedAssetId = cmd.resolvedAssetId;
  }
  if (cmd.resolvedAssetFamily !== undefined) {
    metadata.resolvedAssetFamily = cmd.resolvedAssetFamily;
  }
  if (cmd.resolvedAssetSourceSerial !== undefined) {
    metadata.resolvedAssetSourceSerial = cmd.resolvedAssetSourceSerial;
  }
  if (cmd.resolvedAssetOriginKey !== undefined) {
    metadata.resolvedAssetOriginKey = cmd.resolvedAssetOriginKey;
  }
  if (cmd.resolvedAssetThumbKey !== undefined) {
    metadata.resolvedAssetThumbKey = cmd.resolvedAssetThumbKey;
  }
  if (cmd.resolvedAssetMethod !== undefined) {
    metadata.resolvedAssetMethod = cmd.resolvedAssetMethod;
  }
  if (cmd.generatedAssetId !== undefined) {
    metadata.generatedAssetId = cmd.generatedAssetId;
  }
  if (cmd.generatedAssetProvider !== undefined) {
    metadata.generatedAssetProvider = cmd.generatedAssetProvider;
  }
  if (cmd.generatedAssetModel !== undefined) {
    metadata.generatedAssetModel = cmd.generatedAssetModel;
  }
  if (cmd.generatedAssetPrompt !== undefined) {
    metadata.generatedAssetPrompt = cmd.generatedAssetPrompt;
  }
  if (cmd.generatedAssetMethod !== undefined) {
    metadata.generatedAssetMethod = cmd.generatedAssetMethod;
  }
  if (cmd.assetSelectionDecision !== undefined) {
    metadata.assetSelectionDecision = cmd.assetSelectionDecision;
  }
  if (cmd.assetSelectionConfidence !== undefined) {
    metadata.assetSelectionConfidence = cmd.assetSelectionConfidence;
  }
  if (cmd.assetSelectionReason !== undefined) {
    metadata.assetSelectionReason = cmd.assetSelectionReason;
  }
  if (cmd.unresolvedPlaceholder !== undefined) {
    metadata.unresolvedPlaceholder = cmd.unresolvedPlaceholder;
  }
  if (cmd.placeholderUri !== undefined) {
    metadata.placeholderUri = cmd.placeholderUri;
  }
  if (cmd.placeholderHint !== undefined) {
    metadata.placeholderHint = cmd.placeholderHint;
  }
  if (cmd.unresolveReason !== undefined) {
    metadata.unresolveReason = cmd.unresolveReason;
  }
  return metadata;
}

function metadataForSvg(
  base: Record<string, string | number | boolean | null>,
  cmd: V6SvgCommand,
): Record<string, string | number | boolean | null> {
  return {
    ...base,
    outerHTML: cmd.outerHTML,
  };
}

function normalizeBorderRadius(
  r: number | readonly [number, number, number, number],
): number | Record<string, number> {
  if (typeof r === "number") return r;
  return {
    topLeft: r[0],
    topRight: r[1],
    bottomRight: r[2],
    bottomLeft: r[3],
  };
}

function resolveRectPaint(cmd: V6RectCommand): V6Paint | null {
  if (cmd.paint !== undefined) return cmd.paint;
  if (cmd.fill === null) return null;
  if (typeof cmd.fill === "string") {
    return {
      type: "solid",
      color: cmd.fill,
      alpha: 1,
      cssColor: cmd.fill,
    };
  }
  return cmd.fill;
}

function appendPaintTokens(
  tokens: Record<string, unknown>,
  paint: V6Paint,
): void {
  switch (paint.type) {
    case "solid":
      tokens.fillColor = paint.color;
      tokens.fillPaint = solidPaintTokens(paint);
      break;
    case "linear-gradient":
    case "radial-gradient": {
      const fill = gradientTokens(paint);
      tokens.fill = fill;
      tokens.fillPaint = fill;
      break;
    }
    case "unsupported-paint": {
      const fill = unsupportedPaintTokens(paint);
      tokens.fill = fill;
      tokens.fillPaint = fill;
      tokens.paintWarning = paint.reason;
      break;
    }
  }
}

function solidPaintTokens(paint: V6SolidPaint): Record<string, unknown> {
  return {
    type: "solid",
    color: paint.color,
    alpha: paint.alpha,
    cssColor: paint.cssColor,
  };
}

function strokePaintTokens(stroke: V6Stroke): Record<string, unknown> {
  return {
    type: "solid",
    color: stroke.color,
    width: stroke.width,
    alpha: stroke.alpha ?? 1,
    cssColor: stroke.cssColor ?? stroke.color,
  };
}

function gradientTokens(
  g: V6LinearGradient | V6RadialGradient,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: g.type,
    stops: g.stops.map((s) => ({
      color: s.color,
      offset: s.offset,
      alpha: s.alpha ?? 1,
      cssColor: s.cssColor ?? s.color,
    })),
  };
  if (g.css !== undefined) {
    out.css = g.css;
  }
  if (g.type === "linear-gradient") {
    out.angle = g.angle;
  } else {
    out.shape = g.shape;
    out.position = g.position;
  }
  return out;
}

function unsupportedPaintTokens(
  paint: V6UnsupportedPaint,
): Record<string, unknown> {
  return {
    type: paint.type,
    css: paint.css,
    reason: paint.reason,
  };
}

function buildClientLayerKey(
  runId: string,
  seq: number,
  layerType: VisibleLayerType,
): string {
  return `v6:${runId}:${String(seq).padStart(3, "0")}:${layerType}`;
}

function buildCommandId(runId: string, seq: number): string {
  return `cmd:${runId}:${String(seq).padStart(3, "0")}`;
}
