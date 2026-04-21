import assert from "node:assert/strict";
import test from "node:test";

import type {
  RunFinalizeRequest,
  RunRepairContext,
  TemplatePriorSummary,
  WaitMutationAckQuery,
  WaitMutationAckResponse,
  WorkerAppendEventRequest,
  WorkerAppendEventResponse,
  WorkerFinalizeResponse,
  WorkerHeartbeatRequest,
  WorkerHeartbeatResponse,
} from "@tooldi/agent-contracts";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import {
  createHeuristicTemplatePlanner,
  normalizeTemplateAssetPolicy,
  type TemplateIntentDraft,
  type TemplatePlanner,
} from "@tooldi/agent-llm";
import type {
  ObjectStoreClient,
  PutObjectRequest,
  PutObjectResult,
} from "@tooldi/agent-persistence";
import { createObjectStoreClient } from "@tooldi/agent-persistence";
import { createTestRun } from "@tooldi/agent-testkit";
import type { V6NodeOverrides } from "../graph/v6PipelineNode.js";
import type { V6ExtractionResult } from "../phases/v6Types.js";
import type { V6HtmlGenResult } from "../phases/v6HtmlGen.js";
import type {
  AssetStorageClient,
  ImagePrimitiveClient,
  StoredAssetRecord,
  TextLayoutEstimate,
  TextLayoutHelper,
  TooldiCatalogSourceClient,
} from "@tooldi/tool-adapters";

import type { BackendCallbackClient } from "../clients/backendCallbackClient.js";
import { prepareExecutionNode } from "../graph/executionNodes.js";
import type {
  AdaptiveCompositionDecisionBuilderInput,
} from "../graph/runJobGraphTypes.js";
import type { RunJobGraphStateType } from "../graph/runJobGraphState.js";
import { createWorkerLogger } from "../lib/logger.js";
import { finalizeAdaptiveCompositionDecision } from "../phases/buildAdaptiveCompositionDecision.js";
import { processRunJob } from "./processRunJob.js";
import { createWorkerToolRegistry } from "../tools/registry.js";
import { createAssetStorageClient } from "../tools/adapters/assetStorageAdapter.js";
import { createImagePrimitiveClient } from "../tools/adapters/imagePrimitiveAdapter.js";
import { createTemplateCatalogClient } from "../tools/adapters/templateCatalogAdapter.js";
import { createTextLayoutHelper } from "../tools/adapters/textLayoutHelperAdapter.js";
import {
  createFashionRetailPlannerDraft,
  fashionRetailGraphicFirstAssetPolicy,
  legacyGraphicOptionalAssetPolicy,
  tooldiCreateTemplateTaxonomyFixture,
} from "../testFixtures/tooldiTaxonomyFixtures.js";

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
    googleApiKey: "test-google-api-key",
    htmlGenProvider: "gemini",
    claudeCodeModel: "sonnet",
    claudeCodeEffort: "low",
    claudeCodeTimeoutMs: 180000,
    trendResearchMode: "off",
    trendResearchModel: "gemini-3-flash-preview",
    trendCacheTtlSeconds: 604800,
    v6AssetRagMode: "off",
    v6AssetEmbeddingEndpoint: "http://127.0.0.1:7070/embed/text",
    v6AssetQdrantUrl: "http://127.0.0.1:6333",
    v6AssetPhotoCollection: "tooldi_photos_v1",
    v6AssetGraphicCollection: "tooldi_graphics_v1",
    v6AssetPublicBaseUrl: "https://dev-file.tooldi.com",
    v6AssetTopK: 40,
    v6AssetRerankCandidateCount: 6,
    v6AssetTimeoutMs: 8000,
    v6AssetVisionRerankMode: "off",
    v6AssetVisionModel: "gemini-3.1-flash-lite-preview",
    exitAfterBoot: false,
  };
}

function createRealSourceEnv(): AgentWorkerEnv {
  return {
    ...createEnv(),
    tooldiCatalogSourceMode: "tooldi_api_direct",
    tooldiContentApiBaseUrl: "http://localhost:8080",
  };
}

