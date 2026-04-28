import type {
  RunJobEnvelope,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";

import type {
  FinalizeRunDraft,
  JudgePlan,
  ProcessRunJobResult,
  RuleJudgeVerdict,
  StageAckRecord,
  MutationProposalDraft as WorkerMutationProposalDraft,
  WorkflowVariant,
} from "../types.js";

const FINALIZE_ARTIFACT_REF_KEYS = [
  "briefCompilationReportRef",
  "copyPlanRef",
  "copyPlanNormalizationReportRef",
  "abstractLayoutPlanRef",
  "abstractLayoutPlanNormalizationReportRef",
  "assetPlanRef",
  "concreteLayoutPlanRef",
  "templatePriorSummaryRef",
  "templatePriorBundleRef",
  "sceneRolePlanRef",
  "sceneLayoutPlanRef",
  "sceneStylePlanRef",
  "sceneBindingPlanRef",
  "searchProfileRef",
  "executablePlanRef",
  "candidateSetRef",
  "sourceSearchSummaryRef",
  "retrievalStageRef",
  "selectionDecisionRef",
  "typographyDecisionRef",
  "ruleJudgeVerdictRef",
  "executionSceneSummaryRef",
  "judgePlanRef",
  "refineDecisionRef",
] as const;

const RESULT_ONLY_ARTIFACT_REF_KEYS = [
  "compositionBriefRef",
  "compositionVariantSetRef",
  "compositionRankingRef",
] as const;

const RESULT_ARTIFACT_REF_KEYS = [
  ...FINALIZE_ARTIFACT_REF_KEYS,
  ...RESULT_ONLY_ARTIFACT_REF_KEYS,
] as const;

type ResultArtifactRefKey = (typeof RESULT_ARTIFACT_REF_KEYS)[number];

type ArtifactRefState = {
  canonicalDesignBriefRef: string | null;
  workflowVariant?: WorkflowVariant | null;
  ruleJudgeVerdict: RuleJudgeVerdict | null;
  judgePlan: JudgePlan | null;
} & Record<ResultArtifactRefKey, string | null>;

export function buildHeartbeatBase(job: RunJobEnvelope) {
  return {
    traceId: job.traceId,
    attempt: job.attemptSeq,
    queueJobId: job.queueJobId,
    workerId: "agent-worker-langgraph",
  } as const;
}

export function buildFinalizeOptions(
  state: ArtifactRefState,
  cooperativeStopRequested: boolean,
  assignedSeqs: number[],
  overrideResult?: {
    finalStatus: FinalizeRunDraft["request"]["finalStatus"];
    errorSummary?: FinalizeRunDraft["request"]["errorSummary"];
  },
) {
  const base = {
    cooperativeStopRequested,
    ...(state.canonicalDesignBriefRef
      ? { canonicalDesignBriefRef: state.canonicalDesignBriefRef }
      : {}),
    ...pickDefinedStringRefs(state, FINALIZE_ARTIFACT_REF_KEYS),
    ...(buildCombinedWarningSummary(state).length > 0
      ? {
          warningSummary: buildCombinedWarningSummary(state),
        }
      : {}),
    assignedSeqs,
    ...(overrideResult ? { overrideResult } : {}),
  };

  return base;
}

function buildCombinedWarningSummary(state: ArtifactRefState) {
  const judgeWarnings =
    state.judgePlan && state.judgePlan.recommendation !== "keep"
      ? state.judgePlan.issues.map((issue) => ({
          code: issue.code,
          message: issue.message,
        }))
      : state.ruleJudgeVerdict?.recommendation === "refine"
        ? state.ruleJudgeVerdict.issues.map((issue) => ({
            code: issue.code,
            message: issue.message,
          }))
        : [];

  return judgeWarnings;
}

export function buildArtifactRefs(
  state: ArtifactRefState,
): ProcessRunJobResult["artifactRefs"] {
  if (!state.canonicalDesignBriefRef) {
    throw new Error("LangGraph run completed without canonical design brief artifact");
  }

  return {
    canonicalDesignBriefRef: state.canonicalDesignBriefRef,
    ...pickDefinedStringRefs(state, RESULT_ARTIFACT_REF_KEYS),
  };
}

export function buildStageAckRecord(
  proposal: WorkerMutationProposalDraft,
  ack: WaitMutationAckResponse,
): StageAckRecord {
  return {
    stageLabel: proposal.stageLabel,
    mutationId: proposal.mutationId,
    seq: ack.seq ?? null,
    status: ack.status,
    resultingRevision: ack.resultingRevision ?? null,
    resolvedLayerIds: ack.resolvedLayerIds ?? null,
    commands: proposal.mutation.commands.map((command) => ({
      op: command.op,
      executionSlotKey:
        "executionSlotKey" in command ? command.executionSlotKey ?? null : null,
      clientLayerKey:
        "clientLayerKey" in command && typeof command.clientLayerKey === "string"
          ? command.clientLayerKey
          : null,
      role:
        command.op === "createLayer" &&
        typeof command.layerBlueprint.metadata.role === "string"
          ? command.layerBlueprint.metadata.role
          : command.op === "updateLayer" &&
              typeof command.metadataTags.role === "string"
            ? command.metadataTags.role
            : null,
      targetLayerId:
        "targetRef" in command && command.targetRef.layerId
          ? command.targetRef.layerId
          : null,
      proposedBounds:
        command.op === "createLayer"
          ? command.layerBlueprint.bounds
          : command.op === "updateLayer" &&
              command.patch &&
              typeof command.patch === "object" &&
              "bounds" in command.patch &&
              command.patch.bounds &&
              typeof command.patch.bounds === "object"
            ? {
                x: Number((command.patch.bounds as { x?: number }).x ?? 0),
                y: Number((command.patch.bounds as { y?: number }).y ?? 0),
                width: Number((command.patch.bounds as { width?: number }).width ?? 0),
                height: Number((command.patch.bounds as { height?: number }).height ?? 0),
              }
            : null,
      saveEvidence:
        ack.commandResults?.find(
          (commandResult) =>
            commandResult.commandId === command.commandId &&
            commandResult.saveEvidence !== undefined,
        )?.saveEvidence ?? null,
      saveReceipt:
        ack.commandResults?.find(
          (commandResult) =>
            commandResult.commandId === command.commandId &&
            commandResult.saveReceipt !== undefined,
        )?.saveReceipt ?? null,
    })),
  };
}

function pickDefinedStringRefs<
  TState extends Record<string, unknown>,
  TKey extends readonly (keyof TState)[],
>(
  state: TState,
  keys: TKey,
): Partial<Record<TKey[number], string>> {
  const result: Partial<Record<TKey[number], string>> = {};
  for (const key of keys) {
    const value = state[key];
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}
