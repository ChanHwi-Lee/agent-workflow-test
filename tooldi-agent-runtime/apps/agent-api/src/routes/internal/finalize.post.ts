import type { FastifyPluginAsync } from "fastify";

import type {
  AgentRunResultSummary,
  RunIdParams,
  RunFinalizeRequest,
  WorkerFinalizeResponse,
} from "@tooldi/agent-contracts";
import {
  RunIdParamsSchema,
  RunFinalizeRequestSchema,
  WorkerFinalizeResponseSchema,
} from "@tooldi/agent-contracts";

interface FinalizePostRoute {
  Params: RunIdParams;
  Body: RunFinalizeRequest;
  Reply: WorkerFinalizeResponse;
}

export const finalizePostRoute: FastifyPluginAsync = async (app) => {
  app.post<FinalizePostRoute>(
    "/internal/agent-workflow/runs/:runId/finalize",
    {
      schema: {
        params: RunIdParamsSchema,
        body: RunFinalizeRequestSchema,
        response: {
          200: WorkerFinalizeResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const finalized = await app.services.runFinalizeService.finalizeRun({
        runId: request.params.runId,
        traceId: request.body.traceId,
        attemptSeq: request.body.attempt,
        queueJobId: request.body.queueJobId,
        result: toAgentRunResultSummary(request.body),
        request: request.body,
        at: new Date().toISOString(),
      });

      return reply.code(200).send({
        accepted: finalized.accepted,
        runStatus: finalized.runStatus,
        ...(finalized.completionRecordRef
          ? { completionRecordRef: finalized.completionRecordRef }
          : {}),
      });
    },
  );
};

function toAgentRunResultSummary(request: RunFinalizeRequest): AgentRunResultSummary {
  const warnings =
    request.warnings ??
    (request.finalStatus === "completed_with_warning"
      ? [
          {
            code: "completed_with_warning_placeholder",
            message:
              "Worker finalized with warning details that will be expanded in a later step",
          },
        ]
      : []);

  return {
    finalStatus: request.finalStatus,
    draftId: request.draftId ?? null,
    finalRevision: request.finalRevision ?? null,
    latestSaveEvidence: request.latestSaveEvidence ?? null,
    durabilityState: deriveDurabilityState(
      request.finalStatus,
      request.latestSaveEvidence ?? null,
    ),
    latestSaveReceiptId: request.latestSaveReceiptId ?? null,
    warningCount: warnings.length,
    fallbackCount: request.fallbackCount,
    warnings,
    errorSummary: request.errorSummary ?? null,
  };
}

function deriveDurabilityState(
  finalStatus: RunFinalizeRequest["finalStatus"],
  latestSaveEvidence: AgentRunResultSummary["latestSaveEvidence"],
): AgentRunResultSummary["durabilityState"] {
  if (latestSaveEvidence) {
    if (finalStatus === "completed" || finalStatus === "completed_with_warning") {
      return "final_saved";
    }
    return "milestone_saved";
  }

  if (finalStatus === "save_failed_after_apply") {
    return "save_uncertain";
  }

  return "no_saved_draft";
}
