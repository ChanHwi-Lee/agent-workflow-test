import assert from "node:assert/strict";
import test from "node:test";

import { createTestRun } from "@tooldi/agent-testkit";

import type {
  CopyPlan,
  HydratedPlanningInput,
  SceneBindingPlan,
  TemplatePriorBundle,
} from "../types.js";
import { buildObjectNativePath } from "./buildObjectNativePath.js";

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
      workflowVariant: "object_native_v1" as const,
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

function createSceneBindingPlan(): SceneBindingPlan {
  return {
    planId: "binding-1",
    runId: "run-1",
    traceId: "trace-1",
    workflowVariant: "object_native_v1",
    selectedTemplateCode: "template-weak",
    selectedTemplateTitle: "weak reference",
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
  };
}

function createObjectNativeTemplatePriorBundle(): TemplatePriorBundle {
  return {
    bundleId: "bundle-1",
    runId: "run-1",
    traceId: "trace-1",
    workflowVariant: "object_native_v1",
    query: {
      keyword: "봄 세일",
      canvas: "horizontal",
      requestedTopK: 3,
    },
    queryPlan: [{ label: "primary", keyword: "봄 세일" }],
    usedFallbackToLegacy: false,
    fallbackReason: null,
    selectedTemplateCode: "template-weak",
    selectedTemplateTitle: "weak reference",
    selectedScaffold: null,
    summary: "object native test prior bundle",
    candidates: [
      {
        rank: 1,
        score: 0.96,
        deterministicScore: 0.91,
        geminiScore: 0.96,
        keep: true,
        keepReason: "selected",
        rejectReason: null,
        matchedQueryLabels: ["primary"],
        templateAssetId: "asset-weak",
        templateSerial: "serial-weak",
        templateCode: "template-weak",
        title: "weak reference",
        categoryName: "소셜미디어 광고",
        width: 1200,
        height: 628,
        pages: 1,
        keywordTokens: ["봄", "세일"],
        thumbnailUrl: null,
        traceId: null,
        scaffold: null,
        fetchedDocument: {
          templateCode: "template-weak",
          pages: [
            {
              pageIndex: 0,
              parsed: {
                width: 1200,
                height: 628,
                objects: [
                  { id: "meta-1", type: "text", text: "SPRING SALE", left: 80, top: 48, width: 160, height: 30, fontSize: 24, textAlign: "left", fill: "#ffffff" },
                  { id: "display-1", type: "text", text: "할인해", left: 420, top: 250, width: 420, height: 220, fontSize: 132, textAlign: "left", fill: "#ffffff" },
                  { id: "footer-1", type: "text", text: "이벤트 기간 내 혜택 적용", left: 320, top: 586, width: 480, height: 20, fontSize: 16, textAlign: "center", fill: "#ffffff" },
                ],
              },
            },
          ],
        } as any,
      },
      {
        rank: 2,
        score: 1.25,
        deterministicScore: 0.84,
        geminiScore: 0.88,
        keep: true,
        keepReason: "backup",
        rejectReason: null,
        matchedQueryLabels: ["primary"],
        templateAssetId: "asset-stable",
        templateSerial: "serial-stable",
        templateCode: "template-stable",
        title: "stable reference",
        categoryName: "소셜미디어 광고",
        width: 1200,
        height: 628,
        pages: 1,
        keywordTokens: ["봄", "세일"],
        thumbnailUrl: null,
        traceId: null,
        scaffold: null,
        fetchedDocument: {
          templateCode: "template-stable",
          pages: [
            {
              pageIndex: 0,
              parsed: {
                width: 787,
                height: 817,
                objects: [
                  { id: "offer-text", type: "textbox", text: "전제품 최대 30%", left: 390, top: 132, width: 320, height: 48, originX: "center", originY: "top", textAlign: "center", fill: "#0f7035" },
                  { id: "display-main", type: "textbox", text: "특별한 세일", left: 600, top: 188, width: 420, height: 160, originX: "center", originY: "top", textAlign: "center", fill: "#ffffff" },
                  { id: "cta-text", type: "textbox", text: "지금 바로 확인하러 가기 ▶", left: 395, top: 620, width: 420, height: 40, originX: "center", originY: "top", textAlign: "center", fill: "#0f7035" },
                  { id: "footer-1", type: "textbox", text: "이벤트 기간 내 혜택 적용", left: 395, top: 740, width: 420, height: 24, originX: "center", originY: "top", textAlign: "center", fill: "#ffffff" },
                  { id: "decor-dot", type: "rect", left: 655, top: 66, width: 90, height: 90, originX: "left", originY: "top", fill: "rgba(255, 245, 156, 255)" },
                ],
              },
            },
          ],
        } as any,
      },
    ],
  };
}

