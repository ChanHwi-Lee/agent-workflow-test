import { createTemplateAssetPolicyPreset } from "./templatePlannerAssetPolicy.js";
import type {
  TemplateAbstractLayoutDraft,
  TemplateCopyPlanDraft,
  TemplatePlanner,
  TemplateSemanticBriefContext,
  TemplateSemanticBriefDraft,
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
      const offerIntent = inferOfferIntent(promotionStyle);

      return {
        goalSummary: prompt,
        templateKind:
          promotionStyle === "sale_campaign"
            ? "seasonal_sale_banner"
            : "promo_banner",
        domain,
        audience: inferAudience(domain),
        campaignGoal,
        subjectBinding: inferSubjectBinding(prompt, domain, menuType),
        offerIntent,
        layoutIntent:
          prompt.includes("뱃지") || prompt.includes("쿠폰")
            ? "badge_led"
            : domain === "cafe" || promotionStyle === "new_product_promo"
              ? "hero_focused"
              : "copy_focused",
        tone: "bright_playful",
        backgroundColorHex: inferBackgroundColorHex(prompt),
        assetPolicy: inferAssetPolicy(domain, menuType),
        typographyHint:
          domain === "fashion_retail"
            ? "세련된 고딕 계열로 명확한 가격/혜택 강조"
            : domain === "cafe"
              ? "가독성이 높은 둥근 고딕 계열"
              : null,
        facets: {
          seasonality: prompt.includes("봄") ? "spring" : null,
          menuType,
          offerSpecificity: inferOfferSpecificity(promotionStyle, menuType),
        },
      };
    },
  };
}

export function buildHeuristicCopyPlanDraft(
  prompt: string,
  brief: TemplateSemanticBriefContext,
): TemplateCopyPlanDraft {
  const genericPromo = brief.subjectBinding === "subjectless";
  const headline = sanitizeCopyText(
    genericPromo ? derivePromoHeadline(prompt, brief) : brief.goalSummary,
    28,
  );
  const subheadline = sanitizeCopyText(
    genericPromo
      ? "지금 바로 확인하세요"
      : brief.domain === "cafe"
        ? "봄 시즌 신메뉴를 만나보세요"
        : brief.domain === "restaurant"
          ? "이번 시즌 메뉴를 지금 공개합니다"
          : "혜택을 지금 확인하세요",
    36,
  );
  const offerLine = sanitizeCopyText(
    brief.offerIntent === "sale"
      ? "최대 50% OFF"
      : brief.facets.menuType === "drink_menu"
        ? "신메뉴 음료 출시"
        : brief.facets.menuType === "food_menu"
          ? "시즌 메뉴 공개"
          : null,
    24,
  );
  const cta = sanitizeCopyText(
    brief.facets.menuType === "food_menu"
      ? "메뉴 보기"
      : brief.facets.menuType === "drink_menu"
        ? "지금 주문하기"
        : brief.offerIntent === "sale"
          ? "혜택 보기"
          : "자세히 보기",
    18,
  );
  const footerNote = sanitizeCopyText(
    brief.offerIntent === "sale"
      ? "한정 수량 / 재고 소진 시 종료"
      : genericPromo
        ? "이벤트 기간 내 혜택 적용"
        : null,
    32,
  );
  const badgeText = sanitizeCopyText(
    brief.layoutIntent === "badge_led"
      ? brief.offerIntent === "sale"
        ? "SALE"
        : "NEW"
      : null,
    12,
  );

  return {
    headline: {
      text: headline ?? brief.goalSummary.slice(0, 28),
      priority: "primary",
      required: true,
      maxLength: 28,
      toneHint: brief.offerIntent === "sale" ? "promotional" : "informational",
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
          required: brief.offerIntent === "sale",
          maxLength: 24,
          toneHint: brief.offerIntent === "sale" ? "urgent" : "promotional",
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

export function buildHeuristicAbstractLayoutDraft(
  prompt: string,
  brief: TemplateSemanticBriefContext,
): TemplateAbstractLayoutDraft {
  const assetPolicy = brief.assetPolicy;
  const genericPromo = brief.subjectBinding === "subjectless";
  const layoutFamily = genericPromo
    ? brief.layoutIntent === "badge_led"
      ? "promo_badge"
      : assetPolicy.primaryVisualPolicy === "graphic_preferred"
        ? "promo_split"
        : "promo_center"
    : assetPolicy.primaryVisualPolicy === "photo_preferred"
      ? "subject_hero"
      : brief.layoutIntent === "badge_led"
        ? "promo_badge"
        : "promo_split";

  const copyAnchor = layoutFamily === "promo_center" ? "center" : "left";
  const visualAnchor = layoutFamily === "promo_center" ? "center" : "right";
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
        : brief.offerIntent === "sale"
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

function inferAssetPolicy(
  domain: TemplateSemanticBriefDraft["domain"],
  menuType: TemplateSemanticBriefContext["facets"]["menuType"],
) {
  return createTemplateAssetPolicyPreset(
    domain === "cafe" || menuType !== null
      ? "photo_preferred"
      : "graphic_preferred",
  );
}

function inferBackgroundColorHex(prompt: string): string {
  let hash = 0;
  for (const char of prompt) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  const hue = hash % 360;
  const saturation = 42;
  const lightness = 88;
  return hslToHex(hue, saturation, lightness);
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

function inferDomain(
  prompt: string,
): TemplateSemanticBriefDraft["domain"] {
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
  domain: TemplateSemanticBriefDraft["domain"],
): TemplateSemanticBriefContext["facets"]["promotionStyle"] {
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
  domain: TemplateSemanticBriefDraft["domain"],
): TemplateSemanticBriefContext["facets"]["menuType"] {
  if (prompt.includes("음료") || prompt.includes("커피")) {
    return "drink_menu";
  }
  if (domain === "restaurant" || prompt.includes("메뉴") || prompt.includes("요리")) {
    return "food_menu";
  }
  return null;
}

function inferCampaignGoal(
  promotionStyle: TemplateSemanticBriefContext["facets"]["promotionStyle"],
): TemplateSemanticBriefDraft["campaignGoal"] {
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

function inferOfferIntent(
  promotionStyle: TemplateSemanticBriefContext["facets"]["promotionStyle"],
): TemplateSemanticBriefDraft["offerIntent"] {
  switch (promotionStyle) {
    case "sale_campaign":
      return "sale";
    case "seasonal_menu_launch":
    case "new_product_promo":
      return "launch";
    default:
      return "announcement";
  }
}

function inferAudience(
  domain: TemplateSemanticBriefDraft["domain"],
): TemplateSemanticBriefDraft["audience"] {
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

function inferSubjectBinding(
  prompt: string,
  domain: TemplateSemanticBriefDraft["domain"],
  menuType: TemplateSemanticBriefContext["facets"]["menuType"],
): TemplateSemanticBriefDraft["subjectBinding"] {
  if (domain === "general_marketing" && menuType === null) {
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

function inferOfferSpecificity(
  promotionStyle: TemplateSemanticBriefContext["facets"]["promotionStyle"],
  menuType: TemplateSemanticBriefContext["facets"]["menuType"],
): TemplateSemanticBriefDraft["facets"]["offerSpecificity"] {
  return promotionStyle === "sale_campaign"
    ? "broad_offer"
    : menuType === null
      ? "multi_item"
      : "single_product";
}

function derivePromoHeadline(
  prompt: string,
  brief: Pick<TemplateSemanticBriefContext, "goalSummary">,
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
  return brief.goalSummary;
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
