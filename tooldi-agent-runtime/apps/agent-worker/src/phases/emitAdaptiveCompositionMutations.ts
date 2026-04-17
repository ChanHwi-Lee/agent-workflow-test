/**
 * emitAdaptiveCompositionMutations.ts
 *
 * SSOT: template-aware adaptive composition — Layer 4 bridge
 *
 * Converts AdaptiveCompositionDecision + ProjectedObjectGraph
 * into a SkeletonMutationBatch that the existing execution pipeline
 * (prepare_execution → emit_stage → await_ack) can consume directly.
 *
 * Since the canvas starts empty, ALL operations produce createLayer commands.
 */

import type { CanvasMutationCommand, ExecutionSlotKey } from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";

import type {
  AdaptiveCompositionDecision,
  AddDecision,
  ElementDecision,
  LayoutBounds,
  MutationProposalDraft,
  ProjectedObject,
  ProjectedObjectGraph,
  SceneBindingPlan,
  SceneStylePlan,
  SkeletonMutationBatch,
  VisualWeight,
} from "../types.js";
import { buildCreateLayerCommand } from "./layerCommandBuilder.js";
import {
  calculateRelativeLuminance,
  normalizeHexColor,
  resolveReadabilityPalette,
} from "./mutationReadabilityPolicy.js";
import type { StyleMetadata, TypographyMetadata } from "./planInputParsers.js";
import {
  getAdaptiveVocabularyEntry,
  type AdaptiveVocabularyId,
} from "./adaptiveVocabularyRegistry.js";

type AdaptiveStyleContext = {
  readabilityPalette: ReturnType<typeof resolveReadabilityPalette>;
  sceneBindingPlan: SceneBindingPlan | null;
  typography: TypographyMetadata | null;
  styleMetadata: StyleMetadata | null;
};

// ---------------------------------------------------------------------------
// FE-compatible executionSlotKey mapping
// ---------------------------------------------------------------------------

function mapVisualWeightToExecutionSlot(
  weight: VisualWeight,
  layerType: "text" | "shape" | "group" | "image",
  compositeHint: "button" | "badge" | null,
): { executionSlotKey: ExecutionSlotKey | null } {
  if (compositeHint === "button")
    return { executionSlotKey: "cta" };
  if (compositeHint === "badge")
    return { executionSlotKey: "badge_text" };

  if (weight === "background")
    return { executionSlotKey: "background" };

  if (layerType === "image")
    return { executionSlotKey: null };

  if (layerType === "text") {
    if (weight === "dominant")
      return { executionSlotKey: "headline" };
    if (weight === "secondary")
      return { executionSlotKey: "offer_line" };
    if (weight === "tertiary")
      return { executionSlotKey: "footer_note" };
    return { executionSlotKey: "footer_note" };
  }

  // shape / decorative
  return { executionSlotKey: null };
}

function mapAddVocabularyToExecutionSlot(vocabularyId: string): {
  executionSlotKey: ExecutionSlotKey | null;
  layerType: "text" | "shape" | "group";
  fontRole: "display" | "body" | undefined;
} {
  const entry = getAdaptiveVocabularyEntry(vocabularyId as AdaptiveVocabularyId);
  return {
    executionSlotKey: entry.executionSlotKey,
    layerType: entry.layerType,
    fontRole: entry.fontRole,
  };
}

// ---------------------------------------------------------------------------
// Bounds normalization: reference canvas → target canvas
// ---------------------------------------------------------------------------

function normalizeBounds(
  obj: ProjectedObject,
  executionSlotKey: ExecutionSlotKey | null,
  refCanvas: { width: number; height: number },
  targetCanvas: { width: number; height: number },
): LayoutBounds {
  return scaleAndClampBounds(
    obj.bounds,
    executionSlotKey,
    obj.visualWeight,
    refCanvas,
    targetCanvas,
  );
}

