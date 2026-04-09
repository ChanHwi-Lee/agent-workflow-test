import type { ExecutablePlan } from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";
import type { ToolRegistry } from "@tooldi/tool-registry";

import type {
  ConcreteLayoutPlan,
  CopyPlan,
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
  copyPlan: CopyPlan,
  selectionDecision: SelectionDecision,
  concreteLayoutPlan: ConcreteLayoutPlan,
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
  const photoActionId = createRequestId();
  const copyActionId = createRequestId();
  const polishActionId = createRequestId();
  const photoSelected =
    selectionDecision.executionStrategy === "photo_hero_shape_text_group";
  if (photoSelected) {
    assertPhotoSelectionExecutable(selectionDecision);
  }
  const includeBadge =
    selectionDecision.layoutMode === "badge_led" ||
    selectionDecision.layoutMode === "badge_promo_stack" ||
    selectionDecision.graphicCompositionSet?.roles.some(
      (role) => role.role === "badge_or_ribbon",
    ) === true;
  const includeHeroCaption =
    selectionDecision.layoutMode === "copy_left_with_right_decoration";
  const includeHeroPanel =
    !photoSelected &&
    !["center_stack", "center_stack_promo", "badge_led", "badge_promo_stack"].includes(
      selectionDecision.layoutMode,
    );
  const includeFrame =
    selectionDecision.layoutMode === "framed_promo" ||
    selectionDecision.graphicCompositionSet?.roles.some(
      (role) => role.role === "frame",
    ) === true;
  const includeUnderline =
    selectionDecision.decorationMode !== "ribbon_badge" &&
    selectionDecision.decorationMode !== "promo_multi_graphic" &&
    !photoSelected;
  const includeRibbon =
    selectionDecision.decorationMode === "ribbon_badge" ||
    selectionDecision.graphicCompositionSet?.roles.some(
      (role) => role.role === "badge_or_ribbon",
    ) === true;

  const actions: ExecutablePlan["actions"] = [
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
        includeFrame,
      },
      rollback: {
        strategy: "delete_created_layers",
      },
    },
  ];

  if (photoSelected) {
    actions.push({
      actionId: photoActionId,
      kind: "canvas_mutation",
      operation: "place_photo_hero",
      toolName: resolveTool("photo-catalog").toolName,
      toolVersion: resolveTool("photo-catalog").toolVersion,
      commitGroup,
      liveCommit: true,
      idempotencyKey: `plan_photo_${input.job.runId}_${input.job.attemptSeq}`,
      dependsOn: [foundationActionId],
      targetRef: {
        documentId: input.request.editorContext.documentId,
        pageId: input.request.editorContext.pageId,
        layerId: null,
        slotKey: "hero_image",
      },
      inputs: {
        selectedLayoutCandidateId: selectionDecision.selectedLayoutCandidateId,
        layoutMode: selectionDecision.layoutMode,
        selectedPhotoCandidateId: selectionDecision.topPhotoCandidateId,
        selectedPhotoAssetId: selectionDecision.topPhotoAssetId,
        selectedPhotoSerial: selectionDecision.topPhotoSerial,
        selectedPhotoCategory: selectionDecision.topPhotoCategory,
        selectedPhotoUid: selectionDecision.topPhotoUid,
        selectedPhotoUrl: selectionDecision.topPhotoUrl,
        selectedPhotoWidth: selectionDecision.topPhotoWidth,
        selectedPhotoHeight: selectionDecision.topPhotoHeight,
        selectedPhotoOrientation: selectionDecision.topPhotoOrientation,
        photoFitMode: "cover",
        photoCropMode: "centered_cover",
      },
      rollback: {
        strategy: "delete_created_layers",
      },
    });
  }

  actions.push(
    {
      actionId: copyActionId,
      kind: "canvas_mutation",
      operation: "place_copy_cluster",
      toolName: resolveTool("layout-selector").toolName,
      toolVersion: resolveTool("layout-selector").toolVersion,
      commitGroup,
      liveCommit: true,
      idempotencyKey: `plan_copy_${input.job.runId}_${input.job.attemptSeq}`,
      dependsOn: photoSelected ? [photoActionId] : [foundationActionId],
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
        copyPlanPrimaryMessage: copyPlan.primaryMessage,
        copyPlanSummary: copyPlan.summary,
        concreteLayoutPlanSummary: concreteLayoutPlan.summary,
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
        graphicCompositionSet: selectionDecision.graphicCompositionSet
          ? JSON.parse(JSON.stringify(selectionDecision.graphicCompositionSet))
          : null,
        displayFontFamily: typographyDecision.display?.fontToken ?? null,
        displayFontWeight: typographyDecision.display?.fontWeight ?? null,
        bodyFontFamily: typographyDecision.body?.fontToken ?? null,
        bodyFontWeight: typographyDecision.body?.fontWeight ?? null,
        layoutMode: selectionDecision.layoutMode,
        concreteLayoutPlanSummary: concreteLayoutPlan.summary,
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
  );

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
    actions,
  };
}

function assertPhotoSelectionExecutable(selectionDecision: SelectionDecision): void {
  if (
    selectionDecision.layoutMode !== "copy_left_with_right_photo" ||
    selectionDecision.selectedLayoutCandidateId !==
      "layout_copy_left_with_right_photo" ||
    selectionDecision.topPhotoCandidateId === null ||
    selectionDecision.topPhotoUrl === null ||
    selectionDecision.topPhotoWidth === null ||
    selectionDecision.topPhotoHeight === null
  ) {
    throw new Error(
      "Photo execution path requires an executable photo candidate and the dedicated photo layout candidate",
    );
  }
}
