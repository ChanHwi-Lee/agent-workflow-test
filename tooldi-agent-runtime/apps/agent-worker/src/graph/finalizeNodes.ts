import type { StateGraph } from "@langchain/langgraph";

import { finalizeRun } from "../phases/finalizeRun.js";
import type { ProcessRunJobResult } from "../types.js";
import { buildArtifactRefs, buildFinalizeOptions, buildHeartbeatBase } from "./graphHelpers.js";
import { shouldStopAfterCurrentAction } from "./nodeUtils.js";
import { RunJobGraphState } from "./runJobGraphState.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";
import type { createRunJobGraphTasks } from "./graphTasks.js";

export function registerFinalizeNodes(
  graph: StateGraph<typeof RunJobGraphState>,
  dependencies: RunJobGraphDependencies,
  tasks: ReturnType<typeof createRunJobGraphTasks>,
) {
  const {
    heartbeatTask,
    finalizeTask,
  } = tasks;

  return graph
    .addNode("prepare_finalize", async (state) => {
      if (!state.hydrated) {
        throw new Error("prepare_finalize requires hydrated state");
      }

      const heartbeatBase = buildHeartbeatBase(state.job);
      let cooperativeStopRequested = state.cooperativeStopRequested;
      const savingHeartbeat = await heartbeatTask(state.job.runId, {
        ...heartbeatBase,
        attemptState: "finalizing",
        phase: "saving",
        heartbeatAt: new Date().toISOString(),
      });
      cooperativeStopRequested ||= shouldStopAfterCurrentAction(savingHeartbeat);

      const finalizeDraft = await finalizeRun(
        state.hydrated,
        state.emittedMutationIds,
        state.lastMutationAck,
        buildFinalizeOptions(
          state,
          cooperativeStopRequested,
          state.assignedSeqs,
          state.ruleJudgeVerdict?.recommendation === "refuse"
            ? {
                finalStatus: "failed",
                errorSummary: {
                  code: "rule_judge_refused",
                  message: state.ruleJudgeVerdict.summary,
                },
              }
            : undefined,
        ),
      );

      return {
        cooperativeStopRequested,
        finalizeDraft,
      };
    })
    .addNode("send_finalize", async (state) => {
      if (!state.intent || !state.finalizeDraft) {
        throw new Error("send_finalize requires finalization draft state");
      }

      await finalizeTask(state.job.runId, state.finalizeDraft.request);
      dependencies.logger.info("Processed run job via LangGraph", {
        runId: state.job.runId,
        traceId: state.job.traceId,
        attemptSeq: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        emittedMutationIds: state.emittedMutationIds,
        finalStatus: state.finalizeDraft.summary.finalStatus,
      });

      return {
        result: {
          intent: state.intent,
          ...(state.normalizedIntentDraft
            ? { normalizedIntentDraft: state.normalizedIntentDraft }
            : {}),
          ...(state.intentNormalizationReport
            ? { intentNormalizationReport: state.intentNormalizationReport }
            : {}),
          ...(state.copyPlan ? { copyPlan: state.copyPlan } : {}),
          ...(state.copyPlanNormalizationReport
            ? { copyPlanNormalizationReport: state.copyPlanNormalizationReport }
            : {}),
          ...(state.abstractLayoutPlan
            ? { abstractLayoutPlan: state.abstractLayoutPlan }
            : {}),
          ...(state.abstractLayoutPlanNormalizationReport
            ? {
                abstractLayoutPlanNormalizationReport:
                  state.abstractLayoutPlanNormalizationReport,
              }
            : {}),
          ...(state.assetPlan ? { assetPlan: state.assetPlan } : {}),
          ...(state.concreteLayoutPlan
            ? { concreteLayoutPlan: state.concreteLayoutPlan }
            : {}),
          ...(state.templatePriorSummary
            ? { templatePriorSummary: state.templatePriorSummary }
            : {}),
          ...(state.searchProfile ? { searchProfile: state.searchProfile } : {}),
          ...(state.candidateSets ? { candidateSets: state.candidateSets } : {}),
          ...(state.sourceSearchSummary
            ? { sourceSearchSummary: state.sourceSearchSummary }
            : {}),
          ...(state.retrievalStage ? { retrievalStage: state.retrievalStage } : {}),
          ...(state.selectionDecision
            ? { selectionDecision: state.selectionDecision }
            : {}),
          ...(state.typographyDecision
            ? { typographyDecision: state.typographyDecision }
            : {}),
          ...(state.ruleJudgeVerdict
            ? { ruleJudgeVerdict: state.ruleJudgeVerdict }
            : {}),
          ...(state.executionSceneSummary
            ? { executionSceneSummary: state.executionSceneSummary }
            : {}),
          ...(state.judgePlan ? { judgePlan: state.judgePlan } : {}),
          ...(state.refineDecision ? { refineDecision: state.refineDecision } : {}),
          ...(state.plan ? { plan: state.plan } : {}),
          emittedMutationIds: state.emittedMutationIds,
          finalizeDraft: state.finalizeDraft,
          artifactRefs: buildArtifactRefs(state),
        } satisfies ProcessRunJobResult,
      };
    });
}
