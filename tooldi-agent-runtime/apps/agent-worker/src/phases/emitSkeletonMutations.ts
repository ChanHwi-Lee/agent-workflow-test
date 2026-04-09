import type { ExecutablePlan, PersistedPlanAction } from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";
import type { TextLayoutHelper } from "@tooldi/tool-adapters";

import type {
  GraphicCompositionSet,
  HydratedPlanningInput,
  MutationProposalDraft,
  NormalizedIntent,
  SkeletonMutationBatch,
} from "../types.js";

export interface EmitSkeletonMutationsDependencies {
  textLayoutHelper: TextLayoutHelper;
}

type LayoutMode =
  | "copy_left_with_right_decoration"
  | "copy_left_with_right_photo"
  | "center_stack"
  | "badge_led"
  | "left_copy_right_graphic"
  | "center_stack_promo"
  | "badge_promo_stack"
  | "framed_promo";

type DecorationMode =
  | "graphic_cluster"
  | "ribbon_badge"
  | "photo_support"
  | "promo_multi_graphic";

type BackgroundMode = "spring_pattern" | "pastel_gradient" | "spring_photo";

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutGeometry = {
  background: Bounds;
  heroPanel: Bounds;
  badge: Bounds;
  ribbon: Bounds;
  headline: Bounds;
  supportingCopy: Bounds;
  priceCallout: Bounds;
  heroCaption: Bounds;
  cta: Bounds;
  decoration: Bounds;
  secondaryAccent: Bounds;
  cornerAccent: Bounds;
  frame: Bounds;
  underlineBar: Bounds;
  footerNote: Bounds;
};

type TypographyMetadata = {
  displayFontFamily: string | null;
  displayFontWeight: number | null;
  bodyFontFamily: string | null;
  bodyFontWeight: number | null;
};

type PhotoMetadata = {
  selectedPhotoCandidateId: string | null;
  selectedPhotoAssetId: string | null;
  selectedPhotoSerial: string | null;
  selectedPhotoCategory: string | null;
  selectedPhotoUid: string | null;
  selectedPhotoUrl: string | null;
  selectedPhotoWidth: number | null;
  selectedPhotoHeight: number | null;
  selectedPhotoOrientation: "portrait" | "landscape" | "square" | null;
  photoFitMode: "cover";
  photoCropMode: "centered_cover";
};

