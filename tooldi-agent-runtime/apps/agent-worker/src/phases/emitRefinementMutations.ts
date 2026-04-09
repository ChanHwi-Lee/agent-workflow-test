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
  );
  const refinedBatch = await emitSkeletonMutations(input, normalizedIntent, refinedPlan, {
    textLayoutHelper: dependencies.textLayoutHelper,
  });
  const proposal = buildRefinementProposal(
    input,
    refinedBatch,
    executionSceneSummary,
    lastMutationAck,
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
          copySlotTexts[operation.slotKey] = operation.text;
          copyAction.inputs.copySlotTexts = copySlotTexts;
        }
        break;
      case "move_copy_slot_anchor":
        if (copyAction?.inputs && typeof copyAction.inputs === "object") {
          const copySlotAnchors = ensureRecord(copyAction.inputs.copySlotAnchors);
          copySlotAnchors[operation.slotKey] = operation.anchor;
          copyAction.inputs.copySlotAnchors = copySlotAnchors;
        }
        break;
      case "set_spacing_intent":
        if (copyAction?.inputs && typeof copyAction.inputs === "object") {
          copyAction.inputs.spacingIntent = operation.spacingIntent;
        }
        if (polishAction?.inputs && typeof polishAction.inputs === "object") {
          polishAction.inputs.spacingIntent = operation.spacingIntent;
        }
        break;
      case "move_graphic_role_zone":
        if (polishAction?.inputs && typeof polishAction.inputs === "object") {
          const hints = Array.isArray(polishAction.inputs.graphicRolePlacementHints)
            ? JSON.parse(JSON.stringify(polishAction.inputs.graphicRolePlacementHints))
            : [];
          const targetHint = hints.find(
            (hint: { role?: string }) => hint.role === operation.role,
          );
          if (targetHint) {
            targetHint.zone = operation.zone;
          }
          polishAction.inputs.graphicRolePlacementHints = hints;
        }
        break;
      case "ensure_cta_container_fallback":
        if (polishAction?.inputs && typeof polishAction.inputs === "object") {
          polishAction.inputs.ctaContainerExpected = true;
        }
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
) {
  const copyProposal = refinedBatch.proposals.find((proposal) => proposal.stageLabel === "copy");
  const polishProposal = refinedBatch.proposals.find(
    (proposal) => proposal.stageLabel === "polish",
  );

  const commands = [
    ...convertCreateCommandsToPatchCommands(
      copyProposal?.mutation.commands ?? [],
      executionSceneSummary,
      lastMutationAck,
    ),
    ...convertCreateCommandsToPatchCommands(
      polishProposal?.mutation.commands ?? [],
      executionSceneSummary,
      lastMutationAck,
    ),
  ];

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

function convertCreateCommandsToPatchCommands(
  commands: CanvasMutationEnvelope["commands"],
  executionSceneSummary: ExecutionSceneSummary,
  lastMutationAck: WaitMutationAckResponse,
): CanvasMutationEnvelope["commands"] {
  const converted: CanvasMutationEnvelope["commands"] = [];

  for (const command of commands) {
    if (command.op !== "createLayer") {
      continue;
    }

    const existingLayerId =
      resolveExistingLayerId(command, executionSceneSummary) ??
      (command.layerBlueprint.metadata.role === "cta_container" ? null : null);

    if (existingLayerId) {
      const patchMask: Array<
        "bounds" | "metadata" | "styleTokens"
      > = ["bounds", "metadata"];
      if (command.layerBlueprint.styleTokens) {
        patchMask.push("styleTokens");
      }
      converted.push({
        commandId: createRequestId(),
        op: "updateLayer",
        slotKey: command.slotKey,
        clientLayerKey: command.clientLayerKey,
        targetRef: {
          layerId: existingLayerId,
          clientLayerKey: command.clientLayerKey,
          ...(command.slotKey ? { slotKey: command.slotKey } : {}),
        },
        targetLayerVersion: lastMutationAck.resultingRevision ?? 0,
        expectedLayerType: command.layerBlueprint.layerType as
          | "shape"
          | "text"
          | "group"
          | "image"
          | "sticker",
        allowNoop: true,
        metadataTags: {
          phase: "refine",
          role:
            typeof command.layerBlueprint.metadata.role === "string"
              ? command.layerBlueprint.metadata.role
              : null,
        },
        patchMask,
        patch: {
          bounds: command.layerBlueprint.bounds,
          metadata: command.layerBlueprint.metadata,
          ...(command.layerBlueprint.styleTokens
            ? { styleTokens: command.layerBlueprint.styleTokens }
            : {}),
        },
        preserveLayerId: true,
      });
      continue;
    }

    if (
      typeof command.layerBlueprint.metadata.role === "string" &&
      command.layerBlueprint.metadata.role === "cta_container"
    ) {
      converted.push(command);
    }
  }

  return converted;
}

function resolveExistingLayerId(
  command: Extract<CanvasMutationEnvelope["commands"][number], { op: "createLayer" }>,
  executionSceneSummary: ExecutionSceneSummary,
): string | null {
  const metadataRole =
    typeof command.layerBlueprint.metadata.role === "string"
      ? command.layerBlueprint.metadata.role
      : null;
  const slotKey =
    command.slotKey === "badge"
      ? "badge_text"
      : command.slotKey === "supporting_copy"
        ? "subheadline"
        : command.slotKey === "background" ||
            command.slotKey === "headline" ||
            command.slotKey === "cta"
          ? command.slotKey
          : null;

  if (slotKey) {
    const binding = executionSceneSummary.copyLayerBindings.find(
      (candidate) => candidate.slotKey === slotKey,
    );
    if (binding?.layerId) {
      return binding.layerId;
    }
  }

  if (metadataRole === "price_callout") {
    return null;
  }

  if (metadataRole === "footer_note") {
    return (
      executionSceneSummary.copyLayerBindings.find(
        (candidate) => candidate.slotKey === "footer_note",
      )?.layerId ?? null
    );
  }

  if (metadataRole === "hero_image") {
    return executionSceneSummary.photoLayerBinding?.layerId ?? null;
  }

  if (metadataRole) {
    return (
      executionSceneSummary.graphicLayerBindings.find(
        (binding) => binding.role === metadataRole,
      )?.layerId ?? null
    );
  }

  return null;
}

function ensureRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? { ...(value as Record<string, unknown>) } : {};
}
