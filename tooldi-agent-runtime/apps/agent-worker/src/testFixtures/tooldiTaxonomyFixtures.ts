import type {
  TemplateAssetPolicy,
  TemplateIntentDraft,
} from "@tooldi/agent-llm";
import { normalizeTemplateAssetPolicy } from "@tooldi/agent-llm";

import type { NormalizedIntent } from "../types.js";

export const tooldiCreateTemplateTaxonomyFixture = {
  prompt: "패션 리테일 봄 세일 웹배너 만들어줘",
  templateCategory: "웹배너",
  backgroundPrimaryType: "pattern" as const,
  backgroundSecondaryType: "image" as const,
  graphicType: "vector" as const,
  graphicTheme: null,
  graphicMethod: null,
  optionalPhotoKeyword: "세일",
  optionalPhotoTheme: null,
  optionalPhotoType: "pic" as const,
  optionalPhotoFormat: "horizontal" as const,
};

export const fashionRetailGraphicFirstAssetPolicy: TemplateAssetPolicy = {
  allowedFamilies: ["background", "graphic", "photo"],
  preferredFamilies: ["graphic"],
  primaryVisualPolicy: "graphic_preferred",
  avoidFamilies: [],
};

export const legacyGraphicOptionalAssetPolicy =
  "graphic_allowed_photo_optional" as const;

const baseSearchKeywords = ["봄", "세일", "패션", "웹배너"];
const baseFacets: TemplateIntentDraft["facets"] = {
  seasonality: "spring",
  menuType: null,
  promotionStyle: "sale_campaign",
  offerSpecificity: "broad_offer",
};

function cloneStructuredAssetPolicy(
  assetPolicy: TemplateAssetPolicy,
): TemplateAssetPolicy {
  return {
    allowedFamilies: [...assetPolicy.allowedFamilies],
    preferredFamilies: [...assetPolicy.preferredFamilies],
    primaryVisualPolicy: assetPolicy.primaryVisualPolicy,
    avoidFamilies: [...assetPolicy.avoidFamilies],
  };
}

export function createFashionRetailPlannerDraft(
  overrides: Partial<TemplateIntentDraft> = {},
): TemplateIntentDraft {
  const {
    assetPolicy: _assetPolicy,
    searchKeywords: _searchKeywords,
    facets: _facets,
    ...restOverrides
  } = overrides;
  const assetPolicy =
    overrides.assetPolicy ??
    cloneStructuredAssetPolicy(fashionRetailGraphicFirstAssetPolicy);
  const searchKeywords = overrides.searchKeywords ?? [...baseSearchKeywords];
  const facets = {
    ...baseFacets,
    ...(overrides.facets ?? {}),
  };

  return {
    goalSummary: "패션 리테일 봄 세일 웹배너",
    templateKind: "seasonal_sale_banner",
    domain: "fashion_retail",
    audience: "sale_shoppers",
    campaignGoal: "sale_conversion",
    layoutIntent: "badge_led",
    tone: "bright_playful",
    assetPolicy,
    searchKeywords,
    typographyHint: "세련된 고딕 계열로 명확한 가격/혜택 강조",
    facets,
    ...restOverrides,
  };
}

export function createFashionRetailNormalizedIntent(
  overrides: Partial<NormalizedIntent> = {},
): NormalizedIntent {
  const {
    assetPolicy: _assetPolicy,
    searchKeywords: _searchKeywords,
    facets: _facets,
    brandConstraints: _brandConstraints,
    consistencyFlags: _consistencyFlags,
    normalizationNotes: _normalizationNotes,
    supportedInV1: _supportedInV1,
    futureCapableOperations: _futureCapableOperations,
    ...restOverrides
  } = overrides;
  const searchKeywords = overrides.searchKeywords ?? [...baseSearchKeywords];
  const facets = {
    seasonality: "spring" as const,
    menuType: null,
    promotionStyle: "sale_campaign" as const,
    offerSpecificity: "broad_offer" as const,
    ...(overrides.facets ?? {}),
  };
  const brandConstraints = {
    palette: ["#ffe4e8"],
    typographyHint: "세련된 고딕 계열로 명확한 가격/혜택 강조",
    forbiddenStyles: [],
    ...(overrides.brandConstraints ?? {}),
  };
  const assetPolicy = normalizeTemplateAssetPolicy(
    overrides.assetPolicy ??
      cloneStructuredAssetPolicy(fashionRetailGraphicFirstAssetPolicy),
  );

  return {
    intentId: "intent-fashion-1",
    runId: "run-fashion-1",
    traceId: "trace-fashion-1",
    plannerMode: "langchain",
    operationFamily: "create_template",
    artifactType: "LiveDraftArtifactBundle",
    goalSummary: "패션 리테일 봄 세일 웹배너",
    requestedOutputCount: 1,
    templateKind: "seasonal_sale_banner",
    domain: "fashion_retail",
    audience: "sale_shoppers",
    campaignGoal: "sale_conversion",
    canvasPreset: "wide_1200x628",
    layoutIntent: "badge_led",
    tone: "bright_playful",
    requiredSlots: [
      "background",
      "headline",
      "supporting_copy",
      "cta",
      "decoration",
    ],
    assetPolicy,
    searchKeywords,
    facets,
    brandConstraints,
    consistencyFlags: overrides.consistencyFlags ?? [],
    normalizationNotes: overrides.normalizationNotes ?? [],
    supportedInV1: overrides.supportedInV1 ?? true,
    futureCapableOperations: overrides.futureCapableOperations ?? [
      "create_template",
      "update_layer",
      "delete_layer",
    ],
    ...restOverrides,
  };
}
