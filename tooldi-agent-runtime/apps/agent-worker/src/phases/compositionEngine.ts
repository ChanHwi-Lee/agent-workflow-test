import { createRequestId } from "@tooldi/agent-domain";
import {
  templateAssetPolicyPrefersPhoto,
} from "@tooldi/agent-llm";

import type {
  CompositionBrief,
  CompositionRanking,
  CompositionVariant,
  CompositionVariantSet,
  NormalizedIntent,
  RetrievalStageResult,
  SceneBindingPlan,
  SelectionDecision,
  TemplateCandidateBundle,
  TemplatePriorBundle,
  TemplateSelectionPolicy,
} from "../types.js";
import {
  buildFamilyOrder,
  FAMILY_STRATEGIES,
  type FamilyVariantSeed,
  pickDecorationForVariant,
  rankDecorationCandidates,
  resolvePreferredLayoutModes,
} from "./compositionEngine.familyCatalog.js";
import {
  projectWinningVariant,
  type ProjectionSelections,
} from "./compositionEngine.project.js";
import {
  rankVariants,
  selectDiverseTopVariants,
} from "./compositionEngine.rank.js";

type LayoutCandidate = TemplateCandidateBundle["layout"]["candidates"][number];
type BackgroundCandidate =
  TemplateCandidateBundle["background"]["candidates"][number];
type DecorationCandidate =
  TemplateCandidateBundle["decoration"]["candidates"][number];
type PhotoCandidate = TemplateCandidateBundle["photo"]["candidates"][number];
type LayoutMode = SelectionDecision["layoutMode"];

type CompositionSelectionResult = {
  compositionBrief: CompositionBrief;
  compositionVariantSet: CompositionVariantSet;
  compositionRanking: CompositionRanking;
  selectionDecision: SelectionDecision;
};

type PhotoEligibility = {
  mode: SelectionDecision["photoBranchMode"];
  reason: string;
  photoLayout: LayoutCandidate | null;
};

type CompositionCommonSelections = ProjectionSelections & {
  orderedDecorations: DecorationCandidate[];
  topPhotoCandidate: PhotoCandidate | null;
  photoEligibility: PhotoEligibility;
  preferredGraphicLayoutModes: LayoutMode[];
  primaryGraphicLayout: LayoutCandidate;
};

export async function buildCompositionSelection(
  intent: NormalizedIntent,
  candidates: TemplateCandidateBundle,
  dependencies: {
    retrievalStage: RetrievalStageResult;
    selectionPolicy: TemplateSelectionPolicy;
    templatePriorBundle?: TemplatePriorBundle | null;
    sceneBindingPlan?: SceneBindingPlan | null;
  },
): Promise<CompositionSelectionResult> {
  const commonSelections = resolveCommonSelections(
    intent,
    candidates,
    dependencies.retrievalStage,
    dependencies.selectionPolicy,
    dependencies.templatePriorBundle ?? null,
  );
  const compositionBrief = buildCompositionBrief(intent, commonSelections);
  const candidateVariants = generateVariantCandidates(
    compositionBrief,
    candidates,
    commonSelections,
  );
  const scoredCandidates = rankVariants(
    compositionBrief,
    candidateVariants,
    commonSelections.photoEligibility,
  );
  const selectedTopVariants = selectDiverseTopVariants(
    candidateVariants,
    scoredCandidates,
    compositionBrief.requestedVariantCount,
  );
  const selectedScores = selectedTopVariants.map((variant) =>
    scoredCandidates.find((score) => score.variantId === variant.variantId)!,
  );
  const orderedScores = [...selectedScores].sort(
    (left, right) => right.totalScore - left.totalScore,
  );
  const winnerScore = orderedScores[0];
  if (!winnerScore) {
    throw new Error("Composition ranking requires at least one selected variant");
  }
  const winner = selectedTopVariants.find(
    (variant) => variant.variantId === winnerScore.variantId,
  );
  if (!winner) {
    throw new Error("Selected variant set did not contain the winning variant");
  }

  const compositionVariantSet: CompositionVariantSet = {
    setId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    briefId: compositionBrief.briefId,
    variants: selectedTopVariants,
    summary:
      `Selected ${selectedTopVariants.length} diverse composition variants ` +
      `from ${candidateVariants.length} candidates for ${intent.domain}.`,
  };
  const compositionRanking: CompositionRanking = {
    rankingId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    winnerVariantId: winner.variantId,
    winnerFamilyKey: winner.familyKey,
    scores: orderedScores,
    rankingCriteria: [
      "brief_alignment",
      "canvas_fit",
      "execution_safety",
      "visual_balance",
      "copy_rhythm_fit",
      "intra_family_novelty",
    ],
    summary:
      `Ranked ${orderedScores.length} selected variants and picked ${winner.familyKey} ` +
      `as the winner.`,
  };

  return {
    compositionBrief,
    compositionVariantSet,
    compositionRanking,
    selectionDecision: projectWinningVariant(
      intent,
      commonSelections,
      winner,
      compositionVariantSet,
      dependencies.sceneBindingPlan ?? null,
    ),
  };
}

