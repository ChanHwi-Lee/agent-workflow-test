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
  TooldiCatalogSourceClient,
} from "@tooldi/tool-adapters";

import type { BackendCallbackClient } from "../clients/backendCallbackClient.js";
import { createWorkerLogger } from "../lib/logger.js";
import { processRunJob } from "./processRunJob.js";
import { createWorkerToolRegistry } from "../tools/registry.js";
import { createAssetStorageClient } from "../tools/adapters/assetStorageAdapter.js";
import { createImagePrimitiveClient } from "../tools/adapters/imagePrimitiveAdapter.js";
import { createTemplateCatalogClient } from "../tools/adapters/templateCatalogAdapter.js";
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

function createRealSourceEnv(): AgentWorkerEnv {
  return {
    ...createEnv(),
    tooldiCatalogSourceMode: "tooldi_api",
    tooldiContentApiBaseUrl: "http://localhost:8080",
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
    const currentSeq = this.ackWaits.length;
    return {
      found: true,
      status: "acked",
      seq: currentSeq,
      resultingRevision: currentSeq,
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

class FakeTooldiCatalogSourceClient implements TooldiCatalogSourceClient {
  async searchBackgroundAssets() {
    return {
      sourceFamily: "background_source" as const,
      page: 1,
      hasNextPage: false,
      traceId: "trace-background",
      assets: [
        {
          assetId: "background:11",
          sourceFamily: "background_source" as const,
          contentType: "background" as const,
          serial: "11",
          uid: null,
          title: "봄 패턴 배경",
          keywordTokens: ["봄", "패턴", "배너"],
          width: 1080,
          height: 1080,
          thumbnailUrl: "https://thumb.test/background-11.png",
          originUrl: "https://origin.test/background-11.png",
          priceType: "free" as const,
          isAi: false,
          creatorSerial: null,
          insertMode: "page_background" as const,
          backgroundKind: "pattern" as const,
          sourcePayload: {},
        },
      ],
    };
  }

  async searchGraphicAssets() {
    return {
      sourceFamily: "graphic_source" as const,
      page: 0,
      hasNextPage: false,
      traceId: "trace-graphic",
      assets: [
        {
          assetId: "graphic:22",
          sourceFamily: "graphic_source" as const,
          contentType: "graphic" as const,
          serial: "22",
          uid: null,
          title: "봄 일러스트",
          keywordTokens: ["봄", "꽃", "프로모션"],
          width: null,
          height: null,
          thumbnailUrl: "https://thumb.test/graphic-22.png",
          originUrl: "https://origin.test/graphic-22.png",
          priceType: "free" as const,
          isAi: false,
          creatorSerial: null,
          insertMode: "object_element" as const,
          graphicKind: "illust" as const,
          extension: ".png",
          sourcePayload: {},
        },
      ],
    };
  }

  async searchPhotoAssets() {
    return {
      sourceFamily: "photo_source" as const,
      page: 0,
      hasNextPage: false,
      traceId: "trace-photo",
      assets: [
        {
          assetId: "photo:33",
          sourceFamily: "photo_source" as const,
          contentType: "photo" as const,
          serial: "33",
          uid: null,
          title: "봄 꽃길 사진",
          keywordTokens: ["봄", "꽃", "야외"],
          width: 1600,
          height: 900,
          thumbnailUrl: "https://thumb.test/photo-33.png",
          originUrl: "https://origin.test/photo-33.png",
          priceType: "free" as const,
          isAi: false,
          creatorSerial: null,
          insertMode: "object_image" as const,
          orientation: "landscape" as const,
          backgroundRemovalHint: false,
          sourcePayload: {},
        },
      ],
    };
  }

  async listFontAssets() {
    return {
      sourceFamily: "font_source" as const,
      page: 0,
      hasNextPage: false,
      traceId: null,
      assets: [
        {
          assetId: "font:701",
          sourceFamily: "font_source" as const,
          contentType: "font" as const,
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
          insertMode: "font_face" as const,
          fontName: "Spring Gothic",
          fontFace: "SpringGothic",
          fontLanguage: "KOR" as const,
          fontCategory: "고딕",
          supportedLanguages: ["KOR", "ENG"] as Array<
            "KOR" | "ENG" | "CHN" | "JPN"
          >,
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
    templateCatalogClient: createTemplateCatalogClient(),
  });
  const plan = result.plan;
  const selectionDecision = result.selectionDecision;
  const candidateSets = result.candidateSets;

  assert.equal(result.intent.operationFamily, "create_template");
  assert.equal(result.intent.templateKind, "seasonal_sale_banner");
  assert.equal(result.intent.layoutIntent, "copy_focused");
  assert.equal(result.intent.assetPolicy, "graphic_allowed_photo_optional");
  assert.ok(plan);
  assert.equal(plan.actions.length, 3);
  assert.equal(result.emittedMutationIds.length, 3);
  assert.ok(selectionDecision);
  assert.equal(selectionDecision.retrievalMode, "none");
  assert.equal(selectionDecision.backgroundMode, "spring_pattern");
  assert.equal(selectionDecision.layoutMode, "center_stack");
  assert.equal(selectionDecision.decorationMode, "graphic_cluster");
  assert.ok(candidateSets);
  assert.equal(candidateSets.background.family, "background");
  assert.equal(candidateSets.layout.family, "layout");
  assert.equal(candidateSets.decoration.family, "decoration");
  assert.equal(candidateSets.photo.family, "photo");
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
  assert.equal(callbackClient.ackWaits.length, 3);
  assert.equal(callbackClient.finalizations.length, 1);
  assert.equal(callbackClient.finalizations[0]?.lastAckedSeq, 3);
  assert.equal(
    callbackClient.finalizations[0]?.normalizedIntentRef,
    `runs/${testRun.runId}/attempts/1/normalized-intent.json`,
  );
  assert.equal(
    callbackClient.finalizations[0]?.executablePlanRef,
    `runs/${testRun.runId}/attempts/1/executable-plan.json`,
  );
  assert.equal(
    callbackClient.finalizations[0]?.candidateSetRef,
    `runs/${testRun.runId}/attempts/1/template-candidate-set.json`,
  );
  assert.equal(
    callbackClient.finalizations[0]?.sourceSearchSummaryRef,
    `runs/${testRun.runId}/attempts/1/source-search-summary.json`,
  );
  assert.equal(
    callbackClient.finalizations[0]?.selectionDecisionRef,
    `runs/${testRun.runId}/attempts/1/selection-decision.json`,
  );
  assert.equal(
    callbackClient.finalizations[0]?.typographyDecisionRef,
    `runs/${testRun.runId}/attempts/1/typography-decision.json`,
  );
  assert.equal(
    callbackClient.finalizations[0]?.latestSaveReceiptId,
    `save_receipt_${testRun.runId}_1`,
  );
  assert.equal(
    result.artifactRefs.candidateSetRef,
    `runs/${testRun.runId}/attempts/1/template-candidate-set.json`,
  );
  assert.equal(
    result.artifactRefs.retrievalStageRef,
    `runs/${testRun.runId}/attempts/1/retrieval-stage.json`,
  );
  assert.equal(
    result.artifactRefs.sourceSearchSummaryRef,
    `runs/${testRun.runId}/attempts/1/source-search-summary.json`,
  );
  assert.equal(
    result.artifactRefs.selectionDecisionRef,
    `runs/${testRun.runId}/attempts/1/selection-decision.json`,
  );
  assert.equal(
    result.artifactRefs.typographyDecisionRef,
    `runs/${testRun.runId}/attempts/1/typography-decision.json`,
  );
  assert.ok(result.retrievalStage);
  assert.equal(result.retrievalStage.retrievalMode, "none");
  assert.equal(result.retrievalStage.status, "disabled");
  assert.equal(
    result.retrievalStage.allowedSourceFamilies.includes("photo_source"),
    true,
  );
  assert.deepEqual(plan.actions.map((action) => action.dependsOn), [
    [],
    [plan.actions[0]!.actionId],
    [plan.actions[1]!.actionId],
  ]);
  assert.equal(callbackClient.ackWaits[0]?.query.waitMs, 15000);
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("Stage 1/3"),
    ),
    true,
  );

  const persistedCandidateSet = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: result.artifactRefs.candidateSetRef!,
        })
      ).body,
    ),
  ) as {
    background: { candidates: Array<{ sourceFamily: string }> };
    decoration: { candidates: Array<{ sourceFamily: string }> };
    photo: { candidates: Array<{ sourceFamily: string }> };
  };
  assert.equal(
    persistedCandidateSet.photo.candidates.some(
      (candidate) => candidate.sourceFamily === "photo_source",
    ),
    true,
  );
  assert.equal(
    persistedCandidateSet.decoration.candidates.some(
      (candidate) => candidate.sourceFamily === "graphic_source",
    ),
    true,
  );

  const proposedMutations = callbackClient.appendedEvents
    .filter(
      (event): event is WorkerAppendEventRequest & {
        event: Extract<WorkerAppendEventRequest["event"], { type: "mutation.proposed" }>;
      } => event.event.type === "mutation.proposed",
    )
    .map((event) => event.event.mutation);

  for (const mutation of proposedMutations) {
    for (const command of mutation.commands) {
      if (!("layerBlueprint" in command)) {
        continue;
      }
      const bounds = (command as { layerBlueprint: { bounds: { x: number; y: number; width: number; height: number } } }).layerBlueprint.bounds;
      assert.ok(bounds.x >= 0);
      assert.ok(bounds.y >= 0);
      assert.ok(bounds.x + bounds.width <= testRun.request.editorContext.canvasWidth);
      assert.ok(bounds.y + bounds.height <= testRun.request.editorContext.canvasHeight);
    }
  }
  assert.equal(
    proposedMutations.some((mutation) =>
      mutation.commands.some(
        (command) =>
          "layerBlueprint" in command &&
          command.layerBlueprint.metadata?.role === "hero_caption",
      ),
    ),
    false,
  );
});

