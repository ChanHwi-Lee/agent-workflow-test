import {
  normalizeTemplateAssetPolicy,
  type TemplateIntentDraft,
} from "@tooldi/agent-llm";

import type { NormalizedIntent } from "../types.js";
import {
  fashionRetailBlockedKeywords,
  fashionRetailBlockedTextPattern,
  genericPromoBlockedKeywords,
  menuDrivenPhotoSignalKeywords,
  menuDrivenPhotoSignalPattern,
} from "./intentKeywords.js";

export function extractPromptSignals(prompt: string) {
  return {
    spring: prompt.includes("봄"),
    sale: prompt.includes("세일") || prompt.includes("할인"),
    event:
      prompt.includes("이벤트") ||
      prompt.includes("행사") ||
      prompt.includes("오픈") ||
      prompt.includes("프로모션"),
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

export function deriveExplicitDomain(
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

export function shouldPreferGraphicPromoStructure(
  promptSignals: ReturnType<typeof extractPromptSignals>,
  plannerDraft: TemplateIntentDraft,
): boolean {
  const noExplicitBusinessDomain =
    !promptSignals.restaurant && !promptSignals.cafe && !promptSignals.fashion;
  const noConcretePhotoSubject =
    !promptSignals.menu && !promptSignals.drink && !promptSignals.newness;
  const promoLanguagePresent =
    promptSignals.sale ||
    promptSignals.event ||
    plannerDraft.facets.promotionStyle === "sale_campaign" ||
    plannerDraft.facets.promotionStyle === "general_campaign";

  return noExplicitBusinessDomain && noConcretePhotoSubject && promoLanguagePresent;
}

export function deriveExpectedMenuType(
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

export function deriveExpectedPromotionStyle(
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

export function deriveCampaignGoal(
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

export function deriveAudience(
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

export function buildNormalizedKeywords(
  rawKeywords: string[],
  fallbackKeywords: string[],
  domain: NormalizedIntent["domain"],
  menuType: NormalizedIntent["facets"]["menuType"],
  genericPromoSubjectless: boolean,
): string[] {
  const blockedKeywords = new Set<string>();
  if (domain === "fashion_retail") {
    for (const keyword of fashionRetailBlockedKeywords) {
      blockedKeywords.add(keyword);
    }
  }
  if (genericPromoSubjectless) {
    for (const keyword of genericPromoBlockedKeywords) {
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

  if (!genericPromoSubjectless && menuType === "food_menu") {
    pushKeyword("메뉴");
  }
  if (!genericPromoSubjectless && menuType === "drink_menu") {
    pushKeyword("음료");
  }

  return mergedKeywords.slice(0, 5);
}

export function shouldResetGoalSummary(
  domain: NormalizedIntent["domain"],
  goalSummary: string,
): boolean {
  return (
    domain === "fashion_retail" &&
    fashionRetailBlockedTextPattern.test(goalSummary)
  );
}

export function normalizeKeyword(value: string): string {
  return value.trim().replace(/[^\p{L}\p{N}]/gu, "");
}

export function collectFashionMenuPhotoContradictionFields(
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

export function stableStringify(value: unknown): string {
  return JSON.stringify(value) ?? "";
}

export function didCanonicalAssetPolicyMeaningfullyChange(
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
