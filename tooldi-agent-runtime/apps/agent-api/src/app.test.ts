import assert from "node:assert/strict";
import test from "node:test";

import type {
  AgentApiEnv,
} from "@tooldi/agent-config";
import type {
  CanvasMutationEnvelope,
  MutationApplyAckRequest,
  RunAccepted,
  RunFinalizeRequest,
  StartAgentWorkflowRunRequest,
  WorkerAppendEventRequest,
} from "@tooldi/agent-contracts";

import { buildApp } from "./app.js";

function createEnv(): AgentApiEnv {
  return {
    nodeEnv: "test",
    logLevel: "debug",
    postgresUrl: "postgres://localhost:5432/tooldi_agent_runtime_test",
    redisUrl: "redis://localhost:6379/9",
    objectStoreBucket: "tooldi-agent-runtime-test",
    objectStorePrefix: "agent-runtime-test",
    objectStoreEndpoint: null,
    host: "127.0.0.1",
    port: 0,
    publicBaseUrl: "http://127.0.0.1:3000",
    sseHeartbeatIntervalMs: 50,
  };
}

function createStartRunRequest(
  overrides: Partial<StartAgentWorkflowRunRequest> = {},
): StartAgentWorkflowRunRequest {
  return {
    clientRequestId: "client-request-1",
    editorSessionId: "editor-session-1",
    surface: "toolditor",
    userInput: {
      prompt: "봄 세일 이벤트 배너 만들어줘",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
    editorContext: {
      documentId: "document-1",
      pageId: "page-1",
      canvasState: "empty",
      canvasWidth: 1080,
      canvasHeight: 1080,
      sizeSerial: "1080x1080@1",
      workingTemplateCode: null,
      canvasSnapshotRef: null,
      selectedLayerIds: [],
    },
    brandContext: {
      brandName: null,
      palette: [],
      logoAssetId: null,
    },
    referenceAssets: [],
    runPolicy: {
      mode: "live_commit",
      approvalMode: "none",
      timeBudgetMs: 120000,
      milestoneTargetsMs: {
        firstVisible: 1000,
        editableMinimum: 3000,
        saveStarted: 5000,
      },
      milestoneDeadlinesMs: {
        planValidated: 1000,
        firstVisible: 2000,
        editableMinimum: 5000,
        mutationCutoff: 10000,
        hardDeadline: 120000,
      },
      requestedOutputCount: 1,
      allowInternalAiPrimitives: true,
    },
    clientInfo: {
      pagePath: "/editor",
      viewportWidth: 1440,
      viewportHeight: 900,
    },
    ...overrides,
  };
}

function createMutationEnvelope(input: {
  runId: string;
  traceId: string;
  seq: number;
  mutationId: string;
  draftId?: string;
}): CanvasMutationEnvelope {
  return {
    mutationId: input.mutationId,
    mutationVersion: "v1",
    traceId: input.traceId,
    runId: input.runId,
    draftId: input.draftId ?? "draft-1",
    documentId: "document-1",
    pageId: "page-1",
    seq: input.seq,
    commitGroup: "commit-group-1",
    idempotencyKey: `idempotency-${input.mutationId}`,
    expectedBaseRevision: 0,
    ownershipScope: "draft_only",
    commands: [
      {
        commandId: "command-1",
        op: "createLayer",
        slotKey: "headline",
        clientLayerKey: "headline-layer",
        targetRef: {
          layerId: null,
          clientLayerKey: "headline-layer",
        },
        targetLayerVersion: null,
        parentRef: {
          position: "append",
        },
        expectedLayerType: null,
        allowNoop: false,
        metadataTags: {},
        layerBlueprint: {
          layerType: "text",
          bounds: {
            x: 100,
            y: 120,
            width: 720,
            height: 140,
          },
          metadata: {},
        },
        editable: true,
      },
    ],
    rollbackHint: {
      rollbackGroupId: "rollback-group-1",
      strategy: "delete_created_layers",
    },
    emittedAt: new Date().toISOString(),
    deliveryDeadlineAt: new Date(Date.now() + 10000).toISOString(),
  };
}

async function startRun(app: Awaited<ReturnType<typeof buildApp>>): Promise<{
  accepted: RunAccepted;
  queueJobId: string;
}> {
  const response = await app.inject({
    method: "POST",
    url: "/api/agent-workflow/runs",
    payload: createStartRunRequest(),
  });

  assert.equal(response.statusCode, 202);
  const accepted = response.json() as RunAccepted;
  const jobs = await app.runQueue.listJobs();
  assert.equal(jobs.length, 1);

  return {
    accepted,
    queueJobId: jobs[0]?.payload.queueJobId ?? "",
  };
}

async function readSseStream(
  url: string,
  headers: Record<string, string> = {},
): Promise<string> {
  const response = await fetch(url, {
    headers,
  });
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("content-type")?.startsWith("text/event-stream"));
  assert.ok(response.body);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  for (let chunkIndex = 0; chunkIndex < 8; chunkIndex += 1) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    text += decoder.decode(value, { stream: true });
    if (text.includes("event: run.log") || text.includes("event: run.phase")) {
      break;
    }
  }

  await reader.cancel();
  return text;
}

