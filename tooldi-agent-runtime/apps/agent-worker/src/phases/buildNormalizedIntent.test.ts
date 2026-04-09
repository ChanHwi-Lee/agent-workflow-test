import assert from "node:assert/strict";
import test from "node:test";

import {
  createHeuristicTemplatePlanner,
  type TemplateIntentDraft,
  type TemplatePlanner,
} from "@tooldi/agent-llm";
import { createTestRun } from "@tooldi/agent-testkit";

import type {
  HydratedPlanningInput,
  IntentNormalizationReport,
  NormalizedIntent,
} from "../types.js";
import { buildNormalizedIntent } from "./buildNormalizedIntent.js";

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

function createPlanner(mode: TemplatePlanner["mode"] = "langchain"): TemplatePlanner {
  return {
    mode,
    async plan() {
      throw new Error("planner.plan should not run when plannerDraft override is provided");
    },
  };
}

interface TooldiTaxonomyNormalizationFixture {
  name: string;
  prompt: string;
  plannerDraft: TemplateIntentDraft;
  expected: {
    domain: NormalizedIntent["domain"];
    goalSummary: string;
    templateKind: NormalizedIntent["templateKind"];
    campaignGoal: NormalizedIntent["campaignGoal"];
    searchKeywords: string[];
    facets: NormalizedIntent["facets"];
    repairFields: string[];
    consistencyFlagCodes: string[];
  };
}

