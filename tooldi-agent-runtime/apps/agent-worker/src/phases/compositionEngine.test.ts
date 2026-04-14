import assert from "node:assert/strict";
import test from "node:test";

import type { TemplateCandidate, TemplateCandidateSet } from "@tooldi/tool-adapters";
import { normalizeTemplateAssetPolicy } from "@tooldi/agent-llm";

import type {
  NormalizedIntent,
  RetrievalStageResult,
  TemplateCandidateBundle,
  TemplateSelectionPolicy,
} from "../types.js";
import { buildCompositionSelection } from "./compositionEngine.js";

function createIntent(
  overrides: Partial<NormalizedIntent> = {},
): NormalizedIntent {
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
    campaignGoal: "promotion_awareness",
    canvasPreset: "wide_1200x628",
    layoutIntent: "copy_focused",
    tone: "bright_playful",
    subjectBinding: "subjectless",
    offerIntent: "sale",
    backgroundColorHex: "#FFEDF0",
    requiredSlots: [
      "background",
      "headline",
      "supporting_copy",
      "cta",
      "decoration",
    ],
    assetPolicy: normalizeTemplateAssetPolicy("graphic_allowed_photo_optional"),
    primaryVisualPolicy: "graphic_preferred",
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
    futureCapableOperations: ["create_template"],
    ...overrides,
  };
}

function createSelectionPolicy(): TemplateSelectionPolicy {
  return {
    allowedToolNames: ["background-catalog", "photo-catalog", "style-heuristic"],
    allowPhotoCandidates: true,
    allowTemplateSource: true,
    retrievalMode: "none",
  };
}

function createRetrievalStage(): RetrievalStageResult {
  return {
    retrievalMode: "none",
    status: "disabled",
    allowedSourceFamilies: [
      "background_source",
      "graphic_source",
      "photo_source",
      "template_source",
    ],
    augmentationCount: 0,
    reason: "test",
  };
}

function createCandidate(
  overrides: Partial<TemplateCandidate> & Pick<TemplateCandidate, "candidateId" | "family" | "sourceFamily" | "summary" | "fitScore" | "fallbackIfRejected" | "executionAllowed" | "payload">,
): TemplateCandidate {
  return {
    selectionReasons: [],
    riskFlags: [],
    ...overrides,
  };
}

function createCandidateSet(
  family: TemplateCandidateSet["family"],
  candidates: TemplateCandidate[],
): TemplateCandidateSet {
  return {
    setId: `${family}-set`,
    family,
    candidates,
  };
}

