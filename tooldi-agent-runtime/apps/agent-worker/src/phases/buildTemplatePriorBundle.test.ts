import assert from "node:assert/strict";
import test from "node:test";

import { createTestRun } from "@tooldi/agent-testkit";
import {
  TooldiCatalogSourceError,
  type TooldiCatalogSourceClient,
} from "@tooldi/tool-adapters";

import { buildTemplatePriorBundle } from "./buildTemplatePriorBundle.js";
import {
  mergeRecallSources,
  type LegacyMergedCandidate,
  type TemplateEmbeddingClient,
  type VectorRecallCandidate,
  type VectorRecallResult,
} from "./templatePriorVectorRecall.js";
import type { HydratedPlanningInput, NormalizedIntent } from "../types.js";

function createHydratedPlanningInput(): HydratedPlanningInput {
  const testRun = createTestRun({
    workflowVariant: "retrieval_prior_v1",
    userInput: {
      prompt: "봄 세일 배너를 만들어줘",
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

function createIntent(): NormalizedIntent {
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
    assetPolicy: {
      allowedFamilies: ["background", "graphic", "photo"],
      preferredFamilies: ["graphic"],
      primaryVisualPolicy: "graphic_preferred",
      avoidFamilies: [],
    },
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
    futureCapableOperations: ["create_template", "update_layer", "delete_layer"],
  };
}

const sourceClient: TooldiCatalogSourceClient = {
  async searchBackgroundAssets() {
    return {
      sourceFamily: "background_source",
      page: 1,
      hasNextPage: false,
      traceId: null,
      assets: [],
    };
  },
  async searchGraphicAssets() {
    return {
      sourceFamily: "graphic_source",
      page: 0,
      hasNextPage: false,
      traceId: null,
      assets: [],
    };
  },
  async searchPhotoAssets() {
    return {
      sourceFamily: "photo_source",
      page: 0,
      hasNextPage: false,
      traceId: null,
      assets: [],
    };
  },
  async listFontAssets() {
    return {
      sourceFamily: "font_source",
      page: 0,
      hasNextPage: false,
      traceId: null,
      assets: [],
    };
  },
  async searchTemplateAssets() {
    return {
      sourceFamily: "template_source",
      page: 1,
      hasNextPage: false,
      traceId: "trace-template-search",
      assets: [
        {
          assetId: "template:70079",
          sourceFamily: "template_source",
          contentType: "template",
          serial: "70079",
          uid: "74091534190",
          title: "봄맞이 세일 할인 프로모션 배너",
          keywordTokens: ["봄", "세일", "배너"],
          width: 1200,
          height: 628,
          thumbnailUrl: "https://thumb.test/template-1.png",
          originUrl: "https://thumb.test/template-1.png",
          priceType: "paid",
          isAi: false,
          creatorSerial: "128344",
          insertMode: "page_background",
          code: "74091534190",
          pages: 1,
          categoryName: "소셜미디어 광고",
          price: 8000,
          totalObjectPrice: 0,
          isPurchased: false,
          thumbnails: ["https://thumb.test/template-1.png"],
          sourcePayload: {},
        },
      ],
    };
  },
  async getTemplateDocument() {
    return {
      code: "74091534190",
      metaData: {
        code: "74091534190",
        innerCode: "717378421323",
        title: "봄 세일",
        width: "1200",
        height: "628",
        sizeUnit: "px",
        isShare: true,
        userId: "creator",
        createdAt: "2026-03-03",
        modifiedAt: "2026-03-03",
        keyword: "봄|:|세일",
      },
      canvas: {
        serial: "48",
        title: "소셜미디어 광고",
        width: "1200",
        height: "628",
        sizeUnit: "px",
      },
      pages: [
        {
          index: 0,
          raw: "{}",
          pattern: null,
          parsed: {
            backgroundType: "image",
            width: 1200,
            height: 628,
            objects: [
              { type: "text", left: 80, top: 110, width: 420, scaleX: 1 },
              { type: "text", left: 80, top: 210, width: 320, scaleX: 1 },
              { type: "illust", left: 760, top: 80, width: 300, scaleX: 1 },
            ],
          },
        },
      ],
    };
  },
};

test("buildTemplatePriorBundle uses searchable templates and extracts a scaffold hint", async () => {
  const bundle = await buildTemplatePriorBundle(
    createHydratedPlanningInput(),
    createIntent(),
    sourceClient,
  );

  assert.ok(bundle);
  assert.equal(bundle?.workflowVariant, "retrieval_prior_v1");
  assert.equal(bundle?.selectedTemplateCode, "74091534190");
  assert.equal(bundle?.candidates.length, 1);
  assert.equal(bundle?.selectedScaffold?.layoutFamilyHint, "promo_split");
  assert.equal(bundle?.selectedScaffold?.copyAnchor, "left");
  assert.equal(bundle?.selectedScaffold?.visualAnchor, "right");
  assert.equal(bundle?.diagnostics?.failedQueryCount, 0);
  assert.equal(bundle?.diagnostics?.successfulQueryCount, 5);
});

test("buildTemplatePriorBundle degrades to fallback bundle when template search payloads are invalid", async () => {
  let callCount = 0;
  const failingSourceClient: TooldiCatalogSourceClient = {
    ...sourceClient,
    async searchTemplateAssets() {
      callCount += 1;
      throw new TooldiCatalogSourceError({
        code: "invalid_response",
        message: "Tooldi template list endpoint returned an invalid payload",
        url: "https://catalog.test/editor/get_templates",
        responsePreview: "{\"result\":false,\"data\":null}",
      });
    },
  };

  const bundle = await buildTemplatePriorBundle(
    createHydratedPlanningInput(),
    createIntent(),
    failingSourceClient,
  );

  assert.ok(bundle);
  assert.equal(callCount, 5);
  assert.equal(bundle?.usedFallbackToLegacy, true);
  assert.equal(bundle?.selectedTemplateCode, null);
  assert.equal(bundle?.candidates.length, 0);
  assert.equal(bundle?.diagnostics?.failedQueryCount, 5);
  assert.equal(bundle?.diagnostics?.successfulQueryCount, 0);
  assert.equal(bundle?.diagnostics?.queryDiagnostics[0]?.errorCode, "invalid_response");
  assert.equal(
    bundle?.diagnostics?.queryDiagnostics[0]?.responsePreview,
    "{\"result\":false,\"data\":null}",
  );
  assert.match(bundle?.fallbackReason ?? "", /source contract boundary/);
});

function createRestaurantIntent(): NormalizedIntent {
  return {
    ...createIntent(),
    goalSummary: "식당에서 신규 봄 계절메뉴를 만들어줘",
    domain: "restaurant",
    campaignGoal: "menu_discovery",
    subjectBinding: "venue_anchored",
    offerIntent: "launch",
    searchKeywords: ["봄", "신상품", "식당"],
    facets: {
      seasonality: "spring",
      menuType: "food_menu",
      promotionStyle: "seasonal_menu_launch",
      offerSpecificity: "broad_offer",
    },
  };
}

function createRestaurantHydratedInput(): HydratedPlanningInput {
  const base = createHydratedPlanningInput();
  return {
    ...base,
    request: {
      ...base.request,
      userInput: {
        ...base.request.userInput,
        prompt: "식당에서 신규 봄 계절메뉴를 만들어줘",
      },
    },
  };
}

test("restaurant domain generates domain_primary and domain_offer queries in query plan", async () => {
  const capturedKeywords: string[] = [];
  const trackingSourceClient: TooldiCatalogSourceClient = {
    ...sourceClient,
    async searchTemplateAssets(query) {
      capturedKeywords.push(query.keyword);
      return sourceClient.searchTemplateAssets(query);
    },
  };

  const bundle = await buildTemplatePriorBundle(
    createRestaurantHydratedInput(),
    createRestaurantIntent(),
    trackingSourceClient,
  );

  assert.ok(bundle);
  assert.equal(bundle?.diagnostics?.successfulQueryCount, 5);

  assert.ok(
    capturedKeywords.some((kw) => kw === "음식"),
    `domain_primary "음식" should be in searched keywords: [${capturedKeywords.join(", ")}]`,
  );
  assert.ok(
    capturedKeywords.some((kw) => kw.includes("음식") && kw.includes("신상품")),
    `domain_offer should contain both "음식" and "신상품": [${capturedKeywords.join(", ")}]`,
  );

  const diagnosticLabels = bundle?.diagnostics?.queryDiagnostics.map((d) => d.label) ?? [];
  assert.ok(diagnosticLabels.includes("domain_primary"), "diagnostics should include domain_primary label");
  assert.ok(diagnosticLabels.includes("domain_offer"), "diagnostics should include domain_offer label");
});

test("domain bonus promotes restaurant template over generic template", async () => {
  const restaurantTemplate = {
    assetId: "template:90001",
    sourceFamily: "template_source" as const,
    contentType: "template" as const,
    serial: "90001",
    uid: "90001000001",
    title: "봄 식당 메뉴 프로모션",
    keywordTokens: ["봄", "식당", "메뉴", "음식", "프로모션"],
    width: 1200,
    height: 628,
    thumbnailUrl: "https://thumb.test/restaurant.png",
    originUrl: "https://thumb.test/restaurant.png",
    priceType: "paid" as const,
    isAi: false,
    creatorSerial: "100001",
    insertMode: "page_background" as const,
    code: "90001000001",
    pages: 1,
    categoryName: "소셜미디어 광고",
    price: 8000,
    totalObjectPrice: 0,
    isPurchased: false,
    thumbnails: ["https://thumb.test/restaurant.png"],
    sourcePayload: {},
  };

  const genericTemplate = {
    ...restaurantTemplate,
    assetId: "template:90002",
    serial: "90002",
    uid: "90002000001",
    title: "봄 BIG SALE 할인 배너",
    keywordTokens: ["봄", "세일", "할인", "배너", "이벤트"],
    code: "90002000001",
    thumbnailUrl: "https://thumb.test/generic.png",
    originUrl: "https://thumb.test/generic.png",
    thumbnails: ["https://thumb.test/generic.png"],
  };

  const dualSourceClient: TooldiCatalogSourceClient = {
    ...sourceClient,
    async searchTemplateAssets() {
      return {
        sourceFamily: "template_source",
        page: 1,
        hasNextPage: false,
        traceId: "trace-dual",
        assets: [genericTemplate, restaurantTemplate],
      };
    },
    async getTemplateDocument(query) {
      const doc = await sourceClient.getTemplateDocument(query);
      return { ...doc, code: query.templateCode };
    },
  };

  const bundle = await buildTemplatePriorBundle(
    createRestaurantHydratedInput(),
    createRestaurantIntent(),
    dualSourceClient,
  );

  assert.ok(bundle);
  assert.equal(
    bundle?.selectedTemplateCode,
    "90001000001",
    `Restaurant template should be selected over generic; got ${bundle?.selectedTemplateCode}`,
  );

  const restaurantCandidate = bundle?.candidates.find((c) => c.templateCode === "90001000001");
  const genericCandidate = bundle?.candidates.find((c) => c.templateCode === "90002000001");
  assert.ok(restaurantCandidate, "restaurant candidate should be in final candidates");
  assert.ok(genericCandidate, "generic candidate should be in final candidates");
  assert.ok(
    restaurantCandidate!.deterministicScore > genericCandidate!.deterministicScore,
    `restaurant score (${restaurantCandidate!.deterministicScore}) should exceed generic score (${genericCandidate!.deterministicScore})`,
  );
});

test("breadth floor prevents total rerank collapse", async () => {
  const rejectAllReranker = async () => ({
    selectedTemplateCode: null,
    summary: "all candidates rejected",
    candidates: [
      { templateCode: "74091534190", relevanceScore: 0.1, keep: false, reason: "rejected by test reranker" },
    ],
  });

  const bundle = await buildTemplatePriorBundle(
    createHydratedPlanningInput(),
    createIntent(),
    sourceClient,
    rejectAllReranker,
  );

  assert.ok(bundle);
  assert.equal(bundle?.usedFallbackToLegacy, false, "should not fall back to legacy");
  assert.ok(bundle?.selectedTemplateCode, "should still select a template via breadth floor");
  assert.ok(
    (bundle?.candidates.length ?? 0) >= 1,
    "breadth floor should preserve at least 1 candidate",
  );
});

// ============================================================================
// R1 vector recall tests (§3.6)
// ============================================================================

function legacyCand(overrides: Partial<LegacyMergedCandidate> = {}): LegacyMergedCandidate {
  return {
    rank: 1,
    templateAssetId: "legacy-asset",
    templateSerial: "100",
    templateCode: "L001",
    title: "legacy",
    categoryName: "소셜미디어 광고",
    width: 1200,
    height: 628,
    pages: 1,
    keywordTokens: ["배너"],
    thumbnailUrl: null,
    traceId: "trace-legacy",
    matchedQueryLabels: ["season_primary"],
    ...overrides,
  };
}

function vectorCand(overrides: Partial<VectorRecallCandidate> = {}): VectorRecallCandidate {
  return {
    rank: 1,
    templateCode: "V001",
    templateSerial: "200",
    innerSerial: "2000",
    title: "vector",
    categoryName: "소셜미디어 광고",
    pages: 1,
    keywordTokens: ["이미지"],
    sizeSerial: 7,
    width: 1200,
    height: 628,
    thumbnailUrl: null,
    relevanceScore: 0.35,
    ...overrides,
  };
}

test("mergeRecallSources: legacy-only pool preserves legacy ordering", () => {
  const merged = mergeRecallSources({
    legacyCandidates: [
      legacyCand({ rank: 1, templateCode: "A" }),
      legacyCand({ rank: 2, templateCode: "B" }),
      legacyCand({ rank: 3, templateCode: "C" }),
    ],
    vectorCandidates: [],
    cap: 10,
  });
  assert.deepEqual(merged.map((c) => c.templateCode), ["A", "B", "C"]);
  assert.ok(merged.every((c) => c.recallSources.length === 1 && c.recallSources[0] === "legacy_keyword"));
});

test("mergeRecallSources: vector-only pool emits vector ordering", () => {
  const merged = mergeRecallSources({
    legacyCandidates: [],
    vectorCandidates: [
      vectorCand({ rank: 1, templateCode: "V1" }),
      vectorCand({ rank: 2, templateCode: "V2" }),
      vectorCand({ rank: 3, templateCode: "V3" }),
    ],
    cap: 10,
  });
  assert.deepEqual(merged.map((c) => c.templateCode), ["V1", "V2", "V3"]);
  assert.ok(merged.every((c) => c.recallSources.length === 1 && c.recallSources[0] === "vector_image"));
});

test("mergeRecallSources: both-source candidate interleaves by min rank and dedupes", () => {
  const merged = mergeRecallSources({
    legacyCandidates: [
      legacyCand({ rank: 2, templateCode: "SHARED" }),
      legacyCand({ rank: 5, templateCode: "L_ONLY" }),
    ],
    vectorCandidates: [
      vectorCand({ rank: 1, templateCode: "SHARED" }),
      vectorCand({ rank: 3, templateCode: "V_ONLY" }),
    ],
    cap: 10,
  });
  // SHARED dedupes to one entry with rank = min(2,1) = 1 and both sources.
  const shared = merged.find((c) => c.templateCode === "SHARED");
  assert.ok(shared, "shared candidate present");
  assert.equal(shared!.rank, 1);
  assert.deepEqual(shared!.recallSources.sort(), ["legacy_keyword", "vector_image"]);
  assert.deepEqual(
    merged.map((c) => c.templateCode),
    ["SHARED", "V_ONLY", "L_ONLY"],
  );
});

test("mergeRecallSources: dedupe by templateCode yields single entry with union of sources", () => {
  const merged = mergeRecallSources({
    legacyCandidates: [legacyCand({ templateCode: "D" })],
    vectorCandidates: [vectorCand({ templateCode: "D", rank: 1 })],
    cap: 10,
  });
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0]!.recallSources.sort(), ["legacy_keyword", "vector_image"]);
});

test("mergeRecallSources: cap is respected", () => {
  const merged = mergeRecallSources({
    legacyCandidates: Array.from({ length: 5 }, (_, i) =>
      legacyCand({ rank: i + 1, templateCode: `L${i}` }),
    ),
    vectorCandidates: Array.from({ length: 5 }, (_, i) =>
      vectorCand({ rank: i + 1, templateCode: `V${i}` }),
    ),
    cap: 3,
  });
  assert.equal(merged.length, 3);
});

function createEmbeddingClient(result: VectorRecallResult): TemplateEmbeddingClient {
  return {
    queryTemplatePreview: async () => result,
  };
}

function createVectorOnlyRecall(
  candidates: VectorRecallCandidate[],
  queryText = "test",
): VectorRecallResult {
  return {
    source: "vector_image",
    queryText,
    candidates,
    error: null,
  };
}

const emptySourceClient: TooldiCatalogSourceClient = {
  async searchBackgroundAssets() {
    return { sourceFamily: "background_source", page: 1, hasNextPage: false, traceId: null, assets: [] };
  },
  async searchGraphicAssets() {
    return { sourceFamily: "graphic_source", page: 1, hasNextPage: false, traceId: null, assets: [] };
  },
  async searchPhotoAssets() {
    return { sourceFamily: "photo_source", page: 1, hasNextPage: false, traceId: null, assets: [] };
  },
  async listFontAssets() {
    return { sourceFamily: "font_source", page: 1, hasNextPage: false, traceId: null, assets: [] };
  },
  async searchTemplateAssets() {
    return { sourceFamily: "template_source", page: 1, hasNextPage: false, traceId: null, assets: [] };
  },
  async getTemplateDocument() {
    throw new TooldiCatalogSourceError({
      code: "request_failed",
      message: "no template",
      url: "test",
    });
  },
};

test("vector recall rescues a fully collapsed legacy pool", async () => {
  const vectorCandidates: VectorRecallCandidate[] = [
    vectorCand({
      rank: 1,
      templateCode: "R1-RESCUE-A",
      templateSerial: "9001",
      innerSerial: "90010",
      title: "rescue a",
      relevanceScore: 0.6,
    }),
    vectorCand({
      rank: 2,
      templateCode: "R1-RESCUE-B",
      templateSerial: "9002",
      innerSerial: "90020",
      title: "rescue b",
      relevanceScore: 0.5,
    }),
    vectorCand({
      rank: 3,
      templateCode: "R1-RESCUE-C",
      templateSerial: "9003",
      innerSerial: "90030",
      title: "rescue c",
      relevanceScore: 0.4,
    }),
  ];
  const embeddingClient = createEmbeddingClient(createVectorOnlyRecall(vectorCandidates));

  const strongReranker = async (input: { candidates: Array<{ templateCode: string }> }) => ({
    selectedTemplateCode: input.candidates[0]!.templateCode,
    summary: "rerank approved vector rescue",
    candidates: input.candidates.map((candidate, index) => ({
      templateCode: candidate.templateCode,
      relevanceScore: 0.95 - index * 0.05,
      keep: true,
      reason: "vector rescue ok",
    })),
  });

  const bundle = await buildTemplatePriorBundle(
    createHydratedPlanningInput(),
    createIntent(),
    emptySourceClient,
    strongReranker,
    embeddingClient,
  );

  assert.ok(bundle);
  assert.ok(
    bundle!.candidates.length > 0,
    "vector-only rescue must produce a non-empty final pool",
  );
  const finalCodes = bundle!.candidates.map((c) => c.templateCode);
  assert.ok(
    finalCodes.some((code) => code.startsWith("R1-RESCUE-")),
    "rescue candidates should appear in final pool",
  );
  const diagnostics = bundle!.diagnostics!;
  assert.equal(diagnostics.vectorRecallDiagnostics?.status, "executed");
  assert.ok(
    (bundle!.candidates[0]!.recallSources ?? []).includes("vector_image"),
    "final top-1 must have vector provenance",
  );
});

test("reference-first gate fires when vector-only survivor is below relevance floor", async () => {
  const vectorCandidates: VectorRecallCandidate[] = [
    vectorCand({
      rank: 1,
      templateCode: "R1-GATE-A",
      templateSerial: "9101",
      innerSerial: "91010",
      title: "weak vector",
      relevanceScore: 0.2,
    }),
  ];
  const embeddingClient = createEmbeddingClient(createVectorOnlyRecall(vectorCandidates));

  const lowRelevanceReranker = async (input: { candidates: Array<{ templateCode: string }> }) => ({
    selectedTemplateCode: input.candidates[0]!.templateCode,
    summary: "rerank kept single weak vector candidate",
    candidates: [
      {
        templateCode: input.candidates[0]!.templateCode,
        relevanceScore: 0.3,
        keep: true,
        reason: "weak kept",
      },
    ],
  });

  const bundle = await buildTemplatePriorBundle(
    createHydratedPlanningInput(),
    createIntent(),
    emptySourceClient,
    lowRelevanceReranker,
    embeddingClient,
  );

  assert.ok(bundle);
  assert.equal(
    bundle!.usedFallbackToLegacy,
    true,
    "ref-first gate must flag fallback when vector-only + low relevance",
  );
  assert.match(
    bundle!.fallbackReason ?? "",
    /reference-first gate/,
    "fallbackReason must explicitly name the gate",
  );
});

test("graceful degrade: missing embedding client reverts to pre-R1 diagnostics", async () => {
  const bundle = await buildTemplatePriorBundle(
    createHydratedPlanningInput(),
    createIntent(),
    sourceClient,
    // no rerank, no embedding client → pre-R1 behavior exactly
  );
  assert.ok(bundle);
  // When no embedding client is wired, vector recall is treated as
  // "canvas_out_of_r1_scope" equivalent — skipped entirely.
  assert.equal(
    bundle!.diagnostics?.vectorRecallDiagnostics?.status,
    "skipped",
    "skipped when no embedding client provided",
  );
});