function visualWeightRank(weight: string | null) {
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

function pickBestTextObject(
  textObjects: AdaptiveCompositionDecisionBuilderInput["projectedGraph"]["objects"],
  usedObjectIds: Set<string>,
  predicate: (
    object: AdaptiveCompositionDecisionBuilderInput["projectedGraph"]["objects"][number],
  ) => boolean,
) {
  return (
    textObjects.find(
      (object) => !usedObjectIds.has(object.objectId) && predicate(object),
    ) ?? null
  );
}

const LEGACY_CHAIN_SKIP = {
  skip:
    "legacy planning chain (template-prior → adaptive composition → photo/copy/polish stages) is no longer reached under v6 routing. Kept as reference until the legacy modules are purged.",
};

const V6_FIXTURE_HTML = `<div style="position:relative; width:1200px; height:628px; overflow:hidden; background-color:#FFF5E1;"><h1 style="position:absolute; left:80px; top:140px; width:600px; height:110px; font-family:\"701_700\"; font-size:84px; color:#222222;">테스트 헤드라인</h1><p style="position:absolute; left:80px; top:270px; width:600px; height:80px; font-family:\"701_400\"; font-size:36px;">테스트 부제</p></div>`;

// Deterministic v6 node overrides for processRunJob tests. Bypasses Gemini
// (generateHtml stub returns V6_FIXTURE_HTML), bypasses Playwright
// (renderAndExtract stub returns a hand-built extraction), and keeps the real
// deterministic validator + primitive mapper so the pipeline shape is still
// exercised. Produces at least 3 primitives so downstream assertions on
// mutation command count hold.
function createDeterministicV6Overrides(): V6NodeOverrides {
  const stubHtmlGen = async (_args: {
    canvasWidth: number;
    canvasHeight: number;
    userPrompt: string;
    apiKey: string;
  }): Promise<V6HtmlGenResult> => ({
    model: "gemini-3.1-flash-lite-preview-test-stub",
    html: V6_FIXTURE_HTML,
    rawHtml: V6_FIXTURE_HTML,
    latencyMs: 1,
    finishReason: "STOP",
    usage: {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
      thoughtsTokenCount: null,
      cachedContentTokenCount: null,
    },
    finishedAt: new Date().toISOString(),
  });

  const stubRenderAndExtract = async (
    _html: string,
    canvas: { width: number; height: number },
  ): Promise<V6ExtractionResult> => {
    const baseStyle = {
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
    return {
      canvas,
      elements: [
        {
          serial: 0,
          path: "0",
          tagName: "div",
          bounds: { left: 0, top: 0, width: canvas.width, height: canvas.height },
          style: { ...baseStyle, backgroundColor: "rgb(255, 245, 225)" },
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
          style: {
            ...baseStyle,
            fontFamily: "\"701_700\", sans-serif",
            fontSize: "84px",
            fontWeight: "700",
            color: "rgb(34, 34, 34)",
          },
          isTextLeaf: true,
          text: "테스트 헤드라인",
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
          style: {
            ...baseStyle,
            fontFamily: "\"701_400\", sans-serif",
            fontSize: "36px",
          },
          isTextLeaf: true,
          text: "테스트 부제",
          img: null,
          svg: null,
          hasChildren: false,
          visible: true,
        },
      ],
    };
  };

  return {
    deps: {
      generateHtml: stubHtmlGen,
      renderAndExtract: stubRenderAndExtract,
    },
  };
}

function createDeterministicAdaptiveCompositionDecisionBuilder() {
  return async (input: AdaptiveCompositionDecisionBuilderInput) => {
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

    const usedObjectIds = new Set<string>();
    const rawResult: Parameters<typeof finalizeAdaptiveCompositionDecision>[0] = {
      compositionSummary: "deterministic adaptive composition decision for tests",
      elementDecisions: [],
      addDecisions: [],
    };
    const atomsByKind = new Map(
      input.messageAtomPlan.atoms.map((atom) => [atom.kind, atom]),
    );

    const assignAtomToTextObject = (
      atom: AdaptiveCompositionDecisionBuilderInput["messageAtomPlan"]["atoms"][number] | undefined,
      preferredObject:
        | AdaptiveCompositionDecisionBuilderInput["projectedGraph"]["objects"][number]
        | null,
    ) => {
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
      rawResult.elementDecisions.push({
        objectId: selectedObject.objectId,
        operation: "modify",
        newText: atom.text,
        carriesAtomIds: [atom.atomId],
        reason: `deterministic test mapping for ${atom.kind}`,
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
      rawResult.addDecisions.push({
        vocabularyId: "badge_chip",
        text: primaryAtom.text,
        placementZone: "top-right",
        carriesAtomIds: [primaryAtom.atomId],
        reason: "deterministic test fallback for primary atom",
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
      rawResult.addDecisions.push({
        vocabularyId: "cta_button",
        text: ctaAtom.text,
        placementZone: "bottom",
        carriesAtomIds: [ctaAtom.atomId],
        reason: "deterministic test CTA fallback",
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
      rawResult.elementDecisions.push({
        objectId: object.objectId,
        operation: "retain",
        newText: null,
        carriesAtomIds: [],
        reason: "deterministic retain for uncovered text object",
      });
    }

    return finalizeAdaptiveCompositionDecision(rawResult, {
      runId: input.runId,
      traceId: input.traceId,
      projectedGraph: input.projectedGraph,
      messageAtomPlan: input.messageAtomPlan,
    });
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
    const proposedMutation = this.appendedEvents.find(
      (event) =>
        event.event.type === "mutation.proposed" &&
        event.event.mutationId === mutationId,
    );
    const saveCommandResult =
      proposedMutation?.event.type === "mutation.proposed"
        ? proposedMutation.event.mutation.commands
            .filter((command) => command.op === "saveTemplate")
            .map((command) => ({
              commandId: command.commandId,
              op: command.op,
              status: "applied" as const,
              saveEvidence: {
                code: `template_draft_${_runId}`,
                serial: 198008,
                modified: "2026-04-10T02:42:19.000Z",
                version: "2",
              },
              saveReceipt: {
                saveReceiptId: `save_receipt_${_runId}_${currentSeq}_${command.commandId}`,
                outputTemplateCode: `template_draft_${_runId}`,
                savedRevision: currentSeq,
                savedAt: "2026-04-10T02:42:19.000Z",
                reason: command.reason,
              },
            }))
        : [];
    return {
      found: true,
      status: "acked",
      seq: currentSeq,
      resultingRevision: currentSeq,
      ...(saveCommandResult.length > 0
        ? { commandResults: saveCommandResult }
        : {}),
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

class TrackingObjectStoreClient implements ObjectStoreClient {
  readonly putKeys: string[] = [];
  readonly getKeys: string[] = [];
  readonly operations: Array<{
    type: "put" | "get";
    key: string;
  }> = [];
  rewritePutObject?: (request: PutObjectRequest) => PutObjectRequest;

  constructor(private readonly base: ObjectStoreClient) {}

  async putObject(request: PutObjectRequest): Promise<PutObjectResult> {
    this.putKeys.push(request.key);
    this.operations.push({
      type: "put",
      key: request.key,
    });
    return this.base.putObject(
      this.rewritePutObject ? this.rewritePutObject(request) : request,
    );
  }

  async getObject(ref: { bucket: string; key: string }) {
    this.getKeys.push(ref.key);
    this.operations.push({
      type: "get",
      key: ref.key,
    });
    return this.base.getObject(ref);
  }

  async deleteObject(ref: { bucket: string; key: string }) {
    return this.base.deleteObject(ref);
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

async function seedRunInputArtifacts(
  objectStore: ObjectStoreClient,
  testRun: ReturnType<typeof createTestRun>,
): Promise<void> {
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
}

function createPrepareExecutionState(
  overrides: Partial<RunJobGraphStateType> = {},
): RunJobGraphStateType {
  const testRun = createTestRun();

  return {
    job: testRun.job,
    cooperativeStopRequested: false,
    hydrated: {
      job: testRun.job,
      request: testRun.request,
      snapshot: testRun.snapshot,
      requestRef: testRun.requestRef,
      snapshotRef: testRun.snapshotRef,
      repairContext: null,
    },
    intent: {
      intentId: "intent-test",
      runId: testRun.runId,
      traceId: testRun.traceId,
      plannerMode: "heuristic",
      operationFamily: "create_template",
      artifactType: "LiveDraftArtifactBundle",
      goalSummary: "테스트 배너",
      requestedOutputCount: 1,
      templateKind: "promo_banner",
      domain: "general_marketing",
      audience: "general_consumers",
      campaignGoal: "promotion_awareness",
      canvasPreset: "square_1080",
      layoutIntent: "copy_focused",
      tone: "bright_playful",
      subjectBinding: "subjectless",
      offerIntent: "announcement",
      backgroundColorHex: "#ffffff",
      assetPolicy: normalizeTemplateAssetPolicy("graphic_allowed_photo_optional"),
      primaryVisualPolicy: "graphic_preferred",
      searchKeywords: ["테스트"],
      facets: {
        seasonality: "spring",
        menuType: null,
        promotionStyle: "general_campaign",
        offerSpecificity: "broad_offer",
      },
      brandConstraints: {
        palette: [],
        typographyHint: null,
        forbiddenStyles: [],
      },
      consistencyFlags: [],
      normalizationNotes: [],
      supportedInV1: true,
      futureCapableOperations: ["create_template"],
    },
    plan: {
      planId: "plan-test",
      planVersion: 1,
      planSchemaVersion: "v1",
      runId: testRun.runId,
      traceId: testRun.traceId,
      attemptSeq: 1,
      intent: {
        operationFamily: "create_template",
        artifactType: "LiveDraftArtifactBundle",
      },
      constraintsRef: "constraints-test",
      actions: [
        {
          actionId: "action-1",
          kind: "canvas_mutation",
          operation: "prepare_background_and_foundation",
          toolName: "background-catalog",
          toolVersion: "1",
          commitGroup: "group-test",
          liveCommit: true,
          idempotencyKey: "idempotency-test",
          dependsOn: [],
          targetRef: {
            documentId: testRun.request.editorContext.documentId,
            pageId: testRun.request.editorContext.pageId,
            layerId: null,
          },
          inputs: {
            executionMode: "object_native_freeform",
          },
          rollback: {
            strategy: "delete_created_layers",
          },
        },
      ],
    },
    freeformLayoutPlan: {
      planId: "freeform-test",
      runId: testRun.runId,
      traceId: testRun.traceId,
      workflowVariant: "object_native_v1",
      selectedTemplateCode: "template-test",
      selectedTemplateTitle: "template test",
      compositionStatus: "stable",
      copyBlocks: [],
      polishBlocks: [],
      summary: "object-native freeform plan",
    },
    adaptiveSkeletonBatch: null,
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
    emittedMutationIds: [],
    assignedSeqs: [],
    stageAckHistory: [],
    refineAttempt: 0,
    ...overrides,
  } as unknown as RunJobGraphStateType;
}

function findObjectStoreOperationIndex(
  objectStore: TrackingObjectStoreClient,
  operationType: "put" | "get",
  key: string,
): number {
  return objectStore.operations.findIndex(
    (operation) => operation.type === operationType && operation.key === key,
  );
}

function assertPersistedAttemptArtifactSequence(
  objectStore: TrackingObjectStoreClient,
  runId: string,
  attemptSeq: number,
  expectedFileNames: string[],
): Record<string, string> {
  const prefix = `runs/${runId}/attempts/${attemptSeq}/`;
  const persistedAttemptKeys = objectStore.putKeys.filter((key) =>
    key.startsWith(prefix),
  );
  const refsByFileName: Record<string, string> = {};

  for (const fileName of expectedFileNames) {
    const expectedKey = `${prefix}${fileName}`;
    assert.equal(
      persistedAttemptKeys.includes(expectedKey),
      true,
      `${fileName} artifact should be persisted for attempt ${attemptSeq}`,
    );
    refsByFileName[fileName] = expectedKey;
  }

  return refsByFileName;
}

function assertTemplatePriorSummaryPayloadShape(
  summary: TemplatePriorSummary,
): void {
  assert.equal(typeof summary.summaryId, "string");
  assert.equal(typeof summary.runId, "string");
  assert.equal(typeof summary.traceId, "string");
  assert.equal(Array.isArray(summary.templatePriorCandidates), true);
  assert.equal(Array.isArray(summary.contentsThemePriorMatches), true);
  assert.equal(Array.isArray(summary.keywordThemeMatches), true);
  assert.equal(Array.isArray(summary.rankingBiases), true);
  assert.equal(Array.isArray(summary.rankingRationaleEntries), true);
  assert.ok(summary.familyCoverage);
  assert.equal(typeof summary.summary, "string");
  assert.equal(typeof summary.selectedTemplatePrior.querySurface, "string");
  assert.equal(summary.templatePriorCandidates.length > 0, true);
  assert.equal(summary.rankingRationaleEntries.length > 0, true);
  assert.equal(summary.selectedContentsThemePrior.template.family, "template");
  assert.equal(summary.selectedContentsThemePrior.shape.family, "shape");
  assert.equal(summary.selectedContentsThemePrior.picture.family, "picture");
  assert.equal(summary.templatePriorCandidates.every((candidate) => candidate.evidenceRefs.length > 0), true);
  assert.equal(summary.templatePriorCandidates.every((candidate) => candidate.contextRefs.length > 0), true);
  assert.equal(
    summary.rankingRationaleEntries.every(
      (entry) => entry.evidenceRefs.length > 0 && entry.contextRefs.length > 0,
    ),
    true,
  );
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

  async searchTemplateAssets() {
    return {
      sourceFamily: "template_source" as const,
      page: 1,
      hasNextPage: false,
      traceId: "trace-template",
      assets: [
        {
          assetId: "template:70079",
          sourceFamily: "template_source" as const,
          contentType: "template" as const,
          serial: "70079",
          uid: "74091534190",
          title: "봄 세일 배너",
          keywordTokens: ["봄", "세일", "배너"],
          width: 1200,
          height: 628,
          thumbnailUrl: "https://thumb.test/template-70079.png",
          originUrl: "https://thumb.test/template-70079.png",
          priceType: "paid" as const,
          isAi: false,
          creatorSerial: "128344",
          insertMode: "page_background" as const,
          code: "74091534190",
          pages: 1,
          categoryName: "소셜미디어 광고",
          price: 8000,
          totalObjectPrice: 0,
          isPurchased: false,
          thumbnails: ["https://thumb.test/template-70079.png"],
          sourcePayload: {},
        },
      ],
    };
  }

  async getTemplateDocument() {
    return {
      code: "74091534190",
      metaData: {
        code: "74091534190",
        innerCode: "717378421323",
        title: "봄 세일 배너",
        width: "1200",
        height: "628",
        sizeUnit: "px",
        isShare: true,
        userId: "128344",
        createdAt: "2026-03-03",
        modifiedAt: "2026-03-03",
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
              { type: "text", left: 80, top: 110, width: 420, scaleX: 1 },
              { type: "text", left: 80, top: 220, width: 320, scaleX: 1 },
              { type: "illust", left: 760, top: 80, width: 280, scaleX: 1 },
            ],
          },
        },
      ],
    };
  }
}

test("processRunJob persists the raw planner draft before normalized intent", LEGACY_CHAIN_SKIP, async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = new TrackingObjectStoreClient(
    createObjectStoreClient({
      bucket: env.objectStoreBucket,
    }),
  );
  const callbackClient = new RecordingBackendCallbackClient();
  const testRun = createTestRun({
    userInput: {
      prompt: "패션 리테일 봄 세일 배너 만들어줘",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
  });
  let plannerCallCount = 0;
  const plannerDraft: TemplateIntentDraft = {
    goalSummary: "패션 리테일 봄 세일 배너",
    templateKind: "seasonal_sale_banner",
    domain: "fashion_retail",
    audience: "sale_shoppers",
    campaignGoal: "sale_conversion",
    layoutIntent: "badge_led",
    tone: "bright_playful",
    assetPolicy: "graphic_allowed_photo_optional",
    searchKeywords: ["봄", "세일", "패션"],
    typographyHint: "굵은 고딕",
    facets: {
      seasonality: "spring",
      menuType: null,
      promotionStyle: "sale_campaign",
      offerSpecificity: "broad_offer",
    },
  };
  const templatePlanner: TemplatePlanner = {
    mode: "langchain",
    async plan() {
      plannerCallCount += 1;
      return plannerDraft;
    },
  };

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
    v6Overrides: createDeterministicV6Overrides(),
    adaptiveCompositionDecisionBuilder:
      createDeterministicAdaptiveCompositionDecisionBuilder(),
    tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
    templatePlanner,
  });

  const semanticBriefDraftRef =
    `runs/${testRun.runId}/attempts/1/semantic-brief-draft.json`;
  const persistedDraft = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: semanticBriefDraftRef,
        })
      ).body,
    ),
  ) as TemplateIntentDraft;
  const persistedIntent = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: result.artifactRefs.canonicalDesignBriefRef,
        })
      ).body,
    ),
  ) as {
    plannerMode: string;
    goalSummary: string;
    layoutIntent: string;
  };
  const briefCompilationReportRef =
    `runs/${testRun.runId}/attempts/1/brief-compilation-report.json`;
  const persistedNormalizationReport = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: briefCompilationReportRef,
        })
      ).body,
    ),
  ) as {
    draftAvailable: boolean;
    repairCount: number;
    consistencyFlags: Array<{
      code: string;
      severity: string;
      message: string;
      fields: string[];
    }>;
    normalizationNotes: string[];
  };

  assert.deepEqual(persistedDraft, plannerDraft);
  assert.equal(plannerCallCount, 1);
  assert.equal(persistedIntent.plannerMode, "langchain");
  assert.equal(persistedIntent.goalSummary, plannerDraft.goalSummary);
  assert.equal(persistedIntent.layoutIntent, plannerDraft.layoutIntent);
  assert.equal(result.artifactRefs.semanticBriefDraftRef, semanticBriefDraftRef);
  assert.equal(
    result.artifactRefs.briefCompilationReportRef,
    briefCompilationReportRef,
  );
  assert.ok(result.intentNormalizationReport);
  assert.equal(persistedNormalizationReport.draftAvailable, true);
  assert.equal(
    persistedNormalizationReport.repairCount,
    result.intentNormalizationReport.repairCount,
  );
  assert.deepEqual(
    persistedNormalizationReport.consistencyFlags,
    result.intent.consistencyFlags,
  );
  assert.deepEqual(
    persistedNormalizationReport.normalizationNotes,
    result.intent.normalizationNotes,
  );
  assert.ok(
    objectStore.putKeys.indexOf(semanticBriefDraftRef) <
      objectStore.putKeys.indexOf(result.artifactRefs.canonicalDesignBriefRef),
  );
  assert.ok(
    objectStore.putKeys.indexOf(briefCompilationReportRef) <
      objectStore.putKeys.indexOf(result.artifactRefs.canonicalDesignBriefRef),
  );
});

