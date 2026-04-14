import assert from "node:assert/strict";
import test from "node:test";

import { createTestRun } from "@tooldi/agent-testkit";

import type {
  CopyPlan,
  HydratedPlanningInput,
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

test("buildReferenceResetPath creates reset artifacts and freeform execution carrier", () => {
  const result = buildReferenceResetPath(
    createHydratedInput(),
    createTemplatePriorBundle(),
    createCopyPlan(),
    null,
    null,
  );

  assert.ok(result.referenceBlockGraph);
  assert.equal(result.referenceBlockGraph?.workflowVariant, "retrieval_prior_v2_reset");
  assert.ok(result.messageAtomPlan);
  assert.ok(result.blockBindingPlan);
  assert.ok(result.editableBlockPlan);
  assert.ok(result.freeformLayoutPlan);
  assert.equal(result.freeformLayoutPlan?.workflowVariant, "retrieval_prior_v2_reset");
  assert.ok(result.freeformLayoutPlan?.copyBlocks.some((block) => block.executionSlotKey === "headline"));
  assert.ok(result.freeformLayoutPlan?.copyBlocks.some((block) => block.executionSlotKey === "cta"));
  assert.ok(result.qualityEvalSummary);
});
