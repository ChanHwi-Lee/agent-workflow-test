import type {
  CanvasMutationCommand,
  DraftManifest,
  MutationLedgerEntry,
  RunFinalizeRequest,
  TemplateSaveEvidence,
  TemplateSaveReceipt,
} from "@tooldi/agent-contracts";

import type { MutationLedgerRecord } from "../repositories/mutationLedgerRepository.js";

export interface RunLedgerProjection {
  rangedRecords: MutationLedgerRecord[];
  orderedEntries: MutationLedgerEntry[];
  slotBindings: DraftManifest["slotBindings"];
  rootLayerIds: string[];
  editableLayerIds: string[];
  minimumDraftSatisfied: boolean;
  maxMutationEventSequence: number;
}

export function selectMutationRangeRecords(
  ledgerRecords: MutationLedgerRecord[],
  range: NonNullable<RunFinalizeRequest["sourceMutationRange"]>,
): MutationLedgerRecord[] {
  return ledgerRecords.filter(
    (record) => record.seq >= range.firstSeq && record.seq <= range.lastSeq,
  );
}

export function buildRunLedgerProjection(
  rangedRecords: MutationLedgerRecord[],
): RunLedgerProjection {
  const orderedEntries = buildMutationLedgerEntries(rangedRecords);
  const slotBindings = buildSlotBindings(rangedRecords);
  const rootLayerIds = slotBindings.map((binding) => binding.primaryLayerId);
  const editableLayerIds = slotBindings
    .filter((binding) => binding.editable)
    .flatMap((binding) => binding.layerIds);

  return {
    rangedRecords,
    orderedEntries,
    slotBindings,
    rootLayerIds,
    editableLayerIds,
    minimumDraftSatisfied:
      rootLayerIds.length > 0 && editableLayerIds.length > 0,
    maxMutationEventSequence: Math.max(
      ...rangedRecords.map((record) => record.seq),
    ),
  };
}

function buildMutationLedgerEntries(
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
          (layerId): layerId is string =>
            typeof layerId === "string" && layerId.length > 0,
        ),
      ),
    ],
    baseRevision: record.mutation.expectedBaseRevision,
    ackRevision: record.ackRecord?.resultingRevision ?? null,
    saveEvidence: findSaveEvidence(record.ackRecord?.commandResults),
    saveReceipt: findSaveReceipt(record.ackRecord?.commandResults),
    applyStatus: toApplyStatus(record.ackStatus),
    rollbackGroupId: record.rollbackGroupId,
    emittedAt: record.proposedAt,
    appliedAt: record.ackRecord?.clientObservedAt ?? null,
  }));
}

function findSaveEvidence(
  commandResults:
    | Array<{
        op: string;
        saveEvidence?: TemplateSaveEvidence;
        saveReceipt?: TemplateSaveReceipt;
      }>
    | undefined,
): TemplateSaveEvidence | null {
  return (
    commandResults?.find(
      (commandResult) =>
        commandResult.op === "saveTemplate" &&
        commandResult.saveEvidence !== undefined,
    )?.saveEvidence ?? null
  );
}

function findSaveReceipt(
  commandResults:
    | Array<{
        op: string;
        saveEvidence?: TemplateSaveEvidence;
        saveReceipt?: TemplateSaveReceipt;
      }>
    | undefined,
): TemplateSaveReceipt | null {
  return (
    commandResults?.find(
      (commandResult) =>
        commandResult.op === "saveTemplate" &&
        commandResult.saveReceipt !== undefined,
    )?.saveReceipt ?? null
  );
}

function buildSlotBindings(
  records: MutationLedgerRecord[],
): DraftManifest["slotBindings"] {
  const bindingsBySlot = new Map<string, DraftManifest["slotBindings"][number]>();

  for (const record of records) {
    for (const command of record.mutation.commands) {
      if (command.op !== "createLayer") {
        continue;
      }

      const executionSlotKey =
        "executionSlotKey" in command ? command.executionSlotKey ?? null : null;
      if (executionSlotKey === null) {
        continue;
      }

      const resolvedLayerId = resolvePrimaryLayerId(record, command);
      bindingsBySlot.set(executionSlotKey, {
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

function resolvePrimaryLayerId(
  record: MutationLedgerRecord,
  command: Extract<CanvasMutationCommand, { op: "createLayer" }>,
): string {
  const clientLayerKey = command.targetRef.clientLayerKey;
  if (clientLayerKey && record.ackRecord?.resolvedLayerIds?.[clientLayerKey]) {
    return record.ackRecord.resolvedLayerIds[clientLayerKey];
  }
  return clientLayerKey;
}

function toApplyStatus(
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