test("processRunJob can activate real Tooldi background/graphic/font source mode", async () => {
  const env = createRealSourceEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
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
    templateCatalogClient: createTemplateCatalogClient(),
    tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
  });

  assert.equal(result.selectionDecision?.selectedBackgroundSerial, "11");
  assert.equal(result.selectionDecision?.selectedDecorationSerial, "22");
  assert.equal(result.selectionDecision?.topPhotoSerial, "33");
  assert.equal(result.selectionDecision?.selectedBackgroundCategory, "pattern");
  assert.equal(result.selectionDecision?.selectedDecorationCategory, "illust");
  assert.equal(result.selectionDecision?.topPhotoCategory, "landscape");
  assert.equal(result.selectionDecision?.photoBranchMode, "not_considered");
  assert.equal(result.typographyDecision?.display?.fontToken, "701_700");
  assert.equal(result.typographyDecision?.body?.fontToken, "701_400");
  assert.equal(result.sourceSearchSummary?.background.returnedCount, 1);
  assert.equal(result.sourceSearchSummary?.graphic.returnedCount, 1);
  assert.equal(result.sourceSearchSummary?.photo.returnedCount, 1);
  assert.equal(result.sourceSearchSummary?.font.returnedCount, 1);
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("[source/background]") &&
        event.event.message.includes("selectedSerial=11"),
    ),
    true,
  );
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("[source/photo]") &&
        event.event.message.includes("selectedSerial=33"),
    ),
    true,
  );
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("[source/photo-branch]") &&
        event.event.message.includes("mode=not_considered"),
    ),
    true,
  );
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("[source/font]") &&
        event.event.message.includes("display=701_700 body=701_400"),
    ),
    true,
  );

  const selectionArtifact = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: result.artifactRefs.selectionDecisionRef!,
        })
      ).body,
    ),
  ) as {
    selectedBackgroundAssetId: string | null;
    selectedDecorationAssetId: string | null;
  };
  assert.equal(selectionArtifact.selectedBackgroundAssetId, "background:11");
  assert.equal(selectionArtifact.selectedDecorationAssetId, "graphic:22");

  const sourceSummaryArtifact = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: result.artifactRefs.sourceSearchSummaryRef!,
        })
      ).body,
    ),
  ) as {
    sourceMode: string;
    font: { selectedSerial: string | null };
  };
  assert.equal(sourceSummaryArtifact.sourceMode, "tooldi_api");
  assert.equal(sourceSummaryArtifact.font.selectedSerial, "701");
});

