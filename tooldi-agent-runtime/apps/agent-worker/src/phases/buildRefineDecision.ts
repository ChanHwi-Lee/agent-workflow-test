import { createRequestId } from "@tooldi/agent-domain";

import type {
  CopyPlan,
  JudgePlan,
  ProcessRunJobResult,
  RefineDecision,
  RefinementPatchOperation,
  RefinementPatchPlan,
} from "../types.js";

export async function buildRefineDecision(
  runId: string,
  traceId: string,
  refineAttempt: 0 | 1,
  judgePlan: JudgePlan,
  copyPlan: CopyPlan,
  executablePlan: NonNullable<ProcessRunJobResult["plan"]>,
  targetRevision: number | null,
): Promise<RefineDecision> {
  if (judgePlan.recommendation !== "refine" || refineAttempt > 0) {
    return {
      decisionId: createRequestId(),
      runId,
      traceId,
      decision: "skip",
      reason:
        refineAttempt > 0
          ? "bounded refine budget exhausted after one patch pass"
          : "post-execution judge did not request a patch refinement",
      refineAttempt,
      targetRevision,
      patchPlan: null,
    };
  }

  const operations: RefinementPatchOperation[] = [];
  const hasGenericPromoSafeHeadline = copyPlan.primaryMessage.trim().length > 0;

  for (const issue of judgePlan.issues) {
    switch (issue.code) {
      case "preflight_copy_cta_subject_mismatch":
      case "preflight_cta_missing_or_weak":
        operations.push({
          kind: "rewrite_copy_slot_text",
          slotKey: "cta",
          text: "혜택 보기",
        });
        break;
      case "preflight_headline_overflow_risk":
        if (hasGenericPromoSafeHeadline) {
          operations.push({
            kind: "rewrite_copy_slot_text",
            slotKey: "headline",
            text: copyPlan.primaryMessage,
          });
        }
        break;
      case "preflight_concrete_layout_slot_conflict":
      case "preflight_cta_copy_overlap_risk":
        operations.push({
          kind: "move_copy_slot_anchor",
          slotKey: "cta",
          anchor: "bottom_center",
        });
        operations.push({
          kind: "set_spacing_intent",
          spacingIntent: "balanced",
        });
        break;
      case "preflight_excessive_empty_space":
      case "copy_stack_spacing_weak":
        operations.push({
          kind: "set_spacing_intent",
          spacingIntent: nextSpacingIntent(executablePlan),
        });
        break;
      case "cta_container_missing_after_execution":
        operations.push({
          kind: "ensure_cta_container_fallback",
        });
        break;
      default:
        break;
    }
  }

  const patchPlan = dedupePatchOperations({
    patchPlanId: createRequestId(),
    runId,
    traceId,
    operations,
    summary:
      operations.length > 0
        ? `Prepared ${operations.length} patch operation(s) for a single bounded refinement pass`
        : "No deterministic patch operations were derived from the current judge plan",
  });

  return {
    decisionId: createRequestId(),
    runId,
    traceId,
    decision: patchPlan.operations.length > 0 ? "patch" : "skip",
    reason:
      patchPlan.operations.length > 0
        ? "post-execution judge requested a patch-only refinement"
        : "judge requested refinement but no deterministic patch could be derived",
    refineAttempt,
    targetRevision,
    patchPlan: patchPlan.operations.length > 0 ? patchPlan : null,
  };
}

function nextSpacingIntent(
  executablePlan: NonNullable<ProcessRunJobResult["plan"]>,
) {
  const copyAction = executablePlan.actions.find(
    (action) => action.operation === "place_copy_cluster",
  );
  const spacingIntent =
    copyAction?.inputs &&
    typeof copyAction.inputs === "object" &&
    "spacingIntent" in copyAction.inputs
      ? (copyAction.inputs.spacingIntent as string | undefined)
      : undefined;
  if (spacingIntent === "dense") {
    return "balanced" as const;
  }
  return "airy" as const;
}

function dedupePatchOperations(patchPlan: RefinementPatchPlan): RefinementPatchPlan {
  const seen = new Set<string>();
  const operations = patchPlan.operations.filter((operation) => {
    const key = JSON.stringify(operation);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return {
    ...patchPlan,
    operations,
    summary:
      operations.length > 0
        ? `Prepared ${operations.length} deduplicated patch operation(s) for a single bounded refinement pass`
        : patchPlan.summary,
  };
}
