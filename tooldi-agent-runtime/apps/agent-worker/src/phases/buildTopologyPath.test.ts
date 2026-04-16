import assert from "node:assert/strict";
import test from "node:test";

import { createTestRun } from "@tooldi/agent-testkit";

import type {
  CopyPlan,
  HydratedPlanningInput,
  SceneBindingPlan,
  TemplatePriorBundle,
} from "../types.js";
import { buildTopologyPath } from "./buildTopologyPath.js";

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
      workflowVariant: "topology_v1" as const,
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
    workflowVariant: "topology_v1",
    selectedTemplateCode: "template-band",
    selectedTemplateTitle: "band reference",
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

function createBandAndCenterBundle(): TemplatePriorBundle {
  return {
    bundleId: "bundle-1",
    runId: "run-1",
    traceId: "trace-1",
    workflowVariant: "topology_v1",
    query: {
      keyword: "봄 세일",
      canvas: "horizontal",
      requestedTopK: 3,
    },
    queryPlan: [{ label: "primary", keyword: "봄 세일" }],
    usedFallbackToLegacy: false,
    fallbackReason: null,
    selectedTemplateCode: "template-band",
    selectedTemplateTitle: "band reference",
    selectedScaffold: null,
    summary: "topology test prior bundle",
    candidates: [
      {
        rank: 1,
        score: 1.2,
        deterministicScore: 0.9,
        geminiScore: 0.9,
        keep: true,
        keepReason: "selected",
        rejectReason: null,
        matchedQueryLabels: ["primary"],
        templateAssetId: "asset-band",
        templateSerial: "serial-band",
        templateCode: "template-band",
        title: "band reference",
        categoryName: "소셜미디어 광고",
        width: 1200,
        height: 628,
        pages: 1,
        keywordTokens: ["봄", "세일"],
        thumbnailUrl: null,
        traceId: null,
        scaffold: null,
        fetchedDocument: {
          templateCode: "template-band",
          pages: [
            {
              pageIndex: 0,
              parsed: {
                width: 1200,
                height: 628,
                objects: [
                  { id: "display-1", type: "text", text: "SPRING SALE", left: 280, top: 200, width: 600, height: 140, fontSize: 96, textAlign: "center", fill: "#ffffff" },
                  { id: "promo-band", type: "rect", left: 350, top: 84, width: 500, height: 84, fill: "#f4f1b1" },
                  { id: "cta-band", type: "rect", left: 390, top: 500, width: 420, height: 68, fill: "#b4ec78" },
                ],
              },
            },
          ],
        } as any,
      },
      {
        rank: 2,
        score: 1.1,
        deterministicScore: 0.88,
        geminiScore: 0.88,
        keep: true,
        keepReason: "backup",
        rejectReason: null,
        matchedQueryLabels: ["primary"],
        templateAssetId: "asset-center",
        templateSerial: "serial-center",
        templateCode: "template-center",
        title: "center reference",
        categoryName: "소셜미디어 광고",
        width: 1200,
        height: 628,
        pages: 1,
        keywordTokens: ["봄", "세일"],
        thumbnailUrl: null,
        traceId: null,
        scaffold: null,
        fetchedDocument: {
          templateCode: "template-center",
          pages: [
            {
              pageIndex: 0,
              parsed: {
                width: 1200,
                height: 628,
                objects: [
                  { id: "display-1", type: "text", text: "봄 세일", left: 300, top: 150, width: 600, height: 140, fontSize: 92, textAlign: "center", fill: "#ffffff" },
                  { id: "support-1", type: "text", text: "이번 주 한정 특별 혜택", left: 360, top: 324, width: 480, height: 56, fontSize: 34, textAlign: "center", fill: "#ffffff" },
                  { id: "detail-1", type: "text", text: "본 행사는 재고 소진 시 종료됩니다.", left: 330, top: 578, width: 540, height: 20, fontSize: 16, textAlign: "center", fill: "#ffffff" },
                ],
              },
            },
          ],
        } as any,
      },
    ],
  };
}

function createCenterOnlyBundle(): TemplatePriorBundle {
  const bundle = createBandAndCenterBundle();
  bundle.candidates = [bundle.candidates[1]!];
  bundle.selectedTemplateCode = "template-center";
  bundle.selectedTemplateTitle = "center reference";
  return bundle;
}

test("buildTopologyPath selects band_overlay_promo for a band-led reference", () => {
  const result = buildTopologyPath(
    createHydratedInput(),
    createBandAndCenterBundle(),
    createCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.equal(result.topologySelection.selectedTopologyId, "band_overlay_promo");
  assert.equal(result.topologySelection.selectedReadiness, "stable_capable");
  assert.equal(result.topologyCompletionReport.passed, true);
  assert.equal(result.freeformLayoutPlan?.workflowVariant, "topology_v1");
  assert.ok(
    result.freeformLayoutPlan?.copyBlocks.some(
      (block) => block.topologyCapabilityId === "accent_band",
    ),
  );
});

test("buildTopologyPath allows centered_message_stack to complete without CTA", () => {
  const result = buildTopologyPath(
    createHydratedInput(),
    createCenterOnlyBundle(),
    createCopyPlan(),
    null,
    createSceneBindingPlan(),
  );

  assert.equal(result.topologySelection.selectedTopologyId, "centered_message_stack");
  assert.equal(result.topologySelection.selectedReadiness, "stable_capable");
  assert.equal(result.topologyCompletionReport.passed, true);
  assert.equal(
    result.topologyCompletionReport.completionContract?.requiresActionCapability,
    false,
  );
  assert.ok(
    result.topologyCompletionReport.presentCapabilityIds.includes("focal_text"),
  );
  assert.ok(
    result.topologyCompletionReport.presentCapabilityIds.includes("supporting_text"),
  );
});
