import { TooldiCatalogSourceError } from "@tooldi/tool-adapters";

import { SpringCatalogActivationError } from "../phases/assembleTemplateCandidates.js";
import {
  ADAPTIVE_COMPOSITION_COVERAGE_ERROR_CODE,
  type AdaptiveCompositionCoverageError,
} from "../phases/buildAdaptiveCompositionDecision.js";
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
    ...(state.canonicalDesignBriefRef
      ? { canonicalDesignBriefRef: state.canonicalDesignBriefRef }
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

// ---------------------------------------------------------------------------
// Adaptive composition decision coverage failure (scope B hardening).
//
// When the LLM planner omits required text-object decisions (even after the
// single augmented-prompt retry), the L3 seam raises
// AdaptiveCompositionCoverageError. This helper projects that error into the
// terminal finalize draft with errorSummary.code ===
// "decision_coverage_incomplete". Centralizing the projection in this file
// preserves the failure taxonomy invariant: coverage violations must NEVER
// reach executionNodes and surface as "adaptive_batch_missing".
// ---------------------------------------------------------------------------

export async function buildAdaptiveCompositionCoverageFailureFinalizeDraft(
  state: RunJobGraphStateType,
  error: AdaptiveCompositionCoverageError,
  tasks: Pick<ReturnType<typeof createRunJobGraphTasks>, "appendEventTask">,
) {
  const { appendEventTask } = tasks;

  let cooperativeStopRequested = state.cooperativeStopRequested;

  const coverageLog = await appendEventTask(state.job.runId, {
    traceId: state.job.traceId,
    attempt: state.job.attemptSeq,
    queueJobId: state.job.queueJobId,
    event: {
      type: "log",
      level: "error",
      message: `[ssot/adaptive-composition] ${ADAPTIVE_COMPOSITION_COVERAGE_ERROR_CODE}: ${error.message}`,
    },
  });
  cooperativeStopRequested ||= coverageLog.cancelRequested;

  const finalizeDraft = await finalizeRun(state.hydrated!, [], null, {
    cooperativeStopRequested,
    ...(state.canonicalDesignBriefRef
      ? { canonicalDesignBriefRef: state.canonicalDesignBriefRef }
      : {}),
    ...(state.semanticBriefDraftRef
      ? { semanticBriefDraftRef: state.semanticBriefDraftRef }
      : {}),
    ...(state.briefCompilationReportRef
      ? { briefCompilationReportRef: state.briefCompilationReportRef }
      : {}),
    ...(state.copyPlanRef ? { copyPlanRef: state.copyPlanRef } : {}),
    ...(state.abstractLayoutPlanRef
      ? { abstractLayoutPlanRef: state.abstractLayoutPlanRef }
      : {}),
    ...(state.assetPlanRef ? { assetPlanRef: state.assetPlanRef } : {}),
    ...(state.concreteLayoutPlanRef
      ? { concreteLayoutPlanRef: state.concreteLayoutPlanRef }
      : {}),
    ...(state.templatePriorBundleRef
      ? { templatePriorBundleRef: state.templatePriorBundleRef }
      : {}),
    ...(state.sceneStylePlanRef
      ? { sceneStylePlanRef: state.sceneStylePlanRef }
      : {}),
    ...(state.sceneBindingPlanRef
      ? { sceneBindingPlanRef: state.sceneBindingPlanRef }
      : {}),
    overrideResult: {
      finalStatus: "failed",
      errorSummary: {
        code: ADAPTIVE_COMPOSITION_COVERAGE_ERROR_CODE,
        message: error.message,
      },
    },
  });

  return {
    cooperativeStopRequested,
    finalizeDraft,
  };
}
