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
  SkeletonMutationBatch,
  VisualWeight,
} from "../types.js";
import { buildCreateLayerCommand } from "./layerCommandBuilder.js";

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

  if (layerType === "image" || weight === "background")
    return { executionSlotKey: "background" };

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
  switch (vocabularyId) {
    case "cta_button":
      return { executionSlotKey: "cta", layerType: "group", fontRole: undefined };
    case "footer_text":
      return { executionSlotKey: "footer_note", layerType: "text", fontRole: "body" };
    case "badge_chip":
      return { executionSlotKey: "badge_text", layerType: "group", fontRole: undefined };
    case "accent_shape":
      return { executionSlotKey: null, layerType: "shape", fontRole: undefined };
    default:
      return { executionSlotKey: null, layerType: "shape", fontRole: undefined };
  }
}

// ---------------------------------------------------------------------------
// Bounds normalization: reference canvas → target canvas
// ---------------------------------------------------------------------------

function normalizeBounds(
  obj: ProjectedObject,
  refCanvas: { width: number; height: number },
  targetCanvas: { width: number; height: number },
): LayoutBounds {
  // Background layers fill the target canvas entirely
  if (obj.visualWeight === "background") {
    return { x: 0, y: 0, width: targetCanvas.width, height: targetCanvas.height };
  }

  // Content/decorative layers: proportional scaling
  const scaleX = targetCanvas.width / refCanvas.width;
  const scaleY = targetCanvas.height / refCanvas.height;

  return {
    x: obj.bounds.x * scaleX,
    y: obj.bounds.y * scaleY,
    width: obj.bounds.width * scaleX,
    height: obj.bounds.height * scaleY,
  };
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
  const defaults: Record<string, LayoutBounds> = {
    cta_button: {
      x: canvasWidth * 0.2,
      y: canvasHeight * 0.78,
      width: canvasWidth * 0.6,
      height: Math.min(60, canvasHeight * 0.08),
    },
    footer_text: {
      x: canvasWidth * 0.1,
      y: canvasHeight * 0.92,
      width: canvasWidth * 0.8,
      height: 24,
    },
    badge_chip: {
      x: canvasWidth * 0.7,
      y: canvasHeight * 0.04,
      width: Math.min(120, canvasWidth * 0.2),
      height: 36,
    },
    accent_shape: {
      x: canvasWidth * 0.4,
      y: canvasHeight * 0.4,
      width: canvasWidth * 0.2,
      height: canvasHeight * 0.2,
    },
  };

  const base = defaults[vocabularyId] ?? defaults.accent_shape!;

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
): CanvasMutationCommand {
  const { executionSlotKey } = mapVisualWeightToExecutionSlot(
    obj.visualWeight,
    obj.layerType,
    obj.compositeHint,
  );

  return buildCreateLayerCommand(runId, "adaptive-retain", {
    executionSlotKey,
    clientLayerKey: `${obj.objectId}_retain_${runId}`,
    layerType: obj.layerType,
    bounds: normalizeBounds(obj, refCanvas, targetCanvas),
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
    customTextAlign: obj.textAlign ?? undefined,
    fontRole: obj.visualWeight === "dominant" ? "display" : "body",
    styleTokens: {
      fillColor: obj.fillColorHex ?? "#000000",
    },
  });
}

function buildModifyCommand(
  runId: string,
  obj: ProjectedObject,
  decision: ElementDecision,
  refCanvas: { width: number; height: number },
  targetCanvas: { width: number; height: number },
): CanvasMutationCommand {
  const { executionSlotKey } = mapVisualWeightToExecutionSlot(
    obj.visualWeight,
    obj.layerType,
    obj.compositeHint,
  );

  return buildCreateLayerCommand(runId, "adaptive-modify", {
    executionSlotKey,
    clientLayerKey: `${obj.objectId}_modify_${runId}`,
    layerType: obj.layerType,
    bounds: normalizeBounds(obj, refCanvas, targetCanvas),
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
    customTextAlign: obj.textAlign ?? undefined,
    fontRole: obj.visualWeight === "dominant" ? "display" : "body",
    styleTokens: {
      fillColor: decision.newFillColor ?? obj.fillColorHex ?? "#000000",
    },
  });
}

function buildAddCommand(
  runId: string,
  decision: AddDecision,
  canvasWidth: number,
  canvasHeight: number,
  index: number,
): CanvasMutationCommand {
  const mapping = mapAddVocabularyToExecutionSlot(decision.vocabularyId);
  const bounds = computeAddBounds(
    decision.placementZone,
    decision.vocabularyId,
    canvasWidth,
    canvasHeight,
  );

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
    styleTokens:
      decision.vocabularyId === "cta_button"
        ? { fillColor: "#1a1a1a", textColor: "#ffffff" }
        : decision.vocabularyId === "badge_chip"
          ? { fillColor: "#ff6a00", textColor: "#ffffff" }
          : decision.vocabularyId === "accent_shape"
            ? { fillColor: "#ffd24a" }
            : { fillColor: "#525252" },
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
}

export function emitAdaptiveCompositionMutations(
  input: EmitAdaptiveCompositionInput,
): SkeletonMutationBatch {
  const { projectedGraph, compositionDecision } = input;
  const refCanvas = { width: projectedGraph.canvasWidth, height: projectedGraph.canvasHeight };
  const targetCanvas = { width: input.targetCanvasWidth, height: input.targetCanvasHeight };
  const objectMap = new Map(
    projectedGraph.objects.map((obj) => [obj.objectId, obj]),
  );

  const allCommands: CanvasMutationCommand[] = [];

  // Process element decisions (retain/modify/remove)
  const decidedObjectIds = new Set(
    compositionDecision.elementDecisions.map((d) => d.objectId),
  );

  // Objects mentioned in decisions
  for (const decision of compositionDecision.elementDecisions) {
    const obj = objectMap.get(decision.objectId);
    if (!obj) continue;

    if (decision.operation === "retain") {
      allCommands.push(buildRetainCommand(input.runId, obj, refCanvas, targetCanvas));
    } else if (decision.operation === "modify") {
      allCommands.push(buildModifyCommand(input.runId, obj, decision, refCanvas, targetCanvas));
    }
    // "remove" → skip, don't create
  }

  // Objects NOT mentioned → implicit retain
  for (const obj of projectedGraph.objects) {
    if (!decidedObjectIds.has(obj.objectId)) {
      allCommands.push(buildRetainCommand(input.runId, obj, refCanvas, targetCanvas));
    }
  }

  // Process add decisions
  for (let i = 0; i < compositionDecision.addDecisions.length; i++) {
    const addDecision = compositionDecision.addDecisions[i]!;
    allCommands.push(
      buildAddCommand(
        input.runId,
        addDecision,
        input.targetCanvasWidth,
        input.targetCanvasHeight,
        i,
      ),
    );
  }

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
