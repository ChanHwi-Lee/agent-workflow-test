import { createRequestId } from "@tooldi/agent-domain";
import type { CanvasMutationEnvelope, ExecutablePlan, WaitMutationAckResponse } from "@tooldi/agent-contracts";
import type { TextLayoutHelper } from "@tooldi/tool-adapters";

import { emitSkeletonMutations } from "./emitSkeletonMutations.js";
import type {
  ConcreteLayoutAnchorZone,
  ConcreteLayoutClusterZone,
  CopyPlan,
  ExecutionSceneSummary,
  HydratedPlanningInput,
  NormalizedIntent,
  RefineDecision,
  RefinementMutationBatch,
  RefinementPatchOperation,
} from "../types.js";

export interface EmitRefinementMutationsDependencies {
  textLayoutHelper: TextLayoutHelper;
}

type CreateLayerCommand = Extract<
  CanvasMutationEnvelope["commands"][number],
  { op: "createLayer" }
>;
type UpdateLayerCommand = Extract<
  CanvasMutationEnvelope["commands"][number],
  { op: "updateLayer" }
>;

type CopyLayerBinding = ExecutionSceneSummary["copyLayerBindings"][number];

export async function emitRefinementMutations(
  input: HydratedPlanningInput,
  normalizedIntent: NormalizedIntent,
  executablePlan: ExecutablePlan,
  _copyPlan: CopyPlan,
  executionSceneSummary: ExecutionSceneSummary,
  refineDecision: RefineDecision,
  lastMutationAck: WaitMutationAckResponse | null,
  dependencies: EmitRefinementMutationsDependencies,
): Promise<RefinementMutationBatch> {
  if (
    lastMutationAck?.status !== "acked" ||
    refineDecision.decision !== "patch" ||
    !refineDecision.patchPlan
  ) {
    return {
      proposal: null,
      refinedPlan: executablePlan,
      refinedPlanRef: null,
      proposedMutationIds: [],
      lastMutationAck,
    };
  }

  const refinedPlan = applyPatchPlanToExecutablePlan(
    executablePlan,
    refineDecision.patchPlan.operations,
    {
      canvasWidth: input.request.editorContext.canvasWidth,
      canvasHeight: input.request.editorContext.canvasHeight,
    },
  );
  const refinedBatch = await emitSkeletonMutations(input, normalizedIntent, refinedPlan, {
    textLayoutHelper: dependencies.textLayoutHelper,
  });
  const proposal = buildRefinementProposal(
    input,
    refinedBatch,
    executionSceneSummary,
    lastMutationAck,
    refineDecision.patchPlan.operations,
  );

  return {
    proposal,
    refinedPlan,
    refinedPlanRef: null,
    proposedMutationIds: proposal ? [proposal.mutationId] : [],
    lastMutationAck,
  };
}

function applyPatchPlanToExecutablePlan(
  executablePlan: ExecutablePlan,
  operations: RefinementPatchOperation[],
  canvasSize: {
    canvasWidth: number;
    canvasHeight: number;
  },
): ExecutablePlan {
  const actions = executablePlan.actions.map((action) => ({
    ...action,
    inputs:
      action.inputs && typeof action.inputs === "object"
        ? JSON.parse(JSON.stringify(action.inputs))
        : action.inputs,
  }));

  const copyAction = actions.find((action) => action.operation === "place_copy_cluster");
  const polishAction = actions.find((action) => action.operation === "place_promo_polish");

  for (const operation of operations) {
    switch (operation.kind) {
      case "rewrite_copy_slot_text":
        if (copyAction?.inputs && typeof copyAction.inputs === "object") {
          const copySlotTexts = ensureRecord(copyAction.inputs.copySlotTexts);
          copySlotTexts[operation.executionSlotKey] = operation.text;
          copyAction.inputs.copySlotTexts = copySlotTexts;
        }
        rewriteFreeformBlockText(copyAction, operation.executionSlotKey, operation.text);
        rewriteFreeformBlockText(polishAction, operation.executionSlotKey, operation.text);
        break;
      case "move_copy_slot_anchor":
        if (copyAction?.inputs && typeof copyAction.inputs === "object") {
          const copySlotAnchors = ensureRecord(copyAction.inputs.copySlotAnchors);
          copySlotAnchors[operation.executionSlotKey] = operation.anchor;
          copyAction.inputs.copySlotAnchors = copySlotAnchors;
        }
        moveFreeformBlockAnchor(
          copyAction,
          operation.executionSlotKey,
          operation.anchor,
          canvasSize,
        );
        moveFreeformBlockAnchor(
          polishAction,
          operation.executionSlotKey,
          operation.anchor,
          canvasSize,
        );
        break;
      case "set_spacing_intent":
        if (copyAction?.inputs && typeof copyAction.inputs === "object") {
          copyAction.inputs.spacingIntent = operation.spacingIntent;
        }
        if (polishAction?.inputs && typeof polishAction.inputs === "object") {
          polishAction.inputs.spacingIntent = operation.spacingIntent;
        }
        applyFreeformSpacing(copyAction, operation.spacingIntent);
        applyFreeformSpacing(polishAction, operation.spacingIntent);
        break;
    }
  }

  return {
    ...executablePlan,
    actions,
  };
}

