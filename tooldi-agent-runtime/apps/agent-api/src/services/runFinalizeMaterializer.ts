import type {
  AgentRunResultSummary,
  DraftManifest,
  EditableBannerDraftCommitPayload,
  LiveDraftArtifactBundle,
  MutationLedger,
  RunCompletionRecord,
  RunCompletionSnapshot,
  TemplateSaveEvidence,
  TemplateSaveReceipt,
} from "@tooldi/agent-contracts";
import type { ObjectStoreClient } from "@tooldi/agent-persistence";

import type { MaterializationInput } from "./runFinalizeInput.js";
import type { RunLedgerProjection } from "./runFinalizeLedger.js";

const REQUIRED_SLOTS = [
  "background",
  "headline",
  "supporting_copy",
  "cta",
  "decoration",
] as const;

export type MaterializedArtifacts = {
  bundle: LiveDraftArtifactBundle;
  bundleRef: string;
  completionRecord: RunCompletionRecord;
};

type MaterializeRunArtifactsInput = {
  run: {
    runId: string;
    traceId: string;
    pageId: string;
    requestRef: string;
    snapshotRef: string;
  };
  commandContext: {
    attemptSeq: number;
    at: string;
  };
  result: AgentRunResultSummary;
  input: MaterializationInput;
  ledgerProjection: RunLedgerProjection;
  objectStore: ObjectStoreClient;
};