function scaleAndClampBounds(
  sourceBounds: LayoutBounds,
  executionSlotKey: ExecutionSlotKey | null,
  visualWeight: VisualWeight | null,
  refCanvas: { width: number; height: number },
  targetCanvas: { width: number; height: number },
): LayoutBounds {
  if (executionSlotKey === "background" || visualWeight === "background") {
    return { x: 0, y: 0, width: targetCanvas.width, height: targetCanvas.height };
  }

  const scaleX = targetCanvas.width / refCanvas.width;
  const scaleY = targetCanvas.height / refCanvas.height;

  const scaled: LayoutBounds = {
    x: sourceBounds.x * scaleX,
    y: sourceBounds.y * scaleY,
    width: sourceBounds.width * scaleX,
    height: sourceBounds.height * scaleY,
  };

  // Clamp content bounds to stay within target canvas
  const margin = targetCanvas.width * 0.04;
  if (scaled.width > targetCanvas.width - margin * 2) {
    scaled.width = targetCanvas.width - margin * 2;
    scaled.x = margin;
  }
  if (scaled.x < 0) scaled.x = margin;
  if (scaled.y < 0) scaled.y = margin;
  if (scaled.x + scaled.width > targetCanvas.width) {
    scaled.x = targetCanvas.width - scaled.width - margin;
  }
  if (scaled.y + scaled.height > targetCanvas.height) {
    scaled.y = targetCanvas.height - scaled.height - margin;
  }

  return scaled;
}

/**
 * Semantic z-order weight: lower = closer to bottom.
 * Commands are sorted ascending so backgrounds render first.
 */
function zOrderWeight(executionSlotKey: ExecutionSlotKey | null, visualWeight: VisualWeight | null): number {
  if (visualWeight === "background") return 0;
  switch (executionSlotKey) {
    case "background": return 0;
    case null:          return 1;   // decorative shapes
    case "headline":    return 2;
    case "subheadline": return 3;
    case "offer_line":  return 3;
    case "badge_text":  return 4;
    case "footer_note": return 5;
    case "cta":         return 6;
    case "hero_image":  return 1;
    default:            return 3;
  }
}

function isCompoundExecutionSlot(
  executionSlotKey: ExecutionSlotKey | null,
): executionSlotKey is "cta" | "badge_text" {
  return executionSlotKey === "cta" || executionSlotKey === "badge_text";
}

// ---------------------------------------------------------------------------
// Placement helpers for add decisions
// ---------------------------------------------------------------------------

function computeAddBounds(
  placementZone: string,
  vocabularyId: string,
  canvasWidth: number,
  canvasHeight: number,
): LayoutBounds {
  const base = getAdaptiveVocabularyEntry(
    vocabularyId as AdaptiveVocabularyId,
  ).defaultBounds(canvasWidth, canvasHeight);

  // Adjust y position based on placement zone
  if (placementZone === "top" || placementZone === "top-left" || placementZone === "top-right") {
    base.y = canvasHeight * 0.04;
  } else if (placementZone === "center") {
    base.y = (canvasHeight - base.height) / 2;
  } else if (placementZone === "bottom" || placementZone === "bottom-left" || placementZone === "bottom-right") {
    // keep default bottom positions
  }

  // Adjust x for left/right zones
  if (placementZone === "top-left" || placementZone === "bottom-left" || placementZone === "left") {
    base.x = canvasWidth * 0.05;
  } else if (placementZone === "top-right" || placementZone === "bottom-right" || placementZone === "right") {
    base.x = canvasWidth - base.width - canvasWidth * 0.05;
  }

  return base;
}

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

