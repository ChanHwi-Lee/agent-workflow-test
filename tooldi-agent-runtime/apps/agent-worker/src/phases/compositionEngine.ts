import { createRequestId } from "@tooldi/agent-domain";
import {
  normalizeTemplateAssetPolicy,
  templateAssetPolicyPrefersPhoto,
} from "@tooldi/agent-llm";

import type {
  CompositionBrief,
  CompositionRanking,
  CompositionVariant,
  CompositionVariantBadgeProminence,
  CompositionVariantCopyDensity,
  CompositionVariantCopyExpressionProfile,
  CompositionVariantCopyVisualRatio,
  CompositionVariantCtaWeight,
  CompositionVariantHeadlineEmphasis,
  CompositionVariantNegativeSpaceBias,
  CompositionVariantScore,
  CompositionVariantSet,
  GraphicCompositionEntry,
  GraphicCompositionSet,
  NormalizedIntent,
  RetrievalStageResult,
  SelectionDecision,
  TemplateCandidateBundle,
  TemplateSelectionPolicy,
} from "../types.js";

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

type CompositionCommonSelections = {
  background: BackgroundCandidate;
  orderedDecorations: DecorationCandidate[];
  topPhotoCandidate: PhotoCandidate | null;
  photoEligibility: PhotoEligibility;
  preferredGraphicLayoutModes: LayoutMode[];
  primaryGraphicLayout: LayoutCandidate;
};

type FamilyVariantSeed = {
  variantKey: string;
  spacingIntent: CompositionVariant["spacingIntent"];
  accentDensity: CompositionVariant["accentDensity"];
  ctaTreatment: CompositionVariant["ctaTreatment"];
  copyDensity: CompositionVariantCopyDensity;
  headlineEmphasis: CompositionVariantHeadlineEmphasis;
  ctaWeight: CompositionVariantCtaWeight;
  copyVisualRatio: CompositionVariantCopyVisualRatio;
  negativeSpaceBias: CompositionVariantNegativeSpaceBias;
  badgeProminence: CompositionVariantBadgeProminence;
  copyExpressionProfile: CompositionVariantCopyExpressionProfile;
  visualBalanceScore: number;
  copyRhythmFitBase: number;
  intraFamilyNoveltyBase: number;
};

type CompositionFamilyStrategy = {
  familyKey: LayoutMode;
  seeds: FamilyVariantSeed[];
  visualBalanceScore(seed: FamilyVariantSeed): number;
};

