import { normalizeTemplateAssetPolicy } from "@tooldi/agent-llm";

import type { NormalizedIntent } from "../types.js";
import {
  fashionRetailBlockedKeywords,
  fashionRetailBlockedTextPattern,
  genericPromoBlockedKeywords,
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

export function deriveOfferIntent(
  promotionStyle: NormalizedIntent["facets"]["promotionStyle"],
): NormalizedIntent["offerIntent"] {
  switch (promotionStyle) {
    case "sale_campaign":
      return "sale";
    case "seasonal_menu_launch":
    case "new_product_promo":
      return "launch";
    case "general_campaign":
      return "announcement";
  }
}

export function deriveOfferSpecificity(
  promotionStyle: NormalizedIntent["facets"]["promotionStyle"],
  menuType: NormalizedIntent["facets"]["menuType"],
): NormalizedIntent["facets"]["offerSpecificity"] {
  return promotionStyle === "sale_campaign"
    ? "broad_offer"
    : menuType === null
      ? "multi_item"
      : "single_product";
}

export function shouldPreferGraphicPromoStructure(
  promptSignals: ReturnType<typeof extractPromptSignals>,
  domain: NormalizedIntent["domain"],
  menuType: NormalizedIntent["facets"]["menuType"],
  offerIntent: NormalizedIntent["offerIntent"],
): boolean {
  const noExplicitBusinessDomain = domain === "general_marketing";
  const noConcretePhotoSubject =
    !promptSignals.menu && !promptSignals.drink && !promptSignals.newness;
  const promoLanguagePresent =
    promptSignals.sale ||
    promptSignals.event ||
    offerIntent === "sale" ||
    offerIntent === "announcement" ||
    offerIntent === "evergreen";

  return noExplicitBusinessDomain && menuType === null && noConcretePhotoSubject && promoLanguagePresent;
}

export function deriveSubjectBinding(
  prompt: string,
  domain: NormalizedIntent["domain"],
  menuType: NormalizedIntent["facets"]["menuType"],
  genericPromoStructureFocus: boolean,
): NormalizedIntent["subjectBinding"] {
  if (genericPromoStructureFocus || (domain === "general_marketing" && menuType === null)) {
    return "subjectless";
  }
  if (menuType !== null) {
    return "product_anchored";
  }
  if (
    prompt.includes("매장") ||
    prompt.includes("방문") ||
    prompt.includes("식당") ||
    prompt.includes("카페")
  ) {
    return "venue_anchored";
  }
  return "domain_anchored";
}

export function deriveLayoutIntent(
  promptSignals: ReturnType<typeof extractPromptSignals>,
  domain: NormalizedIntent["domain"],
  promotionStyle: NormalizedIntent["facets"]["promotionStyle"],
  menuType: NormalizedIntent["facets"]["menuType"],
): NormalizedIntent["layoutIntent"] {
  if (promptSignals.badge) {
    return "badge_led";
  }
  if (
    menuType !== null ||
    domain === "cafe" ||
    promotionStyle === "new_product_promo"
  ) {
    return "hero_focused";
  }
  return "copy_focused";
}

export function createDeterministicAssetPolicy(
  domain: NormalizedIntent["domain"],
  menuType: NormalizedIntent["facets"]["menuType"],
  preferGraphicPromoStructure: boolean,
): NormalizedIntent["assetPolicy"] {
  if (preferGraphicPromoStructure || domain === "fashion_retail") {
    return normalizeTemplateAssetPolicy("graphic_allowed_photo_optional");
  }
  if (domain === "restaurant" || domain === "cafe" || menuType !== null) {
    return normalizeTemplateAssetPolicy("photo_preferred_graphic_allowed");
  }
  return normalizeTemplateAssetPolicy("graphic_allowed_photo_optional");
}

export function buildNormalizedKeywords(
  prompt: string,
  domain: NormalizedIntent["domain"],
  menuType: NormalizedIntent["facets"]["menuType"],
  genericPromoSubjectless: boolean,
  offerIntent: "sale" | "launch" | "announcement" | "evergreen",
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

  const promptHasNewness =
    prompt.includes("신메뉴") ||
    prompt.includes("신상") ||
    prompt.includes("계절메뉴");
  const promptHasBanner = prompt.includes("배너") || prompt.includes("웹배너");
  const promptHasRetail =
    prompt.includes("리테일") || prompt.includes("의류");

  if (domain === "restaurant") {
    pushKeyword("식당");
  } else if (domain === "cafe") {
    pushKeyword("카페");
  }

  if (prompt.includes("봄")) {
    pushKeyword("봄");
  }

  if (menuType === "food_menu") {
    pushKeyword("메뉴");
  }
  if (menuType === "drink_menu") {
    pushKeyword("음료");
  }

  if (promptHasNewness) {
    pushKeyword("신메뉴");
  }

  if (domain === "fashion_retail") {
    pushKeyword("패션");
  }

  if (offerIntent === "sale") {
    pushKeyword("세일");
  } else if (genericPromoSubjectless) {
    pushKeyword("프로모션");
  }

  if (domain === "fashion_retail" && promptHasRetail) {
    pushKeyword("리테일");
  }

  if (promptHasBanner) {
    pushKeyword("배너");
  }

  for (const keyword of prompt.split(/\s+/)) {
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

export function deriveBackgroundColorHex(prompt: string): string {
  let hash = 0;
  for (const char of prompt) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hslToHex(hash % 360, 42, 88);
}

function hslToHex(h: number, s: number, l: number): string {
  const normalizedS = s / 100;
  const normalizedL = l / 100;
  const chroma = (1 - Math.abs(2 * normalizedL - 1)) * normalizedS;
  const hueSection = h / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const match = normalizedL - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSection >= 0 && hueSection < 1) {
    red = chroma;
    green = secondary;
  } else if (hueSection < 2) {
    red = secondary;
    green = chroma;
  } else if (hueSection < 3) {
    green = chroma;
    blue = secondary;
  } else if (hueSection < 4) {
    green = secondary;
    blue = chroma;
  } else if (hueSection < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  const toHex = (value: number) =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}
