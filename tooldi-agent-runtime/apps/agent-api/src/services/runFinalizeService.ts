import type {
  AgentRunResultSummary,
  CanvasMutationEnvelope,
  CanvasMutationCommand,
  DraftManifest,
  EditableBannerDraftCommitPayload,
  ErrorSummary,
  ExecutionSlotKey,
  LiveDraftArtifactBundle,
  MutationLedger,
  MutationLedgerEntry,
  RunCompletionRecord,
  RunCompletionSnapshot,
  RunFinalizeRequest,
  TemplateSaveReceipt,
} from "@tooldi/agent-contracts";
import type { RunStatus } from "@tooldi/agent-domain";
import type { Logger } from "@tooldi/agent-observability";
import type { ObjectStoreClient } from "@tooldi/agent-persistence";

import { isTerminalRunStatus } from "@tooldi/agent-domain";

import { ConflictError, NotFoundError } from "../lib/errors.js";
import type { CompletionRepository } from "../repositories/completionRepository.js";
import type { CostSummaryRepository } from "../repositories/costSummaryRepository.js";
import type { DraftBundleRepository } from "../repositories/draftBundleRepository.js";
import type {
  MutationLedgerRecord,
  MutationLedgerRepository,
} from "../repositories/mutationLedgerRepository.js";
import type { RunAttemptRepository } from "../repositories/runAttemptRepository.js";
import type { RunRepository } from "../repositories/runRepository.js";
import type { RunEventService } from "./runEventService.js";

const REQUIRED_SLOTS = [
  "background",
  "headline",
  "supporting_copy",
  "cta",
  "decoration",
] as const;

type MaterializedArtifacts = {
  bundle: LiveDraftArtifactBundle;
  bundleRef: string;
  completionRecord: RunCompletionRecord;
};

type MaterializationInput = {
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
  outputTemplateCode: string | null;
};

export interface FinalizeRunCommand {
  runId: string;
  traceId: string;
  attemptSeq: number;
  queueJobId: string;
  result: AgentRunResultSummary;
  request?: RunFinalizeRequest;
  at: string;
}

export interface FinalizeRunResult {
  accepted: boolean;
  runStatus: RunStatus;
  completionRecordRef?: string;
}

