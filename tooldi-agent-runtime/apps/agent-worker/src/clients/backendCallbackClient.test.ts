import assert from "node:assert/strict";
import test from "node:test";

import type {
  WaitMutationAckResponse,
  WorkerAppendEventResponse,
  WorkerFinalizeResponse,
  WorkerHeartbeatResponse,
} from "@tooldi/agent-contracts";
import { createLogger } from "@tooldi/agent-observability";

import { createBackendCallbackClient } from "./backendCallbackClient.js";

test("backend callback client hits canonical routes and validates shared responses", async () => {
  const requests: Array<{
    method: string;
    url: string;
    body: string | null;
  }> = [];

  const responses: unknown[] = [
    {
      accepted: true,
      cancelRequested: false,
      stopAfterCurrentAction: false,
      runStatus: "planning_queued",
      deadlineAt: new Date(Date.now() + 30000).toISOString(),
    } satisfies WorkerHeartbeatResponse,
    {
      accepted: true,
      cancelRequested: false,
    } satisfies WorkerAppendEventResponse,
    {
      found: true,
      status: "acked",
      seq: 1,
      resultingRevision: 7,
    } satisfies WaitMutationAckResponse,
    {
      accepted: true,
      runStatus: "completed",
    } satisfies WorkerFinalizeResponse,
  ];

  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({
      method: init?.method ?? "GET",
      url: input instanceof URL ? input.toString() : String(input),
      body: typeof init?.body === "string" ? init.body : null,
    });

    const payload = responses.shift();
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  };

  const client = createBackendCallbackClient({
    logger: createLogger({
      level: "debug",
      bindings: {
        service: "backend-callback-client-test",
      },
    }),
    baseUrl: "http://127.0.0.1:3000",
    fetchImpl,
  });

  const heartbeat = await client.heartbeat("run-1", {
    traceId: "trace-1",
    attempt: 1,
    queueJobId: "run-1__attempt_1",
    workerId: "worker-1",
    attemptState: "dequeued",
    phase: "planning",
    heartbeatAt: new Date().toISOString(),
  });
  assert.equal(heartbeat.accepted, true);

  const appendEvent = await client.appendEvent("run-1", {
    traceId: "trace-1",
    attempt: 1,
    queueJobId: "run-1__attempt_1",
    event: {
      type: "phase",
      phase: "planning",
      message: "Planning phase started",
    },
  });
  assert.equal(appendEvent.accepted, true);

  const waitMutationAck = await client.waitMutationAck("run-1", "mutation-1", {
    waitMs: 15000,
  });
  assert.deepEqual(waitMutationAck, {
    found: true,
    status: "acked",
    seq: 1,
    resultingRevision: 7,
  });

  const finalize = await client.finalize("run-1", {
    traceId: "trace-1",
    attempt: 1,
    queueJobId: "run-1__attempt_1",
    finalStatus: "completed",
    draftId: "draft_run-1",
    finalRevision: 7,
    lastAckedSeq: 1,
    latestSaveReceiptId: "save-receipt-1",
    outputTemplateCode: "template_draft_run-1",
    createdLayerIds: ["layer-1"],
    updatedLayerIds: [],
    deletedLayerIds: [],
    fallbackCount: 0,
  });
  assert.deepEqual(finalize, {
    accepted: true,
    runStatus: "completed",
  });

  assert.deepEqual(
    requests.map((request) => ({
      method: request.method,
      url: request.url.replace("http://127.0.0.1:3000", ""),
    })),
    [
      {
        method: "POST",
        url: "/internal/agent-workflow/runs/run-1/heartbeats",
      },
      {
        method: "POST",
        url: "/internal/agent-workflow/runs/run-1/events",
      },
      {
        method: "GET",
        url: "/internal/agent-workflow/runs/run-1/mutations/mutation-1/acks?waitMs=15000",
      },
      {
        method: "POST",
        url: "/internal/agent-workflow/runs/run-1/finalize",
      },
    ],
  );
  assert.match(requests[0]?.body ?? "", /"queueJobId":"run-1__attempt_1"/);
  assert.match(requests[1]?.body ?? "", /"type":"phase"/);
  assert.match(requests[3]?.body ?? "", /"finalStatus":"completed"/);
});

test("backend callback client rejects invalid shared response payloads", async () => {
  const client = createBackendCallbackClient({
    logger: createLogger({
      level: "debug",
      bindings: {
        service: "backend-callback-client-test",
      },
    }),
    baseUrl: "http://127.0.0.1:3000",
    fetchImpl: async () =>
      new Response(JSON.stringify({ accepted: "yes" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
  });

  await assert.rejects(
    client.heartbeat("run-1", {
      traceId: "trace-1",
      attempt: 1,
      queueJobId: "run-1__attempt_1",
      workerId: "worker-1",
      attemptState: "dequeued",
      heartbeatAt: new Date().toISOString(),
    }),
    /(shared contract validation|Expected required property)/,
  );
});
