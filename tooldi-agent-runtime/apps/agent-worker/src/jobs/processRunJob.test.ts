import assert from "node:assert/strict";
import test from "node:test";

import type {
  RunFinalizeRequest,
  RunRepairContext,
  WaitMutationAckQuery,
  WaitMutationAckResponse,
  WorkerAppendEventRequest,
  WorkerAppendEventResponse,
  WorkerFinalizeResponse,
  WorkerHeartbeatRequest,
  WorkerHeartbeatResponse,
} from "@tooldi/agent-contracts";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import { createObjectStoreClient } from "@tooldi/agent-persistence";
import { createTestRun } from "@tooldi/agent-testkit";
import type {
  AssetStorageClient,
  ImagePrimitiveClient,
  StoredAssetRecord,
  TextLayoutEstimate,
  TextLayoutHelper,
} from "@tooldi/tool-adapters";

import type { BackendCallbackClient } from "../clients/backendCallbackClient.js";
import { createWorkerLogger } from "../lib/logger.js";
import { processRunJob } from "./processRunJob.js";
import { createWorkerToolRegistry } from "../tools/registry.js";
import { createAssetStorageClient } from "../tools/adapters/assetStorageAdapter.js";
import { createImagePrimitiveClient } from "../tools/adapters/imagePrimitiveAdapter.js";
import { createTextLayoutHelper } from "../tools/adapters/textLayoutHelperAdapter.js";

function createEnv(): AgentWorkerEnv {
  return {
    nodeEnv: "test",
    logLevel: "debug",
    postgresUrl: "postgres://localhost:5432/tooldi_agent_runtime_test",
    redisUrl: "redis://localhost:6379/9",
    bullmqQueueName: "agent-workflow-interactive-test",
    objectStoreMode: "memory",
    objectStoreRootDir: "/tmp/tooldi-agent-runtime-object-store-test",
    objectStoreBucket: "tooldi-agent-runtime-test",
    objectStorePrefix: "agent-runtime-test",
    objectStoreEndpoint: null,
    workerConcurrency: 1,
    heartbeatIntervalMs: 5000,
    leaseTtlMs: 30000,
    queueTransportMode: "disabled",
    agentInternalBaseUrl: "http://127.0.0.1:3000",
    exitAfterBoot: false,
  };
}

class RecordingBackendCallbackClient implements BackendCallbackClient {
  readonly heartbeats: WorkerHeartbeatRequest[] = [];
  readonly appendedEvents: WorkerAppendEventRequest[] = [];
  readonly ackWaits: Array<{ mutationId: string; query: WaitMutationAckQuery }> = [];
  readonly finalizations: RunFinalizeRequest[] = [];
  heartbeatResponseFactory?: (
    request: WorkerHeartbeatRequest,
  ) => WorkerHeartbeatResponse;
  appendEventResponseFactory?: (
    request: WorkerAppendEventRequest,
  ) => WorkerAppendEventResponse;
  waitMutationAckResponseFactory?: (
    mutationId: string,
    query: WaitMutationAckQuery,
  ) => WaitMutationAckResponse;

  async heartbeat(
    _runId: string,
    request: WorkerHeartbeatRequest,
  ): Promise<WorkerHeartbeatResponse> {
    this.heartbeats.push(request);
    if (this.heartbeatResponseFactory) {
      return this.heartbeatResponseFactory(request);
    }
    return {
      accepted: true,
      cancelRequested: false,
      stopAfterCurrentAction: false,
      runStatus: "planning_queued",
      deadlineAt: new Date(Date.now() + 30000).toISOString(),
    };
  }

  async appendEvent(
    _runId: string,
    request: WorkerAppendEventRequest,
  ): Promise<WorkerAppendEventResponse> {
    this.appendedEvents.push(request);
    if (this.appendEventResponseFactory) {
      return this.appendEventResponseFactory(request);
    }
    return {
      accepted: true,
      cancelRequested: false,
      ...(request.event.type === "mutation.proposed" ? { assignedSeq: 1 } : {}),
    };
  }

  async waitMutationAck(
    _runId: string,
    mutationId: string,
    query: WaitMutationAckQuery,
  ): Promise<WaitMutationAckResponse> {
    this.ackWaits.push({ mutationId, query });
    if (this.waitMutationAckResponseFactory) {
      return this.waitMutationAckResponseFactory(mutationId, query);
    }
    return {
      found: true,
      status: "acked",
      seq: 1,
      resultingRevision: 1,
    };
  }