test("processRunJob can activate the photo hero execution path on the wide preset", async () => {
  const env = createRealSourceEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  const seedRun = createTestRun();
  const testRun = createTestRun({
    editorContext: {
      ...seedRun.request.editorContext,
      canvasWidth: 1200,
      canvasHeight: 628,
      sizeSerial: "1200x628@1",
    },
  });

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

  const baseSourceClient = new FakeTooldiCatalogSourceClient();
  const photoPreferredSourceClient: TooldiCatalogSourceClient = {
    searchBackgroundAssets: async (_query) =>
      baseSourceClient.searchBackgroundAssets(),
    searchPhotoAssets: async (_query) => baseSourceClient.searchPhotoAssets(),
    listFontAssets: async (_query) => baseSourceClient.listFontAssets(),
    async searchGraphicAssets() {
      return {
        sourceFamily: "graphic_source" as const,
        page: 0,
        hasNextPage: false,
        traceId: "trace-graphic-low",
        assets: [
          {
            assetId: "graphic:44",
            sourceFamily: "graphic_source" as const,
            contentType: "graphic" as const,
            serial: "44",
            uid: null,
            title: "장식 아이콘",
            keywordTokens: ["프로모션"],
            width: null,
            height: null,
            thumbnailUrl: "https://thumb.test/graphic-44.png",
            originUrl: "https://origin.test/graphic-44.png",
            priceType: "free" as const,
            isAi: false,
            creatorSerial: null,
            insertMode: "object_element" as const,
            graphicKind: "icon" as const,
            extension: ".png",
            sourcePayload: {},
          },
        ],
      };
    },
  };

  const result = await processRunJob(testRun.job, {
    env,
    logger,
    objectStore,
    callbackClient,
    toolRegistry: createWorkerToolRegistry(),
    imagePrimitiveClient: createImagePrimitiveClient(),
    assetStorageClient: createAssetStorageClient(),
    textLayoutHelper: createTextLayoutHelper(),
    templateCatalogClient: createTemplateCatalogClient(),
    tooldiCatalogSourceClient: photoPreferredSourceClient,
  });

  assert.equal(result.selectionDecision?.layoutMode, "copy_left_with_right_photo");
  assert.equal(
    result.selectionDecision?.selectedLayoutCandidateId,
    "layout_copy_left_with_right_photo",
  );
  assert.equal(result.selectionDecision?.photoBranchMode, "photo_selected");
  assert.equal(result.selectionDecision?.topPhotoSerial, "33");
  assert.equal(result.selectionDecision?.executionStrategy, "photo_hero_shape_text_group");
  assert.equal(result.selectionDecision?.topPhotoUrl, "https://origin.test/photo-33.png");
  assert.equal(result.selectionDecision?.topPhotoWidth, 1600);
  assert.equal(result.selectionDecision?.topPhotoHeight, 900);
  assert.equal(result.plan?.actions.length, 4);
  assert.equal(
    result.plan?.actions.some((action) => action.operation === "place_photo_hero"),
    true,
  );
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("[source/photo-branch]") &&
        event.event.message.includes("mode=photo_selected"),
    ),
    true,
  );
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("[source/photo-execution]") &&
        event.event.message.includes("serial=33"),
    ),
    true,
  );
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("Stage 2/4 (photo)"),
    ),
    true,
  );

  const photoMutation = callbackClient.appendedEvents.find(
    (event): event is WorkerAppendEventRequest & {
      event: Extract<WorkerAppendEventRequest["event"], { type: "mutation.proposed" }>;
    } =>
      event.event.type === "mutation.proposed" &&
      event.event.mutation.commands.some((command) => command.slotKey === "hero_image"),
  );

  assert.ok(photoMutation);
  const heroImageCommand = photoMutation.event.mutation.commands.find(
    (command) => command.slotKey === "hero_image",
  );
  assert.ok(heroImageCommand && "layerBlueprint" in heroImageCommand);
  if (!heroImageCommand || !("layerBlueprint" in heroImageCommand)) {
    return;
  }
  assert.equal(heroImageCommand.layerBlueprint.layerType, "image");
  assert.equal(heroImageCommand.layerBlueprint.metadata?.sourceSerial, "33");
  assert.equal(
    heroImageCommand.layerBlueprint.metadata?.sourceOriginUrl,
    "https://origin.test/photo-33.png",
  );
});