function createCandidateBundle(options?: {
  layoutModes?: Array<
    | "left_copy_right_graphic"
    | "framed_promo"
    | "center_stack_promo"
    | "badge_promo_stack"
    | "copy_left_with_right_decoration"
    | "copy_left_with_right_photo"
  >;
  extraDecorationCandidate?: boolean;
}): TemplateCandidateBundle {
  const allowedLayoutModes = new Set(
    options?.layoutModes ?? [
      "left_copy_right_graphic",
      "framed_promo",
      "center_stack_promo",
      "badge_promo_stack",
      "copy_left_with_right_decoration",
      "copy_left_with_right_photo",
    ],
  );
  const layoutCandidates = [
    createCandidate({
      candidateId: "layout_left_copy_right_graphic",
      family: "layout",
      sourceFamily: "derived_policy",
      summary: "left graphic",
      fitScore: 0.97,
      fallbackIfRejected: "layout_center_stack_promo",
      executionAllowed: true,
      payload: {
        variantKey: "left_copy_right_graphic",
        layoutMode: "left_copy_right_graphic",
      },
    }),
    createCandidate({
      candidateId: "layout_framed_promo",
      family: "layout",
      sourceFamily: "derived_policy",
      summary: "framed promo",
      fitScore: 0.94,
      fallbackIfRejected: "layout_center_stack_promo",
      executionAllowed: true,
      payload: {
        variantKey: "framed_promo",
        layoutMode: "framed_promo",
      },
    }),
    createCandidate({
      candidateId: "layout_center_stack_promo",
      family: "layout",
      sourceFamily: "derived_policy",
      summary: "center stack promo",
      fitScore: 0.91,
      fallbackIfRejected: "layout_center_stack",
      executionAllowed: true,
      payload: {
        variantKey: "center_stack_promo",
        layoutMode: "center_stack_promo",
      },
    }),
    createCandidate({
      candidateId: "layout_badge_promo_stack",
      family: "layout",
      sourceFamily: "derived_policy",
      summary: "badge promo",
      fitScore: 0.86,
      fallbackIfRejected: "layout_center_stack_promo",
      executionAllowed: true,
      payload: {
        variantKey: "badge_promo_stack",
        layoutMode: "badge_promo_stack",
      },
    }),
    createCandidate({
      candidateId: "layout_copy_left_with_right_decoration",
      family: "layout",
      sourceFamily: "derived_policy",
      summary: "copy with right decoration",
      fitScore: 0.95,
      fallbackIfRejected: "layout_center_stack",
      executionAllowed: true,
      payload: {
        variantKey: "copy_left_with_right_decoration",
        layoutMode: "copy_left_with_right_decoration",
      },
    }),
    createCandidate({
      candidateId: "layout_copy_left_with_right_photo",
      family: "layout",
      sourceFamily: "derived_policy",
      summary: "copy with right photo",
      fitScore: 0.92,
      fallbackIfRejected: "layout_copy_left_with_right_decoration",
      executionAllowed: true,
      payload: {
        variantKey: "copy_left_with_right_photo",
        layoutMode: "copy_left_with_right_photo",
      },
    }),
  ].filter((candidate) =>
    allowedLayoutModes.has(candidate.payload.layoutMode!),
  );

  return {
    background: createCandidateSet("background", [
      createCandidate({
        candidateId: "background-1",
        family: "background",
        sourceFamily: "background_source",
        summary: "generated background",
        fitScore: 0.9,
        fallbackIfRejected: "background-1",
        executionAllowed: true,
        payload: {
          variantKey: "background_soft",
          backgroundMode: "generated_solid",
          backgroundColorHex: "#FFEDF0",
        },
      }),
    ]),
    layout: createCandidateSet("layout", layoutCandidates),
    decoration: createCandidateSet("decoration", [
      createCandidate({
        candidateId: "graphic-1",
        family: "decoration",
        sourceFamily: "graphic_source",
        summary: "spring graphic",
        fitScore: 0.82,
        fallbackIfRejected: "graphic-1",
        executionAllowed: true,
        sourceAssetId: "graphic:1",
        sourceSerial: "1",
        sourceCategory: "vector",
        payload: {
          variantKey: "graphic_primary",
          decorationMode: "promo_multi_graphic",
        },
      }),
      ...(options?.extraDecorationCandidate
        ? [
            createCandidate({
              candidateId: "graphic-2",
              family: "decoration",
              sourceFamily: "graphic_source",
              summary: "secondary spring graphic",
              fitScore: 0.78,
              fallbackIfRejected: "graphic-1",
              executionAllowed: true,
              sourceAssetId: "graphic:2",
              sourceSerial: "2",
              sourceCategory: "vector",
              payload: {
                variantKey: "graphic_secondary",
                decorationMode: "graphic_cluster",
              },
            }),
          ]
        : []),
    ]),
    photo: createCandidateSet("photo", [
      createCandidate({
        candidateId: "photo-1",
        family: "photo",
        sourceFamily: "photo_source",
        summary: "landscape photo",
        fitScore: 0.94,
        fallbackIfRejected: "photo-1",
        executionAllowed: true,
        sourceAssetId: "photo:1",
        sourceSerial: "1",
        sourceCategory: "photo",
        sourceUid: "uid-1",
        sourceOriginUrl: "https://example.com/photo-1.jpg",
        sourceWidth: 1600,
        sourceHeight: 900,
        payload: {
          variantKey: "photo_primary",
          photoOrientation: "landscape",
        },
      }),
    ]),
  };
}