function createNoStableObjectNativeTemplatePriorBundle(): TemplatePriorBundle {
  const bundle = createObjectNativeTemplatePriorBundle();
  const fallbackCandidate = bundle.candidates[1];
  assert.ok(fallbackCandidate);
  (fallbackCandidate.fetchedDocument as any).pages[0].parsed.objects = [
    { id: "meta-1", type: "text", text: "SPRING SALE", left: 80, top: 48, width: 160, height: 30, fontSize: 24, textAlign: "left", fill: "#ffffff" },
    { id: "display-1", type: "text", text: "할인해", left: 420, top: 250, width: 420, height: 220, fontSize: 132, textAlign: "left", fill: "#ffffff" },
    { id: "footer-1", type: "text", text: "이벤트 기간 내 혜택 적용", left: 320, top: 586, width: 480, height: 20, fontSize: 16, textAlign: "center", fill: "#ffffff" },
  ];
  return bundle;
}

function createArtifactLikeObjectNativeTemplatePriorBundle(): TemplatePriorBundle {
  const bundle = createObjectNativeTemplatePriorBundle();
  bundle.candidates = [
    {
      ...bundle.candidates[0]!,
      templateCode: "template-artifact-like",
      title: "artifact like reference",
      fetchedDocument: {
        templateCode: "template-artifact-like",
        pages: [
          {
            pageIndex: 0,
            parsed: {
              width: 787,
              height: 817,
              objects: [
                { id: "decor-top-right", type: "image", left: 332.9405973649491, top: -174.68085902474894, width: 2600, height: 2012, originX: "left", originY: "top", originSrc: "https://example.com/decor.png", fill: "rgb(0,0,0)" },
                { id: "offer-text", type: "textbox", text: "전제품 최대 30%", left: -136.74815363626868, top: -121.89064342718689, width: 386.4766271402143, height: 54.239999999999995, originX: "center", originY: "top", textAlign: "center", fill: "#0f7035", fontSize: 48 },
                { id: "display-main", type: "textbox", text: "할인해", left: -136.74815363626868, top: -29.625431439238525, width: 539.410160243073, height: 202.26999999999998, originX: "center", originY: "top", textAlign: "center", fill: "#ffffff", fontSize: 179 },
                { id: "display-secondary", type: "textbox", text: "봄", left: 298.1038449594805, top: -162.2450399924603, width: 341.79041220414024, height: 357.08, originX: "center", originY: "top", textAlign: "center", fill: "#ffffff", fontSize: 316 },
                { id: "cta-text", type: "textbox", text: "지금 바로 확인하러 가기 ▶", left: -138.9143617283997, top: 213.20321358801493, width: 406.7703726421612, height: 41.809999999999995, originX: "center", originY: "top", textAlign: "center", fill: "#0f7035", fontSize: 37 },
                { id: "decor-dot", type: "rect", left: -383.07943396883456, top: -134.0536990119939, width: 100, height: 100, originX: "left", originY: "top", fill: "rgba(255, 245, 156, 255)" },
              ],
            },
          },
        ],
      } as any,
    },
  ];
  bundle.selectedTemplateCode = "template-artifact-like";
  bundle.selectedTemplateTitle = "artifact like reference";
  return bundle;
}