function resolveCommonSelections(
  intent: NormalizedIntent,
  candidates: TemplateCandidateBundle,
  retrievalStage: RetrievalStageResult,
  selectionPolicy: TemplateSelectionPolicy,
  templatePriorBundle: TemplatePriorBundle | null,
): CompositionCommonSelections {
  const filteredBackground = filterCandidatesByPolicy(
    candidates.background.candidates,
    selectionPolicy,
    retrievalStage,
  );
  const filteredDecoration = filterCandidatesByPolicy(
    candidates.decoration.candidates,
    selectionPolicy,
    retrievalStage,
  );
  const filteredPhoto = filterCandidatesByPolicy(
    candidates.photo.candidates,
    selectionPolicy,
    retrievalStage,
  );
  const background = pickByPriority(filteredBackground, [
    "background_source",
    "graphic_source",
  ]);
  const orderedDecorations = rankDecorationCandidates(filteredDecoration);
  const topPhotoCandidate = pickOptionalPhotoCandidate(filteredPhoto);
  const preferredGraphicLayoutModes = dedupeLayoutModes([
    ...(templatePriorBundle?.selectedScaffold?.layoutModeHint &&
    templatePriorBundle.selectedScaffold.layoutModeHint !== "copy_left_with_right_photo"
      ? [templatePriorBundle.selectedScaffold.layoutModeHint]
      : []),
    ...resolvePreferredLayoutModes(intent).filter(
      (layoutMode) => layoutMode !== "copy_left_with_right_photo",
    ),
  ]);
  const primaryGraphicLayout = pickPrimaryGraphicLayout(
    preferredGraphicLayoutModes,
    candidates.layout.candidates,
  );
  const photoEligibility = evaluatePhotoVariantEligibility(
    intent,
    primaryGraphicLayout,
    orderedDecorations[0] ?? null,
    topPhotoCandidate,
    pickPhotoLayout(candidates),
    selectionPolicy,
  );

  return {
    background,
    orderedDecorations,
    topPhotoCandidate,
    photoEligibility,
    preferredGraphicLayoutModes,
    primaryGraphicLayout,
    photoEligibilityMode: photoEligibility.mode,
    photoEligibilityReason: photoEligibility.reason,
  };
}

