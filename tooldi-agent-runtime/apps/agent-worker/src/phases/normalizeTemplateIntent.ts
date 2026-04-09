import { createRequestId } from "@tooldi/agent-domain";
import {
  createHeuristicTemplatePlanner,
  normalizeTemplateAssetPolicy,
  type TemplateIntentDraft,
} from "@tooldi/agent-llm";

import type {
  HydratedPlanningInput,
  IntentConsistencyFlag,
  IntentNormalizationRepair,
  IntentNormalizationReport,
  NormalizedIntent,
  NormalizedIntentDraftArtifact,
} from "../types.js";

export interface NormalizeTemplateIntentResult {
  intent: NormalizedIntent;
  normalizedIntentDraft: NormalizedIntentDraftArtifact | null;
  intentNormalizationReport: IntentNormalizationReport;
}

const menuDrivenPhotoSignalKeywords = new Set([
  "메뉴",
  "신메뉴",
  "시즌메뉴",
  "계절메뉴",
  "음료",
  "커피",
  "콜드브루",
  "라떼",
  "에이드",
  "브런치",
  "요리",
  "식사",
  "런치",
]);

const fashionRetailBlockedKeywords = new Set([
  ...menuDrivenPhotoSignalKeywords,
  "식당",
  "레스토랑",
  "카페",
]);

const menuDrivenPhotoSignalPattern =
  /메뉴|음료|커피|콜드브루|라떼|에이드|브런치|요리|식사|런치/u;

const fashionRetailBlockedTextPattern =
  /메뉴|음료|커피|콜드브루|라떼|에이드|브런치|요리|식사|런치|식당|레스토랑|카페/u;