const FAMILY_STRATEGIES: CompositionFamilyStrategy[] = [
  {
    familyKey: "left_copy_right_graphic",
    seeds: [
      {
        variantKey: "headline_offer_push",
        spacingIntent: "balanced",
        accentDensity: "medium",
        ctaTreatment: "standard",
        copyDensity: "balanced",
        headlineEmphasis: "dominant",
        ctaWeight: "standard",
        copyVisualRatio: "copy_heavy",
        negativeSpaceBias: "balanced",
        badgeProminence: "supporting",
        copyExpressionProfile: "headline_first",
        visualBalanceScore: 0.97,
        copyRhythmFitBase: 0.9,
        intraFamilyNoveltyBase: 0.72,
      },
      {
        variantKey: "cta_accent_push",
        spacingIntent: "airy",
        accentDensity: "medium",
        ctaTreatment: "standard",
        copyDensity: "sparse",
        headlineEmphasis: "restrained",
        ctaWeight: "strong",
        copyVisualRatio: "visual_heavy",
        negativeSpaceBias: "airy",
        badgeProminence: "none",
        copyExpressionProfile: "cta_first",
        visualBalanceScore: 0.95,
        copyRhythmFitBase: 0.83,
        intraFamilyNoveltyBase: 0.9,
      },
    ],
    visualBalanceScore(seed) {
      return seed.visualBalanceScore;
    },
  },
  {
    familyKey: "copy_left_with_right_decoration",
    seeds: [
      {
        variantKey: "copy_safe",
        spacingIntent: "balanced",
        accentDensity: "minimal",
        ctaTreatment: "standard",
        copyDensity: "balanced",
        headlineEmphasis: "dominant",
        ctaWeight: "standard",
        copyVisualRatio: "copy_heavy",
        negativeSpaceBias: "balanced",
        badgeProminence: "none",
        copyExpressionProfile: "headline_first",
        visualBalanceScore: 0.9,
        copyRhythmFitBase: 0.88,
        intraFamilyNoveltyBase: 0.68,
      },
      {
        variantKey: "open_space_cta",
        spacingIntent: "airy",
        accentDensity: "minimal",
        ctaTreatment: "standard",
        copyDensity: "sparse",
        headlineEmphasis: "restrained",
        ctaWeight: "strong",
        copyVisualRatio: "balanced",
        negativeSpaceBias: "airy",
        badgeProminence: "none",
        copyExpressionProfile: "cta_first",
        visualBalanceScore: 0.89,
        copyRhythmFitBase: 0.81,
        intraFamilyNoveltyBase: 0.86,
      },
    ],
    visualBalanceScore(seed) {
      return seed.visualBalanceScore;
    },
  },
  {
    familyKey: "center_stack_promo",
    seeds: [
      {
        variantKey: "balanced_stack",
        spacingIntent: "airy",
        accentDensity: "medium",
        ctaTreatment: "standard",
        copyDensity: "balanced",
        headlineEmphasis: "dominant",
        ctaWeight: "standard",
        copyVisualRatio: "balanced",
        negativeSpaceBias: "airy",
        badgeProminence: "supporting",
        copyExpressionProfile: "headline_first",
        visualBalanceScore: 0.91,
        copyRhythmFitBase: 0.87,
        intraFamilyNoveltyBase: 0.74,
      },
      {
        variantKey: "offer_stack",
        spacingIntent: "balanced",
        accentDensity: "medium",
        ctaTreatment: "standard",
        copyDensity: "dense",
        headlineEmphasis: "restrained",
        ctaWeight: "strong",
        copyVisualRatio: "balanced",
        negativeSpaceBias: "tight",
        badgeProminence: "supporting",
        copyExpressionProfile: "offer_first",
        visualBalanceScore: 0.88,
        copyRhythmFitBase: 0.84,
        intraFamilyNoveltyBase: 0.88,
      },
    ],
    visualBalanceScore(seed) {
      return seed.visualBalanceScore;
    },
  },
  {
    familyKey: "badge_promo_stack",
    seeds: [
      {
        variantKey: "badge_offer",
        spacingIntent: "balanced",
        accentDensity: "medium",
        ctaTreatment: "badge_forward",
        copyDensity: "balanced",
        headlineEmphasis: "dominant",
        ctaWeight: "standard",
        copyVisualRatio: "balanced",
        negativeSpaceBias: "balanced",
        badgeProminence: "dominant",
        copyExpressionProfile: "offer_first",
        visualBalanceScore: 0.93,
        copyRhythmFitBase: 0.9,
        intraFamilyNoveltyBase: 0.78,
      },
      {
        variantKey: "coupon_cta",
        spacingIntent: "dense",
        accentDensity: "medium",
        ctaTreatment: "badge_forward",
        copyDensity: "dense",
        headlineEmphasis: "restrained",
        ctaWeight: "strong",
        copyVisualRatio: "balanced",
        negativeSpaceBias: "tight",
        badgeProminence: "dominant",
        copyExpressionProfile: "cta_first",
        visualBalanceScore: 0.9,
        copyRhythmFitBase: 0.86,
        intraFamilyNoveltyBase: 0.9,
      },
    ],
    visualBalanceScore(seed) {
      return seed.visualBalanceScore;
    },
  },
  {
    familyKey: "framed_promo",
    seeds: [
      {
        variantKey: "framed_balanced",
        spacingIntent: "balanced",
        accentDensity: "medium",
        ctaTreatment: "framed",
        copyDensity: "balanced",
        headlineEmphasis: "dominant",
        ctaWeight: "standard",
        copyVisualRatio: "balanced",
        negativeSpaceBias: "balanced",
        badgeProminence: "supporting",
        copyExpressionProfile: "headline_first",
        visualBalanceScore: 0.94,
        copyRhythmFitBase: 0.86,
        intraFamilyNoveltyBase: 0.71,
      },
      {
        variantKey: "framed_airy",
        spacingIntent: "airy",
        accentDensity: "minimal",
        ctaTreatment: "framed",
        copyDensity: "sparse",
        headlineEmphasis: "dominant",
        ctaWeight: "subtle",
        copyVisualRatio: "copy_heavy",
        negativeSpaceBias: "airy",
        badgeProminence: "none",
        copyExpressionProfile: "headline_first",
        visualBalanceScore: 0.92,
        copyRhythmFitBase: 0.8,
        intraFamilyNoveltyBase: 0.84,
      },
    ],
    visualBalanceScore(seed) {
      return seed.visualBalanceScore;
    },
  },
  {
    familyKey: "copy_left_with_right_photo",
    seeds: [
      {
        variantKey: "photo_balanced",
        spacingIntent: "balanced",
        accentDensity: "minimal",
        ctaTreatment: "photo_support",
        copyDensity: "balanced",
        headlineEmphasis: "dominant",
        ctaWeight: "standard",
        copyVisualRatio: "balanced",
        negativeSpaceBias: "balanced",
        badgeProminence: "none",
        copyExpressionProfile: "headline_first",
        visualBalanceScore: 0.96,
        copyRhythmFitBase: 0.88,
        intraFamilyNoveltyBase: 0.78,
      },
      {
        variantKey: "photo_cta_push",
        spacingIntent: "airy",
        accentDensity: "minimal",
        ctaTreatment: "photo_support",
        copyDensity: "sparse",
        headlineEmphasis: "restrained",
        ctaWeight: "strong",
        copyVisualRatio: "visual_heavy",
        negativeSpaceBias: "airy",
        badgeProminence: "none",
        copyExpressionProfile: "cta_first",
        visualBalanceScore: 0.94,
        copyRhythmFitBase: 0.82,
        intraFamilyNoveltyBase: 0.9,
      },
    ],
    visualBalanceScore(seed) {
      return seed.visualBalanceScore;
    },
  },
];