const REAL_TOOLDI_TAXONOMY_FIXTURES: TooldiTaxonomyNormalizationFixture[] = [
  {
    name: "패션 리테일 봄 세일 웹배너",
    prompt: "패션 리테일 봄 세일 배너 만들어줘",
    plannerDraft: {
      goalSummary: "봄 메뉴 배너",
      templateKind: "promo_banner",
      domain: "fashion_retail",
      audience: "sale_shoppers",
      campaignGoal: "menu_discovery",
      layoutIntent: "hero_focused",
      tone: "bright_playful",
      assetPolicy: "photo_preferred_graphic_allowed",
      searchKeywords: ["봄", "메뉴", "음료"],
      typographyHint: "굵은 고딕",
      facets: {
        seasonality: null,
        menuType: "food_menu",
        promotionStyle: "seasonal_menu_launch",
        offerSpecificity: "single_product",
      },
    },
    expected: {
      domain: "fashion_retail",
      goalSummary: "패션 리테일 봄 세일 배너 만들어줘",
      templateKind: "seasonal_sale_banner",
      campaignGoal: "sale_conversion",
      searchKeywords: ["봄", "패션", "세일", "리테일", "배너"],
      facets: {
        seasonality: "spring",
        menuType: null,
        promotionStyle: "sale_campaign",
        offerSpecificity: "broad_offer",
      },
      repairFields: [
        "facets.seasonality",
        "facets.menuType",
        "facets.promotionStyle",
        "campaignGoal",
        "templateKind",
        "facets.offerSpecificity",
        "assetPolicy",
        "searchKeywords",
        "goalSummary",
      ],
      consistencyFlagCodes: [
        "fashion_menu_photo_contradiction",
        "menu_type_domain_conflict",
        "promotion_style_domain_conflict",
        "search_keyword_subject_drift",
      ],
    },
  },
  {
    name: "카페 봄 신메뉴 음료 웹배너",
    prompt: "카페 봄 신메뉴 음료 배너 만들어줘",
    plannerDraft: {
      goalSummary: "카페 배너",
      templateKind: "promo_banner",
      domain: "cafe",
      audience: "local_visitors",
      campaignGoal: "promotion_awareness",
      layoutIntent: "copy_focused",
      tone: "bright_playful",
      assetPolicy: "photo_preferred_graphic_allowed",
      searchKeywords: ["카페"],
      typographyHint: null,
      facets: {
        seasonality: null,
        menuType: null,
        promotionStyle: "general_campaign",
        offerSpecificity: "multi_item",
      },
    },
    expected: {
      domain: "cafe",
      goalSummary: "카페 배너",
      templateKind: "promo_banner",
      campaignGoal: "menu_discovery",
      searchKeywords: ["카페", "봄", "음료", "신메뉴", "배너"],
      facets: {
        seasonality: "spring",
        menuType: "drink_menu",
        promotionStyle: "seasonal_menu_launch",
        offerSpecificity: "single_product",
      },
      repairFields: [
        "facets.seasonality",
        "facets.menuType",
        "facets.promotionStyle",
        "campaignGoal",
        "facets.offerSpecificity",
        "assetPolicy",
        "brandConstraints.typographyHint",
        "searchKeywords",
      ],
      consistencyFlagCodes: [],
    },
  },
  {
    name: "식당 봄 신메뉴 웹배너",
    prompt: "식당 봄 신메뉴 배너 만들어줘",
    plannerDraft: {
      goalSummary: "식당 봄 프로모션",
      templateKind: "promo_banner",
      domain: "restaurant",
      audience: "walk_in_customers",
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
    },
    expected: {
      domain: "restaurant",
      goalSummary: "식당 봄 프로모션",
      templateKind: "promo_banner",
      campaignGoal: "menu_discovery",
      searchKeywords: ["식당", "봄", "메뉴", "신메뉴", "배너"],
      facets: {
        seasonality: "spring",
        menuType: "food_menu",
        promotionStyle: "seasonal_menu_launch",
        offerSpecificity: "single_product",
      },
      repairFields: [
        "facets.seasonality",
        "facets.menuType",
        "facets.promotionStyle",
        "campaignGoal",
        "facets.offerSpecificity",
        "assetPolicy",
        "searchKeywords",
      ],
      consistencyFlagCodes: [],
    },
  },
  {
    name: "일반 마케팅 봄 프로모션 웹배너",
    prompt: "봄 프로모션 배너",
    plannerDraft: {
      goalSummary: "봄 프로모션 배너",
      templateKind: "promo_banner",
      domain: "general_marketing",
      audience: "general_consumers",
      campaignGoal: "promotion_awareness",
      layoutIntent: "copy_focused",
      tone: "bright_playful",
      assetPolicy: {
        allowedFamilies: ["graphic", "photo"],
        preferredFamilies: ["graphic"],
        primaryVisualPolicy: "graphic_preferred",
        avoidFamilies: [],
      },
      searchKeywords: ["봄", "프로모션", "배너"],
      typographyHint: null,
      facets: {
        seasonality: "spring",
        menuType: null,
        promotionStyle: "general_campaign",
        offerSpecificity: "multi_item",
      },
    },
    expected: {
      domain: "general_marketing",
      goalSummary: "봄 프로모션 배너",
      templateKind: "promo_banner",
      campaignGoal: "promotion_awareness",
      searchKeywords: ["봄", "프로모션", "배너"],
      facets: {
        seasonality: "spring",
        menuType: null,
        promotionStyle: "general_campaign",
        offerSpecificity: "multi_item",
      },
      repairFields: [],
      consistencyFlagCodes: [],
    },
  },
];

async function runFixture(
  fixture: TooldiTaxonomyNormalizationFixture,
) {
  return buildNormalizedIntent(createHydratedPlanningInput(fixture.prompt), {
    templatePlanner: createPlanner(),
    plannerDraft: structuredClone(fixture.plannerDraft),
  });
}

function toStableArtifactJson(
  artifact: NormalizedIntent | IntentNormalizationReport,
): string {
  return JSON.stringify(
    JSON.parse(
      JSON.stringify(artifact, (key, value) => {
        if (key === "intentId") {
          return "intent-stable";
        }
        if (key === "reportId") {
          return "report-stable";
        }
        if (key === "runId") {
          return "run-stable";
        }
        if (key === "traceId") {
          return "trace-stable";
        }
        return value;
      }),
    ),
  );
}

