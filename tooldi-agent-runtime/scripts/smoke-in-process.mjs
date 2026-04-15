import assert from "node:assert/strict";
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
  const sharedEnv = createSharedEnv(queueName);
  const { app, worker } = await createInProcessRuntime({
    workspaceRoot,
    queueName,
    workerOptions: {
      tooldiCatalogSourceClient: createObjectNativeFixtureSourceClient(),
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

    const [audit, selection, renderability, freeformLayoutPlan] = await Promise.all([
      readJsonObject(app.objectStore, sharedEnv.objectStoreBucket, attemptArtifactKey(accepted.runId, "object-native-reference-audit.json")),
      readJsonObject(app.objectStore, sharedEnv.objectStoreBucket, attemptArtifactKey(accepted.runId, "object-native-candidate-selection.json")),
      readJsonObject(app.objectStore, sharedEnv.objectStoreBucket, attemptArtifactKey(accepted.runId, "object-native-renderability-report.json")),
      readJsonObject(app.objectStore, sharedEnv.objectStoreBucket, attemptArtifactKey(accepted.runId, "object-native-freeform-layout-plan.json")),
    ]);

    assert.equal(audit.workflowVariant, "object_native_v1");
    assert.ok(Array.isArray(audit.entries));
    assert.ok(audit.entries.length > 0);
    assert.equal(selection.workflowVariant, "object_native_v1");
    assert.equal(selection.reselectionApplied, true);
    assert.equal(selection.nextSelectedTemplateCode, "template-stable");
    assert.equal(selection.selectedReadiness, "stable_capable");
    assert.equal(selection.selectedFailureStage, "none");
    assert.ok(
      [
        "none",
        "precondition_failure",
        "semantic_gate_failure",
        "binding_failure",
        "renderability_guard_failure",
      ].includes(selection.selectedFailureStage),
    );
    assert.equal(renderability.workflowVariant, "object_native_v1");
    assert.equal(renderability.passed, true);
    assert.equal(renderability.failureStage, "none");
    assert.equal(renderability.compositionStatus, "stable");
    assert.equal(renderability.selectedTemplateCode, "template-stable");
    assert.ok(
      [
        "none",
        "precondition_failure",
        "semantic_gate_failure",
        "binding_failure",
        "renderability_guard_failure",
      ].includes(renderability.failureStage),
    );
    assert.equal(freeformLayoutPlan.workflowVariant, "object_native_v1");
    assert.equal(
      freeformLayoutPlan.selectedTemplateCode,
      selection.nextSelectedTemplateCode,
    );
    assert.equal(freeformLayoutPlan.compositionStatus, "stable");

    console.log(
      `[object-native-smoke] verified object-native artifacts selected=${selection.nextSelectedTemplateCode} status=${renderability.compositionStatus}`,
    );
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
  for (const prefix of [
    "[source/object-native-audit]",
    "[source/object-native-selection]",
    "[source/object-native-renderability]",
  ]) {
    assert.ok(runLogs.some((message) => message.startsWith(prefix)));
  }
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
