import { normalizeTemplateAssetPolicy } from "@tooldi/agent-llm";

import type {
  CompositionVariant,
  CompositionVariantBadgeProminence,
  CompositionVariantCopyDensity,
  CompositionVariantCopyExpressionProfile,
  CompositionVariantCopyVisualRatio,
  CompositionVariantCtaWeight,
  CompositionVariantHeadlineEmphasis,
  CompositionVariantNegativeSpaceBias,
  NormalizedIntent,
  SelectionDecision,
  TemplateCandidateBundle,
} from "../types.js";

type DecorationCandidate =
  TemplateCandidateBundle["decoration"]["candidates"][number];
type LayoutMode = SelectionDecision["layoutMode"];
type PhotoEligibility = {
  mode: SelectionDecision["photoBranchMode"];
};

export type FamilyVariantSeed = {
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

export type CompositionFamilyStrategy = {
  familyKey: LayoutMode;
  seeds: FamilyVariantSeed[];
  visualBalanceScore(seed: FamilyVariantSeed): number;
};

export const FAMILY_STRATEGIES: CompositionFamilyStrategy[] = [
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

export function rankDecorationCandidates(
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

export function pickDecorationForVariant(
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

export function buildFamilyOrder(
  compositionBrief: {
    preferredLayoutModes: LayoutMode[];
  },
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

export function resolvePreferredLayoutModes(
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

function dedupeLayoutModes(layoutModes: LayoutMode[]): LayoutMode[] {
  return [...new Set(layoutModes)];
}