function assertRepairFields(
  report: IntentNormalizationReport,
  expectedFields: string[],
  fixtureName: string,
) {
  const actualFields = new Set(report.appliedRepairs.map((repair) => repair.field));

  assert.equal(
    report.repairCount,
    expectedFields.length,
    `${fixtureName}: repair count should stay deterministic`,
  );

  for (const field of expectedFields) {
    assert.equal(
      actualFields.has(field),
      true,
      `${fixtureName}: expected repair field ${field}`,
    );
  }
}

test("실제 Tooldi taxonomy fixture는 정규화 보수와 artifact JSON을 반복 실행에도 안정적으로 유지한다", async () => {
  for (const fixture of REAL_TOOLDI_TAXONOMY_FIXTURES) {
    const first = await runFixture(fixture);
    const second = await runFixture(fixture);

    assert.equal(first.intent.domain, fixture.expected.domain, fixture.name);
    assert.equal(first.intent.goalSummary, fixture.expected.goalSummary, fixture.name);
    assert.equal(first.intent.templateKind, fixture.expected.templateKind, fixture.name);
    assert.equal(first.intent.campaignGoal, fixture.expected.campaignGoal, fixture.name);
    assert.deepEqual(first.intent.facets, fixture.expected.facets, fixture.name);
    assert.deepEqual(first.intent.searchKeywords, fixture.expected.searchKeywords, fixture.name);
    assertRepairFields(
      first.intentNormalizationReport,
      fixture.expected.repairFields,
      fixture.name,
    );
    assert.deepEqual(
      first.intentNormalizationReport.consistencyFlags.map((flag) => flag.code),
      fixture.expected.consistencyFlagCodes,
      fixture.name,
    );
    assert.equal(
      toStableArtifactJson(first.intent),
      toStableArtifactJson(second.intent),
      `${fixture.name}: normalized-intent.json should stay byte-stable after sanitizing runtime ids`,
    );
    assert.equal(
      toStableArtifactJson(first.intentNormalizationReport),
      toStableArtifactJson(second.intentNormalizationReport),
      `${fixture.name}: intent-normalization-report.json should stay byte-stable after sanitizing runtime ids`,
    );
  }
});

test("buildNormalizedIntent repairs fashion retail menu contradictions deterministically", async () => {
  const plannerDraft: TemplateIntentDraft = {
    goalSummary: "봄 브런치 메뉴 배너",
    templateKind: "promo_banner",
    domain: "fashion_retail",
    audience: "sale_shoppers",
    campaignGoal: "menu_discovery",
    layoutIntent: "hero_focused",
    tone: "bright_playful",
    assetPolicy: "photo_preferred_graphic_allowed",
    searchKeywords: ["봄", "브런치", "음료"],
    typographyHint: null,
    facets: {
      seasonality: null,
      menuType: "food_menu",
      promotionStyle: "seasonal_menu_launch",
      offerSpecificity: "single_product",
    },
  };

  const result = await buildNormalizedIntent(
    createHydratedPlanningInput("패션 리테일 봄 세일 배너 만들어줘"),
    {
      templatePlanner: createPlanner(),
      plannerDraft,
    },
  );

  assert.deepEqual(result.normalizedIntentDraft?.draft, plannerDraft);
  assert.equal(result.intent.domain, "fashion_retail");
  assert.equal(result.intent.goalSummary, "패션 리테일 봄 세일 배너 만들어줘");
  assert.equal(result.intent.facets.menuType, null);
  assert.equal(result.intent.facets.promotionStyle, "sale_campaign");
  assert.equal(result.intent.campaignGoal, "sale_conversion");
  assert.deepEqual(result.intent.searchKeywords, [
    "봄",
    "패션",
    "세일",
    "리테일",
    "배너",
  ]);
  assert.equal(result.intent.searchKeywords.includes("메뉴"), false);
  assert.equal(result.intent.consistencyFlags.length >= 2, true);
  assert.equal(
    result.intent.consistencyFlags.some(
      (flag) => flag.code === "fashion_menu_photo_contradiction",
    ),
    true,
  );
  assert.equal(
    result.intent.consistencyFlags.some(
      (flag) => flag.code === "menu_type_domain_conflict",
    ),
    true,
  );
  assert.equal(
    result.intent.consistencyFlags.some(
      (flag) => flag.code === "search_keyword_subject_drift",
    ),
    true,
  );
  assert.equal(result.intentNormalizationReport.repairCount >= 4, true);
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.field === "facets.menuType",
    ),
    true,
  );
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.field === "searchKeywords",
    ),
    true,
  );
  assert.deepEqual(
    result.intent.consistencyFlags.find(
      (flag) => flag.code === "fashion_menu_photo_contradiction",
    )?.fields,
    [
      "domain",
      "facets.menuType",
      "searchKeywords",
      "goalSummary",
      "campaignGoal",
      "facets.promotionStyle",
    ],
  );
  assert.equal(
    result.intentNormalizationReport.normalizationNotes.some((note) =>
      note.includes("classified as a contradiction before repair"),
    ),
    true,
  );
  assert.deepEqual(
    result.intentNormalizationReport.consistencyFlags,
    result.intent.consistencyFlags,
  );
  assert.deepEqual(
    result.intentNormalizationReport.normalizationNotes,
    result.intent.normalizationNotes,
  );
});

