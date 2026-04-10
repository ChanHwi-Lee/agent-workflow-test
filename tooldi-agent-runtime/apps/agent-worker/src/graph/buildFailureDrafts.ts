import { TooldiCatalogSourceError } from "@tooldi/tool-adapters";

import { SpringCatalogActivationError } from "../phases/assembleTemplateCandidates.js";
import { finalizeRun } from "../phases/finalizeRun.js";
import { buildHeartbeatBase } from "./graphHelpers.js";
import { getSpringActivationErrorCode, shouldStopAfterCurrentAction } from "./nodeUtils.js";
import type { RunJobGraphStateType } from "./runJobGraphState.js";
import type { createRunJobGraphTasks } from "./graphTasks.js";

export async function buildSpringActivationFailureFinalizeDraft(
  state: RunJobGraphStateType,
  error: TooldiCatalogSourceError | SpringCatalogActivationError,
  tasks: Pick<
    ReturnType<typeof createRunJobGraphTasks>,
    "appendEventTask" | "heartbeatTask"
  >,
) {
  const { appendEventTask, heartbeatTask } = tasks;

  let cooperativeStopRequested = state.cooperativeStopRequested;
  const heartbeatBase = buildHeartbeatBase(state.job);

  const failureLog = await appendEventTask(state.job.runId, {
    traceId: state.job.traceId,
    attempt: state.job.attemptSeq,
    queueJobId: state.job.queueJobId,
    event: {
      type: "log",
      level: "error",
      message: `Real Tooldi source activation failed: ${error.message}`,
    },
  });
  cooperativeStopRequested ||= failureLog.cancelRequested;

  const savingHeartbeat = await heartbeatTask(state.job.runId, {
    ...heartbeatBase,
    attemptState: "finalizing",
    phase: "saving",
    heartbeatAt: new Date().toISOString(),
  });
  cooperativeStopRequested ||= shouldStopAfterCurrentAction(savingHeartbeat);

  const finalizeDraft = await finalizeRun(state.hydrated!, [], null, {
    cooperativeStopRequested,
    ...(state.normalizedIntentRef
      ? { normalizedIntentRef: state.normalizedIntentRef }
      : {}),
    overrideResult: {
      finalStatus: "failed",
      errorSummary: {
        code: getSpringActivationErrorCode(error),
        message: error.message,
      },
    },
  });

  return {
    cooperativeStopRequested,
    finalizeDraft,
  };
}
