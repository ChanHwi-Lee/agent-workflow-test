import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTemplateAssetPolicy,
  type TemplateAbstractLayoutGenerator,
  type TemplateCopyPlanGenerator,
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
    subjectBinding: "subjectless",
    offerIntent: "sale",
    canvasPreset: "wide_1200x628",
    layoutIntent: "copy_focused",
    tone: "bright_playful",
    backgroundColorHex: "#ffeeee",
    requiredSlots: [
      "background",
      "headline",
      "subheadline",
      "cta",
    ],
    assetPolicy: normalizeTemplateAssetPolicy({
      allowedFamilies: ["background", "graphic", "photo"],
      preferredFamilies: ["graphic"],
      primaryVisualPolicy: "graphic_preferred",
      avoidFamilies: [],
    }),
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
    futureCapableOperations: [
      "create_template",
      "update_layer",
      "delete_layer",
    ],
    ...overrides,
  };
}

function createCopyGenerator(
  generate: Awaited<ReturnType<TemplateCopyPlanGenerator["generate"]>>,
  mode: TemplateCopyPlanGenerator["mode"] = "langchain",
): TemplateCopyPlanGenerator {
  return {
    mode,
    async generate() {
      return generate;
    },
  };
}

function createLayoutGenerator(
  generate: Awaited<ReturnType<TemplateAbstractLayoutGenerator["generate"]>>,
  mode: TemplateAbstractLayoutGenerator["mode"] = "langchain",
): TemplateAbstractLayoutGenerator {
  return {
    mode,
    async generate() {
      return generate;
    },
  };
}

test("buildCopyAndAbstractLayoutPlan은 생성기 출력을 구조적으로 정규화한다", async () => {
  const result = await buildCopyAndAbstractLayoutPlan(
    createHydratedPlanningInput("봄 세일 배너를 만들어줘"),
    createIntent(),
    {
      templateCopyPlanGenerator: createCopyGenerator({
        headline: {
          text: "  봄 세일 한정 혜택 안내  ",
          priority: "primary",
          required: true,
          maxLength: 18,
          toneHint: "promotional",
        },
        subheadline: {
          text: "지금 바로 확인하세요. 자세한 혜택을 놓치지 마세요",
          priority: "secondary",
          required: true,
          maxLength: 20,
          toneHint: "informational",
        },
        offerLine: null,
        cta: {
          text: "혜택 바로 확인하기",
          priority: "supporting",
          required: true,
          maxLength: 8,
          toneHint: "promotional",
        },
        footerNote: null,
        badgeText: null,
        summary: "프로모션 copy plan",
      }),
      templateAbstractLayoutGenerator: createLayoutGenerator({
        layoutFamily: "subject_hero",
        copyAnchor: "left",
        visualAnchor: "right",
        ctaAnchor: "below_copy",
        density: "balanced",
        slotTopology: "hero_headline_supporting_cta_footer",
        summary: "subject hero layout",
      }),
    },
  );

  assert.equal(result.copyPlan.source, "langchain");
  assert.equal(
    result.copyPlan.slots.find((slot) => slot.key === "headline")?.text,
    "봄 세일 한정 혜택 안내",
  );
  assert.equal(
    result.copyPlan.slots.find((slot) => slot.key === "cta")?.text,
    "혜택 바로 확인",
  );
  assert.ok(
    result.copyPlanNormalizationReport.normalizationNotes.some((note) =>
      /Trimmed/.test(note),
    ),
  );
  assert.equal(result.abstractLayoutPlan.layoutFamily, "promo_split");
  assert.equal(
    result.abstractLayoutPlanNormalizationReport.normalizationNotes.some((note) =>
      /promo-safe/i.test(note),
    ),
    true,
  );
});

