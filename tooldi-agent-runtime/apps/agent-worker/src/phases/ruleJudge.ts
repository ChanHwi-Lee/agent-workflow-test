import { createRequestId } from "@tooldi/agent-domain";
import type { ExecutablePlan, TemplatePriorSummary } from "@tooldi/agent-contracts";
import {
  normalizeTemplateAssetPolicy,
  templateAssetPolicyAllowsFamily,
  templateAssetPolicyPrefersPhoto,
} from "@tooldi/agent-llm";

import type {
  NormalizedIntent,
  RuleJudgeConfidence,
  RuleJudgeIssue,
  RuleJudgeIssueCategory,
  RuleJudgeIssueCode,
  RuleJudgeIssueMetadata,
  RuleJudgeIssueSeverity,
  RuleJudgeRecommendation,
  RuleJudgeVerdict,
  SearchProfileArtifact,
  SelectionDecision,
  SourceSearchSummary,
  TypographyDecision,
} from "../types.js";

interface RuleJudgeIssueDefinition {
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

interface SurfaceRuleJudgeIssueOptions {
  category?: RuleJudgeIssueCategory;
  severity?: RuleJudgeIssueSeverity;
  message?: string;
  suggestedAction?: string | null;
  metadata?: Partial<RuleJudgeIssueMetadata>;
}

type DomainFamily = Exclude<NormalizedIntent["domain"], "general_marketing">;

interface DomainTokenSpec {
  strong: string[];
  weak: string[];
}

interface DomainSignalMatch {
  domain: DomainFamily;
  token: string;
  source: string;
  weight: number;
}

interface DomainSignalInference {
  domain: DomainFamily | null;
  score: number;
  matches: DomainSignalMatch[];
}

const DOMAIN_TOKEN_SPECS: Record<DomainFamily, DomainTokenSpec> = {
  restaurant: {
    strong: [
      "레스토랑",
      "브런치",
      "요리",
      "식사",
      "런치",
      "다이닝",
      "푸드",
      "음식",
      "restaurant",
      "brunch",
      "dining",
      "food",
    ],
    weak: ["메뉴", "menu"],
  },
  cafe: {
    strong: [
      "카페",
      "커피",
      "콜드브루",
      "라떼",
      "에이드",
      "티",
      "음료",
      "cafe",
      "coffee",
      "drink",
      "beverage",
      "latte",
      "tea",
      "cold brew",
    ],
    weak: ["디저트", "dessert"],
  },
  fashion_retail: {
    strong: [
      "패션",
      "리테일",
      "의류",
      "쇼핑",
      "스타일",
      "룩북",
      "브랜드",
      "어패럴",
      "fashion",
      "retail",
      "apparel",
      "shopping",
      "style",
    ],
    weak: ["세일", "sale"],
  },
};

const RETAIL_MENU_CONTRADICTION_FLAG_CODES = new Set([
  "fashion_menu_photo_contradiction",
  "menu_type_domain_conflict",
  "promotion_style_domain_conflict",
  "search_keyword_subject_drift",
]);

const DOMAIN_CONTEXT_REFS = [
  "CURRENT_RULE_JUDGE",
  "TOBE_JUDGE_RULES",
  "TOBE_DOMAIN_WEIGHTING",
  "PICTURE_QUERY_SURFACE",
  "SHAPE_QUERY_SURFACE",
] as const;

const POLICY_CONTEXT_REFS = [
  "CURRENT_RULE_JUDGE",
  "TOBE_JUDGE_RULES",
  "TOBE_ASSET_POLICY_V2",
  "PICTURE_QUERY_SURFACE",
  "SHAPE_QUERY_SURFACE",
] as const;

const PRIOR_CONTEXT_REFS = [
  "CURRENT_RULE_JUDGE",
  "TOBE_JUDGE_RULES",
  "TOBE_TEMPLATE_PRIOR_RULES",
  "PICTURE_QUERY_SURFACE",
  "SHAPE_QUERY_SURFACE",
] as const;

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

export async function ruleJudgeCreateTemplate(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  typographyDecision: TypographyDecision,
  sourceSearchSummary: SourceSearchSummary,
  plan: ExecutablePlan,
  templatePriorSummary: TemplatePriorSummary | null = null,
): Promise<RuleJudgeVerdict> {
  const assetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  const issues: RuleJudgeIssue[] = [];

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

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warnCount = issues.filter((issue) => issue.severity === "warn").length;
  const recommendation: RuleJudgeRecommendation =
    errorCount > 0 ? "refuse" : warnCount > 0 ? "refine" : "keep";
  const confidence: RuleJudgeConfidence =
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

function detectDomainSubjectMismatch(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
  templatePriorSummary: TemplatePriorSummary | null,
): RuleJudgeIssue | null {
  if (intent.domain === "general_marketing") {
    return null;
  }

  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const subjectTexts = [
    ...collectSelectedSubjectTexts(searchProfile, selectionDecision, sourceSearchSummary),
    ...collectPriorSubjectTexts(templatePriorSummary),
  ];
  const inference = inferDomainFromTexts(subjectTexts);
  if (
    inference.domain === null ||
    inference.domain === intent.domain ||
    inference.score < 2
  ) {
    return null;
  }

  const evidenceRefs = [
    "normalized-intent.json",
    ...deriveEvidenceRefs(inference.matches),
  ];
  const selectedSignal = describeSignal(inference.matches[0]);

  return surfaceRuleJudgeIssue("domain_subject_mismatch", {
    message:
      `Selected ${selectedFamily} subject signals lean toward ${inference.domain} ` +
      `while repaired intent remains ${intent.domain}; strongest signal=${selectedSignal}.`,
    metadata: {
      repairAttempted: true,
      repairOutcome: "warning_only",
      evidenceRefs,
      contextRefs: [...DOMAIN_CONTEXT_REFS],
    },
  });
}

function detectThemeDomainMismatch(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
  templatePriorSummary: TemplatePriorSummary | null,
): RuleJudgeIssue | null {
  if (intent.domain === "general_marketing") {
    return null;
  }

  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const themeTexts = [
    ...collectSelectedThemeTexts(searchProfile, selectionDecision, sourceSearchSummary),
    ...collectPriorThemeTexts(templatePriorSummary),
  ];
  const inference = inferDomainFromTexts(themeTexts);
  if (
    inference.domain === null ||
    inference.domain === intent.domain ||
    inference.score < 2
  ) {
    return null;
  }

  const evidenceRefs = [
    "normalized-intent.json",
    ...deriveEvidenceRefs(inference.matches),
  ];
  const selectedSignal = describeSignal(inference.matches[0]);

  return surfaceRuleJudgeIssue("theme_domain_mismatch", {
    message:
      `Selected ${selectedFamily} theme signals lean toward ${inference.domain} ` +
      `while repaired intent remains ${intent.domain}; strongest signal=${selectedSignal}.`,
    metadata: {
      repairAttempted: true,
      repairOutcome: "warning_only",
      evidenceRefs,
      contextRefs: [...DOMAIN_CONTEXT_REFS],
    },
  });
}

function detectSearchProfileIntentMismatch(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
): RuleJudgeIssue | null {
  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const contractMismatches = collectSearchProfileContractMismatches(
    intent,
    searchProfile,
  );
  const retailMenuContradictionReasons =
    collectFashionRetailMenuContradictionReasons(intent, searchProfile);
  const directionMismatch =
    selectedFamily === "photo" &&
    (!searchProfile.photo.enabled || searchProfile.photo.queries.length === 0);
  const inference =
    intent.domain === "general_marketing"
      ? { domain: null, score: 0, matches: [] }
      : inferDomainFromTexts(
          collectSearchProfileLaneTexts(searchProfile, selectionDecision),
        );
  const semanticMismatch =
    intent.domain !== "general_marketing" &&
    inference.domain !== null &&
    inference.domain !== intent.domain &&
    inference.score >= 2;

  if (
    contractMismatches.length === 0 &&
    retailMenuContradictionReasons.length === 0 &&
    !directionMismatch &&
    !semanticMismatch
  ) {
    return null;
  }

  const reasons: string[] = [];
  if (contractMismatches.length > 0) {
    reasons.push(`drifted fields=${contractMismatches.join(", ")}`);
  }
  if (retailMenuContradictionReasons.length > 0) {
    reasons.push(
      `fashion_retail/menu contradiction survived repair: ${retailMenuContradictionReasons.join("; ")}`,
    );
  }
  if (directionMismatch) {
    reasons.push(
      "selected photo direction has no enabled canonical picture query lane",
    );
  }
  if (semanticMismatch) {
    reasons.push(
      `selected ${selectedFamily} search lane leans toward ${inference.domain}; strongest signal=${describeSignal(
        inference.matches[0],
      )}`,
    );
  }

  return surfaceRuleJudgeIssue("search_profile_intent_mismatch", {
    message:
      `Search profile no longer aligns with repaired ${intent.domain} intent ` +
      `for the selected ${selectedFamily} direction: ${reasons.join("; ")}.`,
    metadata: {
      repairAttempted: true,
      repairOutcome: "warning_only",
      evidenceRefs: [
        "normalized-intent.json",
        "search-profile.json",
        "selection-decision.json",
      ],
      contextRefs: [...DOMAIN_CONTEXT_REFS],
    },
  });
}

function detectAssetPolicyConflict(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
): RuleJudgeIssue | null {
  const assetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const selectedLane = describeSelectionLane(selectedFamily);
  const reasons: string[] = [];
  const evidenceRefs = new Set<string>([
    "normalized-intent.json",
    "selection-decision.json",
  ]);

  if (!templateAssetPolicyAllowsFamily(assetPolicy, selectedFamily)) {
    evidenceRefs.add("search-profile.json");
    reasons.push(
      `selected ${selectedLane} lane is outside allowedFamilies=${assetPolicy.allowedFamilies.join("/")}`,
    );
  }

  if (!templateAssetPolicyAllowsFamily(assetPolicy, "photo")) {
    if (searchProfile.photo.enabled) {
      reasons.push(
        "picture lane stayed enabled on search-profile despite repaired policy removing picture eligibility",
      );
      evidenceRefs.add("search-profile.json");
    }
    if (
      selectionDecision.photoBranchMode === "photo_selected" ||
      selectionDecision.topPhotoCandidateId !== null
    ) {
      evidenceRefs.add("search-profile.json");
      reasons.push(
        "picture candidate context remained active during selection despite repaired policy removing picture eligibility",
      );
    }
    if (sourceSearchSummary.photo.queryAttempts.length > 0) {
      reasons.push(
        "picture query attempts still executed on the real Picture::index surface after repair removed picture eligibility",
      );
      evidenceRefs.add("source-search-summary.json");
    }
  }

  if (!templateAssetPolicyAllowsFamily(assetPolicy, "graphic")) {
    if (searchProfile.graphic.queries.length > 0) {
      reasons.push(
        "shape lane stayed enabled on search-profile despite repaired policy removing shape eligibility",
      );
      evidenceRefs.add("search-profile.json");
    }
    if (
      selectedFamily === "graphic" ||
      selectionDecision.selectedDecorationAssetId !== null ||
      selectionDecision.selectedDecorationCandidateId.length > 0
    ) {
      evidenceRefs.add("search-profile.json");
      reasons.push(
        "shape candidate context remained active during selection despite repaired policy removing shape eligibility",
      );
    }
    if (sourceSearchSummary.graphic.queryAttempts.length > 0) {
      reasons.push(
        "shape query attempts still executed on the real Shape::index surface after repair removed shape eligibility",
      );
      evidenceRefs.add("source-search-summary.json");
    }
  }

  if (reasons.length === 0) {
    return null;
  }

  return surfaceRuleJudgeIssue("asset_policy_conflict", {
    message:
      `Selected ${selectedLane} result conflicts with repaired asset policy ` +
      `(allowed=${assetPolicy.allowedFamilies.join("/")}, preferred=${assetPolicy.preferredFamilies.join("/")}, primary=${assetPolicy.primaryVisualPolicy}): ` +
      `${reasons.join("; ")}.`,
    metadata: {
      repairAttempted: true,
      repairOutcome: "warning_only",
      evidenceRefs: [...evidenceRefs],
      contextRefs: [...POLICY_CONTEXT_REFS],
    },
  });
}

function detectTemplatePriorConflict(
  intent: NormalizedIntent,
  selectionDecision: SelectionDecision,
  templatePriorSummary: TemplatePriorSummary | null,
): RuleJudgeIssue | null {
  if (
    intent.domain === "general_marketing" ||
    !templatePriorSummary ||
    templatePriorSummary.dominantThemePrior === "none"
  ) {
    return null;
  }

  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const selectedPriorFamily = mapSelectedFamilyToPriorFamily(selectedFamily);
  const selectedLanePrior =
    templatePriorSummary.selectedContentsThemePrior[selectedPriorFamily];
  const selectedTemplatePrior = templatePriorSummary.selectedTemplatePrior;
  const priorOwnsSelectionContext =
    (templatePriorSummary.dominantThemePrior === "template_prior" &&
      selectedTemplatePrior.status !== "unavailable") ||
    (templatePriorSummary.dominantThemePrior === "contents_theme_prior" &&
      selectedLanePrior.status !== "unavailable") ||
    (templatePriorSummary.dominantThemePrior === "mixed" &&
      (selectedTemplatePrior.status !== "unavailable" ||
        selectedLanePrior.status !== "unavailable"));

  if (!priorOwnsSelectionContext) {
    return null;
  }

  const inference = inferDomainFromTexts([
    ...collectPriorSubjectTexts(templatePriorSummary),
    ...collectPriorThemeTexts(templatePriorSummary),
  ]);
  if (
    inference.domain === null ||
    inference.domain === intent.domain ||
    inference.score < 2
  ) {
    return null;
  }

  return surfaceRuleJudgeIssue("template_prior_conflict", {
    message:
      `Dominant ${describeDominantPrior(templatePriorSummary, selectedPriorFamily)} leans toward ${inference.domain} ` +
      `while repaired intent remains ${intent.domain}, and the selected ${describeSelectionLane(selectedFamily)} lane kept that prior bias active; ` +
      `strongest signal=${describeSignal(inference.matches[0])}.`,
    metadata: {
      repairAttempted: true,
      repairOutcome: "warning_only",
      evidenceRefs: [
        "normalized-intent.json",
        "template-prior-summary.json",
        "selection-decision.json",
      ],
      contextRefs: [...PRIOR_CONTEXT_REFS],
    },
  });
}

function detectPrimaryVisualDrift(
  intent: NormalizedIntent,
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
): RuleJudgeIssue | null {
  if (intent.domain === "general_marketing") {
    return null;
  }

  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const inference = inferDomainFromTexts(
    collectPrimaryVisualTexts(selectionDecision, sourceSearchSummary),
  );
  if (
    inference.domain === null ||
    inference.domain === intent.domain ||
    inference.score < 2
  ) {
    return null;
  }

  const evidenceRefs = new Set<string>([
    "normalized-intent.json",
    "selection-decision.json",
  ]);
  const selectedFamilySummary =
    selectedFamily === "photo"
      ? sourceSearchSummary.photo
      : sourceSearchSummary.graphic;
  if (selectedFamilySummary.queryAttempts.length > 0) {
    evidenceRefs.add("source-search-summary.json");
  }

  return surfaceRuleJudgeIssue("primary_visual_drift", {
    message:
      `Chosen ${selectedFamily}-led primary visual reads as ${inference.domain} ` +
      `while repaired intent remains ${intent.domain}; strongest signal=${describeSignal(
        inference.matches[0],
      )}.`,
    metadata: {
      repairAttempted: true,
      repairOutcome: "warning_only",
      evidenceRefs: [...evidenceRefs],
      contextRefs: [...DOMAIN_CONTEXT_REFS],
    },
  });
}

function deriveSelectedFamily(
  selectionDecision: SelectionDecision,
): "graphic" | "photo" {
  if (
    selectionDecision.photoBranchMode === "photo_selected" ||
    selectionDecision.executionStrategy === "photo_hero_shape_text_group" ||
    selectionDecision.layoutMode === "copy_left_with_right_photo"
  ) {
    return "photo";
  }
  return "graphic";
}

function describeSelectionLane(
  selectedFamily: "graphic" | "photo",
): "shape" | "picture" {
  return selectedFamily === "photo" ? "picture" : "shape";
}

function mapSelectedFamilyToPriorFamily(
  selectedFamily: "graphic" | "photo",
): "shape" | "picture" {
  return selectedFamily === "photo" ? "picture" : "shape";
}

function describeDominantPrior(
  templatePriorSummary: TemplatePriorSummary,
  selectedPriorFamily: "shape" | "picture",
): string {
  if (templatePriorSummary.dominantThemePrior === "template_prior") {
    return "template prior";
  }
  if (templatePriorSummary.dominantThemePrior === "contents_theme_prior") {
    return `${selectedPriorFamily} contents_theme prior`;
  }
  return "mixed template/theme prior";
}

function collectSelectedSubjectTexts(
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
): Array<{ source: string; text: string }> {
  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const texts: Array<{ source: string; text: string }> = [];

  if (selectedFamily === "photo") {
    for (const query of searchProfile.photo.queries) {
      pushSignalText(
        texts,
        `searchProfile.photo.${query.label}.keyword`,
        query.keyword,
      );
    }

    for (const attempt of sourceSearchSummary.photo.queryAttempts) {
      pushSignalText(
        texts,
        `sourceSearchSummary.photo.${attempt.label}.keyword`,
        queryFieldToString(attempt.query.keyword),
      );
    }
  } else {
    for (const query of searchProfile.graphic.queries) {
      pushSignalText(
        texts,
        `searchProfile.graphic.${query.label}.keyword`,
        query.keyword,
      );
      pushSignalText(
        texts,
        `searchProfile.graphic.${query.label}.theme`,
        query.theme,
      );
      pushSignalText(
        texts,
        `searchProfile.graphic.${query.label}.type`,
        query.type,
      );
      pushSignalText(
        texts,
        `searchProfile.graphic.${query.label}.method`,
        query.method,
      );
    }

    for (const attempt of sourceSearchSummary.graphic.queryAttempts) {
      pushSignalText(
        texts,
        `sourceSearchSummary.graphic.${attempt.label}.keyword`,
        queryFieldToString(attempt.query.keyword),
      );
      pushSignalText(
        texts,
        `sourceSearchSummary.graphic.${attempt.label}.theme`,
        queryFieldToString(attempt.query.theme),
      );
    }
  }

  pushSignalText(texts, "selectionDecision.summary", selectionDecision.summary);
  pushSignalText(
    texts,
    "selectionDecision.photoBranchReason",
    selectionDecision.photoBranchReason,
  );
  pushSignalText(
    texts,
    "selectionDecision.fallbackSummary",
    selectionDecision.fallbackSummary,
  );

  return texts;
}

function collectSearchProfileContractMismatches(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
): string[] {
  const mismatches: string[] = [];

  if (searchProfile.templateKind !== intent.templateKind) {
    mismatches.push("templateKind");
  }
  if (searchProfile.domain !== intent.domain) {
    mismatches.push("domain");
  }
  if (searchProfile.audience !== intent.audience) {
    mismatches.push("audience");
  }
  if (searchProfile.campaignGoal !== intent.campaignGoal) {
    mismatches.push("campaignGoal");
  }
  if (searchProfile.canvasPreset !== intent.canvasPreset) {
    mismatches.push("canvasPreset");
  }
  if (searchProfile.layoutIntent !== intent.layoutIntent) {
    mismatches.push("layoutIntent");
  }
  if (searchProfile.tone !== intent.tone) {
    mismatches.push("tone");
  }
  if (!sameStringArray(searchProfile.searchKeywords, intent.searchKeywords)) {
    mismatches.push("searchKeywords");
  }
  if (!sameJsonValue(searchProfile.facets, intent.facets)) {
    mismatches.push("facets");
  }
  if (!sameJsonValue(searchProfile.assetPolicy, intent.assetPolicy)) {
    mismatches.push("assetPolicy");
  }

  return mismatches;
}

function collectFashionRetailMenuContradictionReasons(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
): string[] {
  if (intent.domain !== "fashion_retail") {
    return [];
  }

  const reasons: string[] = [];

  if (
    intent.consistencyFlags.some((flag) =>
      RETAIL_MENU_CONTRADICTION_FLAG_CODES.has(flag.code),
    )
  ) {
    reasons.push("normalized intent carried retail/menu contradiction repair flags");
  }

  if (searchProfile.facets.menuType !== null) {
    reasons.push(`facets.menuType=${searchProfile.facets.menuType}`);
  }
  if (searchProfile.campaignGoal === "menu_discovery") {
    reasons.push("campaignGoal=menu_discovery");
  }
  if (searchProfile.facets.promotionStyle === "seasonal_menu_launch") {
    reasons.push("facets.promotionStyle=seasonal_menu_launch");
  }

  const menuBearingFields = [
    ...collectMenuBearingSearchProfileFields(
      searchProfile.searchKeywords,
      "searchProfile.searchKeywords",
    ),
    ...collectMenuBearingSearchProfileFields(
      searchProfile.graphic.queries.map((query) => query.keyword),
      "searchProfile.graphic",
    ),
    ...collectMenuBearingSearchProfileFields(
      searchProfile.photo.queries.map((query) => query.keyword),
      "searchProfile.photo",
    ),
  ];

  if (menuBearingFields.length > 0) {
    reasons.push(`menu-bearing query fields=${menuBearingFields.join(", ")}`);
  }

  return [...new Set(reasons)];
}

function collectMenuBearingSearchProfileFields(
  values: Array<string | null>,
  prefix: string,
): string[] {
  const matches: string[] = [];

  for (const [index, value] of values.entries()) {
    if (!value || !hasMenuSignal(value)) {
      continue;
    }
    matches.push(`${prefix}[${index}]=${value}`);
  }

  return matches;
}

function hasMenuSignal(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }

  return /메뉴|menu|브런치|brunch|요리|식사|런치|푸드|food|다이닝|dining/i.test(
    text,
  );
}

function collectSearchProfileLaneTexts(
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
): Array<{ source: string; text: string }> {
  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const texts: Array<{ source: string; text: string }> = [];

  if (selectedFamily === "photo") {
    for (const query of searchProfile.photo.queries) {
      pushSignalText(
        texts,
        `searchProfile.photo.${query.label}.keyword`,
        query.keyword,
      );
      pushSignalText(
        texts,
        `searchProfile.photo.${query.label}.theme`,
        query.theme,
      );
      pushSignalText(
        texts,
        `searchProfile.photo.${query.label}.type`,
        query.type,
      );
      pushSignalText(
        texts,
        `searchProfile.photo.${query.label}.format`,
        query.format,
      );
    }

    return texts;
  }

  for (const query of searchProfile.graphic.queries) {
    pushSignalText(
      texts,
      `searchProfile.graphic.${query.label}.keyword`,
      query.keyword,
    );
    pushSignalText(
      texts,
      `searchProfile.graphic.${query.label}.theme`,
      query.theme,
    );
    pushSignalText(
      texts,
      `searchProfile.graphic.${query.label}.type`,
      query.type,
    );
    pushSignalText(
      texts,
      `searchProfile.graphic.${query.label}.method`,
      query.method,
    );
  }

  return texts;
}

function collectSelectedThemeTexts(
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
): Array<{ source: string; text: string }> {
  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const texts: Array<{ source: string; text: string }> = [];

  if (selectedFamily === "photo") {
    for (const query of searchProfile.photo.queries) {
      pushSignalText(
        texts,
        `searchProfile.photo.${query.label}.theme`,
        query.theme,
      );
    }

    for (const attempt of sourceSearchSummary.photo.queryAttempts) {
      pushSignalText(
        texts,
        `sourceSearchSummary.photo.${attempt.label}.theme`,
        queryFieldToString(attempt.query.theme),
      );
    }
  } else {
    for (const attempt of sourceSearchSummary.graphic.queryAttempts) {
      pushSignalText(
        texts,
        `sourceSearchSummary.graphic.${attempt.label}.theme`,
        queryFieldToString(attempt.query.theme),
      );
    }
  }

  pushSignalText(texts, "selectionDecision.summary", selectionDecision.summary);

  return texts;
}

function collectPrimaryVisualTexts(
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
): Array<{ source: string; text: string }> {
  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const texts: Array<{ source: string; text: string }> = [];

  pushSignalText(texts, "selectionDecision.summary", selectionDecision.summary);
  pushSignalText(
    texts,
    "selectionDecision.photoBranchReason",
    selectionDecision.photoBranchReason,
  );
  pushSignalText(
    texts,
    "selectionDecision.fallbackSummary",
    selectionDecision.fallbackSummary,
  );

  if (selectedFamily === "photo") {
    pushSignalText(
      texts,
      "selectionDecision.topPhotoCategory",
      selectionDecision.topPhotoCategory,
    );

    for (const attempt of sourceSearchSummary.photo.queryAttempts) {
      pushSignalText(
        texts,
        `sourceSearchSummary.photo.${attempt.label}.keyword`,
        queryFieldToString(attempt.query.keyword),
      );
      pushSignalText(
        texts,
        `sourceSearchSummary.photo.${attempt.label}.theme`,
        queryFieldToString(attempt.query.theme),
      );
      pushSignalText(
        texts,
        `sourceSearchSummary.photo.${attempt.label}.type`,
        queryFieldToString(attempt.query.type),
      );
      pushSignalText(
        texts,
        `sourceSearchSummary.photo.${attempt.label}.format`,
        queryFieldToString(attempt.query.format),
      );
    }

    return texts;
  }

  pushSignalText(
    texts,
    "selectionDecision.selectedDecorationCategory",
    selectionDecision.selectedDecorationCategory,
  );
  pushSignalText(
    texts,
    "selectionDecision.selectedBackgroundCategory",
    selectionDecision.selectedBackgroundCategory,
  );

  for (const attempt of sourceSearchSummary.graphic.queryAttempts) {
    pushSignalText(
      texts,
      `sourceSearchSummary.graphic.${attempt.label}.keyword`,
      queryFieldToString(attempt.query.keyword),
    );
    pushSignalText(
      texts,
      `sourceSearchSummary.graphic.${attempt.label}.theme`,
      queryFieldToString(attempt.query.theme),
    );
    pushSignalText(
      texts,
      `sourceSearchSummary.graphic.${attempt.label}.type`,
      queryFieldToString(attempt.query.type),
    );
    pushSignalText(
      texts,
      `sourceSearchSummary.graphic.${attempt.label}.method`,
      queryFieldToString(attempt.query.method),
    );
  }

  return texts;
}

function collectPriorSubjectTexts(
  templatePriorSummary: TemplatePriorSummary | null,
): Array<{ source: string; text: string }> {
  if (!templatePriorSummary) {
    return [];
  }

  const texts: Array<{ source: string; text: string }> = [];
  pushSignalText(
    texts,
    "templatePriorSummary.selectedTemplatePrior.summary",
    templatePriorSummary.selectedTemplatePrior.summary,
  );
  pushSignalText(
    texts,
    "templatePriorSummary.selectedTemplatePrior.keyword",
    templatePriorSummary.selectedTemplatePrior.keyword,
  );

  for (const match of templatePriorSummary.keywordThemeMatches) {
    pushSignalText(
      texts,
      `templatePriorSummary.keywordThemeMatches.${match.family}.signal`,
      match.signal,
    );
    pushSignalText(
      texts,
      `templatePriorSummary.keywordThemeMatches.${match.family}.summary`,
      match.summary,
    );
  }

  return texts;
}

function collectPriorThemeTexts(
  templatePriorSummary: TemplatePriorSummary | null,
): Array<{ source: string; text: string }> {
  if (!templatePriorSummary) {
    return [];
  }

  const texts: Array<{ source: string; text: string }> = [];
  pushSignalText(
    texts,
    "templatePriorSummary.selectedTemplatePrior.summary",
    templatePriorSummary.selectedTemplatePrior.summary,
  );
  pushSignalText(
    texts,
    "templatePriorSummary.selectedTemplatePrior.keyword",
    templatePriorSummary.selectedTemplatePrior.keyword,
  );

  for (const prior of Object.values(templatePriorSummary.selectedContentsThemePrior)) {
    pushSignalText(
      texts,
      `templatePriorSummary.selectedContentsThemePrior.${prior.family}.summary`,
      prior.summary,
    );
    pushSignalText(
      texts,
      `templatePriorSummary.selectedContentsThemePrior.${prior.family}.serial`,
      prior.serial,
    );
  }

  for (const match of templatePriorSummary.contentsThemePriorMatches) {
    pushSignalText(
      texts,
      `templatePriorSummary.contentsThemePriorMatches.${match.family}.signal`,
      match.signal,
    );
    pushSignalText(
      texts,
      `templatePriorSummary.contentsThemePriorMatches.${match.family}.summary`,
      match.summary,
    );
  }

  for (const bias of templatePriorSummary.rankingBiases) {
    pushSignalText(
      texts,
      "templatePriorSummary.rankingBiases.bias",
      bias.bias,
    );
    pushSignalText(
      texts,
      "templatePriorSummary.rankingBiases.rationale",
      bias.rationale,
    );
  }

  return texts;
}

function inferDomainFromTexts(
  inputs: Array<{ source: string; text: string }>,
): DomainSignalInference {
  const matches: DomainSignalMatch[] = [];

  for (const input of inputs) {
    const normalized = normalizeSignalText(input.text);
    if (!normalized) {
      continue;
    }

    for (const [domain, spec] of Object.entries(DOMAIN_TOKEN_SPECS) as Array<
      [DomainFamily, DomainTokenSpec]
    >) {
      for (const token of spec.strong) {
        if (normalized.includes(token.toLowerCase())) {
          matches.push({
            domain,
            token,
            source: input.source,
            weight: 2,
          });
        }
      }
      for (const token of spec.weak) {
        if (normalized.includes(token.toLowerCase())) {
          matches.push({
            domain,
            token,
            source: input.source,
            weight: 1,
          });
        }
      }
    }
  }

  let winner: DomainFamily | null = null;
  let winnerScore = 0;
  let runnerUpScore = 0;

  for (const domain of Object.keys(DOMAIN_TOKEN_SPECS) as DomainFamily[]) {
    const score = matches
      .filter((match) => match.domain === domain)
      .reduce((total, match) => total + match.weight, 0);
    if (score > winnerScore) {
      runnerUpScore = winnerScore;
      winner = domain;
      winnerScore = score;
      continue;
    }
    if (score > runnerUpScore) {
      runnerUpScore = score;
    }
  }

  if (winner === null || winnerScore === 0 || winnerScore <= runnerUpScore) {
    return {
      domain: null,
      score: winnerScore,
      matches: [],
    };
  }

  return {
    domain: winner,
    score: winnerScore,
    matches: matches.filter((match) => match.domain === winner),
  };
}

function deriveEvidenceRefs(matches: DomainSignalMatch[]): string[] {
  const refs = new Set<string>();

  for (const match of matches) {
    if (match.source.startsWith("searchProfile.")) {
      refs.add("search-profile.json");
      continue;
    }
    if (match.source.startsWith("sourceSearchSummary.")) {
      refs.add("source-search-summary.json");
      continue;
    }
    if (match.source.startsWith("selectionDecision.")) {
      refs.add("selection-decision.json");
      continue;
    }
    if (match.source.startsWith("templatePriorSummary.")) {
      refs.add("template-prior-summary.json");
    }
  }

  return [...refs];
}

function describeSignal(match: DomainSignalMatch | undefined): string {
  if (!match) {
    return "n/a";
  }
  return `${match.token} @ ${match.source}`;
}

function pushSignalText(
  target: Array<{ source: string; text: string }>,
  source: string,
  value: string | null,
) {
  const text = normalizeSignalText(value);
  if (!text) {
    return;
  }
  target.push({ source, text });
}

function queryFieldToString(value: string | number | boolean | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function sameJsonValue(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeSignalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
