import assert from "node:assert/strict";
import test from "node:test";

import type {
  TemplateIntentDraft,
  TemplatePlanner,
} from "@tooldi/agent-llm";
import { createTestRun } from "@tooldi/agent-testkit";

import type { HydratedPlanningInput } from "../types.js";

import { resolvePlannerDraft } from "./resolvePlannerDraft.js";

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

function validDraft(goalSummary: string): TemplateIntentDraft {
  return {
    goalSummary,
    templateKind: "promo_banner",
    domain: "cafe",
    audience: "local_visitors",
    campaignGoal: "menu_discovery",
    subjectBinding: "product_anchored",
    offerIntent: "launch",
    layoutIntent: "hero_focused",
    tone: "bright_playful",
    backgroundColorHex: "#FFDAB9",
    assetPolicy: "photo_preferred_graphic_allowed",
    typographyHint: "굵은 고딕",
    searchKeywords: ["카페", "음료", "신메뉴"],
    facets: {
      seasonality: "spring",
      menuType: "drink_menu",
      promotionStyle: "seasonal_menu_launch",
      offerSpecificity: "single_product",
    },
  };
}

test("planner draft resolution caps overlength goalSummary at the schema boundary", async () => {
  const planner: TemplatePlanner = {
    mode: "langchain",
    async plan() {
      return validDraft("x".repeat(96));
    },
  };

  const result = await resolvePlannerDraft(
    createHydratedPlanningInput("카페 신메뉴 배너"),
    { templatePlanner: planner },
  );

  assert.equal(result.plannerMode, "langchain");
  assert.equal(result.fallbackReason, null);
  assert.equal(result.plannerDraft?.goalSummary.length, 80);
});

test("planner draft resolution caps heuristic fallback goalSummary from long prompts", async () => {
  const planner: TemplatePlanner = {
    mode: "langchain",
    async plan() {
      throw new Error("planner unavailable");
    },
  };
  const longPrompt =
    "한식당 봄 계절메뉴 출시 배너. 봄나물 비빔밥 12,900원, 냉이 된장 정식 14,500원. 건강하고 정갈한 한상 느낌, 메뉴 확인하기 CTA.";

  const result = await resolvePlannerDraft(
    createHydratedPlanningInput(longPrompt),
    { templatePlanner: planner },
  );

  assert.equal(result.plannerMode, "heuristic");
  assert.match(result.fallbackReason ?? "", /planner unavailable/);
  assert.equal(result.plannerDraft?.goalSummary.length, 80);
});
