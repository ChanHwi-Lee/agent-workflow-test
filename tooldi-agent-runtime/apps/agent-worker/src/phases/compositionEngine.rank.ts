import type {
  CompositionBrief,
  CompositionVariant,
  CompositionVariantScore,
  SelectionDecision,
} from "../types.js";
import {
  FAMILY_STRATEGIES,
  type FamilyVariantSeed,
} from "./compositionEngine.familyCatalog.js";

type PhotoEligibility = {
  mode: SelectionDecision["photoBranchMode"];
};

export function rankVariants(
  compositionBrief: CompositionBrief,
  variants: CompositionVariant[],
  photoEligibility: PhotoEligibility,
): CompositionVariantScore[] {
  return variants.map((variant) =>
    scoreVariant(compositionBrief, variant, photoEligibility),
  );
}

export function selectDiverseTopVariants(
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