test("processRunJob can promote a real-like photo candidate when it stays within the wide-preset tolerance window", async () => {
  const env = createRealSourceEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  const seedRun = createTestRun();
  const testRun = createTestRun({
    editorContext: {
      ...seedRun.request.editorContext,
      canvasWidth: 1200,
      canvasHeight: 628,
      sizeSerial: "1200x628@1",
    },
  });

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
    templateCatalogClient: createTemplateCatalogClient(),
    tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
  });

  assert.equal(result.selectionDecision?.photoBranchMode, "photo_selected");
  assert.equal(
    result.selectionDecision?.photoBranchReason,
    "photo candidate stayed within the promotion tolerance window and is preferred for the wide preset hero-photo slot",
  );
  assert.equal(
    result.selectionDecision?.selectedLayoutCandidateId,
    "layout_copy_left_with_right_photo",
  );
  assert.equal(result.plan?.actions.length, 4);
  assert.equal(
    result.plan?.actions.some((action) => action.operation === "place_photo_hero"),
    true,
  );
});

test("processRunJob keeps graphic path when top photo candidate is not executable", async () => {
  const env = createRealSourceEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  const seedRun = createTestRun();
  const testRun = createTestRun({
    editorContext: {
      ...seedRun.request.editorContext,
      canvasWidth: 1200,
      canvasHeight: 628,
      sizeSerial: "1200x628@1",
    },
  });

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

  const baseSourceClient = new FakeTooldiCatalogSourceClient();
  const nonExecutablePhotoSourceClient: TooldiCatalogSourceClient = {
    searchBackgroundAssets: async (_query) =>
      baseSourceClient.searchBackgroundAssets(),
    searchGraphicAssets: async (_query) => baseSourceClient.searchGraphicAssets(),
    listFontAssets: async (_query) => baseSourceClient.listFontAssets(),
    async searchPhotoAssets(_query) {
      return {
        sourceFamily: "photo_source" as const,
        page: 0,
        hasNextPage: false,
        traceId: "trace-photo-non-executable",
        assets: [
          {
            assetId: "photo:91",
            sourceFamily: "photo_source" as const,
            contentType: "photo" as const,
            serial: "91",
            uid: null,
            title: "봄 들판 사진",
            keywordTokens: ["봄", "야외"],
            width: null,
            height: 900,
            thumbnailUrl: "https://thumb.test/photo-91.png",
            originUrl: null,
            priceType: "free" as const,
            isAi: false,
            creatorSerial: null,
            insertMode: "object_image" as const,
            orientation: "landscape" as const,
            backgroundRemovalHint: true,
            sourcePayload: {},
          },
        ],
      };
    },
  };

  const result = await processRunJob(testRun.job, {
    env,
    logger,
    objectStore,
    callbackClient,
    toolRegistry: createWorkerToolRegistry(),
    imagePrimitiveClient: createImagePrimitiveClient(),
    assetStorageClient: createAssetStorageClient(),
    textLayoutHelper: createTextLayoutHelper(),
    templateCatalogClient: createTemplateCatalogClient(),
    tooldiCatalogSourceClient: nonExecutablePhotoSourceClient,
  });

  assert.equal(result.selectionDecision?.topPhotoSerial, "91");
  assert.equal(result.selectionDecision?.photoBranchMode, "graphic_preferred");
  assert.equal(
    result.selectionDecision?.photoBranchReason,
    "photo candidate is missing executable metadata required for the hero-photo slot",
  );
  assert.equal(
    result.selectionDecision?.selectedLayoutCandidateId,
    "layout_copy_left_with_right_decoration",
  );
  assert.equal(result.plan?.actions.length, 3);
  assert.equal(
    result.plan?.actions.some((action) => action.operation === "place_photo_hero"),
    false,
  );
});