test("processRunJob normalizes from the persisted planner draft artifact", LEGACY_CHAIN_SKIP, async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = new TrackingObjectStoreClient(
    createObjectStoreClient({
      bucket: env.objectStoreBucket,
    }),
  );
  const callbackClient = new RecordingBackendCallbackClient();
  const testRun = createTestRun({
    userInput: {
      prompt: "패션 리테일 봄 세일 배너 만들어줘",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
  });
  const plannerDraft: TemplateIntentDraft = {
    goalSummary: "planner original goal",
    templateKind: "seasonal_sale_banner",
    domain: "fashion_retail",
    audience: "sale_shoppers",
    campaignGoal: "sale_conversion",
    layoutIntent: "badge_led",
    tone: "bright_playful",
    assetPolicy: "graphic_allowed_photo_optional",
    searchKeywords: ["봄", "세일", "패션"],
    typographyHint: "굵은 고딕",
    facets: {
      seasonality: "spring",
      menuType: null,
      promotionStyle: "sale_campaign",
      offerSpecificity: "broad_offer",
    },
  };
  const rewrittenGoalSummary = "persisted draft goal";
  objectStore.rewritePutObject = (request) => {
    if (!request.key.endsWith("/semantic-brief-draft.json")) {
      return request;
    }

    const serializedBody =
      typeof request.body === "string"
        ? request.body
        : new TextDecoder().decode(request.body);
    const persistedDraft = JSON.parse(serializedBody) as TemplateIntentDraft;

    return {
      ...request,
      body: JSON.stringify({
        ...persistedDraft,
        goalSummary: rewrittenGoalSummary,
      } satisfies TemplateIntentDraft),
    };
  };

  const templatePlanner: TemplatePlanner = {
    mode: "langchain",
    async plan() {
      return plannerDraft;
    },
  };

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
    v6Overrides: createDeterministicV6Overrides(),
    adaptiveCompositionDecisionBuilder:
      createDeterministicAdaptiveCompositionDecisionBuilder(),
    tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
    templatePlanner,
  });

  const persistedDraftRef =
    `runs/${testRun.runId}/attempts/1/semantic-brief-draft.json`;
  const persistedDraft = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: persistedDraftRef,
        })
      ).body,
    ),
  ) as TemplateIntentDraft;
  const persistedIntent = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: result.artifactRefs.canonicalDesignBriefRef,
        })
      ).body,
    ),
  ) as {
    goalSummary: string;
  };

  assert.equal(plannerDraft.goalSummary, "planner original goal");
  assert.equal(persistedDraft.goalSummary, rewrittenGoalSummary);
  assert.equal(persistedIntent.goalSummary, rewrittenGoalSummary);
  assert.equal(
    result.semanticBriefDraft?.draft.goalSummary,
    rewrittenGoalSummary,
  );
});

test("processRunJob uses the persisted normalized intent artifact as downstream truth", LEGACY_CHAIN_SKIP, async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = new TrackingObjectStoreClient(
    createObjectStoreClient({
      bucket: env.objectStoreBucket,
    }),
  );
  const callbackClient = new RecordingBackendCallbackClient();
  const testRun = createTestRun({
    userInput: {
      prompt: "카페 봄 음료 배너 만들어줘",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
  });
  const canonicalTypographyHint = "캐노니컬 고딕 강조";
  const templatePlanner: TemplatePlanner = {
    mode: "langchain",
    async plan() {
      return {
        goalSummary: "카페 봄 음료 배너",
        templateKind: "promo_banner",
        domain: "cafe",
        audience: "local_visitors",
        campaignGoal: "product_trial",
        layoutIntent: "hero_focused",
        tone: "bright_playful",
        assetPolicy: "photo_preferred_graphic_allowed",
        searchKeywords: ["봄", "카페", "음료"],
        typographyHint: null,
        facets: {
          seasonality: "spring",
          menuType: "drink_menu",
          promotionStyle: "new_product_promo",
          offerSpecificity: "single_product",
        },
      } satisfies TemplateIntentDraft;
    },
  };

  objectStore.rewritePutObject = (request) => {
    if (!request.key.endsWith("/canonical-design-brief.json")) {
      return request;
    }

    const serializedBody =
      typeof request.body === "string"
        ? request.body
        : new TextDecoder().decode(request.body);
    const persistedIntent = JSON.parse(serializedBody) as {
      searchKeywords: string[];
      brandConstraints: {
        palette: string[];
        typographyHint: string | null;
        forbiddenStyles: string[];
      };
    };

    return {
      ...request,
      body: JSON.stringify({
        ...persistedIntent,
        searchKeywords: ["봄", "콜드브루", "런칭", "카페"],
        brandConstraints: {
          ...persistedIntent.brandConstraints,
          typographyHint: canonicalTypographyHint,
        },
      }),
    };
  };

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
    v6Overrides: createDeterministicV6Overrides(),
    adaptiveCompositionDecisionBuilder:
      createDeterministicAdaptiveCompositionDecisionBuilder(),
    tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
    templatePlanner,
  });

  const persistedIntent = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: result.artifactRefs.canonicalDesignBriefRef,
        })
      ).body,
    ),
  ) as {
    searchKeywords: string[];
    brandConstraints: {
      typographyHint: string | null;
    };
  };
  const persistedSearchProfile = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: result.artifactRefs.searchProfileRef!,
        })
      ).body,
    ),
  ) as {
    graphic: {
      queries: Array<{ keyword: string | null }>;
    };
    photo: {
      queries: Array<{
        keyword: string | null;
        theme: string | null;
        type: string | null;
        format: string | null;
      }>;
    };
    font: {
      rationale: string;
      sourceSurface: string;
      typographyHint: string | null;
      language: {
        value: string;
      };
      category: {
        attempts: string[];
      };
      weight: {
        displayTarget: number;
        bodyTarget: number | null;
      };
    };
  };

  assert.equal(
    persistedIntent.brandConstraints.typographyHint,
    canonicalTypographyHint,
  );
  assert.deepEqual(persistedIntent.searchKeywords, ["봄", "콜드브루", "런칭", "카페"]);
  assert.equal(
    result.intent.brandConstraints.typographyHint,
    canonicalTypographyHint,
  );
  assert.equal(result.searchProfile?.font.typographyHint, canonicalTypographyHint);
  assert.equal(result.searchProfile?.font.sourceSurface, "Editor::loadFont");
  assert.equal(result.searchProfile?.font.language.value, "KOR");
  assert.deepEqual(result.searchProfile?.font.category.attempts, [
    "고딕",
    "명조",
    "손글씨",
  ]);
  assert.equal(result.searchProfile?.font.weight.displayTarget, 700);
  assert.equal(result.searchProfile?.font.weight.bodyTarget, 400);
  assert.equal(result.searchProfile?.graphic.queries[0]?.keyword, "콜드브루");
  assert.equal(result.searchProfile?.photo.queries[0]?.keyword, "콜드브루");
  assert.equal(result.searchProfile?.photo.queries[0]?.theme, null);
  assert.equal(result.searchProfile?.photo.queries[0]?.format, "square");
  assert.equal(
    persistedSearchProfile.font.typographyHint,
    canonicalTypographyHint,
  );
  assert.match(persistedSearchProfile.font.rationale, /Editor::loadFont inventory/);
  assert.equal(persistedSearchProfile.font.sourceSurface, "Editor::loadFont");
  assert.equal(persistedSearchProfile.font.language.value, "KOR");
  assert.deepEqual(persistedSearchProfile.font.category.attempts, [
    "고딕",
    "명조",
    "손글씨",
  ]);
  assert.equal(persistedSearchProfile.font.weight.displayTarget, 700);
  assert.equal(persistedSearchProfile.font.weight.bodyTarget, 400);
  assert.equal(persistedSearchProfile.graphic.queries[0]?.keyword, "콜드브루");
  assert.equal(persistedSearchProfile.photo.queries[0]?.keyword, "콜드브루");
  assert.equal(persistedSearchProfile.photo.queries[0]?.theme, null);
  assert.equal(persistedSearchProfile.photo.queries[0]?.format, "square");
  assert.ok(objectStore.getKeys.includes(result.artifactRefs.canonicalDesignBriefRef));
});

test("processRunJob는 잘못된 플래너 초안이면 휴리스틱 초안을 저장하고 계속 진행한다", LEGACY_CHAIN_SKIP, async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  const testRun = createTestRun({
    userInput: {
      prompt: "카페 봄 음료 배너 만들어줘",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
  });
  const templatePlanner: TemplatePlanner = {
    mode: "langchain",
    async plan() {
      return {
        goalSummary: "불완전 초안",
      } as TemplateIntentDraft;
    },
  };

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
    v6Overrides: createDeterministicV6Overrides(),
    templatePlanner,
  });
  const expectedFallbackDraft = await createHeuristicTemplatePlanner().plan({
    prompt: testRun.request.userInput.prompt,
    canvasPreset: "square_1080",
    palette: testRun.snapshot.brandContext.palette,
  });
  const semanticBriefDraftRef =
    `runs/${testRun.runId}/attempts/1/semantic-brief-draft.json`;
  const persistedDraft = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: semanticBriefDraftRef,
        })
      ).body,
    ),
  ) as TemplateIntentDraft;

  assert.deepEqual(persistedDraft, expectedFallbackDraft);
  assert.equal(result.intent.plannerMode, "heuristic");
  assert.equal(result.semanticBriefDraft?.plannerMode, "heuristic");
  assert.equal(result.artifactRefs.semanticBriefDraftRef, semanticBriefDraftRef);
  assert.ok(result.intentNormalizationReport);
  assert.equal(result.intentNormalizationReport.draftAvailable, true);
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.level === "warn" &&
        event.event.message.includes("fell back to heuristic mode"),
    ),
    true,
  );
});