export class RunFinalizeService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly runAttemptRepository: RunAttemptRepository,
    private readonly mutationLedgerRepository: MutationLedgerRepository,
    private readonly costSummaryRepository: CostSummaryRepository,
    private readonly draftBundleRepository: DraftBundleRepository,
    private readonly completionRepository: CompletionRepository,
    private readonly objectStore: ObjectStoreClient,
    private readonly runEventService: RunEventService,
    private readonly logger: Logger,
  ) {}

  async finalizeRun(command: FinalizeRunCommand): Promise<FinalizeRunResult> {
    const run = await this.runRepository.findById(command.runId);
    if (!run) {
      throw new NotFoundError(`Run not found: ${command.runId}`);
    }
    if (run.traceId !== command.traceId) {
      throw new ConflictError(
        `Trace mismatch for run ${command.runId}: expected ${run.traceId}, received ${command.traceId}`,
      );
    }
    if (run.attemptSeq !== command.attemptSeq) {
      throw new ConflictError(
        `Stale attempt for run ${command.runId}: active ${run.attemptSeq}, received ${command.attemptSeq}`,
      );
    }
    if (run.queueJobId !== command.queueJobId) {
      throw new ConflictError(
        `Stale queue job for run ${command.runId}: active ${run.queueJobId}, received ${command.queueJobId}`,
      );
    }
    if (isTerminalRunStatus(run.status)) {
      return {
        accepted: true,
        runStatus: run.status,
        ...(run.completionRecordRef ? { completionRecordRef: run.completionRecordRef } : {}),
      };
    }

    const attempt = await this.runAttemptRepository.findByRunIdAndAttemptSeq(
      command.runId,
      command.attemptSeq,
    );
    if (!attempt) {
      throw new NotFoundError(
        `Attempt not found for run ${command.runId} seq ${command.attemptSeq}`,
      );
    }
    if (attempt.queueJobId !== command.queueJobId) {
      throw new ConflictError(
        `Queue job mismatch for run ${command.runId} seq ${command.attemptSeq}`,
        {
          expectedQueueJobId: attempt.queueJobId,
          receivedQueueJobId: command.queueJobId,
        },
      );
    }

    const normalized = this.normalizeFinalizeInput(command);
    let updatedRun;
    let completionRecordRef: string | undefined;

    if (normalized.materialization) {
      const materialized = await this.materializeArtifacts(
        run,
        command,
        normalized.result,
        normalized.materialization,
      );
      await this.draftBundleRepository.save({
        bundleId: materialized.bundle.bundleId,
        runId: materialized.bundle.runId,
        traceId: materialized.bundle.traceId,
        draftId: materialized.bundle.draftId,
        payloadRef: materialized.bundleRef,
        payload: materialized.bundle,
        eventSequence: materialized.bundle.eventSequence,
        createdAt: command.at,
      });
      await this.completionRepository.save(materialized.completionRecord);
      updatedRun = await this.runRepository.bindFinalization(command.runId, {
        status: normalized.result.finalStatus,
        statusReasonCode: null,
        draftId: normalized.result.draftId,
        finalArtifactRef: materialized.bundle.bundleId,
        completionRecordRef: materialized.completionRecord.completionRecordId,
        latestSaveReceiptId: normalized.result.latestSaveReceiptId,
        latestSavedRevision: materialized.completionRecord.latestSaveReceiptId
          ? materialized.completionRecord.finalRevision
          : null,
        finalRevision: normalized.result.finalRevision,
      });
      completionRecordRef = materialized.completionRecord.completionRecordId;
    } else {
      updatedRun = await this.runRepository.updateStatus(
        command.runId,
        normalized.result.finalStatus,
      );
    }

    await this.runAttemptRepository.updateAttemptState(
      command.runId,
      command.attemptSeq,
      this.mapFinalStatusToAttemptState(normalized.result.finalStatus),
      attempt.workerId ?? undefined,
      attempt.lastHeartbeatAt ?? undefined,
    );
    await this.costSummaryRepository.upsertPlaceholder(
      command.runId,
      command.traceId,
      normalized.result,
    );

    if (normalized.result.finalStatus === "failed") {
      await this.runEventService.appendFailed(
        command.runId,
        command.traceId,
        normalized.result.errorSummary ?? {
          code: "run_failed_without_error_summary",
          message: "Run finalized as failed without an explicit error summary",
        },
        command.at,
      );
    } else if (normalized.result.finalStatus === "cancelled") {
      await this.runEventService.appendCancelled(
        command.runId,
        command.traceId,
        command.at,
      );
    } else {
      await this.runEventService.appendCompleted(
        command.runId,
        command.traceId,
        normalized.result,
        command.at,
      );
    }

    this.logger.info("Finalized run placeholder", {
      runId: command.runId,
      traceId: command.traceId,
      finalStatus: normalized.result.finalStatus,
      existingStatus: run.status,
      ...(completionRecordRef ? { completionRecordRef } : {}),
    });

    return {
      accepted: true,
      runStatus: updatedRun?.status ?? normalized.result.finalStatus,
      ...(completionRecordRef ? { completionRecordRef } : {}),
    };
  }

  async failRun(
    runId: string,
    traceId: string,
    error: ErrorSummary,
    at: string,
  ): Promise<void> {
    await this.runRepository.updateStatus(runId, "failed");
    await this.runEventService.appendFailed(runId, traceId, error, at);
  }

  private normalizeFinalizeInput(
    command: FinalizeRunCommand,
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
      !this.hasCompleteSaveEvidence(request, result)
    ) {
      const warning = {
        code: "save_receipt_evidence_incomplete",
        message:
          "Completed status requires save receipt id, output template code, and final revision",
      };
      const warnings = [...result.warnings, warning];
      result = {
        ...result,
        finalStatus: "save_failed_after_apply",
        durabilityState: "save_uncertain",
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
        outputTemplateCode: request.outputTemplateCode ?? null,
      },
    };
  }

  private async materializeArtifacts(
    run: NonNullable<Awaited<ReturnType<RunRepository["findById"]>>>,
    command: FinalizeRunCommand,
    result: AgentRunResultSummary,
    input: MaterializationInput,
  ): Promise<MaterializedArtifacts> {
    const ledgerRecords = await this.mutationLedgerRepository.listByRunId(run.runId);
    const rangedRecords = ledgerRecords.filter(
      (record) =>
        record.seq >= input.sourceMutationRange.firstSeq &&
        record.seq <= input.sourceMutationRange.lastSeq,
    );

    if (rangedRecords.length === 0) {
      throw new ConflictError(
        `Cannot materialize bundle without mutation ledger rows for run ${run.runId}`,
      );
    }

    const minimumDraftSatisfied = this.hasMinimumRequiredSlots(rangedRecords);
    const canonicalResult = this.enforceMinimumDraft(result, minimumDraftSatisfied);
    const bundleId = `bundle_${run.runId}`;
    const commitPayloadId = `commit_payload_${run.runId}`;
    const completionRecordId = `completion_${run.runId}`;
    const parentMutationRangeRef = `mutation_range_${run.runId}_${input.sourceMutationRange.firstSeq}_${input.sourceMutationRange.lastSeq}`;
    const maxMutationEventSequence = Math.max(...rangedRecords.map((record) => record.seq));
    const latestSaveReceipt = this.buildLatestSaveReceipt(
      command,
      canonicalResult,
      input.outputTemplateCode,
    );
    const slotBindings = this.buildSlotBindings(rangedRecords);
    const rootLayerIds = slotBindings.map((binding) => binding.primaryLayerId);
    const editableLayerIds = slotBindings
      .filter((binding) => binding.editable)
      .flatMap((binding) => binding.layerIds);
    const checkpointId = latestSaveReceipt ? `checkpoint_${run.runId}_latest_saved` : null;
    const bundleRef = `runs/${run.runId}/artifacts/${bundleId}.json`;
    const checkpointSnapshotRef =
      checkpointId !== null
        ? `runs/${run.runId}/checkpoints/${checkpointId}.json`
        : null;

    const orderedEntries = this.buildMutationLedgerEntries(rangedRecords);
    const savedCheckpoint =
      checkpointId && checkpointSnapshotRef && latestSaveReceipt
        ? {
            checkpointId,
            checkpointSeq: 1,
            eventSequence: maxMutationEventSequence + 1,
            runId: run.runId,
            traceId: run.traceId,
            draftId: input.draftId,
            attemptSeq: command.attemptSeq,
            planStepId: orderedEntries[orderedEntries.length - 1]?.planStepId ?? null,
            planStepOrder: 1,
            stepKey: "latest_saved_revision" as const,
            checkpointClass: "durable_saved" as const,
            createdAt: command.at,
            sourceRefs: {
              requestRef: run.requestRef,
              snapshotRef: run.snapshotRef,
              normalizedIntentDraftRef: input.normalizedIntentDraftRef,
              intentNormalizationReportRef: input.intentNormalizationReportRef,
              copyPlanRef: input.copyPlanRef,
              copyPlanNormalizationReportRef:
                input.copyPlanNormalizationReportRef,
              abstractLayoutPlanRef: input.abstractLayoutPlanRef,
              abstractLayoutPlanNormalizationReportRef:
                input.abstractLayoutPlanNormalizationReportRef,
              assetPlanRef: input.assetPlanRef,
              concreteLayoutPlanRef: input.concreteLayoutPlanRef,
              normalizedIntentRef: input.normalizedIntentRef,
              templatePriorSummaryRef: input.templatePriorSummaryRef,
              executablePlanRef: input.executablePlanRef,
              candidateSetRef: input.candidateSetRef,
              sourceSearchSummaryRef: input.sourceSearchSummaryRef,
              retrievalStageRef: input.retrievalStageRef,
              selectionDecisionRef: input.selectionDecisionRef,
              typographyDecisionRef: input.typographyDecisionRef,
              ruleJudgeVerdictRef: input.ruleJudgeVerdictRef,
              executionSceneSummaryRef: input.executionSceneSummaryRef,
              judgePlanRef: input.judgePlanRef,
              refineDecisionRef: input.refineDecisionRef,
              latestSaveReceiptId: latestSaveReceipt.saveReceiptId,
              bundleRef,
            },
            ledgerBoundary: {
              latestEmittedSeq: input.sourceMutationRange.lastSeq,
              latestAckedSeq:
                command.result.finalStatus === "cancelled"
                  ? 0
                  : command.result.finalRevision ?? input.sourceMutationRange.reconciledThroughSeq,
              reconciledThroughSeq: input.sourceMutationRange.reconciledThroughSeq,
              openPlanStepIds: [],
            },
            bundleSnapshot: {
              bundleSnapshotRef: checkpointSnapshotRef,
              snapshotArtifactType: "LiveDraftArtifactBundle" as const,
              snapshotArtifactVersion: "v1" as const,
              checkpointRevision: latestSaveReceipt.savedRevision,
              rootLayerIds,
              editableLayerIds,
              referencedAssetIds: [],
              slotStatuses: slotBindings.map((binding) => ({
                slotKey: binding.slotKey,
                status: "ready" as const,
                primaryLayerId: binding.primaryLayerId,
                ...(Object.prototype.hasOwnProperty.call(binding, "executionSlotKey")
                  ? { executionSlotKey: binding.executionSlotKey ?? null }
                  : {}),
              })),
            },
            recoveryBase: {
              restoreTargetKind: "latest_saved_revision" as const,
              restoreTargetRevision: latestSaveReceipt.savedRevision,
              restoreTargetCheckpointId: checkpointId,
              durabilityState: canonicalResult.durabilityState,
            },
          }
        : null;
    const checkpoints = savedCheckpoint ? [savedCheckpoint] : [];

    const mutationLedger: MutationLedger = {
      runId: run.runId,
      traceId: run.traceId,
      draftId: input.draftId,
      orderedEntries,
      checkpoints,
      lastKnownGoodCheckpointId: checkpointId,
      reconciledThroughSeq: input.sourceMutationRange.reconciledThroughSeq,
      lastKnownGoodRevision: latestSaveReceipt?.savedRevision ?? null,
    };

    const manifestProjection = {
      rootLayerIds,
      editableLayerIds,
      slotBindings,
      expectedFinalRevision: canonicalResult.finalRevision,
    };

    const commitPayload: EditableBannerDraftCommitPayload = {
      commitPayloadId,
      commitPayloadVersion: "v1",
      eventSequence: maxMutationEventSequence + checkpoints.length + 1,
      runId: run.runId,
      canonicalRunId: run.runId,
      parentMutationRangeRef,
      traceId: run.traceId,
      draftId: input.draftId,
      pageId: run.pageId,
      commitMode: "apply_immediately",
      requiredSlots: [...REQUIRED_SLOTS],
      firstRenderableSeq: input.sourceMutationRange.firstSeq,
      reconciledThroughSeq: input.sourceMutationRange.reconciledThroughSeq,
      mutations: rangedRecords.map((record) => record.mutation),
      manifest: manifestProjection,
      savePlan: {
        milestoneReason: "milestone_first_editable",
        finalReason: "run_completed",
        saveRequired: true,
      },
    };

    const draftManifest: DraftManifest = {
      draftId: input.draftId,
      runId: run.runId,
      traceId: run.traceId,
      pageId: run.pageId,
      rootLayerIds,
      editableLayerIds,
      slotBindings,
      finalRevision: canonicalResult.finalRevision,
    };

    const completionSnapshot: RunCompletionSnapshot = {
      draftId: input.draftId,
      completionState: this.toCompletionState(canonicalResult.finalStatus),
      terminalStatus: canonicalResult.finalStatus,
      minimumDraftSatisfied,
      warnings: canonicalResult.warnings,
      completedAt: command.at,
      finalRevision: canonicalResult.finalRevision,
    };

    const bundle: LiveDraftArtifactBundle = {
      bundleId,
      artifactType: "LiveDraftArtifactBundle",
      artifactVersion: "v1",
      eventSequence: commitPayload.eventSequence + 1,
      runId: run.runId,
      canonicalRunId: run.runId,
      parentCommitPayloadRef: commitPayload.commitPayloadId,
      traceId: run.traceId,
      draftId: input.draftId,
      editableCanvasState: {
        commitPayload,
        draftManifest,
      },
      referencedStoredAssets: [],
      mutationLedger,
      saveMetadata: {
        latestSaveReceipt,
        completionSnapshot,
      },
    };

    if (checkpointSnapshotRef && checkpointId) {
      await this.objectStore.putObject({
        key: checkpointSnapshotRef,
        body: JSON.stringify({
          draftManifest,
          completionSnapshot,
          sourceMutationRange: input.sourceMutationRange,
        }),
        contentType: "application/json",
        metadata: {
          runId: run.runId,
          traceId: run.traceId,
          checkpointId,
        },
      });
    }

    await this.objectStore.putObject({
      key: bundleRef,
      body: JSON.stringify(bundle),
      contentType: "application/json",
      metadata: {
        runId: run.runId,
        traceId: run.traceId,
        bundleId,
      },
    });

    const completionRecord: RunCompletionRecord = {
      completionRecordId,
      completionSchemaVersion: "v1",
      eventSequence: bundle.eventSequence + 1,
      runId: run.runId,
      canonicalRunId: run.runId,
      traceId: run.traceId,
      draftId: input.draftId,
      pageId: run.pageId,
      bundleId,
      parentBundleRef: bundleId,
      commitPayloadId,
      canonicalArtifactKind: "LiveDraftArtifactBundle",
      terminalStatus: canonicalResult.finalStatus,
      completionState: this.toCompletionState(canonicalResult.finalStatus),
      durabilityState: canonicalResult.durabilityState,
      minimumDraftSatisfied,
      sourceMutationRange: input.sourceMutationRange,
      finalRevision: canonicalResult.finalRevision,
      latestSaveReceiptId: canonicalResult.latestSaveReceiptId,
      draftGeneratedAt: command.at,
      completedAt: command.at,
      sourceRefs: {
        requestRef: run.requestRef,
        snapshotRef: run.snapshotRef,
        normalizedIntentRef: input.normalizedIntentRef,
        ...(input.normalizedIntentDraftRef
          ? { normalizedIntentDraftRef: input.normalizedIntentDraftRef }
          : {}),
        ...(input.intentNormalizationReportRef
          ? { intentNormalizationReportRef: input.intentNormalizationReportRef }
          : {}),
        ...(input.copyPlanRef ? { copyPlanRef: input.copyPlanRef } : {}),
        ...(input.copyPlanNormalizationReportRef
          ? {
              copyPlanNormalizationReportRef:
                input.copyPlanNormalizationReportRef,
            }
          : {}),
        ...(input.abstractLayoutPlanRef
          ? { abstractLayoutPlanRef: input.abstractLayoutPlanRef }
          : {}),
        ...(input.abstractLayoutPlanNormalizationReportRef
          ? {
              abstractLayoutPlanNormalizationReportRef:
                input.abstractLayoutPlanNormalizationReportRef,
            }
          : {}),
        ...(input.assetPlanRef ? { assetPlanRef: input.assetPlanRef } : {}),
        ...(input.concreteLayoutPlanRef
          ? { concreteLayoutPlanRef: input.concreteLayoutPlanRef }
          : {}),
        ...(input.templatePriorSummaryRef
          ? { templatePriorSummaryRef: input.templatePriorSummaryRef }
          : {}),
        ...(input.searchProfileRef ? { searchProfileRef: input.searchProfileRef } : {}),
        executablePlanRef: input.executablePlanRef,
        ...(input.candidateSetRef ? { candidateSetRef: input.candidateSetRef } : {}),
        ...(input.sourceSearchSummaryRef
          ? { sourceSearchSummaryRef: input.sourceSearchSummaryRef }
          : {}),
        ...(input.retrievalStageRef ? { retrievalStageRef: input.retrievalStageRef } : {}),
        ...(input.selectionDecisionRef
          ? { selectionDecisionRef: input.selectionDecisionRef }
          : {}),
        ...(input.typographyDecisionRef
          ? { typographyDecisionRef: input.typographyDecisionRef }
          : {}),
        ...(input.ruleJudgeVerdictRef
          ? { ruleJudgeVerdictRef: input.ruleJudgeVerdictRef }
          : {}),
        ...(input.executionSceneSummaryRef
          ? { executionSceneSummaryRef: input.executionSceneSummaryRef }
          : {}),
        ...(input.judgePlanRef ? { judgePlanRef: input.judgePlanRef } : {}),
        ...(input.refineDecisionRef
          ? { refineDecisionRef: input.refineDecisionRef }
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

  private hasCompleteSaveEvidence(
    request: RunFinalizeRequest,
    result: AgentRunResultSummary,
  ): boolean {
    return (
      (request.latestSaveReceiptId ?? null) !== null &&
      (request.outputTemplateCode ?? null) !== null &&
      result.finalRevision !== null
    );
  }

  private buildLatestSaveReceipt(
    command: FinalizeRunCommand,
    result: AgentRunResultSummary,
    outputTemplateCode: string | null,
  ): TemplateSaveReceipt | null {
    if (
      (result.finalStatus !== "completed" &&
        result.finalStatus !== "completed_with_warning") ||
      result.latestSaveReceiptId === null ||
      outputTemplateCode === null ||
      result.finalRevision === null
    ) {
      return null;
    }

    return {
      saveReceiptId: result.latestSaveReceiptId,
      outputTemplateCode,
      savedRevision: result.finalRevision,
      savedAt: command.at,
      reason: "run_completed",
    };
  }

  private buildMutationLedgerEntries(
    records: MutationLedgerRecord[],
  ): MutationLedgerEntry[] {
    return records.map((record) => ({
      seq: record.seq,
      mutationId: record.mutationId,
      eventSequence: record.seq,
      batchId: record.mutation.commitGroup,
      planStepId: record.mutation.commitGroup,
      commandOps: record.mutation.commands.map((command) => command.op),
      clientLayerKeys: record.mutation.commands.flatMap((command) =>
        command.targetRef.clientLayerKey ? [command.targetRef.clientLayerKey] : [],
      ),
      targetLayerIds: [
        ...new Set(
          Object.values(record.ackRecord?.resolvedLayerIds ?? {}).filter(
            (layerId): layerId is string => typeof layerId === "string" && layerId.length > 0,
          ),
        ),
      ],
      baseRevision: record.mutation.expectedBaseRevision,
      ackRevision: record.ackRecord?.resultingRevision ?? null,
      applyStatus: this.toApplyStatus(record.ackStatus),
      rollbackGroupId: record.rollbackGroupId,
      emittedAt: record.proposedAt,
      appliedAt: record.ackRecord?.clientObservedAt ?? null,
    }));
  }

  private buildSlotBindings(records: MutationLedgerRecord[]): DraftManifest["slotBindings"] {
    const bindingsBySlot = new Map<string, DraftManifest["slotBindings"][number]>();

    for (const record of records) {
      for (const command of record.mutation.commands) {
        if (command.op !== "createLayer") {
          continue;
        }

        const executionSlotKey = this.resolveExecutionSlotKey(command);
        const slotIdentity =
          executionSlotKey ?? ("executionSlotKey" in command ? null : command.slotKey ?? null);
        if (slotIdentity === null) {
          continue;
        }

        const resolvedLayerId = this.resolvePrimaryLayerId(record, command);
        bindingsBySlot.set(slotIdentity, {
          slotKey: command.slotKey ?? null,
          executionSlotKey,
          primaryLayerId: resolvedLayerId,
          layerIds: [resolvedLayerId],
          layerType: command.layerBlueprint.layerType,
          status: "ready",
          editable: command.editable,
          ...(command.layerBlueprint.assetBinding?.assetId
            ? { assetId: command.layerBlueprint.assetBinding.assetId }
            : {}),
          ...(command.targetRef.clientLayerKey
            ? { assetRefKey: command.targetRef.clientLayerKey }
            : {}),
        });
      }
    }

    return [...bindingsBySlot.values()];
  }

  private resolvePrimaryLayerId(
    record: MutationLedgerRecord,
    command: Extract<CanvasMutationCommand, { op: "createLayer" }>,
  ): string {
    const clientLayerKey = command.targetRef.clientLayerKey;
    if (clientLayerKey && record.ackRecord?.resolvedLayerIds?.[clientLayerKey]) {
      return record.ackRecord.resolvedLayerIds[clientLayerKey];
    }
    return clientLayerKey;
  }

  private hasMinimumRequiredSlots(records: MutationLedgerRecord[]): boolean {
    const seen = new Set<string>();
    for (const record of records) {
      for (const command of record.mutation.commands) {
        if (command.op !== "createLayer") {
          continue;
        }

        const compatRequiredSlot = this.resolveRequiredCompatSlot(command);
        if (compatRequiredSlot) {
          seen.add(compatRequiredSlot);
        }
      }
    }
    return REQUIRED_SLOTS.every((slot) => seen.has(slot));
  }

  private resolveExecutionSlotKey(
    command: Extract<CanvasMutationCommand, { op: "createLayer" }>,
  ): ExecutionSlotKey | null {
    if ("executionSlotKey" in command) {
      return command.executionSlotKey ?? null;
    }

    switch (command.slotKey) {
      case "background":
        return "background";
      case "headline":
        return "headline";
      case "supporting_copy":
        return "subheadline";
      case "cta":
        return command.layerBlueprint.metadata.role === "cta" ? "cta" : null;
      case "badge":
        return "badge_text";
      case "hero_image":
        return "hero_image";
      case null:
        break;
      default:
        return null;
    }

    switch (command.layerBlueprint.metadata.role) {
      case "price_callout":
        return "offer_line";
      case "footer_note":
        return "footer_note";
      default:
        return null;
    }
  }

  private resolveRequiredCompatSlot(
    command: Extract<CanvasMutationCommand, { op: "createLayer" }>,
  ): (typeof REQUIRED_SLOTS)[number] | null {
    const executionSlotKey = this.resolveExecutionSlotKey(command);
    switch (executionSlotKey) {
      case "background":
        return "background";
      case "headline":
        return "headline";
      case "subheadline":
        return "supporting_copy";
      case "cta":
        return "cta";
      default:
        return command.slotKey !== null &&
          REQUIRED_SLOTS.includes(command.slotKey as (typeof REQUIRED_SLOTS)[number])
          ? (command.slotKey as (typeof REQUIRED_SLOTS)[number])
          : null;
    }
  }

  private enforceMinimumDraft(
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
      latestSaveReceiptId: null,
      warningCount: result.warnings.length + 1,
      warnings: [...result.warnings, issue],
      errorSummary: issue,
    };
  }

  private toApplyStatus(
    ackStatus: MutationLedgerRecord["ackStatus"],
  ): MutationLedgerEntry["applyStatus"] {
    switch (ackStatus) {
      case "applied":
      case "noop_already_applied":
        return "applied";
      case "rejected":
        return "failed";
      case null:
      default:
        return "pending";
    }
  }

  private toCompletionState(
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

  private mapFinalStatusToAttemptState(
    finalStatus: AgentRunResultSummary["finalStatus"],
  ): "succeeded" | "failed" | "cancelled" {
    switch (finalStatus) {
      case "completed":
      case "completed_with_warning":
        return "succeeded";
      case "cancelled":
        return "cancelled";
      case "save_failed_after_apply":
      case "failed":
        return "failed";
    }
  }
}