test("buildNormalizedIntent backfills seasonal menu semantics from cafe prompt signals", async () => {
  const plannerDraft: TemplateIntentDraft = {
    goalSummary: "카페 배너",
    templateKind: "promo_banner",
    domain: "cafe",
    audience: "local_visitors",
    campaignGoal: "promotion_awareness",
    layoutIntent: "copy_focused",
    tone: "bright_playful",
    assetPolicy: "photo_preferred_graphic_allowed",
    searchKeywords: ["카페"],
    typographyHint: null,
    facets: {
      seasonality: null,
      menuType: null,
      promotionStyle: "general_campaign",
      offerSpecificity: "multi_item",
    },
  };

  const result = await buildNormalizedIntent(
    createHydratedPlanningInput("카페 봄 신메뉴 음료 배너 만들어줘"),
    {
      templatePlanner: createPlanner(),
      plannerDraft,
    },
  );

  assert.equal(result.intent.domain, "cafe");
  assert.equal(result.intent.facets.seasonality, "spring");
  assert.equal(result.intent.facets.menuType, "drink_menu");
  assert.equal(result.intent.facets.promotionStyle, "seasonal_menu_launch");
  assert.equal(result.intent.campaignGoal, "menu_discovery");
  assert.deepEqual(result.intent.searchKeywords, [
    "카페",
    "봄",
    "음료",
    "신메뉴",
    "배너",
  ]);
  assert.deepEqual(result.intent.consistencyFlags, []);
  assert.deepEqual(result.intentNormalizationReport.consistencyFlags, []);
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.field === "facets.seasonality",
    ),
    true,
  );
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.field === "facets.menuType",
    ),
    true,
  );
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.field === "searchKeywords",
    ),
    true,
  );
  assert.equal(
    result.intentNormalizationReport.normalizationNotes.some((note) =>
      /contradiction/i.test(note),
    ),
    false,
  );
});