test("processRunJob keeps structured and legacy asset-policy inputs compatible through the current create-template flow", LEGACY_CHAIN_SKIP, async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const scenarios = [
    {
      name: "structured",
      plannerDraft: createFashionRetailPlannerDraft(),
      expectedDraftPolicy: fashionRetailGraphicFirstAssetPolicy,
      expectedCanonicalPolicy: fashionRetailGraphicFirstAssetPolicy,
    },
    {
      name: "legacy",
      plannerDraft: createFashionRetailPlannerDraft({
        assetPolicy: legacyGraphicOptionalAssetPolicy,
      }),
      expectedDraftPolicy: legacyGraphicOptionalAssetPolicy,
      expectedCanonicalPolicy: normalizeTemplateAssetPolicy(
        legacyGraphicOptionalAssetPolicy,
      ),
    },
  ] as const;

  for (const scenario of scenarios) {
    const bucket = `${env.objectStoreBucket}-${scenario.name}`;
    const objectStore = createObjectStoreClient({
      bucket,
    });
    const callbackClient = new RecordingBackendCallbackClient();
    const testRun = createTestRun({
      userInput: {
        prompt: tooldiCreateTemplateTaxonomyFixture.prompt,
        locale: "ko-KR",
        timezone: "Asia/Seoul",
      },
    });
    const templatePlanner: TemplatePlanner = {
      mode: "langchain",
      async plan() {
        return scenario.plannerDraft;
      },
    };

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
    v6Overrides: createDeterministicV6Overrides(),
      adaptiveCompositionDecisionBuilder:
        createDeterministicAdaptiveCompositionDecisionBuilder(),
      tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
      templatePlanner,
    });

    const persistedDraft = JSON.parse(
      new TextDecoder().decode(
        (
          await objectStore.getObject({
            bucket,
            key: result.artifactRefs.semanticBriefDraftRef!,
          })
        ).body,
      ),
    ) as {
      assetPolicy: unknown;
    };
    const persistedIntent = JSON.parse(
      new TextDecoder().decode(
        (
          await objectStore.getObject({
            bucket,
            key: result.artifactRefs.canonicalDesignBriefRef,
          })
        ).body,
      ),
    ) as {
      assetPolicy: unknown;
    };
    const persistedSearchProfile = JSON.parse(
      new TextDecoder().decode(
        (
          await objectStore.getObject({
            bucket,
            key: result.artifactRefs.searchProfileRef!,
          })
        ).body,
      ),
    ) as {
      assetPolicy: unknown;
      background: {
        sourceMode: string;
        colorHex: string;
        queries: Array<{ type: string }>;
      };
      graphic: {
        queries: Array<{
          type: string | null;
          theme: string | null;
          method: string | null;
        }>;
      };
      photo: {
        enabled: boolean;
        queries: Array<{
          keyword: string | null;
          theme: string | null;
          type: string | null;
          format: string | null;
        }>;
      };
    };

    assert.deepEqual(persistedDraft.assetPolicy, scenario.expectedDraftPolicy);
    assert.deepEqual(result.intent.assetPolicy, scenario.expectedCanonicalPolicy);
    assert.deepEqual(persistedIntent.assetPolicy, scenario.expectedCanonicalPolicy);
    assert.deepEqual(
      result.searchProfile?.assetPolicy,
      scenario.expectedCanonicalPolicy,
    );
    assert.deepEqual(
      persistedSearchProfile.assetPolicy,
      scenario.expectedCanonicalPolicy,
    );
    assert.equal(persistedSearchProfile.background.sourceMode, "generated_solid");
    assert.equal(typeof persistedSearchProfile.background.colorHex, "string");
    assert.equal(persistedSearchProfile.background.queries.length, 0);
    assert.equal(
      persistedSearchProfile.graphic.queries[0]?.type,
      tooldiCreateTemplateTaxonomyFixture.graphicType,
    );
    assert.equal(
      persistedSearchProfile.graphic.queries[0]?.theme,
      tooldiCreateTemplateTaxonomyFixture.graphicTheme,
    );
    assert.equal(
      persistedSearchProfile.graphic.queries[0]?.method,
      tooldiCreateTemplateTaxonomyFixture.graphicMethod,
    );
    assert.equal(persistedSearchProfile.photo.enabled, true);
    assert.equal(
      persistedSearchProfile.photo.queries[0]?.keyword,
      tooldiCreateTemplateTaxonomyFixture.optionalPhotoKeyword,
    );
    assert.equal(
      persistedSearchProfile.photo.queries[0]?.theme,
      tooldiCreateTemplateTaxonomyFixture.optionalPhotoTheme,
    );
    assert.equal(
      persistedSearchProfile.photo.queries[0]?.type,
      tooldiCreateTemplateTaxonomyFixture.optionalPhotoType,
    );
    assert.equal(
      persistedSearchProfile.photo.queries[0]?.format,
      "square",
    );
    assert.equal(
      result.ruleJudgeVerdict?.issues.some(
        (issue) => issue.code === "photo_preference_unmet",
      ),
      false,
    );
  }
});

test("processRunJob emits template-prior-summary for the Tooldi taxonomy fixture with deterministic ranking rationale", LEGACY_CHAIN_SKIP, async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = new TrackingObjectStoreClient(
    createObjectStoreClient({
      bucket: env.objectStoreBucket,
    }),
  );
  const callbackClient = new RecordingBackendCallbackClient();
  const testRun = createTestRun({
    userInput: {
      prompt: tooldiCreateTemplateTaxonomyFixture.prompt,
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
    editorContext: {
      documentId: "document-1",
      pageId: "page-1",
      canvasState: "empty",
      canvasWidth: 1200,
      canvasHeight: 628,
      sizeSerial: "1200x628@1",
      workingTemplateCode: null,
      canvasSnapshotRef: null,
      selectedLayerIds: [],
    },
    brandContext: {
      brandName: null,
      palette: ["#ffe4e8"],
      logoAssetId: null,
    },
  });
  const templatePlanner: TemplatePlanner = {
    mode: "langchain",
    async plan() {
      return createFashionRetailPlannerDraft();
    },
  };

  await seedRunInputArtifacts(objectStore, testRun);

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
    v6Overrides: createDeterministicV6Overrides(),
      adaptiveCompositionDecisionBuilder:
        createDeterministicAdaptiveCompositionDecisionBuilder(),
      tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
      templatePlanner,
    });
  const templatePriorSummaryRef =
    `runs/${testRun.runId}/attempts/1/template-prior-summary.json`;
  const persistedTemplatePriorSummary = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: templatePriorSummaryRef,
        })
      ).body,
    ),
  ) as TemplatePriorSummary;

  assert.equal(result.artifactRefs.templatePriorSummaryRef, templatePriorSummaryRef);
  assert.equal(
    callbackClient.finalizations[0]?.templatePriorSummaryRef,
    templatePriorSummaryRef,
  );
  assert.ok(objectStore.putKeys.includes(templatePriorSummaryRef));
  assertTemplatePriorSummaryPayloadShape(persistedTemplatePriorSummary);
  assert.equal(persistedTemplatePriorSummary.selectedTemplatePrior.status, "competitive_only");
  assert.equal(persistedTemplatePriorSummary.selectedTemplatePrior.keyword, "봄");
  assert.equal(
    persistedTemplatePriorSummary.selectedTemplatePrior.categorySerial,
    "0006",
  );
  assert.deepEqual(
    persistedTemplatePriorSummary.templatePriorCandidates.map((candidate) => ({
      rank: candidate.rank,
      sourceSignal: candidate.sourceSignal,
      keyword: candidate.keyword,
      selected: candidate.selected,
    })),
    [
      {
        rank: 1,
        sourceSignal: "seasonality:spring",
        keyword: "봄",
        selected: true,
      },
      {
        rank: 2,
        sourceSignal: "promotion_style:sale_campaign",
        keyword: "세일",
        selected: false,
      },
      {
        rank: 3,
        sourceSignal: "domain:fashion_retail",
        keyword: "패션",
        selected: false,
      },
    ],
  );
});

test(
  "processRunJob persists the Tooldi taxonomy artifact chain with planner draft provenance before downstream refs",
  LEGACY_CHAIN_SKIP,
  async () => {
    const env = createEnv();
    const logger = createWorkerLogger(env);
    const objectStore = new TrackingObjectStoreClient(
      createObjectStoreClient({
        bucket: env.objectStoreBucket,
      }),
    );
    const callbackClient = new RecordingBackendCallbackClient();
    const testRun = createTestRun({
      userInput: {
        prompt: tooldiCreateTemplateTaxonomyFixture.prompt,
        locale: "ko-KR",
        timezone: "Asia/Seoul",
      },
      editorContext: {
        documentId: "document-1",
        pageId: "page-1",
        canvasState: "empty",
        canvasWidth: 1200,
        canvasHeight: 628,
        sizeSerial: "1200x628@1",
        workingTemplateCode: null,
        canvasSnapshotRef: null,
        selectedLayerIds: [],
      },
      brandContext: {
        brandName: null,
        palette: ["#ffe4e8"],
        logoAssetId: null,
      },
    });
    const templatePlanner: TemplatePlanner = {
      mode: "langchain",
      async plan() {
        return createFashionRetailPlannerDraft();
      },
    };

    await seedRunInputArtifacts(objectStore, testRun);

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
    v6Overrides: createDeterministicV6Overrides(),
      adaptiveCompositionDecisionBuilder:
        createDeterministicAdaptiveCompositionDecisionBuilder(),
      tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
      templatePlanner,
    });

    const artifactRefsByFileName = assertPersistedAttemptArtifactSequence(
      objectStore,
      testRun.runId,
      testRun.job.attemptSeq,
      [
        "semantic-brief-draft.json",
        "brief-compilation-report.json",
        "canonical-design-brief.json",
        "copy-plan.json",
        "copy-plan-normalization-report.json",
        "layout-plan-abstract.json",
        "layout-plan-normalization-report.json",
        "template-prior-summary.json",
        "template-prior-bundle.json",
        "scene-role-plan.json",
        "scene-layout-plan.json",
        "scene-style-plan.json",
        "scene-binding-plan.json",
        "search-profile.json",
        "retrieval-stage.json",
        "template-candidate-set.json",
        "composition-brief.json",
        "composition-variants.json",
        "composition-ranking.json",
        "selection-decision.json",
        "asset-plan.json",
        "layout-plan-concrete.json",
        "typography-decision.json",
        "source-search-summary.json",
        "executable-plan.json",
        "rule-judge-verdict.json",
        "execution-scene-summary.json",
        "judge-plan.json",
        "refine-decision.json",
      ],
    );
    const semanticBriefDraftRef =
      artifactRefsByFileName["semantic-brief-draft.json"]!;
    const briefCompilationReportRef =
      artifactRefsByFileName["brief-compilation-report.json"]!;
    const canonicalDesignBriefRef =
      artifactRefsByFileName["canonical-design-brief.json"]!;
    const copyPlanRef = artifactRefsByFileName["copy-plan.json"]!;
    const copyPlanNormalizationReportRef =
      artifactRefsByFileName["copy-plan-normalization-report.json"]!;
    const abstractLayoutPlanRef =
      artifactRefsByFileName["layout-plan-abstract.json"]!;
    const abstractLayoutPlanNormalizationReportRef =
      artifactRefsByFileName["layout-plan-normalization-report.json"]!;
    const templatePriorSummaryRef =
      artifactRefsByFileName["template-prior-summary.json"]!;
    const templatePriorBundleRef =
      artifactRefsByFileName["template-prior-bundle.json"]!;
    const sceneRolePlanRef =
      artifactRefsByFileName["scene-role-plan.json"]!;
    const sceneLayoutPlanRef =
      artifactRefsByFileName["scene-layout-plan.json"]!;
    const sceneStylePlanRef =
      artifactRefsByFileName["scene-style-plan.json"]!;
    const sceneBindingPlanRef =
      artifactRefsByFileName["scene-binding-plan.json"]!;
    const searchProfileRef = artifactRefsByFileName["search-profile.json"]!;
    const retrievalStageRef = artifactRefsByFileName["retrieval-stage.json"]!;
    const candidateSetRef =
      artifactRefsByFileName["template-candidate-set.json"]!;
    const compositionBriefRef =
      artifactRefsByFileName["composition-brief.json"]!;
    const compositionVariantSetRef =
      artifactRefsByFileName["composition-variants.json"]!;
    const compositionRankingRef =
      artifactRefsByFileName["composition-ranking.json"]!;
    const selectionDecisionRef =
      artifactRefsByFileName["selection-decision.json"]!;
    const assetPlanRef = artifactRefsByFileName["asset-plan.json"]!;
    const concreteLayoutPlanRef =
      artifactRefsByFileName["layout-plan-concrete.json"]!;
    const typographyDecisionRef =
      artifactRefsByFileName["typography-decision.json"]!;
    const sourceSearchSummaryRef =
      artifactRefsByFileName["source-search-summary.json"]!;
    const ruleJudgeVerdictRef =
      artifactRefsByFileName["rule-judge-verdict.json"]!;
    const executablePlanRef =
      artifactRefsByFileName["executable-plan.json"]!;
    const executionSceneSummaryRef =
      artifactRefsByFileName["execution-scene-summary.json"]!;
    const judgePlanRef = artifactRefsByFileName["judge-plan.json"]!;
    const refineDecisionRef =
      artifactRefsByFileName["refine-decision.json"]!;

    assert.deepEqual(result.artifactRefs, {
      canonicalDesignBriefRef,
      semanticBriefDraftRef,
      briefCompilationReportRef,
      copyPlanRef,
      copyPlanNormalizationReportRef,
      abstractLayoutPlanRef,
      abstractLayoutPlanNormalizationReportRef,
      assetPlanRef,
      concreteLayoutPlanRef,
      templatePriorSummaryRef,
      templatePriorBundleRef,
      sceneRolePlanRef,
      sceneLayoutPlanRef,
      sceneStylePlanRef,
      sceneBindingPlanRef,
      searchProfileRef,
      executablePlanRef,
      candidateSetRef,
      compositionBriefRef,
      compositionVariantSetRef,
      compositionRankingRef,
      sourceSearchSummaryRef,
      retrievalStageRef,
      selectionDecisionRef,
      typographyDecisionRef,
      ruleJudgeVerdictRef,
      executionSceneSummaryRef,
      judgePlanRef,
      refineDecisionRef,
    });
    assert.equal(callbackClient.finalizations.length, 1);
    assert.deepEqual(
      {
        semanticBriefDraftRef:
          callbackClient.finalizations[0]?.semanticBriefDraftRef,
        briefCompilationReportRef:
          callbackClient.finalizations[0]?.briefCompilationReportRef,
        canonicalDesignBriefRef: callbackClient.finalizations[0]?.canonicalDesignBriefRef,
        copyPlanRef: callbackClient.finalizations[0]?.copyPlanRef,
        copyPlanNormalizationReportRef:
          callbackClient.finalizations[0]?.copyPlanNormalizationReportRef,
        abstractLayoutPlanRef:
          callbackClient.finalizations[0]?.abstractLayoutPlanRef,
        abstractLayoutPlanNormalizationReportRef:
          callbackClient.finalizations[0]?.abstractLayoutPlanNormalizationReportRef,
        assetPlanRef: callbackClient.finalizations[0]?.assetPlanRef,
        concreteLayoutPlanRef:
          callbackClient.finalizations[0]?.concreteLayoutPlanRef,
        templatePriorSummaryRef: callbackClient.finalizations[0]?.templatePriorSummaryRef,
        templatePriorBundleRef: callbackClient.finalizations[0]?.templatePriorBundleRef,
        sceneRolePlanRef: callbackClient.finalizations[0]?.sceneRolePlanRef,
        sceneLayoutPlanRef: callbackClient.finalizations[0]?.sceneLayoutPlanRef,
        sceneStylePlanRef: callbackClient.finalizations[0]?.sceneStylePlanRef,
        sceneBindingPlanRef: callbackClient.finalizations[0]?.sceneBindingPlanRef,
        searchProfileRef: callbackClient.finalizations[0]?.searchProfileRef,
        executablePlanRef: callbackClient.finalizations[0]?.executablePlanRef,
        candidateSetRef: callbackClient.finalizations[0]?.candidateSetRef,
        sourceSearchSummaryRef: callbackClient.finalizations[0]?.sourceSearchSummaryRef,
        retrievalStageRef: callbackClient.finalizations[0]?.retrievalStageRef,
        selectionDecisionRef: callbackClient.finalizations[0]?.selectionDecisionRef,
        typographyDecisionRef: callbackClient.finalizations[0]?.typographyDecisionRef,
        ruleJudgeVerdictRef: callbackClient.finalizations[0]?.ruleJudgeVerdictRef,
        executionSceneSummaryRef:
          callbackClient.finalizations[0]?.executionSceneSummaryRef,
        judgePlanRef: callbackClient.finalizations[0]?.judgePlanRef,
        refineDecisionRef: callbackClient.finalizations[0]?.refineDecisionRef,
      },
      {
        semanticBriefDraftRef,
        briefCompilationReportRef,
        canonicalDesignBriefRef,
        copyPlanRef,
        copyPlanNormalizationReportRef,
        abstractLayoutPlanRef,
        abstractLayoutPlanNormalizationReportRef,
        assetPlanRef,
        concreteLayoutPlanRef,
        templatePriorSummaryRef,
        templatePriorBundleRef,
        sceneRolePlanRef,
        sceneLayoutPlanRef,
        sceneStylePlanRef,
        sceneBindingPlanRef,
        searchProfileRef,
        executablePlanRef,
        candidateSetRef,
        sourceSearchSummaryRef,
        retrievalStageRef,
        selectionDecisionRef,
        typographyDecisionRef,
        ruleJudgeVerdictRef,
        executionSceneSummaryRef,
        judgePlanRef,
        refineDecisionRef,
      },
    );
    assert.ok(
      findObjectStoreOperationIndex(objectStore, "get", semanticBriefDraftRef) >
        findObjectStoreOperationIndex(objectStore, "put", semanticBriefDraftRef),
    );
    assert.ok(
      findObjectStoreOperationIndex(objectStore, "get", canonicalDesignBriefRef) >
        findObjectStoreOperationIndex(objectStore, "put", canonicalDesignBriefRef),
    );
    assert.ok(result.intentNormalizationReport);
    assert.equal(result.intentNormalizationReport.draftAvailable, true);
    assert.ok(result.copyPlan);
    assert.equal(
      result.copyPlan?.slots.some((slot) => slot.key === "headline"),
      true,
    );
    assert.equal(
      result.copyPlan?.slots.some((slot) => slot.key === "cta"),
      true,
    );
    assert.ok(result.abstractLayoutPlan);
    assert.ok(result.concreteLayoutPlan);
    assert.equal(result.templatePriorSummary?.runId, testRun.runId);
    assert.equal(result.templatePriorSummary?.traceId, testRun.traceId);
    assert.deepEqual(result.searchProfile?.assetPolicy, result.intent.assetPolicy);
  },
);