export async function emitSkeletonMutations(
  input: HydratedPlanningInput,
  normalizedIntent: NormalizedIntent,
  plan: ExecutablePlan,
  dependencies: EmitSkeletonMutationsDependencies,
): Promise<SkeletonMutationBatch> {
  const headline = normalizedIntent.goalSummary.slice(0, 48);
  const layoutEstimate = await dependencies.textLayoutHelper.estimate({
    text: headline,
    maxWidth: Math.max(320, input.request.editorContext.canvasWidth - 160),
  });

  const planActions = validatePlanActions(plan);
  const foundationInputs = readFoundationInputs(planActions.foundation.inputs);
  const photoInputs = readPhotoInputs(planActions.photo?.inputs);
  const copyInputs = readCopyInputs(planActions.copy.inputs);
  const polishInputs = readPolishInputs(planActions.polish.inputs);
  const photoSelected = planActions.photo !== null;
  const typography: TypographyMetadata = {
    displayFontFamily: copyInputs.displayFontFamily,
    displayFontWeight: copyInputs.displayFontWeight,
    bodyFontFamily: copyInputs.bodyFontFamily,
    bodyFontWeight: copyInputs.bodyFontWeight,
  };
  const geometry = createLayoutGeometry(
    input.request.editorContext.canvasWidth,
    input.request.editorContext.canvasHeight,
    copyInputs.layoutMode,
    polishInputs.decorationMode,
    layoutEstimate.height,
  );

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
      slotKey: "background",
      clientLayerKey: `background_${input.job.runId}`,
      layerType: "shape",
      bounds: geometry.background,
      role: "background",
      variantKey: foundationInputs.backgroundMode,
      candidateId: foundationInputs.selectedBackgroundCandidateId,
      sourceAssetId: foundationInputs.selectedBackgroundAssetId,
      sourceSerial: foundationInputs.selectedBackgroundSerial,
      sourceCategory: foundationInputs.selectedBackgroundCategory,
    }),
  ];

  if (foundationInputs.includeHeroPanel) {
    foundationCommands.push(
      buildCreateLayerCommand(input.job.runId, "foundation", {
        slotKey:
          copyInputs.layoutMode === "center_stack" ? null : "hero_image",
        clientLayerKey: `hero_panel_${input.job.runId}`,
        layerType: "shape",
        bounds: geometry.heroPanel,
        role:
          copyInputs.layoutMode === "center_stack"
            ? "spotlight_panel"
            : "hero_panel",
        variantKey: copyInputs.layoutMode,
        candidateId: copyInputs.selectedLayoutCandidateId,
      }),
    );
  }

  if (foundationInputs.includeBadge) {
    foundationCommands.push(
      buildCreateLayerCommand(input.job.runId, "foundation", {
        slotKey: "badge",
        clientLayerKey: `badge_${input.job.runId}`,
        layerType: "text",
        bounds: geometry.badge,
        role: "badge",
        variantKey: copyInputs.layoutMode,
        candidateId: copyInputs.selectedLayoutCandidateId,
        fontRole: "display",
        typography,
      }),
    );
  }

  if (foundationInputs.includeRibbon) {
    foundationCommands.push(
      buildCreateLayerCommand(input.job.runId, "foundation", {
        slotKey: null,
        clientLayerKey: `ribbon_strip_${input.job.runId}`,
        layerType: "shape",
        bounds: geometry.ribbon,
        role: "ribbon_strip",
        variantKey: polishInputs.decorationMode,
        candidateId: polishInputs.selectedDecorationCandidateId,
      }),
    );
  }

  if (foundationInputs.includeFrame) {
    foundationCommands.push(
      buildCreateLayerCommand(input.job.runId, "foundation", {
        slotKey: null,
        clientLayerKey: `frame_${input.job.runId}`,
        layerType: "shape",
        bounds: geometry.frame,
        role: "frame",
        variantKey: copyInputs.layoutMode,
        candidateId: copyInputs.selectedLayoutCandidateId,
      }),
    );
  }

  const photoCommands: MutationProposalDraft["mutation"]["commands"] =
    photoSelected
      ? [
          buildCreateLayerCommand(input.job.runId, "photo", {
            slotKey: "hero_image",
            clientLayerKey: `hero_image_${input.job.runId}`,
            layerType: "image",
            bounds: geometry.heroPanel,
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

  const copyCommands: MutationProposalDraft["mutation"]["commands"] = [
    buildCreateLayerCommand(input.job.runId, "copy", {
      slotKey: "headline",
      clientLayerKey: `headline_${input.job.runId}`,
      layerType: "text",
      bounds: geometry.headline,
      role: "headline",
      variantKey: copyInputs.layoutMode,
      candidateId: copyInputs.selectedLayoutCandidateId,
      fontRole: "display",
      typography,
    }),
    buildCreateLayerCommand(input.job.runId, "copy", {
      slotKey: "supporting_copy",
      clientLayerKey: `supporting_copy_${input.job.runId}`,
      layerType: "text",
      bounds: geometry.supportingCopy,
      role: "supporting_copy",
      variantKey: copyInputs.layoutMode,
      candidateId: copyInputs.selectedLayoutCandidateId,
      fontRole: "body",
      typography,
    }),
    buildCreateLayerCommand(input.job.runId, "copy", {
      slotKey: null,
      clientLayerKey: `price_callout_${input.job.runId}`,
      layerType: "text",
      bounds: geometry.priceCallout,
      role: "price_callout",
      variantKey: copyInputs.layoutMode,
      candidateId: copyInputs.selectedLayoutCandidateId,
      fontRole: "display",
      typography,
    }),
  ];

  if (copyInputs.includeHeroCaption) {
    copyCommands.push(
      buildCreateLayerCommand(input.job.runId, "copy", {
        slotKey: null,
        clientLayerKey: `hero_caption_${input.job.runId}`,
        layerType: "text",
        bounds: geometry.heroCaption,
        role: "hero_caption",
        variantKey: copyInputs.layoutMode,
        candidateId: copyInputs.selectedLayoutCandidateId,
        fontRole: "body",
        typography,
      }),
    );
  }

  const polishCommands: MutationProposalDraft["mutation"]["commands"] = [
    buildCreateLayerCommand(input.job.runId, "polish", {
      slotKey: "cta",
      clientLayerKey: `cta_${input.job.runId}`,
      layerType: "group",
      bounds: geometry.cta,
      role: "cta",
      variantKey: polishInputs.decorationMode,
      candidateId: polishInputs.selectedDecorationCandidateId,
      sourceAssetId: polishInputs.selectedDecorationAssetId,
      sourceSerial: polishInputs.selectedDecorationSerial,
      sourceCategory: polishInputs.selectedDecorationCategory,
      fontRole: "display",
      typography,
    }),
    ...buildGraphicRoleCommands(input.job.runId, polishInputs, geometry),
  ];

  if (polishInputs.includeUnderline) {
    polishCommands.push(
      buildCreateLayerCommand(input.job.runId, "polish", {
        slotKey: null,
        clientLayerKey: `underline_bar_${input.job.runId}`,
        layerType: "shape",
        bounds: geometry.underlineBar,
        role: "underline_bar",
        variantKey: polishInputs.decorationMode,
        candidateId: polishInputs.selectedDecorationCandidateId,
      }),
    );
  }

  if (!foundationInputs.includeRibbon && polishInputs.includeRibbon) {
    polishCommands.push(
      buildCreateLayerCommand(input.job.runId, "polish", {
        slotKey: null,
        clientLayerKey: `ribbon_strip_${input.job.runId}`,
        layerType: "shape",
        bounds: geometry.ribbon,
        role: "ribbon_strip",
        variantKey: polishInputs.decorationMode,
        candidateId: polishInputs.selectedDecorationCandidateId,
      }),
    );
  }

  polishCommands.push(
    buildCreateLayerCommand(input.job.runId, "polish", {
      slotKey: null,
      clientLayerKey: `footer_note_${input.job.runId}`,
      layerType: "text",
      bounds: geometry.footerNote,
      role: "footer_note",
      variantKey: foundationInputs.backgroundMode,
      candidateId: foundationInputs.selectedBackgroundCandidateId,
      fontRole: "body",
      typography,
    }),
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

    return proposals;
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

function readFoundationInputs(inputs: PersistedPlanAction["inputs"]) {
  const record = inputs as {
    backgroundMode?: BackgroundMode;
    selectedBackgroundCandidateId?: string;
    selectedBackgroundAssetId?: string | null;
    selectedBackgroundSerial?: string | null;
    selectedBackgroundCategory?: string | null;
    includeHeroPanel?: boolean;
    includeBadge?: boolean;
    includeRibbon?: boolean;
    includeFrame?: boolean;
  };

  return {
    backgroundMode: record.backgroundMode ?? "spring_pattern",
    selectedBackgroundCandidateId:
      record.selectedBackgroundCandidateId ?? "background_unknown",
    selectedBackgroundAssetId: record.selectedBackgroundAssetId ?? null,
    selectedBackgroundSerial: record.selectedBackgroundSerial ?? null,
    selectedBackgroundCategory: record.selectedBackgroundCategory ?? null,
    includeHeroPanel: record.includeHeroPanel ?? false,
    includeBadge: record.includeBadge ?? false,
    includeRibbon: record.includeRibbon ?? false,
    includeFrame: record.includeFrame ?? false,
  };
}

function readCopyInputs(inputs: PersistedPlanAction["inputs"]) {
  const record = inputs as {
    layoutMode?: LayoutMode;
    selectedLayoutCandidateId?: string;
    displayFontFamily?: string | null;
    displayFontWeight?: number | null;
    bodyFontFamily?: string | null;
    bodyFontWeight?: number | null;
    includeHeroCaption?: boolean;
    includeBadge?: boolean;
  };

  return {
    layoutMode: record.layoutMode ?? "copy_left_with_right_decoration",
    selectedLayoutCandidateId:
      record.selectedLayoutCandidateId ?? "layout_unknown",
    displayFontFamily: record.displayFontFamily ?? null,
    displayFontWeight: record.displayFontWeight ?? null,
    bodyFontFamily: record.bodyFontFamily ?? null,
    bodyFontWeight: record.bodyFontWeight ?? null,
    includeHeroCaption: record.includeHeroCaption ?? false,
    includeBadge: record.includeBadge ?? false,
  };
}

function readPhotoInputs(inputs: PersistedPlanAction["inputs"] | undefined) {
  const record = (inputs ?? {}) as {
    selectedPhotoCandidateId?: string | null;
    selectedPhotoAssetId?: string | null;
    selectedPhotoSerial?: string | null;
    selectedPhotoCategory?: string | null;
    selectedPhotoUid?: string | null;
    selectedPhotoUrl?: string | null;
    selectedPhotoWidth?: number | null;
    selectedPhotoHeight?: number | null;
    selectedPhotoOrientation?: "portrait" | "landscape" | "square" | null;
    photoFitMode?: "cover";
    photoCropMode?: "centered_cover";
  };

  return {
    selectedPhotoCandidateId: record.selectedPhotoCandidateId ?? null,
    selectedPhotoAssetId: record.selectedPhotoAssetId ?? null,
    selectedPhotoSerial: record.selectedPhotoSerial ?? null,
    selectedPhotoCategory: record.selectedPhotoCategory ?? null,
    selectedPhotoUid: record.selectedPhotoUid ?? null,
    selectedPhotoUrl: record.selectedPhotoUrl ?? null,
    selectedPhotoWidth: record.selectedPhotoWidth ?? null,
    selectedPhotoHeight: record.selectedPhotoHeight ?? null,
    selectedPhotoOrientation: record.selectedPhotoOrientation ?? null,
    photoFitMode: record.photoFitMode ?? "cover",
    photoCropMode: record.photoCropMode ?? "centered_cover",
  };
}

function readPolishInputs(inputs: PersistedPlanAction["inputs"]) {
  const record = inputs as {
    decorationMode?: DecorationMode;
    selectedDecorationCandidateId?: string;
    selectedDecorationAssetId?: string | null;
    selectedDecorationSerial?: string | null;
    selectedDecorationCategory?: string | null;
    graphicCompositionSet?: GraphicCompositionSet | null;
    includeUnderline?: boolean;
    includeRibbon?: boolean;
  };

  return {
    decorationMode: record.decorationMode ?? "graphic_cluster",
    selectedDecorationCandidateId:
      record.selectedDecorationCandidateId ?? "decoration_unknown",
    selectedDecorationAssetId: record.selectedDecorationAssetId ?? null,
    selectedDecorationSerial: record.selectedDecorationSerial ?? null,
    selectedDecorationCategory: record.selectedDecorationCategory ?? null,
    graphicCompositionSet: record.graphicCompositionSet ?? null,
    includeUnderline: record.includeUnderline ?? false,
    includeRibbon: record.includeRibbon ?? false,
  };
}

function createLayoutGeometry(
  canvasWidth: number,
  canvasHeight: number,
  layoutMode: LayoutMode,
  decorationMode: DecorationMode,
  headlineHeight: number,
): LayoutGeometry {
  const centered = layoutMode === "center_stack";
  const badgeLed = layoutMode === "badge_led";
  const photoLayout = layoutMode === "copy_left_with_right_photo";
  const promoCenterLayout =
    layoutMode === "center_stack_promo" || layoutMode === "badge_promo_stack";
  const graphicHeavyWideLayout =
    layoutMode === "left_copy_right_graphic" || layoutMode === "framed_promo";
  const marginX = Math.max(48, Math.round(canvasWidth * 0.07));
  const topY = Math.max(40, Math.round(canvasHeight * 0.12));
  const footerY = canvasHeight - 44;
  const leftColumnWidth = Math.min(
    Math.max(340, Math.round(canvasWidth * 0.38)),
    canvasWidth - marginX * 2 - 220,
  );
  const rightColumnWidth = Math.min(
    Math.max(200, Math.round(canvasWidth * 0.28)),
    canvasWidth - marginX * 2 - 200,
  );
  const rightColumnX = canvasWidth - marginX - rightColumnWidth;
  const centerWidth = Math.min(canvasWidth - marginX * 2, 700);
  const badgeWidth = Math.min(220, canvasWidth - marginX * 2);
  const badgeX = centered
    ? Math.round((canvasWidth - badgeWidth) / 2)
    : marginX;

  const geometry: LayoutGeometry = centered || promoCenterLayout
    ? {
        background: fitBounds(canvasWidth, canvasHeight, {
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
        }),
        heroPanel: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - 280) / 2),
          y: topY,
          width: Math.min(280, canvasWidth - marginX * 2),
          height: Math.min(112, Math.round(canvasHeight * 0.18)),
        }),
        badge: fitBounds(canvasWidth, canvasHeight, {
          x: badgeX,
          y: topY + 10,
          width: badgeWidth,
          height: 36,
        }),
        ribbon: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - 180) / 2),
          y: canvasHeight - 86,
          width: 180,
          height: 18,
        }),
        headline: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - centerWidth) / 2),
          y: topY + (promoCenterLayout ? 82 : 96),
          width: centerWidth,
          height: Math.max(72, headlineHeight),
        }),
        supportingCopy: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - Math.min(centerWidth, canvasWidth - 180)) / 2),
          y: topY + (promoCenterLayout ? 176 : 190),
          width: Math.min(centerWidth, canvasWidth - 180),
          height: 72,
        }),
        priceCallout: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - 280) / 2),
          y: topY + (promoCenterLayout ? 292 : 280),
          width: 280,
          height: 52,
        }),
        heroCaption: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - 260) / 2),
          y: topY + (promoCenterLayout ? 364 : 342),
          width: 260,
          height: 32,
        }),
        cta: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - 240) / 2),
          y: topY + (promoCenterLayout ? 430 : 360),
          width: 240,
          height: 64,
        }),
        decoration: fitBounds(canvasWidth, canvasHeight, {
          x: canvasWidth - marginX - (promoCenterLayout ? 130 : 110),
          y: topY + (promoCenterLayout ? 8 : 0),
          width: promoCenterLayout ? 130 : decorationMode === "ribbon_badge" ? 96 : 110,
          height: promoCenterLayout ? 130 : decorationMode === "ribbon_badge" ? 96 : 110,
        }),
        secondaryAccent: fitBounds(canvasWidth, canvasHeight, {
          x: marginX,
          y: topY + 18,
          width: promoCenterLayout ? 92 : 80,
          height: promoCenterLayout ? 92 : 80,
        }),
        cornerAccent: fitBounds(canvasWidth, canvasHeight, {
          x: canvasWidth - marginX - 74,
          y: footerY - 118,
          width: 74,
          height: 74,
        }),
        frame: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - Math.min(centerWidth + 120, canvasWidth - marginX)) / 2),
          y: topY + 52,
          width: Math.min(centerWidth + 120, canvasWidth - marginX),
          height: Math.min(440, canvasHeight - topY - 120),
        }),
        underlineBar: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - 130) / 2),
          y: topY + (promoCenterLayout ? 404 : 346),
          width: 130,
          height: 8,
        }),
        footerNote: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - Math.min(360, canvasWidth - 120)) / 2),
          y: footerY,
          width: Math.min(360, canvasWidth - 120),
          height: 24,
        }),
      }
    : {
        background: fitBounds(canvasWidth, canvasHeight, {
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
        }),
        heroPanel: fitBounds(canvasWidth, canvasHeight, {
          x: rightColumnX,
          y: topY,
          width: photoLayout
            ? Math.min(Math.max(280, Math.round(canvasWidth * 0.3)), rightColumnWidth + 40)
            : graphicHeavyWideLayout
              ? Math.min(Math.max(280, Math.round(canvasWidth * 0.3)), rightColumnWidth + 64)
              : rightColumnWidth,
          height: photoLayout
            ? Math.min(324, Math.round(canvasHeight * 0.62))
            : graphicHeavyWideLayout
              ? Math.min(340, Math.round(canvasHeight * 0.56))
              : Math.min(264, Math.round(canvasHeight * 0.42)),
        }),
        badge: fitBounds(canvasWidth, canvasHeight, {
          x: badgeX,
          y: topY,
          width: badgeWidth,
          height: 36,
        }),
        ribbon: fitBounds(canvasWidth, canvasHeight, {
          x: marginX,
          y: footerY - 22,
          width: 180,
          height: 18,
        }),
        headline: fitBounds(canvasWidth, canvasHeight, {
          x: marginX,
          y: topY + 42,
          width: leftColumnWidth,
          height: Math.max(72, headlineHeight),
        }),
        supportingCopy: fitBounds(canvasWidth, canvasHeight, {
          x: marginX,
          y: topY + (graphicHeavyWideLayout ? 166 : 148),
          width: leftColumnWidth + 24,
          height: 70,
        }),
        priceCallout: fitBounds(canvasWidth, canvasHeight, {
          x: marginX,
          y: topY + (graphicHeavyWideLayout ? 278 : 238),
          width: Math.min(320, leftColumnWidth),
          height: 48,
        }),
        heroCaption: fitBounds(canvasWidth, canvasHeight, {
          x: rightColumnX + 20,
          y: topY + Math.min(photoLayout ? 348 : 284, Math.round(canvasHeight * (photoLayout ? 0.58 : 0.46))),
          width: Math.max(160, rightColumnWidth - 40),
          height: 30,
        }),
        cta: fitBounds(canvasWidth, canvasHeight, {
          x: marginX,
          y: topY + (graphicHeavyWideLayout ? 392 : 320),
          width: 230,
          height: 64,
        }),
        decoration: fitBounds(canvasWidth, canvasHeight, {
          x: photoLayout
            ? rightColumnX + 12
            : graphicHeavyWideLayout
              ? rightColumnX + Math.max(6, Math.round(rightColumnWidth * 0.05))
              : rightColumnX + Math.max(12, Math.round(rightColumnWidth * 0.16)),
          y: photoLayout
            ? topY + Math.min(356, Math.round(canvasHeight * 0.58))
            : graphicHeavyWideLayout
              ? topY + 18
            : topY + Math.min(312, Math.round(canvasHeight * 0.5)),
          width:
            decorationMode === "ribbon_badge"
              ? Math.min(150, rightColumnWidth - 24)
              : graphicHeavyWideLayout
                ? Math.min(220, rightColumnWidth - 16)
              : Math.min(photoLayout ? 120 : 180, rightColumnWidth - 24),
          height:
            decorationMode === "ribbon_badge"
              ? Math.min(90, canvasHeight - topY - 120)
              : graphicHeavyWideLayout
                ? Math.min(220, canvasHeight - topY - 180)
              : Math.min(photoLayout ? 92 : 140, canvasHeight - topY - 120),
        }),
        secondaryAccent: fitBounds(canvasWidth, canvasHeight, {
          x: rightColumnX + Math.max(24, Math.round(rightColumnWidth * 0.24)),
          y: topY + Math.min(286, Math.round(canvasHeight * 0.48)),
          width: Math.min(96, rightColumnWidth - 48),
          height: 96,
        }),
        cornerAccent: fitBounds(canvasWidth, canvasHeight, {
          x: canvasWidth - marginX - 82,
          y: topY - 6,
          width: 82,
          height: 82,
        }),
        frame: fitBounds(canvasWidth, canvasHeight, {
          x: marginX - 12,
          y: topY + 8,
          width: canvasWidth - marginX * 2 + 24,
          height: Math.min(430, canvasHeight - topY - 98),
        }),
        underlineBar: fitBounds(canvasWidth, canvasHeight, {
          x: marginX,
          y: topY + (graphicHeavyWideLayout ? 366 : 298),
          width: 130,
          height: 8,
        }),
        footerNote: fitBounds(canvasWidth, canvasHeight, {
          x: marginX,
          y: footerY,
          width: Math.min(360, canvasWidth - marginX * 2),
          height: 24,
        }),
      };

  if (badgeLed) {
    geometry.badge = fitBounds(canvasWidth, canvasHeight, {
      x: centered ? badgeX : marginX,
      y: topY - 4,
      width: badgeWidth,
      height: 40,
    });
    geometry.cta = fitBounds(canvasWidth, canvasHeight, {
      x: geometry.cta.x,
      y: geometry.cta.y - 24,
      width: geometry.cta.width,
      height: geometry.cta.height,
    });
  }

  if (layoutMode === "framed_promo") {
    geometry.cta = fitBounds(canvasWidth, canvasHeight, {
      x: geometry.cta.x,
      y: geometry.cta.y + 12,
      width: geometry.cta.width,
      height: geometry.cta.height,
    });
  }

  return geometry;
}

