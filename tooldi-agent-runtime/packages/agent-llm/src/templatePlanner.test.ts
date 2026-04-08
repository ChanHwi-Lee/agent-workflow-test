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

  assert.equal(result.layoutIntent, "copy_focused");
  assert.equal(result.tone, "bright_playful");
  assert.deepEqual(result.searchKeywords, ["봄"]);
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
                layoutIntent: z.enum([
                  "copy_focused",
                  "hero_focused",
                  "badge_led",
                ]),
                tone: z.literal("bright_playful"),
                searchKeywords: z.array(z.string()),
                typographyHint: z.string().nullable(),
              })
              .parse({
                goalSummary: "봄 메뉴 배너",
                layoutIntent: "hero_focused",
                tone: "bright_playful",
                searchKeywords: ["메뉴"],
                typographyHint: "고딕",
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

  assert.equal(result.layoutIntent, "hero_focused");
  assert.deepEqual(result.searchKeywords, ["봄", "메뉴"]);
  assert.equal(result.typographyHint, "고딕");
});
