import type {
  AgentRunResultSummary,
  RunFinalizeRequest,
  TemplateSaveEvidence,
  TemplateSaveReceipt,
} from "@tooldi/agent-contracts";

export type MaterializationInput = {
  draftId: string;
  canonicalDesignBriefRef: string;
  semanticBriefDraftRef: string | null;
  briefCompilationReportRef: string | null;
  executablePlanRef: string;
  sourceMutationRange: NonNullable<RunFinalizeRequest["sourceMutationRange"]>;
  latestSaveEvidence: TemplateSaveEvidence | null;
  latestSaveReceipt: TemplateSaveReceipt | null;
};

type NormalizeFinalizeInputCommand = {
  request?: RunFinalizeRequest;
  result: AgentRunResultSummary;
};

export function normalizeFinalizeInput(
  command: NormalizeFinalizeInputCommand,
): {
  result: AgentRunResultSummary;
  materialization: MaterializationInput | null;
} {
  const request = command.request;
  let result = command.result;

  if (
    request &&
    result.finalStatus === "completed" &&
    !hasCompleteSaveEvidence(request, result)
  ) {
    const warning = {
      code: "save_evidence_incomplete",
      message:
        "Completed status requires canonical save evidence, save receipt, and final revision",
    };
    const warnings = [...result.warnings, warning];
    result = {
      ...result,
      finalStatus: "save_failed_after_apply",
      durabilityState: "save_uncertain",
      latestSaveEvidence: null,
      latestSaveReceiptId: null,
      warningCount: warnings.length,
      warnings,
      errorSummary: result.errorSummary ?? warning,
    };
  }

  if (
    !request ||
    !request.draftId ||
    !request.canonicalDesignBriefRef ||
    !request.executablePlanRef ||
    !request.sourceMutationRange
  ) {
    return {
      result,
      materialization: null,
    };
  }

  return {
    result,
    materialization: {
      draftId: request.draftId,
      canonicalDesignBriefRef: request.canonicalDesignBriefRef,
      semanticBriefDraftRef: request.semanticBriefDraftRef ?? null,
      briefCompilationReportRef: request.briefCompilationReportRef ?? null,
      executablePlanRef: request.executablePlanRef,
      sourceMutationRange: request.sourceMutationRange,
      latestSaveEvidence: request.latestSaveEvidence ?? null,
      latestSaveReceipt: request.latestSaveReceipt,
    },
  };
}

function hasCompleteSaveEvidence(
  request: RunFinalizeRequest,
  result: AgentRunResultSummary,
): boolean {
  return (
    (request.latestSaveEvidence ?? null) !== null &&
    request.latestSaveReceipt !== null &&
    result.finalRevision !== null
  );
}
