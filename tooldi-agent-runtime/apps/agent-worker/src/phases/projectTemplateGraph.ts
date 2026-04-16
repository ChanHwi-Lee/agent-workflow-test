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

// ---------------------------------------------------------------------------
// Utility functions — duplicated from buildReferenceResetPath.ts
// These are module-private there, so we copy the small helpers here to keep
// the existing pipeline untouched.
// ---------------------------------------------------------------------------

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readObjectArray(value: unknown): CanvasObject[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is CanvasObject =>
          typeof entry === "object" && entry !== null,
      )
    : [];
}

function flattenObjects(objects: CanvasObject[]): CanvasObject[] {
  return objects.flatMap((object) => {
    const children = readObjectArray(object.objects);
    return children.length > 0
      ? [object, ...flattenObjects(children)]
      : [object];
  });
}

function readBounds(object: CanvasObject): LayoutBounds | null {
  const width = asNumber(object.width);
  const height = asNumber(object.height);
  const left = asNumber(object.left) ?? asNumber(object.left_from_zero);
  const top = asNumber(object.top) ?? asNumber(object.top_from_zero);
  if (width === null || height === null || left === null || top === null) {
    return null;
  }
  const originX =
    typeof object.originX === "string" ? object.originX : "left";
  const originY =
    typeof object.originY === "string" ? object.originY : "top";
  const x =
    originX === "center"
      ? left - width / 2
      : originX === "right"
        ? left - width
        : left;
  const y =
    originY === "center"
      ? top - height / 2
      : originY === "bottom"
        ? top - height
        : top;
  return { x, y, width, height };
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
    const first = stops.find((entry) => typeof entry?.color === "string");
    return typeof first?.color === "string" ? first.color : null;
  }
  return null;
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

function readSourceUrl(object: CanvasObject): string | null {
  return typeof object.originSrc === "string"
    ? object.originSrc
    : typeof object.src === "string"
      ? object.src
      : null;
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
  canvasArea: number,
): { weight: VisualWeight; prominence: number } {
  const area = bounds.width * bounds.height;
  const areaRatio = canvasArea > 0 ? area / canvasArea : 0;

  // Background: covers ≥80% of canvas
  if (areaRatio >= 0.8) {
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

  // Full-bleed objects
  if (areaRatio >= 0.8) return "full";

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

/**
 * Detect composite hints (e.g., group that contains shape+text = "button").
 */
function detectCompositeHint(
  object: CanvasObject,
): "button" | "badge" | null {
  const children = readObjectArray(object.objects);
  if (children.length < 2) return null;

  const hasText = children.some(isTextLikeObject);
  const hasShape = children.some((child) => {
    const type = typeof child.type === "string" ? child.type : "";
    return (
      type === "rect" ||
      type === "path" ||
      type === "ellipse" ||
      type === "circle"
    );
  });

  if (!hasText || !hasShape) return null;

  // Small groups with shape+text are likely buttons or badges
  const bounds = readBounds(object);
  if (!bounds) return null;

  const area = bounds.width * bounds.height;
  // Heuristic: small compact groups are badges, medium are buttons
  if (area < 3000) return "badge";
  return "button";
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
  const canvasWidth = asNumber(input.page.width) ?? 1200;
  const canvasHeight = asNumber(input.page.height) ?? 628;
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
    const sourceText = isTextLikeObject(obj) ? readText(obj) : null;
    const fontSize =
      isTextLikeObject(obj) ? readEffectiveFontSize(obj, bounds) : null;

    const { weight, prominence } = computeVisualWeight(
      layerType,
      bounds,
      fontSize,
      canvasArea,
    );
    const zone = computeZone(bounds, canvasWidth, canvasHeight);
    const compositeHint =
      layerType === "group" ? detectCompositeHint(obj) : null;

    // For groups with composite hint, extract text from children
    let groupText = sourceText;
    if (compositeHint && !groupText) {
      const children = readObjectArray(obj.objects);
      const textChild = children.find(isTextLikeObject);
      if (textChild) {
        groupText = readText(textChild);
      }
    }

    idCounter++;
    projectedObjects.push({
      objectId: `obj-${String(idCounter).padStart(3, "0")}`,
      layerType,
      bounds,
      sourceText: groupText,
      fontSize,
      fillColorHex: readFillColor(obj),
      fontFamily: readFontFamily(obj),
      textAlign: isTextLikeObject(obj) ? readTextAlign(obj) : null,
      sourceOriginUrl: layerType === "image" ? readSourceUrl(obj) : null,
      sourceWidth: layerType === "image" ? asNumber(obj.imageWidth) ?? asNumber(obj.width) : null,
      sourceHeight: layerType === "image" ? asNumber(obj.imageHeight) ?? asNumber(obj.height) : null,
      visualWeight: weight,
      zone,
      prominence,
      compositeHint,
    });
  }

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
