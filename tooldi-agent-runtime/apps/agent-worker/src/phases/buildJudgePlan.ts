import { createRequestId } from "@tooldi/agent-domain";

import type {
  ConcreteLayoutPlan,
  CopyPlan,
  ExecutionSceneSummary,
  JudgePatchScope,
  JudgePlan,
  JudgePlanIssue,
  ProcessRunJobResult,
  RuleJudgeIssue,
  RuleJudgeVerdict,
} from "../types.js";

export async function buildJudgePlan(
  runId: string,
  traceId: string,
  refineAttempt: 0 | 1,
  copyPlan: CopyPlan,
  concreteLayoutPlan: ConcreteLayoutPlan,
  executionSceneSummary: ExecutionSceneSummary,
  _executablePlan: NonNullable<ProcessRunJobResult["plan"]>,
  preflightVerdict: RuleJudgeVerdict | null,
): Promise<JudgePlan> {
  const issues: JudgePlanIssue[] = [];

  if (preflightVerdict) {
    issues.push(...mapPreflightIssues(preflightVerdict.issues, concreteLayoutPlan));
  }

  const requiredCopyBindings = copyPlan.slots.filter((slot) => slot.required);
  const missingIdentityBindings = requiredCopyBindings.filter((slot) => {
    const binding = executionSceneSummary.copyLayerBindings.find(
      (candidate) => candidate.executionSlotKey === slot.key,
    );
    return !binding?.identityObserved;
  });
  if (missingIdentityBindings.length > 0) {
    issues.push({
      code: "execution_slot_identity_missing",
      severity: "warn",
      message:
        `Execution scene summary did not preserve required execution slot identities: ` +
        `${missingIdentityBindings.map((slot) => slot.key).join(", ")}`,
      patchable: false,
      suggestedPatchScopes: [],
    });
  }

  const missingRequiredBindings = requiredCopyBindings.filter((slot) => {
    const binding = executionSceneSummary.copyLayerBindings.find(
      (candidate) => candidate.executionSlotKey === slot.key,
    );
    return binding?.identityObserved === true && !binding.layerId;
  });
  if (missingRequiredBindings.length > 0) {
    issues.push({
      code: "slot_materialization_missing",
      severity: "warn",
      message:
        `Execution did not materialize required copy slots: ` +
        `${missingRequiredBindings.map((slot) => slot.key).join(", ")}`,
      patchable: false,
      suggestedPatchScopes: [],
    });
  }

  if (hasCopyBoundsConflict(executionSceneSummary)) {
    issues.push({
      code: "topology_bounds_conflict",
      severity: "warn",
      message:
        "Resolved copy slot bounds overlap after execution, so the current topology is likely colliding in the visible draft",
      patchable: true,
      suggestedPatchScopes: ["slot_anchor", "spacing"],
    });
  }

  if (
    concreteLayoutPlan.ctaContainerExpected &&
    !executionSceneSummary.ctaContainerResolved
  ) {
    issues.push({
      code: "cta_container_missing_after_execution",
      severity: "warn",
      message: "CTA container was expected by the concrete layout but no CTA container layer was confirmed after execution",
      patchable: true,
      suggestedPatchScopes: ["cta_container"],
    });
  }

  if (
    concreteLayoutPlan.spacingIntent === "dense" &&
    executionSceneSummary.copyLayerBindings.filter((binding) => binding.layerId !== null)
      .length >= 4
  ) {
    issues.push({
      code: "copy_stack_spacing_weak",
      severity: "warn",
      message: "Dense spacing is likely to compress the current copy stack too aggressively",
      patchable: true,
      suggestedPatchScopes: ["spacing"],
    });
  }

  const badgeSlotPresent = copyPlan.slots.some((slot) => slot.key === "badge_text");
  if (
    badgeSlotPresent &&
    !executionSceneSummary.copyLayerBindings.some(
      (binding) =>
        binding.executionSlotKey === "badge_text" && binding.layerId !== null,
    )
  ) {
    issues.push({
      code: "badge_zone_mismatch",
      severity: "warn",
      message: "Badge text slot exists in the copy plan but no badge layer was confirmed after execution",
      patchable: false,
      suggestedPatchScopes: [],
    });
  }

  const footerBinding = executionSceneSummary.copyLayerBindings.find(
    (binding) => binding.executionSlotKey === "footer_note",
  );
  if (footerBinding && footerBinding.layerId === null) {
    issues.push({
      code: "footer_zone_mismatch",
      severity: "warn",
      message: "Footer note is part of the copy plan but no footer layer was confirmed after execution",
      patchable: false,
      suggestedPatchScopes: [],
    });
  }

  const allowedPatchScopes = uniquePatchScopes(issues);
  const patchable = issues.some((issue) => issue.patchable);
  const recommendation =
    issues.length === 0 ? "keep" : patchable && refineAttempt === 0 ? "refine" : "warn_only";

  return {
    judgePlanId: createRequestId(),
    runId,
    traceId,
    refineAttempt,
    recommendation,
    patchable,
    issues,
    allowedPatchScopes,
    summary:
      recommendation === "keep"
        ? "Post-execution judge confirmed the current scene summary without requiring a patch refinement"
        : recommendation === "refine"
          ? `Post-execution judge found ${issues.length} patchable issue(s) for a single bounded refinement pass`
          : `Post-execution judge found ${issues.length} residual issue(s) but no additional patch pass is allowed`,
  };
}

