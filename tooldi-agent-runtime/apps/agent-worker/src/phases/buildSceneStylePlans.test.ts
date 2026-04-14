import assert from "node:assert/strict";
import test from "node:test";

import { buildSceneStylePlans } from "./buildSceneStylePlans.js";
import type {
  NormalizedIntent,
  SceneLayoutPlan,
  TemplatePriorBundle,
} from "../types.js";

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

function createSceneLayoutPlan(): SceneLayoutPlan {
  return {
    planId: "layout-1",
    runId: "run-1",
    traceId: "trace-1",
    workflowVariant: "retrieval_prior_v1",
    selectedTemplateCode: "19046887349",
    selectedTemplateTitle: "봄맞이 할인 이벤트 광고",
    layoutFamily: "promo_center",
    layoutMode: "center_stack_promo",
    copyAnchor: "center",
    visualAnchor: "center",
    ctaAnchor: "bottom_center",
    density: "airy",
    slotTopology: "headline_supporting_offer_cta_footer",
    primaryVisualFamily: "graphic",
    resolution: "scaffold",
    summary: "layout",
  };
}

function createBundle(): TemplatePriorBundle {
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
    selectedTemplateCode: "19046887349",
    selectedTemplateTitle: "봄맞이 할인 이벤트 광고",
    selectedScaffold: {
      scaffoldId: "scaffold-1",
      sourceTemplateCode: "19046887349",
      sourceTemplateSerial: "70079",
      title: "봄맞이 할인 이벤트 광고",
      canvasWidth: 1200,
      canvasHeight: 628,
      backgroundMode: "gradient",
      textObjectCount: 5,
      visualObjectCount: 4,
      groupObjectCount: 1,
      dominantObjectTypes: ["text", "rect", "circle"],
      copyAnchor: "center",
      visualAnchor: "center",
      layoutFamilyHint: "promo_center",
      layoutModeHint: "center_stack_promo",
      primaryVisualFamilyHint: "graphic",
      summary: "scaffold",
    },
    candidates: [
      {
        rank: 1,
        score: 0.95,
        deterministicScore: 0.93,
        geminiScore: 0.97,
        keep: true,
        keepReason: "best match",
        rejectReason: null,
        matchedQueryLabels: ["season_primary"],
        templateAssetId: "template:70079",
        templateSerial: "70079",
        templateCode: "19046887349",
        title: "봄맞이 할인 이벤트 광고",
        categoryName: "소셜미디어 광고",
        width: 1200,
        height: 628,
        pages: 1,
        keywordTokens: ["봄", "광고", "꽃"],
        thumbnailUrl: "https://thumb.test/template.png",
        traceId: "trace-template",
        fetchedDocument: {
          code: "19046887349",
          metaData: {
            code: "19046887349",
            innerCode: "134188397425",
            title: "봄맞이 할인 이벤트 광고",
            width: "1200",
            height: "628",
            sizeUnit: "px",
            isShare: true,
            userId: "creator",
            createdAt: "2026-04-14",
            modifiedAt: "2026-04-14",
            keyword: "봄|:|꽃|:|광고",
          },
          canvas: {
            serial: "48",
            title: "소셜미디어 광고",
            width: "1200",
            height: "628",
            sizeUnit: "px",
          },
          pages: [
            {
              index: 0,
              raw: "{}",
              pattern: null,
              parsed: {
                backgroundType: "gradient",
                backgroundColor: "#62D84E",
                gr_fill_color: ["#62D84E", "#22C2A4"],
                width: 1200,
                height: 628,
                objects: [
                  {
                    type: "text",
                    left: 180,
                    top: 140,
                    width: 700,
                    height: 120,
                    fontFamily: "Rounded Display",
                    fontSize: 88,
                    fontWeight: 800,
                    fill: "#FFFFFF",
                  },
                  {
                    type: "text",
                    left: 250,
                    top: 420,
                    width: 500,
                    height: 48,
                    fontFamily: "Rounded Display",
                    fontSize: 28,
                    fontWeight: 500,
                    fill: "#1C5D40",
                  },
                  {
                    type: "rect",
                    left: 210,
                    top: 390,
                    width: 760,
                    height: 82,
                    rx: 22,
                    ry: 22,
                    fill: "rgba(180, 236, 120, 1)",
                  },
                  {
                    type: "circle",
                    left: 60,
                    top: 430,
                    width: 90,
                    height: 90,
                    fill: "#FFE7A8",
                  },
                  {
                    type: "rect",
                    left: 840,
                    top: 70,
                    width: 160,
                    height: 72,
                    rx: 18,
                    ry: 18,
                    fill: "#FFF3A6",
                  },
                ],
              },
            },
          ],
        },
        scaffold: null,
      },
    ],
    summary: "bundle",
  };
}