test("POST /runs returns accepted response with required headers", async (t) => {
  const app = await buildApp({ env: createEnv() });
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/agent-workflow/runs",
    payload: createStartRunRequest(),
  });

  assert.equal(response.statusCode, 202);
  assert.ok(response.headers["x-request-id"]);
  assert.ok(response.headers["x-agent-run-id"]);
  assert.ok(response.headers["x-agent-trace-id"]);

  const body = response.json() as RunAccepted;
  assert.equal(response.headers["x-agent-run-id"], body.runId);
  assert.equal(response.headers["x-agent-trace-id"], body.traceId);

  const jobs = await app.runQueue.listJobs();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.payload.runId, body.runId);
});

test("canonical internal routes are registered and legacy worker routes are gone", async (t) => {
  const app = await buildApp({ env: createEnv() });
  t.after(async () => {
    await app.close();
  });

  const legacy = await app.inject({
    method: "POST",
    url: "/internal/agent-workflow/runs/run-1/worker/heartbeat",
    payload: {},
  });
  assert.equal(legacy.statusCode, 404);

  const canonical = await app.inject({
    method: "POST",
    url: "/internal/agent-workflow/runs/run-1/heartbeats",
    payload: {},
  });
  assert.equal(canonical.statusCode, 400);
});

test("shared contract validation rejects invalid worker events and invalid ack wait query", async (t) => {
  const app = await buildApp({ env: createEnv() });
  t.after(async () => {
    await app.close();
  });

  const { accepted, queueJobId } = await startRun(app);

  const invalidEvent = await app.inject({
    method: "POST",
    url: `/internal/agent-workflow/runs/${accepted.runId}/events`,
    payload: {
      traceId: accepted.traceId,
      attempt: 1,
      queueJobId,
    },
  });
  assert.equal(invalidEvent.statusCode, 400);

  const invalidWaitQuery = await app.inject({
    method: "GET",
    url: `/internal/agent-workflow/runs/${accepted.runId}/mutations/mutation-1/acks?waitMs=20000`,
  });
  assert.equal(invalidWaitQuery.statusCode, 400);
});

test("backend authors mutation seq and ack wait route reflects dispatched then acked", async (t) => {
  const app = await buildApp({ env: createEnv() });
  t.after(async () => {
    await app.close();
  });

  const { accepted, queueJobId } = await startRun(app);

  const appendPayload: WorkerAppendEventRequest = {
    traceId: accepted.traceId,
    attempt: 1,
    queueJobId,
    event: {
      type: "mutation.proposed",
      mutationId: "mutation-1",
      rollbackGroupId: "rollback-group-1",
      mutation: createMutationEnvelope({
        runId: accepted.runId,
        traceId: accepted.traceId,
        mutationId: "mutation-1",
        seq: 999,
      }),
    },
  };

  const appendResponse = await app.inject({
    method: "POST",
    url: `/internal/agent-workflow/runs/${accepted.runId}/events`,
    payload: appendPayload,
  });
  assert.equal(appendResponse.statusCode, 200);
  assert.deepEqual(appendResponse.json(), {
    accepted: true,
    cancelRequested: false,
    assignedSeq: 1,
  });

  const waitBeforeAck = await app.inject({
    method: "GET",
    url: `/internal/agent-workflow/runs/${accepted.runId}/mutations/mutation-1/acks?waitMs=0`,
  });
  assert.equal(waitBeforeAck.statusCode, 200);
  assert.deepEqual(waitBeforeAck.json(), {
    found: true,
    status: "dispatched",
    seq: 1,
  });

  const ackPayload: MutationApplyAckRequest = {
    runId: accepted.runId,
    traceId: accepted.traceId,
    mutationId: "mutation-1",
    seq: 1,
    status: "applied",
    targetPageId: "page-1",
    baseRevision: 0,
    resultingRevision: 1,
    commandResults: [
      {
        commandId: "command-1",
        op: "createLayer",
        status: "applied",
        resolvedLayerId: "layer-1",
      },
    ],
    clientObservedAt: new Date().toISOString(),
  };

  const ackResponse = await app.inject({
    method: "POST",
    url: `/api/agent-workflow/runs/${accepted.runId}/mutation-acks`,
    payload: ackPayload,
  });
  assert.equal(ackResponse.statusCode, 200);
  assert.deepEqual(ackResponse.json(), {
    accepted: true,
    runStatus: "awaiting_apply_ack",
    nextExpectedSeq: 2,
  });

  const waitAfterAck = await app.inject({
    method: "GET",
    url: `/internal/agent-workflow/runs/${accepted.runId}/mutations/mutation-1/acks?waitMs=0`,
  });
  assert.equal(waitAfterAck.statusCode, 200);
  assert.deepEqual(waitAfterAck.json(), {
    found: true,
    status: "acked",
    seq: 1,
    resultingRevision: 1,
  });
});