export async function materializeRunArtifacts(
  input: MaterializeRunArtifactsInput,
): Promise<MaterializedArtifacts> {
  const canonicalResult = enforceMinimumDraft(
    input.result,
    input.ledgerProjection.minimumDraftSatisfied,
  );
  const bundleId = `bundle_${input.run.runId}`;
  const commitPayloadId = `commit_payload_${input.run.runId}`;
  const completionRecordId = `completion_${input.run.runId}`;
  const parentMutationRangeRef = `mutation_range_${input.run.runId}_${input.input.sourceMutationRange.firstSeq}_${input.input.sourceMutationRange.lastSeq}`;
  const latestSaveEvidence = canonicalResult.latestSaveEvidence;
  const latestSaveReceipt = null;
  const checkpointId = latestSaveEvidence
    ? `checkpoint_${input.run.runId}_latest_saved`
    : null;
  const bundleRef = `runs/${input.run.runId}/artifacts/${bundleId}.json`;
  const checkpointSnapshotRef =
    checkpointId !== null
      ? `runs/${input.run.runId}/checkpoints/${checkpointId}.json`
      : null;

  const savedCheckpoint =
    checkpointId && checkpointSnapshotRef && latestSaveEvidence
      ? {
          checkpointId,
          checkpointSeq: 1,
          eventSequence: input.ledgerProjection.maxMutationEventSequence + 1,
          runId: input.run.runId,
          traceId: input.run.traceId,
          draftId: input.input.draftId,
          attemptSeq: input.commandContext.attemptSeq,
          planStepId:
            input.ledgerProjection.orderedEntries[
              input.ledgerProjection.orderedEntries.length - 1
            ]?.planStepId ?? null,
          planStepOrder: 1,
          stepKey: "latest_saved_revision" as const,
          checkpointClass: "durable_saved" as const,
          createdAt: input.commandContext.at,
          sourceRefs: {
            requestRef: input.run.requestRef,
            snapshotRef: input.run.snapshotRef,
            normalizedIntentDraftRef: input.input.normalizedIntentDraftRef,
            intentNormalizationReportRef: input.input.intentNormalizationReportRef,
            copyPlanRef: input.input.copyPlanRef,
            copyPlanNormalizationReportRef:
              input.input.copyPlanNormalizationReportRef,
            abstractLayoutPlanRef: input.input.abstractLayoutPlanRef,
            abstractLayoutPlanNormalizationReportRef:
              input.input.abstractLayoutPlanNormalizationReportRef,
            assetPlanRef: input.input.assetPlanRef,
            concreteLayoutPlanRef: input.input.concreteLayoutPlanRef,
            normalizedIntentRef: input.input.normalizedIntentRef,
            templatePriorSummaryRef: input.input.templatePriorSummaryRef,
            executablePlanRef: input.input.executablePlanRef,
            candidateSetRef: input.input.candidateSetRef,
            sourceSearchSummaryRef: input.input.sourceSearchSummaryRef,
            retrievalStageRef: input.input.retrievalStageRef,
            selectionDecisionRef: input.input.selectionDecisionRef,
            typographyDecisionRef: input.input.typographyDecisionRef,
            ruleJudgeVerdictRef: input.input.ruleJudgeVerdictRef,
            executionSceneSummaryRef: input.input.executionSceneSummaryRef,
            judgePlanRef: input.input.judgePlanRef,
            refineDecisionRef: input.input.refineDecisionRef,
            latestSaveReceiptId: null,
            bundleRef,
          },
          ledgerBoundary: {
            latestEmittedSeq: input.input.sourceMutationRange.lastSeq,
            latestAckedSeq:
              input.result.finalStatus === "cancelled"
                ? 0
                : input.result.finalRevision ??
                  input.input.sourceMutationRange.reconciledThroughSeq,
            reconciledThroughSeq: input.input.sourceMutationRange.reconciledThroughSeq,
            openPlanStepIds: [],
          },
          bundleSnapshot: {
            bundleSnapshotRef: checkpointSnapshotRef,
            snapshotArtifactType: "LiveDraftArtifactBundle" as const,
            snapshotArtifactVersion: "v1" as const,
            checkpointRevision: canonicalResult.finalRevision,
            rootLayerIds: input.ledgerProjection.rootLayerIds,
            editableLayerIds: input.ledgerProjection.editableLayerIds,
            referencedAssetIds: [],
            slotStatuses: input.ledgerProjection.slotBindings.map((binding) => ({
              slotKey: binding.slotKey,
              status: "ready" as const,
              primaryLayerId: binding.primaryLayerId,
              ...(Object.prototype.hasOwnProperty.call(
                binding,
                "executionSlotKey",
              )
                ? { executionSlotKey: binding.executionSlotKey ?? null }
                : {}),
            })),
          },
          recoveryBase: {
            restoreTargetKind: "latest_saved_revision" as const,
            restoreTargetRevision: canonicalResult.finalRevision,
            restoreTargetCheckpointId: checkpointId,
            durabilityState: canonicalResult.durabilityState,
          },
        }
      : null;
  const checkpoints = savedCheckpoint ? [savedCheckpoint] : [];

  const mutationLedger: MutationLedger = {
    runId: input.run.runId,
    traceId: input.run.traceId,
    draftId: input.input.draftId,
    orderedEntries: input.ledgerProjection.orderedEntries,
    checkpoints,
    lastKnownGoodCheckpointId: checkpointId,
    reconciledThroughSeq: input.input.sourceMutationRange.reconciledThroughSeq,
    lastKnownGoodRevision: canonicalResult.finalRevision,
  };

  const manifestProjection = {
    rootLayerIds: input.ledgerProjection.rootLayerIds,
    editableLayerIds: input.ledgerProjection.editableLayerIds,
    slotBindings: input.ledgerProjection.slotBindings,
    expectedFinalRevision: canonicalResult.finalRevision,
  };

  const commitPayload: EditableBannerDraftCommitPayload = {
    commitPayloadId,
    commitPayloadVersion: "v1",
    eventSequence:
      input.ledgerProjection.maxMutationEventSequence + checkpoints.length + 1,
    runId: input.run.runId,
    canonicalRunId: input.run.runId,
    parentMutationRangeRef,
    traceId: input.run.traceId,
    draftId: input.input.draftId,
    pageId: input.run.pageId,
    commitMode: "apply_immediately",
    requiredSlots: [...REQUIRED_SLOTS],
    firstRenderableSeq: input.input.sourceMutationRange.firstSeq,
    reconciledThroughSeq: input.input.sourceMutationRange.reconciledThroughSeq,
    mutations: input.ledgerProjection.rangedRecords.map((record) => record.mutation),
    manifest: manifestProjection,
    savePlan: {
      milestoneReason: "milestone_first_editable",
      finalReason: "run_completed",
      saveRequired: true,
    },
  };

  const draftManifest: DraftManifest = {
    draftId: input.input.draftId,
    runId: input.run.runId,
    traceId: input.run.traceId,
    pageId: input.run.pageId,
    rootLayerIds: input.ledgerProjection.rootLayerIds,
    editableLayerIds: input.ledgerProjection.editableLayerIds,
    slotBindings: input.ledgerProjection.slotBindings,
    finalRevision: canonicalResult.finalRevision,
  };

  const completionSnapshot: RunCompletionSnapshot = {
    draftId: input.input.draftId,
    completionState: toCompletionState(canonicalResult.finalStatus),
    terminalStatus: canonicalResult.finalStatus,
    minimumDraftSatisfied: input.ledgerProjection.minimumDraftSatisfied,
    warnings: canonicalResult.warnings,
    completedAt: input.commandContext.at,
    finalRevision: canonicalResult.finalRevision,
  };

  const bundle: LiveDraftArtifactBundle = {
    bundleId,
    artifactType: "LiveDraftArtifactBundle",
    artifactVersion: "v1",
    eventSequence: commitPayload.eventSequence + 1,
    runId: input.run.runId,
    canonicalRunId: input.run.runId,
    parentCommitPayloadRef: commitPayload.commitPayloadId,
    traceId: input.run.traceId,
    draftId: input.input.draftId,
    editableCanvasState: {
      commitPayload,
      draftManifest,
    },
    referencedStoredAssets: [],
    mutationLedger,
    saveMetadata: {
      latestSaveEvidence,
      latestSaveReceipt,
      completionSnapshot,
    },
  };

  if (checkpointSnapshotRef && checkpointId) {
    await input.objectStore.putObject({
      key: checkpointSnapshotRef,
      body: JSON.stringify({
        draftManifest,
        completionSnapshot,
        sourceMutationRange: input.input.sourceMutationRange,
      }),
      contentType: "application/json",
      metadata: {
        runId: input.run.runId,
        traceId: input.run.traceId,
        checkpointId,
      },
    });
  }

  await input.objectStore.putObject({
    key: bundleRef,
    body: JSON.stringify(bundle),
    contentType: "application/json",
    metadata: {
      runId: input.run.runId,
      traceId: input.run.traceId,
      bundleId,
    },
  });

  const completionRecord: RunCompletionRecord = {
    completionRecordId,
    completionSchemaVersion: "v1",
    eventSequence: bundle.eventSequence + 1,
    runId: input.run.runId,
    canonicalRunId: input.run.runId,
    traceId: input.run.traceId,
    draftId: input.input.draftId,
    pageId: input.run.pageId,
    bundleId,
    parentBundleRef: bundleId,
    commitPayloadId,
    canonicalArtifactKind: "LiveDraftArtifactBundle",
    terminalStatus: canonicalResult.finalStatus,
    completionState: toCompletionState(canonicalResult.finalStatus),
    durabilityState: canonicalResult.durabilityState,
    minimumDraftSatisfied: input.ledgerProjection.minimumDraftSatisfied,
    sourceMutationRange: input.input.sourceMutationRange,
    finalRevision: canonicalResult.finalRevision,
    latestSaveEvidence,
    latestSaveReceiptId: canonicalResult.latestSaveReceiptId,
    draftGeneratedAt: input.commandContext.at,
    completedAt: input.commandContext.at,
    sourceRefs: {
      requestRef: input.run.requestRef,
      snapshotRef: input.run.snapshotRef,
      normalizedIntentRef: input.input.normalizedIntentRef,
      ...(input.input.normalizedIntentDraftRef
        ? { normalizedIntentDraftRef: input.input.normalizedIntentDraftRef }
        : {}),
      ...(input.input.intentNormalizationReportRef
        ? { intentNormalizationReportRef: input.input.intentNormalizationReportRef }
        : {}),
      ...(input.input.copyPlanRef ? { copyPlanRef: input.input.copyPlanRef } : {}),
      ...(input.input.copyPlanNormalizationReportRef
        ? {
            copyPlanNormalizationReportRef:
              input.input.copyPlanNormalizationReportRef,
          }
        : {}),
      ...(input.input.abstractLayoutPlanRef
        ? { abstractLayoutPlanRef: input.input.abstractLayoutPlanRef }
        : {}),
      ...(input.input.abstractLayoutPlanNormalizationReportRef
        ? {
            abstractLayoutPlanNormalizationReportRef:
              input.input.abstractLayoutPlanNormalizationReportRef,
          }
        : {}),
      ...(input.input.assetPlanRef ? { assetPlanRef: input.input.assetPlanRef } : {}),
      ...(input.input.concreteLayoutPlanRef
        ? { concreteLayoutPlanRef: input.input.concreteLayoutPlanRef }
        : {}),
      ...(input.input.templatePriorSummaryRef
        ? { templatePriorSummaryRef: input.input.templatePriorSummaryRef }
        : {}),
      ...(input.input.searchProfileRef
        ? { searchProfileRef: input.input.searchProfileRef }
        : {}),
      executablePlanRef: input.input.executablePlanRef,
      ...(input.input.candidateSetRef
        ? { candidateSetRef: input.input.candidateSetRef }
        : {}),
      ...(input.input.sourceSearchSummaryRef
        ? { sourceSearchSummaryRef: input.input.sourceSearchSummaryRef }
        : {}),
      ...(input.input.retrievalStageRef
        ? { retrievalStageRef: input.input.retrievalStageRef }
        : {}),
      ...(input.input.selectionDecisionRef
        ? { selectionDecisionRef: input.input.selectionDecisionRef }
        : {}),
      ...(input.input.typographyDecisionRef
        ? { typographyDecisionRef: input.input.typographyDecisionRef }
        : {}),
      ...(input.input.ruleJudgeVerdictRef
        ? { ruleJudgeVerdictRef: input.input.ruleJudgeVerdictRef }
        : {}),
      ...(input.input.executionSceneSummaryRef
        ? { executionSceneSummaryRef: input.input.executionSceneSummaryRef }
        : {}),
      ...(input.input.judgePlanRef ? { judgePlanRef: input.input.judgePlanRef } : {}),
      ...(input.input.refineDecisionRef
        ? { refineDecisionRef: input.input.refineDecisionRef }
        : {}),
      bundleRef,
    },
  };

  return {
    bundle,
    bundleRef,
    completionRecord,
  };
}

