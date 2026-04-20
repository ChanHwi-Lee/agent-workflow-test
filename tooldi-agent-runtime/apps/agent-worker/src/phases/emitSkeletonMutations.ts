import type {
  ExecutablePlan,
  PersistedPlanAction,
} from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";
import type { TextLayoutHelper } from "@tooldi/tool-adapters";

import type {
  FreeformRenderableBlock,
  HydratedPlanningInput,
  MutationProposalDraft,
  NormalizedIntent,
  SkeletonMutationBatch,
} from "../types.js";
import { buildCreateLayerCommand } from "./layerCommandBuilder.js";
import {
  createGeometryPresets,
} from "./layoutGeometry.js";
import {
  type TypographyMetadata,
  readCopyInputs,
  readFoundationInputs,
  readPhotoInputs,
  readPolishInputs,
} from "./planInputParsers.js";

export interface EmitSkeletonMutationsDependencies {
  textLayoutHelper: TextLayoutHelper;
}

export async function emitSkeletonMutations(
  input: HydratedPlanningInput,
  normalizedIntent: NormalizedIntent,
  plan: ExecutablePlan,
  dependencies: EmitSkeletonMutationsDependencies,
): Promise<SkeletonMutationBatch> {
  const planActions = validatePlanActions(plan);
  const foundationInputs = readFoundationInputs(planActions.foundation.inputs);
  const photoInputs = readPhotoInputs(planActions.photo?.inputs);
  const copyInputs = readCopyInputs(planActions.copy.inputs);
  const polishInputs = readPolishInputs(planActions.polish.inputs);
  const headline =
    (copyInputs.copySlotTexts.headline ?? normalizedIntent.goalSummary).slice(0, 48);
  const headlineEstimatedHeight =
    copyInputs.headlineEstimatedHeight ??
    (
      await dependencies.textLayoutHelper.estimate({
        text: headline,
        maxWidth: Math.max(320, input.request.editorContext.canvasWidth - 160),
      })
    ).height;

  const photoSelected = planActions.photo !== null;
  const typography: TypographyMetadata = {
    displayFontFamily: copyInputs.displayFontFamily,
    displayFontWeight: copyInputs.displayFontWeight,
    bodyFontFamily: copyInputs.bodyFontFamily,
    bodyFontWeight: copyInputs.bodyFontWeight,
  };
  const geometryPresets = createGeometryPresets(
    input.request.editorContext.canvasWidth,
    input.request.editorContext.canvasHeight,
    copyInputs.layoutProfile,
    copyInputs.layoutMode,
    polishInputs.decorationMode,
    headlineEstimatedHeight,
    copyInputs.spacingIntent,
  );
  const geometry = geometryPresets.current;
  const commitGroup = plan.actions[0]?.commitGroup ?? createRequestId();
  const draftId = `draft_${input.job.runId}`;
  const documentId = input.request.editorContext.documentId;
  const pageId = input.request.editorContext.pageId;

  const createProposal = (options: {
    seq: number;
    stageLabel: string;
    stageDescription: string;
    expectedBaseRevision: number;
    dependsOnSeq?: number;
    commands: MutationProposalDraft["mutation"]["commands"];
  }): MutationProposalDraft => {
    const mutationId = createRequestId();
    const rollbackGroupId = createRequestId();

    return {
      mutationId,
      rollbackGroupId,
      stageLabel: options.stageLabel,
      stageDescription: options.stageDescription,
      mutation: {
        mutationId,
        mutationVersion: "v1",
        traceId: input.job.traceId,
        runId: input.job.runId,
        draftId,
        documentId,
        pageId,
        seq: options.seq,
        commitGroup,
        ...(typeof options.dependsOnSeq === "number"
          ? { dependsOnSeq: options.dependsOnSeq }
          : {}),
        idempotencyKey: `mutation_${options.stageLabel}_${input.job.runId}`,
        expectedBaseRevision: options.expectedBaseRevision,
        ownershipScope: "draft_only",
        commands: options.commands,
        rollbackHint: {
          rollbackGroupId,
          strategy: "delete_created_layers",
        },
        emittedAt: new Date().toISOString(),
        deliveryDeadlineAt: new Date(Date.now() + 10000).toISOString(),
      },
    };
  };

  const foundationCommands: MutationProposalDraft["mutation"]["commands"] = [
    buildCreateLayerCommand(input.job.runId, "foundation", {
      executionSlotKey: "background",
      clientLayerKey: `background_${input.job.runId}`,
      layerType: "shape",
      bounds: foundationInputs.resolvedSlotBounds.background ?? geometry.background,
      role: "background",
      variantKey: foundationInputs.backgroundMode,
      candidateId: foundationInputs.selectedBackgroundCandidateId,
      sourceAssetId: foundationInputs.selectedBackgroundAssetId,
      sourceSerial: foundationInputs.selectedBackgroundSerial,
      sourceCategory: foundationInputs.selectedBackgroundCategory,
      styleTokens: {
        fillColor: foundationInputs.backgroundColorHex,
        secondaryColor: foundationInputs.styleMetadata?.secondaryBackgroundColorHex ?? null,
        backgroundVisualMode: foundationInputs.styleMetadata?.backgroundVisualMode ?? null,
      },
    }),
  ];

  const photoCommands: MutationProposalDraft["mutation"]["commands"] =
    photoSelected
      ? [
          buildCreateLayerCommand(input.job.runId, "photo", {
            executionSlotKey: "hero_image",
            clientLayerKey: `hero_image_${input.job.runId}`,
            layerType: "image",
            bounds: photoInputs.resolvedSlotBounds.hero_image ?? geometry.heroPanel,
            role: "hero_image",
            variantKey: copyInputs.layoutMode,
            candidateId:
              photoInputs.selectedPhotoCandidateId ?? "photo_unknown",
            sourceAssetId: photoInputs.selectedPhotoAssetId,
            sourceSerial: photoInputs.selectedPhotoSerial,
            sourceCategory: photoInputs.selectedPhotoCategory,
            sourceUid: photoInputs.selectedPhotoUid,
            sourceOriginUrl: photoInputs.selectedPhotoUrl,
            sourceWidth: photoInputs.selectedPhotoWidth,
            sourceHeight: photoInputs.selectedPhotoHeight,
            photoOrientation: photoInputs.selectedPhotoOrientation,
            fitMode: photoInputs.photoFitMode,
            cropMode: photoInputs.photoCropMode,
          }),
        ]
      : [];

  const copyCommands: MutationProposalDraft["mutation"]["commands"] =
    buildFreeformBlockCommands(
      input.job.runId,
      "copy",
      copyInputs.freeformBlocks,
      typography,
    );

  const polishCommands: MutationProposalDraft["mutation"]["commands"] =
    buildFreeformBlockCommands(
      input.job.runId,
      "polish",
      polishInputs.freeformBlocks,
      typography,
    );

  return {
    commitGroup,
    proposals: buildProposals(),
  };

  function buildProposals(): MutationProposalDraft[] {
    const proposals: MutationProposalDraft[] = [
      createProposal({
        seq: 1,
        stageLabel: "foundation",
        stageDescription: `Prepare ${foundationInputs.backgroundMode} background and base frame`,
        expectedBaseRevision: 0,
        commands: foundationCommands,
      }),
    ];

    if (photoSelected) {
      proposals.push(
        createProposal({
          seq: 2,
          stageLabel: "photo",
          stageDescription: `Place ${photoInputs.photoFitMode} hero photo ${photoInputs.selectedPhotoSerial ?? "unknown"}`,
          expectedBaseRevision: 1,
          dependsOnSeq: 1,
          commands: photoCommands,
        }),
      );
    }

    const copySeq = photoSelected ? 3 : 2;
    const polishSeq = photoSelected ? 4 : 3;

    proposals.push(
      createProposal({
        seq: copySeq,
        stageLabel: "copy",
        stageDescription: `Place ${copyInputs.layoutMode} copy cluster`,
        expectedBaseRevision: copySeq - 1,
        dependsOnSeq: copySeq - 1,
        commands: copyCommands,
      }),
      createProposal({
        seq: polishSeq,
        stageLabel: "polish",
        stageDescription: `Apply ${polishInputs.decorationMode} decorative polish`,
        expectedBaseRevision: polishSeq - 1,
        dependsOnSeq: polishSeq - 1,
        commands: polishCommands,
      }),
    );

    return proposals.filter(
      (proposal) => proposal.mutation.commands.length > 0,
    );
  }
}

