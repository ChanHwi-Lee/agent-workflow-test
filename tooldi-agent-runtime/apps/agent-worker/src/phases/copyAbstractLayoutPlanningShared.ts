import { normalizeTemplateAssetPolicy } from "@tooldi/agent-llm";

import type {
  AbstractLayoutFamily,
  AbstractLayoutPlan,
  NormalizedIntent,
} from "../types.js";

export function deriveGenericPromoHeadline(prompt: string): string {
  if (prompt.includes("세일") || prompt.includes("할인")) {
    return "봄 세일";
  }
  if (prompt.includes("오픈")) {
    return "오픈 이벤트";
  }
  if (prompt.includes("한정")) {
    return "한정 혜택";
  }
  return prompt.slice(0, 28);
}

export function deriveGenericPromoCta(
  prompt: string,
  intent: NormalizedIntent,
): string {
  if (prompt.includes("세일") || prompt.includes("할인") || prompt.includes("혜택")) {
    return "혜택 보기";
  }
  if (prompt.includes("오픈") || prompt.includes("이벤트")) {
    return "이벤트 확인";
  }
  if (intent.campaignGoal === "sale_conversion") {
    return "혜택 보기";
  }
  return "자세히 보기";
}

export function deriveGenericPromoCopySummary(
  campaignGoal: NormalizedIntent["campaignGoal"],
): string {
  if (campaignGoal === "sale_conversion") {
    return "Copy plan uses a generic promotional headline, offer, CTA, and footer without explicit product or venue wording.";
  }
  return "Copy plan uses generic promotional copy slots without explicit product or venue wording.";
}

export function deriveGenericPromoAbstractLayoutSummary(
  layoutFamily: AbstractLayoutFamily,
): string {
  switch (layoutFamily) {
    case "promo_center":
      return "Abstract layout plan centers promotional copy and supporting graphics without relying on an explicit subject visual.";
    case "promo_badge":
      return "Abstract layout plan emphasizes promotional badges and dense supporting graphics without an explicit product subject.";
    case "promo_frame":
      return "Abstract layout plan uses a framed promotional composition with separate copy and graphic zones.";
    case "subject_hero":
      return "Abstract layout plan keeps a promotional focal zone without explicit subject wording.";
    default:
      return "Abstract layout plan keeps promotional copy and supporting graphics in separate zones.";
  }
}

export function derivePromoSlotTopology(
  layoutFamily: AbstractLayoutFamily,
  campaignGoal: NormalizedIntent["campaignGoal"],
): AbstractLayoutPlan["slotTopology"] {
  if (layoutFamily === "promo_badge") {
    return "badge_headline_offer_cta_footer";
  }
  return campaignGoal === "sale_conversion"
    ? "headline_supporting_offer_cta_footer"
    : "headline_supporting_cta_footer";
}

export function isGenericPromoIntent(intent: NormalizedIntent): boolean {
  const normalizedAssetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  return (
    intent.domain === "general_marketing" &&
    intent.facets.menuType === null &&
    normalizedAssetPolicy.primaryVisualPolicy === "graphic_preferred"
  );
}
