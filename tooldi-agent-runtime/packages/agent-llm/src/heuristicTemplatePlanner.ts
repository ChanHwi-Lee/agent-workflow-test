import {
  normalizeTemplateAssetPolicy,
} from "./templatePlannerAssetPolicy.js";
import type {
  TemplateAbstractLayoutDraft,
  TemplateCopyPlanDraft,
  TemplateIntentDraft,
  TemplatePlanner,
} from "./templatePlannerSchemas.js";

export function createHeuristicTemplatePlanner(): TemplatePlanner {
  return {
    mode: "heuristic",
    async plan(input) {
      const prompt = input.prompt.trim();
      const domain = inferDomain(prompt);
      const promotionStyle = inferPromotionStyle(prompt, domain);
      const menuType = inferMenuType(prompt, domain);
      const campaignGoal = inferCampaignGoal(promotionStyle);
      const draft: TemplateIntentDraft = {
        goalSummary: prompt,
        templateKind:
          promotionStyle === "sale_campaign"
            ? "seasonal_sale_banner"
            : "promo_banner",
        domain,
        audience: inferAudience(domain),
        campaignGoal,
        layoutIntent:
          prompt.includes("뱃지") || prompt.includes("쿠폰")
            ? "badge_led"
            : domain === "cafe" || promotionStyle === "new_product_promo"
              ? "hero_focused"
              : "copy_focused",
        tone: "bright_playful",
        assetPolicy: normalizeTemplateAssetPolicy(
          domain === "cafe" || menuType !== null
            ? "photo_preferred_graphic_allowed"
            : "graphic_allowed_photo_optional",
        ),
        searchKeywords: inferSearchKeywords(prompt, domain, promotionStyle, menuType),
        typographyHint:
          domain === "fashion_retail"
            ? "세련된 고딕 계열로 명확한 가격/혜택 강조"
            : domain === "cafe"
              ? "가독성이 높은 둥근 고딕 계열"
              : null,
        facets: {
          seasonality: prompt.includes("봄") ? "spring" : null,
          menuType,
          promotionStyle,
          offerSpecificity:
            promotionStyle === "sale_campaign"
              ? "broad_offer"
              : menuType === null
                ? "multi_item"
                : "single_product",
        },
      };

      return {
        ...draft,
        copyPlanDraft: buildHeuristicCopyPlanDraft(prompt, draft),
        abstractLayoutDraft: buildHeuristicAbstractLayoutDraft(prompt, draft),
      };
    },
  };
}

export function ensurePlanningDraftSubplans(
  prompt: string,
  draft: TemplateIntentDraft,
): TemplateIntentDraft {
  return {
    ...draft,
    copyPlanDraft:
      draft.copyPlanDraft ?? buildHeuristicCopyPlanDraft(prompt, draft),
    abstractLayoutDraft:
      draft.abstractLayoutDraft ??
      buildHeuristicAbstractLayoutDraft(prompt, draft),
  };
}

function inferDomain(
  prompt: string,
): TemplateIntentDraft["domain"] {
  if (prompt.includes("식당") || prompt.includes("레스토랑")) {
    return "restaurant";
  }
  if (prompt.includes("카페")) {
    return "cafe";
  }
  if (prompt.includes("패션") || prompt.includes("리테일") || prompt.includes("의류")) {
    return "fashion_retail";
  }
  return "general_marketing";
}

function inferPromotionStyle(
  prompt: string,
  domain: TemplateIntentDraft["domain"],
): TemplateIntentDraft["facets"]["promotionStyle"] {
  if (prompt.includes("세일") || prompt.includes("할인")) {
    return "sale_campaign";
  }
  if (
    prompt.includes("신메뉴") ||
    prompt.includes("신상") ||
    prompt.includes("계절메뉴")
  ) {
    return domain === "cafe" || domain === "restaurant"
      ? "seasonal_menu_launch"
      : "new_product_promo";
  }
  if (prompt.includes("출시") || prompt.includes("홍보")) {
    return "new_product_promo";
  }
  return "general_campaign";
}

