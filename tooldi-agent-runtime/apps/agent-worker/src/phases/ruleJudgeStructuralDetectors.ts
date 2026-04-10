import { normalizeTemplateAssetPolicy } from "@tooldi/agent-llm";

import type {
  AbstractLayoutPlan,
  ConcreteLayoutPlan,
  CopyPlan,
  NormalizedIntent,
  RuleJudgeIssue,
  SelectionDecision,
} from "../types.js";
import { surfaceRuleJudgeIssue } from "./ruleJudgeIssueDefinitions.js";

const GENERIC_PROMO_SUBJECT_LEAKAGE_PATTERN =
  /메뉴|음료|커피|식당|레스토랑|카페|패션|리테일|의류|한 잔|한잔/u;
const GENERIC_PROMO_CTA_LEAKAGE_PATTERN = /주문|메뉴|예약|쇼핑/u;

export function detectCopyPlanIssues(
  intent: NormalizedIntent,
  copyPlan: CopyPlan,
): RuleJudgeIssue[] {
  const issues: RuleJudgeIssue[] = [];
  const genericPromoIntent = isGenericPromoIntent(intent);
  const slotMap = new Map(copyPlan.slots.map((slot) => [slot.key, slot]));
  if (!slotMap.has("headline") || !slotMap.has("cta")) {
    issues.push(surfaceRuleJudgeIssue("copy_slot_missing"));
  }

  if (genericPromoIntent) {
    const subjectBearingSlot = copyPlan.slots.find(
      (slot) =>
        slot.key !== "cta" &&
        hasGenericPromoSubjectLeakage(slot.text),
    );
    if (
      subjectBearingSlot ||
      hasGenericPromoSubjectLeakage(copyPlan.primaryMessage)
    ) {
      issues.push(surfaceRuleJudgeIssue("copy_subject_leakage"));
    }
  }

  const headline = slotMap.get("headline");
  if (headline && headline.text.length >= headline.maxLength - 2) {
    issues.push(surfaceRuleJudgeIssue("headline_overflow_risk"));
  }

  const cta = slotMap.get("cta");
  if (genericPromoIntent && cta && GENERIC_PROMO_CTA_LEAKAGE_PATTERN.test(cta.text)) {
    issues.push(surfaceRuleJudgeIssue("copy_cta_subject_mismatch"));
  }
  if (
    !cta ||
    cta.text.length < 3 ||
    ["확인", "보기"].includes(cta.text)
  ) {
    issues.push(surfaceRuleJudgeIssue("cta_missing_or_weak"));
  }

  if (
    intent.campaignGoal === "sale_conversion" &&
    !slotMap.has("offer_line")
  ) {
    issues.push(surfaceRuleJudgeIssue("copy_hierarchy_weak"));
  }

  if (
    genericPromoIntent &&
    hasGenericPromoSubjectLeakage(copyPlan.summary)
  ) {
    issues.push(surfaceRuleJudgeIssue("copy_summary_intent_mismatch"));
  }

  return issues;
}

export function detectLayoutPlanIssues(
  intent: NormalizedIntent,
  abstractLayoutPlan: AbstractLayoutPlan,
  concreteLayoutPlan: ConcreteLayoutPlan,
  selectionDecision: SelectionDecision,
): RuleJudgeIssue[] {
  const issues: RuleJudgeIssue[] = [];
  const genericPromoIntent = isGenericPromoIntent(intent);
  if (
    intent.layoutIntent === "badge_led" &&
    abstractLayoutPlan.layoutFamily !== "promo_badge"
  ) {
    issues.push(surfaceRuleJudgeIssue("abstract_layout_intent_mismatch"));
  }

  if (
    genericPromoIntent &&
    (abstractLayoutPlan.layoutFamily === "subject_hero" ||
      hasGenericPromoSubjectLeakage(abstractLayoutPlan.summary))
  ) {
    issues.push(surfaceRuleJudgeIssue("abstract_layout_subject_leakage"));
  }

  if (hasResolvedSlotBoundsConflict(concreteLayoutPlan)) {
    issues.push(surfaceRuleJudgeIssue("concrete_layout_slot_conflict"));
  }

  return issues;
}

export function detectGraphicPromoStructureIssues(
  intent: NormalizedIntent,
  selectionDecision: SelectionDecision,
): RuleJudgeIssue[] {
  const assetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  const graphicRoles = selectionDecision.graphicCompositionSet?.roles ?? [];
  const roleNames = new Set(graphicRoles.map((role) => role.role));
  const graphicFirstPromo =
    selectionDecision.executionStrategy === "graphic_first_shape_text_group" &&
    assetPolicy.primaryVisualPolicy === "graphic_preferred" &&
    (intent.campaignGoal === "sale_conversion" ||
      intent.campaignGoal === "promotion_awareness");

  if (!graphicFirstPromo) {
    return [];
  }

  const issues: RuleJudgeIssue[] = [];

  if (graphicRoles.length < 3) {
    issues.push(surfaceRuleJudgeIssue("insufficient_graphic_density"));
  }

  if (!roleNames.has("primary_accent") || !roleNames.has("cta_container")) {
    issues.push(surfaceRuleJudgeIssue("promo_structure_incomplete"));
  }

  if (
    selectionDecision.layoutMode === "center_stack" ||
    (selectionDecision.layoutMode === "center_stack_promo" &&
      graphicRoles.length < 4)
  ) {
    issues.push(surfaceRuleJudgeIssue("cta_copy_overlap_risk"));
  }

  if (
    ["center_stack", "center_stack_promo"].includes(selectionDecision.layoutMode) &&
    graphicRoles.length < 4
  ) {
    issues.push(surfaceRuleJudgeIssue("excessive_empty_space"));
  }

  if (
    roleNames.has("primary_accent") &&
    !roleNames.has("secondary_accent") &&
    !roleNames.has("corner_accent")
  ) {
    issues.push(surfaceRuleJudgeIssue("graphic_role_imbalance"));
  }

  return issues;
}

function isGenericPromoIntent(intent: NormalizedIntent): boolean {
  const assetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  return (
    intent.domain === "general_marketing" &&
    intent.facets.menuType === null &&
    assetPolicy.primaryVisualPolicy === "graphic_preferred"
  );
}

function hasGenericPromoSubjectLeakage(text: string): boolean {
  return GENERIC_PROMO_SUBJECT_LEAKAGE_PATTERN.test(text);
}

function hasResolvedSlotBoundsConflict(
  concreteLayoutPlan: ConcreteLayoutPlan,
): boolean {
  const copyBounds = [
    concreteLayoutPlan.resolvedSlotBounds.headline,
    concreteLayoutPlan.resolvedSlotBounds.subheadline,
    concreteLayoutPlan.resolvedSlotBounds.offer_line,
    concreteLayoutPlan.resolvedSlotBounds.cta,
    concreteLayoutPlan.resolvedSlotBounds.footer_note,
  ].filter((bounds): bounds is NonNullable<typeof bounds> => bounds !== undefined);

  for (let index = 0; index < copyBounds.length; index += 1) {
    const current = copyBounds[index]!;
    for (let nextIndex = index + 1; nextIndex < copyBounds.length; nextIndex += 1) {
      const next = copyBounds[nextIndex]!;
      if (
        !(
          current.x + current.width <= next.x ||
          next.x + next.width <= current.x ||
          current.y + current.height <= next.y ||
          next.y + next.height <= current.y
        )
      ) {
        return true;
      }
    }
  }

  return false;
}
