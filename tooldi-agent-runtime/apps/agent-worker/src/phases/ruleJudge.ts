import { createRequestId } from "@tooldi/agent-domain";
import type { ExecutablePlan } from "@tooldi/agent-contracts";

import type {
  NormalizedIntent,
  RuleJudgeIssue,
  RuleJudgeVerdict,
  SearchProfileArtifact,
  SelectionDecision,
  SourceSearchSummary,
  TypographyDecision,
} from "../types.js";

export async function ruleJudgeCreateTemplate(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  typographyDecision: TypographyDecision,
  sourceSearchSummary: SourceSearchSummary,
  plan: ExecutablePlan,
): Promise<RuleJudgeVerdict> {
  const issues: RuleJudgeIssue[] = [];

  if (typographyDecision.fallbackUsed) {
    issues.push({
      code: "typography_fallback",
      category: "readability",
      severity: "warn",
      message: "Typography selection fell back to editor defaults or partial defaults",
      suggestedAction: "Prefer a full KOR font pairing before broad rollout",
    });
  }

  if (
    intent.layoutIntent === "hero_focused" &&
    selectionDecision.layoutMode === "center_stack"
  ) {
    issues.push({
      code: "layout_intent_mismatch",
      category: "hierarchy",
      severity: "warn",
      message: "Hero-focused intent resolved to a center-stack layout",
      suggestedAction: "Prefer a hero-led layout when the visual carry is the main ask",
    });
  }

  if (
    intent.layoutIntent === "badge_led" &&
    selectionDecision.layoutMode !== "badge_led"
  ) {
    issues.push({
      code: "layout_intent_mismatch",
      category: "cta_prominence",
      severity: "warn",
      message: "Badge-led intent resolved to a non-badge layout",
      suggestedAction: "Promote badge-led layout or stronger promotional token placement",
    });
  }

  if (
    intent.assetPolicy === "photo_preferred_graphic_allowed" &&
    selectionDecision.photoBranchMode !== "photo_selected"
  ) {
    issues.push({
      code: "photo_preference_unmet",
      category: "domain_tone_consistency",
      severity: "warn",
      message: "Intent preferred photo-led execution, but the graphic branch remained active",
      suggestedAction: "Inspect hero photo candidates or improve photo-fit ranking",
    });
  }

  if (
    searchProfile.photo.enabled &&
    sourceSearchSummary.photo.returnedCount === 0
  ) {
    issues.push({
      code: "photo_candidate_weak",
      category: "copy_visual_separation",
      severity: "warn",
      message: "Photo search returned no usable candidates for the current query profile",
      suggestedAction: "Broaden photo search keywords or allow stronger graphic fallback",
    });
  }

  if (intent.brandConstraints.palette.length === 0) {
    issues.push({
      code: "brand_context_missing",
      category: "domain_tone_consistency",
      severity: "info",
      message: "No explicit brand palette was provided; using generic seasonal styling",
      suggestedAction: null,
    });
  }

  if (selectionDecision.executionStrategy === "photo_hero_shape_text_group") {
    if (
      !selectionDecision.topPhotoCandidateId ||
      !selectionDecision.topPhotoUrl ||
      !selectionDecision.topPhotoWidth ||
      !selectionDecision.topPhotoHeight
    ) {
      issues.push({
        code: "execution_contract_invalid",
        category: "execution_safety",
        severity: "error",
        message: "Photo execution strategy was selected without a complete executable photo payload",
        suggestedAction: "Refuse execution until hero photo metadata is complete",
      });
    }
  }

  if (!plan.actions.some((action) => action.operation === "place_copy_cluster")) {
    issues.push({
      code: "plan_action_missing",
      category: "execution_safety",
      severity: "error",
      message: "Executable plan is missing the copy cluster action",
      suggestedAction: "Reject plan materialization until the copy stage is present",
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warnCount = issues.filter((issue) => issue.severity === "warn").length;
  const recommendation: RuleJudgeVerdict["recommendation"] =
    errorCount > 0 ? "refuse" : warnCount > 0 ? "refine" : "keep";
  const confidence: RuleJudgeVerdict["confidence"] =
    errorCount > 0 ? "low" : warnCount > 1 ? "medium" : "high";

  return {
    verdictId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    recommendation,
    confidence,
    issues,
    summary:
      recommendation === "keep"
        ? "Rule judge found no blocking issues for the current create-template plan"
        : recommendation === "refine"
          ? `Rule judge found ${warnCount} refinement issue(s) before execution`
          : `Rule judge refused execution due to ${errorCount} blocking issue(s)`,
  };
}