function buildRefinementProposal(
  input: HydratedPlanningInput,
  refinedBatch: Awaited<ReturnType<typeof emitSkeletonMutations>>,
  executionSceneSummary: ExecutionSceneSummary,
  lastMutationAck: WaitMutationAckResponse,
  operations: RefinementPatchOperation[],
) {
  const refinedCreateCommands = refinedBatch.proposals.flatMap((proposal) =>
    proposal.mutation.commands.filter(
      (
        command,
      ): command is CreateLayerCommand => command.op === "createLayer",
    ),
  );
  const refinedCommandsByExecutionSlot = new Map(
    refinedCreateCommands
      .filter((command) => command.executionSlotKey !== null && command.executionSlotKey !== undefined)
      .map((command) => [command.executionSlotKey!, command] as const),
  );
  const commands = compilePatchCommands(
    operations,
    refinedCommandsByExecutionSlot,
    refinedCreateCommands,
    executionSceneSummary,
    lastMutationAck,
  );

  if (commands.length === 0) {
    return null;
  }

  const mutationId = createRequestId();
  const rollbackGroupId = createRequestId();
  const mutation: CanvasMutationEnvelope = {
    mutationId,
    mutationVersion: "v1",
    traceId: input.job.traceId,
    runId: input.job.runId,
    draftId: `draft_${input.job.runId}`,
    documentId: input.request.editorContext.documentId,
    pageId: input.request.editorContext.pageId,
    seq: (lastMutationAck.seq ?? 0) + 1,
    commitGroup: createRequestId(),
    dependsOnSeq: lastMutationAck.seq ?? null,
    idempotencyKey: `refine_patch_${input.job.runId}_${input.job.attemptSeq}`,
    expectedBaseRevision: lastMutationAck.resultingRevision ?? 0,
    ownershipScope: "draft_only",
    commands,
    rollbackHint: {
      rollbackGroupId,
      strategy: "inverse_patch",
    },
    emittedAt: new Date().toISOString(),
    deliveryDeadlineAt: new Date(Date.now() + 30_000).toISOString(),
  };

  return {
    mutationId,
    rollbackGroupId,
    stageLabel: "refine",
    stageDescription: "Apply a bounded patch-only refinement over the current editable draft",
    mutation,
  };
}

function compilePatchCommands(
  operations: RefinementPatchOperation[],
  refinedCommandsByExecutionSlot: Map<
    NonNullable<CreateLayerCommand["executionSlotKey"]>,
    CreateLayerCommand
  >,
  refinedCreateCommands: CreateLayerCommand[],
  executionSceneSummary: ExecutionSceneSummary,
  lastMutationAck: WaitMutationAckResponse,
): CanvasMutationEnvelope["commands"] {
  const rewriteSlots = new Set(
    operations
      .filter(
        (operation): operation is Extract<
          RefinementPatchOperation,
          { kind: "rewrite_copy_slot_text" }
        > => operation.kind === "rewrite_copy_slot_text",
      )
      .map((operation) => operation.executionSlotKey),
  );
  const requiresLayoutPatch = operations.some(
    (operation) =>
      operation.kind === "move_copy_slot_anchor" ||
      operation.kind === "set_spacing_intent",
  );

  const commands: CanvasMutationEnvelope["commands"] = [];

  for (const binding of executionSceneSummary.copyLayerBindings) {
    const refinedCommand = refinedCommandsByExecutionSlot.get(binding.executionSlotKey);
    if (!refinedCommand || !binding.layerId) {
      continue;
    }

    const nextBounds = refinedCommand.layerBlueprint.bounds;
    const currentBounds = binding.resolvedBounds ?? binding.plannedBounds;
    const boundsChanged =
      requiresLayoutPatch && !areBoundsEqual(currentBounds, nextBounds);
    const textChanged = rewriteSlots.has(binding.executionSlotKey);

    if (!boundsChanged && !textChanged) {
      continue;
    }

    const patchMask: UpdateLayerCommand["patchMask"] = [];
    const patch: UpdateLayerCommand["patch"] = {};
    if (boundsChanged) {
      patchMask.push("bounds");
      patch.bounds = nextBounds;
    }
    if (textChanged) {
      patchMask.push("metadata");
      patch.metadata = {
        copyText: readCommandCopyText(refinedCommand),
      };
    }

    commands.push(
      buildUpdateLayerPatchCommand(
        refinedCommand,
        { ...binding, layerId: binding.layerId },
        patchMask,
        patch,
        lastMutationAck,
      ),
    );
  }

  return commands;
}