function buildRetainCommand(
  runId: string,
  obj: ProjectedObject,
  refCanvas: { width: number; height: number },
  targetCanvas: { width: number; height: number },
  styleContext: AdaptiveStyleContext,
): CanvasMutationCommand {
  const { executionSlotKey } = mapVisualWeightToExecutionSlot(
    obj.visualWeight,
    obj.layerType,
    obj.compositeHint,
  );
  const styleTokens = resolveExistingObjectStyleTokens(
    obj,
    executionSlotKey,
    refCanvas,
    targetCanvas,
    styleContext,
    obj.fillColorHex ?? "#000000",
  );

  return buildCreateLayerCommand(runId, "adaptive-retain", {
    executionSlotKey,
    clientLayerKey: `${obj.objectId}_retain_${runId}`,
    layerType: obj.layerType,
    bounds: normalizeBounds(obj, executionSlotKey, refCanvas, targetCanvas),
    role: `retain_${obj.visualWeight}`,
    variantKey: "adaptive_composition",
    candidateId: obj.objectId,
    sourceOriginUrl: obj.sourceOriginUrl,
    sourceWidth: obj.sourceWidth,
    sourceHeight: obj.sourceHeight,
    fitMode: obj.layerType === "image" ? "cover" : undefined,
    cropMode: obj.layerType === "image" ? "centered_cover" : undefined,
    textContent: obj.sourceText,
    customFontSize: obj.fontSize ?? undefined,
    customFontFamily: obj.fontFamily ?? undefined,
    customFontWeight: obj.fontWeight ?? undefined,
    customTextAlign: obj.textAlign ?? undefined,
    fontRole: obj.visualWeight === "dominant" ? "display" : "body",
    styleTokens,
  });
}

function buildModifyCommand(
  runId: string,
  obj: ProjectedObject,
  decision: ElementDecision,
  refCanvas: { width: number; height: number },
  targetCanvas: { width: number; height: number },
  styleContext: AdaptiveStyleContext,
): CanvasMutationCommand {
  const { executionSlotKey } = mapVisualWeightToExecutionSlot(
    obj.visualWeight,
    obj.layerType,
    obj.compositeHint,
  );
  const styleTokens = resolveExistingObjectStyleTokens(
    obj,
    executionSlotKey,
    refCanvas,
    targetCanvas,
    styleContext,
    obj.fillColorHex ?? "#000000",
  );

  return buildCreateLayerCommand(runId, "adaptive-modify", {
    executionSlotKey,
    clientLayerKey: `${obj.objectId}_modify_${runId}`,
    layerType: obj.layerType,
    bounds: normalizeBounds(obj, executionSlotKey, refCanvas, targetCanvas),
    role: `modify_${obj.visualWeight}`,
    variantKey: "adaptive_composition",
    candidateId: obj.objectId,
    sourceOriginUrl: obj.sourceOriginUrl,
    sourceWidth: obj.sourceWidth,
    sourceHeight: obj.sourceHeight,
    fitMode: obj.layerType === "image" ? "cover" : undefined,
    cropMode: obj.layerType === "image" ? "centered_cover" : undefined,
    textContent: decision.newText ?? obj.sourceText,
    customFontSize: obj.fontSize ?? undefined,
    customFontFamily: obj.fontFamily ?? undefined,
    customFontWeight: obj.fontWeight ?? undefined,
    customTextAlign: obj.textAlign ?? undefined,
    fontRole: obj.visualWeight === "dominant" ? "display" : "body",
    styleTokens,
  });
}

