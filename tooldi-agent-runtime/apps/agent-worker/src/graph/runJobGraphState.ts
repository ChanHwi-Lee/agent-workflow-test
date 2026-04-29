import { Annotation } from "@langchain/langgraph";
import type {
  RunJobEnvelope,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";
import type {
  FinalizeRunDraft,
  HydratedPlanningInput,
  IntentNormalizationReport,
  InterviewState,
  MutationProposalDraft as WorkerMutationProposalDraft,
  CanonicalDesignBrief,
  SemanticBriefDraftArtifact,
  ProcessRunJobResult,
  SkeletonMutationBatch,
  StageAckRecord,
} from "../types.js";
import type { V6PipelineResult } from "../phases/v6Pipeline.js";
import type { V6TrendBrief } from "../phases/v6TrendResearch.js";

const replaceValue = <T>(defaultFactory: () => T) =>
  Annotation<T>({
    reducer: (_left, right) => right,
    default: defaultFactory,
  });

export const RunJobGraphState = Annotation.Root({
  job: Annotation<RunJobEnvelope>(),
  cooperativeStopRequested: replaceValue(() => false),
  hydrated: replaceValue<HydratedPlanningInput | null>(() => null),
  semanticBriefDraft: replaceValue<SemanticBriefDraftArtifact | null>(
    () => null,
  ),
  intentNormalizationReport: replaceValue<IntentNormalizationReport | null>(
    () => null,
  ),
  briefCompilationReportRef: replaceValue<string | null>(() => null),
  intent: replaceValue<CanonicalDesignBrief | null>(() => null),
  canonicalDesignBriefRef: replaceValue<string | null>(() => null),
  plan: replaceValue<ProcessRunJobResult["plan"] | null>(() => null),
  executablePlanRef: replaceValue<string | null>(() => null),
  v6TrendBrief: replaceValue<V6TrendBrief | null>(() => null),
  v6TrendBriefRef: replaceValue<string | null>(() => null),
  v6PipelineResult: replaceValue<V6PipelineResult | null>(() => null),
  skeletonBatch: replaceValue<SkeletonMutationBatch | null>(() => null),
  currentStageIndex: replaceValue(() => 0),
  currentProposal: replaceValue<WorkerMutationProposalDraft | null>(() => null),
  currentMutationId: replaceValue<string | null>(() => null),
  emittedMutationIds: replaceValue<string[]>(() => []),
  assignedSeqs: replaceValue<number[]>(() => []),
  lastMutationAck: replaceValue<WaitMutationAckResponse | null>(() => null),
  stageAckHistory: replaceValue<StageAckRecord[]>(() => []),
  interview: replaceValue<InterviewState | null>(() => null),
  finalizeDraft: replaceValue<FinalizeRunDraft | null>(() => null),
  result: replaceValue<ProcessRunJobResult | null>(() => null),
});

export type RunJobGraphStateType = typeof RunJobGraphState.State & {
  semanticBriefDraftRef?: string | null;
};