test("stale attempt is rejected and finalize is idempotent", async (t) => {
  const app = await buildApp({ env: createEnv() });
  t.after(async () => {
    await app.close();
  });

  const { accepted, queueJobId } = await startRun(app);

  const staleHeartbeat = await app.inject({
    method: "POST",
    url: `/internal/agent-workflow/runs/${accepted.runId}/heartbeats`,
    payload: {
      traceId: accepted.traceId,
      attempt: 2,
      queueJobId,
      workerId: "worker-1",
      attemptState: "running",
      heartbeatAt: new Date().toISOString(),
    },
  });
  assert.equal(staleHeartbeat.statusCode, 409);

  const finalizePayload: RunFinalizeRequest = {
    traceId: accepted.traceId,
    attempt: 1,
    queueJobId,
    finalStatus: "completed",
    lastAckedSeq: 0,
    createdLayerIds: [],
    updatedLayerIds: [],
    deletedLayerIds: [],
    fallbackCount: 0,
  };

  const firstFinalize = await app.inject({
    method: "POST",
    url: `/internal/agent-workflow/runs/${accepted.runId}/finalize`,
    payload: finalizePayload,
  });
  assert.equal(firstFinalize.statusCode, 200);
  assert.deepEqual(firstFinalize.json(), {
    accepted: true,
    runStatus: "completed",
  });

  const secondFinalize = await app.inject({
    method: "POST",
    url: `/internal/agent-workflow/runs/${accepted.runId}/finalize`,
    payload: finalizePayload,
  });
  assert.equal(secondFinalize.statusCode, 200);
  assert.deepEqual(secondFinalize.json(), {
    accepted: true,
    runStatus: "completed",
  });

  const events = await app.services.runEventService.listAfter(accepted.runId);
  assert.equal(
    events.filter((event) => event.event.type === "run.completed").length,
    1,
  );
});

test("SSE backlog replay uses event repository offsets with Last-Event-ID", async (t) => {
  const app = await buildApp({
    env: {
      ...createEnv(),
      publicBaseUrl: "http://127.0.0.1:0",
    },
  });
  const address = await app.listen({
    host: "127.0.0.1",
    port: 0,
  });

  t.after(async () => {
    await app.close();
  });

  const runId = "run-sse-1";
  const traceId = "trace-sse-1";
  await app.services.runEventService.appendAccepted(
    runId,
    traceId,
    new Date().toISOString(),
  );
  await app.services.runEventService.appendLog(
    runId,
    traceId,
    "info",
    "first log",
    new Date().toISOString(),
  );

  const firstStream = await readSseStream(`${address}/api/agent-workflow/runs/${runId}/events`);
  assert.match(firstStream, /event: run\.accepted/);
  assert.match(firstStream, /event: run\.log/);

  const allIds = [...firstStream.matchAll(/^id: (\d+)$/gm)].map((match) => match[1]);
  const lastEventId = allIds.at(-1);
  assert.ok(lastEventId);

  await app.services.runEventService.appendPhase(
    runId,
    traceId,
    "planning",
    "planning started",
    new Date().toISOString(),
  );

  const replayedStream = await readSseStream(
    `${address}/api/agent-workflow/runs/${runId}/events`,
    {
      "Last-Event-ID": lastEventId,
    },
  );
  assert.doesNotMatch(replayedStream, /event: run\.log/);
  assert.match(replayedStream, /event: run\.phase/);
});
