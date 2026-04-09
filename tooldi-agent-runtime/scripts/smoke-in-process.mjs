import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function createSharedEnv(queueName) {
  return {
    nodeEnv: "test",
    logLevel: "info",
    postgresUrl: "postgres://localhost:5432/tooldi_agent_runtime_test",
    redisUrl: "redis://localhost:6379/9",
    bullmqQueueName: queueName,
    objectStoreMode: "memory",
    objectStoreRootDir: `/tmp/${queueName}`,
    objectStoreBucket: `${queueName}-bucket`,
    objectStorePrefix: queueName,
    objectStoreEndpoint: null,
  };
}

function createApiEnv(queueName) {
  return {
    ...createSharedEnv(queueName),
    host: "127.0.0.1",
    port: 0,
    publicBaseUrl: "http://127.0.0.1:0",
    sseHeartbeatIntervalMs: 50,
    queueTransportMode: "memory",
  };
}

function createWorkerEnv(queueName) {
  return {
    ...createSharedEnv(queueName),
    workerConcurrency: 1,
    heartbeatIntervalMs: 5000,
    leaseTtlMs: 30000,
    queueTransportMode: "disabled",
    agentInternalBaseUrl: "http://127.0.0.1:0",
    templatePlannerMode: "heuristic",
    templatePlannerProvider: null,
    templatePlannerModel: null,
    templatePlannerTemperature: 0,
    langGraphCheckpointerMode: "memory",
    langGraphCheckpointerPostgresUrl: null,
    langGraphCheckpointerSchema: "agent_langgraph_test",
    tooldiCatalogSourceMode: "placeholder",
    tooldiContentApiBaseUrl: null,
    tooldiContentApiTimeoutMs: 5000,
    tooldiContentApiCookie: null,
    exitAfterBoot: false,
  };
}