function buildCompositionBrief(
  intent: NormalizedIntent,
  commonSelections: CompositionCommonSelections,
): CompositionBrief {
  const preferredLayoutModes = dedupeLayoutModes([
    ...commonSelections.preferredGraphicLayoutModes,
    ...(commonSelections.photoEligibility.mode === "photo_selected"
      ? (["copy_left_with_right_photo"] as LayoutMode[])
      : []),
  ]);

  return {
    briefId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    canvasPreset: intent.canvasPreset,
    currentCanvasWidth: parseCanvasWidth(intent.canvasPreset),
    currentCanvasHeight: parseCanvasHeight(intent.canvasPreset),
    requestedVariantCount: 3,
    subjectBinding: intent.subjectBinding,
    offerIntent: intent.offerIntent,
    layoutIntent: intent.layoutIntent,
    primaryVisualPolicy: intent.primaryVisualPolicy,
    preferredLayoutModes,
    summary:
      `Composition brief targets ${intent.canvasPreset} with ` +
      `${intent.primaryVisualPolicy} and ${intent.layoutIntent} intent.`,
  };
}

function generateVariantCandidates(
  compositionBrief: CompositionBrief,
  candidates: TemplateCandidateBundle,
  commonSelections: CompositionCommonSelections,
): CompositionVariant[] {
  const layoutCandidateByMode = new Map<LayoutMode, LayoutCandidate>();
  for (const candidate of candidates.layout.candidates) {
    if (candidate.payload.layoutMode) {
      layoutCandidateByMode.set(candidate.payload.layoutMode, candidate);
    }
  }

  const familyOrder = buildFamilyOrder(
    compositionBrief,
    candidates.layout.candidates,
    commonSelections.photoEligibility,
  );

  return familyOrder.flatMap((familyKey, familyRank) => {
    const strategy = FAMILY_STRATEGIES.find(
      (candidate) => candidate.familyKey === familyKey,
    );
    const layoutCandidate = layoutCandidateByMode.get(familyKey);
    if (!strategy || !layoutCandidate) {
      return [];
    }

    return strategy.seeds.map((seed, familyVariantRank) =>
      buildVariantCandidate({
        familyKey,
        familyRank,
        familyVariantRank,
        seed,
        layoutCandidate,
        background: commonSelections.background,
        decoration: pickDecorationForVariant(
          commonSelections.orderedDecorations,
          familyRank,
          familyVariantRank,
        ),
        topPhotoCandidate: commonSelections.topPhotoCandidate,
        photoEligibility: commonSelections.photoEligibility,
      }),
    );
  });
}

function buildVariantCandidate(options: {
  familyKey: LayoutMode;
  familyRank: number;
  familyVariantRank: number;
  seed: FamilyVariantSeed;
  layoutCandidate: LayoutCandidate;
  background: BackgroundCandidate;
  decoration: DecorationCandidate | null;
  topPhotoCandidate: PhotoCandidate | null;
  photoEligibility: PhotoEligibility;
}): CompositionVariant {
  const {
    familyKey,
    familyRank,
    familyVariantRank,
    seed,
    layoutCandidate,
    background,
    decoration,
    topPhotoCandidate,
    photoEligibility,
  } = options;
  const photoMode =
    familyKey === "copy_left_with_right_photo"
      ? photoEligibility.mode
      : photoEligibility.mode === "not_considered"
        ? "not_considered"
        : "graphic_preferred";

  return {
    variantId: createRequestId(),
    familyKey,
    layoutMode: familyKey,
    variantSignature: `${familyKey}:${seed.variantKey}:${decoration?.candidateId ?? "none"}`,
    layoutCandidateId: layoutCandidate.candidateId,
    backgroundCandidateId: background.candidateId,
    decorationCandidateId: decoration?.candidateId ?? null,
    photoCandidateId:
      familyKey === "copy_left_with_right_photo" && photoEligibility.mode === "photo_selected"
        ? topPhotoCandidate?.candidateId ?? null
        : null,
    familyRank,
    familyVariantRank,
    layoutFitScore: layoutCandidate.fitScore,
    spacingIntent: seed.spacingIntent,
    accentDensity: seed.accentDensity,
    ctaTreatment: seed.ctaTreatment,
    copyDensity: seed.copyDensity,
    headlineEmphasis: seed.headlineEmphasis,
    ctaWeight: seed.ctaWeight,
    copyVisualRatio: seed.copyVisualRatio,
    negativeSpaceBias: seed.negativeSpaceBias,
    badgeProminence: seed.badgeProminence,
    copyExpressionProfile: seed.copyExpressionProfile,
    photoMode,
    executionStrategy:
      familyKey === "copy_left_with_right_photo" &&
      photoEligibility.mode === "photo_selected"
        ? "photo_hero_shape_text_group"
        : "graphic_first_shape_text_group",
    validation:
      familyKey === "copy_left_with_right_photo" &&
      photoEligibility.mode !== "photo_selected"
        ? {
            status: "invalid",
            reasons: [photoEligibility.reason],
          }
        : {
            status: "valid",
            reasons: [],
          },
    summary:
      `${familyKey}/${seed.variantKey} keeps ${seed.copyDensity} copy density, ` +
      `${seed.ctaWeight} CTA weight, ${seed.accentDensity} accent density.`,
  };
}

