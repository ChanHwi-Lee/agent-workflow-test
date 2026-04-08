import { createRequestId } from "@tooldi/agent-domain";

import type { NormalizedIntent, SearchProfileArtifact } from "../types.js";

export async function buildSearchProfile(
  intent: NormalizedIntent,
): Promise<SearchProfileArtifact> {
  const seasonKeyword = intent.facets.seasonality === "spring" ? "봄" : null;
  const subjectKeyword = deriveSubjectKeyword(intent);
  const promotionKeyword = derivePromotionKeyword(intent);
  const orientationHint = deriveOrientationHint(intent.canvasPreset);
  const backgroundKeyword = seasonKeyword ?? subjectKeyword ?? firstKeyword(intent);
  const graphicKeyword = promotionKeyword ?? subjectKeyword ?? backgroundKeyword;
  const photoKeyword =
    intent.assetPolicy === "photo_preferred_graphic_allowed"
      ? subjectKeyword ?? promotionKeyword ?? backgroundKeyword
      : promotionKeyword ?? subjectKeyword ?? backgroundKeyword;

  return {
    profileId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    plannerMode: intent.plannerMode,
    templateKind: intent.templateKind,
    domain: intent.domain,
    audience: intent.audience,
    campaignGoal: intent.campaignGoal,
    canvasPreset: intent.canvasPreset,
    layoutIntent: intent.layoutIntent,
    tone: intent.tone,
    assetPolicy: intent.assetPolicy,
    searchKeywords: [...intent.searchKeywords],
    facets: intent.facets,
    summary:
      `${intent.domain} create-template search profile for ${intent.campaignGoal} ` +
      `using ${intent.searchKeywords.join(", ")}`,
    background: {
      objective: "seasonal_backdrop",
      rationale:
        backgroundKeyword === "봄"
          ? "Seasonality drives the backdrop search first"
          : "Fallback backdrop search uses the strongest available subject keyword",
      queries: [
        {
          label: "background_pattern_primary",
          type: "pattern",
          keyword: backgroundKeyword,
          source: "search",
        },
        {
          label: "background_image_secondary",
          type: "image",
          keyword: backgroundKeyword,
          source: "search",
        },
        {
          label: "background_pattern_fallback",
          type: "pattern",
          keyword: null,
          source: "initial_load",
        },
      ],
    },
    graphic: {
      objective: "supporting_promotional_graphics",
      rationale:
        promotionKeyword !== null
          ? "Promotional keyword leads graphic search before broader seasonal fallback"
          : "Graphic search falls back to the subject keyword because no explicit offer keyword exists",
      queries: [
        {
          label: "graphic_primary_keyword",
          keyword: graphicKeyword,
          categoryName: null,
          shapeType: "graphics",
          price: "free",
          format: null,
        },
        {
          label: "graphic_subject_fallback",
          keyword: subjectKeyword,
          categoryName: null,
          shapeType: "graphics",
          price: "free",
          format: null,
        },
        {
          label: "graphic_seasonal_fallback",
          keyword: seasonKeyword ?? firstKeyword(intent),
          categoryName: null,
          shapeType: "graphics",
          price: "free",
          format: null,
        },
      ],
    },
    photo: {
      enabled: true,
      objective: "hero_visual_candidate",
      rationale:
        intent.assetPolicy === "photo_preferred_graphic_allowed"
          ? "Photo is preferred for this intent when a safe hero candidate exists"
          : "Photo remains optional and should only win when it fits the composition safely",
      orientationHint,
      queries: [
        {
          label: "photo_primary_keyword",
          keyword: photoKeyword,
          orientation: orientationHint,
          backgroundRemoval: false,
          source: "search",
        },
        {
          label: "photo_seasonal_fallback",
          keyword: seasonKeyword ?? backgroundKeyword,
          orientation: orientationHint,
          backgroundRemoval: false,
          source: "search",
        },
        {
          label: "photo_orientation_fallback",
          keyword: null,
          orientation: orientationHint,
          backgroundRemoval: false,
          source: "initial_load",
        },
      ],
    },
    font: {
      objective: "readable_korean_promotional_typography",
      rationale:
        intent.brandConstraints.typographyHint ?? "Prefer readable Korean sans-serif display/body pairing",
      supportedLanguage: "KOR",
      preferredCategories:
        intent.brandConstraints.typographyHint?.includes("명조") === true
          ? ["명조", "고딕"]
          : ["고딕"],
      typographyHint: intent.brandConstraints.typographyHint,
    },
  };
}

function deriveSubjectKeyword(intent: NormalizedIntent): string | null {
  if (intent.facets.menuType === "food_menu") {
    return "메뉴";
  }
  if (intent.facets.menuType === "drink_menu") {
    return "음료";
  }
  if (intent.domain === "fashion_retail") {
    return "패션";
  }

  return (
    intent.searchKeywords.find((keyword) => keyword !== "봄" && keyword !== "프로모션") ??
    null
  );
}

function derivePromotionKeyword(intent: NormalizedIntent): string | null {
  switch (intent.facets.promotionStyle) {
    case "seasonal_menu_launch":
      return "신메뉴";
    case "new_product_promo":
      return "프로모션";
    case "sale_campaign":
      return "세일";
    case "general_campaign":
      return null;
  }
}

function deriveOrientationHint(
  canvasPreset: NormalizedIntent["canvasPreset"],
): SearchProfileArtifact["photo"]["orientationHint"] {
  if (canvasPreset === "wide_1200x628") {
    return "landscape";
  }
  if (canvasPreset === "story_1080x1920") {
    return "portrait";
  }
  if (canvasPreset === "square_1080") {
    return "square";
  }
  return null;
}

function firstKeyword(intent: NormalizedIntent): string | null {
  return intent.searchKeywords[0] ?? null;
}