test(
  "processRunJob writes normalized-intent-draft before deterministic repair in both planner paths",
  LEGACY_CHAIN_SKIP,
  async (t) => {
    await t.test("planner success path remains valid", async () => {
      const env = createEnv();
      const logger = createWorkerLogger(env);
      const objectStore = new TrackingObjectStoreClient(
        createObjectStoreClient({
          bucket: env.objectStoreBucket,
        }),
      );
      const callbackClient = new RecordingBackendCallbackClient();
      const testRun = createTestRun();
      const plannerDraft: TemplateIntentDraft = {
        goalSummary: "패션 리테일 봄 세일 배너",
        templateKind: "seasonal_sale_banner",
        domain: "fashion_retail",
        audience: "sale_shoppers",
        campaignGoal: "sale_conversion",
        layoutIntent: "badge_led",
        tone: "bright_playful",
        assetPolicy: "graphic_allowed_photo_optional",
        searchKeywords: ["봄", "세일", "패션"],
        typographyHint: "굵은 고딕",
        facets: {
          seasonality: "spring",
          menuType: null,
          promotionStyle: "sale_campaign",
          offerSpecificity: "broad_offer",
        },
      };
      const templatePlanner: TemplatePlanner = {
        mode: "langchain",
        async plan() {
          return plannerDraft;
        },
      };

      await seedRunInputArtifacts(objectStore, testRun);

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
    v6Overrides: createDeterministicV6Overrides(),
        templatePlanner,
      });

      const draftRef = `runs/${testRun.runId}/attempts/1/semantic-brief-draft.json`;
      const reportRef =
        `runs/${testRun.runId}/attempts/1/brief-compilation-report.json`;
      const draftPutIndex = findObjectStoreOperationIndex(objectStore, "put", draftRef);
      const draftGetIndex = findObjectStoreOperationIndex(objectStore, "get", draftRef);
      const reportPutIndex = findObjectStoreOperationIndex(
        objectStore,
        "put",
        reportRef,
      );
      const normalizedIntentPutIndex = findObjectStoreOperationIndex(
        objectStore,
        "put",
        result.artifactRefs.canonicalDesignBriefRef,
      );

      assert.ok(draftPutIndex >= 0);
      assert.ok(draftGetIndex > draftPutIndex);
      assert.ok(reportPutIndex > draftGetIndex);
      assert.ok(normalizedIntentPutIndex > draftGetIndex);
      assert.equal(result.intent.plannerMode, "langchain");
      assert.equal(result.semanticBriefDraft?.plannerMode, "langchain");
      assert.ok(result.intentNormalizationReport);
      assert.equal(result.intentNormalizationReport.draftAvailable, true);
      assert.equal(result.artifactRefs.semanticBriefDraftRef, draftRef);
    });

    await t.test("heuristic fallback path remains valid", async () => {
      const env = createEnv();
      const logger = createWorkerLogger(env);
      const objectStore = new TrackingObjectStoreClient(
        createObjectStoreClient({
          bucket: env.objectStoreBucket,
        }),
      );
      const callbackClient = new RecordingBackendCallbackClient();
      const testRun = createTestRun({
        userInput: {
          prompt: "카페 봄 음료 배너 만들어줘",
          locale: "ko-KR",
          timezone: "Asia/Seoul",
        },
      });
      const templatePlanner: TemplatePlanner = {
        mode: "langchain",
        async plan() {
          return {
            goalSummary: "불완전 초안",
          } as TemplateIntentDraft;
        },
      };

      await seedRunInputArtifacts(objectStore, testRun);

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
    v6Overrides: createDeterministicV6Overrides(),
        templatePlanner,
      });

      const expectedFallbackDraft = await createHeuristicTemplatePlanner().plan({
        prompt: testRun.request.userInput.prompt,
        canvasPreset: "square_1080",
        palette: testRun.snapshot.brandContext.palette,
      });
      const draftRef = `runs/${testRun.runId}/attempts/1/semantic-brief-draft.json`;
      const draftPutIndex = findObjectStoreOperationIndex(objectStore, "put", draftRef);
      const draftGetIndex = findObjectStoreOperationIndex(objectStore, "get", draftRef);
      const normalizedIntentPutIndex = findObjectStoreOperationIndex(
        objectStore,
        "put",
        result.artifactRefs.canonicalDesignBriefRef,
      );
      const persistedDraft = JSON.parse(
        new TextDecoder().decode(
          (
            await objectStore.getObject({
              bucket: env.objectStoreBucket,
              key: draftRef,
            })
          ).body,
        ),
      ) as TemplateIntentDraft;

      assert.ok(draftPutIndex >= 0);
      assert.ok(draftGetIndex > draftPutIndex);
      assert.ok(normalizedIntentPutIndex > draftGetIndex);
      assert.deepEqual(persistedDraft, expectedFallbackDraft);
      assert.equal(result.intent.plannerMode, "heuristic");
      assert.equal(result.semanticBriefDraft?.plannerMode, "heuristic");
      assert.ok(result.intentNormalizationReport);
      assert.equal(result.intentNormalizationReport.draftAvailable, true);
      assert.equal(result.artifactRefs.semanticBriefDraftRef, draftRef);
    });
  },
);

