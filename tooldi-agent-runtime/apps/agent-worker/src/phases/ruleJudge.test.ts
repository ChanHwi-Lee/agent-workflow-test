import assert from "node:assert/strict";
import test from "node:test";

import type { ExecutablePlan, TemplatePriorSummary } from "@tooldi/agent-contracts";
import { normalizeTemplateAssetPolicy } from "@tooldi/agent-llm";

import type {
  NormalizedIntent,
  RuleJudgeIssue,
  RuleJudgeVerdict,
  SearchProfileArtifact,
  SelectionDecision,
  SourceSearchSummary,
  TypographyDecision,
} from "../types.js";
import { buildSearchProfile } from "./buildSearchProfile.js";
import {
  RULE_JUDGE_ISSUE_DEFINITIONS,
  ruleJudgeCreateTemplate,
  surfaceRuleJudgeIssue,
} from "./ruleJudge.js";
import { createFashionRetailNormalizedIntent } from "../testFixtures/tooldiTaxonomyFixtures.js";
import {
  cafeCoffeeThemeDriftFixture,
  coherentFashionRetailPictureFixture,
  graphicOnlyPicturePolicyConflictFixture,
  graphicOnlyRuleJudgeAssetPolicy,
  restaurantMenuPictureDriftFixture,
  restaurantMenuTemplatePriorFixture,
  ruleJudgeHardeningMismatchCodes,
} from "../testFixtures/ruleJudgeRegressionFixtures.js";

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

function createSelectionDecision(
  overrides: Partial<SelectionDecision> = {},
): SelectionDecision {
  return {
    decisionId: "decision-1",
    runId: "run-1",
    traceId: "trace-1",
    retrievalMode: "none",
    compareCriteria: [
      "seasonalFit",
      "readabilitySupport",
      "ctaVisibilitySupport",
      "layoutCompatibility",
      "executionSimplicity",
      "fallbackSafety",
      "focalSafety",
      "cropSafety",
      "copySeparationSupport",
    ],
    selectedBackgroundCandidateId: "bg-1",
    selectedLayoutCandidateId: "layout_copy_left_with_right_decoration",
    selectedDecorationCandidateId: "graphic-1",
    topPhotoCandidateId: "photo-1",
    selectedBackgroundAssetId: "background:1",
    selectedBackgroundSerial: "1",
    selectedBackgroundCategory: "pattern",
    selectedDecorationAssetId: "graphic:1",
    selectedDecorationSerial: "2",
    selectedDecorationCategory: "illust",
    topPhotoAssetId: "photo:1",
    topPhotoSerial: "3",
    topPhotoCategory: "landscape",
    topPhotoUid: "uid-1",
    topPhotoUrl: "https://example.com/photo.png",
    topPhotoWidth: 1200,
    topPhotoHeight: 800,
    topPhotoOrientation: "landscape",
    backgroundMode: "spring_pattern",
    layoutMode: "copy_left_with_right_decoration",
    decorationMode: "graphic_cluster",
    photoBranchMode: "graphic_preferred",
    photoBranchReason: "graphic branch preferred",
    executionStrategy: "graphic_first_shape_text_group",
    summary: "graphic path selected",
    fallbackSummary: "graphic fallback",
    ...overrides,
  };
}

function createTypographyDecision(
  overrides: Partial<TypographyDecision> = {},
): TypographyDecision {
  return {
    decisionId: "type-1",
    runId: "run-1",
    traceId: "trace-1",
    sourceMode: "tooldi_api",
    inventoryCount: 10,
    fallbackUsed: false,
    display: {
      fontAssetId: "font:1",
      fontSerial: "701",
      fontName: "Pretendard",
      fontCategory: "고딕",
      fontFace: "Regular",
      fontToken: "701_700",
      fontWeight: 700,
    },
    body: {
      fontAssetId: "font:1",
      fontSerial: "701",
      fontName: "Pretendard",
      fontCategory: "고딕",
      fontFace: "Regular",
      fontToken: "701_400",
      fontWeight: 400,
    },
    summary: "fonts selected",
    ...overrides,
  };
}

function createSourceSearchSummary(
  overrides: Partial<SourceSearchSummary> = {},
): SourceSearchSummary {
  return {
    summaryId: "summary-1",
    runId: "run-1",
    traceId: "trace-1",
    sourceMode: "tooldi_api",
    background: {
      family: "background",
      queryAttempts: [],
      returnedCount: 4,
      filteredCount: 4,
      fallbackUsed: false,
      selectedAssetId: "background:1",
      selectedSerial: "1",
      selectedCategory: "pattern",
    },
    graphic: {
      family: "graphic",
      queryAttempts: [],
      returnedCount: 4,
      filteredCount: 4,
      fallbackUsed: false,
      selectedAssetId: "graphic:1",
      selectedSerial: "2",
      selectedCategory: "illust",
    },
    photo: {
      family: "photo",
      queryAttempts: [],
      returnedCount: 0,
      filteredCount: 0,
      fallbackUsed: true,
      selectedAssetId: null,
      selectedSerial: null,
      selectedCategory: null,
    },
    font: {
      family: "font",
      queryAttempts: [],
      returnedCount: 1,
      filteredCount: 1,
      fallbackUsed: false,
      selectedAssetId: "font:1",
      selectedSerial: "701",
      selectedCategory: "고딕",
    },
    ...overrides,
  };
}

function createPlan(overrides: Partial<ExecutablePlan> = {}): ExecutablePlan {
  return {
    planId: "plan-1",
    planVersion: 1,
    planSchemaVersion: "v1-stub",
    runId: "run-1",
    traceId: "trace-1",
    attemptSeq: 1,
    intent: {
      operationFamily: "create_template",
      artifactType: "LiveDraftArtifactBundle",
    },
    constraintsRef: "constraints-1",
    actions: [
      {
        actionId: "a-foundation",
        kind: "canvas_mutation",
        operation: "prepare_background_and_foundation",
        toolName: "background-catalog",
        toolVersion: "1",
        commitGroup: "group-1",
        liveCommit: true,
        idempotencyKey: "id-1",
        dependsOn: [],
        targetRef: {
          documentId: "doc",
          pageId: "page",
          layerId: null,
          slotKey: "background",
        },
        inputs: {},
        rollback: {
          strategy: "delete_created_layers",
        },
      },
      {
        actionId: "a-copy",
        kind: "canvas_mutation",
        operation: "place_copy_cluster",
        toolName: "layout-selector",
        toolVersion: "1",
        commitGroup: "group-1",
        liveCommit: true,
        idempotencyKey: "id-2",
        dependsOn: ["a-foundation"],
        targetRef: {
          documentId: "doc",
          pageId: "page",
          layerId: null,
          slotKey: "headline",
        },
        inputs: {},
        rollback: {
          strategy: "delete_created_layers",
        },
      },
    ],
    ...overrides,
  };
}

