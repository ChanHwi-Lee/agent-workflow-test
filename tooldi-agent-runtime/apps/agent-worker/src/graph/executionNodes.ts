import type { StateGraph } from "@langchain/langgraph";
import type { WaitMutationAckResponse } from "@tooldi/agent-contracts";

import { emitSkeletonMutations } from "../phases/emitSkeletonMutations.js";
import { buildHeartbeatBase, buildStageAckRecord } from "./graphHelpers.js";
import { shouldStopAfterCurrentAction } from "./nodeUtils.js";
import { RunJobGraphState } from "./runJobGraphState.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";
import type { createRunJobGraphTasks } from "./graphTasks.js";

export function registerExecutionNodes(
  graph: StateGraph<typeof RunJobGraphState>,
  dependencies: RunJobGraphDependencies,
  tasks: ReturnType<typeof createRunJobGraphTasks>,
) {
  const {
    heartbeatTask,
    appendEventTask,
    waitMutationAckTask,
  } = tasks;

  return graph
    .addNode("prepare_execution", async (state) => {
      if (!state.hydrated || !state.intent || !state.plan) {
        throw new Error("prepare_execution requires resolved plan state");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const heartbeatBase = buildHeartbeatBase(state.job);

      const executingHeartbeat = await heartbeatTask(state.job.runId, {
        ...heartbeatBase,
        attemptState: "running",
        phase: "executing",
        heartbeatAt: new Date().toISOString(),
      });
      cooperativeStopRequested ||= shouldStopAfterCurrentAction(executingHeartbeat);

      const executingEvent = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "phase",
          phase: "executing",
          message: "Worker is emitting staged canvas mutations",
        },
      });
      cooperativeStopRequested ||= executingEvent.cancelRequested;

      const skeletonBatch = cooperativeStopRequested
        ? {
            commitGroup:
              state.plan.actions[0]?.commitGroup ?? "cancelled_before_mutation",
            proposals: [],
          }
        : await emitSkeletonMutations(state.hydrated, state.intent, state.plan, {
            textLayoutHelper: dependencies.textLayoutHelper,
          });

      return {
        cooperativeStopRequested,
        skeletonBatch,
        currentStageIndex: 0,
        currentProposal: skeletonBatch.proposals[0] ?? null,
        currentMutationId: null,
        lastMutationAck: cooperativeStopRequested
          ? ({
              found: true,
              status: "cancelled",
            } satisfies WaitMutationAckResponse)
          : null,
        emittedMutationIds: [],
        assignedSeqs: [],
        stageAckHistory: [],
        refineAttempt: 0,
        executionSceneSummary: null,
        executionSceneSummaryRef: null,
        judgePlan: null,
        judgePlanRef: null,
        refineDecision: null,
        refineDecisionRef: null,
      };
    })
    .addNode("emit_stage", async (state) => {
      if (!state.currentProposal || !state.skeletonBatch) {
        throw new Error("emit_stage requires an active mutation proposal");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const proposal = state.currentProposal;
      const totalStages = state.skeletonBatch.proposals.length;

      const stageLog = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: "info",
          message: `Stage ${proposal.mutation.seq}/${totalStages} (${proposal.stageLabel}) - ${proposal.stageDescription}`,
        },
      });
      if (stageLog.cancelRequested) {
        return {
          cooperativeStopRequested: true,
          currentMutationId: null,
          lastMutationAck: {
            found: true,
            status: "cancelled",
          } satisfies WaitMutationAckResponse,
        };
      }

      if (proposal.stageLabel === "photo") {
        const heroCommand = proposal.mutation.commands.find(
          (command) =>
            command.op === "createLayer" &&
            "executionSlotKey" in command &&
            command.executionSlotKey === "hero_image",
        );
        const bounds =
          heroCommand && "layerBlueprint" in heroCommand
            ? heroCommand.layerBlueprint.bounds
            : null;
        const photoStageLog = await appendEventTask(state.job.runId, {
          traceId: state.job.traceId,
          attempt: state.job.attemptSeq,
          queueJobId: state.job.queueJobId,
          event: {
            type: "log",
            level: "info",
            message:
              `[source/photo-stage] seq=${proposal.mutation.seq} ` +
              `heroBounds=${bounds ? `${bounds.x},${bounds.y},${bounds.width},${bounds.height}` : "n/a"}`,
          },
        });
        if (photoStageLog.cancelRequested) {
          return {
            cooperativeStopRequested: true,
            currentMutationId: null,
            lastMutationAck: {
              found: true,
              status: "cancelled",
            } satisfies WaitMutationAckResponse,
          };
        }
      }

      const emittedMutationIds = [...state.emittedMutationIds, proposal.mutationId];
      const mutationResponse = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "mutation.proposed",
          mutationId: proposal.mutationId,
          rollbackGroupId: proposal.rollbackGroupId,
          mutation: proposal.mutation,
        },
      });

      if (mutationResponse.cancelRequested) {
        return {
          emittedMutationIds,
          cooperativeStopRequested: true,
          currentMutationId: null,
          lastMutationAck: {
            found: true,
            status: "cancelled",
          } satisfies WaitMutationAckResponse,
        };
      }

      return {
        emittedMutationIds,
        assignedSeqs: [
          ...state.assignedSeqs,
          mutationResponse.assignedSeq ?? proposal.mutation.seq,
        ],
        currentMutationId: proposal.mutationId,
      };
    })
    .addNode("await_stage_ack", async (state) => {
      if (!state.currentProposal || !state.currentMutationId || !state.skeletonBatch) {
        throw new Error("await_stage_ack requires an emitted mutation");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
      const proposal = state.currentProposal;
      const totalStages = state.skeletonBatch.proposals.length;
      let lastMutationAck = await waitMutationAckTask(
        state.job.runId,
        state.currentMutationId,
        { waitMs: 15000 },
      );

      if (lastMutationAck.status === "cancelled") {
        cooperativeStopRequested = true;
      }

      const ackLog = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
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
        } satisfies WaitMutationAckResponse;
      }

      if (lastMutationAck.status !== "acked") {
        const failFastLog = await appendEventTask(state.job.runId, {
          traceId: state.job.traceId,
          attempt: state.job.attemptSeq,
          queueJobId: state.job.queueJobId,
          event: {
            type: "log",
            level: "warn",
            message:
              proposal.stageLabel === "photo"
                ? "Fail-fast policy stopped remaining stages after the photo stage was not acknowledged"
                : `Stopped remaining stages after ${proposal.stageLabel} stage returned ${lastMutationAck.status}`,
          },
        });
        cooperativeStopRequested ||= failFastLog.cancelRequested;
      }

      return {
        cooperativeStopRequested,
        lastMutationAck,
        stageAckHistory: [
          ...state.stageAckHistory,
          buildStageAckRecord(proposal, lastMutationAck),
        ],
      };
    })
    .addNode("advance_after_ack", async (state) => {
      if (!state.skeletonBatch) {
        throw new Error("advance_after_ack requires skeleton batch state");
      }

      if (state.lastMutationAck?.status !== "acked") {
        return {
          currentMutationId: null,
          currentProposal: null,
        };
      }

      const nextStageIndex = state.currentStageIndex + 1;
      return {
        currentStageIndex: nextStageIndex,
        currentMutationId: null,
        currentProposal: state.skeletonBatch.proposals[nextStageIndex] ?? null,
      };
    });
}
