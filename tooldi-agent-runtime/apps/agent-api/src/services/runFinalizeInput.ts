import type {
  AgentRunResultSummary,
  ExecutionSlotKey,
  RunFinalizeRequest,
  TemplateSaveEvidence,
  TemplateSaveReceipt,
} from "@tooldi/agent-contracts";

type TopologyCompletionContract = {
  topologyId: string;
  requiredCapabilityIds: string[];
  minimumEditableTextCapabilityCount: number;
  requiresActionCapability: boolean;
  requiresMediaCapability: boolean;
};

type TopologyAwareRunFinalizeRequest = RunFinalizeRequest & {
  topologyMatchReportRef?: string;
  topologySelectionRef?: string;
  topologyBindingPlanRef?: string;
  topologyExecutionPlanRef?: string;
  topologyCompletionReportRef?: string;
  selectedTopologyId?: string | null;
  topologyCompletionContract?: TopologyCompletionContract | null;
};

export type MaterializationInput = {
  draftId: string;
  canonicalDesignBriefRef: string;
  semanticBriefDraftRef: string | null;
  briefCompilationReportRef: string | null;
  copyPlanRef: string | null;
  copyPlanNormalizationReportRef: string | null;
  abstractLayoutPlanRef: string | null;
  abstractLayoutPlanNormalizationReportRef: string | null;
  assetPlanRef: string | null;
  concreteLayoutPlanRef: string | null;
  templatePriorSummaryRef: string | null;
  templatePriorBundleRef: string | null;
  sceneRolePlanRef: string | null;
  sceneLayoutPlanRef: string | null;
  sceneStylePlanRef: string | null;
  sceneBindingPlanRef: string | null;
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
  topologyMatchReportRef: string | null;
  topologySelectionRef: string | null;
  topologyBindingPlanRef: string | null;
  topologyExecutionPlanRef: string | null;
  topologyCompletionReportRef: string | null;
  sourceMutationRange: NonNullable<RunFinalizeRequest["sourceMutationRange"]>;
  latestSaveEvidence: TemplateSaveEvidence | null;
  latestSaveReceipt: TemplateSaveReceipt | null;
  requiredExecutionSlots: ExecutionSlotKey[];
  selectedTopologyId: string | null;
  topologyCompletionContract: TopologyCompletionContract | null;
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
  const request = command.request as TopologyAwareRunFinalizeRequest | undefined;
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
      copyPlanRef: request.copyPlanRef ?? null,
      copyPlanNormalizationReportRef:
        request.copyPlanNormalizationReportRef ?? null,
      abstractLayoutPlanRef: request.abstractLayoutPlanRef ?? null,
      abstractLayoutPlanNormalizationReportRef:
        request.abstractLayoutPlanNormalizationReportRef ?? null,
      assetPlanRef: request.assetPlanRef ?? null,
      concreteLayoutPlanRef: request.concreteLayoutPlanRef ?? null,
      templatePriorSummaryRef: request.templatePriorSummaryRef ?? null,
      templatePriorBundleRef: request.templatePriorBundleRef ?? null,
      sceneRolePlanRef: request.sceneRolePlanRef ?? null,
      sceneLayoutPlanRef: request.sceneLayoutPlanRef ?? null,
      sceneStylePlanRef: request.sceneStylePlanRef ?? null,
      sceneBindingPlanRef: request.sceneBindingPlanRef ?? null,
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
      topologyMatchReportRef: request.topologyMatchReportRef ?? null,
      topologySelectionRef: request.topologySelectionRef ?? null,
      topologyBindingPlanRef: request.topologyBindingPlanRef ?? null,
      topologyExecutionPlanRef: request.topologyExecutionPlanRef ?? null,
      topologyCompletionReportRef: request.topologyCompletionReportRef ?? null,
      sourceMutationRange: request.sourceMutationRange,
      latestSaveEvidence: request.latestSaveEvidence ?? null,
      latestSaveReceipt: request.latestSaveReceipt ?? null,
      requiredExecutionSlots: request.requiredExecutionSlots ?? [],
      selectedTopologyId: request.selectedTopologyId ?? null,
      topologyCompletionContract: request.topologyCompletionContract ?? null,
    },
  };
}

function hasCompleteSaveEvidence(
  request: RunFinalizeRequest,
  result: AgentRunResultSummary,
): boolean {
  return (
    (request.latestSaveEvidence ?? null) !== null &&
    ((request.latestSaveReceipt ?? null) !== null ||
      result.latestSaveReceiptId !== null) &&
    result.finalRevision !== null
  );
}