test("buildCopyAndAbstractLayoutPlan은 explicit subject copy를 유지한다", async () => {
  const result = await buildCopyAndAbstractLayoutPlan(
    createHydratedPlanningInput("카페 봄 음료 배너 만들어줘"),
    createIntent({
      goalSummary: "카페 봄 음료 배너",
      domain: "cafe",
      audience: "local_visitors",
      campaignGoal: "menu_discovery",
      subjectBinding: "product_anchored",
      offerIntent: "launch",
      layoutIntent: "hero_focused",
      assetPolicy: normalizeTemplateAssetPolicy(
        "photo_preferred_graphic_allowed",
      ),
      searchKeywords: ["카페", "봄", "음료"],
      primaryVisualPolicy: "photo_preferred",
      facets: {
        seasonality: "spring",
        menuType: "drink_menu",
        promotionStyle: "seasonal_menu_launch",
        offerSpecificity: "single_product",
      },
      brandConstraints: {
        palette: ["#fff0f0"],
        typographyHint: "가독성이 높은 둥근 고딕 계열",
        forbiddenStyles: [],
      },
    }),
    {
      templateCopyPlanGenerator: createCopyGenerator(
        {
          headline: {
            text: "딸기 라떼 출시",
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
        "heuristic",
      ),
      templateAbstractLayoutGenerator: createLayoutGenerator(
        {
          layoutFamily: "subject_hero",
          copyAnchor: "left",
          visualAnchor: "right",
          ctaAnchor: "below_copy",
          density: "balanced",
          slotTopology: "hero_headline_supporting_cta_footer",
          summary: "음료 사진을 중심으로 카피를 배치하는 hero layout",
        },
        "heuristic",
      ),
    },
  );

  assert.equal(
    result.copyPlan.slots.find((slot) => slot.key === "headline")?.text,
    "딸기 라떼 출시",
  );
  assert.equal(
    result.copyPlan.slots.find((slot) => slot.key === "cta")?.text,
    "지금 주문하기",
  );
  assert.deepEqual(result.copyPlanNormalizationReport.normalizationNotes, [
    "Copy plan draft required no normalization repairs.",
  ]);
  assert.equal(result.abstractLayoutPlan.layoutFamily, "subject_hero");
});

test("buildCopyAndAbstractLayoutPlan은 retrieval prior scaffold context를 생성기 입력에 전달한다", async () => {
  const received: { copyPrior: string | null; layoutPrior: string | null } = {
    copyPrior: null,
    layoutPrior: null,
  };

  await buildCopyAndAbstractLayoutPlan(
    createHydratedPlanningInput("봄 세일 배너를 만들어줘"),
    createIntent(),
    {
      templateCopyPlanGenerator: {
        mode: "langchain",
        async generate(input) {
          received.copyPrior = input.priorContext ?? null;
          return {
            headline: {
              text: "봄 세일",
              priority: "primary",
              required: true,
              maxLength: 20,
              toneHint: "promotional",
            },
            subheadline: null,
            offerLine: null,
            cta: {
              text: "자세히 보기",
              priority: "supporting",
              required: true,
              maxLength: 18,
              toneHint: "promotional",
            },
            footerNote: null,
            badgeText: null,
            summary: "copy",
          };
        },
      },
      templateAbstractLayoutGenerator: {
        mode: "langchain",
        async generate(input) {
          received.layoutPrior = input.priorContext ?? null;
          return {
            layoutFamily: "promo_split",
            copyAnchor: "left",
            visualAnchor: "right",
            ctaAnchor: "below_copy",
            density: "balanced",
            slotTopology: "headline_supporting_cta_footer",
            summary: "layout",
          };
        },
      },
      templatePriorBundle: {
        bundleId: "bundle-1",
        runId: "run-1",
        traceId: "trace-1",
        workflowVariant: "retrieval_prior_v1",
        query: {
          keyword: "봄 세일 배너",
          canvas: "horizontal",
          requestedTopK: 3,
        },
        queryPlan: [
          { label: "season_primary", keyword: "봄" },
          { label: "offer_primary", keyword: "세일" },
        ],
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
          visualObjectCount: 4,
          groupObjectCount: 2,
          dominantObjectTypes: ["text", "group"],
          copyAnchor: "left",
          visualAnchor: "right",
          layoutFamilyHint: "subject_hero",
          layoutModeHint: "left_copy_right_graphic",
          primaryVisualFamilyHint: "graphic",
          summary: "subject hero scaffold",
        },
        candidates: [],
        summary: "bundle summary",
      },
    },
  );

  assert.match(received.copyPrior ?? "", /layoutFamilyHint=subject_hero/);
  assert.match(received.layoutPrior ?? "", /templateCode=74091534190/);
});