function buildGraphicRoleCommands(
  runId: string,
  polishInputs: ReturnType<typeof readPolishInputs>,
  geometry: LayoutGeometry,
): MutationProposalDraft["mutation"]["commands"] {
  const roleGeometryMap: Record<string, Bounds> = {
    primary_accent: geometry.decoration,
    secondary_accent: geometry.secondaryAccent,
    corner_accent: geometry.cornerAccent,
    badge_or_ribbon: geometry.ribbon,
    frame: geometry.frame,
  };

  const roleCommands =
    polishInputs.graphicCompositionSet?.roles
      .filter(
        (role) =>
          role.role !== "cta_container" &&
          role.role !== "badge_or_ribbon" &&
          role.role !== "frame",
      )
      .map((role) =>
        buildCreateLayerCommand(runId, "polish", {
          slotKey: role.role === "primary_accent" ? "decoration" : null,
          clientLayerKey: `${role.role}_${runId}`,
          layerType: "shape",
          bounds: roleGeometryMap[role.role] ?? geometry.decoration,
          role: role.role,
          variantKey: role.variantKey,
          candidateId: role.candidateId,
          sourceAssetId: role.sourceAssetId,
          sourceSerial: role.sourceSerial,
          sourceCategory: role.sourceCategory,
        }),
      ) ?? [];

  if (roleCommands.length > 0) {
    return roleCommands;
  }

  return [
    buildCreateLayerCommand(runId, "polish", {
      slotKey: "decoration",
      clientLayerKey: `decoration_${runId}`,
      layerType: "shape",
      bounds: geometry.decoration,
      role:
        polishInputs.decorationMode === "ribbon_badge"
          ? "ribbon_strip"
          : "decoration",
      variantKey: polishInputs.decorationMode,
      candidateId: polishInputs.selectedDecorationCandidateId,
      sourceAssetId: polishInputs.selectedDecorationAssetId,
      sourceSerial: polishInputs.selectedDecorationSerial,
      sourceCategory: polishInputs.selectedDecorationCategory,
    }),
  ];
}

