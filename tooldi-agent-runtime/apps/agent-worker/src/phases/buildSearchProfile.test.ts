import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTemplateAssetPolicy,
  type TemplateIntentDraft,
} from "@tooldi/agent-llm";
import { createTestRun } from "@tooldi/agent-testkit";

import type { HydratedPlanningInput, NormalizedIntent } from "../types.js";
import {
  createFashionRetailNormalizedIntent,
  fashionRetailGraphicFirstAssetPolicy,
  tooldiCreateTemplateTaxonomyFixture,
} from "../testFixtures/tooldiTaxonomyFixtures.js";
import { buildNormalizedIntent } from "./buildNormalizedIntent.js";
import { buildSearchProfile } from "./buildSearchProfile.js";

function createIntent(overrides: Partial<NormalizedIntent> = {}): NormalizedIntent {
  return {
    intentId: "intent-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    operationFamily: "create_template",
    artifactType: "LiveDraftArtifactBundle",
    goalSummary: "카페 신메뉴 홍보 템플릿",
    requestedOutputCount: 1,
    templateKind: "promo_banner",
    domain: "cafe",
    audience: "local_visitors",
    campaignGoal: "product_trial",
    canvasPreset: "wide_1200x628",
    layoutIntent: "hero_focused",
    tone: "bright_playful",
    requiredSlots: [
      "background",
      "headline",
      "supporting_copy",
      "cta",
      "decoration",
    ],
    assetPolicy: normalizeTemplateAssetPolicy(
      "photo_preferred_graphic_allowed",
    ),
    searchKeywords: ["봄", "카페", "신메뉴", "프로모션"],
    facets: {
      seasonality: "spring",
      menuType: "drink_menu",
      promotionStyle: "new_product_promo",
      offerSpecificity: "single_product",
    },
    brandConstraints: {
      palette: ["#fff0f0"],
      typographyHint: "가독성이 높은 둥근 고딕 계열",
      forbiddenStyles: [],
    },
    consistencyFlags: [],
    normalizationNotes: [],
    supportedInV1: true,
    futureCapableOperations: [
      "create_template",
      "update_layer",
      "delete_layer",
    ],
    ...overrides,
  };
}

