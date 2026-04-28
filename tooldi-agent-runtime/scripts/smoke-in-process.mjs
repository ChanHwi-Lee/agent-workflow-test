import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function createSharedEnv(queueName) {
  return {
    nodeEnv: "test",
    logLevel: "info",
    postgresUrl:
      process.env.POSTGRES_URL ??
      "postgres://postgres:postgres@127.0.0.1:55432/tooldi_agent_runtime_test",
    redisUrl: "redis://localhost:6379/9",
    bullmqQueueName: queueName,
    objectStoreMode: "memory",
    objectStoreRootDir: `/tmp/${queueName}`,
    objectStoreBucket: `${queueName}-bucket`,
    objectStorePrefix: queueName,
    objectStoreEndpoint: null,
  };
}

const SMOKE_V6_FIXTURE_HTML = `<div style="position:relative; width:1200px; height:628px; overflow:hidden; background-color:#FFF5E1;"><h1 style="position:absolute; left:80px; top:140px; width:600px; height:110px; font-size:84px; color:#222222;">스모크 헤드라인</h1><p style="position:absolute; left:80px; top:270px; width:600px; height:80px; font-size:36px;">스모크 부제</p></div>`;

function buildSmokeBaseStyle() {
  return {
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
    borderTopLeftRadius: "0px",
    borderTopRightRadius: "0px",
    borderBottomRightRadius: "0px",
    borderBottomLeftRadius: "0px",
    borderTopWidth: "0px",
    borderRightWidth: "0px",
    borderBottomWidth: "0px",
    borderLeftWidth: "0px",
    borderTopColor: "rgba(0, 0, 0, 0)",
    paddingTop: "0px",
    paddingRight: "0px",
    paddingBottom: "0px",
    paddingLeft: "0px",
    color: "rgb(0, 0, 0)",
    fontFamily: "\"701_400\", sans-serif",
    fontSize: "16px",
    fontWeight: "400",
    fontStyle: "normal",
    textDecorationLine: "none",
    textAlign: "left",
    lineHeight: "normal",
    letterSpacing: "0px",
    opacity: "1",
    transform: "none",
    transformOrigin: "0 0",
    boxShadow: "none",
    objectFit: "fill",
    overflow: "visible",
    display: "block",
    visibility: "visible",
    whiteSpace: "normal",
  };
}

async function createSmokeV6Overrides() {
  return {
    deps: {
      generateHtml: async () => ({
        model: "gemini-3.1-flash-lite-preview-smoke-stub",
        html: SMOKE_V6_FIXTURE_HTML,
        rawHtml: SMOKE_V6_FIXTURE_HTML,
        latencyMs: 1,
        finishReason: "STOP",
        usage: null,
        finishedAt: new Date().toISOString(),
      }),
      renderAndExtract: async (_html, canvas) => {
        const base = buildSmokeBaseStyle();
        return {
          canvas,
          elements: [
            {
              serial: 0,
              path: "0",
              tagName: "div",
              bounds: { left: 0, top: 0, width: canvas.width, height: canvas.height },
              style: { ...base, backgroundColor: "rgb(255, 245, 225)" },
              isTextLeaf: false,
              text: null,
              img: null,
              svg: null,
              hasChildren: true,
              visible: true,
            },
            {
              serial: 1,
              path: "0.0",
              tagName: "h1",
              bounds: { left: 80, top: 140, width: 600, height: 110 },
              style: { ...base, fontSize: "84px", fontWeight: "700", color: "rgb(34, 34, 34)" },
              isTextLeaf: true,
              text: "스모크 헤드라인",
              img: null,
              svg: null,
              hasChildren: false,
              visible: true,
            },
            {
              serial: 2,
              path: "0.1",
              tagName: "p",
              bounds: { left: 80, top: 270, width: 600, height: 80 },
              style: { ...base, fontSize: "36px" },
              isTextLeaf: true,
              text: "스모크 부제",
              img: null,
              svg: null,
              hasChildren: false,
              visible: true,
            },
          ],
        };
      },
    },
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
    googleApiKey: "smoke-stub-google-api-key",
    exitAfterBoot: false,
  };
}

