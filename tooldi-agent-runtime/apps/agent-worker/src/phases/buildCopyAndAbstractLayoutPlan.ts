import { createRequestId } from "@tooldi/agent-domain";
import type {
  TemplateAbstractLayoutDraft,
  TemplateCopyPlanDraft,
  TemplateIntentDraft,
} from "@tooldi/agent-llm";
import { normalizeTemplateAssetPolicy } from "@tooldi/agent-llm";

import type {
  AbstractLayoutFamily,
  AbstractLayoutPlan,
  AbstractLayoutPlanNormalizationReport,
  CopyPlan,
  CopyPlanNormalizationReport,
  CopyPlanSlot,
  HydratedPlanningInput,
  NormalizedIntent,
} from "../types.js";

interface BuildCopyAndAbstractLayoutPlanResult {
  copyPlan: CopyPlan;
  copyPlanNormalizationReport: CopyPlanNormalizationReport;
  abstractLayoutPlan: AbstractLayoutPlan;
  abstractLayoutPlanNormalizationReport: AbstractLayoutPlanNormalizationReport;
}

const GENERIC_PROMO_LEAKAGE_PATTERN =
  /메뉴|음료|커피|식당|레스토랑|카페|패션|리테일|의류|한 잔|한잔/u;

export async function buildCopyAndAbstractLayoutPlan(
  input: HydratedPlanningInput,
  intent: NormalizedIntent,
  plannerDraft: TemplateIntentDraft | null,
): Promise<BuildCopyAndAbstractLayoutPlanResult> {
  const prompt = input.request.userInput.prompt.trim();
  const copyRepairs: string[] = [];
  const layoutRepairs: string[] = [];
  const genericPromoIntent = isGenericPromoIntent(intent);

  const copyDraft =
    plannerDraft?.copyPlanDraft ?? buildFallbackCopyPlanDraft(prompt, intent);
  const normalizedSlots = normalizeCopyPlanSlots(
    copyDraft,
    prompt,
    intent,
    genericPromoIntent,
    copyRepairs,
  );

  const copyPlan: CopyPlan = {
    planId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    plannerMode: intent.plannerMode,
    source:
      intent.plannerMode === "langchain" && plannerDraft?.copyPlanDraft
        ? "langchain"
        : "heuristic",
    slots: normalizedSlots,
    primaryMessage:
      normalizedSlots.find((slot) => slot.key === "headline")?.text ??
      intent.goalSummary,
    summary:
      genericPromoIntent
        ? deriveGenericPromoCopySummary(intent.campaignGoal)
        : copyDraft.summary ||
          "Copy plan keeps the headline, offer, CTA, and footer as explicit slots.",
  };
  if (
    genericPromoIntent &&
    copyPlan.summary !==
      (copyDraft.summary ||
        "Copy plan keeps the headline, offer, CTA, and footer as explicit slots.")
  ) {
    copyRepairs.push(
      "Rewrote copy plan summary with generic promo-safe wording after canonical intent normalization.",
    );
  }

  const abstractLayoutDraft =
    plannerDraft?.abstractLayoutDraft ??
    buildFallbackAbstractLayoutDraft(prompt, intent);
  const abstractLayoutPlan = normalizeAbstractLayoutDraft(
    abstractLayoutDraft,
    intent,
    genericPromoIntent,
    layoutRepairs,
  );

  return {
    copyPlan,
    copyPlanNormalizationReport: {
      reportId: createRequestId(),
      runId: intent.runId,
      traceId: intent.traceId,
      source:
        intent.plannerMode === "langchain" && plannerDraft?.copyPlanDraft
          ? "langchain"
          : "heuristic",
      draftAvailable: plannerDraft?.copyPlanDraft !== undefined,
      repairCount: copyRepairs.length,
      normalizationNotes:
        copyRepairs.length > 0
          ? copyRepairs
          : ["Copy plan draft required no normalization repairs."],
    },
    abstractLayoutPlan,
    abstractLayoutPlanNormalizationReport: {
      reportId: createRequestId(),
      runId: intent.runId,
      traceId: intent.traceId,
      source:
        intent.plannerMode === "langchain" && plannerDraft?.abstractLayoutDraft
          ? "langchain"
          : "heuristic",
      draftAvailable: plannerDraft?.abstractLayoutDraft !== undefined,
      repairCount: layoutRepairs.length,
      normalizationNotes:
        layoutRepairs.length > 0
          ? layoutRepairs
          : ["Abstract layout draft required no normalization repairs."],
    },
  };
}

