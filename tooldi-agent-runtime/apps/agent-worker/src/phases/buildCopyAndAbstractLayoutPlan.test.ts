import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTemplateAssetPolicy,
  type TemplateIntentDraft,
} from "@tooldi/agent-llm";
import { createTestRun } from "@tooldi/agent-testkit";

import type { HydratedPlanningInput, NormalizedIntent } from "../types.js";
import { buildCopyAndAbstractLayoutPlan } from "./buildCopyAndAbstractLayoutPlan.js";

function createHydratedPlanningInput(prompt: string): HydratedPlanningInput {
  const testRun = createTestRun({
    userInput: {
      prompt,
      locale: "ko-KR",
      timezone: "Asia/Seoul",
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
    canvasPreset: "wide_1200x628",
    layoutIntent: "copy_focused",
    tone: "bright_playful",
    requiredSlots: [
      "background",
      "headline",
      "supporting_copy",
      "cta",
      "decoration",
    ],
    assetPolicy: normalizeTemplateAssetPolicy({
      allowedFamilies: ["background", "graphic", "photo"],
      preferredFamilies: ["graphic"],
      primaryVisualPolicy: "graphic_preferred",
      avoidFamilies: [],
    }),
    searchKeywords: ["봄", "세일", "배너"],
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
    futureCapableOperations: [
      "create_template",
      "update_layer",
      "delete_layer",
    ],
    ...overrides,
  };
}

test("buildCopyAndAbstractLayoutPlan deterministically rewrites generic promo headline, CTA, and summaries", async () => {
  const plannerDraft: TemplateIntentDraft = {
    goalSummary: "봄 세일 배너를 만들어줘",
    templateKind: "promo_banner",
    domain: "general_marketing",
    audience: "general_consumers",
    campaignGoal: "sale_conversion",
    layoutIntent: "copy_focused",
    tone: "bright_playful",
    assetPolicy: {
      allowedFamilies: ["background", "graphic", "photo"],
      preferredFamilies: ["graphic"],
      primaryVisualPolicy: "graphic_preferred",
      avoidFamilies: [],
    },
    searchKeywords: ["봄", "세일", "배너"],
    typographyHint: null,
    facets: {
      seasonality: "spring",
      menuType: null,
      promotionStyle: "sale_campaign",
      offerSpecificity: "broad_offer",
    },
    copyPlanDraft: {
      headline: {
        text: "봄을 담은 특별한 한 잔",
        priority: "primary",
        required: true,
        maxLength: 28,
        toneHint: "promotional",
      },
      subheadline: {
        text: "카페 신메뉴 출시를 지금 만나보세요",
        priority: "secondary",
        required: true,
        maxLength: 36,
        toneHint: "informational",
      },
      offerLine: {
        text: "최대 50% OFF",
        priority: "secondary",
        required: true,
        maxLength: 24,
        toneHint: "urgent",
      },
      cta: {
        text: "지금 주문하기",
        priority: "supporting",
        required: true,
        maxLength: 18,
        toneHint: "promotional",
      },
      footerNote: {
        text: "카페 메뉴 소진 시 종료",
        priority: "utility",
        required: false,
        maxLength: 32,
        toneHint: "informational",
      },
      badgeText: {
        text: "SALE",
        priority: "supporting",
        required: false,
        maxLength: 12,
        toneHint: "urgent",
      },
      summary: "신메뉴 출시와 고객 방문 유도에 맞춘 copy plan",
    },
    abstractLayoutDraft: {
      layoutFamily: "subject_hero",
      copyAnchor: "left",
      visualAnchor: "right",
      ctaAnchor: "below_copy",
      density: "balanced",
      slotTopology: "hero_headline_supporting_cta_footer",
      summary: "음료 사진을 중심으로 카피를 배치하는 hero layout",
    },
  };

  const result = await buildCopyAndAbstractLayoutPlan(
    createHydratedPlanningInput("봄 세일 배너를 만들어줘"),
    createIntent(),
    plannerDraft,
  );

  assert.equal(
    result.copyPlan.slots.find((slot) => slot.key === "headline")?.text,
    "봄 세일",
  );
  assert.equal(
    result.copyPlan.slots.find((slot) => slot.key === "cta")?.text,
    "혜택 보기",
  );
  assert.equal(
    result.copyPlan.slots.find((slot) => slot.key === "subheadline")?.text,
    "지금 바로 확인하세요",
  );
  assert.match(result.copyPlan.summary, /generic promotional/i);
  assert.doesNotMatch(result.copyPlan.summary, /메뉴|음료|카페/u);
  assert.equal(result.abstractLayoutPlan.layoutFamily, "promo_split");
  assert.equal(
    result.abstractLayoutPlan.slotTopology,
    "headline_supporting_offer_cta_footer",
  );
  assert.match(result.abstractLayoutPlan.summary, /promotional copy/i);
  assert.doesNotMatch(result.abstractLayoutPlan.summary, /메뉴|음료|카페/u);
  assert.ok(
    result.copyPlanNormalizationReport.normalizationNotes.some((note) =>
      /generic promo/i.test(note),
    ),
  );
  assert.ok(
    result.abstractLayoutPlanNormalizationReport.normalizationNotes.some((note) =>
      /generic promo/i.test(note),
    ),
  );
});

test("buildCopyAndAbstractLayoutPlan keeps explicit subject copy semantics outside generic promo hardening", async () => {
  const plannerDraft: TemplateIntentDraft = {
    goalSummary: "카페 봄 음료 배너",
    templateKind: "promo_banner",
    domain: "cafe",
    audience: "local_visitors",
    campaignGoal: "menu_discovery",
    layoutIntent: "hero_focused",
    tone: "bright_playful",
    assetPolicy: "photo_preferred_graphic_allowed",
    searchKeywords: ["카페", "봄", "음료"],
    typographyHint: null,
    facets: {
      seasonality: "spring",
      menuType: "drink_menu",
      promotionStyle: "seasonal_menu_launch",
      offerSpecificity: "single_product",
    },
    copyPlanDraft: {
      headline: {
        text: "봄을 담은 특별한 한 잔",
        priority: "primary",
        required: true,
        maxLength: 28,
        toneHint: "promotional",
      },
      subheadline: {
        text: "카페 신메뉴를 지금 만나보세요",
        priority: "secondary",
        required: true,
        maxLength: 36,
        toneHint: "informational",
      },
      offerLine: null,
      cta: {
        text: "지금 주문하기",
        priority: "supporting",
        required: true,
        maxLength: 18,
        toneHint: "promotional",
      },
      footerNote: null,
      badgeText: null,
      summary: "신메뉴 출시와 주문 유도를 위한 카페 copy plan",
    },
    abstractLayoutDraft: {
      layoutFamily: "subject_hero",
      copyAnchor: "left",
      visualAnchor: "right",
      ctaAnchor: "below_copy",
      density: "balanced",
      slotTopology: "hero_headline_supporting_cta_footer",
      summary: "음료 사진을 중심으로 카피를 배치하는 hero layout",
    },
  };

  const result = await buildCopyAndAbstractLayoutPlan(
    createHydratedPlanningInput("카페 봄 음료 배너 만들어줘"),
    createIntent({
      goalSummary: "카페 봄 음료 배너",
      domain: "cafe",
      audience: "local_visitors",
      campaignGoal: "menu_discovery",
      layoutIntent: "hero_focused",
      assetPolicy: normalizeTemplateAssetPolicy(
        "photo_preferred_graphic_allowed",
      ),
      searchKeywords: ["카페", "봄", "음료"],
      facets: {
        seasonality: "spring",
        menuType: "drink_menu",
        promotionStyle: "seasonal_menu_launch",
        offerSpecificity: "single_product",
      },
    }),
    plannerDraft,
  );

  assert.equal(
    result.copyPlan.slots.find((slot) => slot.key === "headline")?.text,
    "봄을 담은 특별한 한 잔",
  );
  assert.equal(
    result.copyPlan.slots.find((slot) => slot.key === "cta")?.text,
    "지금 주문하기",
  );
  assert.equal(
    result.copyPlan.summary,
    "신메뉴 출시와 주문 유도를 위한 카페 copy plan",
  );
  assert.equal(
    result.abstractLayoutPlan.summary,
    "음료 사진을 중심으로 카피를 배치하는 hero layout",
  );
  assert.equal(
    result.abstractLayoutPlan.slotTopology,
    "hero_headline_supporting_cta_footer",
  );
});
