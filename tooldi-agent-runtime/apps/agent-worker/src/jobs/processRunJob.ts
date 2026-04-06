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
  TextLayoutHelper,
} from "@tooldi/tool-adapters";
import type { ToolRegistry } from "@tooldi/tool-registry";

import type { BackendCallbackClient } from "../clients/backendCallbackClient.js";
import { buildExecutablePlan } from "../phases/buildExecutablePlan.js";
import { buildNormalizedIntent } from "../phases/buildNormalizedIntent.js";
import { emitRefinementMutations } from "../phases/emitRefinementMutations.js";
import { emitSkeletonMutations } from "../phases/emitSkeletonMutations.js";
import { finalizeRun } from "../phases/finalizeRun.js";
import { hydratePlanningInput } from "../phases/hydratePlanningInput.js";
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

  const plan = await buildExecutablePlan(hydrated, intent, {
    toolRegistry: dependencies.toolRegistry,
  });

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
      message: "Worker is emitting skeleton mutations",
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
  let lastMutationAck: WaitMutationAckResponse | null = cooperativeStopRequested
    ? {
        found: true,
        status: "cancelled",
      }
    : null;

  for (const proposal of skeletonBatch.proposals) {
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

    lastMutationAck = await dependencies.callbackClient.waitMutationAck(
      job.runId,
      proposal.mutationId,
      { waitMs: 15000 },
    );
    if (lastMutationAck.status === "cancelled") {
      cooperativeStopRequested = true;
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
    plan,
    emittedMutationIds,
    finalizeDraft,
  };
}

function shouldStopAfterCurrentAction(response: {
  cancelRequested: boolean;
  stopAfterCurrentAction: boolean;
}): boolean {
  return response.cancelRequested || response.stopAfterCurrentAction;
}
