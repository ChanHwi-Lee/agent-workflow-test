/**
 * projectTemplateGraph.ts
 *
 * SSOT: template-aware adaptive composition — Layer 2 (Template Object Graph)
 *
 * Produces a projected object graph from a Fabric.js template page.
 * No semantic role classification (no display_text/promo_surface/action_surface).
 * Only observable properties + computable annotations (visualWeight, zone).
 */

import type {
  LayoutBounds,
  ProjectedObject,
  ProjectedObjectGraph,
  SpatialZone,
  VisualWeight,
} from "../types.js";

// ---------------------------------------------------------------------------
// Internal type alias (matches buildReferenceResetPath convention)
// ---------------------------------------------------------------------------
type CanvasObject = Record<string, unknown>;
type FlattenContext = {
  centerX: number;
  centerY: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
};

// ---------------------------------------------------------------------------
// Utility functions — duplicated from buildReferenceResetPath.ts
// These are module-private there, so we copy the small helpers here to keep
// the existing pipeline untouched.
// ---------------------------------------------------------------------------

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readObjectArray(value: unknown): CanvasObject[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is CanvasObject =>
          typeof entry === "object" && entry !== null,
      )
    : [];
}

function flattenObjects(
  objects: CanvasObject[],
  context: FlattenContext | null = null,
): CanvasObject[] {
  return objects.flatMap((originalObject) => {
    const object = applyParentTransform(originalObject, context);
    const children = readObjectArray(originalObject.objects);
    if (children.length === 0) {
      return [object];
    }
    const nextContext = createChildContext(object);
    return [object, ...flattenObjects(children, nextContext)];
  });
}

function applyParentTransform(
  object: CanvasObject,
  context: FlattenContext | null,
): CanvasObject {
  if (!context) {
    return object;
  }
  const rawLeft = asNumber(object.left_from_zero) ?? asNumber(object.left) ?? 0;
  const rawTop = asNumber(object.top_from_zero) ?? asNumber(object.top) ?? 0;
  const nextScaleX = (asNumber(object.scaleX) ?? 1) * context.scaleX;
  const nextScaleY = (asNumber(object.scaleY) ?? 1) * context.scaleY;
  const nextLeft = context.centerX + rawLeft * context.scaleX;
  const nextTop = context.centerY + rawTop * context.scaleY;
  const nextOpacity = (asNumber(object.opacity) ?? 1) * context.opacity;
  return {
    ...object,
    left: nextLeft,
    top: nextTop,
    left_from_zero: nextLeft,
    top_from_zero: nextTop,
    scaleX: nextScaleX,
    scaleY: nextScaleY,
    opacity: nextOpacity,
  };
}

function createChildContext(object: CanvasObject): FlattenContext {
  const bounds = readBounds(object) ?? {
    x: asNumber(object.left_from_zero) ?? asNumber(object.left) ?? 0,
    y: asNumber(object.top_from_zero) ?? asNumber(object.top) ?? 0,
    width: estimateWidth(object),
    height: estimateHeight(object),
  };
  return {
    centerX: bounds.x + bounds.width / 2,
    centerY: bounds.y + bounds.height / 2,
    scaleX: asNumber(object.scaleX) ?? 1,
    scaleY: asNumber(object.scaleY) ?? 1,
    opacity: asNumber(object.opacity) ?? 1,
  };
}

function readBounds(object: CanvasObject): LayoutBounds | null {
  const width = estimateWidth(object);
  const height = estimateHeight(object);
  const x = resolveOriginAdjustedCoordinate(
    asNumber(object.left_from_zero) ?? asNumber(object.left),
    width,
    typeof object.originX === "string" ? object.originX : null,
  );
  const y = resolveOriginAdjustedCoordinate(
    asNumber(object.top_from_zero) ?? asNumber(object.top),
    height,
    typeof object.originY === "string" ? object.originY : null,
  );
  if (x === null || y === null || width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height };
}

function resolveOriginAdjustedCoordinate(
  rawValue: number | null,
  size: number,
  origin: string | null,
): number | null {
  if (rawValue === null) {
    return null;
  }
  switch (origin) {
    case "center":
      return rawValue - size / 2;
    case "right":
    case "bottom":
      return rawValue - size;
    default:
      return rawValue;
  }
}

