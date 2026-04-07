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
} from "@tooldi/tool-adapters";
import type { ToolRegistry } from "@tooldi/tool-registry";

import type { BackendCallbackClient } from "../clients/backendCallbackClient.js";
import { assembleTemplateCandidates } from "../phases/assembleTemplateCandidates.js";
import { buildExecutablePlan } from "../phases/buildExecutablePlan.js";
import { buildNormalizedIntent } from "../phases/buildNormalizedIntent.js";
import { emitRefinementMutations } from "../phases/emitRefinementMutations.js";
import { emitSkeletonMutations } from "../phases/emitSkeletonMutations.js";
import { finalizeRun } from "../phases/finalizeRun.js";
import { hydratePlanningInput } from "../phases/hydratePlanningInput.js";
import { runRetrievalStage } from "../phases/runRetrievalStage.js";
import { selectTemplateComposition } from "../phases/selectTemplateComposition.js";
import type { ProcessRunJobResult } from "../types.js";

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
  const candidateSets = await assembleTemplateCandidates(hydrated, intent, {
    backgroundCatalogClient: dependencies.templateCatalogClient,
    graphicCatalogClient: dependencies.templateCatalogClient,
    photoCatalogClient: dependencies.templateCatalogClient,
  });
  const candidateSetRef = await persistWorkerJsonArtifact(
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
  const { retrievalStage, selectionPolicy } = await runRetrievalStage(hydrated, intent, {
    toolRegistry: dependencies.toolRegistry,
  });
  const retrievalStageRef = await persistWorkerJsonArtifact(
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
  const selectionDecision = await selectTemplateComposition(intent, candidateSets, {
    retrievalStage,
    selectionPolicy,
  });
  const selectionDecisionRef = await persistWorkerJsonArtifact(
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
  const selectionEvent = await dependencies.callbackClient.appendEvent(job.runId, {
    traceId: job.traceId,
    attempt: job.attemptSeq,
    queueJobId: job.queueJobId,
    event: {
      type: "log",
      level: "info",
      message: `Selected ${selectionDecision.backgroundMode} background, ${selectionDecision.layoutMode} layout, ${selectionDecision.decorationMode} decoration`,
    },
  });
  cooperativeStopRequested ||= selectionEvent.cancelRequested;

  const plan = await buildExecutablePlan(hydrated, intent, selectionDecision, {
    toolRegistry: dependencies.toolRegistry,
  });
  const executablePlanRef = await persistWorkerJsonArtifact(
    dependencies.objectStore,
    `runs/${job.runId}/attempts/${job.attemptSeq}/executable-plan.json`,
    plan,
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
        commitGroup: plan.actions[0]?.commitGroup ?? "cancelled_before_mutation",
        proposals: [],
      }
    : await emitSkeletonMutations(hydrated, intent, plan, {
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
    const stageLog = await dependencies.callbackClient.appendEvent(job.runId, {
      traceId: job.traceId,
      attempt: job.attemptSeq,
      queueJobId: job.queueJobId,
      event: {
        type: "log",
        level: "info",
        message: `Stage ${proposal.mutation.seq}/3 (${proposal.stageLabel}) - ${proposal.stageDescription}`,
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
        message: `Stage ${proposal.mutation.seq}/3 result: ${lastMutationAck.status}`,
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
  }

  const applyingHeartbeat = await dependencies.callbackClient.heartbeat(job.runId, {
    ...heartbeatBase,
    attemptState: "awaiting_ack",
    phase: "applying",
    heartbeatAt: new Date().toISOString(),
  });
  cooperativeStopRequested ||= shouldStopAfterCurrentAction(applyingHeartbeat);

  const refinement = await emitRefinementMutations(hydrated, intent, lastMutationAck, {
    imagePrimitiveClient: dependencies.imagePrimitiveClient,
    assetStorageClient: dependencies.assetStorageClient,
  });

  const refinementLog = await dependencies.callbackClient.appendEvent(job.runId, {
    traceId: job.traceId,
    attempt: job.attemptSeq,
    queueJobId: job.queueJobId,
    event: {
      type: "log",
      level: "info",
      message: `Refinement placeholder completed after ${refinement.proposedMutationIds.length} additional mutations`,
    },
  });
  cooperativeStopRequested ||= refinementLog.cancelRequested;

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
      retrievalStageRef,
      selectionDecisionRef,
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
    retrievalStage,
    selectionDecision,
    plan,
    emittedMutationIds,
    finalizeDraft,
    artifactRefs: {
      normalizedIntentRef,
      executablePlanRef,
      candidateSetRef,
      retrievalStageRef,
      selectionDecisionRef,
    },
  };
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