test("processRunJob orchestrates phases and backend callbacks in order", LEGACY_CHAIN_SKIP, async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = new TrackingObjectStoreClient(
    createObjectStoreClient({
      bucket: env.objectStoreBucket,
    }),
  );
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
    v6Overrides: createDeterministicV6Overrides(),
    adaptiveCompositionDecisionBuilder:
      createDeterministicAdaptiveCompositionDecisionBuilder(),
    tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
  });
  const plan = result.plan;
  const selectionDecision = result.selectionDecision;
  const candidateSets = result.candidateSets;
  const expectedTemplateCategorySerial =
    result.intent.canvasPreset === "wide_1200x628" ? "0006" : "0002";
  const persistedTemplatePriorSummaryRaw = new TextDecoder().decode(
    (
      await objectStore.getObject({
        bucket: env.objectStoreBucket,
        key: `runs/${testRun.runId}/attempts/1/template-prior-summary.json`,
      })
    ).body,
  );
  const persistedTemplatePriorSummary = JSON.parse(
    persistedTemplatePriorSummaryRaw,
  ) as {
    templatePriorCandidates: Array<{
      rank: number;
      sourceSignal: string;
      keyword: string | null;
      selected: boolean;
    }>;
    dominantThemePrior: string;
    rankingRationaleEntries: Array<{
      signal: string;
      outcome: string;
    }>;
    selectedTemplatePrior: {
      status: string;
      keyword: string | null;
      categorySerial: string | null;
    };
  };

  assert.equal(result.intent.operationFamily, "create_template");
  assert.equal(result.intent.templateKind, "seasonal_sale_banner");
  assert.equal(result.intent.layoutIntent, "copy_focused");
  assert.deepEqual(
    result.intent.assetPolicy,
    normalizeTemplateAssetPolicy("graphic_allowed_photo_optional"),
  );
  assert.ok(plan);
  assert.equal(plan.actions.length, 3);
  assert.equal(result.emittedMutationIds.length >= 2, true);
  assert.ok(selectionDecision);
  assert.equal(selectionDecision.retrievalMode, "none");
  assert.equal(selectionDecision.backgroundMode, "generated_solid");
  assert.equal(selectionDecision.layoutMode, "left_copy_right_graphic");
  assert.equal(selectionDecision.decorationMode, "promo_multi_graphic");
  assert.ok(selectionDecision.graphicCompositionSet);
  assert.equal(selectionDecision.graphicCompositionSet?.roles.length >= 3, true);
  assert.equal(result.intent.domain, "general_marketing");
  assert.equal(result.intent.facets.menuType, null);
  assert.equal(result.intent.campaignGoal, "sale_conversion");
  const copyAction = plan.actions.find(
    (action) => action.operation === "place_copy_cluster",
  );
  assert.ok(copyAction);
  assert.equal(
    (copyAction.inputs as { copySlotTexts?: { headline?: string } }).copySlotTexts
      ?.headline,
    "봄 세일",
  );
  assert.equal(
    (copyAction.inputs as { copySlotTexts?: { cta?: string } }).copySlotTexts?.cta,
    "혜택 보기",
  );
  assert.equal(
    (
      copyAction.inputs as {
        copySlotAnchors?: { headline?: string };
      }
    ).copySlotAnchors?.headline,
    "left_copy_column",
  );
  const resolvedSlotBounds = (
    copyAction.inputs as {
      resolvedSlotBounds?: {
        offer_line?: { y: number; height: number };
        cta?: { y: number };
      };
    }
  ).resolvedSlotBounds;
  assert.ok(resolvedSlotBounds?.cta);
  assert.ok(resolvedSlotBounds?.offer_line);
  assert.equal(
    (resolvedSlotBounds?.cta?.y ?? 0) >
      ((resolvedSlotBounds?.offer_line?.y ?? 0) +
        (resolvedSlotBounds?.offer_line?.height ?? 0)),
    true,
  );
  assert.equal(
    result.searchProfile?.photo.queries[0]?.keyword === "메뉴",
    false,
  );
  assert.equal(
    result.searchProfile?.photo.queries[0]?.keyword === "패션",
    false,
  );
  assert.equal(result.templatePriorSummary?.dominantThemePrior, "template_prior");
  assert.equal(
    result.templatePriorSummary?.selectedTemplatePrior.status,
    "competitive_only",
  );
  assert.equal(result.templatePriorSummary?.selectedTemplatePrior.keyword, "봄");
  assert.equal(
    result.templatePriorSummary?.templatePriorCandidates.some((candidate) =>
      candidate.sourceSignal.startsWith("menu_type:"),
    ),
    false,
  );
  assert.equal(result.assetPlan?.primaryVisualFamily, "graphic");
  assert.equal(result.assetPlan?.photoBinding, null);
  assert.equal(result.assetPlan?.graphicRoleBindings.length !== 0, true);
  assert.equal(result.ruleJudgeVerdict?.recommendation, "refine");
  assert.ok(candidateSets);
  assert.equal(candidateSets.background.family, "background");
  assert.equal(candidateSets.layout.family, "layout");
  assert.equal(candidateSets.decoration.family, "decoration");
  assert.equal(candidateSets.photo.family, "photo");
  assert.equal(result.finalizeDraft.request.finalStatus, "completed_with_warning");

  assert.equal(callbackClient.heartbeats.length >= 3, true);
  const heartbeatPhases = callbackClient.heartbeats.map(
    (heartbeat) => heartbeat.phase,
  );
  assert.equal(heartbeatPhases.includes("planning"), true);
  assert.equal(heartbeatPhases.includes("executing"), true);
  assert.equal(heartbeatPhases.includes("saving"), true);
  assert.equal(
    heartbeatPhases.includes("applying"),
    result.refineDecision?.decision === "patch",
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
  assert.equal(result.emittedMutationIds.length >= 2, true);
  assert.equal(callbackClient.ackWaits.length >= 2, true);
  assert.equal(callbackClient.finalizations.length, 1);
  assert.equal(
    callbackClient.finalizations[0]?.lastAckedSeq,
    callbackClient.ackWaits.length,
  );
  assert.equal(
    callbackClient.finalizations[0]?.canonicalDesignBriefRef,
    `runs/${testRun.runId}/attempts/1/canonical-design-brief.json`,
  );
  assert.equal(
    callbackClient.finalizations[0]?.templatePriorSummaryRef,
    `runs/${testRun.runId}/attempts/1/template-prior-summary.json`,
  );
  assert.equal(
    callbackClient.finalizations[0]?.searchProfileRef,
    `runs/${testRun.runId}/attempts/1/search-profile.json`,
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
    callbackClient.finalizations[0]?.ruleJudgeVerdictRef,
    `runs/${testRun.runId}/attempts/1/rule-judge-verdict.json`,
  );
  assert.equal(
    callbackClient.finalizations[0]?.latestSaveEvidence?.code,
    `template_draft_${testRun.runId}`,
  );
  assert.equal(
    String(callbackClient.finalizations[0]?.latestSaveReceipt?.saveReceiptId ?? "").startsWith(
      `save_receipt_${testRun.runId}_`,
    ),
    true,
  );
  assert.ok((callbackClient.finalizations[0]?.warnings?.length ?? 0) > 0);
  assert.equal(
    result.artifactRefs.searchProfileRef,
    `runs/${testRun.runId}/attempts/1/search-profile.json`,
  );
  assert.equal(
    result.artifactRefs.semanticBriefDraftRef,
    `runs/${testRun.runId}/attempts/1/semantic-brief-draft.json`,
  );
  assert.equal(
    result.artifactRefs.briefCompilationReportRef,
    `runs/${testRun.runId}/attempts/1/brief-compilation-report.json`,
  );
  assert.equal(
    result.artifactRefs.templatePriorSummaryRef,
    `runs/${testRun.runId}/attempts/1/template-prior-summary.json`,
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
  assert.equal(
    result.artifactRefs.ruleJudgeVerdictRef,
    `runs/${testRun.runId}/attempts/1/rule-judge-verdict.json`,
  );
  assert.ok(result.retrievalStage);
  assert.equal(result.retrievalStage.retrievalMode, "none");
  assert.equal(result.retrievalStage.status, "disabled");
  assert.equal(
    result.retrievalStage.allowedSourceFamilies.includes("photo_source"),
    true,
  );
  assert.equal(persistedTemplatePriorSummary.dominantThemePrior, "template_prior");
  assert.equal(
    persistedTemplatePriorSummary.selectedTemplatePrior.status,
    "competitive_only",
  );
  assert.equal(
    persistedTemplatePriorSummary.selectedTemplatePrior.keyword,
    "봄",
  );
  assert.equal(
    persistedTemplatePriorSummary.selectedTemplatePrior.categorySerial,
    expectedTemplateCategorySerial,
  );
  assert.deepEqual(
    Object.keys(persistedTemplatePriorSummary),
    [
      "summaryId",
      "runId",
      "traceId",
      "plannerMode",
      "templatePriorCandidates",
      "selectedTemplatePrior",
      "selectedContentsThemePrior",
      "dominantThemePrior",
      "contentsThemePriorMatches",
      "keywordThemeMatches",
      "familyCoverage",
      "rankingBiases",
      "rankingRationaleEntries",
      "summary",
    ],
  );
  assert.deepEqual(
    persistedTemplatePriorSummary.templatePriorCandidates.map((candidate) => ({
      rank: candidate.rank,
      sourceSignal: candidate.sourceSignal,
      keyword: candidate.keyword,
      selected: candidate.selected,
    })),
    [
      {
        rank: 1,
        sourceSignal: "seasonality:spring",
        keyword: "봄",
        selected: true,
      },
      {
        rank: 2,
        sourceSignal: "promotion_style:sale_campaign",
        keyword: "세일",
        selected: false,
      },
    ],
  );
  assert.equal(
    persistedTemplatePriorSummary.rankingRationaleEntries[0]?.signal,
    "template_prior_candidate_order",
  );
  assert.ok(
    persistedTemplatePriorSummary.rankingRationaleEntries[0]?.outcome.includes("keyword '봄'"),
  );
  assert.ok(
    persistedTemplatePriorSummaryRaw.includes("\"rankingRationaleEntries\""),
  );
  assert.ok(
    objectStore.putKeys.indexOf(
      `runs/${testRun.runId}/attempts/1/template-prior-summary.json`,
    ) <
      objectStore.putKeys.indexOf(
        `runs/${testRun.runId}/attempts/1/search-profile.json`,
      ),
  );
  assert.ok(
    objectStore.putKeys.indexOf(`runs/${testRun.runId}/attempts/1/search-profile.json`) <
      objectStore.putKeys.indexOf(
        `runs/${testRun.runId}/attempts/1/template-candidate-set.json`,
      ),
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
        event.event.message.includes("Stage 1/"),
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

  const persistedSearchProfile = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: result.artifactRefs.searchProfileRef!,
        })
      ).body,
    ),
  ) as {
    domain: string;
    graphic: { queries: Array<{ keyword: string | null }> };
  };
  assert.equal(persistedSearchProfile.domain, "general_marketing");
  assert.ok(
    ["세일", "프로모션"].includes(
      persistedSearchProfile.graphic.queries[0]?.keyword ?? "",
    ),
  );

  const persistedJudgeVerdict = JSON.parse(
    new TextDecoder().decode(
      (
        await objectStore.getObject({
          bucket: env.objectStoreBucket,
          key: result.artifactRefs.ruleJudgeVerdictRef!,
        })
      ).body,
    ),
  ) as {
    recommendation: string;
    issues: Array<{ code: string }>;
  };
  assert.equal(persistedJudgeVerdict.recommendation, "refine");
  assert.equal(
    persistedJudgeVerdict.issues.some((issue) => issue.code === "brand_context_missing"),
    true,
  );

  const proposedMutations = callbackClient.appendedEvents
    .filter(
      (event): event is WorkerAppendEventRequest & {
        event: Extract<WorkerAppendEventRequest["event"], { type: "mutation.proposed" }>;
      } => event.event.type === "mutation.proposed",
    )
    .map((event) => event.event.mutation);
  const refineMutation = proposedMutations.find((mutation) =>
    mutation.idempotencyKey.startsWith("refine_patch_"),
  );
  assert.equal(
    Boolean(refineMutation),
    result.refineDecision?.decision === "patch",
  );

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
  assert.equal(
    (refineMutation?.commands ?? []).some(
      (command) =>
        command.op === "updateLayer" &&
        command.expectedLayerType === "shape",
    ),
    false,
  );
});

test(
  "processRunJob fails with adaptive_batch_missing for object-native execution even when request.workflowVariant is omitted",
  LEGACY_CHAIN_SKIP,
  async () => {
    const env = createEnv();
    const logger = createWorkerLogger(env);
    const objectStore = new TrackingObjectStoreClient(
      createObjectStoreClient({
        bucket: env.objectStoreBucket,
      }),
    );
    const callbackClient = new RecordingBackendCallbackClient();
    const testRun = createTestRun();

    await seedRunInputArtifacts(objectStore, testRun);

    assert.equal("workflowVariant" in testRun.request, false);

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
    v6Overrides: createDeterministicV6Overrides(),
      adaptiveCompositionDecisionBuilder: async () => null,
    });

    assert.equal(result.finalizeDraft.request.finalStatus, "failed");
    assert.equal(
      result.finalizeDraft.request.errorSummary?.code,
      "adaptive_batch_missing",
    );
    assert.equal(
      callbackClient.appendedEvents.some(
        (event) =>
          event.event.type === "log" &&
          event.event.message.includes(
            "refusing any slot-era fallback",
          ),
      ),
      true,
    );
    assert.equal(
      callbackClient.appendedEvents.some(
        (event) => event.event.type === "mutation.proposed",
      ),
      false,
    );
  },
);

