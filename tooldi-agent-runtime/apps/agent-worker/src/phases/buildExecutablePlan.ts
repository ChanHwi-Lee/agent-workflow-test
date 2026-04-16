import type { ExecutablePlan, ExecutionSlotKey } from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";
import type { ToolRegistry } from "@tooldi/tool-registry";

import type {
  AssetPlan,
  ConcreteLayoutPlan,
  CopyPlan,
  CopyPlanSlotKey,
  FreeformLayoutPlan,
  HydratedPlanningInput,
  NormalizedIntent,
  SceneBindingPlan,
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
  freeformLayoutPlan: FreeformLayoutPlan | null | undefined,
  sceneBindingPlan: SceneBindingPlan | null | undefined,
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
    sceneBindingPlan?.includeRibbon === true ||
    selectionDecision.decorationMode === "ribbon_badge" ||
    graphicRoleBindings.some((role) => role.role === "badge_or_ribbon");
  const styleMetadata = sceneBindingPlan
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
  const v2FreeformCopyBlocks =
    freeformLayoutPlan?.workflowVariant === "retrieval_prior_v2" ||
    freeformLayoutPlan?.workflowVariant === "retrieval_prior_v2_reset" ||
    freeformLayoutPlan?.workflowVariant === "object_native_v1" ||
    freeformLayoutPlan?.workflowVariant === "topology_v1"
      ? freeformLayoutPlan.copyBlocks
      : [];
  const v2FreeformPolishBlocks =
    freeformLayoutPlan?.workflowVariant === "retrieval_prior_v2" ||
    freeformLayoutPlan?.workflowVariant === "retrieval_prior_v2_reset" ||
    freeformLayoutPlan?.workflowVariant === "object_native_v1" ||
    freeformLayoutPlan?.workflowVariant === "topology_v1"
      ? freeformLayoutPlan.polishBlocks
      : [];
  const executionMode =
    freeformLayoutPlan?.workflowVariant === "retrieval_prior_v2" ||
    freeformLayoutPlan?.workflowVariant === "retrieval_prior_v2_reset"
      ? "v2_freeform"
      : freeformLayoutPlan?.workflowVariant === "object_native_v1"
        ? "object_native_freeform"
        : freeformLayoutPlan?.workflowVariant === "topology_v1"
          ? "topology_freeform"
      : "legacy_slots";
  const topologyFreeformExecution = executionMode === "topology_freeform";

  const requestedWorkflowVariant = String(input.request.workflowVariant ?? "legacy");
  const requiredExecutionSlots = resolveRequiredExecutionSlots(executionMode);
  if (
    requestedWorkflowVariant === "retrieval_prior_v2" ||
    requestedWorkflowVariant === "retrieval_prior_v2_reset" ||
    requestedWorkflowVariant === "object_native_v1" ||
    requestedWorkflowVariant === "topology_v1"
  ) {
    if (
      !freeformLayoutPlan ||
      (executionMode !== "v2_freeform" &&
        executionMode !== "object_native_freeform" &&
        executionMode !== "topology_freeform") ||
      v2FreeformCopyBlocks.length === 0
    ) {
      throw new Error(
        "Freeform workflow variants require freeform layout execution truth; refusing to fall back to legacy slot execution",
      );
    }
  }

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
      },
      inputs: {
        executionMode,
        templateKind: normalizedIntent.templateKind,
        canvasPreset: normalizedIntent.canvasPreset,
        tone: normalizedIntent.tone,
        selectedBackgroundCandidateId: assetPlan.backgroundBinding.candidateId,
        selectedBackgroundAssetId: assetPlan.backgroundBinding.sourceAssetId,
        selectedBackgroundSerial: assetPlan.backgroundBinding.sourceSerial,
        selectedBackgroundCategory: assetPlan.backgroundBinding.sourceCategory,
        backgroundColorHex: assetPlan.backgroundBinding.colorHex,
        backgroundMode: assetPlan.backgroundBinding.backgroundMode,
        selectedLayoutCandidateId: selectionDecision.selectedLayoutCandidateId,
        layoutMode: concreteLayoutPlan.resolvedLayoutMode,
        layoutProfile: concreteLayoutPlan.abstractLayoutFamily,
        primaryVisualFamily: assetPlan.primaryVisualFamily,
        includeHeroPanel:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? false
            : includeHeroPanel,
        includeBadge:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? false
            : includeBadge,
        includeRibbon:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? false
            : includeRibbon,
        includeFrame:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? false
            : includeFrame,
        badgeText:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? null
            : copySlotTexts.badge_text ?? null,
        ...(styleMetadata ? { styleMetadata } : {}),
        resolvedSlotBounds: JSON.parse(
          JSON.stringify(concreteLayoutPlan.resolvedSlotBounds),
        ),
        headlineEstimatedHeight: concreteLayoutPlan.headlineEstimatedHeight,
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
      },
      inputs: {
        executionMode,
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
        resolvedSlotBounds: JSON.parse(
          JSON.stringify(concreteLayoutPlan.resolvedSlotBounds),
        ),
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
      },
      inputs: {
        executionMode,
        selectedLayoutCandidateId: selectionDecision.selectedLayoutCandidateId,
        layoutMode: selectionDecision.layoutMode,
        displayFontFamily: typographyDecision.display?.fontToken ?? null,
        displayFontWeight: typographyDecision.display?.fontWeight ?? null,
        bodyFontFamily: typographyDecision.body?.fontToken ?? null,
        bodyFontWeight: typographyDecision.body?.fontWeight ?? null,
        ...(requiredExecutionSlots.length > 0
          ? { requiredExecutionSlots }
          : {}),
        requiredSlots: normalizedIntent.requiredSlots,
        goalSummary: normalizedIntent.goalSummary,
        copyPlanPrimaryMessage: copyPlan.primaryMessage,
        copyPlanSummary: copyPlan.summary,
        concreteLayoutPlanSummary: concreteLayoutPlan.summary,
        copySlotTexts: JSON.parse(JSON.stringify(copySlotTexts)),
        copySlotAnchors: JSON.parse(
          JSON.stringify(concreteLayoutPlan.slotAnchors),
        ),
        resolvedSlotBounds: JSON.parse(
          JSON.stringify(concreteLayoutPlan.resolvedSlotBounds),
        ),
        clusterZones: JSON.parse(JSON.stringify(concreteLayoutPlan.clusterZones)),
        spacingIntent: concreteLayoutPlan.spacingIntent,
        headlineEstimatedHeight: concreteLayoutPlan.headlineEstimatedHeight,
        freeformBlocks: JSON.parse(JSON.stringify(v2FreeformCopyBlocks)),
        layoutProfile: concreteLayoutPlan.abstractLayoutFamily,
        primaryVisualFamily: assetPlan.primaryVisualFamily,
        includeHeroCaption:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? false
            : includeHeroCaption,
        includeBadge:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? false
            : includeBadge,
        ...(styleMetadata ? { styleMetadata } : {}),
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
      },
      inputs: {
        executionMode,
        selectedDecorationCandidateId:
          selectionDecision.selectedDecorationCandidateId,
        selectedDecorationAssetId:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? null
            : selectionDecision.selectedDecorationAssetId,
        selectedDecorationSerial:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? null
            : selectionDecision.selectedDecorationSerial,
        selectedDecorationCategory:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? null
            : selectionDecision.selectedDecorationCategory,
        decorationMode: selectionDecision.decorationMode,
        primaryVisualFamily: assetPlan.primaryVisualFamily,
        assetExecutionEligibility: JSON.parse(
          JSON.stringify(assetPlan.executionEligibility),
        ),
        graphicCompositionSet:
          executionMode === "v2_freeform" || topologyFreeformExecution
          ? null
          : selectionDecision.graphicCompositionSet
          ? JSON.parse(JSON.stringify(selectionDecision.graphicCompositionSet))
          : null,
        graphicRoleBindings:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? []
            : JSON.parse(JSON.stringify(graphicRoleBindings)),
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
        ctaContainerExpected:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? false
            : concreteLayoutPlan.ctaContainerExpected,
        spacingIntent: concreteLayoutPlan.spacingIntent,
        freeformBlocks: JSON.parse(JSON.stringify(v2FreeformPolishBlocks)),
        executionStrategy: selectionDecision.executionStrategy,
        fallbackSummary: selectionDecision.fallbackSummary,
        includeBadge:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? false
            : includeBadge,
        includeUnderline:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? false
            : includeUnderline,
        includeRibbon:
          executionMode === "v2_freeform" || topologyFreeformExecution
            ? false
            : includeRibbon,
        ...(styleMetadata ? { styleMetadata } : {}),
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

function resolveRequiredExecutionSlots(
  executionMode:
    | "legacy_slots"
    | "v2_freeform"
    | "object_native_freeform"
    | "topology_freeform",
): ExecutionSlotKey[] {
  if (executionMode === "object_native_freeform") {
    return ["background", "headline", "offer_line", "cta"];
  }
  return [];
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