function pickPrimaryGraphicLayout(
  preferredLayoutModes: LayoutMode[],
  layoutCandidates: TemplateCandidateBundle["layout"]["candidates"],
): LayoutCandidate {
  for (const layoutMode of preferredLayoutModes) {
    const candidate = layoutCandidates.find(
      (entry) => entry.payload.layoutMode === layoutMode,
    );
    if (candidate) {
      return candidate;
    }
  }

  const fallbackCandidate = layoutCandidates.find(
    (entry) => entry.payload.layoutMode !== "copy_left_with_right_photo",
  );
  if (!fallbackCandidate) {
    throw new Error("No eligible graphic-first layout candidate is available");
  }
  return fallbackCandidate;
}

function pickPhotoLayout(
  candidates: TemplateCandidateBundle,
): LayoutCandidate | null {
  return (
    candidates.layout.candidates.find(
      (candidate) => candidate.payload.layoutMode === "copy_left_with_right_photo",
    ) ?? null
  );
}

function evaluatePhotoVariantEligibility(
  intent: NormalizedIntent,
  selectedLayout: LayoutCandidate,
  selectedDecoration: DecorationCandidate | null,
  topPhotoCandidate: PhotoCandidate | null,
  photoLayout: LayoutCandidate | null,
  selectionPolicy: TemplateSelectionPolicy,
): PhotoEligibility {
  const photoPreferred = templateAssetPolicyPrefersPhoto(intent.assetPolicy);
  const photoPromotionTolerance = photoPreferred ? 0.08 : 0.03;

  if (!selectionPolicy.allowPhotoCandidates) {
    return {
      mode: "not_considered",
      reason: "photo-catalog tool is disabled in the current selection policy",
      photoLayout,
    };
  }

  if (!topPhotoCandidate) {
    return {
      mode: "graphic_preferred",
      reason: "no eligible photo candidate was returned from the current Tooldi source query waterfall",
      photoLayout,
    };
  }

  if (intent.canvasPreset !== "wide_1200x628") {
    return {
      mode: "not_considered",
      reason: "photo branch phase A only compares hero-photo layouts on the representative wide preset",
      photoLayout,
    };
  }

  if (selectedLayout.payload.layoutMode !== "copy_left_with_right_decoration") {
    return {
      mode: "not_considered",
      reason: "selected layout does not expose a dedicated hero-photo field",
      photoLayout,
    };
  }

  if (!photoLayout?.executionAllowed) {
    return {
      mode: "graphic_preferred",
      reason: "photo branch requires an executable wide-preset photo layout candidate",
      photoLayout,
    };
  }

  if (
    !topPhotoCandidate.executionAllowed ||
    !topPhotoCandidate.sourceOriginUrl ||
    topPhotoCandidate.sourceWidth == null ||
    topPhotoCandidate.sourceHeight == null
  ) {
    return {
      mode: "graphic_preferred",
      reason: "photo candidate is missing executable metadata required for the hero-photo slot",
      photoLayout,
    };
  }

  if (topPhotoCandidate.payload.photoOrientation === "portrait") {
    return {
      mode: "graphic_preferred",
      reason: "portrait photo candidate raises crop/focal risk for the wide preset hero-photo slot",
      photoLayout,
    };
  }

  if (
    selectedDecoration &&
    topPhotoCandidate.fitScore + photoPromotionTolerance >=
      selectedDecoration.fitScore
  ) {
    return {
      mode: "photo_selected",
      reason:
        "photo candidate stayed within the promotion tolerance window and is preferred for the wide preset hero-photo slot",
      photoLayout,
    };
  }

  return {
    mode: "graphic_preferred",
    reason:
      photoPreferred
        ? "graphic-first path still remained safer than the preferred photo path after comparison"
        : "graphic-first path remains safer for readability and execution despite the available photo candidate",
    photoLayout,
  };
}

