import type { ExecutablePlan, PersistedPlanAction } from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";
import type { TextLayoutHelper } from "@tooldi/tool-adapters";

import type {
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
  | "center_stack"
  | "badge_led";

type DecorationMode =
  | "graphic_cluster"
  | "ribbon_badge"
  | "photo_support";

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
  underlineBar: Bounds;
  footerNote: Bounds;
};

type TypographyMetadata = {
  displayFontFamily: string | null;
  displayFontWeight: number | null;
  bodyFontFamily: string | null;
  bodyFontWeight: number | null;
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
  const copyInputs = readCopyInputs(planActions.copy.inputs);
  const polishInputs = readPolishInputs(planActions.polish.inputs);
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
    buildCreateLayerCommand(input.job.runId, "polish", {
      slotKey: "decoration",
      clientLayerKey: `decoration_${input.job.runId}`,
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
    proposals: [
      createProposal({
        seq: 1,
        stageLabel: "foundation",
        stageDescription: `Prepare ${foundationInputs.backgroundMode} background and base frame`,
        expectedBaseRevision: 0,
        commands: foundationCommands,
      }),
      createProposal({
        seq: 2,
        stageLabel: "copy",
        stageDescription: `Place ${copyInputs.layoutMode} copy cluster`,
        expectedBaseRevision: 1,
        dependsOnSeq: 1,
        commands: copyCommands,
      }),
      createProposal({
        seq: 3,
        stageLabel: "polish",
        stageDescription: `Apply ${polishInputs.decorationMode} decorative polish`,
        expectedBaseRevision: 2,
        dependsOnSeq: 2,
        commands: polishCommands,
      }),
    ],
  };
}

function validatePlanActions(plan: ExecutablePlan): {
  foundation: PersistedPlanAction;
  copy: PersistedPlanAction;
  polish: PersistedPlanAction;
} {
  const foundation = plan.actions.find(
    (action) => action.operation === "prepare_background_and_foundation",
  );
  const copy = plan.actions.find((action) => action.operation === "place_copy_cluster");
  const polish = plan.actions.find(
    (action) => action.operation === "place_promo_polish",
  );

  if (!foundation || !copy || !polish) {
    throw new Error("Executable plan is missing one or more required spring actions");
  }

  return { foundation, copy, polish };
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

function readPolishInputs(inputs: PersistedPlanAction["inputs"]) {
  const record = inputs as {
    decorationMode?: DecorationMode;
    selectedDecorationCandidateId?: string;
    selectedDecorationAssetId?: string | null;
    selectedDecorationSerial?: string | null;
    selectedDecorationCategory?: string | null;
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

  const geometry: LayoutGeometry = centered
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
          y: topY + 96,
          width: centerWidth,
          height: Math.max(72, headlineHeight),
        }),
        supportingCopy: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - Math.min(centerWidth, canvasWidth - 180)) / 2),
          y: topY + 190,
          width: Math.min(centerWidth, canvasWidth - 180),
          height: 72,
        }),
        priceCallout: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - 280) / 2),
          y: topY + 280,
          width: 280,
          height: 52,
        }),
        heroCaption: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - 260) / 2),
          y: topY + 342,
          width: 260,
          height: 32,
        }),
        cta: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - 240) / 2),
          y: topY + 360,
          width: 240,
          height: 64,
        }),
        decoration: fitBounds(canvasWidth, canvasHeight, {
          x: canvasWidth - marginX - 110,
          y: topY,
          width: decorationMode === "ribbon_badge" ? 96 : 110,
          height: decorationMode === "ribbon_badge" ? 96 : 110,
        }),
        underlineBar: fitBounds(canvasWidth, canvasHeight, {
          x: Math.round((canvasWidth - 130) / 2),
          y: topY + 346,
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
          width: rightColumnWidth,
          height: Math.min(264, Math.round(canvasHeight * 0.42)),
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
          y: topY + 148,
          width: leftColumnWidth + 24,
          height: 70,
        }),
        priceCallout: fitBounds(canvasWidth, canvasHeight, {
          x: marginX,
          y: topY + 238,
          width: Math.min(320, leftColumnWidth),
          height: 48,
        }),
        heroCaption: fitBounds(canvasWidth, canvasHeight, {
          x: rightColumnX + 20,
          y: topY + Math.min(284, Math.round(canvasHeight * 0.46)),
          width: Math.max(160, rightColumnWidth - 40),
          height: 30,
        }),
        cta: fitBounds(canvasWidth, canvasHeight, {
          x: marginX,
          y: topY + 320,
          width: 230,
          height: 64,
        }),
        decoration: fitBounds(canvasWidth, canvasHeight, {
          x: rightColumnX + Math.max(12, Math.round(rightColumnWidth * 0.16)),
          y: topY + Math.min(312, Math.round(canvasHeight * 0.5)),
          width:
            decorationMode === "ribbon_badge"
              ? Math.min(150, rightColumnWidth - 24)
              : Math.min(180, rightColumnWidth - 24),
          height:
            decorationMode === "ribbon_badge"
              ? Math.min(90, canvasHeight - topY - 120)
              : Math.min(140, canvasHeight - topY - 120),
        }),
        underlineBar: fitBounds(canvasWidth, canvasHeight, {
          x: marginX,
          y: topY + 298,
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

  return geometry;
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
    layerType: "shape" | "text" | "group";
    bounds: Bounds;
    role: string;
    variantKey: string;
    candidateId: string;
    sourceAssetId?: string | null;
    sourceSerial?: string | null;
    sourceCategory?: string | null;
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