function buildUpdateLayerPatchCommand(
  command: CreateLayerCommand,
  binding: CopyLayerBinding & { layerId: string },
  patchMask: UpdateLayerCommand["patchMask"],
  patch: UpdateLayerCommand["patch"],
  lastMutationAck: WaitMutationAckResponse,
): UpdateLayerCommand {
  return {
    commandId: createRequestId(),
    op: "updateLayer",
    executionSlotKey: command.executionSlotKey ?? null,
    clientLayerKey: command.clientLayerKey,
    targetRef: {
      layerId: binding.layerId,
      clientLayerKey: command.clientLayerKey,
    },
    targetLayerVersion: lastMutationAck.resultingRevision ?? 0,
    expectedLayerType: command.layerBlueprint.layerType as UpdateLayerCommand["expectedLayerType"],
    allowNoop: true,
    metadataTags: {
      phase: "refine",
      role:
        typeof command.layerBlueprint.metadata.role === "string"
          ? command.layerBlueprint.metadata.role
          : null,
    },
    patchMask,
    patch,
    preserveLayerId: true,
  };
}

function readCommandCopyText(command: CreateLayerCommand): string | null {
  return typeof command.layerBlueprint.metadata.copyText === "string"
    ? command.layerBlueprint.metadata.copyText
    : null;
}

function areBoundsEqual(
  left:
    | ExecutionSceneSummary["copyLayerBindings"][number]["resolvedBounds"]
    | null,
  right: CreateLayerCommand["layerBlueprint"]["bounds"],
): boolean {
  if (!left) {
    return false;
  }
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function ensureRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? { ...(value as Record<string, unknown>) } : {};
}

function rewriteFreeformBlockText(
  action: ExecutablePlan["actions"][number] | undefined,
  executionSlotKey: string,
  text: string,
): void {
  if (!action?.inputs || typeof action.inputs !== "object" || !Array.isArray(action.inputs.freeformBlocks)) {
    return;
  }
  action.inputs.freeformBlocks = action.inputs.freeformBlocks.map((block) =>
    block &&
    typeof block === "object" &&
    "executionSlotKey" in block &&
    block.executionSlotKey === executionSlotKey
      ? {
          ...block,
          textContent: text,
        }
      : block,
  );
}

function moveFreeformBlockAnchor(
  action: ExecutablePlan["actions"][number] | undefined,
  executionSlotKey: string,
  anchor: ConcreteLayoutAnchorZone,
  canvasSize: {
    canvasWidth: number;
    canvasHeight: number;
  },
): void {
  if (!action?.inputs || typeof action.inputs !== "object" || !Array.isArray(action.inputs.freeformBlocks)) {
    return;
  }
  action.inputs.freeformBlocks = action.inputs.freeformBlocks.map((block) => {
    if (
      !block ||
      typeof block !== "object" ||
      !("executionSlotKey" in block) ||
      block.executionSlotKey !== executionSlotKey ||
      !("bounds" in block) ||
      !block.bounds
    ) {
      return block;
    }
    const blockWithBounds = block as { bounds: { x: number; y: number; width: number; height: number } };
    const bounds = { ...blockWithBounds.bounds };
    if (anchor === "bottom_center") {
      bounds.x = Math.round((canvasSize.canvasWidth - bounds.width) / 2);
      bounds.y = Math.max(
        0,
        canvasSize.canvasHeight - bounds.height - Math.round(canvasSize.canvasHeight * 0.08),
      );
    }
    return {
      ...block,
      bounds,
    };
  });
}

function applyFreeformSpacing(
  action: ExecutablePlan["actions"][number] | undefined,
  spacingIntent: "dense" | "balanced" | "airy",
): void {
  if (!action?.inputs || typeof action.inputs !== "object" || !Array.isArray(action.inputs.freeformBlocks)) {
    return;
  }
  const gap = spacingIntent === "airy" ? 28 : spacingIntent === "balanced" ? 18 : 10;
  let cursorY: number | null = null;
  action.inputs.freeformBlocks = action.inputs.freeformBlocks.map((block) => {
    if (
      !block ||
      typeof block !== "object" ||
      !("executionSlotKey" in block) ||
      block.executionSlotKey == null ||
      !("bounds" in block) ||
      !block.bounds
    ) {
      return block;
    }
    const blockWithBounds = block as { bounds: { x: number; y: number; width: number; height: number } };
    const nextBounds = { ...blockWithBounds.bounds };
    if (cursorY === null) {
      cursorY = nextBounds.y + nextBounds.height + gap;
      return block;
    }
    nextBounds.y = cursorY;
    cursorY = nextBounds.y + nextBounds.height + gap;
    return {
      ...block,
      bounds: nextBounds,
    };
  });
}