export async function normalizeTemplateIntent(
  input: HydratedPlanningInput,
  plannerMode: NormalizedIntent["plannerMode"],
  operationFamily: NormalizedIntent["operationFamily"],
  canvasPreset: NormalizedIntent["canvasPreset"],
  plannerDraft: TemplateIntentDraft | null,
): Promise<NormalizeTemplateIntentResult> {
  const prompt = input.request.userInput.prompt.trim();
  const palette = [...input.snapshot.brandContext.palette];
  const normalizedIntentDraft =
    operationFamily === "create_template" && plannerDraft
      ? {
          draftId: createRequestId(),
          runId: input.job.runId,
          traceId: input.job.traceId,
          plannerMode,
          operationFamily,
          canvasPreset,
          prompt,
          palette,
          draft: plannerDraft,
        }
      : null;

  if (operationFamily !== "create_template" || !plannerDraft) {
    const normalizationNotes = [
      "No planner draft was available; normalized intent fell back to request defaults.",
    ];
    const intentConsistencyFlags: IntentConsistencyFlag[] = [];
    const intentNormalizationNotes = [...normalizationNotes];
    const intent: NormalizedIntent = {
      intentId: createRequestId(),
      runId: input.job.runId,
      traceId: input.job.traceId,
      plannerMode,
      operationFamily,
      artifactType: "LiveDraftArtifactBundle",
      goalSummary: prompt,
      requestedOutputCount: input.request.runPolicy.requestedOutputCount,
      templateKind: "promo_banner",
      domain: "general_marketing",
      audience: "general_consumers",
      campaignGoal: "promotion_awareness",
      canvasPreset,
      layoutIntent: "copy_focused",
      tone: "bright_playful",
      requiredSlots: [
        "background",
        "headline",
        "supporting_copy",
        "cta",
        "decoration",
      ],
      assetPolicy: normalizeTemplateAssetPolicy(
        "graphic_allowed_photo_optional",
      ),
      searchKeywords: ["봄"],
      facets: {
        seasonality: prompt.includes("봄") ? "spring" : null,
        menuType: null,
        promotionStyle: "general_campaign",
        offerSpecificity: "multi_item",
      },
      brandConstraints: {
        palette,
        typographyHint: null,
        forbiddenStyles: [],
      },
      consistencyFlags: intentConsistencyFlags,
      normalizationNotes: intentNormalizationNotes,
      supportedInV1: false,
      futureCapableOperations: [
        "create_template",
        "update_layer",
        "delete_layer",
      ],
    };

    return {
      intent,
      normalizedIntentDraft,
      intentNormalizationReport: createIntentNormalizationReport({
        input,
        plannerMode,
        prompt,
        draftAvailable: false,
        repairs: [],
        intent,
      }),
    };
  }

  const heuristicDraft = await createHeuristicTemplatePlanner().plan({
    prompt,
    canvasPreset,
    palette,
  });
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
  if (domain === "fashion_retail" && plannerDraft.facets.menuType !== null) {
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

  const normalizedAssetPolicy = normalizeTemplateAssetPolicy(
    plannerDraft.assetPolicy,
  );
  if (didCanonicalAssetPolicyMeaningfullyChange(plannerDraft.assetPolicy, normalizedAssetPolicy)) {
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
  );
  if (stableStringify(plannerDraft.searchKeywords) !== stableStringify(normalizedKeywords)) {
    const removedKeywords = plannerDraft.searchKeywords.filter(
      (keyword) => !normalizedKeywords.includes(normalizeKeyword(keyword)),
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

  const expectedGoalSummary = shouldResetGoalSummary(domain, plannerDraft.goalSummary)
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
    runId: input.job.runId,
    traceId: input.job.traceId,
    plannerMode,
    operationFamily,
    artifactType: "LiveDraftArtifactBundle",
    goalSummary,
    requestedOutputCount: input.request.runPolicy.requestedOutputCount,
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
    normalizedIntentDraft,
    intentNormalizationReport: createIntentNormalizationReport({
      input,
      plannerMode,
      prompt,
      draftAvailable: true,
      repairs,
      intent,
    }),
  };
}

function createIntentNormalizationReport(input: {
  input: HydratedPlanningInput;
  plannerMode: NormalizedIntent["plannerMode"];
  prompt: string;
  draftAvailable: boolean;
  repairs: IntentNormalizationRepair[];
  intent: NormalizedIntent;
}): IntentNormalizationReport {
  const { input: hydratedInput, plannerMode, prompt, draftAvailable, repairs, intent } =
    input;

  return {
    reportId: createRequestId(),
    runId: hydratedInput.job.runId,
    traceId: hydratedInput.job.traceId,
    plannerMode,
    prompt,
    draftAvailable,
    repairCount: repairs.length,
    appliedRepairs: repairs.map((repair) => ({
      ...repair,
      ...(Array.isArray(repair.before) ? { before: [...repair.before] } : {}),
      ...(Array.isArray(repair.after) ? { after: [...repair.after] } : {}),
    })),
    consistencyFlags: cloneConsistencyFlags(intent.consistencyFlags),
    normalizationNotes: [...intent.normalizationNotes],
  };
}

function cloneConsistencyFlags(
  flags: IntentConsistencyFlag[],
): IntentConsistencyFlag[] {
  return flags.map((flag) => ({
    ...flag,
    fields: [...flag.fields],
  }));
}

function extractPromptSignals(prompt: string) {
  return {
    spring: prompt.includes("봄"),
    sale: prompt.includes("세일") || prompt.includes("할인"),
    newness:
      prompt.includes("신메뉴") ||
      prompt.includes("신상") ||
      prompt.includes("계절메뉴"),
    launch:
      prompt.includes("출시") ||
      prompt.includes("런칭") ||
      prompt.includes("론칭") ||
      prompt.includes("홍보"),
    badge: prompt.includes("뱃지") || prompt.includes("쿠폰"),
    restaurant: prompt.includes("식당") || prompt.includes("레스토랑"),
    cafe: prompt.includes("카페"),
    fashion:
      prompt.includes("패션") ||
      prompt.includes("리테일") ||
      prompt.includes("의류"),
    drink: prompt.includes("음료") || prompt.includes("커피"),
    menu:
      prompt.includes("메뉴") ||
      prompt.includes("요리") ||
      prompt.includes("브런치"),
  };
}

function deriveExplicitDomain(
  promptSignals: ReturnType<typeof extractPromptSignals>,
): NormalizedIntent["domain"] | null {
  if (promptSignals.restaurant) {
    return "restaurant";
  }
  if (promptSignals.cafe) {
    return "cafe";
  }
  if (promptSignals.fashion) {
    return "fashion_retail";
  }
  return null;
}

function deriveExpectedMenuType(
  promptSignals: ReturnType<typeof extractPromptSignals>,
  domain: NormalizedIntent["domain"],
): NormalizedIntent["facets"]["menuType"] {
  if (domain !== "restaurant" && domain !== "cafe") {
    return null;
  }
  if (promptSignals.drink) {
    return "drink_menu";
  }
  if (promptSignals.menu || promptSignals.newness) {
    return "food_menu";
  }
  return null;
}

function deriveExpectedPromotionStyle(
  promptSignals: ReturnType<typeof extractPromptSignals>,
  domain: NormalizedIntent["domain"],
  menuType: NormalizedIntent["facets"]["menuType"],
  fallback: NormalizedIntent["facets"]["promotionStyle"],
): NormalizedIntent["facets"]["promotionStyle"] {
  if (promptSignals.sale) {
    return "sale_campaign";
  }
  if (
    promptSignals.newness &&
    menuType !== null &&
    (domain === "restaurant" || domain === "cafe")
  ) {
    return "seasonal_menu_launch";
  }
  if (promptSignals.newness || promptSignals.launch) {
    return "new_product_promo";
  }
  return fallback;
}

function deriveCampaignGoal(
  promotionStyle: NormalizedIntent["facets"]["promotionStyle"],
): NormalizedIntent["campaignGoal"] {
  switch (promotionStyle) {
    case "seasonal_menu_launch":
      return "menu_discovery";
    case "new_product_promo":
      return "product_trial";
    case "sale_campaign":
      return "sale_conversion";
    case "general_campaign":
      return "promotion_awareness";
  }
}

function deriveAudience(
  domain: NormalizedIntent["domain"],
): NormalizedIntent["audience"] {
  switch (domain) {
    case "restaurant":
      return "walk_in_customers";
    case "cafe":
      return "local_visitors";
    case "fashion_retail":
      return "sale_shoppers";
    case "general_marketing":
      return "general_consumers";
  }
}

function buildNormalizedKeywords(
  rawKeywords: string[],
  fallbackKeywords: string[],
  domain: NormalizedIntent["domain"],
  menuType: NormalizedIntent["facets"]["menuType"],
): string[] {
  const blockedKeywords = new Set<string>();
  if (domain === "fashion_retail") {
    for (const keyword of fashionRetailBlockedKeywords) {
      blockedKeywords.add(keyword);
    }
  }

  const mergedKeywords: string[] = [];
  const seenKeywords = new Set<string>();
  const pushKeyword = (value: string) => {
    const normalized = normalizeKeyword(value);
    if (!normalized || blockedKeywords.has(normalized) || seenKeywords.has(normalized)) {
      return;
    }
    seenKeywords.add(normalized);
    mergedKeywords.push(normalized);
  };

  for (const keyword of rawKeywords) {
    pushKeyword(keyword);
  }
  for (const keyword of fallbackKeywords) {
    pushKeyword(keyword);
  }

  if (menuType === "food_menu") {
    pushKeyword("메뉴");
  }
  if (menuType === "drink_menu") {
    pushKeyword("음료");
  }

  return mergedKeywords.slice(0, 5);
}

function shouldResetGoalSummary(
  domain: NormalizedIntent["domain"],
  goalSummary: string,
): boolean {
  return (
    domain === "fashion_retail" &&
    fashionRetailBlockedTextPattern.test(goalSummary)
  );
}

function normalizeKeyword(value: string): string {
  return value.trim().replace(/[^\p{L}\p{N}]/gu, "");
}

function collectFashionMenuPhotoContradictionFields(
  draft: TemplateIntentDraft,
): string[] {
  const fields: string[] = [];

  if (
    draft.searchKeywords.some((keyword) =>
      menuDrivenPhotoSignalKeywords.has(normalizeKeyword(keyword)),
    )
  ) {
    fields.push("searchKeywords");
  }
  if (menuDrivenPhotoSignalPattern.test(draft.goalSummary)) {
    fields.push("goalSummary");
  }
  if (draft.campaignGoal === "menu_discovery") {
    fields.push("campaignGoal");
  }
  if (draft.facets.promotionStyle === "seasonal_menu_launch") {
    fields.push("facets.promotionStyle");
  }

  return fields;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value) ?? "";
}

function didCanonicalAssetPolicyMeaningfullyChange(
  original: TemplateIntentDraft["assetPolicy"],
  normalized: NormalizedIntent["assetPolicy"],
): boolean {
  if (typeof original === "string") {
    return stableStringify(original) !== stableStringify(normalized);
  }

  const normalizedOriginal = normalizeTemplateAssetPolicy(original);
  const comparableOriginal = {
    ...normalizedOriginal,
    allowedFamilies: normalizedOriginal.allowedFamilies.filter(
      (family) => family !== "background",
    ),
  };
  const comparableNormalized = {
    ...normalized,
    allowedFamilies: normalized.allowedFamilies.filter(
      (family) => family !== "background",
    ),
  };

  return stableStringify(comparableOriginal) !== stableStringify(comparableNormalized);
}