function createTemplatePriorSummary(): TemplatePriorSummary {
  return {
    summaryId: "prior-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    templatePriorCandidates: [
      {
        rank: 1,
        sourceSignal: "seasonality:spring",
        keyword: "봄 세일",
        categorySerial: "0006",
        status: "supportive_only",
        competitiveness: "supportive_only",
        selected: true,
        rationale: "seasonality-driven template prior",
        evidenceRefs: ["template-prior-summary.json"],
        contextRefs: ["CURRENT_RULE_JUDGE"],
      },
    ],
    selectedTemplatePrior: {
      status: "supportive_only",
      competitiveness: "supportive_only",
      summary: "neutral seasonal sale template prior",
      keyword: "봄 세일",
      categorySerial: "0006",
      querySurface: "template.keyword",
      evidenceRefs: ["template-prior-summary.json"],
      contextRefs: ["CURRENT_RULE_JUDGE"],
    },
    selectedContentsThemePrior: {
      template: {
        family: "template",
        status: "unavailable",
        serial: null,
        summary: "no template contents_theme prior",
        evidenceRefs: ["template-prior-summary.json"],
        contextRefs: ["CURRENT_RULE_JUDGE"],
      },
      shape: {
        family: "shape",
        status: "unavailable",
        serial: null,
        summary: "no shape contents_theme prior",
        evidenceRefs: ["template-prior-summary.json"],
        contextRefs: ["CURRENT_RULE_JUDGE"],
      },
      picture: {
        family: "picture",
        status: "unavailable",
        serial: null,
        summary: "no picture contents_theme prior",
        evidenceRefs: ["template-prior-summary.json"],
        contextRefs: ["CURRENT_RULE_JUDGE"],
      },
    },
    dominantThemePrior: "none",
    contentsThemePriorMatches: [],
    keywordThemeMatches: [],
    familyCoverage: {
      template: true,
      shape: true,
      picture: true,
    },
    rankingBiases: [],
    rankingRationaleEntries: [
      {
        order: 1,
        signal: "template_prior_candidate_order",
        outcome: "template prior stayed supportive",
        rationale: "rule-judge fixture rationale",
        evidenceRefs: ["template-prior-summary.json"],
        contextRefs: ["CURRENT_RULE_JUDGE"],
      },
    ],
    summary: "neutral prior summary",
  };
}

type HardeningMismatchCode = (typeof ruleJudgeHardeningMismatchCodes)[number];
interface PhotoLaneRegressionFixture {
  querySurface: {
    keyword: string;
    theme: string | null;
    type: "pic";
    format: "horizontal";
  };
  selectedCategory: string;
  selectionSummary: string;
  photoBranchReason: string;
  fallbackSummary: string;
}

function assertRuleJudgeIssueShape(issue: RuleJudgeIssue): void {
  assert.deepEqual(Object.keys(issue), [
    "code",
    "category",
    "severity",
    "message",
    "suggestedAction",
    "metadata",
  ]);
  assert.equal(typeof issue.code, "string");
  assert.equal(typeof issue.category, "string");
  assert.equal(typeof issue.severity, "string");
  assert.equal(typeof issue.message, "string");
  assert.equal(
    issue.suggestedAction === null || typeof issue.suggestedAction === "string",
    true,
  );
  assert.ok(issue.metadata);

  const metadataKeys = Object.keys(issue.metadata ?? {}).sort();
  const expectedMetadataKeys = [
    "recommendationImpact",
    "repairAttempted",
    "repairOutcome",
    "ruleScope",
    ...(issue.metadata?.contextRefs ? ["contextRefs"] : []),
    ...(issue.metadata?.evidenceRefs ? ["evidenceRefs"] : []),
    ...(issue.metadata?.legacyAliases ? ["legacyAliases"] : []),
  ].sort();

  assert.deepEqual(metadataKeys, expectedMetadataKeys);
  assert.equal(typeof issue.metadata?.ruleScope, "string");
  assert.equal(typeof issue.metadata?.recommendationImpact, "string");
  assert.equal(
    issue.metadata?.repairOutcome === "not_attempted" ||
      issue.metadata?.repairOutcome === "repaired" ||
      issue.metadata?.repairOutcome === "warning_only" ||
      issue.metadata?.repairOutcome === "irrecoverable",
    true,
  );
  assert.equal(typeof issue.metadata?.repairAttempted, "boolean");
}

function assertRuleJudgeVerdictShape(verdict: RuleJudgeVerdict): void {
  assert.deepEqual(Object.keys(verdict), [
    "verdictId",
    "runId",
    "traceId",
    "recommendation",
    "confidence",
    "issues",
    "summary",
  ]);
  assert.equal(typeof verdict.verdictId, "string");
  assert.equal(typeof verdict.runId, "string");
  assert.equal(typeof verdict.traceId, "string");
  assert.equal(
    verdict.recommendation === "keep" ||
      verdict.recommendation === "refine" ||
      verdict.recommendation === "refuse",
    true,
  );
  assert.equal(
    verdict.confidence === "high" ||
      verdict.confidence === "medium" ||
      verdict.confidence === "low",
    true,
  );
  assert.equal(Array.isArray(verdict.issues), true);
  assert.equal(typeof verdict.summary, "string");

  for (const issue of verdict.issues) {
    assertRuleJudgeIssueShape(issue);
  }
}

