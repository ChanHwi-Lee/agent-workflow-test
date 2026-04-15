import type {
  ExecutablePlan,
  PersistedPlanAction,
} from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";
import type { TextLayoutHelper } from "@tooldi/tool-adapters";

import type {
  ConcreteLayoutClusterZone,
  FreeformRenderableBlock,
  GraphicRoleBinding,
  GraphicCompositionRole,
  HydratedPlanningInput,
  MutationProposalDraft,
  NormalizedIntent,
  SkeletonMutationBatch,
} from "../types.js";
import { buildCreateLayerCommand } from "./layerCommandBuilder.js";
import {
  createClusterZoneBounds,
  createGeometryPresets,
  resolveCopySlotBounds,
  resolveGraphicBindingBounds,
} from "./layoutGeometry.js";
import {
  type PolishInputs,
  type StyleMetadata,
  type TypographyMetadata,
  readCopyInputs,
  readFoundationInputs,
  readPhotoInputs,
  readPolishInputs,
} from "./planInputParsers.js";
import { resolveReadabilityPalette } from "./mutationReadabilityPolicy.js";

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
  const copySlotBounds = resolveCopySlotBounds(
    geometryPresets,
    copyInputs.copySlotAnchors,
    copyInputs.resolvedSlotBounds,
  );
  const styleMetadata =
    foundationInputs.styleMetadata ??
    copyInputs.styleMetadata ??
    polishInputs.styleMetadata;
  const readabilityPalette = mergeReadabilityPalette(
    resolveReadabilityPalette(foundationInputs.backgroundColorHex),
    styleMetadata,
  );
  const useFreeformCopyBlocks = copyInputs.freeformBlocks.length > 0;
  const useFreeformPolishBlocks = polishInputs.freeformBlocks.length > 0;
  const isV2FreeformExecution =
    foundationInputs.executionMode === "v2_freeform" ||
    copyInputs.executionMode === "v2_freeform" ||
    polishInputs.executionMode === "v2_freeform" ||
    foundationInputs.executionMode === "object_native_freeform" ||
    copyInputs.executionMode === "object_native_freeform" ||
    polishInputs.executionMode === "object_native_freeform";

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

  if (!isV2FreeformExecution && foundationInputs.includeHeroPanel) {
    foundationCommands.push(
        buildCreateLayerCommand(input.job.runId, "foundation", {
          slotKey:
            copyInputs.layoutMode === "center_stack" ? null : "hero_image",
          executionSlotKey: null,
          clientLayerKey: `hero_panel_${input.job.runId}`,
          layerType: "shape",
          bounds:
            foundationInputs.resolvedSlotBounds.hero_image ?? geometry.heroPanel,
        role:
          copyInputs.layoutMode === "center_stack"
            ? "spotlight_panel"
            : "hero_panel",
        variantKey: copyInputs.layoutMode,
        candidateId: copyInputs.selectedLayoutCandidateId,
      }),
    );
  }

  if (!isV2FreeformExecution && foundationInputs.includeBadge) {
    foundationCommands.push(
      buildCreateLayerCommand(input.job.runId, "foundation", {
        slotKey: "badge",
        executionSlotKey: "badge_text",
        clientLayerKey: `badge_${input.job.runId}`,
        layerType: "text",
        bounds: copySlotBounds.badge_text,
        role: "badge",
        variantKey: copyInputs.layoutMode,
        candidateId: copyInputs.selectedLayoutCandidateId,
        textContent: foundationInputs.badgeText,
        fontRole: "display",
        typography,
        styleTokens: {
          fillColor: readabilityPalette.inverseTextColor,
        },
      }),
    );
  }

  if (!isV2FreeformExecution && foundationInputs.includeRibbon) {
    foundationCommands.push(
      buildCreateLayerCommand(input.job.runId, "foundation", {
        slotKey: null,
        executionSlotKey: null,
        clientLayerKey: `ribbon_strip_${input.job.runId}`,
        layerType: "shape",
        bounds: geometry.ribbon,
        role: "ribbon_strip",
        variantKey: polishInputs.decorationMode,
        candidateId: polishInputs.selectedDecorationCandidateId,
        styleTokens: {
          fillColor: readabilityPalette.accentTextColor,
        },
      }),
    );
  }

  if (!isV2FreeformExecution && foundationInputs.includeFrame) {
    foundationCommands.push(
      buildCreateLayerCommand(input.job.runId, "foundation", {
        slotKey: null,
        executionSlotKey: null,
        clientLayerKey: `frame_${input.job.runId}`,
        layerType: "shape",
        bounds: geometry.frame,
        role: "frame",
        variantKey: copyInputs.layoutMode,
        candidateId: copyInputs.selectedLayoutCandidateId,
        styleTokens: {
          fillColor: readabilityPalette.accentTextColor,
        },
      }),
    );
  }

  const photoCommands: MutationProposalDraft["mutation"]["commands"] =
    photoSelected
      ? [
          buildCreateLayerCommand(input.job.runId, "photo", {
            slotKey: "hero_image",
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
    isV2FreeformExecution
      ? buildFreeformBlockCommands(input.job.runId, "copy", copyInputs.freeformBlocks, typography)
      : useFreeformCopyBlocks
      ? buildFreeformBlockCommands(input.job.runId, "copy", copyInputs.freeformBlocks, typography)
      : [
          buildCreateLayerCommand(input.job.runId, "copy", {
            slotKey: "headline",
            executionSlotKey: "headline",
            clientLayerKey: `headline_${input.job.runId}`,
            layerType: "text",
            bounds: copySlotBounds.headline,
            role: "headline",
            variantKey: copyInputs.layoutMode,
            candidateId: copyInputs.selectedLayoutCandidateId,
            textContent: copyInputs.copySlotTexts.headline ?? normalizedIntent.goalSummary,
            fontRole: "display",
            typography,
            styleTokens: {
              fillColor: readabilityPalette.primaryTextColor,
            },
          }),
          buildCreateLayerCommand(input.job.runId, "copy", {
            slotKey: "supporting_copy",
            executionSlotKey: "subheadline",
            clientLayerKey: `supporting_copy_${input.job.runId}`,
            layerType: "text",
            bounds: copySlotBounds.subheadline,
            role: "supporting_copy",
            variantKey: copyInputs.layoutMode,
            candidateId: copyInputs.selectedLayoutCandidateId,
            textContent: copyInputs.copySlotTexts.subheadline ?? "지금 바로 확인하세요",
            fontRole: "body",
            typography,
            styleTokens: {
              fillColor: readabilityPalette.secondaryTextColor,
            },
          }),
          buildCreateLayerCommand(input.job.runId, "copy", {
            slotKey: null,
            executionSlotKey: "offer_line",
            clientLayerKey: `price_callout_${input.job.runId}`,
            layerType: "text",
            bounds: copySlotBounds.offer_line,
            role: "price_callout",
            variantKey: copyInputs.layoutMode,
            candidateId: copyInputs.selectedLayoutCandidateId,
            textContent: copyInputs.copySlotTexts.offer_line ?? "최대 50% OFF",
            fontRole: "display",
            typography,
            styleTokens: {
              fillColor: readabilityPalette.accentTextColor,
            },
          }),
        ];

  if (!isV2FreeformExecution && !useFreeformCopyBlocks && copyInputs.includeHeroCaption) {
    copyCommands.push(
        buildCreateLayerCommand(input.job.runId, "copy", {
          slotKey: null,
          executionSlotKey: null,
          clientLayerKey: `hero_caption_${input.job.runId}`,
        layerType: "text",
        bounds: copySlotBounds.subheadline,
        role: "hero_caption",
        variantKey: copyInputs.layoutMode,
        candidateId: copyInputs.selectedLayoutCandidateId,
        textContent: copyInputs.copySlotTexts.subheadline ?? "지금 바로 확인하세요",
        fontRole: "body",
        typography,
        styleTokens: {
          fillColor: readabilityPalette.inverseTextColor,
        },
      }),
    );
  }

  const polishCommands: MutationProposalDraft["mutation"]["commands"] =
    isV2FreeformExecution
      ? buildFreeformBlockCommands(
          input.job.runId,
          "polish",
          polishInputs.freeformBlocks,
          typography,
        )
      : useFreeformPolishBlocks
      ? buildFreeformBlockCommands(
          input.job.runId,
          "polish",
          polishInputs.freeformBlocks,
          typography,
        )
      : [
          buildCreateLayerCommand(input.job.runId, "polish", {
            slotKey: "cta",
            executionSlotKey: "cta",
            clientLayerKey: `cta_${input.job.runId}`,
            layerType: "group",
            bounds: copySlotBounds.cta,
            role: "cta",
            variantKey: polishInputs.decorationMode,
            candidateId: polishInputs.selectedDecorationCandidateId,
            sourceAssetId: polishInputs.selectedDecorationAssetId,
            sourceSerial: polishInputs.selectedDecorationSerial,
            sourceCategory: polishInputs.selectedDecorationCategory,
            textContent: copyInputs.copySlotTexts.cta ?? "자세히 보기",
            fontRole: "display",
            typography,
            styleTokens: {
              surfaceColor: readabilityPalette.ctaSurfaceColor,
              textColor: readabilityPalette.ctaTextColor,
              ctaShapeLanguage: polishInputs.styleMetadata?.ctaShapeLanguage ?? null,
            },
          }),
          ...buildGraphicRoleCommands(
            input.job.runId,
            polishInputs,
            geometryPresets,
            copySlotBounds,
            readabilityPalette,
          ),
        ];

  if (!isV2FreeformExecution && !useFreeformPolishBlocks && polishInputs.includeUnderline) {
    polishCommands.push(
      buildCreateLayerCommand(input.job.runId, "polish", {
        slotKey: null,
        executionSlotKey: null,
        clientLayerKey: `underline_bar_${input.job.runId}`,
        layerType: "shape",
        bounds: geometry.underlineBar,
        role: "underline_bar",
        variantKey: polishInputs.decorationMode,
        candidateId: polishInputs.selectedDecorationCandidateId,
        styleTokens: {
          fillColor: readabilityPalette.accentTextColor,
        },
      }),
    );
  }

  if (!isV2FreeformExecution && !useFreeformPolishBlocks && !foundationInputs.includeRibbon && polishInputs.includeRibbon) {
    polishCommands.push(
      buildCreateLayerCommand(input.job.runId, "polish", {
        slotKey: null,
        executionSlotKey: null,
        clientLayerKey: `ribbon_strip_${input.job.runId}`,
        layerType: "shape",
        bounds: geometry.ribbon,
        role: "ribbon_strip",
        variantKey: polishInputs.decorationMode,
        candidateId: polishInputs.selectedDecorationCandidateId,
        styleTokens: {
          fillColor: readabilityPalette.accentTextColor,
        },
      }),
    );
  }

  if (!isV2FreeformExecution && !useFreeformPolishBlocks) {
    polishCommands.push(
      buildCreateLayerCommand(input.job.runId, "polish", {
        slotKey: null,
        executionSlotKey: "footer_note",
        clientLayerKey: `footer_note_${input.job.runId}`,
        layerType: "text",
        bounds: copySlotBounds.footer_note,
        role: "footer_note",
        variantKey: foundationInputs.backgroundMode,
        candidateId: foundationInputs.selectedBackgroundCandidateId,
        textContent: copyInputs.copySlotTexts.footer_note ?? "이벤트 기간 내 혜택 적용",
        fontRole: "body",
        typography,
        styleTokens: {
          fillColor: readabilityPalette.secondaryTextColor,
        },
      }),
    );
  }

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

function buildGraphicRoleCommands(
  runId: string,
  polishInputs: PolishInputs,
  geometryPresets: ReturnType<typeof createGeometryPresets>,
  copySlotBounds: ReturnType<typeof resolveCopySlotBounds>,
  readabilityPalette: ReturnType<typeof resolveReadabilityPalette>,
): MutationProposalDraft["mutation"]["commands"] {
  const roleGeometryMap = createClusterZoneBounds(
    geometryPresets,
    polishInputs.clusterZones,
  );
  const placementHintMap = new Map(
    polishInputs.graphicRolePlacementHints.map((hint) => [hint.role, hint.zone]),
  );
  const bindingPool =
    polishInputs.graphicRoleBindings.length > 0
      ? polishInputs.graphicRoleBindings
      : (polishInputs.graphicCompositionSet?.roles ?? []).map((role) => ({
          role: role.role,
          candidateId: role.candidateId,
          sourceAssetId: role.sourceAssetId,
          sourceSerial: role.sourceSerial,
          sourceCategory: role.sourceCategory,
          variantKey: role.variantKey,
          decorationMode: role.decorationMode,
          required: role.role === "primary_accent" || role.role === "cta_container",
          zonePreference: resolveLegacyRoleZone(role.role),
        }));

  const roleCommands =
    bindingPool
      .map((binding) => {
        const styleTokens = resolveGraphicRoleStyleTokens(
          binding.role,
          readabilityPalette,
          polishInputs.styleMetadata,
        );
        const baseOptions = {
          slotKey:
            binding.role === "primary_accent"
              ? "decoration"
              : binding.role === "cta_container"
                ? "cta"
                : null,
          executionSlotKey: null,
          clientLayerKey: `${binding.role}_${runId}`,
          layerType: "shape",
          bounds: resolveGraphicBindingBounds(
            binding.role,
            placementHintMap.get(binding.role) ?? binding.zonePreference,
            roleGeometryMap,
            copySlotBounds,
          ),
          role: binding.role,
          variantKey: binding.variantKey,
          candidateId: binding.candidateId,
          sourceAssetId: binding.sourceAssetId,
          sourceSerial: binding.sourceSerial,
          sourceCategory: binding.sourceCategory,
          renderPrimitive:
            binding.sourceSerial && binding.sourceCategory
              ? "catalog_element"
              : null,
          clusterZone:
            placementHintMap.get(binding.role) ?? binding.zonePreference,
        } as const;

        return styleTokens
          ? buildCreateLayerCommand(runId, "polish", {
              ...baseOptions,
              styleTokens,
            })
          : buildCreateLayerCommand(runId, "polish", baseOptions);
      });

  const hasBoundCtaContainer = bindingPool.some(
    (binding) => binding.role === "cta_container",
  );
  const ctaFallbackCommand =
    polishInputs.ctaContainerExpected && !hasBoundCtaContainer
      ? [(() => {
          const styleTokens = resolveGraphicRoleStyleTokens(
            "cta_container",
            readabilityPalette,
            polishInputs.styleMetadata,
          );
          const baseOptions = {
            slotKey: null,
            executionSlotKey: null,
            clientLayerKey: `cta_container_fallback_${runId}`,
            layerType: "shape",
            bounds: resolveGraphicBindingBounds(
              "cta_container",
              "bottom_strip",
              roleGeometryMap,
              copySlotBounds,
            ),
            role: "cta_container",
            variantKey: "fallback_cta_pill",
            candidateId: `${runId}_fallback_cta_container`,
            clusterZone: "bottom_strip",
          } as const;

          return styleTokens
            ? buildCreateLayerCommand(runId, "polish", {
                ...baseOptions,
                styleTokens,
              })
            : buildCreateLayerCommand(runId, "polish", baseOptions);
        })()]
      : [];

  if (roleCommands.length > 0 || ctaFallbackCommand.length > 0) {
    return [...ctaFallbackCommand, ...roleCommands];
  }

  return [
    buildCreateLayerCommand(runId, "polish", {
      slotKey: "decoration",
      executionSlotKey: null,
      clientLayerKey: `decoration_${runId}`,
      layerType: "shape",
      bounds: roleGeometryMap.right_cluster,
      role:
        polishInputs.decorationMode === "ribbon_badge"
          ? "ribbon_strip"
          : "decoration",
      variantKey: polishInputs.decorationMode,
      candidateId: polishInputs.selectedDecorationCandidateId,
      sourceAssetId: polishInputs.selectedDecorationAssetId,
      sourceSerial: polishInputs.selectedDecorationSerial,
      sourceCategory: polishInputs.selectedDecorationCategory,
      renderPrimitive:
        polishInputs.selectedDecorationSerial &&
        polishInputs.selectedDecorationCategory
          ? "catalog_element"
          : null,
      styleTokens: {
        fillColor: readabilityPalette.accentTextColor,
      },
      clusterZone: "right_cluster",
    }),
  ];
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

function resolveGraphicRoleStyleTokens(
  role: GraphicCompositionRole,
  readabilityPalette: ReturnType<typeof resolveReadabilityPalette>,
  styleMetadata: StyleMetadata | null,
): Record<string, string | number | boolean | null> | undefined {
  const ctaShapeLanguage = styleMetadata?.ctaShapeLanguage ?? null;
  switch (role) {
    case "cta_container":
      return {
        fillColor: readabilityPalette.ctaSurfaceColor,
        textColor: readabilityPalette.ctaTextColor,
        ctaShapeLanguage,
      };
    case "badge_or_ribbon":
      return {
        fillColor: readabilityPalette.accentTextColor,
        textColor: readabilityPalette.inverseTextColor,
      };
    case "frame":
      return {
        fillColor: readabilityPalette.accentTextColor,
      };
    default:
      return {
        fillColor: readabilityPalette.accentTextColor,
      };
  }
}

function resolveLegacyRoleZone(
  role: GraphicCompositionRole,
): ConcreteLayoutClusterZone {
  switch (role) {
    case "frame":
      return "frame";
    case "corner_accent":
      return "top_corner";
    case "badge_or_ribbon":
      return "bottom_strip";
    default:
      return "right_cluster";
  }
}

function buildFreeformBlockCommands(
  runId: string,
  stage: string,
  blocks: FreeformRenderableBlock[],
  typography: TypographyMetadata,
): MutationProposalDraft["mutation"]["commands"] {
  return blocks.map((block, index) =>
    buildCreateLayerCommand(runId, stage, {
      slotKey: block.slotKey,
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
