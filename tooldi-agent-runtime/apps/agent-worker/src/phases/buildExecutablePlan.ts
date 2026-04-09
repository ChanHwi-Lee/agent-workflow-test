import type { ExecutablePlan } from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";
import type { ToolRegistry } from "@tooldi/tool-registry";

import type {
  AssetPlan,
  ConcreteLayoutPlan,
  CopyPlan,
  CopyPlanSlotKey,
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
  assetPlan: AssetPlan,
  selectionDecision: SelectionDecision,
  concreteLayoutPlan: ConcreteLayoutPlan,
  typographyDecision: TypographyDecision,
  dependencies: BuildExecutablePlanDependencies,
): Promise<ExecutablePlan> {
  const copySlotTexts = buildCopySlotTextMap(copyPlan);
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
    assetPlan.primaryVisualFamily === "photo" && assetPlan.photoBinding !== null;
  if (photoSelected) {
    assertPhotoSelectionExecutable(assetPlan);
  }
  const graphicRoleBindings = assetPlan.graphicRoleBindings;
  const includeBadge =
    Boolean(copySlotTexts.badge_text) ||
    graphicRoleBindings.some((role) => role.role === "badge_or_ribbon");
  const includeHeroCaption =
    concreteLayoutPlan.resolvedSlotTopology === "hero_headline_supporting_cta_footer";
  const includeHeroPanel =
    !photoSelected && concreteLayoutPlan.abstractLayoutFamily === "subject_hero";
  const includeFrame =
    concreteLayoutPlan.abstractLayoutFamily === "promo_frame" ||
    graphicRoleBindings.some((role) => role.role === "frame");
  const includeUnderline =
    selectionDecision.decorationMode !== "ribbon_badge" &&
    selectionDecision.decorationMode !== "promo_multi_graphic" &&
    !photoSelected;
  const includeRibbon =
    selectionDecision.decorationMode === "ribbon_badge" ||
    graphicRoleBindings.some((role) => role.role === "badge_or_ribbon");

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
        selectedBackgroundCandidateId: assetPlan.backgroundBinding.candidateId,
        selectedBackgroundAssetId: assetPlan.backgroundBinding.sourceAssetId,
        selectedBackgroundSerial: assetPlan.backgroundBinding.sourceSerial,
        selectedBackgroundCategory: assetPlan.backgroundBinding.sourceCategory,
        backgroundMode: assetPlan.backgroundBinding.backgroundMode,
        selectedLayoutCandidateId: selectionDecision.selectedLayoutCandidateId,
        layoutMode: concreteLayoutPlan.resolvedLayoutMode,
        layoutProfile: concreteLayoutPlan.abstractLayoutFamily,
        primaryVisualFamily: assetPlan.primaryVisualFamily,
        includeHeroPanel,
        includeBadge,
        includeRibbon,
        includeFrame,
        badgeText: copySlotTexts.badge_text ?? null,
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
        layoutMode: concreteLayoutPlan.resolvedLayoutMode,
        layoutProfile: concreteLayoutPlan.abstractLayoutFamily,
        selectedPhotoCandidateId: assetPlan.photoBinding?.candidateId ?? null,
        selectedPhotoAssetId: assetPlan.photoBinding?.sourceAssetId ?? null,
        selectedPhotoSerial: assetPlan.photoBinding?.sourceSerial ?? null,
        selectedPhotoCategory: assetPlan.photoBinding?.sourceCategory ?? null,
        selectedPhotoUid: assetPlan.photoBinding?.sourceUid ?? null,
        selectedPhotoUrl: assetPlan.photoBinding?.sourceOriginUrl ?? null,
        selectedPhotoWidth: assetPlan.photoBinding?.sourceWidth ?? null,
        selectedPhotoHeight: assetPlan.photoBinding?.sourceHeight ?? null,
        selectedPhotoOrientation: assetPlan.photoBinding?.orientation ?? null,
        photoFitMode: assetPlan.photoBinding?.fitMode ?? "cover",
        photoCropMode: assetPlan.photoBinding?.cropMode ?? "centered_cover",
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
        copySlotTexts: JSON.parse(JSON.stringify(copySlotTexts)),
        copySlotAnchors: JSON.parse(
          JSON.stringify(concreteLayoutPlan.slotAnchors),
        ),
        clusterZones: JSON.parse(JSON.stringify(concreteLayoutPlan.clusterZones)),
        spacingIntent: concreteLayoutPlan.spacingIntent,
        layoutProfile: concreteLayoutPlan.abstractLayoutFamily,
        primaryVisualFamily: assetPlan.primaryVisualFamily,
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
        primaryVisualFamily: assetPlan.primaryVisualFamily,
        assetExecutionEligibility: JSON.parse(
          JSON.stringify(assetPlan.executionEligibility),
        ),
        graphicCompositionSet: selectionDecision.graphicCompositionSet
          ? JSON.parse(JSON.stringify(selectionDecision.graphicCompositionSet))
          : null,
        graphicRoleBindings: JSON.parse(JSON.stringify(graphicRoleBindings)),
        displayFontFamily: typographyDecision.display?.fontToken ?? null,
        displayFontWeight: typographyDecision.display?.fontWeight ?? null,
        bodyFontFamily: typographyDecision.body?.fontToken ?? null,
        bodyFontWeight: typographyDecision.body?.fontWeight ?? null,
        layoutMode: concreteLayoutPlan.resolvedLayoutMode,
        layoutProfile: concreteLayoutPlan.abstractLayoutFamily,
        concreteLayoutPlanSummary: concreteLayoutPlan.summary,
        clusterZones: JSON.parse(JSON.stringify(concreteLayoutPlan.clusterZones)),
        graphicRolePlacementHints: JSON.parse(
          JSON.stringify(concreteLayoutPlan.graphicRolePlacementHints),
        ),
        ctaContainerExpected: concreteLayoutPlan.ctaContainerExpected,
        spacingIntent: concreteLayoutPlan.spacingIntent,
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

function buildCopySlotTextMap(
  copyPlan: CopyPlan,
): Partial<Record<CopyPlanSlotKey, string>> {
  return copyPlan.slots.reduce<Partial<Record<CopyPlanSlotKey, string>>>(
    (acc, slot) => {
      acc[slot.key] = slot.text;
      return acc;
    },
    {},
  );
}

function assertPhotoSelectionExecutable(assetPlan: AssetPlan): void {
  if (
    assetPlan.photoBinding === null ||
    assetPlan.photoBinding.candidateId === null ||
    assetPlan.photoBinding.sourceOriginUrl === null ||
    assetPlan.photoBinding.sourceWidth === null ||
    assetPlan.photoBinding.sourceHeight === null
  ) {
    throw new Error(
      "Photo execution path requires an executable photo candidate and the dedicated photo layout candidate",
    );
  }
}