function buildAddCommand(
  runId: string,
  decision: AddDecision,
  canvasWidth: number,
  canvasHeight: number,
  index: number,
  styleContext: AdaptiveStyleContext,
): CanvasMutationCommand {
  const mapping = mapAddVocabularyToExecutionSlot(decision.vocabularyId);
  const bounds = computeAddBounds(
    decision.placementZone,
    decision.vocabularyId,
    canvasWidth,
    canvasHeight,
  );
  const styleTokens = resolveAddStyleTokens(
    decision.vocabularyId,
    styleContext,
  );

  if (mapping.layerType === "group" && isCompoundExecutionSlot(mapping.executionSlotKey)) {
    return buildCompoundGroupCommand({
      runId,
      stage: "adaptive-add",
      clientLayerKey: `add_${decision.vocabularyId}_${index}_${runId}`,
      executionSlotKey: mapping.executionSlotKey,
      candidateId: `add_${index}`,
      bounds,
      role: `add_${decision.vocabularyId}`,
      textContent: decision.text,
      fontRole:
        mapping.fontRole ??
        (mapping.executionSlotKey === "cta" ? "display" : "body"),
      ...(styleContext.typography ? { typography: styleContext.typography } : {}),
      styleTokens,
    });
  }

  return buildCreateLayerCommand(runId, "adaptive-add", {
    executionSlotKey: mapping.executionSlotKey,
    clientLayerKey: `add_${decision.vocabularyId}_${index}_${runId}`,
    layerType: mapping.layerType,
    bounds,
    role: `add_${decision.vocabularyId}`,
    variantKey: "adaptive_composition",
    candidateId: `add_${index}`,
    textContent: decision.text,
    fontRole: mapping.fontRole,
    ...(styleContext.typography ? { typography: styleContext.typography } : {}),
    styleTokens,
  });
}

function buildCompoundGroupCommand(options: {
  runId: string;
  stage: "adaptive-retain" | "adaptive-modify" | "adaptive-add";
  clientLayerKey: string;
  executionSlotKey: "cta" | "badge_text";
  candidateId: string;
  bounds: LayoutBounds;
  role: string;
  textContent: string | null;
  fontRole: "display" | "body";
  typography?: TypographyMetadata;
  styleTokens: Record<string, string | number | boolean | null>;
}): CanvasMutationCommand {
  return buildCreateLayerCommand(options.runId, options.stage, {
    executionSlotKey: options.executionSlotKey,
    clientLayerKey: options.clientLayerKey,
    layerType: "group",
    bounds: options.bounds,
    role: options.role,
    variantKey: "adaptive_composition",
    candidateId: options.candidateId,
    textContent: options.textContent,
    fontRole: options.fontRole,
    ...(options.typography ? { typography: options.typography } : {}),
    styleTokens: options.styleTokens,
  });
}

function readStyleMetadata(
  sceneBindingPlan: SceneBindingPlan | null | undefined,
): StyleMetadata | null {
  return sceneBindingPlan
    ? {
        backgroundColorHex: sceneBindingPlan.backgroundColorHex,
        secondaryBackgroundColorHex: sceneBindingPlan.secondaryBackgroundColorHex,
        primaryTextColorHex: sceneBindingPlan.primaryTextColorHex,
        secondaryTextColorHex: sceneBindingPlan.secondaryTextColorHex,
        accentTextColorHex: sceneBindingPlan.accentTextColorHex,
        inverseTextColorHex: sceneBindingPlan.inverseTextColorHex,
        ctaSurfaceColorHex: sceneBindingPlan.ctaSurfaceColorHex,
        ctaTextColorHex: sceneBindingPlan.ctaTextColorHex,
        ctaShapeLanguage: sceneBindingPlan.ctaShapeLanguage,
        backgroundVisualMode: sceneBindingPlan.backgroundMode,
      }
    : null;
}

function mergeReadabilityPalette(
  base: ReturnType<typeof resolveReadabilityPalette>,
  styleMetadata: StyleMetadata | null,
) {
  if (!styleMetadata) {
    return base;
  }
  return {
    primaryTextColor:
      styleMetadata.primaryTextColorHex ?? base.primaryTextColor,
    secondaryTextColor:
      styleMetadata.secondaryTextColorHex ?? base.secondaryTextColor,
    accentTextColor:
      styleMetadata.accentTextColorHex ?? base.accentTextColor,
    inverseTextColor:
      styleMetadata.inverseTextColorHex ?? base.inverseTextColor,
    ctaSurfaceColor:
      styleMetadata.ctaSurfaceColorHex ?? base.ctaSurfaceColor,
    ctaTextColor:
      styleMetadata.ctaTextColorHex ?? base.ctaTextColor,
  };
}

