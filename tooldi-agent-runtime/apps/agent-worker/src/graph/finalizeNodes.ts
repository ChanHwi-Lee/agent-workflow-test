import { createRequestId } from "@tooldi/agent-domain";
import type { StateGraph } from "@langchain/langgraph";
import type { WaitMutationAckResponse } from "@tooldi/agent-contracts";

import { finalizeRun } from "../phases/finalizeRun.js";
import type { ProcessRunJobResult } from "../types.js";
import { buildArtifactRefs, buildFinalizeOptions, buildHeartbeatBase, buildStageAckRecord } from "./graphHelpers.js";
import { buildSaveTemplateCommand } from "../phases/layerCommandBuilder.js";
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
    appendEventTask,
    waitMutationAckTask,
    finalizeTask,
  } = tasks;

  return graph
    .addNode("emit_save_stage", async (state) => {
      if (!state.hydrated || !state.plan) {
        throw new Error("emit_save_stage requires hydrated plan state");
      }

      const nextSeq =
        (state.assignedSeqs[state.assignedSeqs.length - 1] ?? 0) + 1;
      const mutationId = createRequestId();
      const rollbackGroupId = createRequestId();
      const proposal = {
        mutationId,
        rollbackGroupId,
        stageLabel: "save",
        stageDescription:
          "Persist the current editable draft through the editor save path",
        mutation: {
          mutationId,
          mutationVersion: "v1",
          traceId: state.job.traceId,
          runId: state.job.runId,
          draftId: `draft_${state.job.runId}`,
          documentId: state.hydrated.request.editorContext.documentId,
          pageId: state.hydrated.request.editorContext.pageId,
          seq: nextSeq,
          commitGroup: state.plan.actions[0]?.commitGroup ?? createRequestId(),
          dependsOnSeq: state.lastMutationAck?.seq ?? nextSeq - 1,
          idempotencyKey: `mutation_save_${state.job.runId}_${state.job.attemptSeq}`,
          expectedBaseRevision:
            state.lastMutationAck?.resultingRevision ?? nextSeq - 1,
          ownershipScope: "draft_only" as const,
          commands: [buildSaveTemplateCommand("save", "run_completed")],
          rollbackHint: {
            rollbackGroupId,
            strategy: "delete_created_layers" as const,
          },
          emittedAt: new Date().toISOString(),
          deliveryDeadlineAt: new Date(Date.now() + 10000).toISOString(),
        },
      };

      const stageLog = await appendEventTask(state.job.runId, {
        traceId: state.job.traceId,
        attempt: state.job.attemptSeq,
        queueJobId: state.job.queueJobId,
        event: {
          type: "log",
          level: "info",
          message: "Stage save - Persist the current editable draft",
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
          cooperativeStopRequested: true,
          currentProposal: null,
          currentMutationId: null,
          lastMutationAck: {
            found: true,
            status: "cancelled",
          } satisfies WaitMutationAckResponse,
        };
      }

      return {
        currentProposal: proposal,
        currentMutationId: proposal.mutationId,
        emittedMutationIds: [...state.emittedMutationIds, proposal.mutationId],
        assignedSeqs: [
          ...state.assignedSeqs,
          mutationResponse.assignedSeq ?? proposal.mutation.seq,
        ],
      };
    })
    .addNode("await_save_ack", async (state) => {
      if (!state.currentProposal || !state.currentMutationId) {
        throw new Error("await_save_ack requires an emitted save mutation");
      }

      let cooperativeStopRequested = state.cooperativeStopRequested;
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
              ? `Save stage result: rejected code=${lastMutationAck.error.code} message=${lastMutationAck.error.message}`
              : `Save stage result: ${lastMutationAck.status}`,
        },
      });
      if (ackLog.cancelRequested) {
        cooperativeStopRequested = true;
        lastMutationAck = {
          found: true,
          status: "cancelled",
        } satisfies WaitMutationAckResponse;
      }

      return {
        cooperativeStopRequested,
        lastMutationAck,
        currentMutationId: null,
        currentProposal: null,
        stageAckHistory: [
          ...state.stageAckHistory,
          buildStageAckRecord(state.currentProposal, lastMutationAck),
        ],
      };
    })
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
        state.stageAckHistory
          .filter((record) =>
            record.commands.some((command) => command.op !== "saveTemplate"),
          )
          .map((record) => record.mutationId),
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
