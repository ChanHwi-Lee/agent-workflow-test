import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import {
  createHeuristicTemplatePlanner,
  createLangChainTemplatePlanner,
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
  assert.equal(result.assetPolicy, "graphic_allowed_photo_optional");
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
            return z
              .object({
                goalSummary: z.string(),
                templateKind: z.enum(["promo_banner", "seasonal_sale_banner"]),
                domain: z.enum([
                  "restaurant",
                  "cafe",
                  "fashion_retail",
                  "general_marketing",
                ]),
                audience: z.enum([
                  "walk_in_customers",
                  "local_visitors",
                  "sale_shoppers",
                  "general_consumers",
                ]),
                campaignGoal: z.enum([
                  "menu_discovery",
                  "product_trial",
                  "sale_conversion",
                  "promotion_awareness",
                ]),
                layoutIntent: z.enum([
                  "copy_focused",
                  "hero_focused",
                  "badge_led",
                ]),
                tone: z.literal("bright_playful"),
                assetPolicy: z.enum([
                  "graphic_allowed_photo_optional",
                  "photo_preferred_graphic_allowed",
                ]),
                searchKeywords: z.array(z.string()),
                typographyHint: z.string().nullable(),
                facets: z.object({
                  seasonality: z.enum(["spring"]).nullable(),
                  menuType: z.enum(["food_menu", "drink_menu"]).nullable(),
                  promotionStyle: z.enum([
                    "seasonal_menu_launch",
                    "new_product_promo",
                    "sale_campaign",
                    "general_campaign",
                  ]),
                  offerSpecificity: z.enum([
                    "single_product",
                    "multi_item",
                    "broad_offer",
                  ]),
                }),
              })
              .parse({
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
  assert.equal(result.assetPolicy, "photo_preferred_graphic_allowed");
  assert.deepEqual(result.searchKeywords, ["봄", "메뉴"]);
  assert.equal(result.typographyHint, "고딕");
  assert.equal(result.facets.menuType, "food_menu");
});