test("processRunJob rejects non-empty canvas runs for the spring vertical slice", async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  const seedRun = createTestRun();
  const testRun = createTestRun({
    editorContext: seedRun.request.editorContext,
  });
  testRun.request.editorContext = {
    ...testRun.request.editorContext,
    canvasState: "filled" as never,
  };
  testRun.snapshot.editorContext = testRun.request.editorContext;

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
    templateCatalogClient: createTemplateCatalogClient(),
  });

  assert.equal(result.intent.operationFamily, "update_layer");
  assert.equal(result.finalizeDraft.request.finalStatus, "failed");
  assert.equal(
    result.finalizeDraft.request.errorSummary?.code,
    "unsupported_v1_vertical_slice",
  );
  assert.equal(result.emittedMutationIds.length, 0);
  assert.equal(result.plan, undefined);
  assert.equal(result.candidateSets, undefined);
  assert.equal(
    callbackClient.appendedEvents.some((event) => event.event.type === "mutation.proposed"),
    false,
  );
});

test("processRunJob keeps the representative wide banner geometry inside the canvas", async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  const seedRun = createTestRun();
  const testRun = createTestRun({
    editorContext: {
      ...seedRun.request.editorContext,
      canvasWidth: 1200,
      canvasHeight: 628,
      sizeSerial: "1200x628@1",
    },
  });

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
    templateCatalogClient: createTemplateCatalogClient(),
  });

  assert.equal(result.selectionDecision?.layoutMode, "copy_left_with_right_decoration");

  const proposedMutations = callbackClient.appendedEvents
    .filter(
      (event): event is WorkerAppendEventRequest & {
        event: Extract<WorkerAppendEventRequest["event"], { type: "mutation.proposed" }>;
      } => event.event.type === "mutation.proposed",
    )
    .map((event) => event.event.mutation);

  for (const mutation of proposedMutations) {
    for (const command of mutation.commands) {
      if (!("layerBlueprint" in command)) {
        continue;
      }
      const bounds = (command as { layerBlueprint: { bounds: { x: number; y: number; width: number; height: number } } }).layerBlueprint.bounds;
      assert.ok(bounds.x >= 0);
      assert.ok(bounds.y >= 0);
      assert.ok(bounds.x + bounds.width <= 1200);
      assert.ok(bounds.y + bounds.height <= 628);
    }
  }
  assert.equal(
    proposedMutations.some((mutation) =>
      mutation.commands.some(
        (command) =>
          "layerBlueprint" in command &&
          command.layerBlueprint.metadata?.role === "hero_caption",
      ),
    ),
    true,
  );
  assert.equal(
    proposedMutations.some((mutation) =>
      mutation.commands.some((command) => command.slotKey === "badge"),
    ),
    false,
  );
});