function validatePlanActions(plan: ExecutablePlan): {
  foundation: PersistedPlanAction;
  photo: PersistedPlanAction | null;
  copy: PersistedPlanAction;
  polish: PersistedPlanAction;
} {
  const foundation = plan.actions.find(
    (action) => action.operation === "prepare_background_and_foundation",
  );
  const photo =
    plan.actions.find((action) => action.operation === "place_photo_hero") ??
    null;
  const copy = plan.actions.find((action) => action.operation === "place_copy_cluster");
  const polish = plan.actions.find(
    (action) => action.operation === "place_promo_polish",
  );

  if (!foundation || !copy || !polish) {
    throw new Error("Executable plan is missing one or more required spring actions");
  }

  return { foundation, photo, copy, polish };
}


function buildFreeformBlockCommands(
  runId: string,
  stage: string,
  blocks: FreeformRenderableBlock[],
  typography: TypographyMetadata,
): MutationProposalDraft["mutation"]["commands"] {
  return blocks.map((block, index) =>
    buildCreateLayerCommand(runId, stage, {
      executionSlotKey: block.executionSlotKey,
      clientLayerKey: `${block.role}_${index}_${runId}`,
      layerType: block.layerType,
      bounds: block.bounds,
      role: block.role,
      variantKey: block.variantKey,
      candidateId: block.candidateId,
      sourceAssetId: block.sourceAssetId,
      sourceSerial: block.sourceSerial,
      sourceCategory: block.sourceCategory,
      sourceUid: block.sourceUid,
      sourceOriginUrl: block.sourceOriginUrl,
      sourceWidth: block.sourceWidth,
      sourceHeight: block.sourceHeight,
      photoOrientation: block.photoOrientation,
      fitMode: block.fitMode,
      cropMode: block.cropMode,
      renderPrimitive: block.renderPrimitive,
      styleTokens: block.styleTokens,
      fontRole: block.fontRole ?? undefined,
      typography,
      textContent: block.textContent,
      clusterZone: block.clusterZone,
      customFontSize: block.fontSize ?? undefined,
      customTextAlign: block.textAlign ?? undefined,
    }),
  );
}