function createGraphicSelectionDecision(
  overrides: Partial<SelectionDecision> = {},
): SelectionDecision {
  return createSelectionDecision({
    layoutMode: "badge_led",
    selectedLayoutCandidateId: "layout_badge_led",
    decorationMode: "ribbon_badge",
    photoBranchMode: "graphic_preferred",
    photoBranchReason: "graphic-first Tooldi shape lane stayed coherent",
    executionStrategy: "graphic_first_shape_text_group",
    summary: "패션 세일 graphic path selected",
    fallbackSummary: "패션 세일 fallback",
    topPhotoCandidateId: null,
    topPhotoAssetId: null,
    topPhotoSerial: null,
    topPhotoCategory: null,
    topPhotoUid: null,
    topPhotoUrl: null,
    topPhotoWidth: null,
    topPhotoHeight: null,
    topPhotoOrientation: null,
    ...overrides,
  });
}

function createPhotoSelectionDecision(
  fixture: PhotoLaneRegressionFixture,
  overrides: Partial<SelectionDecision> = {},
): SelectionDecision {
  return createSelectionDecision({
    layoutMode: "copy_left_with_right_photo",
    selectedLayoutCandidateId: "layout_copy_left_with_right_photo",
    photoBranchMode: "photo_selected",
    photoBranchReason: fixture.photoBranchReason,
    executionStrategy: "photo_hero_shape_text_group",
    summary: fixture.selectionSummary,
    fallbackSummary: fixture.fallbackSummary,
    topPhotoCategory: fixture.selectedCategory,
    ...overrides,
  });
}

function createPhotoSourceSearchSummary(
  fixture: PhotoLaneRegressionFixture,
  overrides: Partial<SourceSearchSummary> = {},
): SourceSearchSummary {
  return createSourceSearchSummary({
    photo: {
      family: "photo",
      queryAttempts: [
        {
          label: fixture.querySurface.theme
            ? "photo_primary_theme"
            : "photo_primary_keyword",
          query: {
            keyword: fixture.querySurface.keyword,
            theme: fixture.querySurface.theme,
            type: fixture.querySurface.type,
            format: fixture.querySurface.format,
          },
          returnedCount: 2,
        },
      ],
      returnedCount: 2,
      filteredCount: 2,
      fallbackUsed: false,
      selectedAssetId: "photo:fixture-1",
      selectedSerial: "31",
      selectedCategory: fixture.selectedCategory,
    },
    ...overrides,
  });
}

interface RunPhotoRuleJudgeOptions {
  intentOverrides?: Partial<NormalizedIntent>;
  fixture?: PhotoLaneRegressionFixture;
  selectionOverrides?: Partial<SelectionDecision>;
  sourceSearchSummaryOverrides?: Partial<SourceSearchSummary>;
  mutateSearchProfile?: (searchProfile: SearchProfileArtifact) => void;
  templatePriorSummary?: TemplatePriorSummary | null;
}

interface RunGraphicRuleJudgeOptions {
  intentOverrides?: Partial<NormalizedIntent>;
  selectionOverrides?: Partial<SelectionDecision>;
  sourceSearchSummaryOverrides?: Partial<SourceSearchSummary>;
  mutateSearchProfile?: (searchProfile: SearchProfileArtifact) => void;
  templatePriorSummary?: TemplatePriorSummary | null;
}

async function runFashionRetailPhotoRuleJudge(
  options: RunPhotoRuleJudgeOptions = {},
): Promise<RuleJudgeVerdict> {
  const intent = createFashionRetailNormalizedIntent({
    layoutIntent: "hero_focused",
    ...options.intentOverrides,
  });
  const searchProfile = await buildSearchProfile(intent);
  options.mutateSearchProfile?.(searchProfile);

  return ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createPhotoSelectionDecision(
      options.fixture ?? coherentFashionRetailPictureFixture,
      options.selectionOverrides,
    ),
    createTypographyDecision(),
    createPhotoSourceSearchSummary(
      options.fixture ?? coherentFashionRetailPictureFixture,
      options.sourceSearchSummaryOverrides,
    ),
    createPlan(),
    options.templatePriorSummary ?? null,
  );
}

async function runFashionRetailGraphicRuleJudge(
  options: RunGraphicRuleJudgeOptions = {},
): Promise<RuleJudgeVerdict> {
  const intent = createFashionRetailNormalizedIntent(options.intentOverrides);
  const searchProfile = await buildSearchProfile(intent);
  options.mutateSearchProfile?.(searchProfile);

  return ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createGraphicSelectionDecision(options.selectionOverrides),
    createTypographyDecision(),
    createSourceSearchSummary({
      photo: {
        family: "photo",
        queryAttempts: [],
        returnedCount: 2,
        filteredCount: 2,
        fallbackUsed: false,
        selectedAssetId: "photo:1",
        selectedSerial: "3",
        selectedCategory: "landscape",
      },
      ...options.sourceSearchSummaryOverrides,
    }),
    createPlan(),
    options.templatePriorSummary ?? null,
  );
}

test("ruleJudgeCreateTemplate recommends refine when photo preference and typography fallback are weak", async () => {
  const intent = createIntent();
  const searchProfile = await buildSearchProfile(intent);
  const verdict = await ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createSelectionDecision(),
    createTypographyDecision({ fallbackUsed: true }),
    createSourceSearchSummary(),
    createPlan(),
  );

  assert.equal(verdict.recommendation, "refine");
  assert.equal(
    verdict.issues.some((issue) => issue.code === "photo_preference_unmet"),
    true,
  );
  assert.equal(
    verdict.issues.some((issue) => issue.code === "typography_fallback"),
    true,
  );
});

test("ruleJudgeCreateTemplate refuses invalid photo execution contracts", async () => {
  const intent = createIntent();
  const searchProfile: SearchProfileArtifact = await buildSearchProfile(intent);
  const verdict = await ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createSelectionDecision({
      layoutMode: "copy_left_with_right_photo",
      selectedLayoutCandidateId: "layout_copy_left_with_right_photo",
      photoBranchMode: "photo_selected",
      executionStrategy: "photo_hero_shape_text_group",
      topPhotoUrl: null,
    }),
    createTypographyDecision(),
    createSourceSearchSummary({
      photo: {
        family: "photo",
        queryAttempts: [],
        returnedCount: 2,
        filteredCount: 2,
        fallbackUsed: false,
        selectedAssetId: "photo:1",
        selectedSerial: "3",
        selectedCategory: "landscape",
      },
    }),
    createPlan(),
  );

  assert.equal(verdict.recommendation, "refuse");
  assert.equal(
    verdict.issues.some((issue) => issue.severity === "error"),
    true,
  );
});