function estimateWidth(object: CanvasObject): number {
  return (asNumber(object.width) ?? 0) * (asNumber(object.scaleX) ?? 1);
}

function estimateHeight(object: CanvasObject): number {
  return (asNumber(object.height) ?? 0) * (asNumber(object.scaleY) ?? 1);
}

function readText(object: CanvasObject): string | null {
  return typeof object.text === "string" && object.text.trim().length > 0
    ? object.text.trim()
    : null;
}

function readEffectiveFontSize(
  object: CanvasObject,
  bounds: LayoutBounds,
): number | null {
  const direct = asNumber(object.fontSize);
  if (direct !== null) {
    return direct;
  }
  const styles = object.styles;
  if (styles && typeof styles === "object") {
    for (const lineStyles of Object.values(
      styles as Record<string, unknown>,
    )) {
      if (!lineStyles || typeof lineStyles !== "object") {
        continue;
      }
      for (const charStyle of Object.values(
        lineStyles as Record<string, unknown>,
      )) {
        if (!charStyle || typeof charStyle !== "object") {
          continue;
        }
        const styledSize = asNumber(
          (charStyle as Record<string, unknown>).fontSize,
        );
        if (styledSize !== null) {
          return styledSize;
        }
      }
    }
  }
  if (bounds.height <= 0) {
    return null;
  }
  return Math.max(16, Math.min(160, Math.round(bounds.height * 0.78)));
}

function readFillColor(object: CanvasObject): string | null {
  const fill = object.fill;
  if (typeof fill === "string") {
    return fill;
  }
  if (
    fill &&
    typeof fill === "object" &&
    "colorStops" in fill &&
    Array.isArray((fill as { colorStops?: unknown[] }).colorStops)
  ) {
    const stops = (fill as { colorStops: Array<{ color?: unknown }> })
      .colorStops;
    const colors = stops
      .map((entry) => (typeof entry?.color === "string" ? entry.color : null))
      .filter((entry): entry is string => entry !== null);
    return colors.length > 0 ? colors[colors.length - 1] ?? null : null;
  }
  return null;
}

function readSecondaryFillColor(object: CanvasObject): string | null {
  const fill = object.fill;
  if (
    fill &&
    typeof fill === "object" &&
    "colorStops" in fill &&
    Array.isArray((fill as { colorStops?: unknown[] }).colorStops)
  ) {
    const stops = (fill as { colorStops: Array<{ color?: unknown }> })
      .colorStops
      .map((entry) => (typeof entry?.color === "string" ? entry.color : null))
      .filter((entry): entry is string => entry !== null);
    if (stops.length >= 2) {
      return stops[0] ?? null;
    }
  }
  return null;
}

function readCornerRadius(object: CanvasObject): number | null {
  return asNumber(object.rx) ?? asNumber(object.ry) ?? null;
}

function readTextAlign(
  object: CanvasObject,
): "left" | "center" | "right" | null {
  return object.textAlign === "left" ||
    object.textAlign === "center" ||
    object.textAlign === "right"
    ? object.textAlign
    : null;
}

function readFontFamily(object: CanvasObject): string | null {
  return typeof object.fontFamily === "string" ? object.fontFamily : null;
}

function readFontWeight(object: CanvasObject): number | null {
  const direct = asNumber(object.fontWeight);
  if (direct !== null) {
    return direct;
  }
  const styles = object.styles;
  if (styles && typeof styles === "object") {
    for (const lineStyles of Object.values(
      styles as Record<string, unknown>,
    )) {
      if (!lineStyles || typeof lineStyles !== "object") {
        continue;
      }
      for (const charStyle of Object.values(
        lineStyles as Record<string, unknown>,
      )) {
        if (!charStyle || typeof charStyle !== "object") {
          continue;
        }
        const styledWeight = asNumber(
          (charStyle as Record<string, unknown>).fontWeight,
        );
        if (styledWeight !== null) {
          return styledWeight;
        }
      }
    }
  }
  return null;
}