test("processRunJob retrieval seam disables photo candidates when photo catalog tool is absent", async () => {
  const env = createRealSourceEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
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

  const toolRegistry = createWorkerToolRegistry({
    disabledToolNames: ["photo-catalog"],
  });
  let photoSearchCalls = 0;
  const baseSourceClient = new FakeTooldiCatalogSourceClient();
  const countingSourceClient: TooldiCatalogSourceClient = {
    searchBackgroundAssets: async (_query) =>
      baseSourceClient.searchBackgroundAssets(),
    searchGraphicAssets: async (_query) =>
      baseSourceClient.searchGraphicAssets(),
    searchPhotoAssets: async (_query) => {
      photoSearchCalls += 1;
      return baseSourceClient.searchPhotoAssets();
    },
    listFontAssets: async (_query) => baseSourceClient.listFontAssets(),
  };

  const result = await processRunJob(testRun.job, {
    env,
    logger,
    objectStore,
    callbackClient,
    toolRegistry,
    imagePrimitiveClient: createImagePrimitiveClient(),
    assetStorageClient: createAssetStorageClient(),
    textLayoutHelper: createTextLayoutHelper(),
    templateCatalogClient: createTemplateCatalogClient(),
    tooldiCatalogSourceClient: countingSourceClient,
  });

  assert.ok(result.retrievalStage);
  assert.equal(
    result.retrievalStage.allowedSourceFamilies.includes("photo_source"),
    false,
  );
  assert.equal(photoSearchCalls, 0);
  assert.equal(result.candidateSets?.photo.candidates.length, 0);
  assert.equal(result.sourceSearchSummary?.photo.returnedCount, 0);
  assert.equal(result.selectionDecision?.topPhotoSerial, null);
  assert.equal(result.selectionDecision?.photoBranchMode, "not_considered");
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
    templateCatalogClient: createTemplateCatalogClient(),
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
    templateCatalogClient: createTemplateCatalogClient(),
  });

  assert.equal(result.finalizeDraft.request.finalStatus, "failed");
  assert.equal(result.finalizeDraft.request.errorSummary?.code, "mutation_ack_timed_out");
  assert.equal(imagePrimitiveClient.generateCalls, 0);
  assert.equal(assetStorageClient.persistCalls, 0);
});

