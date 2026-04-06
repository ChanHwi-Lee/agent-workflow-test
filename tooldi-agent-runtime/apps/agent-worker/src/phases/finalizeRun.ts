import type { WaitMutationAckResponse } from "@tooldi/agent-contracts";

import type { FinalizeRunDraft, HydratedPlanningInput } from "../types.js";

export async function finalizeRun(
  input: HydratedPlanningInput,
  proposedMutationIds: string[],
  lastMutationAck: WaitMutationAckResponse | null,
  options: {
    cooperativeStopRequested?: boolean;
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

  return {
    request: {
      traceId: input.job.traceId,
      attempt: input.job.attemptSeq,
      queueJobId: input.job.queueJobId,
      finalStatus,
      finalRevision: lastMutationAck?.resultingRevision ?? null,
      lastAckedSeq,
      latestSaveReceiptId: null,
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