function visualWeightRank(weight) {
  switch (weight) {
    case "dominant":
      return 0;
    case "secondary":
      return 1;
    case "tertiary":
      return 2;
    case "decorative":
      return 3;
    case "background":
      return 4;
    default:
      return 5;
  }
}

function pickBestTextObject(textObjects, usedObjectIds, predicate) {
  return (
    textObjects.find(
      (object) => !usedObjectIds.has(object.objectId) && predicate(object),
    ) ?? null
  );
}

function createDeterministicAdaptiveBuilder(finalizeAdaptiveCompositionDecision) {
  return async (input) => {
    const textObjects = [...input.projectedGraph.objects]
      .filter(
        (object) => object.layerType === "text" && object.sourceText !== null,
      )
      .sort((left, right) => {
        const weightDelta =
          visualWeightRank(left.visualWeight) - visualWeightRank(right.visualWeight);
        if (weightDelta !== 0) {
          return weightDelta;
        }
        return left.bounds.y - right.bounds.y;
      });
    const usedObjectIds = new Set();
    const elementDecisions = [];
    const addDecisions = [];
    const atomsByKind = new Map(
      input.messageAtomPlan.atoms.map((atom) => [atom.kind, atom]),
    );

    const assignAtomToTextObject = (atom, preferredObject) => {
      if (!atom) {
        return false;
      }
      const selectedObject =
        preferredObject ??
        pickBestTextObject(textObjects, usedObjectIds, () => true);
      if (!selectedObject) {
        return false;
      }
      usedObjectIds.add(selectedObject.objectId);
      elementDecisions.push({
        objectId: selectedObject.objectId,
        operation: "modify",
        newText: atom.text,
        carriesAtomIds: [atom.atomId],
        reason: `deterministic smoke mapping for ${atom.kind}`,
      });
      return true;
    };

    const primaryAtom = atomsByKind.get("primary");
    const primaryAssigned = assignAtomToTextObject(
      primaryAtom,
      pickBestTextObject(
        textObjects,
        usedObjectIds,
        (object) => object.visualWeight === "dominant",
      ) ?? textObjects[0] ?? null,
    );
    if (!primaryAssigned && primaryAtom) {
      addDecisions.push({
        vocabularyId: "badge_chip",
        text: primaryAtom.text,
        placementZone: "top-right",
        carriesAtomIds: [primaryAtom.atomId],
        reason: "deterministic smoke fallback for primary atom",
      });
    }

    assignAtomToTextObject(
      atomsByKind.get("offer"),
      pickBestTextObject(
        textObjects,
        usedObjectIds,
        (object) =>
          object.visualWeight === "secondary" ||
          String(object.objectId).includes("offer"),
      ),
    );

    const ctaAtom = atomsByKind.get("cta");
    const ctaAssigned = assignAtomToTextObject(
      ctaAtom,
      pickBestTextObject(
        textObjects,
        usedObjectIds,
        (object) =>
          String(object.objectId).includes("cta") ||
          object.compositeHint === "button",
      ),
    );
    if (!ctaAssigned && ctaAtom) {
      addDecisions.push({
        vocabularyId: "cta_button",
        text: ctaAtom.text,
        placementZone: "bottom",
        carriesAtomIds: [ctaAtom.atomId],
        reason: "deterministic smoke CTA fallback",
      });
    }

    assignAtomToTextObject(
      atomsByKind.get("detail") ?? atomsByKind.get("support"),
      pickBestTextObject(
        textObjects,
        usedObjectIds,
        (object) =>
          object.visualWeight === "tertiary" ||
          String(object.objectId).includes("footer"),
      ),
    );

    for (const object of textObjects) {
      if (usedObjectIds.has(object.objectId)) {
        continue;
      }
      elementDecisions.push({
        objectId: object.objectId,
        operation: "retain",
        newText: null,
        carriesAtomIds: [],
        reason: "deterministic smoke keeps residual text structure",
      });
    }

    return finalizeAdaptiveCompositionDecision(
      {
        elementDecisions,
        addDecisions,
        compositionSummary: "deterministic smoke adaptive composition decision",
      },
      {
        runId: input.runId,
        traceId: input.traceId,
        projectedGraph: input.projectedGraph,
        messageAtomPlan: input.messageAtomPlan,
      },
    );
  };
}