test("processRunJob preserves rejected mutation reason in stage log and finalize summary", async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  callbackClient.waitMutationAckResponseFactory = (_mutationId, _query) => {
    const currentSeq = callbackClient.ackWaits.length;
    if (currentSeq >= 2) {
      return {
        found: true,
        status: "rejected",
        seq: currentSeq,
        error: {
          code: "revision_mismatch",
          message: "현재 캔버스 리비전이 mutation 기대값과 다릅니다.",
        },
      };
    }

    return {
      found: true,
      status: "acked",
      seq: currentSeq,
      resultingRevision: currentSeq,
    };
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

  const result = await processRunJob(testRun.job, {
    env,
    logger,
    objectStore,
    callbackClient,
    toolRegistry: createWorkerToolRegistry(),
    imagePrimitiveClient: createImagePrimitiveClient(),
    assetStorageClient: createAssetStorageClient(),
    textLayoutHelper: createTextLayoutHelper(),
    templateCatalogClient: createTemplateCatalogClient(),
  });

  assert.equal(result.finalizeDraft.request.finalStatus, "failed");
  assert.equal(result.finalizeDraft.request.errorSummary?.code, "revision_mismatch");
  assert.equal(
    result.finalizeDraft.request.errorSummary?.message,
    "현재 캔버스 리비전이 mutation 기대값과 다릅니다.",
  );
  assert.equal(callbackClient.ackWaits.length, 2);
  assert.equal(
    callbackClient.appendedEvents.filter((event) => event.event.type === "mutation.proposed")
      .length,
    2,
  );
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("code=revision_mismatch"),
    ),
    true,
  );
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes(
          "Stopped remaining stages after copy stage returned rejected",
        ),
    ),
    true,
  );
});

test("processRunJob stops immediately after a rejected photo stage under fail-fast policy", async () => {
  const env = createRealSourceEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  callbackClient.waitMutationAckResponseFactory = (_mutationId, _query) => {
    const currentSeq = callbackClient.ackWaits.length;
    if (currentSeq === 1) {
      return {
        found: true,
        status: "acked",
        seq: 1,
        resultingRevision: 1,
      };
    }

    return {
      found: true,
      status: "rejected",
      seq: 2,
      error: {
        code: "photo_apply_failed",
        message: "사진 hero object 생성에 실패했습니다.",
      },
    };
  };

  const seedRun = createTestRun();
  const testRun = createTestRun({
    editorContext: {
      ...seedRun.request.editorContext,
      canvasWidth: 1200,
      canvasHeight: 628,
      sizeSerial: "1200x628@1",
    },
  });

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

  const baseSourceClient = new FakeTooldiCatalogSourceClient();
  const photoPreferredSourceClient: TooldiCatalogSourceClient = {
    searchBackgroundAssets: async (_query) =>
      baseSourceClient.searchBackgroundAssets(),
    searchPhotoAssets: async (_query) => baseSourceClient.searchPhotoAssets(),
    listFontAssets: async (_query) => baseSourceClient.listFontAssets(),
    async searchGraphicAssets() {
      return {
        sourceFamily: "graphic_source" as const,
        page: 0,
        hasNextPage: false,
        traceId: "trace-graphic-low-fail-fast",
        assets: [
          {
            assetId: "graphic:55",
            sourceFamily: "graphic_source" as const,
            contentType: "graphic" as const,
            serial: "55",
            uid: null,
            title: "보조 아이콘",
            keywordTokens: ["프로모션"],
            width: null,
            height: null,
            thumbnailUrl: "https://thumb.test/graphic-55.png",
            originUrl: "https://origin.test/graphic-55.png",
            priceType: "free" as const,
            isAi: false,
            creatorSerial: null,
            insertMode: "object_element" as const,
            graphicKind: "icon" as const,
            extension: ".png",
            sourcePayload: {},
          },
        ],
      };
    },
  };

  const result = await processRunJob(testRun.job, {
    env,
    logger,
    objectStore,
    callbackClient,
    toolRegistry: createWorkerToolRegistry(),
    imagePrimitiveClient: createImagePrimitiveClient(),
    assetStorageClient: createAssetStorageClient(),
    textLayoutHelper: createTextLayoutHelper(),
    templateCatalogClient: createTemplateCatalogClient(),
    tooldiCatalogSourceClient: photoPreferredSourceClient,
  });

  assert.equal(result.selectionDecision?.photoBranchMode, "photo_selected");
  assert.equal(result.finalizeDraft.request.finalStatus, "failed");
  assert.equal(result.finalizeDraft.request.errorSummary?.code, "photo_apply_failed");
  assert.equal(callbackClient.ackWaits.length, 2);
  assert.equal(
    callbackClient.appendedEvents.filter((event) => event.event.type === "mutation.proposed")
      .length,
    2,
  );
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes(
          "Fail-fast policy stopped remaining stages after the photo stage was not acknowledged",
        ),
    ),
    true,
  );
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("Refinement placeholder completed"),
    ),
    false,
  );
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
      templateCatalogClient: createTemplateCatalogClient(),
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