function readSourceUrl(object: CanvasObject): string | null {
  return typeof object.originSrc === "string"
    ? object.originSrc
    : typeof object.src === "string"
      ? object.src
      : null;
}

function readClipDimension(
  page: Record<string, unknown>,
  dimension: "width" | "height",
): number | null {
  const clipPath =
    page.clipPath && typeof page.clipPath === "object"
      ? (page.clipPath as Record<string, unknown>)
      : null;
  return clipPath ? asNumber(clipPath[dimension]) : null;
}

function isTextLikeObject(object: CanvasObject): boolean {
  const type = typeof object.type === "string" ? object.type : "";
  return type === "text" || type === "textbox" || type === "i-text";
}

// ---------------------------------------------------------------------------
// New: computable annotation helpers
// ---------------------------------------------------------------------------

function resolveLayerType(
  object: CanvasObject,
): "text" | "shape" | "group" | "image" {
  const type = typeof object.type === "string" ? object.type : "";
  if (isTextLikeObject(object)) return "text";
  if (
    type === "image" ||
    type === "picture" ||
    type === "bitmap" ||
    type === "illust"
  )
    return "image";
  const children = readObjectArray(object.objects);
  if (type === "group" || children.length > 0) return "group";
  return "shape";
}

/**
 * Compute visual weight from observable metrics.
 * Reuses the same prominence formula as buildReferenceResetPath.ts:
 *   text:  (fontSize ?? 0) * 100 + area
 *   other: area
 *
 * Then maps the raw prominence to a categorical weight relative to canvas area.
 */
function computeVisualWeight(
  layerType: "text" | "shape" | "group" | "image",
  bounds: LayoutBounds,
  fontSize: number | null,
  canvasWidth: number,
  canvasHeight: number,
  canvasArea: number,
): { weight: VisualWeight; prominence: number } {
  const area = bounds.width * bounds.height;
  const areaRatio = canvasArea > 0 ? area / canvasArea : 0;

  if (areaRatio >= 0.8 && isFullBleedCandidate(bounds, canvasWidth, canvasHeight)) {
    return { weight: "background", prominence: area };
  }

  if (layerType === "text") {
    const prominence = (fontSize ?? 0) * 100 + area;
    if (fontSize !== null && fontSize >= 48) return { weight: "dominant", prominence };
    if (fontSize !== null && fontSize >= 24) return { weight: "secondary", prominence };
    if (fontSize !== null && fontSize >= 14) return { weight: "tertiary", prominence };
    return { weight: "decorative", prominence };
  }

  // Non-text: weight by area ratio
  const prominence = area;
  if (areaRatio >= 0.15) return { weight: "secondary", prominence };
  if (areaRatio >= 0.03) return { weight: "tertiary", prominence };
  return { weight: "decorative", prominence };
}

/**
 * Compute spatial zone from object bounds relative to canvas.
 */
function computeZone(
  bounds: LayoutBounds,
  canvasWidth: number,
  canvasHeight: number,
): SpatialZone {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const areaRatio =
    canvasWidth * canvasHeight > 0
      ? (bounds.width * bounds.height) / (canvasWidth * canvasHeight)
      : 0;

  if (areaRatio >= 0.8 && isFullBleedCandidate(bounds, canvasWidth, canvasHeight)) {
    return "full";
  }

  const isLeft = cx < canvasWidth * 0.33;
  const isRight = cx > canvasWidth * 0.67;
  const isTop = cy < canvasHeight * 0.33;
  const isBottom = cy > canvasHeight * 0.67;

  if (isTop && isLeft) return "top-left";
  if (isTop && isRight) return "top-right";
  if (isBottom && isLeft) return "bottom-left";
  if (isBottom && isRight) return "bottom-right";
  if (isTop) return "top";
  if (isBottom) return "bottom";
  if (isLeft) return "left";
  if (isRight) return "right";
  return "center";
}

function isFullBleedCandidate(
  bounds: LayoutBounds,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  const toleranceX = Math.max(12, canvasWidth * 0.02);
  const toleranceY = Math.max(12, canvasHeight * 0.02);
  return (
    Math.abs(bounds.x) <= toleranceX &&
    Math.abs(bounds.y) <= toleranceY &&
    Math.abs(bounds.x + bounds.width - canvasWidth) <= toleranceX &&
    Math.abs(bounds.y + bounds.height - canvasHeight) <= toleranceY
  );
}