  async finalize(
    _runId: string,
    request: RunFinalizeRequest,
  ): Promise<WorkerFinalizeResponse> {
    this.finalizations.push(request);
    return {
      accepted: true,
      runStatus: request.finalStatus,
    };
  }
}

class TrackingImagePrimitiveClient implements ImagePrimitiveClient {
  generateCalls = 0;

  async generate(prompt: string) {
    this.generateCalls += 1;
    return {
      assetId: "asset_placeholder_generated",
      promptSummary: prompt,
    };
  }

  async edit(assetId: string, instruction: string) {
    return {
      assetId,
      promptSummary: instruction,
    };
  }
}

class TrackingAssetStorageClient implements AssetStorageClient {
  persistCalls = 0;

  async persistDraftAsset(input: {
    assetId: string;
    source: string;
  }): Promise<StoredAssetRecord> {
    this.persistCalls += 1;
    return {
      assetId: input.assetId,
      persistedAt: new Date().toISOString(),
    };
  }
}

class TrackingTextLayoutHelper implements TextLayoutHelper {
  async estimate(input: {
    text: string;
    maxWidth: number;
  }): Promise<TextLayoutEstimate> {
    return {
      width: input.maxWidth,
      height: Math.max(80, input.text.length * 2),
      estimatedLineCount: 1,
    };
  }
}

test("processRunJob orchestrates phases and backend callbacks in order", async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  const imagePrimitiveClient = createImagePrimitiveClient();
  const assetStorageClient = createAssetStorageClient();
  const textLayoutHelper = createTextLayoutHelper();
  const testRun = createTestRun();

  await objectStore.putObject({
    key: testRun.requestObjectKey,
    body: JSON.stringify(testRun.request),
    contentType: "application/json",
    metadata: {
      ref: testRun.requestRef,
    },
  });
  await objectStore.putObject({
    key: testRun.snapshotObjectKey,
    body: JSON.stringify(testRun.snapshot),
    contentType: "application/json",
    metadata: {
      ref: testRun.snapshotRef,
    },
  });

  const result = await processRunJob(testRun.job, {
    env,
    logger,
    objectStore,
    callbackClient,
    toolRegistry: createWorkerToolRegistry(),
    imagePrimitiveClient,
    assetStorageClient,
    textLayoutHelper,
  });

  assert.equal(result.intent.operationFamily, "create_template");
  assert.equal(result.plan.actions.length, 1);
  assert.equal(result.emittedMutationIds.length, 1);
  assert.equal(result.finalizeDraft.request.finalStatus, "completed");

  assert.equal(callbackClient.heartbeats.length, 4);
  assert.deepEqual(
    callbackClient.heartbeats.map((heartbeat) => heartbeat.phase),
    ["planning", "executing", "applying", "saving"],
  );

  assert.ok(
    callbackClient.appendedEvents.some(
      (event) => event.event.type === "phase" && event.event.phase === "planning",
    ),
  );
  assert.ok(
    callbackClient.appendedEvents.some(
      (event) => event.event.type === "mutation.proposed",
    ),
  );
  assert.equal(callbackClient.ackWaits.length, 1);
  assert.equal(callbackClient.finalizations.length, 1);
  assert.equal(callbackClient.finalizations[0]?.lastAckedSeq, 1);
  assert.equal(
    callbackClient.finalizations[0]?.normalizedIntentRef,
    `runs/${testRun.runId}/attempts/1/normalized-intent.json`,
  );
  assert.equal(
    callbackClient.finalizations[0]?.executablePlanRef,
    `runs/${testRun.runId}/attempts/1/executable-plan.json`,
  );
  assert.equal(
    callbackClient.finalizations[0]?.latestSaveReceiptId,
    `save_receipt_${testRun.runId}_1`,
  );
  assert.equal(callbackClient.ackWaits[0]?.query.waitMs, 15000);
});