test("buildNormalizedIntent repairs generic planner drift into restaurant menu semantics deterministically", async () => {
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

  const result = await buildNormalizedIntent(
    createHydratedPlanningInput("식당 봄 신메뉴 배너 만들어줘"),
    {
      templatePlanner: createPlanner(),
      plannerDraft,
    },
  );

  assert.deepEqual(result.normalizedIntentDraft?.draft, plannerDraft);
  assert.equal(result.intent.domain, "restaurant");
  assert.equal(result.intent.audience, "walk_in_customers");
  assert.equal(result.intent.templateKind, "promo_banner");
  assert.equal(result.intent.campaignGoal, "menu_discovery");
  assert.equal(result.intent.facets.seasonality, "spring");
  assert.equal(result.intent.facets.menuType, "food_menu");
  assert.equal(result.intent.facets.promotionStyle, "seasonal_menu_launch");
  assert.equal(result.intent.facets.offerSpecificity, "single_product");
  assert.deepEqual(result.intent.searchKeywords, [
    "식당",
    "봄",
    "메뉴",
    "신메뉴",
    "배너",
  ]);
  assert.equal(
    result.intent.consistencyFlags.some(
      (flag) => flag.code === "prompt_domain_signal_mismatch",
    ),
    true,
  );
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.field === "domain",
    ),
    true,
  );
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.field === "audience",
    ),
    true,
  );
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.field === "facets.menuType",
    ),
    true,
  );
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.field === "facets.promotionStyle",
    ),
    true,
  );
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.field === "campaignGoal",
    ),
    true,
  );
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.field === "searchKeywords",
    ),
    true,
  );
});

test("buildNormalizedIntent keeps general marketing spring promotion scenarios contradiction-free", async () => {
  const plannerDraft: TemplateIntentDraft = {
    goalSummary: "봄 프로모션 배너",
    templateKind: "promo_banner",
    domain: "general_marketing",
    audience: "general_consumers",
    campaignGoal: "promotion_awareness",
    layoutIntent: "copy_focused",
    tone: "bright_playful",
    assetPolicy: {
      allowedFamilies: ["graphic", "photo"],
      preferredFamilies: ["graphic"],
      primaryVisualPolicy: "graphic_preferred",
      avoidFamilies: [],
    },
    searchKeywords: ["봄", "프로모션", "배너"],
    typographyHint: null,
    facets: {
      seasonality: "spring",
      menuType: null,
      promotionStyle: "general_campaign",
      offerSpecificity: "multi_item",
    },
  };

  const result = await buildNormalizedIntent(
    createHydratedPlanningInput("봄 프로모션 배너"),
    {
      templatePlanner: createPlanner(),
      plannerDraft,
    },
  );

  assert.deepEqual(result.normalizedIntentDraft?.draft, plannerDraft);
  assert.equal(result.intent.domain, "general_marketing");
  assert.equal(result.intent.audience, "general_consumers");
  assert.equal(result.intent.templateKind, "promo_banner");
  assert.equal(result.intent.campaignGoal, "promotion_awareness");
  assert.deepEqual(result.intent.facets, {
    seasonality: "spring",
    menuType: null,
    promotionStyle: "general_campaign",
    offerSpecificity: "multi_item",
  });
  assert.deepEqual(result.intent.searchKeywords, ["봄", "프로모션", "배너"]);
  assert.deepEqual(result.intent.consistencyFlags, []);
  assert.equal(result.intentNormalizationReport.repairCount, 0);
  assert.deepEqual(result.intentNormalizationReport.consistencyFlags, []);
  assert.equal(
    result.intentNormalizationReport.normalizationNotes.includes(
      "Planner draft matched deterministic normalization rules without requiring repair.",
    ),
    true,
  );
  assert.equal(
    result.intentNormalizationReport.normalizationNotes.some((note) =>
      /contradiction/i.test(note),
    ),
    false,
  );
});