function annotateLocalSurfaceContext(objects: ProjectedObject[]): void {
  const shapeObjects = objects.filter(
    (obj) =>
      obj.layerType === "shape" &&
      obj.fillColorHex !== null &&
      obj.visualWeight !== "background",
  );
  for (const textObject of objects) {
    if (textObject.layerType !== "text") {
      continue;
    }
    const backingSurface = findBestBackingSurface(textObject, shapeObjects);
    if (!backingSurface) {
      continue;
    }
    textObject.backingSurfaceObjectId = backingSurface.objectId;
    textObject.backingSurfaceColorHex = backingSurface.fillColorHex;
    textObject.backingSurfaceBounds = backingSurface.bounds;
  }
}

function findBestBackingSurface(
  textObject: ProjectedObject,
  shapeObjects: ProjectedObject[],
): ProjectedObject | null {
  const candidates = shapeObjects
    .filter((shapeObject) =>
      shapeObject.objectId !== textObject.objectId &&
      shapeObject.fillColorHex !== null &&
      overlapRatio(textObject.bounds, shapeObject.bounds) >= 0.85 &&
      enclosesBounds(shapeObject.bounds, textObject.bounds),
    )
    .sort((left, right) => {
      const leftArea = left.bounds.width * left.bounds.height;
      const rightArea = right.bounds.width * right.bounds.height;
      return leftArea - rightArea;
    });
  return candidates[0] ?? null;
}

function overlapRatio(bounds: LayoutBounds, other: LayoutBounds): number {
  const overlapWidth = Math.max(
    0,
    Math.min(bounds.x + bounds.width, other.x + other.width) -
      Math.max(bounds.x, other.x),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(bounds.y + bounds.height, other.y + other.height) -
      Math.max(bounds.y, other.y),
  );
  if (overlapWidth <= 0 || overlapHeight <= 0) {
    return 0;
  }
  return (overlapWidth * overlapHeight) / Math.max(bounds.width * bounds.height, 1);
}

function enclosesBounds(outer: LayoutBounds, inner: LayoutBounds): boolean {
  const slackX = Math.max(8, inner.width * 0.08);
  const slackY = Math.max(8, inner.height * 0.2);
  return (
    outer.x <= inner.x + slackX &&
    outer.y <= inner.y + slackY &&
    outer.x + outer.width >= inner.x + inner.width - slackX &&
    outer.y + outer.height >= inner.y + inner.height - slackY
  );
}

// ---------------------------------------------------------------------------
// Main projection function
// ---------------------------------------------------------------------------

export interface ProjectTemplateGraphInput {
  runId: string;
  traceId: string;
  templateCode: string;
  templateTitle: string;
  page: Record<string, unknown>;
}