function filterCandidatesByPolicy<
  T extends {
    sourceFamily: string;
  },
>(
  candidates: T[],
  selectionPolicy: TemplateSelectionPolicy,
  retrievalStage: RetrievalStageResult,
): T[] {
  const allowedSources = new Set(retrievalStage.allowedSourceFamilies);
  const filtered = candidates.filter((candidate) =>
    candidate.sourceFamily === "derived_policy" ||
    allowedSources.has(
      candidate.sourceFamily as RetrievalStageResult["allowedSourceFamilies"][number],
    ),
  );

  if (selectionPolicy.allowPhotoCandidates) {
    return filtered;
  }

  const withoutPhotos = filtered.filter(
    (candidate) => candidate.sourceFamily !== "photo_source",
  );
  return withoutPhotos.length > 0 ? withoutPhotos : filtered;
}

function pickByPriority<
  T extends {
    sourceFamily: string;
    fitScore: number;
    executionAllowed: boolean;
  },
>(candidates: T[], sourcePriority: string[]): T {
  const executionSafe = candidates.filter((candidate) => candidate.executionAllowed);
  const pool = executionSafe.length > 0 ? executionSafe : candidates;

  const ranked = [...pool].sort((left, right) => {
    const leftPriority = sourcePriority.indexOf(left.sourceFamily);
    const rightPriority = sourcePriority.indexOf(right.sourceFamily);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return right.fitScore - left.fitScore;
  });

  return ranked[0]!;
}

function pickOptionalPhotoCandidate<T extends {
  fitScore: number;
  executionAllowed: boolean;
}>(candidates: T[]): T | null {
  if (candidates.length === 0) {
    return null;
  }

  const ranked = [...candidates].sort((left, right) => {
    if (left.executionAllowed !== right.executionAllowed) {
      return left.executionAllowed ? -1 : 1;
    }
    return right.fitScore - left.fitScore;
  });

  return ranked[0] ?? null;
}

function dedupeLayoutModes(layoutModes: LayoutMode[]): LayoutMode[] {
  return [...new Set(layoutModes)];
}

function parseCanvasWidth(canvasPreset: NormalizedIntent["canvasPreset"]): number {
  if (canvasPreset === "wide_1200x628") {
    return 1200;
  }
  if (canvasPreset === "square_1080") {
    return 1080;
  }
  if (canvasPreset === "story_1080x1920") {
    return 1080;
  }
  const matched = /^custom_(\d+)x(\d+)$/.exec(canvasPreset);
  return matched ? Number(matched[1]) : 1200;
}

function parseCanvasHeight(
  canvasPreset: NormalizedIntent["canvasPreset"],
): number {
  if (canvasPreset === "wide_1200x628") {
    return 628;
  }
  if (canvasPreset === "square_1080") {
    return 1080;
  }
  if (canvasPreset === "story_1080x1920") {
    return 1920;
  }
  const matched = /^custom_(\d+)x(\d+)$/.exec(canvasPreset);
  return matched ? Number(matched[2]) : 628;
}
