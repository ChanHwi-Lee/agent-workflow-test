import { createRequestId } from "@tooldi/agent-domain";

import type {
  AssetPlan,
  ConcreteLayoutPlan,
  CopyPlan,
  CopyPlanSlotKey,
  FreeformRenderableBlock,
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
  const copyAction = plan.actions.find((action) => action.operation === "place_copy_cluster");
  const polishAction = plan.actions.find((action) => action.operation === "place_promo_polish");
  const isV2FreeformExecution =
    readExecutionMode(copyAction) === "v2_freeform" ||
    readExecutionMode(polishAction) === "v2_freeform";

  const finalRevision =
    [...stageAckHistory]
      .reverse()
      .find((record) => record.resultingRevision !== null)?.resultingRevision ?? null;

  const copySlotTexts = normalizeRecord(
    copyAction?.inputs && typeof copyAction.inputs === "object"
      ? (copyAction.inputs as Record<string, unknown>).copySlotTexts
      : null,
  );

  const copyLayerBindings = isV2FreeformExecution
    ? buildV2CopyLayerBindings(copyAction, polishAction, stageAckHistory)
    : copyPlan.slots.map((slot) => {
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
    isV2FreeformExecution
      ? buildV2GraphicLayerBindings(polishAction, stageAckHistory)
      : assetPlan.graphicRoleBindings.map((binding) => {
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
    ctaContainerResolved: !isV2FreeformExecution && graphicLayerBindings.some(
      (binding) => binding.role === "cta_container" && binding.layerId !== null,
    ),
    summary:
      `Execution scene captured ${stageAckHistory.length} acknowledged stages with ` +
      `${copyLayerBindings.filter((binding) => binding.layerId !== null).length} copy layers, ` +
      `${graphicLayerBindings.filter((binding) => binding.layerId !== null).length} graphic bindings, ` +
      `and primary visual family ${assetPlan.primaryVisualFamily}.`,
  };
}

function buildV2CopyLayerBindings(
  copyAction: NonNullable<ProcessRunJobResult["plan"]>["actions"][number] | undefined,
  polishAction: NonNullable<ProcessRunJobResult["plan"]>["actions"][number] | undefined,
  stageAckHistory: StageAckRecord[],
) {
  const expectedBlocks = [
    ...readFreeformBlocks(copyAction),
    ...readFreeformBlocks(polishAction),
  ].filter(
    (block): block is FreeformRenderableBlock & { executionSlotKey: CopyPlanSlotKey } =>
      isCopyPlanSlotKey(block.executionSlotKey),
  );

  return expectedBlocks.map((block) => {
    const matchingCommand = findLatestCommandByExecutionSlot(stageAckHistory, block.executionSlotKey);
    return {
      executionSlotKey: block.executionSlotKey!,
      identityObserved: matchingCommand !== null,
      layerId: resolveCommandLayerId(matchingCommand),
      text: block.textContent,
      anchor: null,
      plannedBounds: block.bounds,
      resolvedBounds: matchingCommand?.proposedBounds ?? block.bounds,
    };
  });
}

function buildV2GraphicLayerBindings(
  polishAction: NonNullable<ProcessRunJobResult["plan"]>["actions"][number] | undefined,
  stageAckHistory: StageAckRecord[],
): ExecutionSceneGraphicLayerBinding[] {
  return readFreeformBlocks(polishAction)
    .filter((block) => block.executionSlotKey === null && block.slotKey === "decoration")
    .map((block) => {
      const matchingCommand = findLatestGraphicCommandByRole(stageAckHistory, block.role);
      return {
        role: block.role as ExecutionSceneGraphicLayerBinding["role"],
        layerId: resolveCommandLayerId(matchingCommand),
        zone: block.clusterZone ?? null,
        sourceAssetId: block.sourceAssetId ?? null,
        sourceSerial: block.sourceSerial ?? null,
      };
    });
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readExecutionMode(
  action: NonNullable<ProcessRunJobResult["plan"]>["actions"][number] | undefined,
): string | null {
  if (!action?.inputs || typeof action.inputs !== "object") {
    return null;
  }
  return typeof action.inputs.executionMode === "string" ? action.inputs.executionMode : null;
}

function readFreeformBlocks(
  action: NonNullable<ProcessRunJobResult["plan"]>["actions"][number] | undefined,
): FreeformRenderableBlock[] {
  if (!action?.inputs || typeof action.inputs !== "object" || !Array.isArray(action.inputs.freeformBlocks)) {
    return [];
  }
  return action.inputs.freeformBlocks as unknown as FreeformRenderableBlock[];
}

function isCopyPlanSlotKey(value: unknown): value is CopyPlanSlotKey {
  return (
    value === "headline" ||
    value === "subheadline" ||
    value === "offer_line" ||
    value === "cta" ||
    value === "footer_note" ||
    value === "badge_text"
  );
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
