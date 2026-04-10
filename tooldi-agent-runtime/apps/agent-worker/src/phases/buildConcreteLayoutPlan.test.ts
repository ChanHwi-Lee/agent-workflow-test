import assert from "node:assert/strict";
import test from "node:test";

import type {
  AbstractLayoutPlan,
  AssetPlan,
  CopyPlan,
  HydratedPlanningInput,
  SelectionDecision,
} from "../types.js";
import { buildConcreteLayoutPlan } from "./buildConcreteLayoutPlan.js";

function createCopyPlan(withBadge = false): CopyPlan {
  return {
    planId: "copy-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    source: "heuristic",
    primaryMessage: "봄 세일",
    summary: "copy plan",
    slots: [
      {
        key: "headline",
        text: "봄 세일",
        priority: "primary",
        required: true,
        maxLength: 28,
        toneHint: "promotional",
      },
      {
        key: "subheadline",
        text: "지금 바로 확인하세요",
        priority: "secondary",
        required: true,
        maxLength: 36,
        toneHint: "informational",
      },
      {
        key: "offer_line",
        text: "최대 50% OFF",
        priority: "secondary",
        required: true,
        maxLength: 24,
        toneHint: "urgent",
      },
      {
        key: "cta",
        text: "혜택 보기",
        priority: "supporting",
        required: true,
        maxLength: 18,
        toneHint: "promotional",
      },
      ...(withBadge
        ? [
            {
              key: "badge_text" as const,
              text: "SALE",
              priority: "supporting" as const,
              required: false,
              maxLength: 12,
              toneHint: "urgent" as const,
            },
          ]
        : []),
      {
        key: "footer_note",
        text: "기간 한정 혜택",
        priority: "utility",
        required: false,
        maxLength: 32,
        toneHint: "informational",
      },
    ],
  };
}

function createAbstractLayoutPlan(
  overrides: Partial<AbstractLayoutPlan> = {},
): AbstractLayoutPlan {
  return {
    planId: "layout-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    source: "heuristic",
    layoutFamily: "promo_split",
    copyAnchor: "left",
    visualAnchor: "right",
    ctaAnchor: "below_copy",
    density: "balanced",
    slotTopology: "headline_supporting_offer_cta_footer",
    summary: "layout",
    ...overrides,
  };
}

function createAssetPlan(
  overrides: Partial<AssetPlan> = {},
): AssetPlan {
  return {
    planId: "asset-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    primaryVisualFamily: "graphic",
    backgroundBinding: {
      candidateId: "background-1",
      sourceKind: "generated_solid",
      sourceAssetId: null,
      sourceSerial: null,
      sourceCategory: "generated_solid",
      colorHex: "#dff2ff",
      backgroundMode: "generated_solid",
    },
    graphicRoleBindings: [
      {
        role: "primary_accent",
        candidateId: "graphic-1",
        sourceAssetId: "asset-graphic-1",
        sourceSerial: "serial-graphic-1",
        sourceCategory: "vector",
        variantKey: "graphic_primary",
        decorationMode: "promo_multi_graphic",
        required: true,
        zonePreference: "right_cluster",
      },
      {
        role: "cta_container",
        candidateId: "graphic-2",
        sourceAssetId: "asset-graphic-2",
        sourceSerial: "serial-graphic-2",
        sourceCategory: "vector",
        variantKey: "graphic_cta",
        decorationMode: "promo_multi_graphic",
        required: true,
        zonePreference: "bottom_strip",
      },
    ],
    photoBinding: null,
    fallbackPolicy: {
      missingOptionalGraphicRoles: "drop",
      missingCtaContainer: "fallback_cta_pill",
      unavailablePhotoPrimary: "demote_to_graphic_primary",
    },
    executionEligibility: {
      canRender: true,
      degraded: false,
      reasons: [],
    },
    summary: "asset plan",
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
    compareCriteria: ["seasonalFit"],
    selectedBackgroundCandidateId: "background-1",
    selectedLayoutCandidateId: "layout-1",
    selectedDecorationCandidateId: "graphic-1",
    topPhotoCandidateId: null,
    selectedBackgroundAssetId: null,
    selectedBackgroundSerial: null,
    selectedBackgroundCategory: "generated_solid",
    selectedBackgroundColorHex: "#dff2ff",
    selectedDecorationAssetId: "asset-graphic-1",
    selectedDecorationSerial: "serial-graphic-1",
    selectedDecorationCategory: "vector",
    topPhotoAssetId: null,
    topPhotoSerial: null,
    topPhotoCategory: null,
    topPhotoUid: null,
    topPhotoUrl: null,
    topPhotoWidth: null,
    topPhotoHeight: null,
    topPhotoOrientation: null,
    backgroundMode: "generated_solid",
    layoutMode: "left_copy_right_graphic",
    decorationMode: "promo_multi_graphic",
    photoBranchMode: "graphic_preferred",
    photoBranchReason: "photo not selected",
    executionStrategy: "graphic_first_shape_text_group",
    graphicCompositionSet: null,
    summary: "selection",
    fallbackSummary: "fallback",
    ...overrides,
  };
}

