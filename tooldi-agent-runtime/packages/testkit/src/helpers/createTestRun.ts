import type { RunJobEnvelope, StartAgentWorkflowRunRequest } from "@tooldi/agent-contracts";
import {
  createQueueJobId,
  createRequestId,
  createRunId,
  createTraceId,
} from "@tooldi/agent-domain";
import {
  createRequestObjectRef,
  createSnapshotObjectRef,
  getRequestObjectKey,
  getSnapshotObjectKey,
} from "@tooldi/agent-persistence";

import { createFakeRunRequest } from "../fakes/fakeRunRequest.js";

export interface CreateTestRunResult {
  requestId: string;
  runId: string;
  traceId: string;
  requestRef: string;
  snapshotRef: string;
  requestObjectKey: string;
  snapshotObjectKey: string;
  request: StartAgentWorkflowRunRequest;
  snapshot: {
    editorContext: StartAgentWorkflowRunRequest["editorContext"];
    brandContext: StartAgentWorkflowRunRequest["brandContext"];
    referenceAssets: StartAgentWorkflowRunRequest["referenceAssets"];
    runPolicy: StartAgentWorkflowRunRequest["runPolicy"];
  };
  job: RunJobEnvelope;
}

export function createTestRun(
  overrides: Partial<StartAgentWorkflowRunRequest> = {},
): CreateTestRunResult {
  const request = createFakeRunRequest(overrides);
  const requestId = createRequestId();
  const runId = createRunId();
  const traceId = createTraceId();
  const attemptSeq = 1;
  const queueJobId = createQueueJobId({ runId, attemptSeq });
  const requestRef = createRequestObjectRef(requestId);
  const snapshotRef = createSnapshotObjectRef(runId);

  return {
    requestId,
    runId,
    traceId,
    requestRef,
    snapshotRef,
    requestObjectKey: getRequestObjectKey(requestId),
    snapshotObjectKey: getSnapshotObjectKey(runId),
    request,
    snapshot: {
      editorContext: request.editorContext,
      brandContext: request.brandContext,
      referenceAssets: request.referenceAssets,
      runPolicy: request.runPolicy,
    },
    job: {
      messageVersion: "v1",
      runId,
      traceId,
      queueJobId,
      attemptSeq,
      priority: "interactive",
      requestRef,
      snapshotRef,
      deadlineAt: new Date(Date.now() + request.runPolicy.timeBudgetMs).toISOString(),
      pageLockToken: `page_lock_${request.editorContext.pageId}_${runId}`,
      cancelToken: `cancel_${runId}`,
    },
  };
}
