import type {
  CanvasMutationEnvelope,
  ExecutionSlotKey,
  ExecutablePlan,
  IntentEnvelope,
  InterviewAnswer,
  InterviewQuestion,
  RunRepairContext,
  RunFinalizeRequest,
  RunJobEnvelope,
  StartAgentWorkflowRunRequest,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";
import type {
  TemplateSemanticBriefContext,
  TemplateSemanticBriefDraft,
} from "@tooldi/agent-llm";

export interface StoredRunSnapshot {
  editorContext: StartAgentWorkflowRunRequest["editorContext"];
  brandContext: StartAgentWorkflowRunRequest["brandContext"];
  referenceAssets: StartAgentWorkflowRunRequest["referenceAssets"];
  runPolicy: StartAgentWorkflowRunRequest["runPolicy"];
}

export interface InterviewTimings {
  questionsMs: number;
  answersMs: number;
  briefMs: number;
  totalMs: number;
}

export interface InterviewUsages {
  questions: unknown | null;
  answers: unknown | null;
  brief: unknown | null;
}

export interface InterviewState {
  questions: ReadonlyArray<InterviewQuestion>;
  answers: ReadonlyArray<InterviewAnswer>;
  derivedBrief: string;
  autoFilledIds: ReadonlyArray<string>;
  builtUserPrompt: string;
  timings: InterviewTimings;
  usages: InterviewUsages;
}

export interface HydratedPlanningInput {
  job: RunJobEnvelope;
  request: StartAgentWorkflowRunRequest;
  snapshot: StoredRunSnapshot;
  requestRef: string;
  snapshotRef: string;
  repairContext: RunRepairContext | null;
}

export type WorkflowVariant = "object_native_v1";

export interface IntentConsistencyFlag {
  code: string;
  severity: "info" | "warning";
  message: string;
  fields: string[];
}

export interface IntentNormalizationRepair {
  field: string;
  reasonCode: string;
  before: unknown;
  after: unknown;
  note: string;
}

export interface SemanticBriefDraftArtifact {
  draftId: string;
  runId: string;
  traceId: string;
  operationFamily: IntentEnvelope["operationFamily"];
  canvasPreset: "wide_1200x628" | "square_1080" | "story_1080x1920" | string;
  prompt: string;
  palette: string[];
  draft: TemplateSemanticBriefDraft;
}

export interface IntentNormalizationReport {
  reportId: string;
  runId: string;
  traceId: string;
  prompt: string;
  draftAvailable: boolean;
  repairCount: number;
  appliedRepairs: IntentNormalizationRepair[];
  consistencyFlags: IntentConsistencyFlag[];
  normalizationNotes: string[];
}

export interface CanonicalDesignBrief extends TemplateSemanticBriefContext {
  intentId: string;
  runId: string;
  traceId: string;
  operationFamily: IntentEnvelope["operationFamily"];
  artifactType: string;
  requestedOutputCount: number;
  consistencyFlags: IntentConsistencyFlag[];
  normalizationNotes: string[];
  supportedInV1: boolean;
  futureCapableOperations: IntentEnvelope["futureCapableOperations"];
}

export type NormalizedIntent = CanonicalDesignBrief;

export interface LayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageAckRecordCommand {
  op: "createLayer" | "updateLayer" | "deleteLayer" | "saveTemplate";
  executionSlotKey: ExecutionSlotKey | null;
  clientLayerKey: string | null;
  role: string | null;
  saveEvidence?: {
    code: string;
    serial: number;
    modified: string;
    version: string;
  } | null;
  saveReceipt?: {
    saveReceiptId: string;
    outputTemplateCode: string;
    savedRevision: number;
    savedAt: string;
    reason: string;
  } | null;
  targetLayerId: string | null;
  proposedBounds: LayoutBounds | null;
}

export interface StageAckRecord {
  stageLabel: string;
  mutationId: string;
  seq: number | null;
  status: WaitMutationAckResponse["status"];
  resultingRevision: number | null;
  resolvedLayerIds: Record<string, string> | null;
  commands: StageAckRecordCommand[];
}

export interface MutationProposalDraft {
  mutationId: string;
  rollbackGroupId: string;
  stageLabel: string;
  stageDescription: string;
  mutation: CanvasMutationEnvelope;
}

export interface SkeletonMutationBatch {
  commitGroup: string;
  proposals: MutationProposalDraft[];
}

export interface FinalizeRunDraft {
  request: RunFinalizeRequest;
  summary: {
    proposedMutationIds: string[];
    finalStatus: RunFinalizeRequest["finalStatus"];
    lastAckedSeq: number;
  };
}

export interface ProcessRunJobResult {
  intent: CanonicalDesignBrief;
  semanticBriefDraft?: SemanticBriefDraftArtifact;
  intentNormalizationReport?: IntentNormalizationReport;
  plan?: ExecutablePlan;
  emittedMutationIds: string[];
  finalizeDraft: FinalizeRunDraft;
  artifactRefs: {
    canonicalDesignBriefRef: string;
    semanticBriefDraftRef?: string;
    briefCompilationReportRef?: string;
    executablePlanRef?: string;
  };
}
