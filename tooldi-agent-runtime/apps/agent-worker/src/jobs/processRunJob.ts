import type {
  RunJobEnvelope,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type { Logger } from "@tooldi/agent-observability";
import type { ObjectStoreClient } from "@tooldi/agent-persistence";
import type {
  AssetStorageClient,
  ImagePrimitiveClient,
  TemplateCatalogClient,
  TextLayoutHelper,
  TooldiCatalogSourceClient,
} from "@tooldi/tool-adapters";
import {
  createPlaceholderTooldiCatalogSourceClient,
  TooldiCatalogSourceError,
} from "@tooldi/tool-adapters";
import type { ToolRegistry } from "@tooldi/tool-registry";

import type { BackendCallbackClient } from "../clients/backendCallbackClient.js";
import {
  assembleTemplateCandidates,
  SpringCatalogActivationError,
} from "../phases/assembleTemplateCandidates.js";
import { buildExecutablePlan } from "../phases/buildExecutablePlan.js";
import { buildNormalizedIntent } from "../phases/buildNormalizedIntent.js";
import { emitRefinementMutations } from "../phases/emitRefinementMutations.js";
import { emitSkeletonMutations } from "../phases/emitSkeletonMutations.js";
import { finalizeRun } from "../phases/finalizeRun.js";
import { hydratePlanningInput } from "../phases/hydratePlanningInput.js";
import { runRetrievalStage } from "../phases/runRetrievalStage.js";
import { selectTypography } from "../phases/selectTypography.js";
import { selectTemplateComposition } from "../phases/selectTemplateComposition.js";
import type {
  ProcessRunJobResult,
  RetrievalStageResult,
  SelectionDecision,
  SourceSearchSummary,
  TemplateCandidateBundle,
  TypographyDecision,
} from "../types.js";

export interface ProcessRunJobDependencies {
  env: AgentWorkerEnv;
  logger: Logger;
  objectStore: ObjectStoreClient;
  callbackClient: BackendCallbackClient;
  toolRegistry: ToolRegistry;
  imagePrimitiveClient: ImagePrimitiveClient;
  assetStorageClient: AssetStorageClient;
  textLayoutHelper: TextLayoutHelper;
  templateCatalogClient: TemplateCatalogClient;
  tooldiCatalogSourceClient?: TooldiCatalogSourceClient;
}

export async function processRunJob(
  job: RunJobEnvelope,
  dependencies: ProcessRunJobDependencies,
): Promise<ProcessRunJobResult> {
  let cooperativeStopRequested = false;

  const heartbeatBase = {
    traceId: job.traceId,
    attempt: job.attemptSeq,
    queueJobId: job.queueJobId,
    workerId: "agent-worker-skeleton",
  } as const;

  const planningHeartbeat = await dependencies.callbackClient.heartbeat(job.runId, {
    ...heartbeatBase,
    attemptState: "hydrating",
    phase: "planning",
    heartbeatAt: new Date().toISOString(),
  });
  cooperativeStopRequested = shouldStopAfterCurrentAction(planningHeartbeat);

  const planningEvent = await dependencies.callbackClient.appendEvent(job.runId, {
    traceId: job.traceId,
    attempt: job.attemptSeq,
    queueJobId: job.queueJobId,
    event: {
      type: "phase",
      phase: "planning",
      message: "Worker started planning input hydration",
    },
  });
  cooperativeStopRequested ||= planningEvent.cancelRequested;

  const hydrated = await hydratePlanningInput(job, {
    objectStore: dependencies.objectStore,
    objectStoreBucket: dependencies.env.objectStoreBucket,
  });

  if (hydrated.repairContext) {
    const recoveryLog = await dependencies.callbackClient.appendEvent(job.runId, {
      traceId: job.traceId,
      attempt: job.attemptSeq,
      queueJobId: job.queueJobId,
      event: {
        type: "log",
        level: "warn",
        message: `Recovery handoff received: state=${hydrated.repairContext.recovery.state} reason=${hydrated.repairContext.reasonCode}`,
      },
    });
    cooperativeStopRequested ||= recoveryLog.cancelRequested;
  }

  const intent = await buildNormalizedIntent(hydrated);

  const intentEvent = await dependencies.callbackClient.appendEvent(job.runId, {
    traceId: job.traceId,
    attempt: job.attemptSeq,
    queueJobId: job.queueJobId,
    event: {
      type: "log",
      level: "info",
      message: `Normalized intent prepared for ${intent.operationFamily}`,
    },
  });
  cooperativeStopRequested ||= intentEvent.cancelRequested;

  const normalizedIntentRef = await persistWorkerJsonArtifact(
    dependencies.objectStore,
    `runs/${job.runId}/attempts/${job.attemptSeq}/normalized-intent.json`,
    intent,
    {
      artifactKind: "normalized-intent",
      runId: job.runId,
      traceId: job.traceId,
      attemptSeq: String(job.attemptSeq),
    },
  );
  if (intent.operationFamily !== "create_template" || !intent.supportedInV1) {
    const unsupportedLog = await dependencies.callbackClient.appendEvent(job.runId, {
      traceId: job.traceId,
      attempt: job.attemptSeq,
      queueJobId: job.queueJobId,
      event: {
        type: "log",
        level: "warn",
        message:
          "Spring vertical slice currently supports empty canvas create_template only",
      },
    });
    cooperativeStopRequested ||= unsupportedLog.cancelRequested;

    const savingHeartbeat = await dependencies.callbackClient.heartbeat(job.runId, {
      ...heartbeatBase,
      attemptState: "finalizing",
      phase: "saving",
      heartbeatAt: new Date().toISOString(),
    });
    cooperativeStopRequested ||= shouldStopAfterCurrentAction(savingHeartbeat);

    const finalizeDraft = await finalizeRun(hydrated, [], null, {
      cooperativeStopRequested,
      normalizedIntentRef,
      overrideResult: {
        finalStatus: "failed",
        errorSummary: {
          code: "unsupported_v1_vertical_slice",
          message:
            "Spring vertical slice only supports empty-canvas create_template runs",
        },
      },
    });
    await dependencies.callbackClient.finalize(job.runId, finalizeDraft.request);

    dependencies.logger.info("Skipped unsupported spring vertical slice run", {
      runId: job.runId,
      traceId: job.traceId,
      attemptSeq: job.attemptSeq,
      queueJobId: job.queueJobId,
    });

    return {
      intent,
      emittedMutationIds: [],
      finalizeDraft,
      artifactRefs: {
        normalizedIntentRef,
      },
    };
  }
  const tooldiCatalogSourceClient =
    dependencies.tooldiCatalogSourceClient ??
    createPlaceholderTooldiCatalogSourceClient();

  let candidateSets: TemplateCandidateBundle | undefined;
  let sourceSearchSummary: SourceSearchSummary | undefined;
  let retrievalStage: RetrievalStageResult | undefined;
  let selectionDecision: SelectionDecision | undefined;
  let typographyDecision: TypographyDecision | undefined;
  let typographySearchSummary: SourceSearchSummary["font"] | undefined;
  let plan: ProcessRunJobResult["plan"];
  let candidateSetRef: string | undefined;
  let retrievalStageRef: string | undefined;
  let selectionDecisionRef: string | undefined;
  let sourceSearchSummaryRef: string | undefined;
  let typographyDecisionRef: string | undefined;

  try {
    const retrievalDecision = await runRetrievalStage(hydrated, intent, {
      toolRegistry: dependencies.toolRegistry,
    });
    retrievalStage = retrievalDecision.retrievalStage;
    const selectionPolicy = retrievalDecision.selectionPolicy;
    retrievalStageRef = await persistWorkerJsonArtifact(
      dependencies.objectStore,
      `runs/${job.runId}/attempts/${job.attemptSeq}/retrieval-stage.json`,
      retrievalStage,
      {
        artifactKind: "retrieval-stage",
        runId: job.runId,
        traceId: job.traceId,
        attemptSeq: String(job.attemptSeq),
      },
    );
    const candidateAssembly = await assembleTemplateCandidates(hydrated, intent, {
      templateCatalogClient: dependencies.templateCatalogClient,
      tooldiCatalogSourceClient,
      sourceMode: dependencies.env.tooldiCatalogSourceMode,
      allowPhotoCandidates: selectionPolicy.allowPhotoCandidates,
    });
    candidateSets = candidateAssembly.candidates;
    candidateSetRef = await persistWorkerJsonArtifact(
      dependencies.objectStore,
      `runs/${job.runId}/attempts/${job.attemptSeq}/template-candidate-set.json`,
      candidateSets,
      {
        artifactKind: "template-candidate-set",
        runId: job.runId,
        traceId: job.traceId,
        attemptSeq: String(job.attemptSeq),
      },
    );
    selectionDecision = await selectTemplateComposition(intent, candidateSets, {
      retrievalStage,
      selectionPolicy,
    });
    const typographySelection = await selectTypography(hydrated, {
        sourceClient: tooldiCatalogSourceClient,
        sourceMode: dependencies.env.tooldiCatalogSourceMode,
      });
    typographyDecision = typographySelection.decision;
    typographySearchSummary = typographySelection.summary;
    selectionDecisionRef = await persistWorkerJsonArtifact(
      dependencies.objectStore,
      `runs/${job.runId}/attempts/${job.attemptSeq}/selection-decision.json`,
      selectionDecision,
      {
        artifactKind: "selection-decision",
        runId: job.runId,
        traceId: job.traceId,
        attemptSeq: String(job.attemptSeq),
      },
    );
    typographyDecisionRef = await persistWorkerJsonArtifact(
      dependencies.objectStore,
      `runs/${job.runId}/attempts/${job.attemptSeq}/typography-decision.json`,
      typographyDecision,
      {
        artifactKind: "typography-decision",
        runId: job.runId,
        traceId: job.traceId,
        attemptSeq: String(job.attemptSeq),
      },
    );
    sourceSearchSummary = buildSourceSearchSummary(
      job.runId,
      job.traceId,
      dependencies.env.tooldiCatalogSourceMode,
      candidateAssembly.sourceSearch.background,
      candidateAssembly.sourceSearch.graphic,
      candidateAssembly.sourceSearch.photo,
      typographySearchSummary,
      selectionDecision,
    );
    sourceSearchSummaryRef = await persistWorkerJsonArtifact(
      dependencies.objectStore,
      `runs/${job.runId}/attempts/${job.attemptSeq}/source-search-summary.json`,
      sourceSearchSummary,
      {
        artifactKind: "source-search-summary",
        runId: job.runId,
        traceId: job.traceId,
        attemptSeq: String(job.attemptSeq),
      },
    );
    for (const message of buildSelectionLogMessages(
      sourceSearchSummary,
      typographyDecision,
      selectionDecision,
    )) {
      const sourceLog = await dependencies.callbackClient.appendEvent(job.runId, {
        traceId: job.traceId,
        attempt: job.attemptSeq,
        queueJobId: job.queueJobId,
        event: {
          type: "log",
          level: message.level,
          message: message.message,
        },
      });
      cooperativeStopRequested ||= sourceLog.cancelRequested;
    }
    const selectionEvent = await dependencies.callbackClient.appendEvent(job.runId, {
    traceId: job.traceId,
    attempt: job.attemptSeq,
    queueJobId: job.queueJobId,
    event: {
      type: "log",
      level: "info",
      message:
        `[source/selection] background=${selectionDecision.selectedBackgroundSerial ?? "n/a"} ` +
        `(${selectionDecision.selectedBackgroundCategory ?? "n/a"}) ` +
        `layout=${selectionDecision.layoutMode} ` +
        `decoration=${selectionDecision.selectedDecorationSerial ?? "n/a"} ` +
        `(${selectionDecision.selectedDecorationCategory ?? "n/a"}) ` +
        `photoBranch=${selectionDecision.photoBranchMode} ` +
        `photo=${selectionDecision.topPhotoSerial ?? "n/a"} ` +
        `(${selectionDecision.topPhotoCategory ?? "n/a"})`,
    },
  });
    cooperativeStopRequested ||= selectionEvent.cancelRequested;

    plan = await buildExecutablePlan(
      hydrated,
      intent,
      selectionDecision,
      typographyDecision,
      {
        toolRegistry: dependencies.toolRegistry,
      },
    );
  } catch (error) {
    if (isSpringActivationFailure(error)) {
      const failureLog = await dependencies.callbackClient.appendEvent(job.runId, {
        traceId: job.traceId,
        attempt: job.attemptSeq,
        queueJobId: job.queueJobId,
        event: {
          type: "log",
          level: "error",
          message: `Real Tooldi source activation failed: ${error.message}`,
        },
      });
      cooperativeStopRequested ||= failureLog.cancelRequested;

      const savingHeartbeat = await dependencies.callbackClient.heartbeat(job.runId, {
        ...heartbeatBase,
        attemptState: "finalizing",
        phase: "saving",
        heartbeatAt: new Date().toISOString(),
      });
      cooperativeStopRequested ||= shouldStopAfterCurrentAction(savingHeartbeat);

      const finalizeDraft = await finalizeRun(hydrated, [], null, {
        cooperativeStopRequested,
        normalizedIntentRef,
        overrideResult: {
          finalStatus: "failed",
          errorSummary: {
            code: getSpringActivationErrorCode(error),
            message: error.message,
          },
        },
      });
      await dependencies.callbackClient.finalize(job.runId, finalizeDraft.request);

      return {
        intent,
        emittedMutationIds: [],
        finalizeDraft,
        artifactRefs: {
          normalizedIntentRef,
        },
      };
    }

    throw error;
  }
  const resolvedPlan = plan!;
  const executablePlanRef = await persistWorkerJsonArtifact(
    dependencies.objectStore,
    `runs/${job.runId}/attempts/${job.attemptSeq}/executable-plan.json`,
    resolvedPlan,
    {
      artifactKind: "executable-plan",
      runId: job.runId,
      traceId: job.traceId,
      attemptSeq: String(job.attemptSeq),
    },
  );

  const executingHeartbeat = await dependencies.callbackClient.heartbeat(job.runId, {
    ...heartbeatBase,
    attemptState: "running",
    phase: "executing",
    heartbeatAt: new Date().toISOString(),
  });
  cooperativeStopRequested ||= shouldStopAfterCurrentAction(executingHeartbeat);

  const executingEvent = await dependencies.callbackClient.appendEvent(job.runId, {
    traceId: job.traceId,
    attempt: job.attemptSeq,
    queueJobId: job.queueJobId,
    event: {
      type: "phase",
      phase: "executing",
      message: "Worker is emitting staged canvas mutations",
    },
  });
  cooperativeStopRequested ||= executingEvent.cancelRequested;

  const skeletonBatch = cooperativeStopRequested
    ? {
        commitGroup: resolvedPlan.actions[0]?.commitGroup ?? "cancelled_before_mutation",
        proposals: [],
      }
    : await emitSkeletonMutations(hydrated, intent, resolvedPlan, {
        textLayoutHelper: dependencies.textLayoutHelper,
      });
  const emittedMutationIds: string[] = [];
  const assignedSeqs: number[] = [];
  let lastMutationAck: WaitMutationAckResponse | null = cooperativeStopRequested
    ? {
        found: true,
        status: "cancelled",
      }
    : null;

  for (const proposal of skeletonBatch.proposals) {
    const totalStages = skeletonBatch.proposals.length;
    const stageLog = await dependencies.callbackClient.appendEvent(job.runId, {
      traceId: job.traceId,
      attempt: job.attemptSeq,
      queueJobId: job.queueJobId,
      event: {
        type: "log",
        level: "info",
        message: `Stage ${proposal.mutation.seq}/${totalStages} (${proposal.stageLabel}) - ${proposal.stageDescription}`,
      },
    });
    if (stageLog.cancelRequested) {
      cooperativeStopRequested = true;
      lastMutationAck = {
        found: true,
        status: "cancelled",
      };
      break;
    }

    if (proposal.stageLabel === "photo") {
      const heroCommand = proposal.mutation.commands.find(
        (command) =>
          command.op === "createLayer" && command.slotKey === "hero_image",
      );
      const bounds =
        heroCommand && "layerBlueprint" in heroCommand
          ? heroCommand.layerBlueprint.bounds
          : null;
      const photoStageLog = await dependencies.callbackClient.appendEvent(
        job.runId,
        {
          traceId: job.traceId,
          attempt: job.attemptSeq,
          queueJobId: job.queueJobId,
          event: {
            type: "log",
            level: "info",
            message:
              `[source/photo-stage] seq=${proposal.mutation.seq} ` +
              `heroBounds=${bounds ? `${bounds.x},${bounds.y},${bounds.width},${bounds.height}` : "n/a"}`,
          },
        },
      );
      if (photoStageLog.cancelRequested) {
        cooperativeStopRequested = true;
        lastMutationAck = {
          found: true,
          status: "cancelled",
        };
        break;
      }
    }

    emittedMutationIds.push(proposal.mutationId);
    const mutationResponse = await dependencies.callbackClient.appendEvent(job.runId, {
      traceId: job.traceId,
      attempt: job.attemptSeq,
      queueJobId: job.queueJobId,
      event: {
        type: "mutation.proposed",
        mutationId: proposal.mutationId,
        rollbackGroupId: proposal.rollbackGroupId,
        mutation: proposal.mutation,
      },
    });

    if (mutationResponse.cancelRequested) {
      cooperativeStopRequested = true;
      lastMutationAck = {
        found: true,
        status: "cancelled",
      };
      break;
    }

    assignedSeqs.push(mutationResponse.assignedSeq ?? proposal.mutation.seq);

    lastMutationAck = await dependencies.callbackClient.waitMutationAck(
      job.runId,
      proposal.mutationId,
      { waitMs: 15000 },
    );
    if (lastMutationAck.status === "cancelled") {
      cooperativeStopRequested = true;
      break;
    }

    const ackLog = await dependencies.callbackClient.appendEvent(job.runId, {
      traceId: job.traceId,
      attempt: job.attemptSeq,
      queueJobId: job.queueJobId,
      event: {
        type: "log",
        level: lastMutationAck.status === "acked" ? "info" : "warn",
        message:
          lastMutationAck.status === "rejected" && lastMutationAck.error
            ? `Stage ${proposal.mutation.seq}/${totalStages} result: rejected code=${lastMutationAck.error.code} message=${lastMutationAck.error.message}`
            : `Stage ${proposal.mutation.seq}/${totalStages} result: ${lastMutationAck.status}`,
      },
    });
    if (ackLog.cancelRequested) {
      cooperativeStopRequested = true;
      lastMutationAck = {
        found: true,
        status: "cancelled",
      };
      break;
    }

    if (lastMutationAck.status !== "acked") {
      const failFastLog = await dependencies.callbackClient.appendEvent(job.runId, {
        traceId: job.traceId,
        attempt: job.attemptSeq,
        queueJobId: job.queueJobId,
        event: {
          type: "log",
          level: "warn",
          message:
            proposal.stageLabel === "photo"
              ? "Fail-fast policy stopped remaining stages after the photo stage was not acknowledged"
              : `Stopped remaining stages after ${proposal.stageLabel} stage returned ${lastMutationAck.status}`,
        },
      });
      if (failFastLog.cancelRequested) {
        cooperativeStopRequested = true;
        lastMutationAck = {
          found: true,
          status: "cancelled",
        };
      }
      break;
    }
  }

  const shouldAttemptRefinement =
    !cooperativeStopRequested &&
    (lastMutationAck === null || lastMutationAck.status === "acked");
  const refinement = shouldAttemptRefinement
    ? await (async () => {
        const applyingHeartbeat = await dependencies.callbackClient.heartbeat(
          job.runId,
          {
            ...heartbeatBase,
            attemptState: "awaiting_ack",
            phase: "applying",
            heartbeatAt: new Date().toISOString(),
          },
        );
        cooperativeStopRequested ||= shouldStopAfterCurrentAction(applyingHeartbeat);

        const nextRefinement = await emitRefinementMutations(
          hydrated,
          intent,
          lastMutationAck,
          {
            imagePrimitiveClient: dependencies.imagePrimitiveClient,
            assetStorageClient: dependencies.assetStorageClient,
          },
        );

        const refinementLog = await dependencies.callbackClient.appendEvent(job.runId, {
          traceId: job.traceId,
          attempt: job.attemptSeq,
          queueJobId: job.queueJobId,
          event: {
            type: "log",
            level: "info",
            message: `Refinement placeholder completed after ${nextRefinement.proposedMutationIds.length} additional mutations`,
          },
        });
        cooperativeStopRequested ||= refinementLog.cancelRequested;
        return nextRefinement;
      })()
    : {
        proposedMutationIds: [],
        lastMutationAck,
      };

  const savingHeartbeat = await dependencies.callbackClient.heartbeat(job.runId, {
    ...heartbeatBase,
    attemptState: "finalizing",
    phase: "saving",
    heartbeatAt: new Date().toISOString(),
  });
  cooperativeStopRequested ||= shouldStopAfterCurrentAction(savingHeartbeat);

  const finalizeDraft = await finalizeRun(
    hydrated,
    emittedMutationIds,
    refinement.lastMutationAck,
    {
      cooperativeStopRequested,
      normalizedIntentRef,
      executablePlanRef,
      candidateSetRef,
      sourceSearchSummaryRef,
      retrievalStageRef,
      selectionDecisionRef,
      typographyDecisionRef,
      assignedSeqs,
    },
  );
  await dependencies.callbackClient.finalize(job.runId, finalizeDraft.request);

  dependencies.logger.info("Processed run job placeholder", {
    runId: job.runId,
    traceId: job.traceId,
    attemptSeq: job.attemptSeq,
    queueJobId: job.queueJobId,
    emittedMutationIds,
    finalStatus: finalizeDraft.summary.finalStatus,
  });

  return {
    intent,
    candidateSets,
    sourceSearchSummary,
    retrievalStage,
    selectionDecision,
    typographyDecision,
    plan: resolvedPlan,
    emittedMutationIds,
    finalizeDraft,
    artifactRefs: {
      normalizedIntentRef,
      executablePlanRef,
      candidateSetRef,
      sourceSearchSummaryRef,
      retrievalStageRef,
      selectionDecisionRef,
      typographyDecisionRef,
    },
  };
}

function buildSourceSearchSummary(
  runId: string,
  traceId: string,
  sourceMode: AgentWorkerEnv["tooldiCatalogSourceMode"],
  background: SourceSearchSummary["background"],
  graphic: SourceSearchSummary["graphic"],
  photo: SourceSearchSummary["photo"],
  font: SourceSearchSummary["font"] | undefined,
  selectionDecision: SelectionDecision,
): SourceSearchSummary {
  return {
    summaryId: createSummaryId(runId),
    runId,
    traceId,
    sourceMode,
    background: {
      ...background,
      selectedAssetId: selectionDecision.selectedBackgroundAssetId,
      selectedSerial: selectionDecision.selectedBackgroundSerial,
      selectedCategory: selectionDecision.selectedBackgroundCategory,
    },
    graphic: {
      ...graphic,
      selectedAssetId: selectionDecision.selectedDecorationAssetId,
      selectedSerial: selectionDecision.selectedDecorationSerial,
      selectedCategory: selectionDecision.selectedDecorationCategory,
    },
    photo: {
      ...photo,
      selectedAssetId: selectionDecision.topPhotoAssetId,
      selectedSerial: selectionDecision.topPhotoSerial,
      selectedCategory: selectionDecision.topPhotoCategory,
    },
    font: font ?? {
      family: "font",
      queryAttempts: [],
      returnedCount: 0,
      filteredCount: 0,
      fallbackUsed: true,
      selectedAssetId: null,
      selectedSerial: null,
      selectedCategory: null,
    },
  };
}

function buildSelectionLogMessages(
  sourceSearchSummary: SourceSearchSummary,
  typographyDecision: TypographyDecision,
  selectionDecision: SelectionDecision,
): Array<{ level: "info" | "warn"; message: string }> {
  if (sourceSearchSummary.sourceMode !== "tooldi_api") {
    return [];
  }

  return [
    {
      level: "info",
      message:
        `[source/background] returned=${sourceSearchSummary.background.returnedCount} ` +
        `selectedSerial=${sourceSearchSummary.background.selectedSerial ?? "n/a"} ` +
        `kind=${sourceSearchSummary.background.selectedCategory ?? "n/a"}`,
    },
    {
      level: "info",
      message:
        `[source/graphic] returned=${sourceSearchSummary.graphic.returnedCount} ` +
        `selectedSerial=${sourceSearchSummary.graphic.selectedSerial ?? "n/a"} ` +
        `category=${sourceSearchSummary.graphic.selectedCategory ?? "n/a"}`,
    },
    {
      level:
        sourceSearchSummary.photo.selectedSerial && sourceSearchSummary.photo.selectedCategory
          ? "info"
          : "warn",
      message:
        `[source/photo] returned=${sourceSearchSummary.photo.returnedCount} ` +
        `selectedSerial=${sourceSearchSummary.photo.selectedSerial ?? "n/a"} ` +
        `orientation=${sourceSearchSummary.photo.selectedCategory ?? "n/a"}`,
    },
    {
      level: typographyDecision.fallbackUsed ? "warn" : "info",
      message:
        `[source/font] inventory=${typographyDecision.inventoryCount} ` +
        `display=${typographyDecision.display?.fontToken ?? "fallback"} ` +
        `body=${typographyDecision.body?.fontToken ?? "fallback"}`,
    },
    {
      level:
        selectionDecision.photoBranchMode === "photo_selected"
          ? "info"
          : "warn",
      message:
        `[source/photo-branch] mode=${selectionDecision.photoBranchMode} ` +
        `reason=${selectionDecision.photoBranchReason}`,
    },
    ...(selectionDecision.photoBranchMode === "photo_selected"
      ? [
          {
            level: "info" as const,
            message:
              `[source/photo-execution] serial=${selectionDecision.topPhotoSerial ?? "n/a"} ` +
              `url=${selectionDecision.topPhotoUrl ?? "n/a"} fit=cover crop=centered_cover`,
          },
        ]
      : []),
  ];
}

function createSummaryId(runId: string): string {
  return `source_search_${runId}`;
}

function isSpringActivationFailure(
  error: unknown,
): error is TooldiCatalogSourceError | SpringCatalogActivationError {
  return (
    error instanceof TooldiCatalogSourceError ||
    error instanceof SpringCatalogActivationError
  );
}

function getSpringActivationErrorCode(
  error: TooldiCatalogSourceError | SpringCatalogActivationError,
): string {
  if (error instanceof TooldiCatalogSourceError) {
    return `catalog_source_${error.code}`;
  }
  return error.code;
}

function shouldStopAfterCurrentAction(response: {
  cancelRequested: boolean;
  stopAfterCurrentAction: boolean;
}): boolean {
  return response.cancelRequested || response.stopAfterCurrentAction;
}

async function persistWorkerJsonArtifact(
  objectStore: ObjectStoreClient,
  key: string,
  payload: unknown,
  metadata: Record<string, string>,
): Promise<string> {
  await objectStore.putObject({
    key,
    body: JSON.stringify(payload),
    contentType: "application/json",
    metadata,
  });
  return key;
}