function normalizeCopyPlanSlots(
  draft: TemplateCopyPlanDraft,
  prompt: string,
  intent: NormalizedIntent,
  genericPromoIntent: boolean,
  notes: string[],
): CopyPlanSlot[] {
  const slots: CopyPlanSlot[] = [];
  const genericPromoHeadline = genericPromoIntent
    ? deriveGenericPromoHeadline(prompt)
    : intent.goalSummary.slice(0, 28);
  const genericPromoCta = genericPromoIntent
    ? deriveGenericPromoCta(prompt, intent)
    : "자세히 보기";
  const pushSlot = (
    key: CopyPlanSlot["key"],
    slotDraft: TemplateCopyPlanDraft[keyof TemplateCopyPlanDraft] | null,
    fallbackText: string,
  ) => {
    if (!slotDraft || typeof slotDraft !== "object" || !("text" in slotDraft)) {
      if (key === "headline" || key === "cta") {
        slots.push({
          key,
          text: fallbackText,
          priority: key === "headline" ? "primary" : "supporting",
          required: true,
          maxLength: key === "headline" ? 28 : 18,
          toneHint: key === "headline" ? "promotional" : "informational",
        });
        notes.push(`Filled missing required ${key} slot with a deterministic fallback.`);
      }
      return;
    }

    const forceGenericPromoHeadline = genericPromoIntent && key === "headline";
    const forceGenericPromoCta = genericPromoIntent && key === "cta";
    let text = slotDraft.text.trim();
    if (forceGenericPromoHeadline) {
      if (text !== genericPromoHeadline) {
        notes.push(
          "Rewrote generic promo headline with deterministic promotional wording.",
        );
      }
      text = genericPromoHeadline;
    } else if (forceGenericPromoCta) {
      if (text !== genericPromoCta) {
        notes.push(
          "Rewrote generic promo CTA with deterministic promo-safe wording.",
        );
      }
      text = genericPromoCta;
    } else if (genericPromoIntent && GENERIC_PROMO_LEAKAGE_PATTERN.test(text)) {
      text = fallbackText;
      notes.push(
        `Replaced subject-bearing ${key} copy slot with a generic promo-safe fallback.`,
      );
    }
    if (text.length > slotDraft.maxLength) {
      text = text.slice(0, slotDraft.maxLength).trim();
      notes.push(`Trimmed ${key} copy slot to maxLength=${slotDraft.maxLength}.`);
    }
    if (!text) {
      if (slotDraft.required) {
        text = fallbackText;
        notes.push(`Recovered empty required ${key} slot with a deterministic fallback.`);
      } else {
        return;
      }
    }

    slots.push({
      key,
      text,
      priority: slotDraft.priority,
      required: slotDraft.required,
      maxLength: slotDraft.maxLength,
      toneHint: slotDraft.toneHint,
    });
  };

  pushSlot("headline", draft.headline, genericPromoHeadline);
  pushSlot("subheadline", draft.subheadline, "지금 바로 확인하세요");
  pushSlot(
    "offer_line",
    draft.offerLine,
    intent.campaignGoal === "sale_conversion" ? "최대 50% OFF" : "지금 공개",
  );
  pushSlot("cta", draft.cta, genericPromoCta);
  pushSlot("footer_note", draft.footerNote, "이벤트 기간 내 혜택 적용");
  pushSlot(
    "badge_text",
    draft.badgeText,
    intent.campaignGoal === "sale_conversion" ? "SALE" : "NEW",
  );

  return slots;
}

function normalizeAbstractLayoutDraft(
  draft: TemplateAbstractLayoutDraft,
  intent: NormalizedIntent,
  genericPromoIntent: boolean,
  notes: string[],
): AbstractLayoutPlan {
  let layoutFamily = draft.layoutFamily;
  let copyAnchor = draft.copyAnchor;
  let visualAnchor = draft.visualAnchor;
  let ctaAnchor = draft.ctaAnchor;
  let density = draft.density;
  let slotTopology = draft.slotTopology;

  if (genericPromoIntent && layoutFamily === "subject_hero") {
    layoutFamily = intent.layoutIntent === "badge_led" ? "promo_badge" : "promo_split";
    notes.push(
      "Repaired subject_hero abstract layout into a promo-safe family for generic promo intent.",
    );
  }

  if (layoutFamily === "promo_center") {
    copyAnchor = "center";
    visualAnchor = "center";
    ctaAnchor = "bottom_center";
  } else if (layoutFamily === "subject_hero") {
    copyAnchor = "left";
    visualAnchor = "right";
    ctaAnchor = "below_copy";
  } else {
    copyAnchor = "left";
    visualAnchor = "right";
    ctaAnchor = "below_copy";
  }

  if (intent.layoutIntent === "badge_led" && layoutFamily !== "promo_badge") {
    layoutFamily = "promo_badge";
    slotTopology = "badge_headline_offer_cta_footer";
    density = "dense";
    notes.push("Promoted abstract layout family to promo_badge for badge-led intent.");
  }

  if (genericPromoIntent) {
    const canonicalTopology = derivePromoSlotTopology(
      layoutFamily,
      intent.campaignGoal,
    );
    if (slotTopology !== canonicalTopology) {
      slotTopology = canonicalTopology;
      notes.push(
        "Rewrote abstract layout slot topology with generic promo-safe structure.",
      );
    }
  }

  const summary = genericPromoIntent
    ? deriveGenericPromoAbstractLayoutSummary(layoutFamily)
    : draft.summary ||
      "Abstract layout plan captures copy/visual anchors before concrete geometry is chosen.";
  if (
    genericPromoIntent &&
    summary !==
      (draft.summary ||
        "Abstract layout plan captures copy/visual anchors before concrete geometry is chosen.")
  ) {
    notes.push(
      "Rewrote abstract layout summary with generic promo-safe structural wording.",
    );
  }

  return {
    planId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    plannerMode: intent.plannerMode,
    source:
      intent.plannerMode === "langchain" ? "langchain" : "heuristic",
    layoutFamily,
    copyAnchor,
    visualAnchor,
    ctaAnchor,
    density,
    slotTopology,
    summary,
  };
}