function resolveAdaptiveStyleContext(
  sceneBindingPlan: SceneBindingPlan | null | undefined,
  sceneStylePlan: SceneStylePlan | null | undefined,
): AdaptiveStyleContext {
  const styleMetadata = readStyleMetadata(sceneBindingPlan);
  const backgroundColorHex =
    sceneBindingPlan?.backgroundColorHex ??
    styleMetadata?.backgroundColorHex ??
    "#ffffff";
  return {
    sceneBindingPlan: sceneBindingPlan ?? null,
    typography: sceneStylePlan
      ? {
          displayFontFamily: sceneStylePlan.typographyPolicy.templateFontFamily,
          displayFontWeight: sceneStylePlan.typographyPolicy.displayWeightTarget,
          bodyFontFamily: sceneStylePlan.typographyPolicy.templateFontFamily,
          bodyFontWeight: sceneStylePlan.typographyPolicy.bodyWeightTarget,
        }
      : null,
    styleMetadata,
    readabilityPalette: mergeReadabilityPalette(
      resolveReadabilityPalette(backgroundColorHex),
      styleMetadata,
    ),
  };
}

function resolveExistingObjectStyleTokens(
  obj: ProjectedObject,
  executionSlotKey: ExecutionSlotKey | null,
  refCanvas: { width: number; height: number },
  targetCanvas: { width: number; height: number },
  styleContext: AdaptiveStyleContext,
  fallbackFillColor: string,
): Record<string, string | number | boolean | null> | undefined {
  if (obj.layerType === "image") {
    const imageScaleX =
      obj.sourceImageScaleX !== null && obj.sourceImageScaleX !== undefined
        ? obj.sourceImageScaleX * (targetCanvas.width / refCanvas.width)
        : null;
    const imageScaleY =
      obj.sourceImageScaleY !== null && obj.sourceImageScaleY !== undefined
        ? obj.sourceImageScaleY * (targetCanvas.height / refCanvas.height)
        : null;
    const styleTokens: Record<string, string | number | boolean | null> = {};
    if ((obj.sourceAngle ?? 0) !== 0) {
      styleTokens.angle = obj.sourceAngle ?? 0;
    }
    if ((obj.sourceOpacity ?? 1) !== 1) {
      styleTokens.opacity = obj.sourceOpacity ?? 1;
    }
    if (obj.sourceFlipX) {
      styleTokens.flipX = true;
    }
    if (obj.sourceFlipY) {
      styleTokens.flipY = true;
    }
    if (obj.sourceCropX !== null && obj.sourceCropX !== undefined) {
      styleTokens.cropX = obj.sourceCropX;
    }
    if (obj.sourceCropY !== null && obj.sourceCropY !== undefined) {
      styleTokens.cropY = obj.sourceCropY;
    }
    if ((obj.sourceObjectScaleX ?? 1) !== 1) {
      styleTokens.objectScaleX = obj.sourceObjectScaleX ?? 1;
    }
    if ((obj.sourceObjectScaleY ?? 1) !== 1) {
      styleTokens.objectScaleY = obj.sourceObjectScaleY ?? 1;
    }
    if (imageScaleX !== null) {
      styleTokens.imageScaleX = imageScaleX;
    }
    if (imageScaleY !== null) {
      styleTokens.imageScaleY = imageScaleY;
    }
    return Object.keys(styleTokens).length > 0 ? styleTokens : undefined;
  }
  if (obj.layerType === "shape") {
    return {
      fillColor: fallbackFillColor,
      ...(obj.secondaryFillColorHex ? { secondaryColor: obj.secondaryFillColorHex } : {}),
      ...(typeof obj.sourceCornerRadius === "number" ? { cornerRadius: obj.sourceCornerRadius } : {}),
      ...(typeof obj.sourceOpacity === "number" ? { opacity: obj.sourceOpacity } : {}),
      ...(typeof obj.sourceAngle === "number" ? { angle: obj.sourceAngle } : {}),
    };
  }
  if (obj.layerType !== "text") {
    return { fillColor: fallbackFillColor };
  }
  return {
    fillColor: resolveExistingTextFillColor(
      obj,
      executionSlotKey,
      styleContext,
      fallbackFillColor,
    ),
    ...(typeof obj.sourceAngle === "number" && obj.sourceAngle !== 0
      ? { angle: obj.sourceAngle }
      : {}),
    ...(typeof obj.sourceOpacity === "number" && obj.sourceOpacity !== 1
      ? { opacity: obj.sourceOpacity }
      : {}),
  };
}