function fitBounds(
  canvasWidth: number,
  canvasHeight: number,
  bounds: Bounds,
): Bounds {
  const width = Math.max(1, Math.min(bounds.width, canvasWidth));
  const height = Math.max(1, Math.min(bounds.height, canvasHeight));
  const x = Math.max(0, Math.min(bounds.x, canvasWidth - width));
  const y = Math.max(0, Math.min(bounds.y, canvasHeight - height));

  return { x, y, width, height };
}

function buildCreateLayerCommand(
  runId: string,
  stage: string,
  options: {
    slotKey: MutationProposalDraft["mutation"]["commands"][number]["slotKey"];
    clientLayerKey: string;
    layerType: "shape" | "text" | "group" | "image";
    bounds: Bounds;
    role: string;
    variantKey: string;
    candidateId: string;
    sourceAssetId?: string | null;
    sourceSerial?: string | null;
    sourceCategory?: string | null;
    sourceUid?: string | null;
    sourceOriginUrl?: string | null;
    sourceWidth?: number | null;
    sourceHeight?: number | null;
    photoOrientation?: "portrait" | "landscape" | "square" | null;
    fitMode?: "cover";
    cropMode?: "centered_cover";
    fontRole?: "display" | "body";
    typography?: TypographyMetadata;
  },
): MutationProposalDraft["mutation"]["commands"][number] {
  const metadata: Record<string, string | number | boolean | null> = {
    role: options.role,
    variantKey: options.variantKey,
    candidateId: options.candidateId,
    sourceAssetId: options.sourceAssetId ?? null,
    sourceSerial: options.sourceSerial ?? null,
    sourceCategory: options.sourceCategory ?? null,
    sourceUid: options.sourceUid ?? null,
    sourceOriginUrl: options.sourceOriginUrl ?? null,
    sourceWidth: options.sourceWidth ?? null,
    sourceHeight: options.sourceHeight ?? null,
    photoOrientation: options.photoOrientation ?? null,
    fitMode: options.fitMode ?? null,
    cropMode: options.cropMode ?? null,
  };

  if (options.fontRole && options.typography) {
    metadata.fontRole = options.fontRole;
    metadata.displayFontFamily = options.typography.displayFontFamily;
    metadata.displayFontWeight = options.typography.displayFontWeight;
    metadata.bodyFontFamily = options.typography.bodyFontFamily;
    metadata.bodyFontWeight = options.typography.bodyFontWeight;
  }

  return {
    commandId: createRequestId(),
    op: "createLayer",
    slotKey: options.slotKey,
    clientLayerKey: options.clientLayerKey,
    targetRef: {
      layerId: null,
      clientLayerKey: options.clientLayerKey,
      ...(options.slotKey ? { slotKey: options.slotKey } : {}),
    },
    targetLayerVersion: null,
    parentRef: {
      position: "append",
    },
    expectedLayerType: null,
    allowNoop: false,
    metadataTags: {
      source: "agent-worker-spring-template",
      stage,
    },
    layerBlueprint: {
      layerType: options.layerType,
      bounds: options.bounds,
      metadata,
    },
    editable: true,
  };
}
