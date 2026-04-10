import { createRequestId } from "@tooldi/agent-domain";
import {
  normalizeTemplateAssetPolicy,
  type TemplateIntentDraft,
} from "@tooldi/agent-llm";

import type {
  HydratedPlanningInput,
  IntentConsistencyFlag,
  IntentNormalizationRepair,
  NormalizedIntent,
} from "../types.js";
import { cloneConsistencyFlags } from "./intentNormalizationReport.js";
import {
  buildNormalizedKeywords,
  collectFashionMenuPhotoContradictionFields,
  deriveAudience,
  deriveCampaignGoal,
  deriveExplicitDomain,
  deriveExpectedMenuType,
  deriveExpectedPromotionStyle,
  didCanonicalAssetPolicyMeaningfullyChange,
  extractPromptSignals,
  shouldPreferGraphicPromoStructure,
  shouldResetGoalSummary,
  stableStringify,
} from "./intentInference.js";

export interface RepairTemplateIntentDraftResult {
  intent: NormalizedIntent;
  repairs: IntentNormalizationRepair[];
}

export function repairTemplateIntentDraft(input: {
  input: HydratedPlanningInput;
  plannerMode: NormalizedIntent["plannerMode"];
  operationFamily: NormalizedIntent["operationFamily"];
  canvasPreset: NormalizedIntent["canvasPreset"];
  plannerDraft: TemplateIntentDraft;
  heuristicDraft: TemplateIntentDraft;
  prompt: string;
  palette: string[];
}): RepairTemplateIntentDraftResult {
  const {
    input: hydratedInput,
    plannerMode,
    operationFamily,
    canvasPreset,
    plannerDraft,
    heuristicDraft,
    prompt,
    palette,
  } = input;
  const promptSignals = extractPromptSignals(prompt);
  const repairs: IntentNormalizationRepair[] = [];
  const consistencyFlags: IntentConsistencyFlag[] = [];
  const normalizationNotes: string[] = [];
  const pushFlag = (flag: IntentConsistencyFlag) => {
    if (
      consistencyFlags.some(
        (existing) =>
          existing.code === flag.code &&
          existing.fields.join("|") === flag.fields.join("|"),
      )
    ) {
      return;
    }
    consistencyFlags.push(flag);
  };
  const recordRepair = (
    field: string,
    before: unknown,
    after: unknown,
    reasonCode: string,
    note: string,
    flag?: IntentConsistencyFlag,
  ) => {
    if (stableStringify(before) === stableStringify(after)) {
      return;
    }
    repairs.push({
      field,
      reasonCode,
      before,
      after,
      note,
    });
    normalizationNotes.push(note);
    if (flag) {
      pushFlag(flag);
    }
  };

  const explicitDomain = deriveExplicitDomain(promptSignals);
  const genericPromoStructureFocus = shouldPreferGraphicPromoStructure(
    promptSignals,
    plannerDraft,
  );
  let domain = plannerDraft.domain;
  if (explicitDomain && plannerDraft.domain !== explicitDomain) {
    recordRepair(
      "domain",
      plannerDraft.domain,
      explicitDomain,
      "prompt_domain_signal_override",
      `Explicit prompt domain signal forced ${explicitDomain} over planner draft ${plannerDraft.domain}.`,
      {
        code: "prompt_domain_signal_mismatch",
        severity: "warning",
        message:
          "Planner draft domain conflicted with explicit prompt domain vocabulary.",
        fields: ["domain"],
      },
    );
    domain = explicitDomain;
  } else if (genericPromoStructureFocus && plannerDraft.domain !== "general_marketing") {
    recordRepair(
      "domain",
      plannerDraft.domain,
      "general_marketing",
      "generic_promo_domain_repair",
      "Generic promo wording without an explicit subject or business domain was normalized to general_marketing before structure-first planning.",
      {
        code: "generic_promo_domain_repair",
        severity: "warning",
        message:
          "Planner draft assigned a specific business domain to a generic promo prompt without explicit subject signals.",
        fields: ["domain"],
      },
    );
    domain = "general_marketing";
  }

  const fashionMenuPhotoContradictionFields =
    domain === "fashion_retail"
      ? collectFashionMenuPhotoContradictionFields(plannerDraft)
      : [];
  if (
    domain === "fashion_retail" &&
    plannerDraft.facets.menuType !== null &&
    fashionMenuPhotoContradictionFields.length > 0
  ) {
    pushFlag({
      code: "fashion_menu_photo_contradiction",
      severity: "warning",
      message:
        "Planner draft combined fashion_retail with menu taxonomy and menu-driven photo signals; deterministic normalization treated the draft as contradictory before repair.",
      fields: [
        "domain",
        "facets.menuType",
        ...fashionMenuPhotoContradictionFields,
      ],
    });
    normalizationNotes.push(
      "fashion_retail cannot remain compatible with menu taxonomy plus menu-driven photo signals; the raw planner draft was classified as a contradiction before repair.",
    );
  }

  let seasonality = plannerDraft.facets.seasonality;
  if (promptSignals.spring && seasonality !== "spring") {
    recordRepair(
      "facets.seasonality",
      plannerDraft.facets.seasonality,
      "spring",
      "seasonality_inferred_from_prompt",
      "Prompt included spring vocabulary, so seasonality was normalized to spring.",
    );
    seasonality = "spring";
  }

  const expectedMenuType = deriveExpectedMenuType(promptSignals, domain);
  let menuType = plannerDraft.facets.menuType;
  if (genericPromoStructureFocus && plannerDraft.facets.menuType !== null) {
    recordRepair(
      "facets.menuType",
      plannerDraft.facets.menuType,
      null,
      "generic_promo_subject_reset",
      "Generic promo wording removed menu taxonomy so the canonical intent stays subjectless before downstream retrieval.",
    );
    menuType = null;
  } else if (domain === "fashion_retail" && plannerDraft.facets.menuType !== null) {
    recordRepair(
      "facets.menuType",
      plannerDraft.facets.menuType,
      null,
      "menu_type_domain_conflict",
      "Food or drink menu taxonomy was removed because fashion_retail cannot execute with menu semantics.",
      {
        code: "menu_type_domain_conflict",
        severity: "warning",
        message:
          "Planner draft attached menu taxonomy to a fashion_retail intent.",
        fields: ["domain", "facets.menuType"],
      },
    );
    menuType = null;
  } else if (
    expectedMenuType !== null &&
    plannerDraft.facets.menuType !== expectedMenuType
  ) {
    recordRepair(
      "facets.menuType",
      plannerDraft.facets.menuType,
      expectedMenuType,
      "menu_type_prompt_repair",
      `Prompt-level menu vocabulary normalized menuType to ${expectedMenuType}.`,
    );
    menuType = expectedMenuType;
  }

  const expectedPromotionStyle = deriveExpectedPromotionStyle(
    promptSignals,
    domain,
    menuType,
    heuristicDraft.facets.promotionStyle,
  );
  let promotionStyle = plannerDraft.facets.promotionStyle;
  if (promotionStyle !== expectedPromotionStyle) {
    const reasonCode =
      promotionStyle === "seasonal_menu_launch" && domain === "fashion_retail"
        ? "promotion_style_domain_conflict"
        : "promotion_style_prompt_repair";
    recordRepair(
      "facets.promotionStyle",
      plannerDraft.facets.promotionStyle,
      expectedPromotionStyle,
      reasonCode,
      `Prompt-aligned promotion semantics normalized promotionStyle to ${expectedPromotionStyle}.`,
      reasonCode === "promotion_style_domain_conflict"
        ? {
            code: "promotion_style_domain_conflict",
            severity: "warning",
            message:
              "Planner draft promotion style implied menu launch semantics in a non-menu domain.",
            fields: ["domain", "facets.promotionStyle"],
          }
        : undefined,
    );
    promotionStyle = expectedPromotionStyle;
  }

  const expectedCampaignGoal = deriveCampaignGoal(promotionStyle);
  let campaignGoal = plannerDraft.campaignGoal;
  if (campaignGoal !== expectedCampaignGoal) {
    recordRepair(
      "campaignGoal",
      plannerDraft.campaignGoal,
      expectedCampaignGoal,
      "campaign_goal_rederived",
      `Campaign goal was re-derived from the repaired promotionStyle ${promotionStyle}.`,
    );
    campaignGoal = expectedCampaignGoal;
  }

  const expectedAudience = deriveAudience(domain);
  let audience = plannerDraft.audience;
  if (audience !== expectedAudience) {
    recordRepair(
      "audience",
      plannerDraft.audience,
      expectedAudience,
      "audience_rederived",
      `Audience was re-derived from the repaired domain ${domain}.`,
    );
    audience = expectedAudience;
  }

  const expectedTemplateKind =
    promotionStyle === "sale_campaign"
      ? "seasonal_sale_banner"
      : "promo_banner";
  let templateKind = plannerDraft.templateKind;
  if (templateKind !== expectedTemplateKind) {
    recordRepair(
      "templateKind",
      plannerDraft.templateKind,
      expectedTemplateKind,
      "template_kind_rederived",
      `Template kind was normalized to ${expectedTemplateKind} from the repaired promotion style.`,
    );
    templateKind = expectedTemplateKind;
  }

  const expectedOfferSpecificity =
    promotionStyle === "sale_campaign"
      ? "broad_offer"
      : menuType === null
        ? "multi_item"
        : "single_product";
  let offerSpecificity = plannerDraft.facets.offerSpecificity;
  if (offerSpecificity !== expectedOfferSpecificity) {
    recordRepair(
      "facets.offerSpecificity",
      plannerDraft.facets.offerSpecificity,
      expectedOfferSpecificity,
      "offer_specificity_rederived",
      `Offer specificity was re-derived from repaired menu and promotion semantics as ${expectedOfferSpecificity}.`,
    );
    offerSpecificity = expectedOfferSpecificity;
  }

  const expectedLayoutIntent =
    promptSignals.badge
      ? "badge_led"
      : plannerDraft.layoutIntent;
  let layoutIntent = plannerDraft.layoutIntent;
  if (layoutIntent !== expectedLayoutIntent) {
    recordRepair(
      "layoutIntent",
      plannerDraft.layoutIntent,
      expectedLayoutIntent,
      "layout_intent_prompt_repair",
      `Explicit badge or coupon language normalized layoutIntent to ${expectedLayoutIntent}.`,
    );
    layoutIntent = expectedLayoutIntent;
  }

  let normalizedAssetPolicy = normalizeTemplateAssetPolicy(plannerDraft.assetPolicy);
  let assetPolicyExplicitlyRepaired = false;
  if (
    genericPromoStructureFocus &&
    normalizedAssetPolicy.primaryVisualPolicy !== "graphic_preferred"
  ) {
    const repairedAssetPolicy = normalizeTemplateAssetPolicy(
      "graphic_allowed_photo_optional",
    );
    recordRepair(
      "assetPolicy",
      normalizedAssetPolicy,
      repairedAssetPolicy,
      "generic_promo_graphic_first_repair",
      "Generic promo wording was normalized to a graphic-first asset policy so Tooldi-style vector/bitmap structure stays primary before photo fallback.",
    );
    normalizedAssetPolicy = repairedAssetPolicy;
    assetPolicyExplicitlyRepaired = true;
  }
  if (
    !assetPolicyExplicitlyRepaired &&
    didCanonicalAssetPolicyMeaningfullyChange(plannerDraft.assetPolicy, normalizedAssetPolicy)
  ) {
    recordRepair(
      "assetPolicy",
      plannerDraft.assetPolicy,
      normalizedAssetPolicy,
      "asset_policy_normalized",
      "Planner asset policy was normalized into the canonical structured asset-policy shape.",
    );
  }

  const typographyHint = plannerDraft.typographyHint ?? heuristicDraft.typographyHint;
  if (plannerDraft.typographyHint !== typographyHint && typographyHint !== null) {
    recordRepair(
      "brandConstraints.typographyHint",
      plannerDraft.typographyHint,
      typographyHint,
      "typography_hint_backfilled",
      "A deterministic typography hint was backfilled from the prompt-grounded heuristic baseline.",
    );
  }

  const normalizedKeywords = buildNormalizedKeywords(
    plannerDraft.searchKeywords,
    heuristicDraft.searchKeywords,
    domain,
    menuType,
    genericPromoStructureFocus,
  );
  if (stableStringify(plannerDraft.searchKeywords) !== stableStringify(normalizedKeywords)) {
    const removedKeywords = plannerDraft.searchKeywords.filter(
      (keyword) => !normalizedKeywords.includes(keyword.trim().replace(/[^\p{L}\p{N}]/gu, "")),
    );
    recordRepair(
      "searchKeywords",
      plannerDraft.searchKeywords,
      normalizedKeywords,
      removedKeywords.length > 0
        ? "search_keyword_subject_drift"
        : "search_keywords_completed",
      removedKeywords.length > 0
        ? `Conflicting search keywords (${removedKeywords.join(", ")}) were replaced with prompt-grounded taxonomy keywords.`
        : "Search keywords were completed with deterministic prompt-grounded keywords.",
      removedKeywords.length > 0
        ? {
            code: "search_keyword_subject_drift",
            severity: "warning",
            message:
              "Planner draft search keywords drifted away from the repaired subject/domain semantics.",
            fields: ["searchKeywords", "domain", "facets.menuType"],
          }
        : undefined,
    );
  }

  const expectedGoalSummary =
    genericPromoStructureFocus ||
    shouldResetGoalSummary(domain, plannerDraft.goalSummary)
      ? prompt
      : plannerDraft.goalSummary;
  const goalSummary = expectedGoalSummary;
  if (goalSummary !== plannerDraft.goalSummary) {
    recordRepair(
      "goalSummary",
      plannerDraft.goalSummary,
      goalSummary,
      "goal_summary_subject_repair",
      "Goal summary was reset to the user prompt because the raw draft summary conflicted with the repaired subject/domain semantics.",
    );
  }

  if (repairs.length === 0) {
    normalizationNotes.push(
      "Planner draft matched deterministic normalization rules without requiring repair.",
    );
  }
  const intentConsistencyFlags = cloneConsistencyFlags(consistencyFlags);
  const intentNormalizationNotes = [...normalizationNotes];

  const intent: NormalizedIntent = {
    intentId: createRequestId(),
    runId: hydratedInput.job.runId,
    traceId: hydratedInput.job.traceId,
    plannerMode,
    operationFamily,
    artifactType: "LiveDraftArtifactBundle",
    goalSummary,
    requestedOutputCount: hydratedInput.request.runPolicy.requestedOutputCount,
    templateKind,
    domain,
    audience,
    campaignGoal,
    canvasPreset,
    layoutIntent,
    tone: plannerDraft.tone,
    requiredSlots: [
      "background",
      "headline",
      "supporting_copy",
      "cta",
      "decoration",
    ],
    assetPolicy: normalizedAssetPolicy,
    searchKeywords: normalizedKeywords,
    facets: {
      seasonality,
      menuType,
      promotionStyle,
      offerSpecificity,
    },
    brandConstraints: {
      palette,
      typographyHint,
      forbiddenStyles: [],
    },
    consistencyFlags: intentConsistencyFlags,
    normalizationNotes: intentNormalizationNotes,
    supportedInV1: true,
    futureCapableOperations: [
      "create_template",
      "update_layer",
      "delete_layer",
    ],
  };

  return {
    intent,
    repairs,
  };
}
