import type { ExecutablePlan } from "@tooldi/agent-contracts";
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
  const freeformCopyBlocks =
    freeformLayoutPlan?.copyBlocks ?? [];
  const freeformPolishBlocks =
    freeformLayoutPlan?.polishBlocks ?? [];
  const executionMode = "object_native_freeform" as const;

  if (!freeformLayoutPlan || freeformCopyBlocks.length === 0) {
    throw new Error(
      "object_native_v1 requires freeform layout execution truth and cannot execute without adaptive freeform blocks",
    );
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
        includeHeroPanel: false,
        includeBadge: false,
        includeRibbon: false,
        includeFrame: false,
        badgeText: null,
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
        freeformBlocks: JSON.parse(JSON.stringify(freeformCopyBlocks)),
        layoutProfile: concreteLayoutPlan.abstractLayoutFamily,
        primaryVisualFamily: assetPlan.primaryVisualFamily,
        includeHeroCaption: false,
        includeBadge: false,
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
        selectedDecorationAssetId: null,
        selectedDecorationSerial: null,
        selectedDecorationCategory: null,
        decorationMode: selectionDecision.decorationMode,
        primaryVisualFamily: assetPlan.primaryVisualFamily,
        assetExecutionEligibility: JSON.parse(
          JSON.stringify(assetPlan.executionEligibility),
        ),
        graphicCompositionSet: null,
        graphicRoleBindings: [],
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
        ctaContainerExpected: false,
        spacingIntent: concreteLayoutPlan.spacingIntent,
        freeformBlocks: JSON.parse(JSON.stringify(freeformPolishBlocks)),
        executionStrategy: selectionDecision.executionStrategy,
        fallbackSummary: selectionDecision.fallbackSummary,
        includeBadge: false,
        includeUnderline: false,
        includeRibbon: false,
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
