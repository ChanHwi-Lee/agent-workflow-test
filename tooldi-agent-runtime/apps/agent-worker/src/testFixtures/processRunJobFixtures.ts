import assert from "node:assert/strict";

import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type {
  RunFinalizeRequest,
  WaitMutationAckQuery,
  WaitMutationAckResponse,
  WorkerAppendEventRequest,
  WorkerAppendEventResponse,
  WorkerFinalizeResponse,
  WorkerHeartbeatRequest,
  WorkerHeartbeatResponse,
} from "@tooldi/agent-contracts";
import type {
  ObjectStoreClient,
  PutObjectRequest,
  PutObjectResult,
} from "@tooldi/agent-persistence";
import type { createTestRun } from "@tooldi/agent-testkit";

import type { BackendCallbackClient } from "../clients/backendCallbackClient.js";
import type { V6NodeOverrides } from "../graph/v6PipelineNode.js";
import type { V6HtmlGenResult } from "../phases/v6HtmlGen.js";
import type { V6ExtractionResult } from "../phases/v6Types.js";
import type { processRunJob } from "../jobs/processRunJob.js";

export type ProcessRunJobTestResult = Awaited<ReturnType<typeof processRunJob>>;

export function createProcessRunJobTestEnv(): AgentWorkerEnv {
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
    langGraphCheckpointerMode: "memory",
    langGraphCheckpointerPostgresUrl: null,
    langGraphCheckpointerSchema: "agent_langgraph_test",
    postgresPoolMax: 10,
    postgresPoolConnectionTimeoutMs: 5000,
    postgresPoolIdleTimeoutMs: 30000,
    postgresApplicationName: "agent-worker-test",
    tooldiCatalogSourceMode: "placeholder",
    tooldiContentApiBaseUrl: null,
    tooldiContentApiTimeoutMs: 5000,
    tooldiContentApiCookie: null,
    googleApiKey: "test-google-api-key",
    htmlGenProvider: "gemini",
    htmlGenThinkingLevel: "low",
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

export const V6_FIXTURE_HTML = `<div style="position:relative; width:1200px; height:628px; overflow:hidden; background-color:#FFF5E1;"><h1 style="position:absolute; left:80px; top:140px; width:600px; height:110px; font-family:\"701_700\"; font-size:84px; color:#222222;">테스트 헤드라인</h1><p style="position:absolute; left:80px; top:270px; width:600px; height:80px; font-family:\"701_400\"; font-size:36px;">테스트 부제</p></div>`;

export function createDeterministicV6Overrides(): V6NodeOverrides {
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

export class RecordingBackendCallbackClient implements BackendCallbackClient {
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

export class TrackingObjectStoreClient implements ObjectStoreClient {
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

const LEGACY_BUILD_OR_REFINEMENT_RESULT_KEYS = [
  "sceneRolePlan",
  "sceneLayoutPlan",
  "sceneStylePlan",
  "sceneBindingPlan",
  "compositionBrief",
  "compositionVariantSet",
  "compositionRanking",
  "copyPlan",
  "copyPlanNormalizationReport",
  "abstractLayoutPlan",
  "abstractLayoutPlanNormalizationReport",
  "assetPlan",
  "concreteLayoutPlan",
  "templatePriorSummary",
  "ruleJudgeVerdict",
  "executionSceneSummary",
  "judgePlan",
  "refineDecision",
] as const satisfies readonly (keyof ProcessRunJobTestResult)[];

const LEGACY_BUILD_OR_REFINEMENT_ARTIFACT_REF_KEYS = [
  "templatePriorBundleRef",
  "sceneRolePlanRef",
  "sceneLayoutPlanRef",
  "sceneStylePlanRef",
  "sceneBindingPlanRef",
  "compositionBriefRef",
  "compositionVariantSetRef",
  "compositionRankingRef",
  "copyPlanRef",
  "copyPlanNormalizationReportRef",
  "abstractLayoutPlanRef",
  "abstractLayoutPlanNormalizationReportRef",
  "assetPlanRef",
  "concreteLayoutPlanRef",
  "templatePriorSummaryRef",
  "searchProfileRef",
  "candidateSetRef",
  "sourceSearchSummaryRef",
  "retrievalStageRef",
  "selectionDecisionRef",
  "typographyDecisionRef",
  "ruleJudgeVerdictRef",
  "executionSceneSummaryRef",
  "judgePlanRef",
  "refineDecisionRef",
] as const satisfies readonly (keyof ProcessRunJobTestResult["artifactRefs"])[];

const LEGACY_BUILD_OR_REFINEMENT_ARTIFACT_FILENAMES = [
  "template-prior-bundle.json",
  "scene-role-plan.json",
  "scene-layout-plan.json",
  "scene-style-plan.json",
  "scene-binding-plan.json",
  "composition-brief.json",
  "composition-variants.json",
  "composition-ranking.json",
  "copy-plan.json",
  "copy-plan-normalization-report.json",
  "layout-plan-abstract.json",
  "layout-plan-normalization-report.json",
  "asset-plan.json",
  "layout-plan-concrete.json",
  "template-prior-summary.json",
  "search-profile.json",
  "template-candidate-set.json",
  "source-search-summary.json",
  "retrieval-stage.json",
  "selection-decision.json",
  "typography-decision.json",
  "rule-judge-verdict.json",
  "execution-scene-summary.json",
  "judge-plan.json",
  "refine-decision.json",
] as const;

export function assertLegacyBuildAndRefinementNodesWereBypassed(
  result: ProcessRunJobTestResult,
  objectStore: TrackingObjectStoreClient,
): void {
  for (const key of LEGACY_BUILD_OR_REFINEMENT_RESULT_KEYS) {
    assert.equal(
      result[key],
      undefined,
      `${String(key)} must stay absent when object_native_v1 uses the v6 route`,
    );
  }

  for (const key of LEGACY_BUILD_OR_REFINEMENT_ARTIFACT_REF_KEYS) {
    assert.equal(
      result.artifactRefs[key],
      undefined,
      `${String(key)} must stay absent when object_native_v1 uses the v6 route`,
    );
  }

  const forbiddenPuts = objectStore.putKeys.filter((key) =>
    LEGACY_BUILD_OR_REFINEMENT_ARTIFACT_FILENAMES.some((fileName) =>
      key.endsWith(`/${fileName}`),
    ),
  );
  assert.deepEqual(
    forbiddenPuts,
    [],
    "legacy build/refinement artifact files must not be persisted by the v6 route",
  );
}

export async function seedRunInputArtifacts(
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
