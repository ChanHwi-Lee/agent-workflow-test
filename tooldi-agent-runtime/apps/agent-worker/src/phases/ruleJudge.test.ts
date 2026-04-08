import assert from "node:assert/strict";
import test from "node:test";

import type { ExecutablePlan } from "@tooldi/agent-contracts";

import type {
  NormalizedIntent,
  SearchProfileArtifact,
  SelectionDecision,
  SourceSearchSummary,
  TypographyDecision,
} from "../types.js";
import { buildSearchProfile } from "./buildSearchProfile.js";
import { ruleJudgeCreateTemplate } from "./ruleJudge.js";

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
      palette: [],
      typographyHint: null,
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
