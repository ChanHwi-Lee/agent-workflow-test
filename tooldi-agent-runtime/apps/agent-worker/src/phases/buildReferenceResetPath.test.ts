import assert from "node:assert/strict";
import test from "node:test";

import { createTestRun } from "@tooldi/agent-testkit";

import type {
  CopyPlan,
  HydratedPlanningInput,
  SceneBindingPlan,
  TemplatePriorBundle,
} from "../types.js";
import { buildReferenceResetPath } from "./buildReferenceResetPath.js";

function createHydratedInput(): HydratedPlanningInput {
  const testRun = createTestRun({
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
    request: {
      ...testRun.request,
      workflowVariant: "retrieval_prior_v2_reset" as any,
    },
    snapshot: testRun.snapshot,
    requestRef: testRun.requestRef,
    snapshotRef: testRun.snapshotRef,
    repairContext: null,
  };
}

function createCopyPlan(): CopyPlan {
  return {
    planId: "copy-plan-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    source: "langchain",
    primaryMessage: "설레는 봄, 특별한 세일이 시작됩니다!",
    summary: "test copy plan",
    slots: [
      { key: "headline", text: "설레는 봄, 특별한 세일이 시작됩니다!", priority: "primary", required: true, maxLength: 24, toneHint: "promotional" },
      { key: "offer_line", text: "전 품목 최대 50% 할인", priority: "secondary", required: false, maxLength: 18, toneHint: "urgent" },
      { key: "cta", text: "혜택 보기", priority: "secondary", required: false, maxLength: 10, toneHint: "promotional" },
      { key: "footer_note", text: "본 행사는 재고 소진 시 조기 종료될 수 있습니다.", priority: "utility", required: false, maxLength: 40, toneHint: "informational" },
    ],
  };
}

function createLongOfferCopyPlan(): CopyPlan {
  const copyPlan = createCopyPlan();
  return {
    ...copyPlan,
    slots: copyPlan.slots.map((slot) =>
      slot.key === "offer_line"
        ? { ...slot, text: "전 품목 최대 50% 할인 혜택" }
        : slot,
    ),
  };
}

function createTemplatePriorBundle(): TemplatePriorBundle {
  return {
    bundleId: "bundle-1",
    runId: "run-1",
    traceId: "trace-1",
    workflowVariant: "retrieval_prior_v2_reset",
    query: {
      keyword: "봄 세일",
      canvas: "horizontal",
      requestedTopK: 3,
    },
    queryPlan: [{ label: "primary", keyword: "봄 세일" }],
    usedFallbackToLegacy: false,
    fallbackReason: null,
    selectedTemplateCode: "19046887349",
    selectedTemplateTitle: "봄맞이 할인 이벤트 광고",
    selectedScaffold: null,
    summary: "test prior bundle",
    candidates: [
      {
        rank: 1,
        score: 0.98,
        deterministicScore: 0.92,
        geminiScore: 0.98,
        keep: true,
        keepReason: "selected",
        rejectReason: null,
        matchedQueryLabels: ["primary"],
        templateAssetId: "asset-1",
        templateSerial: "serial-1",
        templateCode: "19046887349",
        title: "봄맞이 할인 이벤트 광고",
        categoryName: "소셜미디어 광고",
        width: 1200,
        height: 628,
        pages: 1,
        keywordTokens: ["봄", "세일"],
        thumbnailUrl: null,
        traceId: null,
        scaffold: null,
        fetchedDocument: {
          templateCode: "19046887349",
          pages: [
            {
              pageIndex: 0,
              parsed: {
                width: 1200,
                height: 628,
                objects: [
                  { id: "meta-1", type: "text", text: "SPRING SALE", left: 80, top: 48, width: 160, height: 30, fontSize: 24, textAlign: "left", fill: "#ffffff" },
                  { id: "promo-surface", type: "rect", left: 200, top: 150, width: 420, height: 72, fill: "#d9f99d", rx: 36, ry: 36 },
                  { id: "display-1", type: "text", text: "할인해", left: 420, top: 250, width: 420, height: 220, fontSize: 132, textAlign: "left", fill: "#ffffff" },
                  { id: "cta-surface", type: "rect", left: 280, top: 510, width: 620, height: 76, fill: "#8be46d", rx: 18, ry: 18 },
                  { id: "detail-1", type: "text", text: "지금 바로 확인하러 가기", left: 300, top: 520, width: 520, height: 36, fontSize: 22, textAlign: "center", fill: "#0f7035" },
                  { id: "footer-1", type: "text", text: "이벤트 기간 내 혜택 적용", left: 320, top: 586, width: 480, height: 20, fontSize: 16, textAlign: "center", fill: "#ffffff" },
                  { id: "decor-1", type: "rect", left: 1020, top: 76, width: 90, height: 90, fill: "#ffd98d", rx: 45, ry: 45 },
                ],
              },
            },
          ],
        } as any,
      },
    ],
  };
}

function createDecorHeavyTemplatePriorBundle(): TemplatePriorBundle {
  const bundle = createTemplatePriorBundle();
  const primaryCandidate = bundle.candidates[0];
  assert.ok(primaryCandidate);
  ((primaryCandidate.fetchedDocument as any).pages[0].parsed.objects as any[]).push(
    { id: "decor-2", type: "rect", left: 980, top: 420, width: 72, height: 72, fill: "#fef08a", rx: 36, ry: 36 },
    { id: "decor-3", type: "rect", left: 1030, top: 520, width: 64, height: 64, fill: "#fde68a", rx: 32, ry: 32 },
    { id: "decor-4", type: "rect", left: 1080, top: 110, width: 56, height: 56, fill: "#fef3c7", rx: 28, ry: 28 },
  );
  return bundle;
}

function createRealLikeTemplatePriorBundle(): TemplatePriorBundle {
  const bundle = createTemplatePriorBundle();
  const primaryCandidate = bundle.candidates[0];
  assert.ok(primaryCandidate);
  (primaryCandidate.fetchedDocument as any).pages[0].parsed = {
    width: 787,
    height: 817,
    objects: [
      { id: "rect-top-left", type: "rect", left: -540.1534573666622, top: 197.1957108877889, width: 100, height: 100, originX: "left", originY: "top", fill: { type: "linear", colorStops: [{ color: "rgb(107,211,87)" }, { color: "rgb(216,255,156)" }] } },
      { id: "decor-top-right", type: "image", left: 332.9405973649491, top: -174.68085902474894, width: 2600, height: 2012, originX: "left", originY: "top", originSrc: "https://example.com/decor.png", fill: "rgb(0,0,0)" },
      { id: "meta-1", type: "textbox", text: "4. 1 ~ 4. 16", left: 72.22305336721655, top: -183.1882304334586, width: 217.9786001384255, height: 44.06999999999999, originX: "right", originY: "top", textAlign: "center", fill: "#ffffff" },
      { id: "offer-text", type: "textbox", text: "전제품 최대 30%", left: -136.74815363626868, top: -121.89064342718689, width: 386.4766271402143, height: 54.239999999999995, originX: "center", originY: "top", textAlign: "center", fill: "#0f7035" },
      { id: "display-main", type: "textbox", text: "할인해", left: -136.74815363626868, top: -29.625431439238525, width: 539.410160243073, height: 202.26999999999998, originX: "center", originY: "top", textAlign: "center", fill: "#ffffff" },
      { id: "display-secondary", type: "textbox", text: "봄", left: 298.1038449594805, top: -162.2450399924603, width: 341.79041220414024, height: 357.08, originX: "center", originY: "top", textAlign: "center", fill: "#ffffff" },
      { id: "cta-text", type: "textbox", text: "지금 바로 확인하러 가기 ▶", left: -138.9143617283997, top: 213.20321358801493, width: 406.7703726421612, height: 41.809999999999995, originX: "center", originY: "top", textAlign: "center", fill: "#0f7035" },
      { id: "decor-dot", type: "rect", left: -383.07943396883456, top: -134.0536990119939, width: 100, height: 100, originX: "left", originY: "top", fill: "rgba(255, 245, 156, 255)" },
    ],
  };
  return bundle;
}

function createSafeCueTemplatePriorBundle(): TemplatePriorBundle {
  const bundle = createRealLikeTemplatePriorBundle();
  const primaryCandidate = bundle.candidates[0];
  assert.ok(primaryCandidate);
  (primaryCandidate.fetchedDocument as any).pages[0].parsed.objects = [
    { id: "offer-text", type: "textbox", text: "전제품 최대 30%", left: 390, top: 132, width: 320, height: 48, originX: "center", originY: "top", textAlign: "center", fill: "#0f7035" },
    { id: "display-main", type: "textbox", text: "특별한 세일", left: 600, top: 188, width: 420, height: 160, originX: "center", originY: "top", textAlign: "center", fill: "#ffffff" },
    { id: "cta-text", type: "textbox", text: "지금 바로 확인하러 가기 ▶", left: 395, top: 620, width: 420, height: 40, originX: "center", originY: "top", textAlign: "center", fill: "#0f7035" },
    { id: "footer-1", type: "textbox", text: "이벤트 기간 내 혜택 적용", left: 395, top: 740, width: 420, height: 24, originX: "center", originY: "top", textAlign: "center", fill: "#ffffff" },
    { id: "decor-dot", type: "rect", left: 655, top: 66, width: 90, height: 90, originX: "left", originY: "top", fill: "rgba(255, 245, 156, 255)" },
  ];
  return bundle;
}

function createUnsafeStableTemplatePriorBundle(): TemplatePriorBundle {
  const bundle = createTemplatePriorBundle();
  const primaryCandidate = bundle.candidates[0];
  assert.ok(primaryCandidate);
  (primaryCandidate.fetchedDocument as any).pages[0].parsed = {
    width: 1200,
    height: 628,
    objects: [
      { id: "promo-surface", type: "rect", left: 180, top: 126, width: 420, height: 72, fill: "#d9f99d", rx: 36, ry: 36 },
      { id: "display-main", type: "text", text: "특별한 세일", left: 84, top: 168, width: 620, height: 240, fontSize: 110, textAlign: "left", fill: "#ffffff" },
      { id: "cta-surface", type: "rect", left: 252, top: 360, width: 696, height: 72, fill: "#8be46d", rx: 18, ry: 18 },
      { id: "footer-1", type: "text", text: "이벤트 기간 내 혜택 적용", left: 320, top: 586, width: 480, height: 20, fontSize: 16, textAlign: "center", fill: "#ffffff" },
    ],
  };
  return bundle;
}

function createSceneBindingPlan(
  overrides: Partial<SceneBindingPlan> = {},
): SceneBindingPlan {
  return {
    planId: "binding-1",
    runId: "run-1",
    traceId: "trace-1",
    workflowVariant: "retrieval_prior_v2_reset",
    selectedTemplateCode: "19046887349",
    selectedTemplateTitle: "봄맞이 할인 이벤트 광고",
    backgroundMode: "pastel_gradient",
    backgroundColorHex: "#6c9b36",
    secondaryBackgroundColorHex: "#81dc47",
    primaryTextColorHex: "#ffffff",
    secondaryTextColorHex: "#ffffff",
    accentTextColorHex: "#6bd357",
    inverseTextColorHex: "#ffffff",
    promoSurfaceColorHex: "#b4ec78",
    promoTextColorHex: "#1c5d40",
    promoTextColorSource: "reference",
    ctaSurfaceColorHex: "#6bd357",
    ctaTextColorHex: "#ffffff",
    ctaShapeLanguage: "transparent_band",
    preferredDecorationMode: "promo_multi_graphic",
    preferredAccentDensity: "medium",
    preferredBadgeProminence: "dominant",
    preferredCtaTreatment: "framed",
    motifTags: ["abstract"],
    includeRibbon: false,
    includeFrame: false,
    summary: "binding",
    ...overrides,
  };
}

test("buildReferenceResetPath creates reset artifacts and freeform execution carrier", () => {
  const result = buildReferenceResetPath(
    createHydratedInput(),
    createTemplatePriorBundle(),
    createCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.ok(result.referenceBlockGraph);
  assert.equal(result.referenceBlockGraph?.workflowVariant, "retrieval_prior_v2_reset");
  assert.ok(result.messageAtomPlan);
  assert.equal(
    result.messageAtomPlan?.atoms.some((atom) => atom.kind === "support"),
    false,
  );
  assert.ok(result.blockBindingPlan);
  assert.ok(result.editableBlockPlan);
  assert.ok(result.freeformLayoutPlan);
  assert.equal(result.freeformLayoutPlan?.workflowVariant, "retrieval_prior_v2_reset");
  assert.ok(result.freeformLayoutPlan?.copyBlocks.some((block) => block.executionSlotKey === "headline"));
  assert.ok(result.freeformLayoutPlan?.copyBlocks.some((block) => block.executionSlotKey === "cta"));
  assert.ok((result.freeformLayoutPlan?.polishBlocks.length ?? 0) >= 1);
  const promoSurface = result.freeformLayoutPlan?.copyBlocks.find((block) => block.variantKey === "reset_promo_surface");
  const promoText = result.freeformLayoutPlan?.copyBlocks.find((block) => block.executionSlotKey === "offer_line");
  assert.equal(promoSurface?.styleTokens?.fillColor, "#b4ec78");
  assert.equal(promoText?.styleTokens?.fillColor, "#1c5d40");
  assert.ok(result.qualityEvalSummary);
});

test("buildReferenceResetPath downgrades to style-only when the reference lacks semantic surfaces", () => {
  const bundle = createTemplatePriorBundle();
  const primaryCandidate = bundle.candidates[0];
  assert.ok(primaryCandidate);
  (primaryCandidate.fetchedDocument as any).pages[0].parsed.objects = [
    { id: "display-1", type: "text", text: "할인해", left: 420, top: 250, width: 420, height: 220, fontSize: 132, textAlign: "left", fill: "#ffffff" },
    { id: "meta-1", type: "text", text: "SPRING SALE", left: 80, top: 48, width: 160, height: 30, fontSize: 24, textAlign: "left", fill: "#ffffff" },
  ];

  const result = buildReferenceResetPath(
    createHydratedInput(),
    bundle,
    createCopyPlan(),
    null,
    createSceneBindingPlan({
      promoSurfaceColorHex: "#6bd357",
      promoTextColorHex: "#6bd357",
      promoTextColorSource: "contrast_fallback",
    }),
  );

  assert.equal(result.freeformLayoutPlan?.compositionStatus, "style_only");
  assert.equal(result.styleDowngradeVerdict?.applied, true);
  assert.match(result.styleDowngradeVerdict?.reason ?? "", /semantic promo\/CTA surface/);
});

test("buildReferenceResetPath records promo contrast fallback in quality summary", () => {
  const result = buildReferenceResetPath(
    createHydratedInput(),
    createTemplatePriorBundle(),
    createCopyPlan(),
    null,
    createSceneBindingPlan({
      promoSurfaceColorHex: "#6bd357",
      promoTextColorHex: "#111111",
      promoTextColorSource: "contrast_fallback",
    }),
  );

  assert.ok(
    result.qualityEvalSummary?.warnings.includes("promo_contrast_fallback_applied"),
  );
});

test("buildReferenceResetPath expands or wraps long promo text without overflowing in style-only mode", () => {
  const result = buildReferenceResetPath(
    createHydratedInput(),
    createRealLikeTemplatePriorBundle(),
    createLongOfferCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.equal(result.freeformLayoutPlan?.compositionStatus, "style_only");
  const promoSurface = result.freeformLayoutPlan?.copyBlocks.find(
    (block) => block.variantKey === "reset_style_promo_surface",
  );
  const promoText = result.freeformLayoutPlan?.copyBlocks.find(
    (block) => block.executionSlotKey === "offer_line",
  );
  assert.ok(promoSurface);
  assert.ok(promoText);
  assert.ok(
    result.qualityEvalSummary?.warnings.includes("safe_decor_skipped_due_to_style_only"),
  );
  assert.ok(
    result.qualityEvalSummary?.warnings.includes("promo_band_width_expanded") ||
      result.qualityEvalSummary?.warnings.includes("promo_wrapped_to_two_lines"),
  );
  assert.ok((promoText?.bounds.width ?? 0) <= (promoSurface?.bounds.width ?? 0));
  assert.ok((promoText?.bounds.height ?? 0) < (promoSurface?.bounds.height ?? 0));
  assert.ok((promoText?.bounds.y ?? 0) >= (promoSurface?.bounds.y ?? 0));
  assert.ok(
    (promoText?.bounds.y ?? 0) + (promoText?.bounds.height ?? 0) <=
      (promoSurface?.bounds.y ?? 0) + (promoSurface?.bounds.height ?? 0),
  );
});

test("buildReferenceResetPath keeps promo surface driven by final text box in style-only mode", () => {
  const result = buildReferenceResetPath(
    createHydratedInput(),
    createRealLikeTemplatePriorBundle(),
    createLongOfferCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  const promoSurface = result.freeformLayoutPlan?.copyBlocks.find(
    (block) => block.variantKey === "reset_style_promo_surface",
  );
  const promoText = result.freeformLayoutPlan?.copyBlocks.find(
    (block) => block.executionSlotKey === "offer_line",
  );

  assert.ok(promoSurface);
  assert.ok(promoText);
  assert.ok((promoText?.fontSize ?? 0) <= 42);
  assert.ok((promoSurface?.bounds.width ?? 0) >= (promoText?.bounds.width ?? 0) + 40);
  assert.ok((promoSurface?.bounds.height ?? 0) >= (promoText?.bounds.height ?? 0) + 16);
});

test("buildReferenceResetPath uses a non-overlapping vertical stack in style-only mode", () => {
  const result = buildReferenceResetPath(
    createHydratedInput(),
    createRealLikeTemplatePriorBundle(),
    createLongOfferCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.equal(result.freeformLayoutPlan?.compositionStatus, "style_only");
  assert.ok(
    result.qualityEvalSummary?.warnings.includes("style_only_simple_readable_layout_applied"),
  );

  const promoSurface = result.freeformLayoutPlan?.copyBlocks.find(
    (block) => block.variantKey === "reset_style_promo_surface",
  );
  const headline = result.freeformLayoutPlan?.copyBlocks.find(
    (block) => block.executionSlotKey === "headline",
  );
  const cta = result.freeformLayoutPlan?.copyBlocks.find(
    (block) => block.executionSlotKey === "cta",
  );
  const footer = result.freeformLayoutPlan?.copyBlocks.find(
    (block) => block.executionSlotKey === "footer_note",
  );

  assert.ok(promoSurface);
  assert.ok(headline);
  assert.ok(cta);
  assert.ok(footer);
  assert.ok((promoSurface?.bounds.y ?? 0) + (promoSurface?.bounds.height ?? 0) < (headline?.bounds.y ?? 0));
  assert.ok((headline?.bounds.y ?? 0) + (headline?.bounds.height ?? 0) < (cta?.bounds.y ?? 0));
  assert.ok((cta?.bounds.y ?? 0) + (cta?.bounds.height ?? 0) < (footer?.bounds.y ?? 0));
  assert.ok((headline?.fontSize ?? 0) < 96);
});

test("buildReferenceResetPath downgrades to style-only when only unsafe display candidates survive", () => {
  const result = buildReferenceResetPath(
    createHydratedInput(),
    createRealLikeTemplatePriorBundle(),
    createCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.equal(result.freeformLayoutPlan?.compositionStatus, "style_only");
  assert.equal(result.styleDowngradeVerdict?.applied, true);
  assert.match(result.styleDowngradeVerdict?.reason ?? "", /safe dominant display/);
});

test("buildReferenceResetPath keeps stable composition when text-only semantic cues exist with a safe display target", () => {
  const result = buildReferenceResetPath(
    createHydratedInput(),
    createSafeCueTemplatePriorBundle(),
    createCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.equal(result.freeformLayoutPlan?.compositionStatus, "stable");
  assert.equal(result.styleDowngradeVerdict?.applied, false);
  const headline = result.freeformLayoutPlan?.copyBlocks.find((block) => block.executionSlotKey === "headline");
  const promo = result.freeformLayoutPlan?.copyBlocks.find((block) => block.executionSlotKey === "offer_line");
  const cta = result.freeformLayoutPlan?.copyBlocks.find((block) => block.executionSlotKey === "cta");
  assert.ok(headline);
  assert.ok(promo);
  assert.ok(cta);
  assert.ok((headline?.bounds.y ?? -1) >= 0);
  assert.ok((promo?.bounds.y ?? -1) >= 60);
  assert.ok((promo?.bounds.y ?? 999) <= 190);
  assert.ok((cta?.bounds.y ?? -1) >= 420);
  assert.ok(
    (result.freeformLayoutPlan?.polishBlocks ?? []).every(
      (block) => block.bounds.x >= 0 && block.bounds.y >= 0,
    ),
  );
});

test("buildReferenceResetPath keeps at most two safe decor blocks in stable mode", () => {
  const result = buildReferenceResetPath(
    createHydratedInput(),
    createDecorHeavyTemplatePriorBundle(),
    createCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.equal(result.freeformLayoutPlan?.compositionStatus, "stable");
  assert.ok((result.freeformLayoutPlan?.polishBlocks.length ?? 0) <= 2);
});

test("buildReferenceResetPath downgrades unsafe stable candidates after renderability guard", () => {
  const result = buildReferenceResetPath(
    createHydratedInput(),
    createUnsafeStableTemplatePriorBundle(),
    createCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.equal(result.freeformLayoutPlan?.compositionStatus, "style_only");
  assert.equal(result.styleDowngradeVerdict?.applied, true);
  assert.match(result.styleDowngradeVerdict?.reason ?? "", /renderability guard/);
  assert.ok(
    result.qualityEvalSummary?.warnings.includes(
      "downgraded_to_style_only_after_renderability_guard",
    ),
  );
  assert.ok(
    result.qualityEvalSummary?.warnings.includes(
      "stable_candidate_rejected_due_to_semantic_overlap",
    ),
  );
});

test("buildReferenceResetPath keeps safe stable candidates after renderability guard", () => {
  const result = buildReferenceResetPath(
    createHydratedInput(),
    createSafeCueTemplatePriorBundle(),
    createCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.equal(result.freeformLayoutPlan?.compositionStatus, "stable");
  assert.equal(result.styleDowngradeVerdict?.applied, false);
  assert.equal(
    result.qualityEvalSummary?.warnings.includes(
      "downgraded_to_style_only_after_renderability_guard",
    ),
    false,
  );
});