function createStartRunRequest(prefix) {
  return {
    clientRequestId: `${prefix}-client-request-${Date.now()}`,
    editorSessionId: `${prefix}-editor-session`,
    surface: "toolditor",
    userInput: {
      prompt: "봄 세일 배너를 만들어줘",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
    editorContext: {
      documentId: `${prefix}-document-1`,
      pageId: `${prefix}-page-1`,
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
  };
}

export function isListenPermissionError(error) {
  if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
    return true;
  }
  return error instanceof Error && error.message.includes("listen EPERM");
}

export async function runTransportSmokeInProcess({ workspaceRoot, queueName }) {
  const { app, worker } = await createInProcessRuntime({ workspaceRoot, queueName });
  try {
    const accepted = await startRunViaInject(app, "smoke");
    console.log(
      `[smoke] accepted run ${accepted.runId} trace=${accepted.traceId} (in-process fallback)`,
    );

    const streamPromise = driveRunLifecycle({
      accepted,
      app,
      timeoutMs: 20000,
      logPrefix: "smoke",
    });
    const queuedJob = await waitForQueuedJob(app, accepted.runId, 1);
    const runPromise = worker.processRunJob(queuedJob.payload);

    await Promise.all([streamPromise, runPromise]);

    console.log("[smoke] transport pipeline completed successfully");
  } finally {
    await closeRuntime({ app, worker });
  }
}

export async function runRetrySmokeInProcess({ workspaceRoot, queueName }) {
  const { app, worker } = await createInProcessRuntime({ workspaceRoot, queueName });
  try {
    const accepted = await startRunViaInject(app, "retry-smoke");
    console.log(
      `[retry-smoke] accepted run ${accepted.runId} trace=${accepted.traceId} (in-process fallback)`,
    );

    const streamPromise = driveRunLifecycle({
      accepted,
      app,
      timeoutMs: 30000,
      logPrefix: "retry-smoke",
      requireRetryLog: true,
    });

    await sleep(2600);

    const retryJob = await waitForQueuedJob(app, accepted.runId, 2);
    await waitUntil(new Date(retryJob.enqueuedAt).getTime());
    const runPromise = worker.processRunJob(retryJob.payload);

    await Promise.all([streamPromise, runPromise]);

    console.log("[retry-smoke] pickup-timeout retry pipeline completed successfully");
  } finally {
    await closeRuntime({ app, worker });
  }
}

async function createInProcessRuntime({ workspaceRoot, queueName }) {
  const [{ buildApp }, { buildWorkerRuntime }] = await Promise.all([
    importModule(workspaceRoot, "apps/agent-api/dist/app.js"),
    importModule(workspaceRoot, "apps/agent-worker/dist/worker.js"),
  ]);

  const app = await buildApp({
    env: createApiEnv(queueName),
  });

  let worker;
  try {
    worker = await buildWorkerRuntime({
      env: createWorkerEnv(queueName),
      objectStore: app.objectStore,
      callbackClient: createInjectedBackendCallbackClient(app),
    });
  } catch (error) {
    await app.close();
    throw error;
  }

  return {
    app,
    worker,
  };
}

async function closeRuntime({ app, worker }) {
  await Promise.allSettled([
    worker ? worker.close() : Promise.resolve(),
    app ? app.close() : Promise.resolve(),
  ]);
}

async function importModule(workspaceRoot, relativePath) {
  return import(pathToFileURL(resolve(workspaceRoot, relativePath)).href);
}

function createInjectedBackendCallbackClient(app) {
  return {
    async heartbeat(runId, request) {
      return injectJson(app, {
        method: "POST",
        url: `/internal/agent-workflow/runs/${runId}/heartbeats`,
        payload: request,
      });
    },
    async appendEvent(runId, request) {
      return injectJson(app, {
        method: "POST",
        url: `/internal/agent-workflow/runs/${runId}/events`,
        payload: request,
      });
    },
    async waitMutationAck(runId, mutationId, query) {
      const queryString =
        query.waitMs === undefined ? "" : `?waitMs=${encodeURIComponent(String(query.waitMs))}`;
      return injectJson(app, {
        method: "GET",
        url: `/internal/agent-workflow/runs/${runId}/mutations/${mutationId}/acks${queryString}`,
      });
    },
    async finalize(runId, request) {
      return injectJson(app, {
        method: "POST",
        url: `/internal/agent-workflow/runs/${runId}/finalize`,
        payload: request,
      });
    },
  };
}

async function injectJson(app, { method, url, payload }) {
  const response = await app.inject({
    method,
    url,
    ...(payload === undefined ? {} : { payload }),
  });
  const responsePayload = readInjectPayload(response);
  if (response.statusCode >= 400) {
    throw new Error(
      `Injected ${method} ${url} failed with ${response.statusCode}: ${describeErrorPayload(responsePayload)}`,
    );
  }
  return responsePayload;
}

function readInjectPayload(response) {
  const contentType = response.headers["content-type"] ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  if (!response.body || response.body.length === 0) {
    return null;
  }
  return response.body;
}

function describeErrorPayload(payload) {
  if (typeof payload === "string" && payload.length > 0) {
    return payload;
  }
  if (payload && typeof payload === "object" && "message" in payload) {
    return String(payload.message);
  }
  return "Unexpected error response";
}

async function startRunViaInject(app, prefix) {
  return injectJson(app, {
    method: "POST",
    url: "/api/agent-workflow/runs",
    payload: createStartRunRequest(prefix),
  });
}

async function driveRunLifecycle({
  accepted,
  app,
  timeoutMs,
  logPrefix,
  requireRetryLog = false,
}) {
  const deliveredEventIds = new Set();
  const queuedEvents = [];
  let resolveNextEvent = null;
  let rejectNextEvent = null;
  let currentRevision = 0;
  let retryLogObserved = false;

  const pushEvent = (bufferedEvent) => {
    if (deliveredEventIds.has(bufferedEvent.eventId)) {
      return;
    }
    deliveredEventIds.add(bufferedEvent.eventId);
    queuedEvents.push(bufferedEvent.event);
    if (resolveNextEvent) {
      resolveNextEvent();
      resolveNextEvent = null;
      rejectNextEvent = null;
    }
  };

  const unsubscribe = app.sseHub.subscribe(accepted.runId, pushEvent);

  try {
    const storedEvents = await app.services.runEventService.listAfter(accepted.runId);
    for (const storedEvent of storedEvents) {
      pushEvent({
        eventId: storedEvent.eventId,
        event: storedEvent.event,
      });
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (queuedEvents.length === 0) {
        await waitForNextEvent(deadline - Date.now());
        continue;
      }

      const event = queuedEvents.shift();
      switch (event.type) {
        case "run.log":
          if (String(event.message ?? "").includes("scheduled retry attempt 2")) {
            retryLogObserved = true;
            console.log(`[${logPrefix}] observed retry scheduling log`);
          }
          break;
        case "canvas.mutation":
          await postMutationAck(app, accepted, event, currentRevision);
          currentRevision += 1;
          console.log(
            `[${logPrefix}] acked mutation ${event.mutation.mutationId} seq=${event.seq}`,
          );
          break;
        case "run.failed":
          throw new Error(`Run failed during ${logPrefix}: ${JSON.stringify(event)}`);
        case "run.completed":
          if (requireRetryLog && !retryLogObserved) {
            throw new Error("Retry smoke completed without observing the retry scheduling log");
          }
          console.log(`[${logPrefix}] observed run.completed SSE`);
          return;
        default:
          break;
      }
    }

    throw new Error(`Timed out while waiting for ${logPrefix} completion`);
  } finally {
    unsubscribe();
  }

  async function waitForNextEvent(timeoutMsRemaining) {
    if (timeoutMsRemaining <= 0) {
      throw new Error(`Timed out while waiting for ${logPrefix} event`);
    }
    await new Promise((resolvePromise, rejectPromise) => {
      resolveNextEvent = resolvePromise;
      rejectNextEvent = rejectPromise;
      const timer = setTimeout(() => {
        if (rejectNextEvent) {
          rejectNextEvent(new Error(`Timed out while waiting for ${logPrefix} event`));
          resolveNextEvent = null;
          rejectNextEvent = null;
        }
      }, timeoutMsRemaining);
      timer.unref?.();
      const resolveWithCleanup = () => {
        clearTimeout(timer);
        resolvePromise(undefined);
      };
      const rejectWithCleanup = (error) => {
        clearTimeout(timer);
        rejectPromise(error);
      };
      resolveNextEvent = resolveWithCleanup;
      rejectNextEvent = rejectWithCleanup;
    });
  }
}

async function postMutationAck(app, accepted, payload, currentRevision) {
  await injectJson(app, {
    method: "POST",
    url: `/api/agent-workflow/runs/${accepted.runId}/mutation-acks`,
    payload: {
      runId: accepted.runId,
      traceId: accepted.traceId,
      mutationId: payload.mutation.mutationId,
      seq: payload.seq,
      status: "applied",
      targetPageId: payload.mutation.pageId,
      baseRevision: currentRevision,
      resultingRevision: currentRevision + 1,
      resolvedLayerIds: Object.fromEntries(
        payload.mutation.commands
          .filter((command) => command.targetRef.clientLayerKey)
          .map((command) => [
            command.targetRef.clientLayerKey,
            command.targetRef.clientLayerKey,
          ]),
      ),
      commandResults: payload.mutation.commands.map((command) => ({
        commandId: command.commandId,
        op: command.op,
        status: "applied",
        resolvedLayerId: command.targetRef.clientLayerKey ?? "resolved-layer-1",
      })),
      clientObservedAt: new Date().toISOString(),
    },
  });
}

async function waitForQueuedJob(app, runId, attemptSeq, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const jobs = await app.runQueue.listJobs();
    const matchingJob = jobs.find(
      (job) => job.payload.runId === runId && job.payload.attemptSeq === attemptSeq,
    );
    if (matchingJob) {
      return matchingJob;
    }
    await sleep(50);
  }
  throw new Error(
    `Timed out while waiting for queued job run=${runId} attempt=${attemptSeq}`,
  );
}

async function waitUntil(timestampMs) {
  const delayMs = timestampMs - Date.now();
  if (delayMs > 0) {
    await sleep(delayMs);
  }
}

async function sleep(ms) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