function inferMenuType(
  prompt: string,
  domain: TemplateIntentDraft["domain"],
): TemplateIntentDraft["facets"]["menuType"] {
  if (prompt.includes("음료") || prompt.includes("커피")) {
    return "drink_menu";
  }
  if (
    domain === "restaurant" ||
    prompt.includes("메뉴") ||
    prompt.includes("요리")
  ) {
    return "food_menu";
  }
  return null;
}

function inferCampaignGoal(
  promotionStyle: TemplateIntentDraft["facets"]["promotionStyle"],
): TemplateIntentDraft["campaignGoal"] {
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

function inferAudience(
  domain: TemplateIntentDraft["domain"],
): TemplateIntentDraft["audience"] {
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

function inferSearchKeywords(
  prompt: string,
  domain: TemplateIntentDraft["domain"],
  promotionStyle: TemplateIntentDraft["facets"]["promotionStyle"],
  menuType: TemplateIntentDraft["facets"]["menuType"],
): string[] {
  const keywords = new Set<string>();
  keywords.add("봄");

  switch (domain) {
    case "restaurant":
      keywords.add("식당");
      break;
    case "cafe":
      keywords.add("카페");
      break;
    case "fashion_retail":
      keywords.add("패션");
      break;
    default:
      keywords.add("프로모션");
      break;
  }

  if (menuType === "food_menu") {
    keywords.add("메뉴");
  }
  if (menuType === "drink_menu") {
    keywords.add("음료");
  }

  if (promotionStyle === "seasonal_menu_launch") {
    keywords.add("신메뉴");
  } else if (promotionStyle === "new_product_promo") {
    keywords.add("프로모션");
  } else if (promotionStyle === "sale_campaign") {
    keywords.add("세일");
  }

  for (const token of prompt.split(/\s+/)) {
    const normalized = token.trim().replace(/[^\p{L}\p{N}]/gu, "");
    if (!normalized) {
      continue;
    }
    if (normalized.length >= 2) {
      keywords.add(normalized);
    }
    if (keywords.size >= 5) {
      break;
    }
  }

  return [...keywords].slice(0, 5);
}

function buildHeuristicCopyPlanDraft(
  prompt: string,
  draft: TemplateIntentDraft,
): TemplateCopyPlanDraft {
  const genericPromo =
    draft.domain === "general_marketing" && draft.facets.menuType === null;
  const headline = sanitizeCopyText(
    genericPromo
      ? derivePromoHeadline(prompt, draft)
      : draft.goalSummary,
    28,
  );
  const subheadline = sanitizeCopyText(
    genericPromo
      ? "지금 바로 확인하세요"
      : draft.domain === "cafe"
        ? "봄 시즌 신메뉴를 만나보세요"
        : draft.domain === "restaurant"
          ? "이번 시즌 메뉴를 지금 공개합니다"
          : "혜택을 지금 확인하세요",
    36,
  );
  const offerLine = sanitizeCopyText(
    draft.facets.promotionStyle === "sale_campaign"
      ? "최대 50% OFF"
      : draft.facets.menuType === "drink_menu"
        ? "신메뉴 음료 출시"
        : draft.facets.menuType === "food_menu"
          ? "시즌 메뉴 공개"
          : null,
    24,
  );
  const cta = sanitizeCopyText(
    draft.facets.menuType === "food_menu"
      ? "메뉴 보기"
      : draft.facets.menuType === "drink_menu"
        ? "지금 주문하기"
        : "자세히 보기",
    18,
  );
  const footerNote = sanitizeCopyText(
    draft.facets.promotionStyle === "sale_campaign"
      ? "한정 수량 / 재고 소진 시 종료"
      : genericPromo
        ? "이벤트 기간 내 혜택 적용"
        : null,
    32,
  );
  const badgeText = sanitizeCopyText(
    draft.layoutIntent === "badge_led"
      ? draft.facets.promotionStyle === "sale_campaign"
        ? "SALE"
        : "NEW"
      : null,
    12,
  );

  return {
    headline: {
      text: headline ?? draft.goalSummary.slice(0, 28),
      priority: "primary",
      required: true,
      maxLength: 28,
      toneHint:
        draft.facets.promotionStyle === "sale_campaign"
          ? "promotional"
          : "informational",
    },
    subheadline: subheadline
      ? {
          text: subheadline,
          priority: "secondary",
          required: true,
          maxLength: 36,
          toneHint: "informational",
        }
      : null,
    offerLine: offerLine
      ? {
          text: offerLine,
          priority: "secondary",
          required: draft.facets.promotionStyle === "sale_campaign",
          maxLength: 24,
          toneHint:
            draft.facets.promotionStyle === "sale_campaign"
              ? "urgent"
              : "promotional",
        }
      : null,
    cta: {
      text: cta ?? "자세히 보기",
      priority: "supporting",
      required: true,
      maxLength: 18,
      toneHint: "promotional",
    },
    footerNote: footerNote
      ? {
          text: footerNote,
          priority: "utility",
          required: false,
          maxLength: 32,
          toneHint: "informational",
        }
      : null,
    badgeText: badgeText
      ? {
          text: badgeText,
          priority: "supporting",
          required: false,
          maxLength: 12,
          toneHint: "urgent",
        }
      : null,
    summary:
      genericPromo
        ? "Generic promo copy slots keep the message short, offer-led, and CTA clear."
        : "Subject-aware copy slots emphasize the hero offer while preserving CTA clarity.",
  };
}

function buildHeuristicAbstractLayoutDraft(
  prompt: string,
  draft: TemplateIntentDraft,
): TemplateAbstractLayoutDraft {
  const assetPolicy = normalizeTemplateAssetPolicy(draft.assetPolicy);
  const genericPromo =
    draft.domain === "general_marketing" && draft.facets.menuType === null;
  const layoutFamily = genericPromo
    ? draft.layoutIntent === "badge_led"
      ? "promo_badge"
      : assetPolicy.primaryVisualPolicy === "graphic_preferred"
        ? "promo_split"
        : "promo_center"
    : assetPolicy.primaryVisualPolicy === "photo_preferred"
      ? "subject_hero"
      : draft.layoutIntent === "badge_led"
        ? "promo_badge"
        : "promo_split";

  const copyAnchor =
    layoutFamily === "promo_center" ? "center" : "left";
  const visualAnchor =
    layoutFamily === "promo_center"
      ? "center"
      : layoutFamily === "subject_hero"
        ? "right"
        : "right";
  const ctaAnchor =
    layoutFamily === "promo_center" ? "bottom_center" : "below_copy";
  const density =
    layoutFamily === "promo_badge"
      ? "dense"
      : prompt.includes("미니멀") || prompt.includes("깔끔")
        ? "airy"
        : "balanced";
  const slotTopology =
    layoutFamily === "subject_hero"
      ? "hero_headline_supporting_cta_footer"
      : layoutFamily === "promo_badge"
        ? "badge_headline_offer_cta_footer"
        : draft.facets.promotionStyle === "sale_campaign"
          ? "headline_supporting_offer_cta_footer"
          : "headline_supporting_cta_footer";

  return {
    layoutFamily,
    copyAnchor,
    visualAnchor,
    ctaAnchor,
    density,
    slotTopology,
    summary:
      genericPromo
        ? "Generic promo layout keeps a clear copy block and a separate graphic cluster."
        : "Subject-aware layout preserves room for a hero visual while keeping the copy hierarchy stable.",
  };
}

function derivePromoHeadline(
  prompt: string,
  draft: TemplateIntentDraft,
): string {
  if (prompt.includes("세일") || prompt.includes("할인")) {
    return "봄 세일";
  }
  if (prompt.includes("오픈")) {
    return "오픈 이벤트";
  }
  if (prompt.includes("한정")) {
    return "한정 혜택";
  }
  return draft.goalSummary;
}

function sanitizeCopyText(text: string | null, maxLength: number): string | null {
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > maxLength
    ? normalized.slice(0, maxLength).trim()
    : normalized;
}
