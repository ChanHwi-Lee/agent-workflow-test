import assert from "node:assert/strict";
import test from "node:test";

import type { ExecutablePlan } from "@tooldi/agent-contracts";

import type {
  AssetPlan,
  ConcreteLayoutPlan,
  CopyPlan,
  StageAckRecord,
} from "../types.js";
import { buildExecutionSceneSummary } from "./buildExecutionSceneSummary.js";

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

function createAssetPlan(): AssetPlan {
  return {
    planId: "asset-plan-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    primaryVisualFamily: "graphic",
    backgroundBinding: {
      candidateId: "bg-1",
      sourceAssetId: "background:1",
      sourceSerial: "1",
      sourceCategory: "pattern",
      backgroundMode: "spring_pattern",
    },
    graphicRoleBindings: [
      {
        role: "primary_accent",
        candidateId: "graphic-1",
        sourceAssetId: "shape:1",
        sourceSerial: "11",
        sourceCategory: "vector",
        variantKey: "v1",
        decorationMode: "promo_multi_graphic",
        required: true,
        zonePreference: "right_cluster",
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
    summary: "graphic-first asset plan",
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
    clusterZones: ["right_cluster", "top_corner", "bottom_strip"],
    ctaContainerExpected: true,
    graphicRolePlacementHints: [
      { role: "primary_accent", zone: "right_cluster" },
    ],
    spacingIntent: "balanced",
    summary: "split layout",
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
    intent: {
      operationFamily: "create_template",
      artifactType: "LiveDraftArtifactBundle",
    },
    constraintsRef: "constraints-ref",
    actions: [
      {
        actionId: "copy",
        kind: "canvas_mutation",
        operation: "place_copy_cluster",
        toolName: "layout-selector",
        toolVersion: "1",
        commitGroup: "group-1",
        liveCommit: true,
        idempotencyKey: "copy-1",
        dependsOn: [],
        targetRef: {
          documentId: "doc-1",
          pageId: "page-1",
          layerId: null,
          slotKey: "headline",
        },
        inputs: {
          copySlotTexts: {
            headline: "봄 세일",
            subheadline: "혜택을 확인하세요",
            cta: "혜택 보기",
            footer_note: "한정 기간 진행",
          },
        },
        rollback: { strategy: "delete_created_layers" },
      },
    ],
  };
}

test("buildExecutionSceneSummary binds copy and graphic layers from ack history", async () => {
  const stageAckHistory: StageAckRecord[] = [
    {
      stageLabel: "copy",
      mutationId: "mutation-copy",
      seq: 1,
      status: "acked",
      resultingRevision: 1,
      resolvedLayerIds: {
        headline_run: "layer-headline",
        supporting_copy_run: "layer-supporting",
      },
      commands: [
        {
          op: "createLayer",
          slotKey: "headline",
          clientLayerKey: "headline_run",
          role: "headline",
          targetLayerId: null,
        },
        {
          op: "createLayer",
          slotKey: "supporting_copy",
          clientLayerKey: "supporting_copy_run",
          role: "supporting_copy",
          targetLayerId: null,
        },
      ],
    },
    {
      stageLabel: "polish",
      mutationId: "mutation-polish",
      seq: 2,
      status: "acked",
      resultingRevision: 2,
      resolvedLayerIds: {
        primary_accent_run: "layer-accent",
      },
      commands: [
        {
          op: "createLayer",
          slotKey: "decoration",
          clientLayerKey: "primary_accent_run",
          role: "primary_accent",
          targetLayerId: null,
        },
      ],
    },
  ];

  const summary = await buildExecutionSceneSummary(
    "run-1",
    "trace-1",
    1,
    createCopyPlan(),
    createAssetPlan(),
    createConcreteLayoutPlan(),
    createExecutablePlan(),
    stageAckHistory,
  );

  assert.equal(summary.finalRevision, 2);
  assert.equal(
    summary.copyLayerBindings.find((binding) => binding.slotKey === "headline")?.layerId,
    "layer-headline",
  );
  assert.equal(
    summary.graphicLayerBindings.find((binding) => binding.role === "primary_accent")?.layerId,
    "layer-accent",
  );
  assert.equal(summary.ctaContainerResolved, false);
});