test("ruleJudgeCreateTemplate still evaluates legacy asset policy callers against the structured policy checks", async () => {
  const intent = createIntent({
    assetPolicy:
      "photo_preferred_graphic_allowed" as unknown as NormalizedIntent["assetPolicy"],
  });
  const searchProfile = await buildSearchProfile(intent);
  const verdict = await ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createSelectionDecision({
      photoBranchMode: "graphic_preferred",
    }),
    createTypographyDecision(),
    createSourceSearchSummary({
      photo: {
        family: "photo",
        queryAttempts: [],
        returnedCount: 2,
        filteredCount: 2,
        fallbackUsed: false,
        selectedAssetId: "photo:1",
        selectedSerial: "3",
        selectedCategory: "landscape",
      },
    }),
    createPlan(),
  );

  assert.equal(
    verdict.issues.some((issue) => issue.code === "photo_preference_unmet"),
    true,
  );
});

test("surfaceRuleJudgeIssue maps new semantic drift findings to stable surfaced output", () => {
  const issue = surfaceRuleJudgeIssue("domain_subject_mismatch");

  assert.deepEqual(issue, {
    code: "domain_subject_mismatch",
    category: "semantic_domain_alignment",
    severity: "warn",
    message:
      "Repaired domain meaning does not match the subject carried by retrieval or the selected primary visual",
    suggestedAction:
      "Re-rank domain-bearing family evidence and demote wrong-domain subject signals before selection",
    metadata: {
      ruleScope: "semantic_domain_alignment",
      recommendationImpact: "refine",
      repairAttempted: false,
      repairOutcome: "not_attempted",
    },
  });
});

test("surfaceRuleJudgeIssue carries severity-aware metadata for primary visual drift", () => {
  const issue = surfaceRuleJudgeIssue("primary_visual_drift", {
    severity: "error",
    metadata: {
      evidenceRefs: ["selection-decision.json", "template-prior-summary.json"],
      contextRefs: ["TOBE_RELEASE_GATE", "CURRENT_RULE_JUDGE"],
      repairAttempted: true,
      repairOutcome: "irrecoverable",
    },
  });

  assert.equal(issue.code, "primary_visual_drift");
  assert.equal(issue.severity, "error");
  assert.equal(issue.metadata?.recommendationImpact, "refuse");
  assert.deepEqual(issue.metadata?.legacyAliases, ["primary_signal_drift"]);
  assert.deepEqual(issue.metadata?.evidenceRefs, [
    "selection-decision.json",
    "template-prior-summary.json",
  ]);
  assert.deepEqual(issue.metadata?.contextRefs, [
    "TOBE_RELEASE_GATE",
    "CURRENT_RULE_JUDGE",
  ]);
  assert.equal(issue.metadata?.repairAttempted, true);
  assert.equal(issue.metadata?.repairOutcome, "irrecoverable");
});

test("rule judge finding catalog covers every new mismatch class in the hardening slice", () => {
  const newMismatchCodes = [
    "domain_subject_mismatch",
    "theme_domain_mismatch",
    "search_profile_intent_mismatch",
    "asset_policy_conflict",
    "template_prior_conflict",
    "primary_visual_drift",
    "photo_subject_drift",
  ] as const;

  for (const code of newMismatchCodes) {
    const definition = RULE_JUDGE_ISSUE_DEFINITIONS[code];

    assert.ok(definition);
    assert.ok(definition.message.length > 0);
    assert.equal(definition.defaultSeverity, "warn");
    assert.ok(definition.metadata?.ruleScope);
  }
});

test("ruleJudgeCreateTemplate keeps fashion retail graphic-first outcomes when selected signals stay domain-coherent", async () => {
  const intent = createFashionRetailNormalizedIntent();
  const searchProfile = await buildSearchProfile(intent);
  const verdict = await ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createSelectionDecision({
      layoutMode: "badge_led",
      selectedLayoutCandidateId: "layout_badge_led",
      decorationMode: "ribbon_badge",
      summary: "패션 세일 graphic path selected",
      fallbackSummary: "패션 세일 fallback",
    }),
    createTypographyDecision(),
    createSourceSearchSummary({
      photo: {
        family: "photo",
        queryAttempts: [],
        returnedCount: 2,
        filteredCount: 2,
        fallbackUsed: false,
        selectedAssetId: "photo:1",
        selectedSerial: "3",
        selectedCategory: "landscape",
      },
    }),
    createPlan(),
  );

  assert.equal(verdict.recommendation, "keep");
  assert.equal(
    verdict.issues.some((issue) => issue.code === "domain_subject_mismatch"),
    false,
  );
  assert.equal(
    verdict.issues.some((issue) => issue.code === "theme_domain_mismatch"),
    false,
  );
  assert.equal(
    verdict.issues.some(
      (issue) => issue.code === "search_profile_intent_mismatch",
    ),
    false,
  );
  assert.equal(
    verdict.issues.some((issue) => issue.code === "primary_visual_drift"),
    false,
  );
});

test("ruleJudgeCreateTemplate does not keep fashion retail intents when real Tooldi menu taxonomy survives into the photo lane", async () => {
  const intent = createFashionRetailNormalizedIntent({
    assetPolicy: normalizeTemplateAssetPolicy(
      "photo_preferred_graphic_allowed",
    ),
    campaignGoal: "menu_discovery",
    searchKeywords: ["봄", "브런치", "메뉴", "세일"],
    facets: {
      seasonality: "spring",
      menuType: "food_menu",
      promotionStyle: "seasonal_menu_launch",
      offerSpecificity: "multi_item",
    },
  });
  const searchProfile = await buildSearchProfile(intent);

  assert.equal(searchProfile.domain, "fashion_retail");
  assert.equal(searchProfile.facets.menuType, "food_menu");
  assert.equal(searchProfile.photo.queries[0]?.keyword, "패션");
  assert.equal(searchProfile.photo.queries[0]?.type, "pic");
  assert.equal(searchProfile.photo.queries[0]?.format, "horizontal");
  assert.match(
    searchProfile.photo.rationale,
    /Retail\/menu contradiction was repaired/i,
  );

  const verdict = await ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createSelectionDecision({
      layoutMode: "badge_led",
      selectedLayoutCandidateId: "layout_badge_led",
      photoBranchMode: "photo_selected",
      photoBranchReason: "photo hero kept the contradiction alive",
      executionStrategy: "photo_hero_shape_text_group",
      summary: "브런치 메뉴 photo hero selected",
      fallbackSummary: "menu-driven photo lane retained",
    }),
    createTypographyDecision(),
    createSourceSearchSummary({
      photo: {
        family: "photo",
        queryAttempts: [
          {
            label: "photo_primary_keyword",
            query: {
              keyword: "브런치",
              theme: null,
              type: "pic",
              format: "horizontal",
            },
            returnedCount: 3,
          },
        ],
        returnedCount: 3,
        filteredCount: 3,
        fallbackUsed: false,
        selectedAssetId: "photo:menu-1",
        selectedSerial: "31",
        selectedCategory: "food",
      },
    }),
    createPlan(),
  );

  assert.notEqual(verdict.recommendation, "keep");
  assert.equal(
    verdict.issues.some(
      (issue) =>
        issue.code === "search_profile_intent_mismatch" ||
        issue.code === "domain_subject_mismatch" ||
        issue.code === "primary_visual_drift",
    ),
    true,
  );
});

