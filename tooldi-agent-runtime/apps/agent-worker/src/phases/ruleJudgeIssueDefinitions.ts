import type {
  RuleJudgeIssue,
  RuleJudgeIssueCategory,
  RuleJudgeIssueCode,
  RuleJudgeIssueMetadata,
  RuleJudgeIssueSeverity,
  RuleJudgeRecommendation,
} from "../types.js";

export interface RuleJudgeIssueDefinition {
  category: RuleJudgeIssueCategory;
  defaultSeverity: RuleJudgeIssueSeverity;
  message: string;
  suggestedAction: string | null;
  metadata?: Omit<
    RuleJudgeIssueMetadata,
    | "recommendationImpact"
    | "repairAttempted"
    | "repairOutcome"
    | "evidenceRefs"
    | "contextRefs"
  >;
}

export interface SurfaceRuleJudgeIssueOptions {
  category?: RuleJudgeIssueCategory;
  severity?: RuleJudgeIssueSeverity;
  message?: string;
  suggestedAction?: string | null;
  metadata?: Partial<RuleJudgeIssueMetadata>;
}

export const RULE_JUDGE_ISSUE_DEFINITIONS = {
  typography_fallback: {
    category: "readability",
    defaultSeverity: "warn",
    message: "Typography selection fell back to editor defaults or partial defaults",
    suggestedAction: "Prefer a full KOR font pairing before broad rollout",
    metadata: {
      ruleScope: "readability",
    },
  },
  layout_intent_mismatch: {
    category: "hierarchy",
    defaultSeverity: "warn",
    message: "Resolved layout does not match the repaired layout intent",
    suggestedAction:
      "Re-rank the selected layout so the promoted hierarchy matches the repaired intent",
    metadata: {
      ruleScope: "layout",
    },
  },
  photo_preference_unmet: {
    category: "domain_tone_consistency",
    defaultSeverity: "warn",
    message:
      "Intent preferred photo-led execution, but the graphic branch remained active",
    suggestedAction: "Inspect hero photo candidates or improve photo-fit ranking",
    metadata: {
      ruleScope: "photo_preference",
    },
  },
  photo_candidate_weak: {
    category: "copy_visual_separation",
    defaultSeverity: "warn",
    message:
      "Photo search returned no usable candidates for the current query profile",
    suggestedAction: "Broaden photo search keywords or allow stronger graphic fallback",
    metadata: {
      ruleScope: "photo_preference",
    },
  },
  brand_context_missing: {
    category: "domain_tone_consistency",
    defaultSeverity: "info",
    message:
      "No explicit brand palette was provided; using generic seasonal styling",
    suggestedAction: null,
    metadata: {
      ruleScope: "readability",
    },
  },
  execution_contract_invalid: {
    category: "execution_safety",
    defaultSeverity: "error",
    message:
      "Selected execution strategy is missing required executable asset payload",
    suggestedAction: "Refuse execution until the required asset metadata is complete",
    metadata: {
      ruleScope: "execution_safety",
    },
  },
  plan_action_missing: {
    category: "execution_safety",
    defaultSeverity: "error",
    message: "Executable plan is missing a required action for safe materialization",
    suggestedAction: "Reject plan materialization until the missing stage is restored",
    metadata: {
      ruleScope: "execution_safety",
    },
  },
  domain_subject_mismatch: {
    category: "semantic_domain_alignment",
    defaultSeverity: "warn",
    message:
      "Repaired domain meaning does not match the subject carried by retrieval or the selected primary visual",
    suggestedAction:
      "Re-rank domain-bearing family evidence and demote wrong-domain subject signals before selection",
    metadata: {
      ruleScope: "semantic_domain_alignment",
    },
  },
  theme_domain_mismatch: {
    category: "semantic_domain_alignment",
    defaultSeverity: "warn",
    message:
      "Theme prior or theme-bearing assets are pulling the result toward the wrong business domain",
    suggestedAction:
      "Demote or replace wrong-domain theme priors before finalizing the dominant visual lane",
    metadata: {
      ruleScope: "semantic_domain_alignment",
    },
  },
  search_profile_intent_mismatch: {
    category: "retrieval_intent_alignment",
    defaultSeverity: "warn",
    message:
      "Search profile queries or family ordering no longer reflect the repaired canonical intent",
    suggestedAction:
      "Rebuild the dominant query path from normalized intent and repair audit outputs",
    metadata: {
      ruleScope: "retrieval_intent_alignment",
    },
  },
  asset_policy_conflict: {
    category: "policy_alignment",
    defaultSeverity: "warn",
    message:
      "Family eligibility or the selected primary visual conflicts with repaired asset policy semantics",
    suggestedAction:
      "Recompute allowed and preferred family ordering and reopen any silently skipped eligible families",
    metadata: {
      ruleScope: "policy_alignment",
    },
  },
  template_prior_conflict: {
    category: "prior_alignment",
    defaultSeverity: "warn",
    message:
      "Template prior or contents_theme prior is acting as controlling truth against repaired meaning",
    suggestedAction:
      "Downgrade or remove contradicted prior bias before the final family ranking pass",
    metadata: {
      ruleScope: "prior_alignment",
    },
  },
  primary_visual_drift: {
    category: "visual_consistency",
    defaultSeverity: "warn",
    message:
      "The selected primary visual no longer communicates the repaired primary business meaning",
    suggestedAction:
      "Re-rank or replace the winning visual with the safest coherent executable option",
    metadata: {
      ruleScope: "visual_consistency",
      legacyAliases: ["primary_signal_drift"],
    },
  },
  photo_subject_drift: {
    category: "visual_consistency",
    defaultSeverity: "warn",
    message:
      "Picture-led subject evidence drifts away from the repaired primary message",
    suggestedAction:
      "Demote the photo lane or switch to a coherent non-photo primary visual",
    metadata: {
      ruleScope: "visual_consistency",
    },
  },
  insufficient_graphic_density: {
    category: "graphic_density",
    defaultSeverity: "warn",
    message:
      "Graphic-first promo selection did not assemble enough accent roles for a Tooldi-style composition",
    suggestedAction:
      "Promote additional secondary or corner accents before finalizing the promo draft",
    metadata: {
      ruleScope: "graphic_density",
    },
  },
  promo_structure_incomplete: {
    category: "composition_balance",
    defaultSeverity: "warn",
    message:
      "Promo structure is missing one or more required graphic roles for a stable CTA-led banner",
    suggestedAction:
      "Restore CTA container and primary accent roles before shipping the generic promo path",
    metadata: {
      ruleScope: "composition_balance",
    },
  },
  cta_copy_overlap_risk: {
    category: "spatial_composition",
    defaultSeverity: "warn",
    message:
      "The selected promo structure keeps CTA and copy in a layout family that tends to overlap under current skeleton geometry",
    suggestedAction:
      "Prefer a graphic-first promo layout with more vertical separation before materialization",
    metadata: {
      ruleScope: "spatial_composition",
    },
  },
  excessive_empty_space: {
    category: "spatial_composition",
    defaultSeverity: "warn",
    message:
      "Layout uses too much empty canvas relative to the selected promo graphic density",
    suggestedAction:
      "Increase accent density or switch to a denser promo layout family",
    metadata: {
      ruleScope: "spatial_composition",
    },
  },
  graphic_role_imbalance: {
    category: "composition_balance",
    defaultSeverity: "warn",
    message:
      "Graphic-heavy promo structure over-relies on one accent role instead of a balanced set",
    suggestedAction:
      "Add or re-rank secondary and corner accents to balance the composition",
    metadata: {
      ruleScope: "composition_balance",
    },
  },
  copy_slot_missing: {
    category: "copy_quality",
    defaultSeverity: "warn",
    message: "Copy plan is missing one or more required promotional slots",
    suggestedAction:
      "Restore the required headline or CTA slot before treating the draft as stable",
    metadata: {
      ruleScope: "copy_quality",
    },
  },
  copy_subject_leakage: {
    category: "copy_quality",
    defaultSeverity: "warn",
    message:
      "Generic promo copy still carries an explicit venue, product, or category subject",
    suggestedAction:
      "Rewrite the affected copy slots with generic promo-safe wording before shipping",
    metadata: {
      ruleScope: "copy_quality",
    },
  },
  copy_cta_subject_mismatch: {
    category: "copy_quality",
    defaultSeverity: "warn",
    message:
      "CTA copy implies an explicit ordering or venue action that conflicts with generic promo intent",
    suggestedAction:
      "Replace the CTA with a generic promo-safe action such as viewing benefits or details",
    metadata: {
      ruleScope: "copy_quality",
    },
  },
  copy_summary_intent_mismatch: {
    category: "copy_quality",
    defaultSeverity: "warn",
    message:
      "Copy plan summary still describes an explicit subject path that conflicts with repaired generic promo intent",
    suggestedAction:
      "Regenerate the copy summary from canonical generic promo grammar before continuing",
    metadata: {
      ruleScope: "copy_quality",
    },
  },
  headline_overflow_risk: {
    category: "copy_quality",
    defaultSeverity: "warn",
    message: "Headline length is too close to or above the allowed copy budget",
    suggestedAction:
      "Shorten the headline or move supporting language into the secondary copy slot",
    metadata: {
      ruleScope: "copy_quality",
    },
  },
  cta_missing_or_weak: {
    category: "copy_quality",
    defaultSeverity: "warn",
    message: "CTA copy is missing or too weak for the current promotional goal",
    suggestedAction:
      "Replace the CTA with a more actionable short call-to-action before shipping",
    metadata: {
      ruleScope: "copy_quality",
    },
  },
  copy_hierarchy_weak: {
    category: "copy_quality",
    defaultSeverity: "warn",
    message:
      "Copy plan does not clearly separate headline, offer, and CTA hierarchy for the current prompt",
    suggestedAction:
      "Strengthen headline/offer/CTA hierarchy before finalizing the draft",
    metadata: {
      ruleScope: "copy_quality",
    },
  },
  abstract_layout_intent_mismatch: {
    category: "layout_structure",
    defaultSeverity: "warn",
    message:
      "Abstract layout plan still conflicts with the repaired layout intent or asset policy",
    suggestedAction:
      "Repair the abstract layout family before synthesizing the concrete scene plan",
    metadata: {
      ruleScope: "layout_structure",
    },
  },
  abstract_layout_subject_leakage: {
    category: "layout_structure",
    defaultSeverity: "warn",
    message:
      "Abstract layout plan still describes an explicit subject visual that conflicts with generic promo intent",
    suggestedAction:
      "Rewrite the abstract layout summary around structure rather than venue or product-specific visuals",
    metadata: {
      ruleScope: "layout_structure",
    },
  },
  concrete_layout_slot_conflict: {
    category: "layout_structure",
    defaultSeverity: "warn",
    message:
      "Concrete layout plan maps copy or CTA slots into conflicting zones for the selected layout mode",
    suggestedAction:
      "Re-anchor the conflicting slots before materializing the editor mutations",
    metadata: {
      ruleScope: "layout_structure",
    },
  },
} satisfies Record<RuleJudgeIssueCode, RuleJudgeIssueDefinition>;

export function surfaceRuleJudgeIssue(
  code: RuleJudgeIssueCode,
  options: SurfaceRuleJudgeIssueOptions = {},
): RuleJudgeIssue {
  const definition = RULE_JUDGE_ISSUE_DEFINITIONS[code];
  const severity = options.severity ?? definition.defaultSeverity;
  const metadata: RuleJudgeIssueMetadata | undefined =
    definition.metadata || options.metadata
      ? {
          ...definition.metadata,
          recommendationImpact: recommendationImpactForSeverity(severity),
          repairAttempted: false,
          repairOutcome: "not_attempted",
          ...options.metadata,
        }
      : undefined;

  return {
    code,
    category: options.category ?? definition.category,
    severity,
    message: options.message ?? definition.message,
    suggestedAction:
      options.suggestedAction !== undefined
        ? options.suggestedAction
        : definition.suggestedAction,
    ...(metadata ? { metadata } : {}),
  };
}

function recommendationImpactForSeverity(
  severity: RuleJudgeIssueSeverity,
): RuleJudgeRecommendation {
  if (severity === "error") {
    return "refuse";
  }
  if (severity === "warn") {
    return "refine";
  }
  return "keep";
}
