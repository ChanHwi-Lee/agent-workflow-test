import assert from "node:assert/strict";
import test from "node:test";

import { buildScenePlans } from "./buildScenePlans.js";
import type { NormalizedIntent, TemplatePriorBundle } from "../types.js";

function createIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
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
    subjectBinding: "subjectless",
    offerIntent: "sale",
    canvasPreset: "wide_1200x628",
    layoutIntent: "copy_focused",
    tone: "bright_playful",
    backgroundColorHex: "#ffeeee",
    requiredSlots: ["background", "headline", "supporting_copy", "cta", "decoration"],
    assetPolicy: {
      allowedFamilies: ["background", "graphic", "photo"],
      preferredFamilies: ["graphic"],
      primaryVisualPolicy: "graphic_preferred",
      avoidFamilies: [],
    },
    searchKeywords: ["봄", "세일", "배너"],
    primaryVisualPolicy: "graphic_preferred",
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

function createBundle(layoutFamilyHint: "subject_hero" | "promo_badge" = "subject_hero"): TemplatePriorBundle {
  return {
    bundleId: "bundle-1",
    runId: "run-1",
    traceId: "trace-1",
    workflowVariant: "retrieval_prior_v1",
    query: {
      keyword: "봄",
      canvas: "horizontal",
      requestedTopK: 3,
    },
    queryPlan: [{ label: "season_primary", keyword: "봄" }],
    usedFallbackToLegacy: false,
    fallbackReason: null,
    selectedTemplateCode: "74091534190",
    selectedTemplateTitle: "봄 세일 배너",
    selectedScaffold: {
      scaffoldId: "scaffold-1",
      sourceTemplateCode: "74091534190",
      sourceTemplateSerial: "70079",
      title: "봄 세일 배너",
      canvasWidth: 1200,
      canvasHeight: 628,
      backgroundMode: "image",
      textObjectCount: 5,
      visualObjectCount: 3,
      groupObjectCount: 2,
      dominantObjectTypes: ["text", "image"],
      copyAnchor: "left",
      visualAnchor: "right",
      layoutFamilyHint,
      layoutModeHint:
        layoutFamilyHint === "promo_badge"
          ? "badge_promo_stack"
          : "copy_left_with_right_photo",
      primaryVisualFamilyHint: "photo",
      summary: "scaffold",
    },
    candidates: [],
    summary: "bundle",
  };
}

test("buildScenePlans keeps scaffold-first layout when intent is compatible", () => {
  const result = buildScenePlans(
    createIntent({
      layoutIntent: "hero_focused",
      primaryVisualPolicy: "photo_preferred",
      assetPolicy: {
        allowedFamilies: ["background", "graphic", "photo"],
        preferredFamilies: ["photo", "graphic"],
        primaryVisualPolicy: "photo_preferred",
        avoidFamilies: [],
      },
    }),
    createBundle(),
  );

  assert.equal(result.sceneLayoutPlan?.layoutFamily, "subject_hero");
  assert.equal(result.sceneLayoutPlan?.layoutMode, "copy_left_with_right_photo");
  assert.equal(result.sceneLayoutPlan?.resolution, "scaffold");
  assert.equal(
    result.sceneRolePlan?.roles.some((role) => role.key === "heroVisual"),
    true,
  );
});

test("buildScenePlans lets intent override scaffold when copy-focused and graphic-preferred", () => {
  const result = buildScenePlans(createIntent(), createBundle());

  assert.equal(result.sceneLayoutPlan?.layoutFamily, "promo_split");
  assert.equal(result.sceneLayoutPlan?.layoutMode, "left_copy_right_graphic");
  assert.equal(result.sceneLayoutPlan?.primaryVisualFamily, "graphic");
  assert.equal(result.sceneLayoutPlan?.resolution, "intent_override");
  assert.equal(
    result.sceneRolePlan?.roles.some((role) => role.key === "accentVisual"),
    true,
  );
});