test("ruleJudgeCreateTemplate reports search_profile_intent_mismatch when the selected photo lane query surface drifts from fashion intent to restaurant menu signals", async () => {
  const intent = createFashionRetailNormalizedIntent();
  const searchProfile = await buildSearchProfile(intent);
  assert.ok(searchProfile.photo.queries[0]);
  searchProfile.photo.queries[0].keyword = "브런치 메뉴";

  const verdict = await ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createSelectionDecision({
      layoutMode: "copy_left_with_right_photo",
      selectedLayoutCandidateId: "layout_copy_left_with_right_photo",
      photoBranchMode: "photo_selected",
      photoBranchReason: "photo hero won on safe crop fit",
      executionStrategy: "photo_hero_shape_text_group",
      summary: "photo hero selected",
      fallbackSummary: "photo lane retained",
    }),
    createTypographyDecision(),
    createSourceSearchSummary({
      photo: {
        family: "photo",
        queryAttempts: [],
        returnedCount: 2,
        filteredCount: 2,
        fallbackUsed: false,
        selectedAssetId: "photo:1",
        selectedSerial: "3",
        selectedCategory: "landscape",
      },
    }),
    createPlan(),
  );

  const mismatch = verdict.issues.find(
    (issue) => issue.code === "search_profile_intent_mismatch",
  );

  assert.equal(verdict.recommendation, "refine");
  assert.ok(mismatch);
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("normalized-intent.json"),
    true,
  );
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("search-profile.json"),
    true,
  );
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("selection-decision.json"),
    true,
  );
  assert.equal(
    verdict.issues.some((issue) => issue.code === "primary_visual_drift"),
    false,
  );
});

test("ruleJudgeCreateTemplate reports search_profile_intent_mismatch when weak retail-vs-menu drift survives into the serialized query contract", async () => {
  const intent = createFashionRetailNormalizedIntent({
    consistencyFlags: [
      {
        code: "fashion_menu_photo_contradiction",
        severity: "warning",
        message: "fashion_retail cannot keep menu-driven photo semantics",
        fields: ["domain", "facets.menuType", "searchKeywords"],
      },
    ],
  });
  const searchProfile = await buildSearchProfile(intent);
  searchProfile.campaignGoal = "menu_discovery";
  searchProfile.facets.menuType = "food_menu";
  searchProfile.facets.promotionStyle = "seasonal_menu_launch";
  searchProfile.searchKeywords = ["봄", "메뉴", "세일"];
  if (searchProfile.graphic.queries[0]) {
    searchProfile.graphic.queries[0].keyword = "신메뉴";
  }
  if (searchProfile.graphic.queries[1]) {
    searchProfile.graphic.queries[1].keyword = "메뉴";
  }
  if (searchProfile.photo.queries[0]) {
    searchProfile.photo.queries[0].keyword = "메뉴";
  }

  const verdict = await ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createSelectionDecision({
      layoutMode: "badge_led",
      selectedLayoutCandidateId: "layout_badge_led",
      summary: "graphic path selected",
      fallbackSummary: "graphic branch retained",
    }),
    createTypographyDecision(),
    createSourceSearchSummary({
      photo: {
        family: "photo",
        queryAttempts: [],
        returnedCount: 1,
        filteredCount: 1,
        fallbackUsed: false,
        selectedAssetId: "photo:retail-1",
        selectedSerial: "81",
        selectedCategory: "lookbook",
      },
    }),
    createPlan(),
  );

  const mismatch = verdict.issues.find(
    (issue) => issue.code === "search_profile_intent_mismatch",
  );

  assert.equal(verdict.recommendation, "refine");
  assert.ok(mismatch);
  assert.match(
    mismatch?.message ?? "",
    /fashion_retail\/menu contradiction survived repair/i,
  );
  assert.equal(mismatch?.metadata?.repairAttempted, true);
  assert.equal(mismatch?.metadata?.repairOutcome, "warning_only");
});

test("ruleJudgeCreateTemplate reports asset_policy_conflict when a disallowed picture lane still drives candidate selection", async () => {
  const intent = createFashionRetailNormalizedIntent({
    assetPolicy: {
      allowedFamilies: ["graphic"],
      preferredFamilies: ["graphic"],
      primaryVisualPolicy: "graphic_preferred",
      avoidFamilies: ["photo"],
    },
  });
  const searchProfile = await buildSearchProfile(intent);

  assert.equal(searchProfile.photo.enabled, false);

  const verdict = await ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createSelectionDecision({
      layoutMode: "copy_left_with_right_photo",
      selectedLayoutCandidateId: "layout_copy_left_with_right_photo",
      photoBranchMode: "photo_selected",
      photoBranchReason: "stale picture branch still won selection",
      executionStrategy: "photo_hero_shape_text_group",
      summary: "picture hero selected against graphic-only repair",
      fallbackSummary: "stale picture lane survived policy repair",
    }),
    createTypographyDecision(),
    createSourceSearchSummary({
      photo: {
        family: "photo",
        queryAttempts: [
          {
            label: "photo_primary_keyword",
            query: {
              keyword: "세일",
              theme: null,
              type: "pic",
              format: "horizontal",
            },
            returnedCount: 2,
          },
        ],
        returnedCount: 2,
        filteredCount: 2,
        fallbackUsed: false,
        selectedAssetId: "photo:policy-1",
        selectedSerial: "61",
        selectedCategory: "hero",
      },
    }),
    createPlan(),
  );

  const mismatch = verdict.issues.find(
    (issue) => issue.code === "asset_policy_conflict",
  );

  assert.equal(verdict.recommendation, "refine");
  assert.ok(mismatch);
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("normalized-intent.json"),
    true,
  );
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("search-profile.json"),
    true,
  );
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("selection-decision.json"),
    true,
  );
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("source-search-summary.json"),
    true,
  );
  assert.equal(mismatch?.metadata?.repairAttempted, true);
  assert.equal(mismatch?.metadata?.repairOutcome, "warning_only");
});

