import assert from "node:assert/strict";
import test from "node:test";

import type {
  ExecutablePlan,
  PersistedPlanAction,
} from "@tooldi/agent-contracts";

import {
  V5_APPLY_OPERATION,
  V5_INPUT_COMMANDS_KEY,
  buildV5SkeletonBatch,
  isV5PlanAction,
} from "./emitV5SkeletonMutations.js";
import type { HydratedPlanningInput } from "../types.js";

function makeCommand(seq: number) {
  return {
    commandId: `cmd:test:${seq}`,
    op: "createLayer" as const,
    executionSlotKey: null,
    clientLayerKey: `transpile:test:00${seq}:shape`,
    targetRef: {
      layerId: null,
      clientLayerKey: `transpile:test:00${seq}:shape`,
    },
    targetLayerVersion: null,
    parentRef: { position: "append" },
    expectedLayerType: null,
    allowNoop: false,
    metadataTags: {},
    layerBlueprint: {
      layerType: "shape" as const,
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      metadata: {},
    },
    editable: true,
  };
}

function makeInput(): HydratedPlanningInput {
  return {
    job: {
      runId: "run_v5",
      traceId: "trace_v5",
      attemptSeq: 1,
      queueJobId: "run_v5__attempt_1",
    },
    request: {
      editorContext: {
        documentId: "doc_v5",
        pageId: "page_v5",
        canvasWidth: 1200,
        canvasHeight: 628,
      },
    },
  } as unknown as HydratedPlanningInput;
}

function makeV5Plan(commandCount: number): ExecutablePlan {
  const commands = Array.from({ length: commandCount }, (_, i) =>
    makeCommand(i + 1),
  );
  const action: PersistedPlanAction = {
    actionId: "v5_action",
    kind: "canvas_mutation",
    operation: V5_APPLY_OPERATION,
    toolName: "v5-constrained-html-pipeline",
    toolVersion: "1",
    commitGroup: "commit_v5",
    liveCommit: true,
    idempotencyKey: "v5_run_v5",
    dependsOn: [],
    targetRef: {
      documentId: "doc_v5",
      pageId: "page_v5",
      layerId: null,
    },
    inputs: { [V5_INPUT_COMMANDS_KEY]: commands },
    rollback: { strategy: "delete_created_layers" },
  };
  return {
    planId: "plan_v5",
    planVersion: 1,
    planSchemaVersion: "v5-constrained-html",
    runId: "run_v5",
    traceId: "trace_v5",
    attemptSeq: 1,
    intent: {
      operationFamily: "create_template",
      artifactType: "template",
    },
    constraintsRef: "v5_constraints_run_v5",
    actions: [action],
  };
}

test("isV5PlanAction detects the v5 operation", () => {
  const action = makeV5Plan(1).actions[0]!;
  assert.equal(isV5PlanAction(action), true);
  assert.equal(
    isV5PlanAction({ ...action, operation: "place_copy_cluster" }),
    false,
  );
});

test("buildV5SkeletonBatch produces one proposal containing all v5 commands", () => {
  const plan = makeV5Plan(5);
  const batch = buildV5SkeletonBatch(makeInput(), plan);
  assert.equal(batch.proposals.length, 1);
  const proposal = batch.proposals[0]!;
  assert.equal(proposal.stageLabel, "v5-constrained-html");
  assert.equal(proposal.mutation.seq, 1);
  assert.equal(proposal.mutation.expectedBaseRevision, 0);
  assert.equal(proposal.mutation.ownershipScope, "draft_only");
  assert.equal(proposal.mutation.commands.length, 5);
  assert.equal(proposal.mutation.rollbackHint.strategy, "delete_created_layers");
  assert.equal(batch.commitGroup, "commit_v5");
});

test("buildV5SkeletonBatch throws when action is missing", () => {
  const plan = makeV5Plan(1);
  plan.actions[0]!.operation = "some_other_op";
  assert.throws(() => buildV5SkeletonBatch(makeInput(), plan), /without a/);
});

test("buildV5SkeletonBatch throws when v5Commands input is empty", () => {
  const plan = makeV5Plan(1);
  plan.actions[0]!.inputs[V5_INPUT_COMMANDS_KEY] = [];
  assert.throws(
    () => buildV5SkeletonBatch(makeInput(), plan),
    /missing inputs\.v5Commands/,
  );
});
