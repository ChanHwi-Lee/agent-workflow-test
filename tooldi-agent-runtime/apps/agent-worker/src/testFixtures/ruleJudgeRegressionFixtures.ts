import type { TemplateAssetPolicy } from "@tooldi/agent-llm";

export const ruleJudgeHardeningMismatchCodes = [
  "domain_subject_mismatch",
  "theme_domain_mismatch",
  "search_profile_intent_mismatch",
  "asset_policy_conflict",
  "template_prior_conflict",
  "primary_visual_drift",
] as const;

export const coherentFashionRetailPictureFixture = {
  querySurface: {
    keyword: "세일",
    theme: null,
    type: "pic" as const,
    format: "horizontal" as const,
  },
  selectedCategory: "fashion",
  selectionSummary: "패션 세일 photo hero selected",
  photoBranchReason: "fashion retail sale hero won on crop-safe emphasis",
  fallbackSummary: "fashion retail sale lane retained",
};

export const restaurantMenuPictureDriftFixture = {
  querySurface: {
    keyword: "브런치 메뉴",
    theme: null,
    type: "pic" as const,
    format: "horizontal" as const,
  },
  selectedCategory: "food",
  selectionSummary: "브런치 메뉴 photo hero selected",
  photoBranchReason: "restaurant menu photo hero won on crop-safe emphasis",
  fallbackSummary: "restaurant menu fallback",
};

export const cafeCoffeeThemeDriftFixture = {
  querySurface: {
    keyword: "세일",
    theme: "cafe_coffee_theme",
    type: "pic" as const,
    format: "horizontal" as const,
  },
  selectedCategory: "hero",
  selectionSummary: "theme-biased photo hero selected",
  photoBranchReason: "cafe coffee theme won on picture theme prior",
  fallbackSummary: "cafe coffee theme fallback",
  templatePrior: {
    serial: "picture_theme_cafe",
    summary: "카페 커피 테마 prior",
    signal: "cafe coffee theme",
    bias: "cafe_coffee_theme",
    rationale: "promote cafe coffee hero on picture family",
  },
};

export const graphicOnlyRuleJudgeAssetPolicy: TemplateAssetPolicy = {
  allowedFamilies: ["background", "graphic"],
  preferredFamilies: ["graphic"],
  primaryVisualPolicy: "graphic_preferred",
  avoidFamilies: ["photo"],
};

export const graphicOnlyPicturePolicyConflictFixture = {
  querySurface: {
    keyword: "세일",
    theme: null,
    type: "pic" as const,
    format: "horizontal" as const,
  },
  selectedCategory: "hero",
  selectionSummary: "picture hero selected against graphic-only repair",
  photoBranchReason: "stale picture branch still won selection",
  fallbackSummary: "stale picture lane survived policy repair",
};

export const restaurantMenuTemplatePriorFixture = {
  selectedTemplatePrior: {
    summary: "브런치 메뉴 템플릿 prior",
    keyword: "브런치 메뉴",
    categorySerial: "0006",
    querySurface:
      "POST /editor/get_templates (keyword, canvas, categorySerial, price, follow, page)",
  },
  keywordThemeMatch: {
    family: "template" as const,
    signal: "브런치 메뉴",
    strength: "primary" as const,
    summary: "브런치 메뉴 keyword/theme match on template surface",
  },
  rankingBias: {
    bias: "template_query_surface_alignment",
    effect: "promote" as const,
    rationale:
      "promote brunch menu template prior through the real template query surface",
  },
};
