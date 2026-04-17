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
  /**
   * Object ids that are referenced as a local backing surface by another
   * retained object. Recoloring any of these would silently invalidate the
   * readability contract of the text that sits on them (text readability is
   * resolved against the ORIGINAL backingSurfaceColorHex, not the recolored
   * fill), so they are preserved at Layer 4.
   */
  backingSurfaceObjectIds: Set<string>;
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
  const bounds = normalizeBounds(obj, executionSlotKey, refCanvas, targetCanvas);
  const customFontSize = resolveFittedFontSize(
    obj.layerType,
    obj.sourceText,
    obj.fontSize,
    obj.fontWeight,
    bounds.width,
  );

  return buildCreateLayerCommand(runId, "adaptive-retain", {
    executionSlotKey,
    clientLayerKey: `${obj.objectId}_retain_${runId}`,
    layerType: obj.layerType,
    bounds,
    role: `retain_${obj.visualWeight}`,
    variantKey: "adaptive_composition",
    candidateId: obj.objectId,
    sourceOriginUrl: obj.sourceOriginUrl,
    sourceWidth: obj.sourceWidth,
    sourceHeight: obj.sourceHeight,
    fitMode: obj.layerType === "image" ? "cover" : undefined,
    cropMode: obj.layerType === "image" ? "centered_cover" : undefined,
    textContent: obj.sourceText,
    customFontSize,
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
  const bounds = normalizeBounds(obj, executionSlotKey, refCanvas, targetCanvas);
  const nextText = decision.newText ?? obj.sourceText;
  const customFontSize = resolveFittedFontSize(
    obj.layerType,
    nextText,
    obj.fontSize,
    obj.fontWeight,
    bounds.width,
  );

  return buildCreateLayerCommand(runId, "adaptive-modify", {
    executionSlotKey,
    clientLayerKey: `${obj.objectId}_modify_${runId}`,
    layerType: obj.layerType,
    bounds,
    role: `modify_${obj.visualWeight}`,
    variantKey: "adaptive_composition",
    candidateId: obj.objectId,
    sourceOriginUrl: obj.sourceOriginUrl,
    sourceWidth: obj.sourceWidth,
    sourceHeight: obj.sourceHeight,
    fitMode: obj.layerType === "image" ? "cover" : undefined,
    cropMode: obj.layerType === "image" ? "centered_cover" : undefined,
    textContent: nextText,
    customFontSize,
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
  projectedGraph: ProjectedObjectGraph,
): AdaptiveStyleContext {
  const styleMetadata = readStyleMetadata(sceneBindingPlan);
  const backgroundColorHex =
    sceneBindingPlan?.backgroundColorHex ??
    styleMetadata?.backgroundColorHex ??
    "#ffffff";
  const backingSurfaceObjectIds = new Set<string>();
  for (const obj of projectedGraph.objects) {
    if (obj.backingSurfaceObjectId) {
      backingSurfaceObjectIds.add(obj.backingSurfaceObjectId);
    }
  }
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
    backingSurfaceObjectIds,
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
    const resolvedShapeFill = resolveExistingShapeFillColor(
      obj,
      executionSlotKey,
      refCanvas,
      styleContext,
      fallbackFillColor,
    );
    return {
      fillColor: resolvedShapeFill,
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

/**
 * Minimum text-fitting guard.
 *
 * Shrinks customFontSize so the longest rendered line fits the emit
 * container width at an estimated per-glyph width ratio.
 *
 * Rationale: L2 projection carries the source font size verbatim; after
 * LLM text replacement (or even for retained text when target bounds are
 * smaller than source), the emitted string can overflow container width
 * and wrap/clip on first emission. A minimum guard is enough to keep
 * dominant headlines renderable in the restaurant preset; full multi-line
 * fitting is not in scope here.
 *
 * Estimation is deliberately conservative:
 *   - CJK / Hangul glyphs ~0.95 em
 *   - Latin / digit ~0.55 em
 *   - Whitespace / ASCII punctuation ~0.35 em
 *   - Bold weight (>=600) scales by ~1.08
 *   - Safety factor 0.96 on the fitted size, floor at 18.
 *
 * Returns the original fontSize when the layer is not text, bounds are
 * non-positive, or the string already fits.
 */
const TEXT_FIT_MIN_FONT_SIZE = 18;
const TEXT_FIT_SAFETY_FACTOR = 0.96;

function resolveFittedFontSize(
  layerType: "text" | "shape" | "group" | "image",
  textContent: string | null,
  fontSize: number | null,
  fontWeight: number | null,
  targetWidth: number,
): number | undefined {
  if (layerType !== "text") return fontSize ?? undefined;
  if (fontSize === null || fontSize <= 0) return fontSize ?? undefined;
  if (!textContent || targetWidth <= 0) return fontSize;
  const estimatedEmWidth = estimateLongestLineEmWidth(textContent, fontWeight);
  if (estimatedEmWidth <= 0) return fontSize;
  const estimatedPxWidth = estimatedEmWidth * fontSize;
  if (estimatedPxWidth <= targetWidth) return fontSize;
  const fitted = Math.floor(
    (targetWidth / estimatedEmWidth) * TEXT_FIT_SAFETY_FACTOR,
  );
  return Math.max(TEXT_FIT_MIN_FONT_SIZE, fitted);
}

function estimateLongestLineEmWidth(
  text: string,
  fontWeight: number | null,
): number {
  const weightRatio = fontWeight !== null && fontWeight >= 600 ? 1.08 : 1.0;
  const lines = text.split(/\r?\n/);
  let maxLine = 0;
  for (const line of lines) {
    let sum = 0;
    for (const ch of line) {
      sum += perGlyphEmWidth(ch);
    }
    if (sum > maxLine) maxLine = sum;
  }
  return maxLine * weightRatio;
}

function perGlyphEmWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  // Whitespace / ASCII punctuation: narrow
  if (code <= 0x20) return 0.35;
  if (code >= 0x21 && code <= 0x2f) return 0.35;
  if (code >= 0x3a && code <= 0x40) return 0.35;
  if (code >= 0x5b && code <= 0x60) return 0.35;
  if (code >= 0x7b && code <= 0x7e) return 0.35;
  // Latin / digit
  if (code <= 0x7f) return 0.55;
  // CJK Unified Ideographs, Hangul Syllables, Hiragana/Katakana, CJK symbols
  if (
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xff00 && code <= 0xffef)
  ) {
    return 0.95;
  }
  // Default to Latin-ish
  return 0.6;
}

/**
 * Normalize a CSS color string (#rgb, #rrggbb, #rrggbbaa, rgb(...), rgba(...))
 * into a 6-digit hex for downstream luminance/contrast math. Returns null when
 * the format is unrecognized so callers can preserve the source rather than
 * silently produce NaN contrast.
 */
function toHexColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3 && /^[0-9a-fA-F]{3}$/.test(hex)) {
      const r = hex[0]!;
      const g = hex[1]!;
      const b = hex[2]!;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    if (hex.length === 6 && /^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`.toLowerCase();
    if (hex.length === 8 && /^[0-9a-fA-F]{8}$/.test(hex)) return `#${hex.slice(0, 6)}`.toLowerCase();
    return null;
  }
  const match = trimmed.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i,
  );
  if (!match) return null;
  const r = Math.max(0, Math.min(255, Number(match[1])));
  const g = Math.max(0, Math.min(255, Number(match[2])));
  const b = Math.max(0, Math.min(255, Number(match[3])));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Decorative shape readability fallback.
 *
 * Rotated/decorative shapes retained from a template may collide with the
 * synthesized scene background (e.g. white shape on white scene bg) and
 * create an occlusion pocket that swallows text sitting over/next to it.
 *
 * Heuristic gate (conservative — avoid over-correction on subtle overlays):
 *   - Skip gradient shapes (secondaryFillColorHex present).
 *   - Skip background-slot shapes.
 *   - Skip low-opacity shapes (opacity < 0.5 → intentional soft overlay).
 *   - Override only when contrast(fill, effective surface) < 1.5
 *     AND area ratio vs reference canvas >= 0.03.
 *
 * Surface precedence mirrors resolveExistingTextFillColor:
 *   backingSurfaceColorHex ?? sceneBindingPlan.backgroundColorHex.
 *
 * Substitute is the readability palette's accent/primary text color
 * against the effective surface, keeping the decorative intent visible.
 */
function resolveExistingShapeFillColor(
  obj: ProjectedObject,
  executionSlotKey: ExecutionSlotKey | null,
  refCanvas: { width: number; height: number },
  styleContext: AdaptiveStyleContext,
  preferredFillColor: string,
): string {
  if (executionSlotKey === "background" || obj.visualWeight === "background") {
    return preferredFillColor;
  }
  if (obj.secondaryFillColorHex) {
    return preferredFillColor;
  }
  if (typeof obj.sourceOpacity === "number" && obj.sourceOpacity < 0.5) {
    return preferredFillColor;
  }
  // Cross-object consistency: a shape that another retained text uses as its
  // backing surface must stay at its source color. Text readability elsewhere
  // resolves against the ORIGINAL backingSurfaceColorHex; recoloring this
  // shape here would silently decouple the text/panel pair.
  if (styleContext.backingSurfaceObjectIds.has(obj.objectId)) {
    return preferredFillColor;
  }
  const surfaceRaw =
    obj.backingSurfaceColorHex ??
    styleContext.sceneBindingPlan?.backgroundColorHex ??
    null;
  const surface = toHexColor(surfaceRaw);
  const fillHex = toHexColor(preferredFillColor);
  if (!surface || !fillHex) {
    return preferredFillColor;
  }
  const canvasArea = refCanvas.width * refCanvas.height;
  const shapeArea = obj.bounds.width * obj.bounds.height;
  const areaRatio = canvasArea > 0 ? shapeArea / canvasArea : 0;
  // Only fires when the shape's own fill is visually indistinguishable from
  // its effective surface (scene background or annotated backing surface).
  // This is a bounded, evidence-gated L4 fallback — we do NOT infer overlap
  // with other retained objects here; projection + annotations are the
  // authority for cross-object relationships.
  if (contrastRatio(fillHex, surface) >= 1.5) {
    return preferredFillColor;
  }
  if (areaRatio < 0.03) {
    return preferredFillColor;
  }
  // Substitute in the luminance band opposite to the surface so the shape
  // becomes visible against scene/backing without altering other objects.
  const surfaceLuminance = calculateRelativeLuminance(surface);
  return surfaceLuminance >= 0.5 ? "#111111" : "#f5f5f5";
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
    projectedGraph,
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