function createHydratedPlanningInput(): HydratedPlanningInput {
  return {
    job: {
      runId: "run-1",
      traceId: "trace-1",
      attemptSeq: 1,
    } as HydratedPlanningInput["job"],
    request: {
      editorContext: {
        canvasWidth: 1200,
        canvasHeight: 628,
      },
    } as HydratedPlanningInput["request"],
    snapshot: {} as HydratedPlanningInput["snapshot"],
    requestRef: "request-ref",
    snapshotRef: "snapshot-ref",
    repairContext: null,
  };
}

test("buildConcreteLayoutPlan resolves promo topology from abstract layout and asset plan", async () => {
  const result = await buildConcreteLayoutPlan(
    createHydratedPlanningInput(),
    createCopyPlan(true),
    createAbstractLayoutPlan({
      layoutFamily: "promo_badge",
      copyAnchor: "center",
      ctaAnchor: "bottom_center",
      slotTopology: "headline_supporting_cta_footer",
    }),
    createAssetPlan(),
    createSelectionDecision({
      layoutMode: "left_copy_right_graphic",
    }),
    {
      textLayoutHelper: {
        estimate: async () => ({ width: 240, height: 84, lineCount: 1, estimatedLineCount: 1 }),
      },
    },
  );

  assert.equal(result.abstractLayoutFamily, "promo_badge");
  assert.equal(result.resolvedLayoutMode, "badge_promo_stack");
  assert.equal(result.resolvedSlotTopology, "badge_headline_offer_cta_footer");
  assert.equal(result.slotAnchors.headline, "center_copy_stack");
  assert.equal(result.slotAnchors.cta, "bottom_center");
  assert.ok(result.resolvedSlotBounds.headline);
  assert.ok(result.resolvedSlotBounds.badge_text);
  assert.deepEqual(result.clusterZones, ["center_cluster", "top_corner", "bottom_strip"]);
});

test("buildConcreteLayoutPlan keeps subject hero only for photo primary", async () => {
  const result = await buildConcreteLayoutPlan(
    createHydratedPlanningInput(),
    createCopyPlan(),
    createAbstractLayoutPlan({
      layoutFamily: "subject_hero",
      slotTopology: "hero_headline_supporting_cta_footer",
    }),
    createAssetPlan({
      primaryVisualFamily: "photo",
      photoBinding: {
        candidateId: "photo-1",
        sourceAssetId: "asset-photo-1",
        sourceSerial: "serial-photo-1",
        sourceCategory: "photo",
        sourceUid: "uid-1",
        sourceOriginUrl: "https://example.com/photo.png",
        sourceWidth: 1200,
        sourceHeight: 800,
        orientation: "landscape",
        fitMode: "cover",
        cropMode: "centered_cover",
        required: true,
      },
    }),
    createSelectionDecision({
      layoutMode: "copy_left_with_right_photo",
      photoBranchMode: "photo_selected",
      executionStrategy: "photo_hero_shape_text_group",
    }),
    {
      textLayoutHelper: {
        estimate: async () => ({ width: 240, height: 84, lineCount: 1, estimatedLineCount: 1 }),
      },
    },
  );

  assert.equal(result.primaryVisualFamily, "photo");
  assert.equal(result.resolvedLayoutMode, "copy_left_with_right_photo");
  assert.equal(result.resolvedSlotTopology, "hero_headline_supporting_cta_footer");
  assert.ok(result.resolvedSlotBounds.hero_image);
  assert.ok(result.clusterZones.includes("hero_panel"));
});
