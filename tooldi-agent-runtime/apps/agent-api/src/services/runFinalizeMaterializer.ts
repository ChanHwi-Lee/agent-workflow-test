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

export type MaterializedArtifacts = {
  bundle: LiveDraftArtifactBundle;
  bundleRef: string;
  completionRecord: RunCompletionRecord;
  result: AgentRunResultSummary;
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
  const latestSaveReceipt =
    input.input.latestSaveReceipt ??
    _buildLatestSaveReceiptCompat(
      input.commandContext.at,
      canonicalResult,
      latestSaveEvidence,
    );
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
            semanticBriefDraftRef: input.input.semanticBriefDraftRef,
            briefCompilationReportRef: input.input.briefCompilationReportRef,
            canonicalDesignBriefRef: input.input.canonicalDesignBriefRef,
            executablePlanRef: input.input.executablePlanRef,
            latestSaveReceiptId: latestSaveReceipt?.saveReceiptId ?? null,
            bundleRef,
          },
          ledgerBoundary: {
            latestEmittedSeq: input.input.sourceMutationRange.lastSeq,
            latestAckedSeq:
              input.result.finalStatus === "cancelled"
                ? 0
                : (input.result.finalRevision ??
                  input.input.sourceMutationRange.reconciledThroughSeq),
            reconciledThroughSeq:
              input.input.sourceMutationRange.reconciledThroughSeq,
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
            slotStatuses: input.ledgerProjection.slotBindings.map(
              (binding) => ({
                executionSlotKey: binding.executionSlotKey ?? null,
                status: "ready" as const,
                primaryLayerId: binding.primaryLayerId,
              }),
            ),
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
    firstRenderableSeq: input.input.sourceMutationRange.firstSeq,
    reconciledThroughSeq: input.input.sourceMutationRange.reconciledThroughSeq,
    mutations: input.ledgerProjection.rangedRecords.map(
      (record) => record.mutation,
    ),
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
      canonicalDesignBriefRef: input.input.canonicalDesignBriefRef,
      ...(input.input.semanticBriefDraftRef
        ? { semanticBriefDraftRef: input.input.semanticBriefDraftRef }
        : {}),
      ...(input.input.briefCompilationReportRef
        ? { briefCompilationReportRef: input.input.briefCompilationReportRef }
        : {}),
      executablePlanRef: input.input.executablePlanRef,
      bundleRef,
    },
  };

  return {
    bundle,
    bundleRef,
    completionRecord,
    result: canonicalResult,
  };
}

function _buildLatestSaveReceiptCompat(
  finalizedAt: string,
  result: AgentRunResultSummary,
  evidence: TemplateSaveEvidence | null,
): TemplateSaveReceipt | null {
  if (
    !evidence ||
    result.latestSaveReceiptId === null ||
    result.finalRevision === null
  ) {
    return null;
  }

  return {
    saveReceiptId: result.latestSaveReceiptId,
    outputTemplateCode: evidence.code,
    savedRevision: result.finalRevision,
    savedAt: evidence.modified || finalizedAt,
    reason: "run_completed",
  };
}

function enforceMinimumDraft(
  result: AgentRunResultSummary,
  minimumDraftSatisfied: boolean,
): AgentRunResultSummary {
  if (minimumDraftSatisfied || result.finalStatus !== "completed") {
    return result;
  }

  const issue = {
    code: "minimum_draft_not_satisfied",
    message:
      "Completed status requires at least one live draft layer and one editable draft layer after replaying the mutation ledger",
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
    case "save_failed_after_apply":
      return "save_failed_after_apply";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      throw new Error(`Unsupported final status: ${finalStatus}`);
  }
}
