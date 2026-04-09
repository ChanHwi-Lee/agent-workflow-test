import assert from "node:assert/strict";
import test from "node:test";

import type { ExecutablePlan } from "@tooldi/agent-contracts";

import type { CopyPlan, JudgePlan } from "../types.js";
import { buildRefineDecision } from "./buildRefineDecision.js";

function createCopyPlan(): CopyPlan {
  return {
    planId: "copy-plan-1",
    runId: "run-1",
    traceId: "trace-1",
    plannerMode: "langchain",
    source: "heuristic",
    slots: [
      { key: "headline", text: "봄 세일", priority: "primary", required: true, maxLength: 20, toneHint: "promotional" },
      { key: "cta", text: "혜택 보기", priority: "secondary", required: true, maxLength: 16, toneHint: "promotional" },
    ],
    primaryMessage: "봄 세일",
    summary: "copy plan",
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
          spacingIntent: "dense",
        },
        rollback: { strategy: "delete_created_layers" },
      },
    ],
  };
}

function createJudgePlan(): JudgePlan {
  return {
    judgePlanId: "judge-1",
    runId: "run-1",
    traceId: "trace-1",
    refineAttempt: 0,
    recommendation: "refine",
    patchable: true,
    allowedPatchScopes: ["spacing", "cta_container"],
    issues: [
      {
        code: "copy_stack_spacing_weak",
        severity: "warn",
        message: "spacing weak",
        patchable: true,
        suggestedPatchScopes: ["spacing"],
      },
      {
        code: "cta_container_missing_after_execution",
        severity: "warn",
        message: "cta missing",
        patchable: true,
        suggestedPatchScopes: ["cta_container"],
      },
    ],
    summary: "judge summary",
  };
}

test("buildRefineDecision creates deterministic patch operations for patchable judge issues", async () => {
  const decision = await buildRefineDecision(
    "run-1",
    "trace-1",
    0,
    createJudgePlan(),
    createCopyPlan(),
    createExecutablePlan(),
    2,
  );

  assert.equal(decision.decision, "patch");
  assert.equal(decision.patchPlan?.operations.some((operation) => operation.kind === "set_spacing_intent"), true);
  assert.equal(decision.patchPlan?.operations.some((operation) => operation.kind === "ensure_cta_container_fallback"), true);
});
