import { Annotation } from "@langchain/langgraph";
import type {
  RunJobEnvelope,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";
import type {
  FinalizeRunDraft,
  AbstractLayoutPlan,
  AbstractLayoutPlanNormalizationReport,
  AssetPlan,
  ConcreteLayoutPlan,
  CopyPlan,
  CopyPlanNormalizationReport,
  ExecutionSceneSummary,
  HydratedPlanningInput,
  IntentNormalizationReport,
  JudgePlan,
  MutationProposalDraft as WorkerMutationProposalDraft,
  NormalizedIntent,
  NormalizedIntentDraftArtifact,
  ProcessRunJobResult,
  RefineDecision,
  RetrievalStageResult,
  RuleJudgeVerdict,
  SearchProfileArtifact,
  SelectionDecision,
  SkeletonMutationBatch,
  SourceSearchSummary,
  StageAckRecord,
  TemplateCandidateBundle,
  TemplateSelectionPolicy,
  TypographyDecision,
} from "../types.js";
import type {
  TemplatePriorSummary,
} from "@tooldi/agent-contracts";
import type {
  TemplatePlannerMode,
} from "@tooldi/agent-llm";

type SourceSearchBackground = SourceSearchSummary["background"];
type SourceSearchGraphic = SourceSearchSummary["graphic"];
type SourceSearchPhoto = SourceSearchSummary["photo"];
type SourceSearchFont = SourceSearchSummary["font"];

const replaceValue = <T>(defaultFactory: () => T) =>
  Annotation<T>({
    reducer: (_left, right) => right,
    default: defaultFactory,
  });

export const RunJobGraphState = Annotation.Root({
  job: Annotation<RunJobEnvelope>(),
  cooperativeStopRequested: replaceValue(() => false),
  hydrated: replaceValue<HydratedPlanningInput | null>(() => null),
  resolvedPlannerMode: replaceValue<TemplatePlannerMode>(() => "heuristic"),
  normalizedIntentDraft: replaceValue<NormalizedIntentDraftArtifact | null>(() => null),
  normalizedIntentDraftRef: replaceValue<string | null>(() => null),
  intentNormalizationReport: replaceValue<IntentNormalizationReport | null>(() => null),
  intentNormalizationReportRef: replaceValue<string | null>(() => null),
  intent: replaceValue<NormalizedIntent | null>(() => null),
  normalizedIntentRef: replaceValue<string | null>(() => null),
  copyPlan: replaceValue<CopyPlan | null>(() => null),
  copyPlanRef: replaceValue<string | null>(() => null),
  copyPlanNormalizationReport: replaceValue<CopyPlanNormalizationReport | null>(() => null),
  copyPlanNormalizationReportRef: replaceValue<string | null>(() => null),
  abstractLayoutPlan: replaceValue<AbstractLayoutPlan | null>(() => null),
  abstractLayoutPlanRef: replaceValue<string | null>(() => null),
  abstractLayoutPlanNormalizationReport: replaceValue<AbstractLayoutPlanNormalizationReport | null>(() => null),
  abstractLayoutPlanNormalizationReportRef: replaceValue<string | null>(() => null),
  assetPlan: replaceValue<AssetPlan | null>(() => null),
  assetPlanRef: replaceValue<string | null>(() => null),
  templatePriorSummary: replaceValue<TemplatePriorSummary | null>(() => null),
  templatePriorSummaryRef: replaceValue<string | null>(() => null),
  searchProfile: replaceValue<SearchProfileArtifact | null>(() => null),
  searchProfileRef: replaceValue<string | null>(() => null),
  retrievalStage: replaceValue<RetrievalStageResult | null>(() => null),
  retrievalStageRef: replaceValue<string | null>(() => null),
  selectionPolicy: replaceValue<TemplateSelectionPolicy | null>(() => null),
  candidateSets: replaceValue<TemplateCandidateBundle | null>(() => null),
  candidateSetRef: replaceValue<string | null>(() => null),
  sourceSearchBackground: replaceValue<SourceSearchBackground | null>(() => null),
  sourceSearchGraphic: replaceValue<SourceSearchGraphic | null>(() => null),
  sourceSearchPhoto: replaceValue<SourceSearchPhoto | null>(() => null),
  selectionDecision: replaceValue<SelectionDecision | null>(() => null),
  selectionDecisionRef: replaceValue<string | null>(() => null),
  concreteLayoutPlan: replaceValue<ConcreteLayoutPlan | null>(() => null),
  concreteLayoutPlanRef: replaceValue<string | null>(() => null),
  typographyDecision: replaceValue<TypographyDecision | null>(() => null),
  typographyDecisionRef: replaceValue<string | null>(() => null),
  typographySearchSummary: replaceValue<SourceSearchFont | null>(() => null),
  sourceSearchSummary: replaceValue<SourceSearchSummary | null>(() => null),
  sourceSearchSummaryRef: replaceValue<string | null>(() => null),
  plan: replaceValue<ProcessRunJobResult["plan"] | null>(() => null),
  executablePlanRef: replaceValue<string | null>(() => null),
  ruleJudgeVerdict: replaceValue<RuleJudgeVerdict | null>(() => null),
  ruleJudgeVerdictRef: replaceValue<string | null>(() => null),
  executionSceneSummary: replaceValue<ExecutionSceneSummary | null>(() => null),
  executionSceneSummaryRef: replaceValue<string | null>(() => null),
  judgePlan: replaceValue<JudgePlan | null>(() => null),
  judgePlanRef: replaceValue<string | null>(() => null),
  refineDecision: replaceValue<RefineDecision | null>(() => null),
  refineDecisionRef: replaceValue<string | null>(() => null),
  skeletonBatch: replaceValue<SkeletonMutationBatch | null>(() => null),
  currentStageIndex: replaceValue(() => 0),
  currentProposal: replaceValue<WorkerMutationProposalDraft | null>(() => null),
  currentMutationId: replaceValue<string | null>(() => null),
  emittedMutationIds: replaceValue<string[]>(() => []),
  assignedSeqs: replaceValue<number[]>(() => []),
  lastMutationAck: replaceValue<WaitMutationAckResponse | null>(() => null),
  stageAckHistory: replaceValue<StageAckRecord[]>(() => []),
  refineAttempt: replaceValue<0 | 1>(() => 0),
  finalizeDraft: replaceValue<FinalizeRunDraft | null>(() => null),
  result: replaceValue<ProcessRunJobResult | null>(() => null),
});

export type RunJobGraphStateType = typeof RunJobGraphState.State;