function resolveExistingTextFillColor(
  obj: ProjectedObject,
  executionSlotKey: ExecutionSlotKey | null,
  styleContext: AdaptiveStyleContext,
  preferredFillColor: string,
): string {
  // Prefer local backing surface as the readability reference.
  // Fall back to scene background so that text without a backing surface
  // is still guarded against low-contrast emission on the canvas.
  const readabilitySurface =
    obj.backingSurfaceColorHex ??
    styleContext.sceneBindingPlan?.backgroundColorHex ??
    null;
  if (!readabilitySurface) {
    return preferredFillColor;
  }
  return resolveReadablePreferredColor(
    preferredFillColor,
    readabilitySurface,
    resolveSlotFallbackTextColor(executionSlotKey, styleContext, readabilitySurface),
  );
}

function resolveAddStyleTokens(
  vocabularyId: string,
  styleContext: AdaptiveStyleContext,
): Record<string, string | number | boolean | null> {
  const { readabilityPalette, sceneBindingPlan, styleMetadata } = styleContext;
  switch (vocabularyId) {
    case "cta_button":
      return {
        surfaceColor: readabilityPalette.ctaSurfaceColor,
        textColor: readabilityPalette.ctaTextColor,
        ctaShapeLanguage: styleMetadata?.ctaShapeLanguage ?? null,
      };
    case "badge_chip":
      return {
        surfaceColor:
          sceneBindingPlan?.promoSurfaceColorHex ?? readabilityPalette.accentTextColor,
        textColor:
          sceneBindingPlan?.promoTextColorHex ?? readabilityPalette.inverseTextColor,
      };
    case "accent_shape":
      return { fillColor: readabilityPalette.accentTextColor };
    default:
      return {
        fillColor: resolveReadablePreferredColor(
          readabilityPalette.secondaryTextColor,
          sceneBindingPlan?.secondaryBackgroundColorHex ??
            sceneBindingPlan?.backgroundColorHex ??
            "#ffffff",
          resolveSlotFallbackTextColor(
            "footer_note",
            styleContext,
            sceneBindingPlan?.secondaryBackgroundColorHex ??
              sceneBindingPlan?.backgroundColorHex ??
              "#ffffff",
          ),
        ),
      };
  }
}

function resolveReadablePreferredColor(
  preferredColor: string,
  surfaceColor: string,
  fallbackColor: string,
): string {
  if (contrastRatio(preferredColor, surfaceColor) >= 3) {
    return preferredColor;
  }
  if (contrastRatio(fallbackColor, surfaceColor) >= 3) {
    return fallbackColor;
  }
  return resolveReadabilityPalette(surfaceColor).primaryTextColor;
}

function resolveSlotFallbackTextColor(
  executionSlotKey: ExecutionSlotKey | null,
  styleContext: AdaptiveStyleContext,
  surfaceColor: string,
): string {
  const { readabilityPalette, sceneBindingPlan } = styleContext;
  switch (executionSlotKey) {
    case "offer_line":
    case "badge_text":
      return (
        sceneBindingPlan?.promoTextColorHex ??
        readabilityPalette.inverseTextColor ??
        resolveReadabilityPalette(surfaceColor).primaryTextColor
      );
    case "cta":
      return (
        sceneBindingPlan?.ctaTextColorHex ??
        readabilityPalette.ctaTextColor ??
        resolveReadabilityPalette(surfaceColor).primaryTextColor
      );
    case "footer_note":
      return (
        sceneBindingPlan?.secondaryTextColorHex ??
        readabilityPalette.secondaryTextColor ??
        resolveReadabilityPalette(surfaceColor).primaryTextColor
      );
    case "headline":
    case "subheadline":
    default:
      return (
        sceneBindingPlan?.primaryTextColorHex ??
        readabilityPalette.primaryTextColor ??
        resolveReadabilityPalette(surfaceColor).primaryTextColor
      );
  }
}

