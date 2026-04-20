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

export const V5_APPLY_OPERATION = "v5_apply_constrained_html_design";
export const V5_INPUT_COMMANDS_KEY = "v5Commands";

export function isV5PlanAction(action: PersistedPlanAction): boolean {
  return action.operation === V5_APPLY_OPERATION;
}

/**
 * v5 emitter: produces exactly one MutationProposalDraft whose
 * canvas.mutation envelope carries the full AgentCreateLayerCommand[] array
 * that the deterministic transpile stage already produced. No per-stage
 * (foundation/photo/copy/polish) decomposition — the HTML is the plan.
 *
 * This is a sibling of `emitSkeletonMutations`; the legacy path continues
 * to call that function unchanged. Routing happens in
 * `emitSkeletonMutations` by a guard on the first action's operation.
 */
export function buildV5SkeletonBatch(
  input: HydratedPlanningInput,
  plan: ExecutablePlan,
): SkeletonMutationBatch {
  const v5Action = plan.actions.find(isV5PlanAction);
  if (!v5Action) {
    throw new Error(
      `buildV5SkeletonBatch called without a "${V5_APPLY_OPERATION}" action in the plan`,
    );
  }

  const rawCommands = v5Action.inputs[V5_INPUT_COMMANDS_KEY];
  if (!Array.isArray(rawCommands) || rawCommands.length === 0) {
    throw new Error(
      `v5 action is missing inputs.${V5_INPUT_COMMANDS_KEY} or the array is empty`,
    );
  }
  // AgentCreateLayerCommand (our inline toolditor-aligned shape) is
  // structurally compatible with CanvasMutationCommand (TypeBox-derived union)
  // for the `createLayer` variant. Promotion to a single shared type is
  // scheduled for work order B.
  const commands = rawCommands as unknown as CanvasMutationCommand[];

  const mutationId = createRequestId();
  const rollbackGroupId = createRequestId();
  const commitGroup = v5Action.commitGroup;
  const draftId = `draft_${input.job.runId}`;
  const documentId = input.request.editorContext.documentId;
  const pageId = input.request.editorContext.pageId;

  const proposal: MutationProposalDraft = {
    mutationId,
    rollbackGroupId,
    stageLabel: "v5-constrained-html",
    stageDescription: `Apply ${commands.length} v5 HTML-transpiled layer commands`,
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
      idempotencyKey: `mutation_v5_constrained_html_${input.job.runId}`,
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
