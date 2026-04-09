import assert from "node:assert/strict";
import test from "node:test";

import {
  createHeuristicTemplatePlanner,
  createLangChainTemplatePlanner,
  normalizeTemplateAssetPolicy,
  templateAssetPolicyAllowsFamily,
  templateAssetPolicyPenaltyForFamily,
  templateAssetPolicyPrefersPhoto,
  TemplateIntentDraftSchema,
} from "./templatePlanner.js";

test("heuristic template planner keeps current safe spring defaults", async () => {
  const planner = createHeuristicTemplatePlanner();

  const result = await planner.plan({
    prompt: "봄 세일 이벤트 배너 만들어줘",
    canvasPreset: "wide_1200x628",
    palette: ["#ffccaa"],
  });

  assert.equal(result.templateKind, "seasonal_sale_banner");
  assert.equal(result.domain, "general_marketing");
  assert.equal(result.campaignGoal, "sale_conversion");
  assert.equal(result.layoutIntent, "copy_focused");
  assert.equal(result.tone, "bright_playful");
  assert.deepEqual(
    result.assetPolicy,
    normalizeTemplateAssetPolicy("graphic_allowed_photo_optional"),
  );
  assert.deepEqual(result.searchKeywords, [
    "봄",
    "프로모션",
    "세일",
    "이벤트",
    "배너",
  ]);
  assert.equal(result.facets.seasonality, "spring");
});

test("langchain template planner normalizes structured output from the model", async () => {
  const planner = createLangChainTemplatePlanner({
    provider: "openai",
    modelName: "gpt-test",
    temperature: 0,
    modelOverride: {
      withStructuredOutput(schema) {
        assert.equal(schema, TemplateIntentDraftSchema);
        return {
          async invoke() {
            return TemplateIntentDraftSchema.parse({
              goalSummary: "봄 메뉴 배너",
              templateKind: "promo_banner",
              domain: "restaurant",
              audience: "walk_in_customers",
              campaignGoal: "menu_discovery",
              layoutIntent: "hero_focused",
              tone: "bright_playful",
              assetPolicy: "photo_preferred_graphic_allowed",
              searchKeywords: ["메뉴"],
              typographyHint: "고딕",
              facets: {
                seasonality: "spring",
                menuType: "food_menu",
                promotionStyle: "seasonal_menu_launch",
                offerSpecificity: "single_product",
              },
            });
          },
        };
      },
    },
  });

  const result = await planner.plan({
    prompt: "식당에서 신규 봄 계절메뉴를 만들어줘",
    canvasPreset: "wide_1200x628",
    palette: ["#f3f3f3"],
  });

  assert.equal(result.templateKind, "promo_banner");
  assert.equal(result.domain, "restaurant");
  assert.equal(result.audience, "walk_in_customers");
  assert.equal(result.campaignGoal, "menu_discovery");
  assert.equal(result.layoutIntent, "hero_focused");
  assert.deepEqual(
    result.assetPolicy,
    normalizeTemplateAssetPolicy("photo_preferred_graphic_allowed"),
  );
  assert.deepEqual(result.searchKeywords, ["봄", "메뉴"]);
  assert.equal(result.typographyHint, "고딕");
  assert.equal(result.facets.menuType, "food_menu");
});

test("template planner asset policy boundary keeps legacy strings readable", () => {
  const parsed = TemplateIntentDraftSchema.parse({
    goalSummary: "봄 세일 배너",
    templateKind: "seasonal_sale_banner",
    domain: "general_marketing",
    audience: "general_consumers",
    campaignGoal: "sale_conversion",
    layoutIntent: "copy_focused",
    tone: "bright_playful",
    assetPolicy: "graphic_allowed_photo_optional",
    searchKeywords: ["봄", "세일"],
    typographyHint: null,
    facets: {
      seasonality: "spring",
      menuType: null,
      promotionStyle: "sale_campaign",
      offerSpecificity: "multi_item",
    },
  });

  assert.equal(parsed.assetPolicy, "graphic_allowed_photo_optional");
  assert.deepEqual(
    normalizeTemplateAssetPolicy(parsed.assetPolicy),
    {
      allowedFamilies: ["background", "graphic", "photo"],
      preferredFamilies: ["graphic"],
      primaryVisualPolicy: "graphic_preferred",
      avoidFamilies: [],
    },
  );
});

test("template planner asset policy boundary accepts structured policies", () => {
  const parsed = TemplateIntentDraftSchema.parse({
    goalSummary: "카페 음료 홍보",
    templateKind: "promo_banner",
    domain: "cafe",
    audience: "local_visitors",
    campaignGoal: "product_trial",
    layoutIntent: "hero_focused",
    tone: "bright_playful",
    assetPolicy: {
      allowedFamilies: ["background", "photo", "graphic"],
      preferredFamilies: ["graphic", "photo"],
      primaryVisualPolicy: "photo_preferred",
      avoidFamilies: [],
    },
    searchKeywords: ["봄", "카페", "음료"],
    typographyHint: "고딕",
    facets: {
      seasonality: "spring",
      menuType: "drink_menu",
      promotionStyle: "seasonal_menu_launch",
      offerSpecificity: "single_product",
    },
  });

  assert.deepEqual(
    normalizeTemplateAssetPolicy(parsed.assetPolicy),
    {
      allowedFamilies: ["background", "photo", "graphic"],
      preferredFamilies: ["photo", "graphic"],
      primaryVisualPolicy: "photo_preferred",
      avoidFamilies: [],
    },
  );
});

test("자산 정책 구조 필드가 일부만 와도 안전한 기본값으로 정규화한다", () => {
  const parsed = TemplateIntentDraftSchema.parse({
    goalSummary: "봄 카페 음료 배너",
    templateKind: "promo_banner",
    domain: "cafe",
    audience: "local_visitors",
    campaignGoal: "product_trial",
    layoutIntent: "hero_focused",
    tone: "bright_playful",
    assetPolicy: {
      primaryVisualPolicy: "photo_preferred",
    },
    searchKeywords: ["봄", "카페", "음료"],
    typographyHint: null,
    facets: {
      seasonality: "spring",
      menuType: "drink_menu",
      promotionStyle: "new_product_promo",
      offerSpecificity: "single_product",
    },
  });

  assert.deepEqual(
    normalizeTemplateAssetPolicy(parsed.assetPolicy),
    {
      allowedFamilies: ["background", "photo", "graphic"],
      preferredFamilies: ["photo", "graphic"],
      primaryVisualPolicy: "photo_preferred",
      avoidFamilies: [],
    },
  );
});

test("asset policy helpers accept structured policies first and fall back to legacy mappings", () => {
  assert.equal(
    templateAssetPolicyPrefersPhoto("photo_preferred_graphic_allowed"),
    true,
  );
  assert.equal(
    templateAssetPolicyAllowsFamily(
      {
        primaryVisualPolicy: "photo_preferred",
      },
      "photo",
    ),
    true,
  );
  assert.equal(
    templateAssetPolicyAllowsFamily(
      {
        allowedFamilies: ["graphic"],
        primaryVisualPolicy: "graphic_preferred",
      },
      "photo",
    ),
    false,
  );
  assert.equal(
    templateAssetPolicyPenaltyForFamily(
      {
        allowedFamilies: ["background", "graphic", "photo"],
        preferredFamilies: ["graphic"],
        primaryVisualPolicy: "balanced",
        avoidFamilies: ["photo"],
      },
      "photo",
    ),
    0.08,
  );
});
