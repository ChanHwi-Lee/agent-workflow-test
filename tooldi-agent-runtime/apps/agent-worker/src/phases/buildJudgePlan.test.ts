import assert from "node:assert/strict";
import test from "node:test";

import type { ExecutablePlan } from "@tooldi/agent-contracts";

import type {
  ConcreteLayoutPlan,
  CopyPlan,
  ExecutionSceneSummary,
  RuleJudgeVerdict,
} from "../types.js";
import { buildJudgePlan } from "./buildJudgePlan.js";

function createCopyPlan(): CopyPlan {
  return {
    planId: "copy-plan-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    source: "heuristic",
    slots: [
      { key: "headline", text: "봄 세일", priority: "primary", required: true, maxLength: 20, toneHint: "promotional" },
      { key: "subheadline", text: "혜택을 확인하세요", priority: "secondary", required: true, maxLength: 28, toneHint: "informational" },
      { key: "cta", text: "혜택 보기", priority: "secondary", required: true, maxLength: 16, toneHint: "promotional" },
      { key: "footer_note", text: "한정 기간 진행", priority: "utility", required: false, maxLength: 24, toneHint: "informational" },
    ],
    primaryMessage: "봄 세일",
    summary: "generic promo copy plan",
  };
}

function createConcreteLayoutPlan(): ConcreteLayoutPlan {
  return {
    planId: "layout-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    abstractLayoutFamily: "promo_split",
    resolvedSlotTopology: "headline_supporting_cta_footer",
    primaryVisualFamily: "graphic",
    resolvedLayoutMode: "left_copy_right_graphic",
    slotAnchors: {
      headline: "left_copy_column",
      subheadline: "left_copy_column",
      cta: "bottom_center",
      footer_note: "footer_strip",
    },
    resolvedSlotBounds: {
      headline: { x: 80, y: 120, width: 400, height: 90 },
      subheadline: { x: 80, y: 220, width: 420, height: 70 },
      cta: { x: 80, y: 360, width: 220, height: 64 },
      footer_note: { x: 80, y: 560, width: 360, height: 24 },
    },
    headlineEstimatedHeight: 90,
    clusterZones: ["right_cluster", "top_corner", "bottom_strip"],
    ctaContainerExpected: true,
    graphicRolePlacementHints: [
      { role: "primary_accent", zone: "right_cluster" },
    ],
    spacingIntent: "dense",
    summary: "dense split layout",
  };
}

function createExecutionSceneSummary(): ExecutionSceneSummary {
  return {
    summaryId: "scene-1",
    runId: "run-1",
    traceId: "trace-1",
    attemptSeq: 1,
    finalRevision: 2,
    stageResults: [],
    copyLayerBindings: [
      { executionSlotKey: "headline", layerId: "layer-headline", text: "봄 세일", anchor: "left_copy_column", plannedBounds: { x: 80, y: 120, width: 400, height: 90 }, resolvedBounds: { x: 80, y: 120, width: 400, height: 90 } },
      { executionSlotKey: "subheadline", layerId: "layer-supporting", text: "혜택을 확인하세요", anchor: "left_copy_column", plannedBounds: { x: 80, y: 220, width: 420, height: 70 }, resolvedBounds: { x: 80, y: 220, width: 420, height: 70 } },
      { executionSlotKey: "cta", layerId: "layer-cta", text: "혜택 보기", anchor: "bottom_center", plannedBounds: { x: 80, y: 360, width: 220, height: 64 }, resolvedBounds: { x: 80, y: 360, width: 220, height: 64 } },
      { executionSlotKey: "footer_note", layerId: "layer-footer", text: "한정 기간 진행", anchor: "footer_strip", plannedBounds: { x: 80, y: 560, width: 360, height: 24 }, resolvedBounds: { x: 80, y: 560, width: 360, height: 24 } },
    ],
    graphicLayerBindings: [
      { role: "primary_accent", layerId: "layer-accent", zone: "right_cluster", sourceAssetId: "shape:1", sourceSerial: "11" },
    ],
    photoLayerBinding: null,
    ctaContainerResolved: false,
    summary: "scene summary",
  };
}

function createExecutablePlan(): ExecutablePlan {
  return {
    planId: "plan-1",
    planVersion: 1,
    planSchemaVersion: "v1-stub",
    runId: "run-1",
    traceId: "trace-1",
    attemptSeq: 1,
    intent: { operationFamily: "create_template", artifactType: "LiveDraftArtifactBundle" },
    constraintsRef: "constraints-ref",
    actions: [],
  };
}

test("buildJudgePlan requests patch refinement for missing CTA container and dense spacing", async () => {
  const judgePlan = await buildJudgePlan(
    "run-1",
    "trace-1",
    0,
    createCopyPlan(),
    createConcreteLayoutPlan(),
    createExecutionSceneSummary(),
    createExecutablePlan(),
    null,
  );

  assert.equal(judgePlan.recommendation, "refine");
  assert.equal(
    judgePlan.issues.some((issue) => issue.code === "cta_container_missing_after_execution"),
    true,
  );
  assert.equal(
    judgePlan.allowedPatchScopes.includes("spacing"),
    true,
  );
});
