import type {
  AgentRunResultSummary,
  RunFinalizeRequest,
  TemplateSaveEvidence,
} from "@tooldi/agent-contracts";

export type MaterializationInput = {
  draftId: string;
  normalizedIntentRef: string;
  normalizedIntentDraftRef: string | null;
  intentNormalizationReportRef: string | null;
  copyPlanRef: string | null;
  copyPlanNormalizationReportRef: string | null;
  abstractLayoutPlanRef: string | null;
  abstractLayoutPlanNormalizationReportRef: string | null;
  assetPlanRef: string | null;
  concreteLayoutPlanRef: string | null;
  templatePriorSummaryRef: string | null;
  searchProfileRef: string | null;
  executablePlanRef: string;
  candidateSetRef: string | null;
  sourceSearchSummaryRef: string | null;
  retrievalStageRef: string | null;
  selectionDecisionRef: string | null;
  typographyDecisionRef: string | null;
  ruleJudgeVerdictRef: string | null;
  executionSceneSummaryRef: string | null;
  judgePlanRef: string | null;
  refineDecisionRef: string | null;
  sourceMutationRange: NonNullable<RunFinalizeRequest["sourceMutationRange"]>;
  latestSaveEvidence: TemplateSaveEvidence | null;
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
    (result.finalStatus === "completed" ||
      result.finalStatus === "completed_with_warning") &&
    !hasCompleteSaveEvidence(request, result)
  ) {
    const warning = {
      code: "save_evidence_incomplete",
      message:
        "Completed status requires canonical save evidence and final revision",
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
    !request.normalizedIntentRef ||
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
      normalizedIntentRef: request.normalizedIntentRef,
      normalizedIntentDraftRef: request.normalizedIntentDraftRef ?? null,
      intentNormalizationReportRef: request.intentNormalizationReportRef ?? null,
      copyPlanRef: request.copyPlanRef ?? null,
      copyPlanNormalizationReportRef:
        request.copyPlanNormalizationReportRef ?? null,
      abstractLayoutPlanRef: request.abstractLayoutPlanRef ?? null,
      abstractLayoutPlanNormalizationReportRef:
        request.abstractLayoutPlanNormalizationReportRef ?? null,
      assetPlanRef: request.assetPlanRef ?? null,
      concreteLayoutPlanRef: request.concreteLayoutPlanRef ?? null,
      templatePriorSummaryRef: request.templatePriorSummaryRef ?? null,
      searchProfileRef: request.searchProfileRef ?? null,
      executablePlanRef: request.executablePlanRef,
      candidateSetRef: request.candidateSetRef ?? null,
      sourceSearchSummaryRef: request.sourceSearchSummaryRef ?? null,
      retrievalStageRef: request.retrievalStageRef ?? null,
      selectionDecisionRef: request.selectionDecisionRef ?? null,
      typographyDecisionRef: request.typographyDecisionRef ?? null,
      ruleJudgeVerdictRef: request.ruleJudgeVerdictRef ?? null,
      executionSceneSummaryRef: request.executionSceneSummaryRef ?? null,
      judgePlanRef: request.judgePlanRef ?? null,
      refineDecisionRef: request.refineDecisionRef ?? null,
      sourceMutationRange: request.sourceMutationRange,
      latestSaveEvidence: request.latestSaveEvidence ?? null,
    },
  };
}

function hasCompleteSaveEvidence(
  request: RunFinalizeRequest,
  result: AgentRunResultSummary,
): boolean {
  return (
    (request.latestSaveEvidence ?? null) !== null &&
    result.finalRevision !== null
  );
}