test(
  "prepareExecutionNode keeps the adaptive object-native path when request.workflowVariant is omitted but an adaptive batch exists",
  async () => {
    const state = createPrepareExecutionState();
    let estimateCalled = false;
    const adaptiveBatch = {
      commitGroup: "group-test",
      proposals: [
        {
          mutationId: "mutation-adaptive",
          rollbackGroupId: "rollback-adaptive",
          stageLabel: "adaptive-composition",
          stageDescription: "Retain projected template objects",
          mutation: {
            mutationId: "mutation-adaptive",
            mutationVersion: "v1",
            traceId: state.job.traceId,
            runId: state.job.runId,
            draftId: `draft_${state.job.runId}`,
            documentId: state.hydrated!.request.editorContext.documentId,
            pageId: state.hydrated!.request.editorContext.pageId,
            seq: 1,
            commitGroup: "group-test",
            idempotencyKey: `adaptive_composition_${state.job.runId}`,
            expectedBaseRevision: 0,
            ownershipScope: "draft_only" as const,
            commands: [],
            rollbackHint: {
              rollbackGroupId: "rollback-adaptive",
              strategy: "delete_created_layers" as const,
            },
            emittedAt: "2026-04-20T00:00:00.000Z",
            deliveryDeadlineAt: "2026-04-20T00:00:10.000Z",
          },
        },
      ],
    };

    const result = await prepareExecutionNode(
      {
        ...state,
        adaptiveSkeletonBatch: adaptiveBatch as RunJobGraphStateType["adaptiveSkeletonBatch"],
      } as RunJobGraphStateType,
      {
        textLayoutHelper: {
          async estimate() {
            estimateCalled = true;
            throw new Error("prepareExecutionNode should not reopen emitSkeletonMutations");
          },
        } as TextLayoutHelper,
      },
      {
        heartbeatTask: async () => ({
          accepted: true,
          cancelRequested: false,
          stopAfterCurrentAction: false,
          runStatus: "planning_queued",
          deadlineAt: "2026-04-20T00:00:30.000Z",
        }),
        appendEventTask: async () => ({
          accepted: true,
          cancelRequested: false,
        }),
      } as any,
    );

    assert.equal("workflowVariant" in state.hydrated!.request, false);
    assert.equal(estimateCalled, false);
    assert.equal(result.finalizeDraft ?? null, null);
    assert.equal(
      result.skeletonBatch?.proposals[0]?.mutation.idempotencyKey,
      `adaptive_composition_${state.job.runId}`,
    );
    assert.equal(
      result.currentProposal?.stageLabel,
      "adaptive-composition",
    );
    assert.equal(
      result.skeletonBatch?.proposals.some(
        (proposal) =>
          proposal.mutation.idempotencyKey ===
          `mutation_foundation_${state.job.runId}`,
      ),
      false,
    );
  },
);

test("processRunJob covers taxonomy-grounded general, cafe, and fashion create-template acceptance scenarios", LEGACY_CHAIN_SKIP, async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const scenarios = [
    {
      prompt: "봄 프로모션 배너",
      expectedDomain: "general_marketing",
      expectedGoal: "promotion_awareness",
      expectedConsistencyFlagCodes: [],
    },
    {
      prompt: "카페 봄 신메뉴 음료 배너 만들어줘",
      expectedDomain: "cafe",
      expectedGoal: "menu_discovery",
      expectedConsistencyFlagCodes: [],
    },
    {
      prompt: "패션 리테일 봄 세일 배너 만들어줘",
      expectedDomain: "fashion_retail",
      expectedGoal: "sale_conversion",
      expectedConsistencyFlagCodes: [],
    },
  ] as const;

  for (const scenario of scenarios) {
    const objectStore = createObjectStoreClient({
      bucket: `${env.objectStoreBucket}-${scenario.expectedDomain}`,
    });
    const callbackClient = new RecordingBackendCallbackClient();
    const baseRun = createTestRun();
    const testRun = createTestRun({
      userInput: {
        ...baseRun.request.userInput,
        prompt: scenario.prompt,
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
    v6Overrides: createDeterministicV6Overrides(),
      adaptiveCompositionDecisionBuilder:
        createDeterministicAdaptiveCompositionDecisionBuilder(),
      tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
    });

    assert.equal(result.intent.domain, scenario.expectedDomain);
    assert.equal(result.intent.campaignGoal, scenario.expectedGoal);
    assert.ok(result.searchProfile);
    assert.ok(result.selectionDecision);
    assert.ok(result.ruleJudgeVerdict);
    assert.ok(result.plan);
    assert.equal(result.finalizeDraft.request.finalStatus, "completed_with_warning");

    assert.ok(result.artifactRefs.canonicalDesignBriefRef);
    assert.ok(result.artifactRefs.briefCompilationReportRef);
    assert.ok(result.artifactRefs.templatePriorSummaryRef);
    assert.ok(result.artifactRefs.searchProfileRef);
    assert.ok(result.artifactRefs.selectionDecisionRef);
    assert.ok(result.artifactRefs.ruleJudgeVerdictRef);
    assert.ok(result.artifactRefs.executablePlanRef);

    const normalizedIntentArtifact = JSON.parse(
      new TextDecoder().decode(
        (
          await objectStore.getObject({
            bucket: `${env.objectStoreBucket}-${scenario.expectedDomain}`,
            key: result.artifactRefs.canonicalDesignBriefRef!,
          })
        ).body,
      ),
    ) as {
      domain: string;
      campaignGoal: string;
      consistencyFlags: Array<{ code: string }>;
      normalizationNotes: string[];
    };
    assert.equal(normalizedIntentArtifact.domain, scenario.expectedDomain);
    assert.equal(normalizedIntentArtifact.campaignGoal, scenario.expectedGoal);
    assert.deepEqual(
      normalizedIntentArtifact.consistencyFlags.map((flag) => flag.code),
      scenario.expectedConsistencyFlagCodes,
    );
    assert.equal(
      normalizedIntentArtifact.normalizationNotes.some((note) =>
        /contradiction/i.test(note),
      ),
      false,
    );

    const normalizationReportArtifact = JSON.parse(
      new TextDecoder().decode(
        (
          await objectStore.getObject({
            bucket: `${env.objectStoreBucket}-${scenario.expectedDomain}`,
            key: result.artifactRefs.briefCompilationReportRef!,
          })
        ).body,
      ),
    ) as {
      repairCount: number;
      consistencyFlags: Array<{ code: string }>;
      normalizationNotes: string[];
    };
    assert.equal(normalizationReportArtifact.repairCount, 0);
    assert.deepEqual(
      normalizationReportArtifact.consistencyFlags.map((flag) => flag.code),
      scenario.expectedConsistencyFlagCodes,
    );
    assert.equal(
      normalizationReportArtifact.normalizationNotes.includes(
        "Planner draft matched deterministic normalization rules without requiring repair.",
      ),
      true,
    );
    assert.equal(
      normalizationReportArtifact.normalizationNotes.some((note) =>
        /contradiction/i.test(note),
      ),
      false,
    );

    const templatePriorArtifact = JSON.parse(
      new TextDecoder().decode(
        (
          await objectStore.getObject({
            bucket: `${env.objectStoreBucket}-${scenario.expectedDomain}`,
            key: result.artifactRefs.templatePriorSummaryRef!,
          })
        ).body,
      ),
    ) as {
      dominantThemePrior: string;
      selectedTemplatePrior: { status: string };
    };
    assert.equal(templatePriorArtifact.dominantThemePrior, "template_prior");
    assert.notEqual(templatePriorArtifact.selectedTemplatePrior.status, "unavailable");

    const searchProfileArtifact = JSON.parse(
      new TextDecoder().decode(
        (
          await objectStore.getObject({
            bucket: `${env.objectStoreBucket}-${scenario.expectedDomain}`,
            key: result.artifactRefs.searchProfileRef!,
          })
        ).body,
      ),
    ) as {
      domain: string;
      campaignGoal: string;
    };
    assert.equal(searchProfileArtifact.domain, scenario.expectedDomain);
    assert.equal(searchProfileArtifact.campaignGoal, scenario.expectedGoal);

    const judgeArtifact = JSON.parse(
      new TextDecoder().decode(
        (
          await objectStore.getObject({
            bucket: `${env.objectStoreBucket}-${scenario.expectedDomain}`,
            key: result.artifactRefs.ruleJudgeVerdictRef!,
          })
        ).body,
      ),
    ) as {
      recommendation: string;
      issues: Array<{ code: string }>;
    };
    assert.equal(judgeArtifact.recommendation, "refine");
    assert.ok(judgeArtifact.issues.length > 0);
  }
});

test("processRunJob can activate generated background with real Tooldi graphic/font source mode", LEGACY_CHAIN_SKIP, async () => {
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
    v6Overrides: createDeterministicV6Overrides(),
    tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
  });

  assert.equal(result.selectionDecision?.selectedBackgroundSerial, null);
  assert.equal(result.selectionDecision?.selectedDecorationSerial, "22");
  assert.equal(result.selectionDecision?.topPhotoSerial, "33");
  assert.equal(result.selectionDecision?.selectedBackgroundCategory, "generated_solid");
  assert.equal(typeof result.selectionDecision?.selectedBackgroundColorHex, "string");
  assert.equal(result.selectionDecision?.selectedDecorationCategory, "illust");
  assert.equal(result.selectionDecision?.topPhotoCategory, "landscape");
  assert.equal(result.selectionDecision?.photoBranchMode, "not_considered");
  assert.equal(result.typographyDecision?.display?.fontToken, "701_400");
  assert.equal(result.typographyDecision?.body?.fontToken, "701_400");
  assert.equal(result.sourceSearchSummary?.background.selectedCategory, "generated_solid");
  assert.equal(result.sourceSearchSummary?.graphic.returnedCount, 1);
  assert.equal(result.sourceSearchSummary?.photo.returnedCount, 1);
  assert.equal(result.sourceSearchSummary?.font.returnedCount, 1);
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("[source/background]") &&
        event.event.message.includes("mode=generated_solid"),
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
        event.event.message.includes("display=701_400 body=701_400"),
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
    selectedBackgroundColorHex: string;
    selectedDecorationAssetId: string | null;
  };
  assert.equal(selectionArtifact.selectedBackgroundAssetId, null);
  assert.equal(typeof selectionArtifact.selectedBackgroundColorHex, "string");
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
    representativeReadiness: { background: { status: string } };
  };
  assert.equal(sourceSummaryArtifact.sourceMode, "tooldi_api_direct");
  assert.equal(sourceSummaryArtifact.representativeReadiness.background.status, "not_applicable");
  assert.equal(sourceSummaryArtifact.font.selectedSerial, "701");
});