test("buildNormalizedIntent repairs generic sale prompts into general-marketing graphic-first structure", async () => {
  const plannerDraft: TemplateIntentDraft = {
    goalSummary: "봄 시즌 맞이 패션 세일 배너",
    templateKind: "seasonal_sale_banner",
    domain: "fashion_retail",
    audience: "sale_shoppers",
    campaignGoal: "sale_conversion",
    layoutIntent: "hero_focused",
    tone: "bright_playful",
    assetPolicy: "photo_preferred_graphic_allowed",
    searchKeywords: ["봄", "세일", "이벤트", "할인"],
    typographyHint: "가독성이 높은 고딕",
    facets: {
      seasonality: "spring",
      menuType: null,
      promotionStyle: "sale_campaign",
      offerSpecificity: "broad_offer",
    },
  };

  const result = await buildNormalizedIntent(
    createHydratedPlanningInput("봄 세일 배너를 만들어줘"),
    {
      templatePlanner: createPlanner(),
      plannerDraft,
    },
  );

  assert.equal(result.intent.domain, "general_marketing");
  assert.equal(result.intent.goalSummary, "봄 세일 배너를 만들어줘");
  assert.equal(result.intent.facets.menuType, null);
  assert.deepEqual(result.intent.assetPolicy, {
    allowedFamilies: ["background", "graphic", "photo"],
    preferredFamilies: ["graphic"],
    primaryVisualPolicy: "graphic_preferred",
    avoidFamilies: [],
  });
  assert.equal(result.intent.searchKeywords.includes("메뉴"), false);
  assert.equal(result.intent.searchKeywords.includes("패션"), false);
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.reasonCode === "generic_promo_domain_repair",
    ),
    true,
  );
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.reasonCode === "generic_promo_graphic_first_repair",
    ),
    true,
  );
});

test("부분 자산 정책 초안도 정규 의도에서 실행 가능한 정책으로 보수한다", async () => {
  const plannerDraft: TemplateIntentDraft = {
    goalSummary: "카페 음료 배너",
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
  };

  const result = await buildNormalizedIntent(
    createHydratedPlanningInput("카페 봄 음료 프로모션 배너 만들어줘"),
    {
      templatePlanner: createPlanner(),
      plannerDraft,
    },
  );

  assert.deepEqual(result.normalizedIntentDraft?.draft, plannerDraft);
  assert.deepEqual(result.intent.assetPolicy, {
    allowedFamilies: ["background", "photo", "graphic"],
    preferredFamilies: ["photo", "graphic"],
    primaryVisualPolicy: "photo_preferred",
    avoidFamilies: [],
  });
  assert.equal(
    result.intentNormalizationReport.appliedRepairs.some(
      (repair) => repair.field === "assetPolicy",
    ),
    false,
  );
});

test("플래너 초안이 누락되면 휴리스틱 초안으로 정규화를 계속한다", async () => {
  const prompt = "카페 봄 음료 배너 만들어줘";
  const expectedFallbackDraft = await createHeuristicTemplatePlanner().plan({
    prompt,
    canvasPreset: "square_1080",
    palette: [],
  });
  const templatePlanner: TemplatePlanner = {
    mode: "langchain",
    async plan() {
      return undefined as unknown as TemplateIntentDraft;
    },
  };

  const result = await buildNormalizedIntent(createHydratedPlanningInput(prompt), {
    templatePlanner,
  });

  assert.equal(result.intent.plannerMode, "heuristic");
  assert.equal(result.normalizedIntentDraft?.plannerMode, "heuristic");
  assert.deepEqual(result.normalizedIntentDraft?.draft, expectedFallbackDraft);
  assert.equal(result.intentNormalizationReport.draftAvailable, true);
  assert.equal(result.intent.domain, "cafe");
  assert.equal(result.intent.facets.menuType, "drink_menu");
});

test("planner draft 없이도 정규화 리포트가 의도와 같은 플래그와 노트를 남긴다", async () => {
  const result = await buildNormalizedIntent(
    createHydratedPlanningInput("봄 세일 배너 만들어줘"),
    {
      plannerDraft: null,
    },
  );

  assert.equal(result.intentNormalizationReport.draftAvailable, false);
  assert.deepEqual(
    result.intentNormalizationReport.consistencyFlags,
    result.intent.consistencyFlags,
  );
  assert.deepEqual(
    result.intentNormalizationReport.normalizationNotes,
    result.intent.normalizationNotes,
  );
});