test("ruleJudgeCreateTemplate reports domain_subject_mismatch when fashion intent drifts to restaurant menu signals on the selected photo path", async () => {
  const intent = createFashionRetailNormalizedIntent();
  const searchProfile = await buildSearchProfile(intent);
  assert.ok(searchProfile.photo.queries[0]);
  searchProfile.photo.queries[0].keyword = "브런치 메뉴";
  const verdict = await ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createSelectionDecision({
      layoutMode: "copy_left_with_right_photo",
      selectedLayoutCandidateId: "layout_copy_left_with_right_photo",
      photoBranchMode: "photo_selected",
      executionStrategy: "photo_hero_shape_text_group",
      summary: "브런치 메뉴 photo hero selected",
      fallbackSummary: "restaurant menu fallback",
    }),
    createTypographyDecision(),
    createSourceSearchSummary({
      photo: {
        family: "photo",
        queryAttempts: [
          {
            label: "photo_primary_keyword",
            query: {
              keyword: "브런치 메뉴",
              theme: null,
            },
            returnedCount: 3,
          },
        ],
        returnedCount: 3,
        filteredCount: 3,
        fallbackUsed: false,
        selectedAssetId: "photo:menu-1",
        selectedSerial: "31",
        selectedCategory: "food",
      },
    }),
    createPlan(),
  );

  const mismatch = verdict.issues.find(
    (issue) => issue.code === "domain_subject_mismatch",
  );

  assert.equal(verdict.recommendation, "refine");
  assert.ok(mismatch);
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("search-profile.json"),
    true,
  );
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("source-search-summary.json"),
    true,
  );
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("selection-decision.json"),
    true,
  );
  assert.equal(mismatch?.metadata?.repairAttempted, true);
  assert.equal(mismatch?.metadata?.repairOutcome, "warning_only");
});

test("ruleJudgeCreateTemplate reports primary_visual_drift when the chosen photo hero still reads as restaurant menu content against fashion intent", async () => {
  const intent = createFashionRetailNormalizedIntent();
  const searchProfile = await buildSearchProfile(intent);
  const verdict = await ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createSelectionDecision({
      layoutMode: "copy_left_with_right_photo",
      selectedLayoutCandidateId: "layout_copy_left_with_right_photo",
      photoBranchMode: "photo_selected",
      photoBranchReason: "photo hero won on crop-safe emphasis",
      executionStrategy: "photo_hero_shape_text_group",
      summary: "브런치 메뉴 photo hero selected",
      fallbackSummary: "restaurant menu fallback",
    }),
    createTypographyDecision(),
    createSourceSearchSummary({
      photo: {
        family: "photo",
        queryAttempts: [
          {
            label: "photo_primary_keyword",
            query: {
              keyword: "브런치 메뉴",
              theme: null,
              type: "pic",
              format: "horizontal",
            },
            returnedCount: 3,
          },
        ],
        returnedCount: 3,
        filteredCount: 3,
        fallbackUsed: false,
        selectedAssetId: "photo:menu-1",
        selectedSerial: "31",
        selectedCategory: "food",
      },
    }),
    createPlan(),
  );

  const drift = verdict.issues.find(
    (issue) => issue.code === "primary_visual_drift",
  );

  assert.equal(verdict.recommendation, "refine");
  assert.ok(drift);
  assert.equal(
    drift?.metadata?.evidenceRefs?.includes("selection-decision.json"),
    true,
  );
  assert.equal(
    drift?.metadata?.evidenceRefs?.includes("source-search-summary.json"),
    true,
  );
  assert.equal(
    drift?.metadata?.repairAttempted,
    true,
  );
  assert.equal(
    drift?.metadata?.repairOutcome,
    "warning_only",
  );
  assert.equal(
    verdict.issues.some(
      (issue) => issue.code === "search_profile_intent_mismatch",
    ),
    false,
  );
});

test("ruleJudgeCreateTemplate reports template_prior_conflict when a dominant wrong-domain template prior keeps controlling the selected lane", async () => {
  const intent = createFashionRetailNormalizedIntent();
  const searchProfile = await buildSearchProfile(intent);
  const templatePriorSummary = createTemplatePriorSummary();
  templatePriorSummary.dominantThemePrior = "template_prior";
  templatePriorSummary.selectedTemplatePrior = {
    status: "competitive_only",
    competitiveness: "competitive_only",
    summary: "브런치 메뉴 템플릿 prior",
    keyword: "브런치 메뉴",
    categorySerial: "0006",
    querySurface: "POST /editor/get_templates (keyword, canvas, categorySerial, price, follow, page)",
    evidenceRefs: ["template-prior-summary.json"],
    contextRefs: ["CURRENT_RULE_JUDGE"],
  };
  templatePriorSummary.keywordThemeMatches = [
    {
      family: "template",
      signal: "브런치 메뉴",
      strength: "primary",
      summary: "브런치 메뉴 keyword/theme match on template surface",
      evidenceRefs: ["template-prior-summary.json"],
    },
  ];
  templatePriorSummary.rankingBiases = [
    {
      bias: "template_query_surface_alignment",
      effect: "promote",
      rationale: "promote brunch menu template prior through the real template query surface",
    },
  ];

  const verdict = await ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createSelectionDecision({
      summary: "template prior kept the selected badge-led lane stable",
      fallbackSummary: "selected lane still carried template prior bias",
    }),
    createTypographyDecision(),
    createSourceSearchSummary(),
    createPlan(),
    templatePriorSummary,
  );

  const mismatch = verdict.issues.find(
    (issue) => issue.code === "template_prior_conflict",
  );

  assert.equal(verdict.recommendation, "refine");
  assert.ok(mismatch);
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("normalized-intent.json"),
    true,
  );
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("template-prior-summary.json"),
    true,
  );
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("selection-decision.json"),
    true,
  );
  assert.equal(mismatch?.metadata?.repairAttempted, true);
  assert.equal(mismatch?.metadata?.repairOutcome, "warning_only");
});

