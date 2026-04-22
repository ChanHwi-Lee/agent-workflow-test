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
// parentRef.position 은 "append" 로 고정. v6 commands 는 DOM traversal 순서를
// 그대로 유지하므로 append 가 곧 visual z-order.
//
// clientLayerKey / commandId 는 runId + sequence 로 결정적 생성해 리플레이 가능.

import type { CreateLayerCommand, JsonValue } from "@tooldi/agent-contracts";

import { parseFirstFontFamily } from "./v6FontRegistry.js";
import type {
  V6ImageCommand,
  V6LinearGradient,
  V6PrimitiveCommand,
  V6RectCommand,
  V6SvgCommand,
  V6TextCommand,
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
  if (cmd.fill !== null) {
    if (typeof cmd.fill === "string") {
      tokens.fillColor = cmd.fill;
    } else {
      tokens.fill = gradientTokens(cmd.fill);
    }
  }
  tokens.borderRadius = normalizeBorderRadius(cmd.borderRadius);
  if (cmd.stroke !== null) {
    tokens.stroke = { color: cmd.stroke.color, width: cmd.stroke.width };
  }
  if (cmd.shadow !== null) {
    tokens.shadow = cmd.shadow;
  }
  return tokens;
}

function textTokens(cmd: V6TextCommand): Record<string, unknown> {
  const fontFamily = parseFirstFontFamily(cmd.fontFamily);
  const fontWeight = normalizeToolditorFontWeight(fontFamily, cmd.fontWeight);
  return {
    fillColor: cmd.color,
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
      return base;
  }
}

function normalizeToolditorFontWeight(
  fontFamily: string,
  computedFontWeight: string,
): string {
  const suffix = /_(\d{3,4})$/.exec(fontFamily)?.[1];
  return suffix ?? computedFontWeight;
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

function gradientTokens(g: V6LinearGradient): Record<string, unknown> {
  return {
    type: g.type,
    angle: g.angle,
    stops: g.stops.map((s) => ({ color: s.color, offset: s.offset })),
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