function createHydratedPlanningInput(prompt: string): HydratedPlanningInput {
  const testRun = createTestRun({
    userInput: {
      prompt,
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
    editorContext: {
      documentId: "document-1",
      pageId: "page-1",
      canvasState: "empty",
      canvasWidth: 1200,
      canvasHeight: 628,
      sizeSerial: "1200x628@1",
      workingTemplateCode: null,
      canvasSnapshotRef: null,
      selectedLayerIds: [],
    },
  });

  return {
    job: testRun.job,
    request: testRun.request,
    snapshot: testRun.snapshot,
    requestRef: testRun.requestRef,
    snapshotRef: testRun.snapshotRef,
    repairContext: null,
  };
}

test("buildSearchProfile derives domain-aware query profile for cafe hero prompts", async () => {
  const profile = await buildSearchProfile(createIntent());

  assert.equal(profile.domain, "cafe");
  assert.equal(profile.photo.enabled, true);
  assert.equal(profile.photo.orientationHint, "landscape");
  assert.equal(profile.background.queries[0]?.keyword, "봄");
  assert.equal(profile.graphic.queries[0]?.keyword, "프로모션");
  assert.equal(profile.photo.queries[0]?.keyword, "음료");
  assert.equal(profile.photo.queries[0]?.theme, null);
  assert.equal(profile.photo.queries[0]?.type, "rmbg");
  assert.equal(profile.photo.queries[0]?.format, "horizontal");
  assert.equal(profile.font.sourceSurface, "Editor::loadFont");
  assert.equal(profile.font.language.value, "KOR");
  assert.deepEqual(profile.font.category.attempts, ["고딕", "명조", "손글씨"]);
  assert.equal(profile.font.weight.displayTarget, 700);
  assert.equal(profile.font.weight.bodyTarget, 400);
});

test("buildSearchProfile prefers menu keywords for restaurant scenarios", async () => {
  const profile = await buildSearchProfile(
    createIntent({
      domain: "restaurant",
      audience: "walk_in_customers",
      campaignGoal: "menu_discovery",
      facets: {
        seasonality: "spring",
        menuType: "food_menu",
        promotionStyle: "seasonal_menu_launch",
        offerSpecificity: "multi_item",
      },
      searchKeywords: ["봄", "식당", "메뉴", "신메뉴"],
    }),
  );

  assert.equal(profile.graphic.queries[0]?.keyword, "신메뉴");
  assert.equal(profile.photo.queries[0]?.keyword, "메뉴");
  assert.equal(profile.photo.queries[0]?.theme, null);
  assert.equal(profile.photo.queries[0]?.type, "pic");
  assert.equal(profile.photo.queries[0]?.format, "horizontal");
});

test("buildSearchProfile uses repaired restaurant intent semantics to populate canonical Tooldi query fields", async () => {
  const plannerDraft: TemplateIntentDraft = {
    goalSummary: "봄 프로모션 배너",
    templateKind: "promo_banner",
    domain: "general_marketing",
    audience: "general_consumers",
    campaignGoal: "promotion_awareness",
    layoutIntent: "copy_focused",
    tone: "bright_playful",
    assetPolicy: "photo_preferred_graphic_allowed",
    searchKeywords: ["식당", "봄"],
    typographyHint: null,
    facets: {
      seasonality: null,
      menuType: null,
      promotionStyle: "general_campaign",
      offerSpecificity: "multi_item",
    },
  };

  const { intent } = await buildNormalizedIntent(
    createHydratedPlanningInput("식당 봄 신메뉴 배너 만들어줘"),
    {
      plannerMode: "langchain",
      plannerDraft,
    },
  );
  const profile = await buildSearchProfile(intent);

  assert.equal(profile.domain, "restaurant");
  assert.deepEqual(profile.searchKeywords, [
    "식당",
    "봄",
    "메뉴",
    "신메뉴",
    "배너",
  ]);
  assert.equal(profile.background.queries[0]?.keyword, "봄");
  assert.equal(profile.graphic.queries[0]?.keyword, "신메뉴");
  assert.equal(profile.graphic.queries[0]?.theme, null);
  assert.equal(profile.graphic.queries[0]?.type, "vector");
  assert.equal(profile.graphic.queries[0]?.method, null);
  assert.equal(profile.photo.enabled, true);
  assert.equal(profile.photo.orientationHint, "landscape");
  assert.equal(profile.photo.queries[0]?.keyword, "메뉴");
  assert.equal(profile.photo.queries[0]?.theme, null);
  assert.equal(profile.photo.queries[0]?.type, "pic");
  assert.equal(profile.photo.queries[0]?.format, "horizontal");
  assert.equal(profile.photo.queries[1]?.keyword, "봄");
  assert.match(profile.graphic.rationale, /Shape::index fields/);
  assert.match(profile.photo.rationale, /Tooldi direct picture theme\/type\/format surfaces/);
});

test("buildSearchProfile prioritizes repaired canonical taxonomy keywords over legacy domain shortcuts", async () => {
  const profile = await buildSearchProfile(
    createIntent({
      goalSummary: "패션 리테일 봄 할인 배너",
      templateKind: "seasonal_sale_banner",
      domain: "fashion_retail",
      audience: "sale_shoppers",
      campaignGoal: "sale_conversion",
      assetPolicy: normalizeTemplateAssetPolicy(
        "photo_preferred_graphic_allowed",
      ),
      searchKeywords: ["봄", "의류", "할인", "리테일"],
      facets: {
        seasonality: "spring",
        menuType: null,
        promotionStyle: "sale_campaign",
        offerSpecificity: "broad_offer",
      },
    }),
  );

  assert.equal(profile.background.queries[0]?.keyword, "봄");
  assert.equal(profile.graphic.queries[0]?.keyword, "할인");
  assert.equal(profile.photo.queries[0]?.keyword, "의류");
  assert.equal(profile.photo.queries[0]?.theme, null);
  assert.equal(profile.photo.queries[0]?.type, "pic");
  assert.equal(profile.photo.queries[0]?.format, "horizontal");
});

test("buildSearchProfile keeps generic promo prompts subjectless after normalization", async () => {
  const profile = await buildSearchProfile(
    createIntent({
      goalSummary: "봄 세일 배너를 만들어줘",
      templateKind: "seasonal_sale_banner",
      domain: "general_marketing",
      audience: "general_consumers",
      campaignGoal: "sale_conversion",
      assetPolicy: normalizeTemplateAssetPolicy(
        "graphic_allowed_photo_optional",
      ),
      searchKeywords: ["봄", "세일", "이벤트", "할인"],
      facets: {
        seasonality: "spring",
        menuType: null,
        promotionStyle: "sale_campaign",
        offerSpecificity: "broad_offer",
      },
    }),
  );

  assert.equal(profile.graphic.queries[0]?.keyword, "세일");
  assert.equal(profile.photo.queries[0]?.keyword, "세일");
  assert.equal(profile.photo.queries[1]?.keyword, "봄");
  assert.notEqual(profile.photo.queries[0]?.keyword, "메뉴");
  assert.notEqual(profile.photo.queries[0]?.keyword, "패션");
});

test("buildSearchProfile canonicalizes legacy asset policies before serializing the profile", async () => {
  const profile = await buildSearchProfile(
    createIntent({
      assetPolicy:
        "graphic_allowed_photo_optional" as unknown as NormalizedIntent["assetPolicy"],
    }),
  );

  assert.deepEqual(
    profile.assetPolicy,
    normalizeTemplateAssetPolicy("graphic_allowed_photo_optional"),
  );
  assert.equal(profile.photo.enabled, true);
  assert.equal(profile.photo.queries.length > 0, true);
});

test("buildSearchProfile keeps Tooldi taxonomy fixture asset policy fields intact for graphic-first fashion retail intents", async () => {
  const profile = await buildSearchProfile(createFashionRetailNormalizedIntent());

  assert.deepEqual(profile.assetPolicy, fashionRetailGraphicFirstAssetPolicy);
  assert.equal(
    profile.background.queries[0]?.type,
    tooldiCreateTemplateTaxonomyFixture.backgroundPrimaryType,
  );
  assert.equal(
    profile.background.queries[1]?.type,
    tooldiCreateTemplateTaxonomyFixture.backgroundSecondaryType,
  );
  assert.equal(
    profile.graphic.queries[0]?.type,
    tooldiCreateTemplateTaxonomyFixture.graphicType,
  );
  assert.equal(
    profile.graphic.queries[0]?.theme,
    tooldiCreateTemplateTaxonomyFixture.graphicTheme,
  );
  assert.equal(
    profile.graphic.queries[0]?.method,
    tooldiCreateTemplateTaxonomyFixture.graphicMethod,
  );
  assert.equal(profile.photo.enabled, true);
  assert.equal(
    profile.photo.queries[0]?.keyword,
    tooldiCreateTemplateTaxonomyFixture.optionalPhotoKeyword,
  );
  assert.equal(
    profile.photo.queries[0]?.theme,
    tooldiCreateTemplateTaxonomyFixture.optionalPhotoTheme,
  );
  assert.equal(
    profile.photo.queries[0]?.type,
    tooldiCreateTemplateTaxonomyFixture.optionalPhotoType,
  );
  assert.equal(
    profile.photo.queries[0]?.format,
    tooldiCreateTemplateTaxonomyFixture.optionalPhotoFormat,
  );
});

test("buildSearchProfile repairs retail-vs-menu contradiction before serializing Tooldi query cues", async () => {
  const profile = await buildSearchProfile(
    createFashionRetailNormalizedIntent({
      assetPolicy: normalizeTemplateAssetPolicy(
        "photo_preferred_graphic_allowed",
      ),
      campaignGoal: "menu_discovery",
      searchKeywords: ["봄", "메뉴", "세일"],
      facets: {
        seasonality: "spring",
        menuType: "food_menu",
        promotionStyle: "seasonal_menu_launch",
        offerSpecificity: "multi_item",
      },
      consistencyFlags: [
        {
          code: "fashion_menu_photo_contradiction",
          severity: "warning",
          message: "fashion_retail cannot keep menu-driven photo semantics",
          fields: ["domain", "facets.menuType", "searchKeywords"],
        },
      ],
    }),
  );

  assert.equal(profile.graphic.queries[0]?.keyword, "세일");
  assert.equal(profile.photo.queries[0]?.keyword, "패션");
  assert.match(profile.summary, /retail\/menu contradiction was repaired/i);
  assert.match(profile.photo.rationale, /Retail\/menu contradiction was repaired/i);
});

test("buildSearchProfile maps square and story canvas presets to Tooldi picture formats", async () => {
  const storyProfile = await buildSearchProfile(
    createIntent({
      canvasPreset: "story_1080x1920",
    }),
  );
  const squareProfile = await buildSearchProfile(
    createIntent({
      canvasPreset: "square_1080",
    }),
  );

  assert.equal(storyProfile.photo.orientationHint, "portrait");
  assert.equal(storyProfile.photo.queries[0]?.format, "vertical");
  assert.equal(squareProfile.photo.orientationHint, "square");
  assert.equal(squareProfile.photo.queries[0]?.format, "square");
});

test("buildSearchProfile preserves ordered vector and bitmap attempts when shape cues conflict", async () => {
  const profile = await buildSearchProfile(
    createIntent({
      goalSummary: "아이콘 텍스처 봄 세일 배너",
      templateKind: "seasonal_sale_banner",
      domain: "fashion_retail",
      audience: "sale_shoppers",
      campaignGoal: "sale_conversion",
      layoutIntent: "badge_led",
      assetPolicy: fashionRetailGraphicFirstAssetPolicy,
      searchKeywords: ["봄", "세일", "아이콘", "텍스처"],
      facets: {
        seasonality: "spring",
        menuType: null,
        promotionStyle: "sale_campaign",
        offerSpecificity: "broad_offer",
      },
    }),
  );

  assert.equal(profile.graphic.queries[0]?.keyword, "세일");
  assert.equal(profile.graphic.queries[0]?.type, "vector");
  assert.equal(profile.graphic.queries[1]?.keyword, "세일");
  assert.equal(profile.graphic.queries[1]?.type, "bitmap");
  assert.match(profile.graphic.rationale, /ordered type attempts/);
});

test("buildSearchProfile maps explicit creator cues onto the canonical shape method field", async () => {
  const profile = await buildSearchProfile(
    createIntent({
      goalSummary: "크리에이터 아이콘 봄 세일 배너",
      templateKind: "seasonal_sale_banner",
      domain: "fashion_retail",
      audience: "sale_shoppers",
      campaignGoal: "sale_conversion",
      layoutIntent: "badge_led",
      assetPolicy: fashionRetailGraphicFirstAssetPolicy,
      searchKeywords: ["봄", "세일", "크리에이터", "아이콘"],
      facets: {
        seasonality: "spring",
        menuType: null,
        promotionStyle: "sale_campaign",
        offerSpecificity: "broad_offer",
      },
    }),
  );

  assert.equal(profile.graphic.queries[0]?.method, "creator");
  assert.equal(profile.graphic.queries[0]?.theme, null);
});

test("buildSearchProfile maps serif typography hints and copy-heavy layouts onto Tooldi font category and weight dimensions", async () => {
  const profile = await buildSearchProfile(
    createIntent({
      layoutIntent: "copy_focused",
      brandConstraints: {
        palette: ["#fff0f0"],
        typographyHint: "에디토리얼 명조 계열로 차분한 카피 강조",
        forbiddenStyles: [],
      },
    }),
  );

  assert.equal(profile.font.language.value, "KOR");
  assert.deepEqual(profile.font.category.attempts, ["명조", "고딕", "손글씨"]);
  assert.equal(profile.font.weight.displayTarget, 700);
  assert.equal(profile.font.weight.bodyTarget, 500);
  assert.match(profile.font.rationale, /Editor::loadFont inventory/);
});