test("ruleJudgeCreateTemplate reports theme_domain_mismatch when contents_theme priors pull fashion intent toward cafe signals", async () => {
  const intent = createFashionRetailNormalizedIntent();
  const searchProfile = await buildSearchProfile(intent);
  assert.ok(searchProfile.photo.queries[0]);
  searchProfile.photo.queries[0].theme = "cafe_coffee_theme";
  const templatePriorSummary = createTemplatePriorSummary();
  templatePriorSummary.dominantThemePrior = "contents_theme_prior";
  templatePriorSummary.selectedContentsThemePrior.picture = {
    family: "picture",
    status: "selected",
    serial: "picture_theme_cafe",
    summary: "카페 커피 테마 prior",
    evidenceRefs: ["template-prior-summary.json"],
    contextRefs: ["CURRENT_RULE_JUDGE"],
  };
  templatePriorSummary.contentsThemePriorMatches = [
    {
      family: "picture",
      signal: "cafe coffee theme",
      strength: "primary",
      summary: "카페 커피 테마가 picture hero를 끌어당김",
      evidenceRefs: ["template-prior-summary.json"],
    },
  ];
  templatePriorSummary.rankingBiases = [
    {
      bias: "cafe_coffee_theme",
      effect: "promote",
      rationale: "promote cafe coffee hero on picture family",
    },
  ];

  const verdict = await ruleJudgeCreateTemplate(
    intent,
    searchProfile,
    createSelectionDecision({
      layoutMode: "copy_left_with_right_photo",
      selectedLayoutCandidateId: "layout_copy_left_with_right_photo",
      photoBranchMode: "photo_selected",
      executionStrategy: "photo_hero_shape_text_group",
      summary: "theme-biased photo hero selected",
    }),
    createTypographyDecision(),
    createSourceSearchSummary({
      photo: {
        family: "photo",
        queryAttempts: [
          {
            label: "photo_primary_theme",
            query: {
              keyword: "세일",
              theme: "cafe_coffee_theme",
            },
            returnedCount: 2,
          },
        ],
        returnedCount: 2,
        filteredCount: 2,
        fallbackUsed: false,
        selectedAssetId: "photo:theme-1",
        selectedSerial: "41",
        selectedCategory: "hero",
      },
    }),
    createPlan(),
    templatePriorSummary,
  );

  const mismatch = verdict.issues.find(
    (issue) => issue.code === "theme_domain_mismatch",
  );

  assert.equal(verdict.recommendation, "refine");
  assert.ok(mismatch);
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("template-prior-summary.json"),
    true,
  );
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("source-search-summary.json"),
    true,
  );
  assert.equal(
    mismatch?.metadata?.evidenceRefs?.includes("search-profile.json"),
    true,
  );
  assert.equal(mismatch?.metadata?.repairAttempted, true);
  assert.equal(mismatch?.metadata?.repairOutcome, "warning_only");
});

test("surfaceRuleJudgeIssue exposes stable surfaced output shape for every hardening mismatch finding", () => {
  for (const code of ruleJudgeHardeningMismatchCodes) {
    const issue = surfaceRuleJudgeIssue(code);
    const definition = RULE_JUDGE_ISSUE_DEFINITIONS[code];

    assertRuleJudgeIssueShape(issue);
    assert.equal(issue.code, code);
    assert.equal(issue.category, definition.category);
    assert.equal(issue.severity, definition.defaultSeverity);
    assert.equal(issue.message, definition.message);
    assert.equal(issue.suggestedAction, definition.suggestedAction);
    assert.equal(
      issue.metadata?.ruleScope,
      definition.metadata?.ruleScope,
    );
    assert.equal(issue.metadata?.recommendationImpact, "refine");
    assert.equal(issue.metadata?.repairAttempted, false);
    assert.equal(issue.metadata?.repairOutcome, "not_attempted");
  }
});

