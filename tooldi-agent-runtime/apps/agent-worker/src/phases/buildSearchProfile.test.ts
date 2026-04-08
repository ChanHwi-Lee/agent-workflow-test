import assert from "node:assert/strict";
import test from "node:test";

import type { NormalizedIntent } from "../types.js";
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
    assetPolicy: "photo_preferred_graphic_allowed",
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
    supportedInV1: true,
    futureCapableOperations: [
      "create_template",
      "update_layer",
      "delete_layer",
    ],
    ...overrides,
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
  assert.deepEqual(profile.font.preferredCategories, ["고딕"]);
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
});