test("buildSceneStylePlans extracts typed style and binding plans from template JSON", () => {
  const result = buildSceneStylePlans(
    createIntent(),
    createBundle(),
    createSceneLayoutPlan(),
  );

  assert.ok(result.sceneStylePlan);
  assert.ok(result.sceneBindingPlan);
  assert.equal(result.sceneStylePlan?.backgroundKind, "gradient");
  assert.equal(result.sceneStylePlan?.ctaShapeLanguage, "band");
  assert.equal(result.sceneStylePlan?.typographyPolicy.tone, "rounded");
  assert.equal(result.sceneStylePlan?.palettePolicy.backgroundColorHex, "#62d84e");
  assert.equal(result.sceneStylePlan?.palettePolicy.ctaSurfaceColorHex, "#b4ec78");
  assert.equal(result.sceneStylePlan?.motifTags.includes("floral"), true);
  assert.equal(result.sceneBindingPlan?.preferredDecorationMode, "promo_multi_graphic");
  assert.equal(result.sceneBindingPlan?.preferredCtaTreatment, "framed");
  assert.equal(result.sceneBindingPlan?.backgroundMode, "pastel_gradient");
});

test("buildSceneStylePlans keeps band CTA precedence even when badge-like treatment is detected", () => {
  const bundle = createBundle();
  const firstPage = bundle.candidates[0]?.fetchedDocument?.pages[0]?.parsed;
  if (firstPage && Array.isArray(firstPage.objects)) {
    firstPage.objects.unshift({
      type: "text",
      left: 80,
      top: 40,
      width: 120,
      height: 24,
      fontFamily: "1292_400",
      fontSize: 18,
      fontWeight: 400,
      fill: "#ffffff",
    });
    (firstPage.objects[0] as Record<string, unknown>).opacity = 0.5;
    const ctaShape = firstPage.objects.find(
      (object) => typeof object === "object" && object !== null && (object as Record<string, unknown>).type === "rect",
    ) as Record<string, unknown> | undefined;
    if (ctaShape) {
      ctaShape.opacity = 0.5;
      ctaShape.width = 760;
      ctaShape.height = 82;
      ctaShape.top = 390;
    }
  }

  const result = buildSceneStylePlans(
    createIntent(),
    bundle,
    createSceneLayoutPlan(),
  );

  assert.equal(result.sceneStylePlan?.badgeLikeTreatment, true);
  assert.equal(result.sceneStylePlan?.ctaShapeLanguage, "transparent_band");
  assert.equal(result.sceneBindingPlan?.preferredCtaTreatment, "framed");
});

test("buildSceneStylePlans boosts display weight for large headline tokens even when raw font weight is light", () => {
  const bundle = createBundle();
  const firstPage = bundle.candidates[0]?.fetchedDocument?.pages[0]?.parsed;
  if (firstPage && Array.isArray(firstPage.objects)) {
    const headline = firstPage.objects[0] as Record<string, unknown> | undefined;
    if (headline) {
      headline.fontFamily = "1292_400";
      headline.fontWeight = 400;
      headline.fontSize = 96;
    }
  }

  const result = buildSceneStylePlans(
    createIntent(),
    bundle,
    createSceneLayoutPlan(),
  );

  assert.equal(result.sceneStylePlan?.typographyPolicy.templateFontFamily, "1292_400");
  assert.equal(result.sceneStylePlan?.typographyPolicy.displayWeightTarget, 800);
  assert.equal(result.sceneStylePlan?.typographyPolicy.tone, "rounded");
});
