import type {
  TemplateSaveEvidence,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";

import type { FinalizeRunDraft, HydratedPlanningInput } from "../types.js";

export async function finalizeRun(
  input: HydratedPlanningInput,
  proposedMutationIds: string[],
  lastMutationAck: WaitMutationAckResponse | null,
  options: {
    cooperativeStopRequested?: boolean;
    normalizedIntentRef?: string;
    normalizedIntentDraftRef?: string;
    intentNormalizationReportRef?: string;
    copyPlanRef?: string;
    copyPlanNormalizationReportRef?: string;
    abstractLayoutPlanRef?: string;
    abstractLayoutPlanNormalizationReportRef?: string;
    assetPlanRef?: string;
    concreteLayoutPlanRef?: string;
    templatePriorSummaryRef?: string;
    searchProfileRef?: string;
    executablePlanRef?: string;
    candidateSetRef?: string;
    sourceSearchSummaryRef?: string;
    retrievalStageRef?: string;
    selectionDecisionRef?: string;
    typographyDecisionRef?: string;
    ruleJudgeVerdictRef?: string;
    executionSceneSummaryRef?: string;
    judgePlanRef?: string;
    refineDecisionRef?: string;
    warningSummary?: Array<{
      code: string;
      message: string;
    }>;
    assignedSeqs?: number[];
    overrideResult?: {
      finalStatus: FinalizeRunDraft["request"]["finalStatus"];
      errorSummary?: FinalizeRunDraft["request"]["errorSummary"];
      fallbackCount?: number;
    };
  } = {},
): Promise<FinalizeRunDraft> {
  let finalStatus: FinalizeRunDraft["request"]["finalStatus"] =
    options.cooperativeStopRequested === true ? "cancelled" : "completed";
  let fallbackCount = 0;
  let warnings = options.warningSummary ?? [];
  let errorSummary:
    | FinalizeRunDraft["request"]["errorSummary"]
    | undefined;

  if (options.cooperativeStopRequested !== true) {
    switch (lastMutationAck?.status) {
      case "cancelled":
        finalStatus = "cancelled";
        break;
      case "rejected":
        finalStatus = "failed";
        errorSummary =
          lastMutationAck.error ?? {
            code: "mutation_rejected",
            message: "Skeleton mutation was rejected by the backend/editor handshake",
          };
        break;
      case "timed_out":
        finalStatus = "failed";
        fallbackCount = 1;
        errorSummary = {
          code: "mutation_ack_timed_out",
          message: "Worker could not confirm mutation apply within the long-poll window",
        };
        break;
      case "dispatched":
        finalStatus = "failed";
        errorSummary = {
          code: "mutation_ack_unconfirmed",
          message: "Worker finalized before a mutation apply ack was confirmed",
        };
        break;
      case "acked":
      case null:
      case undefined:
        break;
    }
  }

  if (options.overrideResult) {
    finalStatus = options.overrideResult.finalStatus;
    errorSummary = options.overrideResult.errorSummary;
    fallbackCount = options.overrideResult.fallbackCount ?? fallbackCount;
  }

  if (finalStatus === "completed" && warnings.length > 0) {
    finalStatus = "completed_with_warning";
  }

  const lastAckedSeq = lastMutationAck?.status === "acked" ? lastMutationAck.seq ?? 0 : 0;
  const draftId = `draft_${input.job.runId}`;
  const assignedSeqs = options.assignedSeqs ?? [];
  const sourceMutationRange =
    assignedSeqs.length > 0
      ? {
          firstSeq: Math.min(...assignedSeqs),
          lastSeq: Math.max(...assignedSeqs),
          reconciledThroughSeq: lastAckedSeq,
        }
      : undefined;
  const latestSaveEvidence =
    finalStatus === "completed" || finalStatus === "completed_with_warning"
      ? extractSaveEvidence(lastMutationAck)
      : null;

  if (
    (finalStatus === "completed" || finalStatus === "completed_with_warning") &&
    latestSaveEvidence === null
  ) {
    finalStatus = "save_failed_after_apply";
    fallbackCount = Math.max(fallbackCount, 1);
    errorSummary ??= {
      code: "save_evidence_missing",
      message:
        "Worker could not confirm canonical save evidence after the saveTemplate stage completed",
    };
  }

  return {
    request: {
      traceId: input.job.traceId,
      attempt: input.job.attemptSeq,
      queueJobId: input.job.queueJobId,
      finalStatus,
      completionState: deriveCompletionState(finalStatus),
      draftId,
      finalRevision: lastMutationAck?.resultingRevision ?? null,
      latestSaveEvidence,
      lastAckedSeq,
      latestSaveReceiptId: null,
      outputTemplateCode: null,
      ...(options.normalizedIntentRef
        ? { normalizedIntentRef: options.normalizedIntentRef }
        : {}),
      ...(options.normalizedIntentDraftRef
        ? { normalizedIntentDraftRef: options.normalizedIntentDraftRef }
        : {}),
      ...(options.intentNormalizationReportRef
        ? { intentNormalizationReportRef: options.intentNormalizationReportRef }
        : {}),
      ...(options.copyPlanRef ? { copyPlanRef: options.copyPlanRef } : {}),
      ...(options.copyPlanNormalizationReportRef
        ? { copyPlanNormalizationReportRef: options.copyPlanNormalizationReportRef }
        : {}),
      ...(options.abstractLayoutPlanRef
        ? { abstractLayoutPlanRef: options.abstractLayoutPlanRef }
        : {}),
      ...(options.abstractLayoutPlanNormalizationReportRef
        ? {
            abstractLayoutPlanNormalizationReportRef:
              options.abstractLayoutPlanNormalizationReportRef,
          }
        : {}),
      ...(options.assetPlanRef ? { assetPlanRef: options.assetPlanRef } : {}),
      ...(options.concreteLayoutPlanRef
        ? { concreteLayoutPlanRef: options.concreteLayoutPlanRef }
        : {}),
      ...(options.templatePriorSummaryRef
        ? { templatePriorSummaryRef: options.templatePriorSummaryRef }
        : {}),
      ...(options.searchProfileRef
        ? { searchProfileRef: options.searchProfileRef }
        : {}),
      ...(options.executablePlanRef
        ? { executablePlanRef: options.executablePlanRef }
        : {}),
      ...(options.candidateSetRef ? { candidateSetRef: options.candidateSetRef } : {}),
      ...(options.sourceSearchSummaryRef
        ? { sourceSearchSummaryRef: options.sourceSearchSummaryRef }
        : {}),
      ...(options.retrievalStageRef
        ? { retrievalStageRef: options.retrievalStageRef }
        : {}),
      ...(options.selectionDecisionRef
        ? { selectionDecisionRef: options.selectionDecisionRef }
        : {}),
      ...(options.typographyDecisionRef
        ? { typographyDecisionRef: options.typographyDecisionRef }
        : {}),
      ...(options.ruleJudgeVerdictRef
        ? { ruleJudgeVerdictRef: options.ruleJudgeVerdictRef }
        : {}),
      ...(options.executionSceneSummaryRef
        ? { executionSceneSummaryRef: options.executionSceneSummaryRef }
        : {}),
      ...(options.judgePlanRef ? { judgePlanRef: options.judgePlanRef } : {}),
      ...(options.refineDecisionRef
        ? { refineDecisionRef: options.refineDecisionRef }
        : {}),
      ...(sourceMutationRange ? { sourceMutationRange } : {}),
      createdLayerIds:
        finalStatus === "completed" || finalStatus === "completed_with_warning"
          ? proposedMutationIds.map((mutationId) => `layer_${mutationId}`)
          : [],
      updatedLayerIds: [],
      deletedLayerIds: [],
      fallbackCount,
      ...(warnings.length > 0 ? { warnings } : {}),
      ...(errorSummary ? { errorSummary } : {}),
    },
    summary: {
      proposedMutationIds,
      finalStatus,
      lastAckedSeq,
    },
  };
}

function extractSaveEvidence(
  lastMutationAck: WaitMutationAckResponse | null,
): TemplateSaveEvidence | null {
  return (
    lastMutationAck?.commandResults?.find(
      (commandResult) =>
        commandResult.op === "saveTemplate" &&
        commandResult.saveEvidence !== undefined,
    )?.saveEvidence ?? null
  );
}

function deriveCompletionState(
  finalStatus: FinalizeRunDraft["request"]["finalStatus"],
): NonNullable<FinalizeRunDraft["request"]["completionState"]> {
  switch (finalStatus) {
    case "completed":
      return "editable_draft_ready";
    case "completed_with_warning":
      return "editable_draft_ready_with_warning";
    case "save_failed_after_apply":
      return "save_failed_after_apply";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
  }
}