export async function buildCompositionSelection(
  intent: NormalizedIntent,
  candidates: TemplateCandidateBundle,
  dependencies: {
    retrievalStage: RetrievalStageResult;
    selectionPolicy: TemplateSelectionPolicy;
  },
): Promise<CompositionSelectionResult> {
  const commonSelections = resolveCommonSelections(
    intent,
    candidates,
    dependencies.retrievalStage,
    dependencies.selectionPolicy,
  );
  const compositionBrief = buildCompositionBrief(intent, commonSelections);
  const candidateVariants = generateVariantCandidates(
    compositionBrief,
    candidates,
    commonSelections,
  );
  const scoredCandidates = candidateVariants.map((variant) =>
    scoreVariant(compositionBrief, variant, commonSelections.photoEligibility),
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
    ),
  };
}

function resolveCommonSelections(
  intent: NormalizedIntent,
  candidates: TemplateCandidateBundle,
  retrievalStage: RetrievalStageResult,
  selectionPolicy: TemplateSelectionPolicy,
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
  const preferredGraphicLayoutModes = resolvePreferredLayoutModes(intent).filter(
    (layoutMode) => layoutMode !== "copy_left_with_right_photo",
  );
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

function selectDiverseTopVariants(
  candidateVariants: CompositionVariant[],
  scoredCandidates: CompositionVariantScore[],
  requestedVariantCount: number,
): CompositionVariant[] {
  const scoreByVariantId = new Map(
    scoredCandidates.map((score) => [score.variantId, score] as const),
  );
  const orderedCandidates = [...candidateVariants].sort((left, right) => {
    const leftScore = scoreByVariantId.get(left.variantId)?.totalScore ?? 0;
    const rightScore = scoreByVariantId.get(right.variantId)?.totalScore ?? 0;
    return rightScore - leftScore;
  });

  const selected: CompositionVariant[] = [];
  for (const candidate of orderedCandidates) {
    if (selected.some((variant) => variant.variantSignature === candidate.variantSignature)) {
      continue;
    }
    const familyCount = selected.filter(
      (variant) => variant.familyKey === candidate.familyKey,
    ).length;
    if (familyCount >= 2) {
      continue;
    }
    selected.push(candidate);
    if (selected.length === requestedVariantCount) {
      break;
    }
  }

  if (selected.length < requestedVariantCount) {
    for (const candidate of orderedCandidates) {
      if (selected.some((variant) => variant.variantId === candidate.variantId)) {
        continue;
      }
      if (selected.some((variant) => variant.variantSignature === candidate.variantSignature)) {
        continue;
      }
      selected.push(candidate);
      if (selected.length === requestedVariantCount) {
        break;
      }
    }
  }

  enforceFamilyDiversity(selected, orderedCandidates);

  return selected.slice(0, requestedVariantCount);
}

function enforceFamilyDiversity(
  selected: CompositionVariant[],
  orderedCandidates: CompositionVariant[],
): void {
  const uniqueFamilies = new Set(selected.map((variant) => variant.familyKey));
  if (uniqueFamilies.size >= 2) {
    return;
  }

  const differentFamilyCandidate = orderedCandidates.find(
    (candidate) =>
      !selected.some((variant) => variant.variantId === candidate.variantId) &&
      !selected.some((variant) => variant.variantSignature === candidate.variantSignature) &&
      !uniqueFamilies.has(candidate.familyKey),
  );
  if (!differentFamilyCandidate || selected.length === 0) {
    return;
  }

  selected[selected.length - 1] = differentFamilyCandidate;
}

function rankDecorationCandidates(
  candidates: DecorationCandidate[],
): DecorationCandidate[] {
  return [...candidates]
    .sort((left, right) => right.fitScore - left.fitScore)
    .filter(
      (candidate, index, ordered) =>
        ordered.findIndex((entry) => entry.candidateId === candidate.candidateId) ===
        index,
    );
}

function pickDecorationForVariant(
  orderedDecorations: DecorationCandidate[],
  familyRank: number,
  familyVariantRank: number,
): DecorationCandidate | null {
  if (orderedDecorations.length === 0) {
    return null;
  }

  const preferredIndex = Math.min(
    orderedDecorations.length - 1,
    familyRank + familyVariantRank,
  );
  return orderedDecorations[preferredIndex] ?? orderedDecorations[0] ?? null;
}

function rankVariants(
  compositionBrief: CompositionBrief,
  variants: CompositionVariant[],
  photoEligibility: PhotoEligibility,
): CompositionVariantScore[] {
  return variants.map((variant) =>
    scoreVariant(compositionBrief, variant, photoEligibility),
  );
}

function scoreVariant(
  compositionBrief: CompositionBrief,
  variant: CompositionVariant,
  photoEligibility: PhotoEligibility,
): CompositionVariantScore {
  const familyStrategy = FAMILY_STRATEGIES.find(
    (candidate) => candidate.familyKey === variant.familyKey,
  );
  const seed = familyStrategy?.seeds[variant.familyVariantRank];
  const briefAlignmentScore =
    Math.max(0.55, 1 - variant.familyRank * 0.15) +
    (compositionBrief.preferredLayoutModes.includes(variant.familyKey) ? 0.05 : 0);
  const canvasFitScore = variant.layoutFitScore;
  const executionSafetyScore = variant.validation.status === "valid" ? 1 : 0.2;
  const visualBalanceScore =
    variant.familyKey === "copy_left_with_right_photo" &&
    photoEligibility.mode !== "photo_selected"
      ? 0.4
      : familyStrategy?.visualBalanceScore(seed ?? familyStrategy.seeds[0]!) ?? 0.8;
  const copyRhythmFitScore = scoreCopyRhythmFit(
    compositionBrief,
    variant,
    seed ?? null,
  );
  const intraFamilyNoveltyScore = seed?.intraFamilyNoveltyBase ?? 0.7;

  let totalScore =
    briefAlignmentScore * 0.26 +
    canvasFitScore * 0.24 +
    executionSafetyScore * 0.2 +
    visualBalanceScore * 0.14 +
    copyRhythmFitScore * 0.1 +
    intraFamilyNoveltyScore * 0.06;

  if (
    variant.familyKey === "copy_left_with_right_photo" &&
    photoEligibility.mode === "photo_selected"
  ) {
    totalScore += 0.12;
  }

  if (
    compositionBrief.primaryVisualPolicy === "graphic_preferred" &&
    variant.familyKey === "copy_left_with_right_photo"
  ) {
    totalScore -= 0.08;
  }

  if (
    compositionBrief.layoutIntent === "badge_led" &&
    (variant.familyKey === "badge_led" ||
      variant.familyKey === "badge_promo_stack")
  ) {
    totalScore += 0.08;
  }

  return {
    variantId: variant.variantId,
    familyKey: variant.familyKey,
    variantSignature: variant.variantSignature,
    totalScore,
    briefAlignmentScore,
    canvasFitScore,
    executionSafetyScore,
    visualBalanceScore,
    copyRhythmFitScore,
    intraFamilyNoveltyScore,
    summary:
      `${variant.variantSignature} scored ${totalScore.toFixed(3)} ` +
      `(brief=${briefAlignmentScore.toFixed(2)} fit=${canvasFitScore.toFixed(2)} ` +
      `safety=${executionSafetyScore.toFixed(2)} balance=${visualBalanceScore.toFixed(2)} ` +
      `copy=${copyRhythmFitScore.toFixed(2)} novelty=${intraFamilyNoveltyScore.toFixed(2)})`,
  };
}

function scoreCopyRhythmFit(
  compositionBrief: CompositionBrief,
  variant: CompositionVariant,
  seed: FamilyVariantSeed | null,
): number {
  let score = seed?.copyRhythmFitBase ?? 0.8;

  if (
    compositionBrief.offerIntent === "sale" &&
    (variant.copyExpressionProfile === "offer_first" ||
      variant.ctaWeight === "strong")
  ) {
    score += 0.05;
  }

  if (
    compositionBrief.subjectBinding === "subjectless" &&
    variant.copyDensity !== "dense"
  ) {
    score += 0.03;
  }

  if (
    compositionBrief.layoutIntent === "badge_led" &&
    variant.badgeProminence === "dominant"
  ) {
    score += 0.06;
  }

  if (
    compositionBrief.layoutIntent === "hero_focused" &&
    variant.copyVisualRatio === "visual_heavy"
  ) {
    score += 0.04;
  }

  return Math.min(score, 1);
}

function projectWinningVariant(
  intent: NormalizedIntent,
  commonSelections: CompositionCommonSelections,
  winner: CompositionVariant,
  compositionVariantSet: CompositionVariantSet,
): SelectionDecision {
  const selectedDecoration =
    commonSelections.orderedDecorations.find(
      (candidate) => candidate.candidateId === winner.decorationCandidateId,
    ) ?? commonSelections.orderedDecorations[0] ?? null;
  const graphicCompositionSet =
    winner.familyKey === "copy_left_with_right_photo" &&
    winner.photoMode === "photo_selected"
      ? buildPhotoSupportGraphicCompositionSet(selectedDecoration)
      : buildGraphicCompositionSet(selectedDecoration, winner);
  const decorationMode =
    winner.familyKey === "copy_left_with_right_photo" &&
    winner.photoMode === "photo_selected"
      ? "photo_support"
      : graphicCompositionSet.roles.length >= 3
        ? "promo_multi_graphic"
        : selectedDecoration?.payload.decorationMode ?? "graphic_cluster";

  return {
    decisionId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    retrievalMode: "none",
    compareCriteria: [
      "seasonalFit",
      "readabilitySupport",
      "ctaVisibilitySupport",
      "layoutCompatibility",
      "executionSimplicity",
      "fallbackSafety",
      "focalSafety",
      "cropSafety",
      "copySeparationSupport",
    ],
    selectedBackgroundCandidateId: commonSelections.background.candidateId,
    selectedLayoutCandidateId: winner.layoutCandidateId,
    selectedDecorationCandidateId: selectedDecoration?.candidateId ?? "",
    topPhotoCandidateId: commonSelections.topPhotoCandidate?.candidateId ?? null,
    selectedBackgroundAssetId: commonSelections.background.sourceAssetId ?? null,
    selectedBackgroundSerial: commonSelections.background.sourceSerial ?? null,
    selectedBackgroundCategory: commonSelections.background.sourceCategory ?? null,
    selectedBackgroundColorHex:
      typeof commonSelections.background.payload.backgroundColorHex === "string" &&
      commonSelections.background.payload.backgroundColorHex.length > 0
        ? commonSelections.background.payload.backgroundColorHex
        : "#ffffff",
    selectedDecorationAssetId: selectedDecoration?.sourceAssetId ?? null,
    selectedDecorationSerial: selectedDecoration?.sourceSerial ?? null,
    selectedDecorationCategory: selectedDecoration?.sourceCategory ?? null,
    topPhotoAssetId: commonSelections.topPhotoCandidate?.sourceAssetId ?? null,
    topPhotoSerial: commonSelections.topPhotoCandidate?.sourceSerial ?? null,
    topPhotoCategory: commonSelections.topPhotoCandidate?.sourceCategory ?? null,
    topPhotoUid: commonSelections.topPhotoCandidate?.sourceUid ?? null,
    topPhotoUrl: commonSelections.topPhotoCandidate?.sourceOriginUrl ?? null,
    topPhotoWidth: commonSelections.topPhotoCandidate?.sourceWidth ?? null,
    topPhotoHeight: commonSelections.topPhotoCandidate?.sourceHeight ?? null,
    topPhotoOrientation:
      commonSelections.topPhotoCandidate?.payload.photoOrientation ?? null,
    backgroundMode:
      commonSelections.background.payload.backgroundMode ?? "generated_solid",
    layoutMode: winner.layoutMode,
    decorationMode,
    photoBranchMode: winner.photoMode,
    photoBranchReason:
      winner.familyKey === "copy_left_with_right_photo"
        ? commonSelections.photoEligibility.reason
        : commonSelections.photoEligibility.mode === "photo_selected"
          ? "graphic-first composition remained the stronger winner after internal variant ranking"
          : commonSelections.photoEligibility.reason,
    executionStrategy: winner.executionStrategy,
    graphicCompositionSet,
    summary:
      `Selected ${winner.variantSignature} from ${compositionVariantSet.variants.length} ` +
      `diverse composition variants for ${intent.domain} ${intent.campaignGoal}.`,
    fallbackSummary:
      winner.familyKey === "copy_left_with_right_photo" &&
      winner.photoMode === "photo_selected"
        ? "Photo-support composition won the internal variant ranking and will execute through the photo hero path."
        : "Graphic-first composition won the internal variant ranking and remains the editable-safe fallback.",
  };
}

function buildFamilyOrder(
  compositionBrief: CompositionBrief,
  layoutCandidates: TemplateCandidateBundle["layout"]["candidates"],
  photoEligibility: PhotoEligibility,
): LayoutMode[] {
  const availableModes = layoutCandidates
    .map((candidate) => candidate.payload.layoutMode)
    .filter((layoutMode): layoutMode is LayoutMode => layoutMode !== undefined);
  const orderedModes = dedupeLayoutModes([
    ...compositionBrief.preferredLayoutModes,
    ...availableModes.sort((left, right) => {
      const leftFit =
        layoutCandidates.find((candidate) => candidate.payload.layoutMode === left)
          ?.fitScore ?? 0;
      const rightFit =
        layoutCandidates.find((candidate) => candidate.payload.layoutMode === right)
          ?.fitScore ?? 0;
      return rightFit - leftFit;
    }),
  ]);

  if (photoEligibility.mode === "photo_selected") {
    const existingPhotoIndex = orderedModes.indexOf("copy_left_with_right_photo");
    if (existingPhotoIndex >= 0) {
      orderedModes.splice(existingPhotoIndex, 1);
    }
    orderedModes.splice(1, 0, "copy_left_with_right_photo");
  }

  return orderedModes.slice(0, 4);
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

function resolvePreferredLayoutModes(
  intent: NormalizedIntent,
): LayoutMode[] {
  const assetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  const wideCanvas =
    intent.canvasPreset === "wide_1200x628" ||
    intent.canvasPreset.startsWith("custom_");
  const graphicPreferred = assetPolicy.primaryVisualPolicy === "graphic_preferred";

  if (intent.layoutIntent === "badge_led") {
    return ["badge_promo_stack", "badge_led", "center_stack_promo", "center_stack"];
  }

  if (graphicPreferred && wideCanvas) {
    return [
      "left_copy_right_graphic",
      "copy_left_with_right_decoration",
      "framed_promo",
      "center_stack_promo",
      "center_stack",
    ];
  }

  if (graphicPreferred) {
    return ["center_stack_promo", "framed_promo", "center_stack", "badge_promo_stack"];
  }

  return wideCanvas
    ? ["copy_left_with_right_decoration", "copy_left_with_right_photo", "left_copy_right_graphic", "center_stack_promo", "center_stack"]
    : ["center_stack_promo", "center_stack", "badge_promo_stack"];
}

function buildGraphicCompositionSet(
  selectedDecoration: DecorationCandidate | null,
  variant: CompositionVariant,
): GraphicCompositionSet {
  if (!selectedDecoration) {
    return {
      density: "minimal",
      roles: [],
      summary: "Graphic composition is empty because no decoration candidate is available.",
    };
  }

  const roles: GraphicCompositionEntry[] = [
    buildGraphicRoleEntry("primary_accent", selectedDecoration),
    buildGraphicRoleEntry("cta_container", selectedDecoration),
  ];

  if (variant.accentDensity === "medium") {
    roles.push(buildGraphicRoleEntry("secondary_accent", selectedDecoration));
  }

  if (variant.accentDensity === "medium" || variant.negativeSpaceBias !== "tight") {
    roles.push(buildGraphicRoleEntry("corner_accent", selectedDecoration));
  }

  if (variant.badgeProminence !== "none") {
    roles.push(buildGraphicRoleEntry("badge_or_ribbon", selectedDecoration));
  }

  if (variant.ctaTreatment === "framed") {
    roles.push(buildGraphicRoleEntry("frame", selectedDecoration));
  }

  return {
    density: roles.length >= 3 ? "medium" : "minimal",
    roles,
    summary:
      roles.length >= 3
        ? `Graphic composition uses ${roles.length} roles for ${variant.variantSignature}.`
        : `Graphic composition keeps a compact accent set for ${variant.variantSignature}.`,
  };
}

function buildPhotoSupportGraphicCompositionSet(
  selectedDecoration: DecorationCandidate | null,
): GraphicCompositionSet {
  if (!selectedDecoration) {
    return {
      density: "minimal",
      roles: [],
      summary: "Photo-support composition has no decoration candidate to frame the CTA.",
    };
  }

  return {
    density: "minimal",
    roles: [
      buildGraphicRoleEntry("cta_container", selectedDecoration),
      buildGraphicRoleEntry("corner_accent", selectedDecoration),
    ],
    summary:
      "Photo-support composition keeps a compact CTA container and corner accent set.",
  };
}

function buildGraphicRoleEntry(
  role: GraphicCompositionEntry["role"],
  decoration: DecorationCandidate,
): GraphicCompositionEntry {
  return {
    role,
    candidateId: decoration.candidateId,
    sourceAssetId: decoration.sourceAssetId ?? null,
    sourceSerial: decoration.sourceSerial ?? null,
    sourceCategory: decoration.sourceCategory ?? null,
    variantKey: decoration.payload.variantKey,
    decorationMode: decoration.payload.decorationMode ?? "graphic_cluster",
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
