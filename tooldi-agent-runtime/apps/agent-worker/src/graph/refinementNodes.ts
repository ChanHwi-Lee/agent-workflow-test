import type { StateGraph } from "@langchain/langgraph";
import type { WaitMutationAckResponse } from "@tooldi/agent-contracts";

import { buildExecutionSceneSummary } from "../phases/buildExecutionSceneSummary.js";
import { buildJudgePlan } from "../phases/buildJudgePlan.js";
import { buildRefineDecision } from "../phases/buildRefineDecision.js";
import { emitRefinementMutations } from "../phases/emitRefinementMutations.js";
import { buildHeartbeatBase, buildStageAckRecord } from "./graphHelpers.js";
import { shouldStopAfterCurrentAction } from "./nodeUtils.js";
import { RunJobGraphState } from "./runJobGraphState.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";
import type { createRunJobGraphTasks } from "./graphTasks.js";

export function registerRefinementNodes(
  graph: StateGraph<typeof RunJobGraphState>,
  dependencies: RunJobGraphDependencies,
  tasks: ReturnType<typeof createRunJobGraphTasks>,
) {
  const {
    heartbeatTask,
    appendEventTask,
    waitMutationAckTask,
    persistArtifactTask,
  } = tasks;

  return graph
    .addNode("build_execution_scene_summary", async (state) => {
      if (
        !state.copyPlan ||
        !state.assetPlan ||
        !state.concreteLayoutPlan ||
        !state.plan
      ) {
        throw new Error(
          "build_execution_scene_summary requires copy/asset/layout/plan state",
        );
      }

      const executionSceneSummary = await buildExecutionSceneSummary(
        state.job.runId,
        state.job.traceId,
        state.job.attemptSeq,
        state.copyPlan,
        state.assetPlan,
        state.concreteLayoutPlan,
        state.plan,
        state.stageAckHistory,
      );
      const suffix = state.refineAttempt > 0 ? `-refine-${state.refineAttempt}` : "";
      const executionSceneSummaryRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/execution-scene-summary${suffix}.json`,
        executionSceneSummary,
        {
          artifactKind: "execution-scene-summary",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      return {
        executionSceneSummary,
        executionSceneSummaryRef,
      };
    })
    .addNode("build_judge_plan", async (state) => {
      if (
        !state.copyPlan ||
        !state.concreteLayoutPlan ||
        !state.executionSceneSummary ||
        !state.plan
      ) {
        throw new Error(
          "build_judge_plan requires copy/layout/execution-scene/plan state",
        );
      }

      const judgePlan = await buildJudgePlan(
        state.job.runId,
        state.job.traceId,
        state.refineAttempt,
        state.copyPlan,
        state.concreteLayoutPlan,
        state.executionSceneSummary,
        state.plan,
        state.ruleJudgeVerdict,
      );
      const suffix = state.refineAttempt > 0 ? `-refine-${state.refineAttempt}` : "";
      const judgePlanRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/judge-plan${suffix}.json`,
        judgePlan,
        {
          artifactKind: "judge-plan",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      return {
        judgePlan,
        judgePlanRef,
      };
    })
    .addNode("decide_refine", async (state) => {
      if (!state.copyPlan || !state.judgePlan || !state.plan) {
        throw new Error("decide_refine requires copy/judge-plan/plan state");
      }

      const refineDecision = await buildRefineDecision(
        state.job.runId,
        state.job.traceId,
        state.refineAttempt,
        state.judgePlan,
        state.copyPlan,
        state.plan,
        state.executionSceneSummary?.finalRevision ?? state.lastMutationAck?.resultingRevision ?? null,
      );
      const suffix = state.refineAttempt > 0 ? `-refine-${state.refineAttempt}` : "";
      const refineDecisionRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/refine-decision${suffix}.json`,
        refineDecision,
        {
          artifactKind: "refine-decision",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      return {
        refineDecision,
        refineDecisionRef,
      };
    })
    .addNode("emit_refinement_patch", async (state) => {
      if (
        !state.hydrated ||
        !state.intent ||
        !state.plan ||
        !state.copyPlan ||
        !state.executionSceneSummary ||
        !state.refineDecision
      ) {
        throw new Error(
          "emit_refinement_patch requires hydrated intent/plan/copy/scene/refine state",
        );
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const heartbeatBase = buildHeartbeatBase(state.job);
      const applyingHeartbeat = await heartbeatTask(state.job.runId, {
        ...heartbeatBase,
        attemptState: "awaiting_ack",
        phase: "applying",
        heartbeatAt: new Date().toISOString(),
      });
      cooperativeStopRequested ||= shouldStopAfterCurrentAction(applyingHeartbeat);

      const nextRefinement = await emitRefinementMutations(
        state.hydrated,
        state.intent,
        state.plan,
        state.copyPlan,
        state.executionSceneSummary,
        state.refineDecision,
        state.lastMutationAck,
        {
          textLayoutHelper: dependencies.textLayoutHelper,
        },
      );
      const refinedPlanRef = await persistArtifactTask(
        `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/executable-plan-refine-${state.refineAttempt + 1}.json`,
        nextRefinement.refinedPlan,
        {
          artifactKind: "executable-plan",
          runId: state.job.runId,
          traceId: state.job.traceId,
          attemptSeq: String(state.job.attemptSeq),
        },
      );

      const refinementLog = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: nextRefinement.proposal ? "info" : "warn",
          message: nextRefinement.proposal
            ? `Prepared patch-only refinement mutation with ${nextRefinement.proposal.mutation.commands.length} commands`
            : "No patch-only refinement mutation was emitted for the current judge plan",
        },
      });
      cooperativeStopRequested ||= refinementLog.cancelRequested;

      if (!nextRefinement.proposal) {
        return {
          cooperativeStopRequested,
          plan: nextRefinement.refinedPlan,
          executablePlanRef: refinedPlanRef,
          currentProposal: null,
          currentMutationId: null,
          lastMutationAck: nextRefinement.lastMutationAck,
          refineAttempt: 1,
        };
      }

      const mutationResponse = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "mutation.proposed",
          mutationId: nextRefinement.proposal.mutationId,
          rollbackGroupId: nextRefinement.proposal.rollbackGroupId,
          mutation: nextRefinement.proposal.mutation,
        },
      });

      if (mutationResponse.cancelRequested) {
        return {
          cooperativeStopRequested: true,
          plan: nextRefinement.refinedPlan,
          executablePlanRef: refinedPlanRef,
          currentProposal: null,
          currentMutationId: null,
          lastMutationAck: {
            found: true,
            status: "cancelled",
          } satisfies WaitMutationAckResponse,
          refineAttempt: 1,
        };
      }

      return {
        cooperativeStopRequested,
        plan: nextRefinement.refinedPlan,
        executablePlanRef: refinedPlanRef,
        emittedMutationIds: [
          ...state.emittedMutationIds,
          nextRefinement.proposal.mutationId,
        ],
        assignedSeqs: [
          ...state.assignedSeqs,
          mutationResponse.assignedSeq ?? nextRefinement.proposal.mutation.seq,
        ],
        currentProposal: nextRefinement.proposal,
        currentMutationId: nextRefinement.proposal.mutationId,
      };
    })
    .addNode("await_refinement_ack", async (state) => {
      if (!state.currentProposal || !state.currentMutationId) {
        throw new Error("await_refinement_ack requires an emitted refinement mutation");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      let lastMutationAck = await waitMutationAckTask(
        state.job.runId,
        state.currentMutationId,
        { waitMs: 15000 },
      );

      const ackLog = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: lastMutationAck.status === "acked" ? "info" : "warn",
          message:
            lastMutationAck.status === "acked"
              ? `Refinement patch result: acked revision=${lastMutationAck.resultingRevision ?? "n/a"}`
              : `Refinement patch result: ${lastMutationAck.status}`,
        },
      });
      cooperativeStopRequested ||= ackLog.cancelRequested;

      return {
        cooperativeStopRequested,
        currentMutationId: null,
        currentProposal: null,
        lastMutationAck,
        stageAckHistory: [
          ...state.stageAckHistory,
          buildStageAckRecord(state.currentProposal, lastMutationAck),
        ],
        refineAttempt: 1,
      };
    });
}