test("buildObjectNativePath can reselect a stable-capable candidate", () => {
  const result = buildObjectNativePath(
    createHydratedInput(),
    createObjectNativeTemplatePriorBundle(),
    createCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.equal(
    result.objectNativeCandidateSelection.reselectionApplied,
    true,
  );
  assert.equal(
    result.objectNativeCandidateSelection.nextSelectedTemplateCode,
    "template-stable",
  );
  assert.equal(result.objectNativeRenderabilityReport.passed, true);
  assert.equal(
    result.objectNativeRenderabilityReport.failureStage,
    "none",
  );
  assert.equal(result.freeformLayoutPlan?.workflowVariant, "object_native_v1");
  assert.equal(result.freeformLayoutPlan?.compositionStatus, "stable");
  assert.equal(result.freeformLayoutPlan?.selectedTemplateCode, "template-stable");
  assert.ok(
    result.objectNativeReferenceAudit.entries.some(
      (entry) =>
        entry.templateCode === "template-weak" &&
        entry.failureStage === "semantic_gate_failure" &&
        entry.readiness === "fallback_only",
    ),
  );
  assert.ok(
    result.objectNativeReferenceAudit.entries.some(
      (entry) =>
        entry.templateCode === "template-stable" &&
        entry.failureStage === "none" &&
        entry.readiness === "stable_capable",
    ),
  );
  assert.equal(
    result.objectNativeCandidateSelection.selectedFailureStage,
    "none",
  );
  assert.deepEqual(
    result.objectNativeCandidateSelection.selectedDiagnostics?.missingClusterFamilies ?? [],
    [],
  );
  assert.equal(
    result.objectNativeCandidateSelection.selectedDiagnostics?.bindingCoverage.boundRequiredAtomCount,
    3,
  );
  assert.equal(
    result.objectNativeCandidateSelection.selectedDiagnostics?.renderabilityMetrics.evaluated,
    true,
  );
  const ctaBlock = result.editableBlockPlan?.blocks.find(
    (block) => block.executionSlotKey === "cta",
  );
  assert.equal(
    ctaBlock?.styleTokens?.ctaShapeLanguage,
    "transparent_band",
  );
  assert.equal(
    result.objectNativeCandidateSelection.reason,
    "stable_capable_candidate_reselected",
  );
});

test("buildObjectNativePath keeps the original selection when no stable-capable candidate exists", () => {
  const result = buildObjectNativePath(
    createHydratedInput(),
    createNoStableObjectNativeTemplatePriorBundle(),
    createCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.equal(result.objectNativeCandidateSelection.reselectionApplied, false);
  assert.equal(result.objectNativeCandidateSelection.nextSelectedTemplateCode, "template-weak");
  assert.equal(result.objectNativeRenderabilityReport.passed, false);
  assert.equal(result.objectNativeRenderabilityReport.failureStage, "semantic_gate_failure");
  assert.equal(result.freeformLayoutPlan?.compositionStatus, "style_only");
  assert.deepEqual(
    result.objectNativeCandidateSelection.selectedDiagnostics?.missingClusterFamilies,
    ["promo_band"],
  );
  assert.equal(
    result.objectNativeCandidateSelection.selectedDiagnostics?.semanticGateReason,
    "missing_cluster_family",
  );
  assert.equal(result.objectNativeCandidateSelection.reason, "no_stable_candidate_reused_existing_selection");
});

test("buildObjectNativePath keeps a wide short promo headline despite a decorative neighboring glyph", () => {
  const result = buildObjectNativePath(
    createHydratedInput(),
    createArtifactLikeObjectNativeTemplatePriorBundle(),
    createCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.notEqual(
    result.objectNativeCandidateSelection.selectedFailureStage,
    "semantic_gate_failure",
  );
  assert.deepEqual(
    result.objectNativeCandidateSelection.selectedDiagnostics?.missingClusterFamilies ?? [],
    [],
  );
  assert.equal(
    result.objectNativeCandidateSelection.selectedDiagnostics?.semanticGateReason,
    "none",
  );
  assert.ok(
    result.qualityEvalSummary?.warnings.includes(
      "reference_display_candidate_rejected_as_decorative",
    ),
  );
  assert.ok(
    result.referenceBlockGraph?.blocks.some(
      (block) => block.kind === "display_text" && block.sourceText === "할인해",
    ),
  );
});

test("buildObjectNativePath records detection-miss diagnostics for decorative display candidates", () => {
  const bundle = createObjectNativeTemplatePriorBundle();
  bundle.candidates = [
    {
      ...bundle.candidates[0]!,
      templateCode: "template-detection-miss",
      title: "detection miss reference",
      fetchedDocument: {
        templateCode: "template-detection-miss",
        pages: [
          {
            pageIndex: 0,
            parsed: {
              width: 1200,
              height: 628,
              objects: [
                {
                  id: "decorative-display",
                  type: "text",
                  text: "봄",
                  left: 540,
                  top: 220,
                  width: 280,
                  height: 220,
                  fontSize: 128,
                  textAlign: "center",
                  fill: "#ffffff",
                },
                {
                  id: "promo-band",
                  type: "rect",
                  left: 220,
                  top: 96,
                  width: 420,
                  height: 72,
                  fill: "#f4f1b1",
                },
                {
                  id: "cta-band",
                  type: "rect",
                  left: 252,
                  top: 516,
                  width: 420,
                  height: 72,
                  fill: "#b4ec78",
                },
              ],
            },
          },
        ],
      } as any,
    },
  ];
  bundle.selectedTemplateCode = "template-detection-miss";
  bundle.selectedTemplateTitle = "detection miss reference";

  const result = buildObjectNativePath(
    createHydratedInput(),
    bundle,
    createCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.equal(
    result.objectNativeCandidateSelection.selectedFailureStage,
    "semantic_gate_failure",
  );
  assert.equal(
    result.objectNativeCandidateSelection.selectedDiagnostics?.semanticGateReason,
    "detection_miss",
  );
  assert.deepEqual(
    result.objectNativeCandidateSelection.selectedDiagnostics?.missingClusterFamilies,
    ["big_text"],
  );
});