function hasCopyBoundsConflict(
  executionSceneSummary: ExecutionSceneSummary,
): boolean {
  const visibleBindings = executionSceneSummary.copyLayerBindings.filter(
    (binding) => binding.layerId !== null && binding.resolvedBounds !== null,
  );

  for (let index = 0; index < visibleBindings.length; index += 1) {
    const current = visibleBindings[index]!;
    for (let nextIndex = index + 1; nextIndex < visibleBindings.length; nextIndex += 1) {
      const next = visibleBindings[nextIndex]!;
      if (boundsOverlap(current.resolvedBounds!, next.resolvedBounds!)) {
        return true;
      }
    }
  }

  return false;
}

function boundsOverlap(
  left: NonNullable<ExecutionSceneSummary["copyLayerBindings"][number]["resolvedBounds"]>,
  right: NonNullable<ExecutionSceneSummary["copyLayerBindings"][number]["resolvedBounds"]>,
): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

function mapPreflightIssues(
  issues: RuleJudgeIssue[],
  _concreteLayoutPlan: ConcreteLayoutPlan,
): JudgePlanIssue[] {
  return issues.flatMap<JudgePlanIssue>((issue) => {
    switch (issue.code) {
      case "copy_cta_subject_mismatch":
      case "cta_missing_or_weak":
        return [
          {
            code:
              issue.code === "copy_cta_subject_mismatch"
                ? "preflight_copy_cta_subject_mismatch"
                : "preflight_cta_missing_or_weak",
            severity: "warn" as const,
            message: issue.message,
            patchable: true,
            suggestedPatchScopes: ["copy_text"],
          },
        ];
      case "headline_overflow_risk":
      case "copy_subject_leakage":
        return [
          {
            code: "preflight_headline_overflow_risk",
            severity: "warn" as const,
            message: issue.message,
            patchable: true,
            suggestedPatchScopes: ["copy_text"],
          },
        ];
      case "concrete_layout_slot_conflict":
        return [
          {
            code: "preflight_concrete_layout_slot_conflict",
            severity: "warn" as const,
            message: issue.message,
            patchable: true,
            suggestedPatchScopes: ["slot_anchor", "spacing"],
          },
        ];
      case "cta_copy_overlap_risk":
        return [
          {
            code: "preflight_cta_copy_overlap_risk",
            severity: "warn" as const,
            message: issue.message,
            patchable: true,
            suggestedPatchScopes: ["slot_anchor", "spacing"],
          },
        ];
      case "excessive_empty_space":
        return [
          {
            code: "preflight_excessive_empty_space",
            severity: "warn" as const,
            message: issue.message,
            patchable: true,
            suggestedPatchScopes: ["spacing", "cluster_zone"],
          },
        ];
      default:
        return [];
    }
  });
}

function uniquePatchScopes(issues: JudgePlanIssue[]): JudgePatchScope[] {
  return [...new Set(issues.flatMap((issue) => issue.suggestedPatchScopes))];
}