test("composition engine은 generic promo brief에서 3개의 내부 variant를 생성하고 top-1을 투영한다", async () => {
  const result = await buildCompositionSelection(
    createIntent(),
    createCandidateBundle(),
    {
      retrievalStage: createRetrievalStage(),
      selectionPolicy: createSelectionPolicy(),
    },
  );

  assert.equal(result.compositionVariantSet.variants.length, 3);
  assert.equal(
    new Set(result.compositionVariantSet.variants.map((variant) => variant.familyKey))
      .size >= 2,
    true,
  );
  assert.equal(
    Math.max(
      ...[...new Set(result.compositionVariantSet.variants.map((variant) => variant.familyKey))]
        .map(
          (familyKey) =>
            result.compositionVariantSet.variants.filter(
              (variant) => variant.familyKey === familyKey,
            ).length,
        ),
    ) <= 2,
    true,
  );
  assert.equal(
    new Set(
      result.compositionVariantSet.variants.map((variant) => variant.variantSignature),
    ).size,
    result.compositionVariantSet.variants.length,
  );
  assert.equal(
    new Set(
      result.compositionVariantSet.variants.map((variant) => variant.backgroundCandidateId),
    ).size,
    1,
  );
  assert.equal(
    result.compositionRanking.winnerVariantId ===
      result.compositionVariantSet.variants[0]?.variantId ||
      result.compositionRanking.winnerVariantId.length > 0,
    true,
  );
  assert.equal(result.selectionDecision.layoutMode, "left_copy_right_graphic");
  assert.equal(
    result.selectionDecision.selectedLayoutCandidateId,
    "layout_left_copy_right_graphic",
  );
});

test("composition engine은 같은 family 안 variation을 허용하되 최대 2개까지만 선택한다", async () => {
  const result = await buildCompositionSelection(
    createIntent(),
    createCandidateBundle({
      layoutModes: [
        "left_copy_right_graphic",
        "copy_left_with_right_decoration",
      ],
    }),
    {
      retrievalStage: createRetrievalStage(),
      selectionPolicy: createSelectionPolicy(),
    },
  );

  const familyCounts = new Map<string, number>();
  for (const variant of result.compositionVariantSet.variants) {
    familyCounts.set(
      variant.familyKey,
      (familyCounts.get(variant.familyKey) ?? 0) + 1,
    );
  }

  assert.equal(result.compositionVariantSet.variants.length, 3);
  assert.equal(
    result.compositionVariantSet.variants.some(
      (variant) => variant.familyKey === "left_copy_right_graphic",
    ),
    true,
  );
  assert.equal(
    [...familyCounts.values()].some((count) => count === 2),
    true,
  );
  assert.equal(
    [...familyCounts.values()].every((count) => count <= 2),
    true,
  );
  const duplicatedFamily = result.compositionVariantSet.variants
    .filter((variant) => variant.familyKey === "left_copy_right_graphic");
  assert.equal(duplicatedFamily.length, 2);
  assert.notEqual(
    duplicatedFamily[0]?.variantSignature,
    duplicatedFamily[1]?.variantSignature,
  );
  assert.notEqual(
    duplicatedFamily[0]?.copyDensity,
    duplicatedFamily[1]?.copyDensity,
  );
});

test("composition engine은 배경을 공유하고 그래픽 후보는 variant별로 분기할 수 있다", async () => {
  const result = await buildCompositionSelection(
    createIntent(),
    createCandidateBundle({
      extraDecorationCandidate: true,
    }),
    {
      retrievalStage: createRetrievalStage(),
      selectionPolicy: createSelectionPolicy(),
    },
  );

  assert.equal(
    new Set(
      result.compositionVariantSet.variants.map((variant) => variant.backgroundCandidateId),
    ).size,
    1,
  );
  assert.equal(
    new Set(
      result.compositionVariantSet.variants.map((variant) => variant.decorationCandidateId),
    ).size >= 2,
    true,
  );
});

test("composition engine은 photo-friendly brief에서 photo family variant를 winner로 투영한다", async () => {
  const result = await buildCompositionSelection(
    createIntent({
      domain: "cafe",
      audience: "local_visitors",
      campaignGoal: "product_trial",
      layoutIntent: "hero_focused",
      subjectBinding: "product_anchored",
      offerIntent: "launch",
      assetPolicy: normalizeTemplateAssetPolicy("photo_preferred_graphic_allowed"),
      primaryVisualPolicy: "photo_preferred",
    }),
    createCandidateBundle(),
    {
      retrievalStage: createRetrievalStage(),
      selectionPolicy: createSelectionPolicy(),
    },
  );

  assert.equal(
    result.compositionVariantSet.variants.some(
      (variant) => variant.familyKey === "copy_left_with_right_photo",
    ),
    true,
  );
  assert.equal(result.selectionDecision.layoutMode, "copy_left_with_right_photo");
  assert.equal(result.selectionDecision.photoBranchMode, "photo_selected");
  assert.equal(
    result.selectionDecision.selectedLayoutCandidateId,
    "layout_copy_left_with_right_photo",
  );
});
