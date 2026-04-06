import type {
  CanvasMutationEnvelope,
  ExecutablePlan,
  IntentEnvelope,
  RunRepairContext,
  RunFinalizeRequest,
  RunJobEnvelope,
  StartAgentWorkflowRunRequest,
  WaitMutationAckResponse,
} from "@tooldi/agent-contracts";

export interface StoredRunSnapshot {
  editorContext: StartAgentWorkflowRunRequest["editorContext"];
  brandContext: StartAgentWorkflowRunRequest["brandContext"];
  referenceAssets: StartAgentWorkflowRunRequest["referenceAssets"];
  runPolicy: StartAgentWorkflowRunRequest["runPolicy"];
}

export interface HydratedPlanningInput {
  job: RunJobEnvelope;
  request: StartAgentWorkflowRunRequest;
  snapshot: StoredRunSnapshot;
  requestRef: string;
  snapshotRef: string;
  repairContext: RunRepairContext | null;
}

export interface NormalizedIntent {
  intentId: string;
  runId: string;
  traceId: string;
  operationFamily: IntentEnvelope["operationFamily"];
  artifactType: string;
  goalSummary: string;
  requestedOutputCount: number;
  supportedInV1: boolean;
  futureCapableOperations: IntentEnvelope["futureCapableOperations"];
}

export interface MutationProposalDraft {
  mutationId: string;
  rollbackGroupId: string;
  mutation: CanvasMutationEnvelope;
}

export interface SkeletonMutationBatch {
  commitGroup: string;
  proposals: MutationProposalDraft[];
}

export interface RefinementMutationBatch {
  proposedMutationIds: string[];
  lastMutationAck: WaitMutationAckResponse | null;
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
  intent: NormalizedIntent;
  plan: ExecutablePlan;
  emittedMutationIds: string[];
  finalizeDraft: FinalizeRunDraft;
}