export function projectTemplateObjectGraph(
  input: ProjectTemplateGraphInput,
): ProjectedObjectGraph {
  const canvasWidth =
    asNumber(input.page.width) ?? readClipDimension(input.page, "width") ?? 1200;
  const canvasHeight =
    asNumber(input.page.height) ?? readClipDimension(input.page, "height") ?? 628;
  const canvasArea = canvasWidth * canvasHeight;

  const rawObjects = readObjectArray(input.page.objects);
  const flatObjects = flattenObjects(rawObjects);

  const projectedObjects: ProjectedObject[] = [];
  let idCounter = 0;

  for (const obj of flatObjects) {
    const bounds = readBounds(obj);
    if (!bounds) continue;

    // Skip invisible or off-canvas objects
    if (bounds.width <= 0 || bounds.height <= 0) continue;
    const opacity = asNumber(obj.opacity);
    if (opacity !== null && opacity <= 0) continue;

    // Skip objects entirely outside canvas bounds (with tolerance)
    const tolerance = 20;
    if (
      bounds.x + bounds.width < -tolerance ||
      bounds.y + bounds.height < -tolerance ||
      bounds.x > canvasWidth + tolerance ||
      bounds.y > canvasHeight + tolerance
    ) {
      continue;
    }

    const layerType = resolveLayerType(obj);

    // SSOT §3.2: "group hierarchy를 재귀적으로 풀어서 flat list로 만든다."
    // group 오브젝트 자체는 projected graph에서 제외한다.
    // children은 flattenObjects()에 의해 이미 개별 오브젝트로 포함되어 있으므로 정보 손실 없음.
    // group을 포함하면 executor가 createLayer(group)을 emit하고 FE가 미지원 에러를 발생시킨다.
    if (layerType === "group") continue;

    const sourceText = isTextLikeObject(obj) ? readText(obj) : null;
    const fontSize =
      isTextLikeObject(obj) ? readEffectiveFontSize(obj, bounds) : null;

    const { weight, prominence } = computeVisualWeight(
      layerType,
      bounds,
      fontSize,
      canvasWidth,
      canvasHeight,
      canvasArea,
    );
    const zone = computeZone(bounds, canvasWidth, canvasHeight);

    idCounter++;
    projectedObjects.push({
      objectId: `obj-${String(idCounter).padStart(3, "0")}`,
      layerType,
      bounds,
      sourceText,
      fontSize,
      fillColorHex: readFillColor(obj),
      secondaryFillColorHex: readSecondaryFillColor(obj),
      fontFamily: readFontFamily(obj),
      fontWeight: isTextLikeObject(obj) ? readFontWeight(obj) : null,
      textAlign: isTextLikeObject(obj) ? readTextAlign(obj) : null,
      sourceOriginUrl: layerType === "image" ? readSourceUrl(obj) : null,
      sourceWidth: layerType === "image" ? asNumber(obj.imageWidth) ?? asNumber(obj.width) : null,
      sourceHeight: layerType === "image" ? asNumber(obj.imageHeight) ?? asNumber(obj.height) : null,
      sourceCropX: layerType === "image" ? asNumber(obj.cropX) : null,
      sourceCropY: layerType === "image" ? asNumber(obj.cropY) : null,
      sourceObjectScaleX: layerType === "image" ? asNumber(obj.scaleX) : null,
      sourceObjectScaleY: layerType === "image" ? asNumber(obj.scaleY) : null,
      sourceImageScaleX: layerType === "image" ? asNumber(obj.imageScaleX) : null,
      sourceImageScaleY: layerType === "image" ? asNumber(obj.imageScaleY) : null,
      sourceAngle: layerType === "image" ? asNumber(obj.angle) : null,
      sourceOpacity: layerType === "image" ? asNumber(obj.opacity) : null,
      sourceFlipX:
        layerType === "image" ? (typeof obj.flipX === "boolean" ? obj.flipX : null) : null,
      sourceFlipY:
        layerType === "image" ? (typeof obj.flipY === "boolean" ? obj.flipY : null) : null,
      ...(layerType === "shape"
        ? {
            sourceAngle: asNumber(obj.angle),
            sourceOpacity: asNumber(obj.opacity),
            sourceCornerRadius: readCornerRadius(obj),
          }
        : {}),
      visualWeight: weight,
      zone,
      prominence,
      backingSurfaceObjectId: null,
      backingSurfaceColorHex: null,
      backingSurfaceBounds: null,
      compositeHint: null,
    });
  }

  annotateLocalSurfaceContext(projectedObjects);

  // Sort by prominence descending (most visually important first)
  projectedObjects.sort((a, b) => b.prominence - a.prominence);

  const graphId = `proj_${input.runId}_${Date.now()}`;
  const weightCounts = projectedObjects.reduce(
    (acc, obj) => {
      acc[obj.visualWeight] = (acc[obj.visualWeight] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    graphId,
    runId: input.runId,
    traceId: input.traceId,
    templateCode: input.templateCode,
    templateTitle: input.templateTitle,
    canvasWidth,
    canvasHeight,
    objects: projectedObjects,
    objectCount: projectedObjects.length,
    summary:
      `Projected ${projectedObjects.length} objects from "${input.templateTitle}" (${canvasWidth}x${canvasHeight}). ` +
      `Weight distribution: ${Object.entries(weightCounts).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
  };
}
