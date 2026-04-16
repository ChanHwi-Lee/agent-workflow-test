import {
  normalizeTemplateAssetPolicy,
  templateAssetPolicyPrefersPhoto,
} from "@tooldi/agent-llm";
import type { ExecutablePlan, TemplatePriorSummary } from "@tooldi/agent-contracts";

import type {
  AbstractLayoutPlan,
  ConcreteLayoutPlan,
  CopyPlan,
  NormalizedIntent,
  RuleJudgeIssue,
  RuleJudgeRecommendation,
  SearchProfileArtifact,
  SelectionDecision,
  SourceSearchSummary,
  TypographyDecision,
} from "../types.js";
import {
  detectCopyPlanIssues,
  detectGraphicPromoStructureIssues,
  detectLayoutPlanIssues,
} from "./ruleJudgeStructuralDetectors.js";
import {
  detectDomainSubjectMismatch,
  detectPrimaryVisualDrift,
  detectTemplatePriorConflict,
  detectThemeDomainMismatch,
} from "./ruleJudgeSemanticMismatchDetectors.js";
import {
  detectAssetPolicyConflict,
  detectSearchProfileIntentMismatch,
} from "./ruleJudgePolicyDetectors.js";
import { surfaceRuleJudgeIssue } from "./ruleJudgeIssueDefinitions.js";

export function collectRuleJudgeIssues(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  typographyDecision: TypographyDecision,
  sourceSearchSummary: SourceSearchSummary,
  plan: ExecutablePlan,
  templatePriorSummary: TemplatePriorSummary | null = null,
  copyPlan: CopyPlan | null = null,
  abstractLayoutPlan: AbstractLayoutPlan | null = null,
  concreteLayoutPlan: ConcreteLayoutPlan | null = null,
): RuleJudgeIssue[] {
  const assetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  const issues: RuleJudgeIssue[] = [];
  const freeformExecution = plan.actions.some(
    (action) =>
      action.inputs &&
      typeof action.inputs === "object" &&
      (action.inputs.executionMode === "object_native_freeform" ||
        action.inputs.executionMode === "topology_freeform"),
  );

  if (typographyDecision.fallbackUsed) {
    issues.push(surfaceRuleJudgeIssue("typography_fallback"));
  }

  if (
    intent.layoutIntent === "hero_focused" &&
    selectionDecision.layoutMode === "center_stack"
  ) {
    issues.push(
      surfaceRuleJudgeIssue("layout_intent_mismatch", {
        message: "Hero-focused intent resolved to a center-stack layout",
        suggestedAction:
          "Prefer a hero-led layout when the visual carry is the main ask",
      }),
    );
  }

  if (
    intent.layoutIntent === "badge_led" &&
    selectionDecision.layoutMode !== "badge_led"
  ) {
    issues.push(
      surfaceRuleJudgeIssue("layout_intent_mismatch", {
        category: "cta_prominence",
        message: "Badge-led intent resolved to a non-badge layout",
        suggestedAction:
          "Promote badge-led layout or stronger promotional token placement",
      }),
    );
  }

  if (
    templateAssetPolicyPrefersPhoto(assetPolicy) &&
    selectionDecision.photoBranchMode !== "photo_selected"
  ) {
    issues.push(surfaceRuleJudgeIssue("photo_preference_unmet"));
  }

  if (
    searchProfile.photo.enabled &&
    sourceSearchSummary.photo.returnedCount === 0
  ) {
    issues.push(surfaceRuleJudgeIssue("photo_candidate_weak"));
  }

  if (intent.brandConstraints.palette.length === 0) {
    issues.push(surfaceRuleJudgeIssue("brand_context_missing"));
  }

  if (copyPlan) {
    issues.push(...detectCopyPlanIssues(intent, copyPlan));
  }
  if (abstractLayoutPlan && concreteLayoutPlan) {
    issues.push(
      ...detectLayoutPlanIssues(
        intent,
        abstractLayoutPlan,
        concreteLayoutPlan,
        selectionDecision,
      ),
    );
  }

  if (!freeformExecution) {
    issues.push(...detectGraphicPromoStructureIssues(intent, selectionDecision));
  }

  const domainSubjectMismatch = detectDomainSubjectMismatch(
    intent,
    searchProfile,
    selectionDecision,
    sourceSearchSummary,
    templatePriorSummary,
  );
  if (domainSubjectMismatch) {
    issues.push(domainSubjectMismatch);
  }

  const themeDomainMismatch = detectThemeDomainMismatch(
    intent,
    searchProfile,
    selectionDecision,
    sourceSearchSummary,
    templatePriorSummary,
  );
  if (themeDomainMismatch) {
    issues.push(themeDomainMismatch);
  }

  const searchProfileIntentMismatch = detectSearchProfileIntentMismatch(
    intent,
    searchProfile,
    selectionDecision,
  );
  if (searchProfileIntentMismatch) {
    issues.push(searchProfileIntentMismatch);
  }

  const assetPolicyConflict = detectAssetPolicyConflict(
    intent,
    searchProfile,
    selectionDecision,
    sourceSearchSummary,
  );
  if (assetPolicyConflict) {
    issues.push(assetPolicyConflict);
  }

  const templatePriorConflict = detectTemplatePriorConflict(
    intent,
    selectionDecision,
    templatePriorSummary,
  );
  if (templatePriorConflict) {
    issues.push(templatePriorConflict);
  }

  const primaryVisualDrift = detectPrimaryVisualDrift(
    intent,
    selectionDecision,
    sourceSearchSummary,
  );
  if (primaryVisualDrift) {
    issues.push(primaryVisualDrift);
  }

  if (selectionDecision.executionStrategy === "photo_hero_shape_text_group") {
    if (
      !selectionDecision.topPhotoCandidateId ||
      !selectionDecision.topPhotoUrl ||
      !selectionDecision.topPhotoWidth ||
      !selectionDecision.topPhotoHeight
    ) {
      issues.push(surfaceRuleJudgeIssue("execution_contract_invalid", {
        message: "Photo execution strategy was selected without a complete executable photo payload",
        suggestedAction: "Refuse execution until hero photo metadata is complete",
      }));
    }
  }

  if (!plan.actions.some((action) => action.operation === "place_copy_cluster")) {
    issues.push(surfaceRuleJudgeIssue("plan_action_missing", {
      message: "Executable plan is missing the copy cluster action",
      suggestedAction: "Reject plan materialization until the copy stage is present",
    }));
  }

  return issues;
}

export function summarizeRuleJudgeRecommendation(
  issues: RuleJudgeIssue[],
): {
  recommendation: RuleJudgeRecommendation;
  confidence: "high" | "medium" | "low";
  errorCount: number;
  warnCount: number;
} {
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warnCount = issues.filter((issue) => issue.severity === "warn").length;
  const recommendation: RuleJudgeRecommendation =
    errorCount > 0 ? "refuse" : warnCount > 0 ? "refine" : "keep";
  const confidence =
    errorCount > 0 ? "low" : warnCount > 1 ? "medium" : "high";

  return {
    recommendation,
    confidence,
    errorCount,
    warnCount,
  };
}