test("processRunJob는 실소스 그래픽 후보가 비면 실패 finalize로 전이한다", LEGACY_CHAIN_SKIP, async () => {
  const env = createRealSourceEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  const testRun = createTestRun({
    userInput: {
      prompt: "패션 리테일 봄 세일 배너 만들어줘",
      locale: "ko-KR",
      timezone: "Asia/Seoul",
    },
  });

  await seedRunInputArtifacts(objectStore, testRun);

  const baseSourceClient = new FakeTooldiCatalogSourceClient();
  const backgroundEmptySourceClient: TooldiCatalogSourceClient = {
    async searchBackgroundAssets() {
      return baseSourceClient.searchBackgroundAssets();
    },
    async searchGraphicAssets(query) {
      return {
        sourceFamily: "graphic_source" as const,
        page: 1,
        hasNextPage: false,
        traceId: "trace-graphic-empty",
        assets: [],
      };
    },
    async searchPhotoAssets(query) {
      return baseSourceClient.searchPhotoAssets();
    },
    async listFontAssets(query) {
      return baseSourceClient.listFontAssets();
    },
    async searchTemplateAssets(query) {
      return baseSourceClient.searchTemplateAssets();
    },
    async getTemplateDocument(query) {
      return baseSourceClient.getTemplateDocument();
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
    v6Overrides: createDeterministicV6Overrides(),
    tooldiCatalogSourceClient: backgroundEmptySourceClient,
  });

  assert.equal(result.finalizeDraft.request.finalStatus, "failed");
  assert.equal(
    result.finalizeDraft.request.errorSummary?.code,
    "graphic_candidates_empty",
  );
  assert.equal(result.emittedMutationIds.length, 0);
  assert.equal(callbackClient.ackWaits.length, 0);
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) => event.event.type === "mutation.proposed",
    ),
    false,
  );
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("Real Tooldi source activation failed"),
    ),
    true,
  );
});

test("processRunJob can activate the photo hero execution path on the wide preset", LEGACY_CHAIN_SKIP, async () => {
  const env = createRealSourceEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  const seedRun = createTestRun();
  const testRun = createTestRun({
    userInput: {
      ...seedRun.request.userInput,
      prompt: "카페 봄 음료 배너 만들어줘",
    },
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
    searchTemplateAssets: async (_query) => baseSourceClient.searchTemplateAssets(),
    getTemplateDocument: async (_query) => baseSourceClient.getTemplateDocument(),
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
    v6Overrides: createDeterministicV6Overrides(),
    adaptiveCompositionDecisionBuilder:
      createDeterministicAdaptiveCompositionDecisionBuilder(),
    tooldiCatalogSourceClient: photoPreferredSourceClient,
  });

  assert.equal(result.selectionDecision?.layoutMode, "left_copy_right_graphic");
  assert.equal(
    result.selectionDecision?.selectedLayoutCandidateId,
    "layout_left_copy_right_graphic",
  );
  assert.equal(result.selectionDecision?.photoBranchMode, "graphic_preferred");
  assert.equal(result.selectionDecision?.topPhotoSerial, "33");
  assert.equal(result.selectionDecision?.executionStrategy, "graphic_first_shape_text_group");
  assert.equal(result.selectionDecision?.topPhotoUrl, "https://origin.test/photo-33.png");
  assert.equal(result.selectionDecision?.topPhotoWidth, 1600);
  assert.equal(result.selectionDecision?.topPhotoHeight, 900);
  assert.equal(result.plan?.actions.length, 3);
  assert.equal(
    result.plan?.actions.some((action) => action.operation === "place_photo_hero"),
    false,
  );
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("[source/photo-branch]") &&
        event.event.message.includes("mode=graphic_preferred"),
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
    false,
  );
  assert.equal(
    callbackClient.appendedEvents.some(
      (event) =>
        event.event.type === "log" &&
        event.event.message.includes("Stage 2/4 (photo)"),
    ),
    false,
  );

  const photoMutation = callbackClient.appendedEvents.find(
    (event): event is WorkerAppendEventRequest & {
      event: Extract<WorkerAppendEventRequest["event"], { type: "mutation.proposed" }>;
    } =>
      event.event.type === "mutation.proposed" &&
      event.event.mutation.commands.some(
        (command) =>
          "executionSlotKey" in command && command.executionSlotKey === "hero_image",
      ),
  );

  assert.equal(photoMutation, undefined);
  assert.equal(result.executionSceneSummary?.photoLayerBinding, null);
});

test("processRunJob can promote a real-like photo candidate when it stays within the wide-preset tolerance window", LEGACY_CHAIN_SKIP, async () => {
  const env = createRealSourceEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  const seedRun = createTestRun();
  const testRun = createTestRun({
    userInput: {
      ...seedRun.request.userInput,
      prompt: "카페 봄 음료 배너 만들어줘",
    },
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
    v6Overrides: createDeterministicV6Overrides(),
    tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
  });

  assert.equal(result.selectionDecision?.photoBranchMode, "graphic_preferred");
  assert.equal(
    result.selectionDecision?.selectedLayoutCandidateId,
    "layout_left_copy_right_graphic",
  );
  assert.equal(result.plan?.actions.length, 3);
  assert.equal(
    result.plan?.actions.some((action) => action.operation === "place_photo_hero"),
    false,
  );
});

test("processRunJob keeps graphic path when top photo candidate is not executable", LEGACY_CHAIN_SKIP, async () => {
  const env = createRealSourceEnv();
  const logger = createWorkerLogger(env);
  const objectStore = createObjectStoreClient({
    bucket: env.objectStoreBucket,
  });
  const callbackClient = new RecordingBackendCallbackClient();
  const seedRun = createTestRun();
  const testRun = createTestRun({
    userInput: {
      ...seedRun.request.userInput,
      prompt: "카페 봄 음료 배너 만들어줘",
    },
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
    searchTemplateAssets: async (_query) => baseSourceClient.searchTemplateAssets(),
    getTemplateDocument: async (_query) => baseSourceClient.getTemplateDocument(),
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
    v6Overrides: createDeterministicV6Overrides(),
    tooldiCatalogSourceClient: nonExecutablePhotoSourceClient,
  });

  assert.equal(result.selectionDecision?.topPhotoSerial, "91");
  assert.equal(result.selectionDecision?.photoBranchMode, "graphic_preferred");
  assert.equal(
    result.selectionDecision?.selectedLayoutCandidateId,
    "layout_left_copy_right_graphic",
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
    v6Overrides: createDeterministicV6Overrides(),
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

test("processRunJob keeps the representative wide banner geometry inside the canvas", LEGACY_CHAIN_SKIP, async () => {
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
    v6Overrides: createDeterministicV6Overrides(),
  });

  assert.equal(result.selectionDecision?.layoutMode, "left_copy_right_graphic");

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
    false,
  );
  assert.equal(
    proposedMutations.some((mutation) =>
      mutation.commands.some((command) => "executionSlotKey" in command && command.executionSlotKey === "badge_text"),
    ),
    false,
  );
});

test("processRunJob retrieval seam disables photo candidates when photo catalog tool is absent", LEGACY_CHAIN_SKIP, async () => {
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
    searchTemplateAssets: async (_query) => baseSourceClient.searchTemplateAssets(),
    getTemplateDocument: async (_query) => baseSourceClient.getTemplateDocument(),
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
    v6Overrides: createDeterministicV6Overrides(),
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

test("processRunJob honors cancel fence before starting a new mutation group", LEGACY_CHAIN_SKIP, async () => {
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
    v6Overrides: createDeterministicV6Overrides(),
  });

  assert.equal(result.emittedMutationIds.length, 0);
  assert.equal(result.finalizeDraft.request.finalStatus, "cancelled");
  assert.equal(
    callbackClient.appendedEvents.some((event) => event.event.type === "mutation.proposed"),
    false,
  );
});

test("processRunJob does not treat unconfirmed mutation ack as success", LEGACY_CHAIN_SKIP, async () => {
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
    v6Overrides: createDeterministicV6Overrides(),
    adaptiveCompositionDecisionBuilder:
      createDeterministicAdaptiveCompositionDecisionBuilder(),
    tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
  });

  assert.equal(result.finalizeDraft.request.finalStatus, "failed");
  assert.equal(result.finalizeDraft.request.errorSummary?.code, "mutation_ack_timed_out");
  assert.equal(imagePrimitiveClient.generateCalls, 0);
  assert.equal(assetStorageClient.persistCalls, 0);
});

test("processRunJob preserves rejected mutation reason in stage log and finalize summary", LEGACY_CHAIN_SKIP, async () => {
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
    v6Overrides: createDeterministicV6Overrides(),
    adaptiveCompositionDecisionBuilder:
      createDeterministicAdaptiveCompositionDecisionBuilder(),
    tooldiCatalogSourceClient: new FakeTooldiCatalogSourceClient(),
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
          "Save stage result: rejected",
        ),
    ),
    true,
  );
});

test("processRunJob stops immediately after a rejected photo stage under fail-fast policy", LEGACY_CHAIN_SKIP, async () => {
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
    userInput: {
      ...seedRun.request.userInput,
      prompt: "카페 봄 음료 배너 만들어줘",
    },
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
    searchTemplateAssets: async (_query) => baseSourceClient.searchTemplateAssets(),
    getTemplateDocument: async (_query) => baseSourceClient.getTemplateDocument(),
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
    v6Overrides: createDeterministicV6Overrides(),
    adaptiveCompositionDecisionBuilder:
      createDeterministicAdaptiveCompositionDecisionBuilder(),
    tooldiCatalogSourceClient: photoPreferredSourceClient,
  });

  assert.equal(result.selectionDecision?.photoBranchMode, "graphic_preferred");
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
    false,
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

test("processRunJob emits an observational log when backend passes repairContext", LEGACY_CHAIN_SKIP, async () => {
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
    v6Overrides: createDeterministicV6Overrides(),
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

test("processRunJob v6 happy path — HTML gen + security validate + browser-render stub + primitive map + adapter emits a single canvas.mutation envelope", async () => {
  const env = createEnv();
  const logger = createWorkerLogger(env);
  const objectStore = new TrackingObjectStoreClient(
    createObjectStoreClient({ bucket: env.objectStoreBucket }),
  );
  const callbackClient = new RecordingBackendCallbackClient();
  const testRun = createTestRun();

  await objectStore.putObject({
    key: testRun.requestObjectKey,
    body: JSON.stringify(testRun.request),
    contentType: "application/json",
    metadata: { ref: testRun.requestRef },
  });
  await objectStore.putObject({
    key: testRun.snapshotObjectKey,
    body: JSON.stringify(testRun.snapshot),
    contentType: "application/json",
    metadata: { ref: testRun.snapshotRef },
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
    v6Overrides: createDeterministicV6Overrides(),
  });

  assert.equal(result.plan?.planSchemaVersion, "v6-freeform-layout");
  assert.equal(result.plan?.actions.length, 1);
  const action = result.plan!.actions[0]!;
  assert.equal(action.operation, "v6_apply_freeform_layout");
  assert.equal(action.toolName, "v6-freeform-layout-pipeline");

  const mutationEvents = callbackClient.appendedEvents.filter(
    (e) => e.event.type === "mutation.proposed",
  );
  // v6 emits 2 envelopes: the primitive layer batch + the saveTemplate envelope
  // coming from emit_save_stage. Filter to the createLayer envelope.
  const createLayerEnvelopes = mutationEvents.filter((e) => {
    const event = e.event as Extract<
      (typeof mutationEvents)[number]["event"],
      { type: "mutation.proposed" }
    >;
    return event.mutation.commands.some((c) => c.op === "createLayer");
  });
  assert.equal(
    createLayerEnvelopes.length,
    1,
    "expected exactly one createLayer envelope from the v6 pipeline",
  );
  const envelope = (
    createLayerEnvelopes[0]!.event as Extract<
      (typeof mutationEvents)[number]["event"],
      { type: "mutation.proposed" }
    >
  ).mutation;
  assert.ok(
    envelope.commands.length >= 3,
    `expected ≥3 v6-mapped commands (1 rect + 2 text), got ${envelope.commands.length}`,
  );
  assert.equal(envelope.seq, 1);
  assert.equal(envelope.expectedBaseRevision, 0);
  assert.equal(envelope.rollbackHint.strategy, "delete_created_layers");

  const v6Logs = callbackClient.appendedEvents.filter(
    (e) =>
      e.event.type === "log" &&
      typeof e.event.message === "string" &&
      e.event.message.startsWith("[v6]"),
  );
  assert.ok(
    v6Logs.length >= 2,
    "expected v6 observability log entries (enter + done)",
  );
});