function _buildLatestSaveReceiptCompat(
  _finalizedAt: string,
  _result: AgentRunResultSummary,
  _evidence: TemplateSaveEvidence | null,
): TemplateSaveReceipt | null {
  return null;
}

function enforceMinimumDraft(
  result: AgentRunResultSummary,
  minimumDraftSatisfied: boolean,
): AgentRunResultSummary {
  if (
    minimumDraftSatisfied ||
    (result.finalStatus !== "completed" &&
      result.finalStatus !== "completed_with_warning")
  ) {
    return result;
  }

  const issue = {
    code: "minimum_draft_not_satisfied",
    message:
      "Completed status requires the minimum editable draft slots to exist in the mutation ledger",
  };
  return {
    ...result,
    finalStatus: "failed",
    durabilityState: "no_saved_draft",
    latestSaveEvidence: null,
    latestSaveReceiptId: null,
    warningCount: result.warnings.length + 1,
    warnings: [...result.warnings, issue],
    errorSummary: issue,
  };
}

function toCompletionState(
  finalStatus: AgentRunResultSummary["finalStatus"],
): RunCompletionRecord["completionState"] {
  switch (finalStatus) {
    case "completed":
      return "editable_draft_ready";
    case "completed_with_warning":
      return "editable_draft_ready_with_warning";
    case "save_failed_after_apply":
      return "save_failed_after_apply";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
  }
}