export function createStartRunRequest(
  prefix,
  options = {},
) {
  const canvasWidth = options.canvasWidth ?? 1080;
  const canvasHeight = options.canvasHeight ?? 1080;
  const sizeSerial = options.sizeSerial ?? "1080x1080@1";

  return {
    clientRequestId: `${prefix}-client-request-${Date.now()}`,
    editorSessionId: `${prefix}-editor-session`,
    surface: "toolditor",
    ...(options.workflowVariant
      ? { workflowVariant: options.workflowVariant }
      : {}),
    userInput: {
      prompt: options.prompt ?? "봄 세일 배너를 만들어줘",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
    editorContext: {
      documentId: `${prefix}-document-1`,
      pageId: `${prefix}-page-1`,
      canvasState: "empty",
      canvasWidth,
      canvasHeight,
      sizeSerial,
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

function buildSaveEvidence(runId, observedAt) {
  return {
    code: `template_${runId}`,
    serial: 198008,
    modified: observedAt,
    version: "2",
  };
}

function buildSaveReceipt(runId, seq, command, currentRevision, saveEvidence) {
  return {
    saveReceiptId: `save_receipt_${runId}_${seq}_${command.commandId}`,
    outputTemplateCode: saveEvidence.code,
    savedRevision: currentRevision,
    savedAt: saveEvidence.modified,
    reason: command.reason,
  };
}

export function buildMutationAckRequest(accepted, payload, currentRevision) {
  const isSaveOnlyMutation = payload.mutation.commands.every(
    (command) => command.op === "saveTemplate",
  );
  const resultingRevision = isSaveOnlyMutation
    ? currentRevision
    : currentRevision + 1;
  const observedAt = new Date().toISOString();

  return {
    resultingRevision,
    request: {
      runId: accepted.runId,
      traceId: accepted.traceId,
      mutationId: payload.mutation.mutationId,
      seq: payload.seq,
      status: "applied",
      targetPageId: payload.mutation.pageId,
      baseRevision: currentRevision,
      resultingRevision,
      resolvedLayerIds: Object.fromEntries(
        payload.mutation.commands
          .filter((command) => command.targetRef.clientLayerKey)
          .map((command) => [
            command.targetRef.clientLayerKey,
            command.targetRef.clientLayerKey,
          ]),
      ),
      commandResults: payload.mutation.commands.map((command) => {
        const baseResult = {
          commandId: command.commandId,
          op: command.op,
          status: "applied",
          resolvedLayerId: command.targetRef.clientLayerKey ?? "resolved-layer-1",
        };
        if (command.op !== "saveTemplate") {
          return baseResult;
        }

        const saveEvidence = buildSaveEvidence(accepted.runId, observedAt);
        return {
          ...baseResult,
          saveEvidence,
          saveReceipt: buildSaveReceipt(
            accepted.runId,
            payload.seq,
            command,
            currentRevision,
            saveEvidence,
          ),
        };
      }),
      clientObservedAt: observedAt,
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
  const sharedEnv = createSharedEnv(queueName);
  const { app, worker } = await createInProcessRuntime({ workspaceRoot, queueName });
  try {
    const accepted = await startRunViaInject(app, "smoke", {
      workflowVariant: "object_native_v1",
    });
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
    await assertBundleHasLatestSaveReceipt({
      objectStore: app.objectStore,
      bucket: sharedEnv.objectStoreBucket,
      runId: accepted.runId,
    });

    console.log("[smoke] transport pipeline completed successfully");
  } finally {
    await closeRuntime({ app, worker });
  }
}

export async function runObjectNativeSmokeInProcess({
  workspaceRoot,
  queueName,
}) {
  const { finalizeAdaptiveCompositionDecision } = await importModule(
    workspaceRoot,
    "apps/agent-worker/dist/phases/buildAdaptiveCompositionDecision.js",
  );
  const v6Overrides = await createSmokeV6Overrides();
  const sharedEnv = createSharedEnv(queueName);
  const { app, worker } = await createInProcessRuntime({
    workspaceRoot,
    queueName,
    workerOptions: {
      tooldiCatalogSourceClient: createObjectNativeFixtureSourceClient(),
      adaptiveCompositionDecisionBuilder:
        createDeterministicAdaptiveBuilder(finalizeAdaptiveCompositionDecision),
      v6Overrides,
    },
  });
  try {
    const accepted = await startRunViaInject(app, "object-native-smoke", {
      workflowVariant: "object_native_v1",
      canvasWidth: 1200,
      canvasHeight: 628,
      sizeSerial: "1200x628@1",
    });
    console.log(
      `[object-native-smoke] accepted run ${accepted.runId} trace=${accepted.traceId} (in-process)`,
    );

    const streamPromise = driveRunLifecycle({
      accepted,
      app,
      timeoutMs: 20000,
      logPrefix: "object-native-smoke",
    });
    const queuedJob = await waitForQueuedJob(app, accepted.runId, 1);
    const runPromise = worker.processRunJob(queuedJob.payload);

    const [lifecycle] = await Promise.all([streamPromise, runPromise]);

    assertObjectNativeLogs(lifecycle.runLogs);
    await assertBundleHasLatestSaveReceipt({
      objectStore: app.objectStore,
      bucket: sharedEnv.objectStoreBucket,
      runId: accepted.runId,
    });

    // Under v6 routing the legacy adaptive-composition artifacts are no longer
    // produced (the legacy chain is bypassed). We instead verify that the v6
    // pipeline output landed as an executable plan of schema v6 and that its
    // single action carries the primitive-mapped createLayer commands.
    const executablePlan = await readJsonObject(
      app.objectStore,
      sharedEnv.objectStoreBucket,
      attemptArtifactKey(accepted.runId, "executable-plan.json"),
    );
    assert.equal(executablePlan.planSchemaVersion, "v6-freeform-layout");
    assert.equal(executablePlan.actions.length, 1);
    assert.equal(
      executablePlan.actions[0].operation,
      "v6_apply_freeform_layout",
    );
    const v6Commands = executablePlan.actions[0].inputs.v6Commands;
    assert.ok(
      Array.isArray(v6Commands) && v6Commands.length >= 3,
      `expected ≥3 v6-mapped commands, got ${v6Commands?.length ?? "n/a"}`,
    );
    for (const cmd of v6Commands) {
      assert.equal(cmd.op, "createLayer");
    }

    console.log(
      `[object-native-smoke] verified v6 pipeline emitted ${v6Commands.length} createLayer commands via ${executablePlan.actions[0].toolName}`,
    );
  } finally {
    await closeRuntime({ app, worker });
  }
}

export async function runRetrySmokeInProcess({ workspaceRoot, queueName }) {
  const { app, worker } = await createInProcessRuntime({ workspaceRoot, queueName });
  try {
    const accepted = await startRunViaInject(app, "retry-smoke", {
      workflowVariant: "object_native_v1",
    });
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

async function createInProcessRuntime({
  workspaceRoot,
  queueName,
  workerOptions = {},
}) {
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
      ...workerOptions,
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
      `Injected ${method} ${url} failed with ${response.statusCode}: ${describeErrorPayload(responsePayload)} ` +
      `payload=${JSON.stringify(payload ?? null)}`,
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

async function startRunViaInject(app, prefix, options) {
  return injectJson(app, {
    method: "POST",
    url: "/api/agent-workflow/runs",
    payload: createStartRunRequest(prefix, options),
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
  const runLogs = [];

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
          runLogs.push(String(event.message ?? ""));
          if (String(event.message ?? "").includes("scheduled retry attempt 2")) {
            retryLogObserved = true;
            console.log(`[${logPrefix}] observed retry scheduling log`);
          }
          break;
        case "canvas.mutation":
          currentRevision = await postMutationAck(
            app,
            accepted,
            event,
            currentRevision,
          );
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
          return {
            currentRevision,
            runLogs,
          };
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
  const { request, resultingRevision } = buildMutationAckRequest(
    accepted,
    payload,
    currentRevision,
  );
  await injectJson(app, {
    method: "POST",
    url: `/api/agent-workflow/runs/${accepted.runId}/mutation-acks`,
    payload: request,
  });

  return resultingRevision;
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

function attemptArtifactKey(runId, fileName) {
  return `runs/${runId}/attempts/1/${fileName}`;
}

async function readJsonObject(objectStore, bucket, key) {
  const stored = await objectStore.getObject({
    bucket,
    key,
  });
  return JSON.parse(new TextDecoder().decode(stored.body));
}

async function assertBundleHasLatestSaveReceipt({
  objectStore,
  bucket,
  runId,
}) {
  const bundle = await readJsonObject(
    objectStore,
    bucket,
    `runs/${runId}/artifacts/bundle_${runId}.json`,
  );
  const latestSaveReceipt = bundle?.saveMetadata?.latestSaveReceipt;
  assert.ok(latestSaveReceipt);
  assert.ok(
    String(latestSaveReceipt.saveReceiptId ?? "").startsWith(
      `save_receipt_${runId}_`,
    ),
  );
  assert.equal(latestSaveReceipt.outputTemplateCode, `template_${runId}`);
  const checkpointLatestSaveReceiptId =
    bundle?.mutationLedger?.checkpoints?.[0]?.sourceRefs?.latestSaveReceiptId ??
    null;
  if (checkpointLatestSaveReceiptId !== null) {
    assert.equal(
      checkpointLatestSaveReceiptId,
      latestSaveReceipt.saveReceiptId,
    );
  }
}

function assertObjectNativeLogs(runLogs) {
  // Under v6 routing the legacy [source/object-native-*] artifact logs are no
  // longer emitted because those stages were bypassed. We instead expect the
  // v6 pipeline log entries.
  assert.ok(
    runLogs.some((message) => message.startsWith("[v6]")),
    "expected at least one v6 pipeline log entry",
  );
}

function createObjectNativeFixtureSourceClient() {
  const templateDocuments = new Map([
    [
      "template-weak",
      {
        code: "template-weak",
        metaData: {
          code: "template-weak",
          innerCode: "inner-template-weak",
          title: "봄 세일 히어로 약한 템플릿",
          width: "1200",
          height: "628",
          sizeUnit: "px",
          isShare: true,
          userId: "fixture",
          createdAt: "2026-04-15",
          modifiedAt: "2026-04-15",
          keyword: "봄|:|세일|:|배너",
        },
        canvas: {
          serial: "48",
          title: "소셜미디어 광고",
          width: "1200",
          height: "628",
          sizeUnit: "px",
        },
        pages: [
          {
            index: 0,
            raw: "{}",
            pattern: null,
            parsed: {
              backgroundType: "image",
              width: 1200,
              height: 628,
              objects: [
                { id: "meta-1", type: "text", text: "SPRING SALE", left: 80, top: 48, width: 160, height: 30, fontSize: 24, textAlign: "left", fill: "#ffffff" },
                { id: "display-1", type: "text", text: "할인해", left: 420, top: 250, width: 420, height: 220, fontSize: 132, textAlign: "left", fill: "#ffffff" },
                { id: "footer-1", type: "text", text: "이벤트 기간 내 혜택 적용", left: 320, top: 586, width: 480, height: 20, fontSize: 16, textAlign: "center", fill: "#ffffff" },
              ],
            },
          },
        ],
      },
    ],
    [
      "template-stable",
      {
        code: "template-stable",
        metaData: {
          code: "template-stable",
          innerCode: "inner-template-stable",
          title: "봄 세일 구조가 살아있는 템플릿",
          width: "1200",
          height: "628",
          sizeUnit: "px",
          isShare: true,
          userId: "fixture",
          createdAt: "2026-04-15",
          modifiedAt: "2026-04-15",
          keyword: "프로모션|:|배너",
        },
        canvas: {
          serial: "48",
          title: "소셜미디어 광고",
          width: "1200",
          height: "628",
          sizeUnit: "px",
        },
        pages: [
          {
            index: 0,
            raw: "{}",
            pattern: null,
            parsed: {
              backgroundType: "image",
              width: 787,
              height: 817,
              objects: [
                { id: "offer-text", type: "textbox", text: "전제품 최대 30%", left: 390, top: 132, width: 320, height: 48, originX: "center", originY: "top", textAlign: "center", fill: "#0f7035" },
                { id: "display-main", type: "textbox", text: "특별한 세일", left: 600, top: 188, width: 420, height: 160, originX: "center", originY: "top", textAlign: "center", fill: "#ffffff" },
                { id: "cta-text", type: "textbox", text: "지금 바로 확인하러 가기 ▶", left: 395, top: 620, width: 420, height: 40, originX: "center", originY: "top", textAlign: "center", fill: "#0f7035" },
                { id: "footer-1", type: "textbox", text: "이벤트 기간 내 혜택 적용", left: 395, top: 740, width: 420, height: 24, originX: "center", originY: "top", textAlign: "center", fill: "#ffffff" },
                { id: "decor-dot", type: "rect", left: 655, top: 66, width: 90, height: 90, originX: "left", originY: "top", fill: "rgba(255, 245, 156, 255)" },
              ],
            },
          },
        ],
      },
    ],
  ]);

  return {
    async searchBackgroundAssets(query) {
      return {
        sourceFamily: "background_source",
        page: query.page,
        hasNextPage: false,
        traceId: "trace-background",
        assets: [
          {
            assetId: "background:11",
            sourceFamily: "background_source",
            contentType: "background",
            serial: "11",
            uid: null,
            title: "봄 패턴 배경",
            keywordTokens: ["봄", "배너"],
            width: 1200,
            height: 628,
            thumbnailUrl: "https://thumb.test/background-11.png",
            originUrl: "https://origin.test/background-11.png",
            priceType: "free",
            isAi: false,
            creatorSerial: null,
            insertMode: "page_background",
            backgroundKind: "pattern",
            sourcePayload: {},
          },
        ],
      };
    },
    async searchGraphicAssets(query) {
      return {
        sourceFamily: "graphic_source",
        page: query.page,
        hasNextPage: false,
        traceId: "trace-graphic",
        assets: [
          {
            assetId: "graphic:22",
            sourceFamily: "graphic_source",
            contentType: "graphic",
            serial: "22",
            uid: null,
            title: "봄 장식 그래픽",
            keywordTokens: ["봄", "세일", "프로모션"],
            width: null,
            height: null,
            thumbnailUrl: "https://thumb.test/graphic-22.png",
            originUrl: "https://origin.test/graphic-22.png",
            priceType: "free",
            isAi: false,
            creatorSerial: null,
            insertMode: "object_element",
            graphicKind: "illust",
            extension: ".png",
            sourcePayload: {},
          },
        ],
      };
    },
    async searchPhotoAssets(query) {
      return {
        sourceFamily: "photo_source",
        page: query.page,
        hasNextPage: false,
        traceId: "trace-photo",
        assets: [],
      };
    },
    async listFontAssets() {
      return {
        sourceFamily: "font_source",
        page: 0,
        hasNextPage: false,
        traceId: null,
        assets: [
          {
            assetId: "font:701",
            sourceFamily: "font_source",
            contentType: "font",
            serial: "701",
            uid: null,
            title: "Spring Gothic",
            keywordTokens: ["고딕", "KOR"],
            width: null,
            height: null,
            thumbnailUrl: null,
            originUrl: null,
            priceType: null,
            isAi: false,
            creatorSerial: null,
            insertMode: "font_face",
            fontName: "Spring Gothic",
            fontFace: "SpringGothic",
            fontLanguage: "KOR",
            fontCategory: "고딕",
            supportedLanguages: ["KOR", "ENG"],
            fontWeights: [
              {
                serial: "701-400",
                fontSerial: "701",
                fontWeight: "400",
                convertWeight: "400",
                fontFace: "SpringGothic",
                fontFamily: "701_400",
                extension: "ttf",
                fileType: "font/ttf",
                orgFilename: "spring-regular.ttf",
                savedFilename: "spring-regular.ttf",
                thumbnailUrl: null,
              },
              {
                serial: "701-700",
                fontSerial: "701",
                fontWeight: "700",
                convertWeight: "700",
                fontFace: "SpringGothic",
                fontFamily: "701_700",
                extension: "ttf",
                fileType: "font/ttf",
                orgFilename: "spring-bold.ttf",
                savedFilename: "spring-bold.ttf",
                thumbnailUrl: null,
              },
            ],
            sourcePayload: {},
          },
        ],
      };
    },
    async searchTemplateAssets() {
      return {
        sourceFamily: "template_source",
        page: 1,
        hasNextPage: false,
        traceId: "trace-template",
        assets: [
          {
            assetId: "asset-weak",
            sourceFamily: "template_source",
            contentType: "template",
            serial: "serial-weak",
            uid: "template-weak",
            title: "봄 세일 배너",
            keywordTokens: ["봄", "세일", "배너"],
            width: 1200,
            height: 628,
            thumbnailUrl: "https://thumb.test/template-weak.png",
            originUrl: "https://thumb.test/template-weak.png",
            priceType: "paid",
            isAi: false,
            creatorSerial: "fixture",
            insertMode: "page_background",
            code: "template-weak",
            pages: 1,
            categoryName: "소셜미디어 광고",
            price: 8000,
            totalObjectPrice: 0,
            isPurchased: false,
            thumbnails: ["https://thumb.test/template-weak.png"],
            sourcePayload: {},
          },
          {
            assetId: "asset-stable",
            sourceFamily: "template_source",
            contentType: "template",
            serial: "serial-stable",
            uid: "template-stable",
            title: "프로모션 이벤트 광고",
            keywordTokens: ["프로모션", "이벤트"],
            width: 1200,
            height: 628,
            thumbnailUrl: "https://thumb.test/template-stable.png",
            originUrl: "https://thumb.test/template-stable.png",
            priceType: "paid",
            isAi: false,
            creatorSerial: "fixture",
            insertMode: "page_background",
            code: "template-stable",
            pages: 1,
            categoryName: "소셜미디어 광고",
            price: 8000,
            totalObjectPrice: 0,
            isPurchased: false,
            thumbnails: ["https://thumb.test/template-stable.png"],
            sourcePayload: {},
          },
        ],
      };
    },
    async getTemplateDocument(query) {
      const document = templateDocuments.get(query.templateCode);
      if (!document) {
        throw new Error(`Unknown fixture templateCode: ${query.templateCode}`);
      }
      return document;
    },
  };
}