const hardeningMismatchPositiveScenarios: Array<{
  code: HardeningMismatchCode;
  name: string;
  run: () => Promise<RuleJudgeVerdict>;
}> = [
  {
    code: "domain_subject_mismatch",
    name: "restaurant menu subject survives on the selected fashion retail picture lane",
    run: async () =>
      runFashionRetailPhotoRuleJudge({
        fixture: restaurantMenuPictureDriftFixture,
        mutateSearchProfile: (searchProfile) => {
          assert.ok(searchProfile.photo.queries[0]);
          searchProfile.photo.queries[0].keyword =
            restaurantMenuPictureDriftFixture.querySurface.keyword;
        },
      }),
  },
  {
    code: "theme_domain_mismatch",
    name: "cafe coffee contents_theme evidence keeps biasing the selected picture lane",
    run: async () => {
      const templatePriorSummary = createTemplatePriorSummary();
      templatePriorSummary.dominantThemePrior = "contents_theme_prior";
      templatePriorSummary.selectedContentsThemePrior.picture = {
        family: "picture",
        status: "selected",
        serial: cafeCoffeeThemeDriftFixture.templatePrior.serial,
        summary: cafeCoffeeThemeDriftFixture.templatePrior.summary,
        evidenceRefs: ["template-prior-summary.json"],
        contextRefs: ["CURRENT_RULE_JUDGE"],
      };
      templatePriorSummary.contentsThemePriorMatches = [
        {
          family: "picture",
          signal: cafeCoffeeThemeDriftFixture.templatePrior.signal,
          strength: "primary",
          summary: "카페 커피 테마가 picture hero를 끌어당김",
          evidenceRefs: ["template-prior-summary.json"],
        },
      ];
      templatePriorSummary.rankingBiases = [
        {
          bias: cafeCoffeeThemeDriftFixture.templatePrior.bias,
          effect: "promote",
          rationale: cafeCoffeeThemeDriftFixture.templatePrior.rationale,
        },
      ];

      return runFashionRetailPhotoRuleJudge({
        fixture: cafeCoffeeThemeDriftFixture,
        mutateSearchProfile: (searchProfile) => {
          assert.ok(searchProfile.photo.queries[0]);
          searchProfile.photo.queries[0].theme =
            cafeCoffeeThemeDriftFixture.querySurface.theme;
        },
        templatePriorSummary,
      });
    },
  },
  {
    code: "search_profile_intent_mismatch",
    name: "the canonical picture query surface drifts from fashion sale to restaurant menu search",
    run: async () =>
      runFashionRetailPhotoRuleJudge({
        mutateSearchProfile: (searchProfile) => {
          assert.ok(searchProfile.photo.queries[0]);
          searchProfile.photo.queries[0].keyword =
            restaurantMenuPictureDriftFixture.querySurface.keyword;
        },
      }),
  },
  {
    code: "asset_policy_conflict",
    name: "picture selection survives even after repair narrows the policy to graphic-only",
    run: async () =>
      runFashionRetailPhotoRuleJudge({
        intentOverrides: {
          assetPolicy: graphicOnlyRuleJudgeAssetPolicy,
        },
        fixture: graphicOnlyPicturePolicyConflictFixture,
      }),
  },
  {
    code: "template_prior_conflict",
    name: "a real Tooldi template query surface keeps the wrong-domain prior in control",
    run: async () => {
      const templatePriorSummary = createTemplatePriorSummary();
      templatePriorSummary.dominantThemePrior = "template_prior";
      templatePriorSummary.selectedTemplatePrior = {
        status: "competitive_only",
        competitiveness: "competitive_only",
        summary: restaurantMenuTemplatePriorFixture.selectedTemplatePrior.summary,
        keyword: restaurantMenuTemplatePriorFixture.selectedTemplatePrior.keyword,
        categorySerial:
          restaurantMenuTemplatePriorFixture.selectedTemplatePrior.categorySerial,
        querySurface:
          restaurantMenuTemplatePriorFixture.selectedTemplatePrior.querySurface,
        evidenceRefs: ["template-prior-summary.json"],
        contextRefs: ["CURRENT_RULE_JUDGE"],
      };
      templatePriorSummary.keywordThemeMatches = [
        {
          family: restaurantMenuTemplatePriorFixture.keywordThemeMatch.family,
          signal: restaurantMenuTemplatePriorFixture.keywordThemeMatch.signal,
          strength: restaurantMenuTemplatePriorFixture.keywordThemeMatch.strength,
          summary: restaurantMenuTemplatePriorFixture.keywordThemeMatch.summary,
          evidenceRefs: ["template-prior-summary.json"],
        },
      ];
      templatePriorSummary.rankingBiases = [
        {
          bias: restaurantMenuTemplatePriorFixture.rankingBias.bias,
          effect: restaurantMenuTemplatePriorFixture.rankingBias.effect,
          rationale: restaurantMenuTemplatePriorFixture.rankingBias.rationale,
        },
      ];

      return runFashionRetailGraphicRuleJudge({
        selectionOverrides: {
          summary: "template prior kept the selected badge-led lane stable",
          fallbackSummary: "selected lane still carried template prior bias",
        },
        templatePriorSummary,
      });
    },
  },
  {
    code: "primary_visual_drift",
    name: "the selected primary picture still reads as restaurant menu content against fashion intent",
    run: async () =>
      runFashionRetailPhotoRuleJudge({
        fixture: restaurantMenuPictureDriftFixture,
      }),
  },
];

for (const scenario of hardeningMismatchPositiveScenarios) {
  test(`ruleJudgeCreateTemplate surfaces ${scenario.code} for ${scenario.name}`, async () => {
    const verdict = await scenario.run();

    assertRuleJudgeVerdictShape(verdict);
    assert.equal(verdict.recommendation, "refine");

    const issue = verdict.issues.find(
      (candidate) => candidate.code === scenario.code,
    );

    assert.ok(issue);
    assertRuleJudgeIssueShape(issue);
    assert.equal(issue.code, scenario.code);
    assert.equal(issue.metadata?.recommendationImpact, "refine");
    assert.equal(issue.metadata?.repairAttempted, true);
    assert.equal(issue.metadata?.repairOutcome, "warning_only");
  });
}

const hardeningMismatchNegativeScenarios: Array<{
  code: HardeningMismatchCode;
  name: string;
  run: () => Promise<RuleJudgeVerdict>;
}> = [
  {
    code: "domain_subject_mismatch",
    name: "fashion retail picture subject stays aligned with the repaired sale intent",
    run: async () => runFashionRetailPhotoRuleJudge(),
  },
  {
    code: "theme_domain_mismatch",
    name: "no wrong-domain contents_theme prior is attached to the selected picture lane",
    run: async () =>
      runFashionRetailPhotoRuleJudge({
        templatePriorSummary: createTemplatePriorSummary(),
      }),
  },
  {
    code: "search_profile_intent_mismatch",
    name: "the canonical Tooldi picture query surface stays aligned with fashion sale search",
    run: async () => runFashionRetailPhotoRuleJudge(),
  },
  {
    code: "asset_policy_conflict",
    name: "graphic-only repair keeps both selection and query activity off the picture lane",
    run: async () =>
      runFashionRetailGraphicRuleJudge({
        intentOverrides: {
          assetPolicy: graphicOnlyRuleJudgeAssetPolicy,
        },
      }),
  },
  {
    code: "template_prior_conflict",
    name: "supportive spring template priors stay non-controlling for coherent badge-led selection",
    run: async () =>
      runFashionRetailGraphicRuleJudge({
        templatePriorSummary: createTemplatePriorSummary(),
      }),
  },
  {
    code: "primary_visual_drift",
    name: "the selected primary picture stays within the fashion retail sale domain",
    run: async () => runFashionRetailPhotoRuleJudge(),
  },
];

for (const scenario of hardeningMismatchNegativeScenarios) {
  test(`ruleJudgeCreateTemplate suppresses ${scenario.code} when ${scenario.name}`, async () => {
    const verdict = await scenario.run();

    assertRuleJudgeVerdictShape(verdict);
    assert.equal(verdict.recommendation, "keep");
    assert.equal(
      verdict.issues.some((issue) => issue.code === scenario.code),
      false,
    );
  });
}
