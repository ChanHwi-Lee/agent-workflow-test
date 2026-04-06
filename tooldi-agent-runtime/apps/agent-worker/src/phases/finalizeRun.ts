import type { WaitMutationAckResponse } from "@tooldi/agent-contracts";

import type { FinalizeRunDraft, HydratedPlanningInput } from "../types.js";

export async function finalizeRun(
  input: HydratedPlanningInput,
  proposedMutationIds: string[],
  lastMutationAck: WaitMutationAckResponse | null,
  options: {
    cooperativeStopRequested?: boolean;
    normalizedIntentRef?: string;
    executablePlanRef?: string;
    assignedSeqs?: number[];
  } = {},
): Promise<FinalizeRunDraft> {
  let finalStatus: FinalizeRunDraft["request"]["finalStatus"] =
    options.cooperativeStopRequested === true ? "cancelled" : "completed";
  let fallbackCount = 0;
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
        errorSummary = {
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
  const latestSaveReceiptId =
    finalStatus === "completed"
      ? `save_receipt_${input.job.runId}_${input.job.attemptSeq}`
      : null;
  const outputTemplateCode =
    latestSaveReceiptId !== null ? `template_${draftId}` : null;

  return {
    request: {
      traceId: input.job.traceId,
      attempt: input.job.attemptSeq,
      queueJobId: input.job.queueJobId,
      finalStatus,
      completionState: deriveCompletionState(finalStatus),
      draftId,
      finalRevision: lastMutationAck?.resultingRevision ?? null,
      lastAckedSeq,
      latestSaveReceiptId,
      outputTemplateCode,
      ...(options.normalizedIntentRef
        ? { normalizedIntentRef: options.normalizedIntentRef }
        : {}),
      ...(options.executablePlanRef
        ? { executablePlanRef: options.executablePlanRef }
        : {}),
      ...(sourceMutationRange ? { sourceMutationRange } : {}),
      createdLayerIds:
        finalStatus === "completed"
          ? proposedMutationIds.map((mutationId) => `layer_${mutationId}`)
          : [],
      updatedLayerIds: [],
      deletedLayerIds: [],
      fallbackCount,
      ...(errorSummary ? { errorSummary } : {}),
    },
    summary: {
      proposedMutationIds,
      finalStatus,
      lastAckedSeq,
    },
  };
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