function buildFallbackCopyPlanDraft(
  prompt: string,
  intent: NormalizedIntent,
): TemplateCopyPlanDraft {
  const genericPromoIntent =
    intent.domain === "general_marketing" && intent.facets.menuType === null;
  return {
    headline: {
      text: genericPromoIntent ? deriveGenericPromoHeadline(prompt) : intent.goalSummary,
      priority: "primary",
      required: true,
      maxLength: 28,
      toneHint: "promotional",
    },
    subheadline: {
      text:
        intent.domain === "restaurant"
          ? "이번 시즌 메뉴를 지금 만나보세요"
          : "지금 바로 확인하세요",
      priority: "secondary",
      required: true,
      maxLength: 36,
      toneHint: "informational",
    },
    offerLine:
      intent.campaignGoal === "sale_conversion"
        ? {
            text: "최대 50% OFF",
            priority: "secondary",
            required: true,
            maxLength: 24,
            toneHint: "urgent",
          }
        : null,
    cta: {
      text:
        intent.facets.menuType === "food_menu"
          ? "메뉴 보기"
          : intent.facets.menuType === "drink_menu"
            ? "지금 주문하기"
            : genericPromoIntent
              ? deriveGenericPromoCta(prompt, intent)
              : "자세히 보기",
      priority: "supporting",
      required: true,
      maxLength: 18,
      toneHint: "promotional",
    },
    footerNote: {
      text:
        intent.campaignGoal === "sale_conversion"
          ? "한정 수량 / 재고 소진 시 종료"
          : "이벤트 기간 내 혜택 적용",
      priority: "utility",
      required: false,
      maxLength: 32,
      toneHint: "informational",
    },
    badgeText:
      intent.layoutIntent === "badge_led"
        ? {
            text: intent.campaignGoal === "sale_conversion" ? "SALE" : "NEW",
            priority: "supporting",
            required: false,
            maxLength: 12,
            toneHint: "urgent",
          }
        : null,
    summary: "Fallback copy plan derives promotional copy slots from canonical intent.",
  };
}

function buildFallbackAbstractLayoutDraft(
  _prompt: string,
  intent: NormalizedIntent,
): TemplateAbstractLayoutDraft {
  if (intent.assetPolicy.primaryVisualPolicy === "photo_preferred") {
    return {
      layoutFamily: "subject_hero",
      copyAnchor: "left",
      visualAnchor: "right",
      ctaAnchor: "below_copy",
      density: "balanced",
      slotTopology: "hero_headline_supporting_cta_footer",
      summary: "Fallback abstract layout preserves room for a hero visual.",
    };
  }

  if (intent.layoutIntent === "badge_led") {
    return {
      layoutFamily: "promo_badge",
      copyAnchor: "left",
      visualAnchor: "right",
      ctaAnchor: "below_copy",
      density: "dense",
      slotTopology: "badge_headline_offer_cta_footer",
      summary: "Fallback abstract layout emphasizes badges and promotional density.",
    };
  }

  return {
    layoutFamily: "promo_split",
    copyAnchor: "left",
    visualAnchor: "right",
    ctaAnchor: "below_copy",
    density: "balanced",
    slotTopology:
      intent.campaignGoal === "sale_conversion"
        ? "headline_supporting_offer_cta_footer"
        : "headline_supporting_cta_footer",
    summary: "Fallback abstract layout keeps copy and graphics in separate zones.",
  };
}

function deriveGenericPromoHeadline(prompt: string): string {
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

function deriveGenericPromoCta(
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

function deriveGenericPromoCopySummary(
  campaignGoal: NormalizedIntent["campaignGoal"],
): string {
  if (campaignGoal === "sale_conversion") {
    return "Copy plan uses a generic promotional headline, offer, CTA, and footer without explicit product or venue wording.";
  }
  return "Copy plan uses generic promotional copy slots without explicit product or venue wording.";
}

function deriveGenericPromoAbstractLayoutSummary(
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

function derivePromoSlotTopology(
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

function isGenericPromoIntent(intent: NormalizedIntent): boolean {
  const normalizedAssetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  return (
    intent.domain === "general_marketing" &&
    intent.facets.menuType === null &&
    normalizedAssetPolicy.primaryVisualPolicy === "graphic_preferred"
  );
}
