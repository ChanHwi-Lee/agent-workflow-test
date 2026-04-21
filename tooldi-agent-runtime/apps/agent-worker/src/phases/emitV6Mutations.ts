import type {
  CanvasMutationCommand,
  ExecutablePlan,
  PersistedPlanAction,
} from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";

import type {
  HydratedPlanningInput,
  MutationProposalDraft,
  SkeletonMutationBatch,
} from "../types.js";

// v6 pipeline operation marker. The emit router (`emitSkeletonMutations.ts`)
// switches on this operation without parsing the whole command shape.
export const V6_APPLY_OPERATION = "v6_apply_freeform_layout";
export const V6_INPUT_COMMANDS_KEY = "v6Commands";

export function isV6PlanAction(action: PersistedPlanAction): boolean {
  return action.operation === V6_APPLY_OPERATION;
}

/**
 * v6 emitter: produces exactly one MutationProposalDraft whose canvas.mutation
 * envelope carries the full CreateLayerCommand[] produced by the
 * DOM→primitive→adapter pipeline. No per-stage (foundation/photo/copy/polish)
 * decomposition — the rendered DOM is the plan.
 *
 * Shape matches v5 intentionally so FE / ack paths remain unchanged; only the
 * operation name and command source are different.
 */
export function buildV6SkeletonBatch(
  input: HydratedPlanningInput,
  plan: ExecutablePlan,
): SkeletonMutationBatch {
  const v6Action = plan.actions.find(isV6PlanAction);
  if (!v6Action) {
    throw new Error(
      `buildV6SkeletonBatch called without a "${V6_APPLY_OPERATION}" action in the plan`,
    );
  }

  const rawCommands = v6Action.inputs[V6_INPUT_COMMANDS_KEY];
  if (!Array.isArray(rawCommands) || rawCommands.length === 0) {
    throw new Error(
      `v6 action is missing inputs.${V6_INPUT_COMMANDS_KEY} or the array is empty`,
    );
  }
  // CreateLayerCommand (agent-contracts TypeBox-derived) is the canonical
  // command shape; v6 adapter emits it directly.
  const commands = rawCommands as unknown as CanvasMutationCommand[];

  const mutationId = createRequestId();
  const rollbackGroupId = createRequestId();
  const commitGroup = v6Action.commitGroup;
  const draftId = `draft_${input.job.runId}`;
  const documentId = input.request.editorContext.documentId;
  const pageId = input.request.editorContext.pageId;

  const proposal: MutationProposalDraft = {
    mutationId,
    rollbackGroupId,
    stageLabel: "v6-freeform-layout",
    stageDescription: `Apply ${commands.length} v6 DOM-extracted layer commands`,
    mutation: {
      mutationId,
      mutationVersion: "v1",
      traceId: input.job.traceId,
      runId: input.job.runId,
      draftId,
      documentId,
      pageId,
      seq: 1,
      commitGroup,
      idempotencyKey: `mutation_v6_freeform_layout_${input.job.runId}`,
      expectedBaseRevision: 0,
      ownershipScope: "draft_only",
      commands,
      rollbackHint: {
        rollbackGroupId,
        strategy: "delete_created_layers",
      },
      emittedAt: new Date().toISOString(),
      deliveryDeadlineAt: new Date(Date.now() + 10000).toISOString(),
    },
  };

  return {
    commitGroup,
    proposals: [proposal],
  };
}
