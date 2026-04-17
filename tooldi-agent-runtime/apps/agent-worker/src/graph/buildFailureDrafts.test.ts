import assert from "node:assert/strict";
import test from "node:test";

import { createTestRun } from "@tooldi/agent-testkit";

import { AdaptiveCompositionCoverageError } from "../phases/buildAdaptiveCompositionDecision.js";
import type { RunJobGraphStateType } from "./runJobGraphState.js";
import { buildAdaptiveCompositionCoverageFailureFinalizeDraft } from "./buildFailureDrafts.js";

function createMinimalState(): RunJobGraphStateType {
  const testRun = createTestRun({
    userInput: {
      prompt: "테스트 배너",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
  });

  // The helper only reads: state.job, state.hydrated, state.cooperativeStopRequested,
  // and a handful of optional artifact refs. Everything else can stay at default.
  // The graph state type is a full reducer map; a permissive cast keeps the
  // fixture minimal without coupling to every field.
  return {
    job: testRun.job,
    hydrated: {
      job: testRun.job,
      request: testRun.request,
      snapshot: testRun.snapshot,
      requestRef: testRun.requestRef,
      snapshotRef: testRun.snapshotRef,
      repairContext: null,
    },
    cooperativeStopRequested: false,
    canonicalDesignBriefRef: null,
    semanticBriefDraftRef: null,
    briefCompilationReportRef: null,
    copyPlanRef: null,
    abstractLayoutPlanRef: null,
    assetPlanRef: null,
    concreteLayoutPlanRef: null,
    templatePriorBundleRef: null,
    sceneStylePlanRef: null,
    sceneBindingPlanRef: null,
  } as unknown as RunJobGraphStateType;
}

function createAppendEventTaskStub() {
  const calls: Array<{ runId: string; payload: unknown }> = [];
  const appendEventTask = (async (runId: string, payload: unknown) => {
    calls.push({ runId, payload });
    return { cancelRequested: false };
  }) as unknown as ReturnType<
    typeof import("./graphTasks.js").createRunJobGraphTasks
  >["appendEventTask"];
  return { appendEventTask, calls };
}

test(
  "buildAdaptiveCompositionCoverageFailureFinalizeDraft projects AdaptiveCompositionCoverageError into a finalizeDraft with errorSummary.code === 'decision_coverage_incomplete'",
  async () => {
    const state = createMinimalState();
    const { appendEventTask } = createAppendEventTaskStub();
    const error = new AdaptiveCompositionCoverageError([
      "obj-text-headline",
      "obj-text-detail",
    ]);
    const result = await buildAdaptiveCompositionCoverageFailureFinalizeDraft(
      state,
      error,
      { appendEventTask },
    );

    assert.equal(
      result.finalizeDraft.request.errorSummary?.code,
      "decision_coverage_incomplete",
    );
    assert.equal(result.finalizeDraft.request.finalStatus, "failed");
  },
);

test(
  "buildAdaptiveCompositionCoverageFailureFinalizeDraft never relabels coverage failures as 'adaptive_batch_missing'",
  async () => {
    const state = createMinimalState();
    const { appendEventTask } = createAppendEventTaskStub();
    const error = new AdaptiveCompositionCoverageError(["obj-text-headline"]);
    const result = await buildAdaptiveCompositionCoverageFailureFinalizeDraft(
      state,
      error,
      { appendEventTask },
    );

    assert.notEqual(
      result.finalizeDraft.request.errorSummary?.code,
      "adaptive_batch_missing",
      "coverage failures must NOT be relabeled as the execution-time missing-batch code",
    );
  },
);