test("processRunJob honors cancel fence before starting a new mutation group", async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  callbackClient.heartbeatResponseFactory = (request) => ({
    accepted: true,
    cancelRequested: request.phase === "executing",
    stopAfterCurrentAction: request.phase === "executing",
    runStatus: "cancel_requested",
    deadlineAt: new Date(Date.now() + 30000).toISOString(),
  });

  const testRun = createTestRun();
  await objectStore.putObject({
    key: testRun.requestObjectKey,
    body: JSON.stringify(testRun.request),
    contentType: "application/json",
    metadata: {
      ref: testRun.requestRef,
    },
  });
  await objectStore.putObject({
    key: testRun.snapshotObjectKey,
    body: JSON.stringify(testRun.snapshot),
    contentType: "application/json",
    metadata: {
      ref: testRun.snapshotRef,
    },
  });

  const result = await processRunJob(testRun.job, {
    env,
    logger,
    objectStore,
    callbackClient,
    toolRegistry: createWorkerToolRegistry(),
    imagePrimitiveClient: createImagePrimitiveClient(),
    assetStorageClient: createAssetStorageClient(),
    textLayoutHelper: createTextLayoutHelper(),
  });

  assert.equal(result.emittedMutationIds.length, 0);
  assert.equal(result.finalizeDraft.request.finalStatus, "cancelled");
  assert.equal(
    callbackClient.appendedEvents.some((event) => event.event.type === "mutation.proposed"),
    false,
  );
});

test("processRunJob does not treat unconfirmed mutation ack as success", async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  callbackClient.waitMutationAckResponseFactory = () => ({
    found: true,
    status: "timed_out",
    seq: 1,
  });
  const imagePrimitiveClient = new TrackingImagePrimitiveClient();
  const assetStorageClient = new TrackingAssetStorageClient();
  const textLayoutHelper = new TrackingTextLayoutHelper();

  const testRun = createTestRun();
  await objectStore.putObject({
    key: testRun.requestObjectKey,
    body: JSON.stringify(testRun.request),
    contentType: "application/json",
    metadata: {
      ref: testRun.requestRef,
    },
  });
  await objectStore.putObject({
    key: testRun.snapshotObjectKey,
    body: JSON.stringify(testRun.snapshot),
    contentType: "application/json",
    metadata: {
      ref: testRun.snapshotRef,
    },
  });

  const result = await processRunJob(testRun.job, {
    env,
    logger,
    objectStore,
    callbackClient,
    toolRegistry: createWorkerToolRegistry(),
    imagePrimitiveClient,
    assetStorageClient,
    textLayoutHelper,
  });

  assert.equal(result.finalizeDraft.request.finalStatus, "failed");
  assert.equal(result.finalizeDraft.request.errorSummary?.code, "mutation_ack_timed_out");
  assert.equal(imagePrimitiveClient.generateCalls, 0);
  assert.equal(assetStorageClient.persistCalls, 0);
});

test("processRunJob emits an observational log when backend passes repairContext", async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  const repairContext: RunRepairContext = {
    source: "backend_retry_watchdog",
    reasonCode: "worker_pickup_timeout",
    recovery: {
      state: "auto_retrying",
      retryMode: "auto_same_run",
      resumeMode: "fresh",
      retryable: true,
      lastKnownGoodCheckpointId: null,
      restoreTargetKind: "run_start_snapshot",
      failedPlanStepId: null,
      resumeFromSeq: null,
      userMessage: "Backend scheduled a same-run retry",
    },
  };
  const testRun = createTestRun();

  await objectStore.putObject({
    key: testRun.requestObjectKey,
    body: JSON.stringify(testRun.request),
    contentType: "application/json",
    metadata: {
      ref: testRun.requestRef,
    },
  });
  await objectStore.putObject({
    key: testRun.snapshotObjectKey,
    body: JSON.stringify(testRun.snapshot),
    contentType: "application/json",
    metadata: {
      ref: testRun.snapshotRef,
    },
  });

  await processRunJob(
    {
      ...testRun.job,
      repairContext,
    },
    {
      env,
      logger,
      objectStore,
      callbackClient,
      toolRegistry: createWorkerToolRegistry(),
      imagePrimitiveClient: createImagePrimitiveClient(),
      assetStorageClient: createAssetStorageClient(),
      textLayoutHelper: createTextLayoutHelper(),
    },
  );

  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("Recovery handoff received"),
    ),
    true,
  );
});
