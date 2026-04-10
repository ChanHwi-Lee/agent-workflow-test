import { createRequestId } from "@tooldi/agent-domain";

import type {
  AssetPlan,
  ConcreteLayoutPlan,
  CopyPlan,
  ExecutionSceneGraphicLayerBinding,
  ExecutionSceneSummary,
  ProcessRunJobResult,
  StageAckRecord,
} from "../types.js";

export async function buildExecutionSceneSummary(
  runId: string,
  traceId: string,
  attemptSeq: number,
  copyPlan: CopyPlan,
  assetPlan: AssetPlan,
  concreteLayoutPlan: ConcreteLayoutPlan,
  plan: NonNullable<ProcessRunJobResult["plan"]>,
  stageAckHistory: StageAckRecord[],
): Promise<ExecutionSceneSummary> {
  const finalRevision =
    [...stageAckHistory]
      .reverse()
      .find((record) => record.resultingRevision !== null)?.resultingRevision ?? null;

  const copyAction = plan.actions.find((action) => action.operation === "place_copy_cluster");
  const copySlotTexts = normalizeRecord(
    copyAction?.inputs && typeof copyAction.inputs === "object"
      ? (copyAction.inputs as Record<string, unknown>).copySlotTexts
      : null,
  );

  const copyLayerBindings = copyPlan.slots.map((slot) => {
    const matchingCommand = findLatestCommandByExecutionSlot(stageAckHistory, slot.key);
    return {
      executionSlotKey: slot.key,
      identityObserved: matchingCommand !== null,
      layerId: resolveCommandLayerId(matchingCommand),
      text:
        typeof copySlotTexts?.[slot.key] === "string"
          ? (copySlotTexts[slot.key] as string)
          : slot.text,
      anchor: concreteLayoutPlan.slotAnchors[slot.key] ?? null,
      plannedBounds:
        concreteLayoutPlan.resolvedSlotBounds[slot.key] ?? matchingCommand?.proposedBounds ?? null,
      resolvedBounds:
        matchingCommand?.proposedBounds ??
        concreteLayoutPlan.resolvedSlotBounds[slot.key] ??
        null,
    };
  });

  const graphicLayerBindings: ExecutionSceneGraphicLayerBinding[] =
    assetPlan.graphicRoleBindings.map((binding) => {
      const matchingCommand = findLatestGraphicCommandByRole(stageAckHistory, binding.role);
      const placementHint = concreteLayoutPlan.graphicRolePlacementHints.find(
        (hint) => hint.role === binding.role,
      );
      return {
        role: binding.role,
        layerId: resolveCommandLayerId(matchingCommand),
        zone: placementHint?.zone ?? null,
        sourceAssetId: binding.sourceAssetId,
        sourceSerial: binding.sourceSerial,
      };
    });

  const photoCommand =
    assetPlan.photoBinding !== null
      ? findLatestCommandByExecutionSlot(stageAckHistory, "hero_image")
      : null;

  return {
    summaryId: createRequestId(),
    runId,
    traceId,
    attemptSeq,
    finalRevision,
    stageResults: stageAckHistory,
    copyLayerBindings,
    graphicLayerBindings,
    photoLayerBinding:
      assetPlan.photoBinding === null
        ? null
        : {
            executionSlotKey: "hero_image",
            layerId: resolveCommandLayerId(photoCommand),
            sourceAssetId: assetPlan.photoBinding.sourceAssetId,
            sourceSerial: assetPlan.photoBinding.sourceSerial,
            plannedBounds:
              concreteLayoutPlan.resolvedSlotBounds.hero_image ??
              photoCommand?.proposedBounds ??
              null,
            resolvedBounds:
              photoCommand?.proposedBounds ??
              concreteLayoutPlan.resolvedSlotBounds.hero_image ??
              null,
          },
    ctaContainerResolved: graphicLayerBindings.some(
      (binding) => binding.role === "cta_container" && binding.layerId !== null,
    ),
    summary:
      `Execution scene captured ${stageAckHistory.length} acknowledged stages with ` +
      `${copyLayerBindings.filter((binding) => binding.layerId !== null).length} copy layers, ` +
      `${graphicLayerBindings.filter((binding) => binding.layerId !== null).length} graphic bindings, ` +
      `and primary visual family ${assetPlan.primaryVisualFamily}.`,
  };
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function findLatestCommandByExecutionSlot(
  stageAckHistory: StageAckRecord[],
  executionSlotKey: StageAckRecord["commands"][number]["executionSlotKey"],
) {
  for (let index = stageAckHistory.length - 1; index >= 0; index -= 1) {
    const record = stageAckHistory[index]!;
    for (let commandIndex = record.commands.length - 1; commandIndex >= 0; commandIndex -= 1) {
      const command = record.commands[commandIndex]!;
      if (command.executionSlotKey === executionSlotKey) {
        return {
          ...command,
          resolvedLayerIds: record.resolvedLayerIds,
        };
      }
    }
  }
  return null;
}

function findLatestGraphicCommandByRole(
  stageAckHistory: StageAckRecord[],
  role: string,
) {
  for (let index = stageAckHistory.length - 1; index >= 0; index -= 1) {
    const record = stageAckHistory[index]!;
    for (let commandIndex = record.commands.length - 1; commandIndex >= 0; commandIndex -= 1) {
      const command = record.commands[commandIndex]!;
      if (command.role === role) {
        return {
          ...command,
          resolvedLayerIds: record.resolvedLayerIds,
        };
      }
    }
  }
  return null;
}

function resolveCommandLayerId(
  command:
    | (StageAckRecord["commands"][number] & {
        resolvedLayerIds: Record<string, string> | null;
      })
    | null,
): string | null {
  if (!command) {
    return null;
  }
  if (command.clientLayerKey && command.resolvedLayerIds?.[command.clientLayerKey]) {
    return command.resolvedLayerIds[command.clientLayerKey]!;
  }
  return command.targetLayerId ?? null;
}
