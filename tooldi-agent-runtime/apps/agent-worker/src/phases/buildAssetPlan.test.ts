import assert from "node:assert/strict";
import test from "node:test";

import type { TemplatePriorSummary } from "@tooldi/agent-contracts";
import { normalizeTemplateAssetPolicy } from "@tooldi/agent-llm";

import type {
  NormalizedIntent,
  SearchProfileArtifact,
  SelectionDecision,
} from "../types.js";
import { buildAssetPlan } from "./buildAssetPlan.js";

function createIntent(
  overrides: Partial<NormalizedIntent> = {},
): NormalizedIntent {
  return {
    intentId: "intent-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    operationFamily: "create_template",
    artifactType: "LiveDraftArtifactBundle",
    goalSummary: "봄 세일 배너를 만들어줘",
    requestedOutputCount: 1,
    templateKind: "promo_banner",
    domain: "general_marketing",
    audience: "general_consumers",
    campaignGoal: "sale_conversion",
    canvasPreset: "wide_1200x628",
    layoutIntent: "copy_focused",
    tone: "bright_playful",
    requiredSlots: ["background", "headline", "supporting_copy", "cta", "decoration"],
    assetPolicy: normalizeTemplateAssetPolicy({
      allowedFamilies: ["background", "graphic", "photo"],
      preferredFamilies: ["graphic"],
      primaryVisualPolicy: "graphic_preferred",
      avoidFamilies: [],
    }),
    searchKeywords: ["봄", "세일"],
    facets: {
      seasonality: "spring",
      menuType: null,
      promotionStyle: "sale_campaign",
      offerSpecificity: "broad_offer",
    },
    brandConstraints: {
      palette: [],
      typographyHint: null,
      forbiddenStyles: [],
    },
    consistencyFlags: [],
    normalizationNotes: [],
    supportedInV1: true,
    futureCapableOperations: ["create_template"],
    ...overrides,
  };
}

function createTemplatePriorSummary(): TemplatePriorSummary {
  return {
    summaryId: "prior-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    templatePriorCandidates: [
      {
        rank: 1,
        sourceSignal: "seasonality:spring",
        keyword: "봄",
        categorySerial: null,
        status: "competitive_only",
        competitiveness: "competitive_only",
        selected: true,
        rationale: "seasonal fit",
        evidenceRefs: ["E1"],
        contextRefs: ["C1"],
      },
    ],
    selectedTemplatePrior: {
      status: "competitive_only",
      competitiveness: "competitive_only",
      summary: "selected prior",
      keyword: "봄",
      categorySerial: null,
      querySurface: "template_prior",
      evidenceRefs: ["E1"],
      contextRefs: ["C1"],
    },
    dominantThemePrior: "template_prior",
    selectedContentsThemePrior: {
      template: {
        family: "template",
        status: "unavailable",
        serial: null,
        summary: "no template theme",
        evidenceRefs: ["E1"],
        contextRefs: ["C1"],
      },
      shape: {
        family: "shape",
        status: "unavailable",
        serial: null,
        summary: "no shape theme",
        evidenceRefs: ["E1"],
        contextRefs: ["C1"],
      },
      picture: {
        family: "picture",
        status: "unavailable",
        serial: null,
        summary: "no picture theme",
        evidenceRefs: ["E1"],
        contextRefs: ["C1"],
      },
    },
    contentsThemePriorMatches: [],
    keywordThemeMatches: [],
    familyCoverage: {
      template: true,
      shape: true,
      picture: true,
    },
    rankingBiases: [
      {
        bias: "prefer_template_prior",
        effect: "promote",
        rationale: "prefer grounded prior",
      },
    ],
    rankingRationaleEntries: [
      {
        order: 1,
        signal: "seasonality:spring",
        outcome: "promoted",
        rationale: "spring prompt",
        evidenceRefs: ["E1"],
        contextRefs: ["C1"],
      },
    ],
    summary: "prior summary",
  };
}

function createSearchProfile(): SearchProfileArtifact {
  return {
    profileId: "profile-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    templateKind: "promo_banner",
    domain: "general_marketing",
    audience: "general_consumers",
    campaignGoal: "sale_conversion",
    canvasPreset: "wide_1200x628",
    layoutIntent: "copy_focused",
    tone: "bright_playful",
    assetPolicy: normalizeTemplateAssetPolicy({
      allowedFamilies: ["background", "graphic", "photo"],
      preferredFamilies: ["graphic"],
      primaryVisualPolicy: "graphic_preferred",
      avoidFamilies: [],
    }),
    searchKeywords: ["봄", "세일"],
    facets: {
      seasonality: "spring",
      menuType: null,
      promotionStyle: "sale_campaign",
      offerSpecificity: "broad_offer",
    },
    summary: "search profile",
    background: {
      objective: "load seasonal background",
      rationale: "spring prompt",
      queries: [
        {
          label: "primary",
          type: "pattern",
          keyword: "봄",
          source: "search",
        },
      ],
    },
    graphic: {
      objective: "graphic search",
      rationale: "promo accents",
      queries: [
        {
          label: "primary",
          keyword: "세일",
          theme: null,
          type: "vector",
          method: "creator",
          price: null,
          ownerBias: null,
          categoryName: null,
          transportApplied: {
            keyword: true,
            theme: false,
            type: true,
            method: true,
            price: false,
            owner: false,
            categoryName: false,
          },
        },
      ],
    },
    photo: {
      enabled: true,
      objective: "photo search",
      rationale: "fallback lane",
      orientationHint: "landscape",
      queries: [
        {
          label: "primary",
          keyword: "세일",
          theme: null,
          type: "pic",
          format: "horizontal",
          price: null,
          ownerBias: null,
          source: "search",
          transportApplied: {
            keyword: true,
            theme: false,
            type: true,
            format: true,
            price: false,
            owner: false,
            source: true,
          },
        },
      ],
    },
    font: {
      objective: "font selection",
      rationale: "default font surface",
      sourceSurface: "Editor::loadFont",
      typographyHint: null,
      language: {
        value: "KOR",
        rationale: "Korean locale",
      },
      category: {
        attempts: ["고딕"],
        rationale: "promo-safe default",
      },
      weight: {
        displayTarget: 700,
        bodyTarget: 400,
        rationale: "headline/body pair",
      },
    },
  };
}

