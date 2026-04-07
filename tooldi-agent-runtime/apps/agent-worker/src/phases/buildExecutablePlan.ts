import type { ExecutablePlan } from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";
import type { ToolRegistry } from "@tooldi/tool-registry";

import type {
  HydratedPlanningInput,
  NormalizedIntent,
  SelectionDecision,
  TypographyDecision,
} from "../types.js";

export interface BuildExecutablePlanDependencies {
  toolRegistry: ToolRegistry;
}

export async function buildExecutablePlan(
  input: HydratedPlanningInput,
  normalizedIntent: NormalizedIntent,
  selectionDecision: SelectionDecision,
  typographyDecision: TypographyDecision,
  dependencies: BuildExecutablePlanDependencies,
): Promise<ExecutablePlan> {
  const resolveTool = (toolName: string) => {
    const tool = dependencies.toolRegistry.getTool(toolName);
    if (!tool) {
      throw new Error(`Required tool not found in registry: ${toolName}`);
    }
    return tool;
  };

  const commitGroup = createRequestId();
  const foundationActionId = createRequestId();
  const copyActionId = createRequestId();
  const polishActionId = createRequestId();
  const includeBadge =
    selectionDecision.layoutMode === "badge_led" ||
    selectionDecision.decorationMode === "ribbon_badge";
  const includeHeroCaption =
    selectionDecision.layoutMode === "copy_left_with_right_decoration";
  const includeHeroPanel =
    selectionDecision.layoutMode !== "center_stack";
  const includeUnderline =
    selectionDecision.decorationMode !== "ribbon_badge";
  const includeRibbon =
    selectionDecision.decorationMode === "ribbon_badge";

  return {
    planId: createRequestId(),
    planVersion: 1,
    planSchemaVersion: "v1-stub",
    runId: input.job.runId,
    traceId: input.job.traceId,
    attemptSeq: input.job.attemptSeq,
    intent: {
      operationFamily: normalizedIntent.operationFamily,
      artifactType: normalizedIntent.artifactType,
    },
    constraintsRef: `constraints_ref_${input.job.runId}`,
    actions: [
      {
        actionId: foundationActionId,
        kind: "canvas_mutation",
        operation: "prepare_background_and_foundation",
        toolName: resolveTool("background-catalog").toolName,
        toolVersion: resolveTool("background-catalog").toolVersion,
        commitGroup,
        liveCommit: true,
        idempotencyKey: `plan_foundation_${input.job.runId}_${input.job.attemptSeq}`,
        dependsOn: [],
        targetRef: {
          documentId: input.request.editorContext.documentId,
          pageId: input.request.editorContext.pageId,
          layerId: null,
          slotKey: "background",
        },
        inputs: {
          templateKind: normalizedIntent.templateKind,
          canvasPreset: normalizedIntent.canvasPreset,
          tone: normalizedIntent.tone,
          selectedBackgroundCandidateId:
            selectionDecision.selectedBackgroundCandidateId,
          selectedBackgroundAssetId: selectionDecision.selectedBackgroundAssetId,
          selectedBackgroundSerial: selectionDecision.selectedBackgroundSerial,
          selectedBackgroundCategory: selectionDecision.selectedBackgroundCategory,
          backgroundMode: selectionDecision.backgroundMode,
          selectedLayoutCandidateId: selectionDecision.selectedLayoutCandidateId,
          layoutMode: selectionDecision.layoutMode,
          includeHeroPanel,
          includeBadge,
          includeRibbon,
        },
        rollback: {
          strategy: "delete_created_layers",
        },
      },
      {
        actionId: copyActionId,
        kind: "canvas_mutation",
        operation: "place_copy_cluster",
        toolName: resolveTool("layout-selector").toolName,
        toolVersion: resolveTool("layout-selector").toolVersion,
        commitGroup,
        liveCommit: true,
        idempotencyKey: `plan_copy_${input.job.runId}_${input.job.attemptSeq}`,
        dependsOn: [foundationActionId],
        targetRef: {
          documentId: input.request.editorContext.documentId,
          pageId: input.request.editorContext.pageId,
          layerId: null,
          slotKey: "headline",
        },
        inputs: {
          selectedLayoutCandidateId: selectionDecision.selectedLayoutCandidateId,
          layoutMode: selectionDecision.layoutMode,
          displayFontFamily: typographyDecision.display?.fontToken ?? null,
          displayFontWeight: typographyDecision.display?.fontWeight ?? null,
          bodyFontFamily: typographyDecision.body?.fontToken ?? null,
          bodyFontWeight: typographyDecision.body?.fontWeight ?? null,
          requiredSlots: normalizedIntent.requiredSlots,
          goalSummary: normalizedIntent.goalSummary,
          includeHeroCaption,
          includeBadge,
        },
        rollback: {
          strategy: "delete_created_layers",
        },
      },
      {
        actionId: polishActionId,
        kind: "canvas_mutation",
        operation: "place_promo_polish",
        toolName: resolveTool("style-heuristic").toolName,
        toolVersion: resolveTool("style-heuristic").toolVersion,
        commitGroup,
        liveCommit: true,
        idempotencyKey: `plan_polish_${input.job.runId}_${input.job.attemptSeq}`,
        dependsOn: [copyActionId],
        targetRef: {
          documentId: input.request.editorContext.documentId,
          pageId: input.request.editorContext.pageId,
          layerId: null,
          slotKey: "decoration",
        },
        inputs: {
          selectedDecorationCandidateId:
            selectionDecision.selectedDecorationCandidateId,
          selectedDecorationAssetId: selectionDecision.selectedDecorationAssetId,
          selectedDecorationSerial: selectionDecision.selectedDecorationSerial,
          selectedDecorationCategory: selectionDecision.selectedDecorationCategory,
          decorationMode: selectionDecision.decorationMode,
          displayFontFamily: typographyDecision.display?.fontToken ?? null,
          displayFontWeight: typographyDecision.display?.fontWeight ?? null,
          bodyFontFamily: typographyDecision.body?.fontToken ?? null,
          bodyFontWeight: typographyDecision.body?.fontWeight ?? null,
          layoutMode: selectionDecision.layoutMode,
          executionStrategy: selectionDecision.executionStrategy,
          fallbackSummary: selectionDecision.fallbackSummary,
          includeBadge,
          includeUnderline,
          includeRibbon,
        },
        rollback: {
          strategy: "delete_created_layers",
        },
      },
    ],
  };
}
