import type {
  TemplateSaveEvidence,
  TemplateSaveReceipt,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";

import type { FinalizeRunDraft, HydratedPlanningInput } from "../types.js";

export async function finalizeRun(
  input: HydratedPlanningInput,
  proposedMutationIds: string[],
  lastMutationAck: WaitMutationAckResponse | null,
  options: {
    cooperativeStopRequested?: boolean;
    canonicalDesignBriefRef?: string;
    semanticBriefDraftRef?: string;
    briefCompilationReportRef?: string;
    executablePlanRef?: string;
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
  let errorSummary: FinalizeRunDraft["request"]["errorSummary"] | undefined;

  if (options.cooperativeStopRequested !== true) {
    switch (lastMutationAck?.status) {
      case "cancelled":
        finalStatus = "cancelled";
        break;
      case "rejected":
        finalStatus = "failed";
        errorSummary = lastMutationAck.error ?? {
          code: "mutation_rejected",
          message:
            "Skeleton mutation was rejected by the backend/editor handshake",
        };
        break;
      case "timed_out":
        finalStatus = "failed";
        fallbackCount = 1;
        errorSummary = {
          code: "mutation_ack_timed_out",
          message:
            "Worker could not confirm mutation apply within the long-poll window",
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

  const lastAckedSeq =
    lastMutationAck?.status === "acked" ? (lastMutationAck.seq ?? 0) : 0;
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
    finalStatus === "completed" ? extractSaveEvidence(lastMutationAck) : null;
  const latestSaveReceipt =
    finalStatus === "completed" ? extractSaveReceipt(lastMutationAck) : null;
  if (
    finalStatus === "completed" &&
    (latestSaveEvidence === null || latestSaveReceipt === null)
  ) {
    finalStatus = "save_failed_after_apply";
    fallbackCount = Math.max(fallbackCount, 1);
    errorSummary ??= buildSaveTruthErrorSummary(
      latestSaveEvidence,
      latestSaveReceipt,
    );
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
      latestSaveReceipt,
      lastAckedSeq,
      outputTemplateCode: latestSaveReceipt?.outputTemplateCode ?? null,
      ...(options.canonicalDesignBriefRef
        ? { canonicalDesignBriefRef: options.canonicalDesignBriefRef }
        : {}),
      ...(options.semanticBriefDraftRef
        ? { semanticBriefDraftRef: options.semanticBriefDraftRef }
        : {}),
      ...(options.briefCompilationReportRef
        ? { briefCompilationReportRef: options.briefCompilationReportRef }
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

function extractSaveReceipt(
  lastMutationAck: WaitMutationAckResponse | null,
): TemplateSaveReceipt | null {
  return (
    lastMutationAck?.commandResults?.find(
      (commandResult) =>
        commandResult.op === "saveTemplate" &&
        commandResult.saveReceipt !== undefined,
    )?.saveReceipt ?? null
  );
}

function buildSaveTruthErrorSummary(
  latestSaveEvidence: TemplateSaveEvidence | null,
  latestSaveReceipt: TemplateSaveReceipt | null,
): NonNullable<FinalizeRunDraft["request"]["errorSummary"]> {
  if (latestSaveEvidence === null && latestSaveReceipt === null) {
    return {
      code: "save_truth_missing",
      message:
        "Worker could not confirm canonical save evidence or save receipt after the saveTemplate stage completed",
    };
  }

  if (latestSaveEvidence === null) {
    return {
      code: "save_evidence_missing",
      message:
        "Worker could not confirm canonical save evidence after the saveTemplate stage completed",
    };
  }

  return {
    code: "save_receipt_missing",
    message:
      "Worker could not confirm canonical save receipt after the saveTemplate stage completed",
  };
}

function deriveCompletionState(
  finalStatus: FinalizeRunDraft["request"]["finalStatus"],
): NonNullable<FinalizeRunDraft["request"]["completionState"]> {
  switch (finalStatus) {
    case "completed":
      return "editable_draft_ready";
    case "save_failed_after_apply":
      return "save_failed_after_apply";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      throw new Error(`Unsupported final status: ${finalStatus}`);
  }
}
