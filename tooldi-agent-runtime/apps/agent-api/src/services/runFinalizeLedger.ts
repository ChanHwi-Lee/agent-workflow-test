import type {
  CanvasMutationCommand,
  DraftManifest,
  ExecutionSlotKey,
  MutationLedgerEntry,
  RunFinalizeRequest,
} from "@tooldi/agent-contracts";

import type { MutationLedgerRecord } from "../repositories/mutationLedgerRepository.js";

const REQUIRED_SLOTS = [
  "background",
  "headline",
  "supporting_copy",
  "cta",
  "decoration",
] as const;

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
    minimumDraftSatisfied: hasMinimumRequiredSlots(rangedRecords),
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
    applyStatus: toApplyStatus(record.ackStatus),
    rollbackGroupId: record.rollbackGroupId,
    emittedAt: record.proposedAt,
    appliedAt: record.ackRecord?.clientObservedAt ?? null,
  }));
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

      const executionSlotKey = resolveExecutionSlotKey(command);
      const slotIdentity =
        executionSlotKey ?? ("executionSlotKey" in command ? null : command.slotKey ?? null);
      if (slotIdentity === null) {
        continue;
      }

      const resolvedLayerId = resolvePrimaryLayerId(record, command);
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

function hasMinimumRequiredSlots(records: MutationLedgerRecord[]): boolean {
  const seen = new Set<string>();
  for (const record of records) {
    for (const command of record.mutation.commands) {
      if (command.op !== "createLayer") {
        continue;
      }

      const compatRequiredSlot = resolveRequiredCompatSlot(command);
      if (compatRequiredSlot) {
        seen.add(compatRequiredSlot);
      }
    }
  }
  return REQUIRED_SLOTS.every((slot) => seen.has(slot));
}

function resolveExecutionSlotKey(
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

function resolveRequiredCompatSlot(
  command: Extract<CanvasMutationCommand, { op: "createLayer" }>,
): (typeof REQUIRED_SLOTS)[number] | null {
  const executionSlotKey = resolveExecutionSlotKey(command);
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