function createSelectionDecision(
  overrides: Partial<SelectionDecision> = {},
): SelectionDecision {
  return {
    decisionId: "decision-1",
    runId: "run-1",
    traceId: "trace-1",
    retrievalMode: "none",
    compareCriteria: ["seasonalFit"],
    selectedBackgroundCandidateId: "background-1",
    selectedLayoutCandidateId: "layout-1",
    selectedDecorationCandidateId: "graphic-1",
    topPhotoCandidateId: null,
    selectedBackgroundAssetId: "asset-background-1",
    selectedBackgroundSerial: "serial-background-1",
    selectedBackgroundCategory: "pattern",
    selectedDecorationAssetId: "asset-graphic-1",
    selectedDecorationSerial: "serial-graphic-1",
    selectedDecorationCategory: "vector",
    topPhotoAssetId: null,
    topPhotoSerial: null,
    topPhotoCategory: null,
    topPhotoUid: null,
    topPhotoUrl: null,
    topPhotoWidth: null,
    topPhotoHeight: null,
    topPhotoOrientation: null,
    backgroundMode: "spring_pattern",
    layoutMode: "left_copy_right_graphic",
    decorationMode: "promo_multi_graphic",
    photoBranchMode: "graphic_preferred",
    photoBranchReason: "photo not selected",
    executionStrategy: "graphic_first_shape_text_group",
    graphicCompositionSet: {
      density: "medium",
      summary: "graphic set",
      roles: [
        {
          role: "primary_accent",
          candidateId: "graphic-1",
          sourceAssetId: "asset-graphic-1",
          sourceSerial: "serial-graphic-1",
          sourceCategory: "vector",
          variantKey: "graphic_primary",
          decorationMode: "promo_multi_graphic",
        },
        {
          role: "corner_accent",
          candidateId: "graphic-2",
          sourceAssetId: "asset-graphic-2",
          sourceSerial: "serial-graphic-2",
          sourceCategory: "vector",
          variantKey: "graphic_corner",
          decorationMode: "promo_multi_graphic",
        },
      ],
    },
    summary: "selection",
    fallbackSummary: "fallback",
    ...overrides,
  };
}

test("buildAssetPlan promotes graphic primary for generic promo and marks CTA fallback when missing", async () => {
  const result = await buildAssetPlan(
    createIntent(),
    createTemplatePriorSummary(),
    createSearchProfile(),
    createSelectionDecision(),
  );

  assert.equal(result.primaryVisualFamily, "graphic");
  assert.equal(result.photoBinding, null);
  assert.equal(result.graphicRoleBindings.length, 2);
  assert.equal(result.executionEligibility.canRender, true);
  assert.equal(result.executionEligibility.degraded, true);
  assert.ok(
    result.executionEligibility.reasons.includes("cta_container_missing_fallback_pill"),
  );
});

test("buildAssetPlan keeps photo binding for explicit subject photo branch", async () => {
  const result = await buildAssetPlan(
    createIntent({
      domain: "cafe",
      campaignGoal: "menu_discovery",
      facets: {
        seasonality: "spring",
        menuType: "drink_menu",
        promotionStyle: "seasonal_menu_launch",
        offerSpecificity: "single_product",
      },
      assetPolicy: normalizeTemplateAssetPolicy("photo_preferred_graphic_allowed"),
    }),
    createTemplatePriorSummary(),
    createSearchProfile(),
    createSelectionDecision({
      layoutMode: "copy_left_with_right_photo",
      photoBranchMode: "photo_selected",
      executionStrategy: "photo_hero_shape_text_group",
      topPhotoCandidateId: "photo-1",
      topPhotoAssetId: "asset-photo-1",
      topPhotoSerial: "serial-photo-1",
      topPhotoCategory: "photo",
      topPhotoUid: "uid-1",
      topPhotoUrl: "https://example.com/photo.png",
      topPhotoWidth: 1024,
      topPhotoHeight: 768,
      topPhotoOrientation: "landscape",
      graphicCompositionSet: {
        density: "minimal",
        summary: "photo support set",
        roles: [
          {
            role: "corner_accent",
            candidateId: "graphic-2",
            sourceAssetId: "asset-graphic-2",
            sourceSerial: "serial-graphic-2",
            sourceCategory: "vector",
            variantKey: "graphic_corner",
            decorationMode: "photo_support",
          },
        ],
      },
    }),
  );

  assert.equal(result.primaryVisualFamily, "photo");
  assert.ok(result.photoBinding);
  assert.equal(result.photoBinding?.candidateId, "photo-1");
  assert.equal(result.executionEligibility.canRender, true);
});