function contrastRatio(
  foregroundColorHex: string,
  backgroundColorHex: string,
): number {
  const foregroundLuminance = calculateRelativeLuminance(
    normalizeHexColor(foregroundColorHex),
  );
  const backgroundLuminance = calculateRelativeLuminance(
    normalizeHexColor(backgroundColorHex),
  );
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Background synthesis
// ---------------------------------------------------------------------------

/**
 * True iff the projected graph already contains a full-bleed background object
 * (e.g. a retained template image covering the canvas). When true, do not
 * synthesize a background — defer to A1 (template object graph is structural truth).
 */
function hasProjectedBackground(projectedGraph: ProjectedObjectGraph): boolean {
  return projectedGraph.objects.some((obj) => obj.visualWeight === "background");
}

/**
 * Emit a synthesized background rect from sceneBindingPlan when the template
 * did not contribute a background object. Mirrors the skeleton path foundation
 * pattern so FE handles fill/gradient identically.
 */
function buildSynthesizedBackgroundCommand(
  runId: string,
  targetCanvas: { width: number; height: number },
  sceneBindingPlan: SceneBindingPlan,
): CanvasMutationCommand {
  const isGradient =
    sceneBindingPlan.backgroundMode === "pastel_gradient" &&
    sceneBindingPlan.secondaryBackgroundColorHex !== null;
  return buildCreateLayerCommand(runId, "adaptive-background-synth", {
    executionSlotKey: "background",
    clientLayerKey: `adaptive_background_${runId}`,
    layerType: "shape",
    bounds: {
      x: 0,
      y: 0,
      width: targetCanvas.width,
      height: targetCanvas.height,
    },
    role: "background",
    variantKey: sceneBindingPlan.backgroundMode,
    candidateId: "adaptive_background_synth",
    styleTokens: {
      fillColor: sceneBindingPlan.backgroundColorHex,
      secondaryColor: sceneBindingPlan.secondaryBackgroundColorHex,
      backgroundVisualMode: isGradient ? "pastel_gradient" : null,
    },
  });
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export interface EmitAdaptiveCompositionInput {
  runId: string;
  traceId: string;
  documentId: string;
  pageId: string;
  targetCanvasWidth: number;
  targetCanvasHeight: number;
  projectedGraph: ProjectedObjectGraph;
  compositionDecision: AdaptiveCompositionDecision;
  sceneBindingPlan?: SceneBindingPlan | null;
  sceneStylePlan?: SceneStylePlan | null;
}

export function emitAdaptiveCompositionMutations(
  input: EmitAdaptiveCompositionInput,
): SkeletonMutationBatch {
  const { projectedGraph, compositionDecision } = input;
  const styleContext = resolveAdaptiveStyleContext(
    input.sceneBindingPlan,
    input.sceneStylePlan,
  );
  const refCanvas = { width: projectedGraph.canvasWidth, height: projectedGraph.canvasHeight };
  const targetCanvas = { width: input.targetCanvasWidth, height: input.targetCanvasHeight };
  const objectMap = new Map(
    projectedGraph.objects.map((obj) => [obj.objectId, obj]),
  );

  const taggedCommands: Array<{ command: CanvasMutationCommand; zWeight: number }> = [];

  // Synthesize a background when the template contributed none.
  // SSOT §6.5 permits bounded fallback (shape treatment) when the reference lacks
  // a full-bleed object, and the scene binding plan already carries the solved
  // backgroundColorHex / backgroundMode derived from the selected template's style.
  if (
    !hasProjectedBackground(projectedGraph) &&
    styleContext.sceneBindingPlan
  ) {
    const backgroundCommand = buildSynthesizedBackgroundCommand(
      input.runId,
      targetCanvas,
      styleContext.sceneBindingPlan,
    );
    taggedCommands.push({
      command: backgroundCommand,
      zWeight: zOrderWeight("background", "background"),
    });
  }

  // Process element decisions (retain/modify/remove)
  const decidedObjectIds = new Set(
    compositionDecision.elementDecisions.map((d) => d.objectId),
  );

  // Objects mentioned in decisions
  for (const decision of compositionDecision.elementDecisions) {
    const obj = objectMap.get(decision.objectId);
    if (!obj) continue;

    const { executionSlotKey } = mapVisualWeightToExecutionSlot(obj.visualWeight, obj.layerType, obj.compositeHint);
    const zWeight = zOrderWeight(executionSlotKey, obj.visualWeight);

    if (decision.operation === "retain") {
      taggedCommands.push({ command: buildRetainCommand(input.runId, obj, refCanvas, targetCanvas, styleContext), zWeight });
    } else if (decision.operation === "modify") {
      taggedCommands.push({ command: buildModifyCommand(input.runId, obj, decision, refCanvas, targetCanvas, styleContext), zWeight });
    }
    // "remove" → skip, don't create
  }

  // Objects NOT mentioned → implicit retain
  for (const obj of projectedGraph.objects) {
    if (!decidedObjectIds.has(obj.objectId)) {
      const { executionSlotKey } = mapVisualWeightToExecutionSlot(obj.visualWeight, obj.layerType, obj.compositeHint);
      const zWeight = zOrderWeight(executionSlotKey, obj.visualWeight);
      taggedCommands.push({ command: buildRetainCommand(input.runId, obj, refCanvas, targetCanvas, styleContext), zWeight });
    }
  }

  // Process add decisions (CTA/footer go on top)
  for (let i = 0; i < compositionDecision.addDecisions.length; i++) {
    const addDecision = compositionDecision.addDecisions[i]!;
    const mapping = mapAddVocabularyToExecutionSlot(addDecision.vocabularyId);
    const zWeight = zOrderWeight(mapping.executionSlotKey, null);
    taggedCommands.push({
      command: buildAddCommand(input.runId, addDecision, input.targetCanvasWidth, input.targetCanvasHeight, i, styleContext),
      zWeight,
    });
  }

  // Sort by z-order: backgrounds first (bottom), content/CTA last (top)
  taggedCommands.sort((a, b) => a.zWeight - b.zWeight);
  const allCommands = taggedCommands.map((t) => t.command);

  // Build single-stage proposal
  const commitGroup = createRequestId();
  const mutationId = createRequestId();
  const rollbackGroupId = createRequestId();
  const draftId = `draft_${input.runId}`;

  const proposal: MutationProposalDraft = {
    mutationId,
    rollbackGroupId,
    stageLabel: "adaptive-composition",
    stageDescription: compositionDecision.compositionSummary,
    mutation: {
      mutationId,
      mutationVersion: "v1",
      traceId: input.traceId,
      runId: input.runId,
      draftId,
      documentId: input.documentId,
      pageId: input.pageId,
      seq: 1,
      commitGroup,
      idempotencyKey: `adaptive_composition_${input.runId}`,
      expectedBaseRevision: 0,
      ownershipScope: "draft_only",
      commands: allCommands,
      rollbackHint: {
        rollbackGroupId,
        strategy: "delete_created_layers",
      },
      emittedAt: new Date().toISOString(),
      deliveryDeadlineAt: new Date(Date.now() + 15000).toISOString(),
    },
  };

  return {
    commitGroup,
    proposals: [proposal],
  };
}
