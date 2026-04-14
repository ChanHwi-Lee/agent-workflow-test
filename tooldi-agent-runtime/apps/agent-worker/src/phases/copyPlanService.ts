import { createRequestId } from "@tooldi/agent-domain";
import type {
  TemplateCopyPlanDraft,
  TemplateCopyPlanGenerator,
} from "@tooldi/agent-llm";

import type {
  CopyPlan,
  CopyPlanNormalizationReport,
  CopyPlanSlot,
  NormalizedIntent,
  SceneRolePlan,
} from "../types.js";
import {
  deriveGenericPromoCopySummary,
  deriveGenericPromoCta,
  deriveGenericPromoHeadline,
  isGenericPromoIntent,
} from "./copyAbstractLayoutPlanningShared.js";

export async function buildCopyPlanArtifacts(
  prompt: string,
  intent: NormalizedIntent,
  generator: TemplateCopyPlanGenerator,
  priorContext?: string | null,
  sceneRolePlan?: SceneRolePlan | null,
): Promise<{
  copyPlan: CopyPlan;
  copyPlanNormalizationReport: CopyPlanNormalizationReport;
}> {
  const genericPromoIntent = isGenericPromoIntent(intent);
  const copyRepairs: string[] = [];
  const copyDraft = await generator.generate({
    prompt,
    brief: intent,
    ...(priorContext !== undefined ? { priorContext } : {}),
  });
  const normalizedSlots = normalizeCopyPlanSlots(
    copyDraft,
    prompt,
    intent,
    genericPromoIntent,
    copyRepairs,
    sceneRolePlan ?? null,
  );

  return {
    copyPlan: {
      planId: createRequestId(),
      runId: intent.runId,
      traceId: intent.traceId,
      plannerMode: intent.plannerMode,
      source: generator.mode,
      slots: normalizedSlots,
      primaryMessage:
        normalizedSlots.find((slot) => slot.key === "headline")?.text ??
        intent.goalSummary,
      summary:
        genericPromoIntent
          ? deriveGenericPromoCopySummary(intent.campaignGoal)
          : copyDraft.summary ||
            "Copy plan keeps the headline, offer, CTA, and footer as explicit slots.",
    },
    copyPlanNormalizationReport: {
      reportId: createRequestId(),
      runId: intent.runId,
      traceId: intent.traceId,
      source: generator.mode,
      draftAvailable: true,
      repairCount: copyRepairs.length,
      normalizationNotes:
        copyRepairs.length > 0
          ? copyRepairs
          : ["Copy plan draft required no normalization repairs."],
    },
  };
}

function normalizeCopyPlanSlots(
  draft: TemplateCopyPlanDraft,
  prompt: string,
  intent: NormalizedIntent,
  genericPromoIntent: boolean,
  notes: string[],
  sceneRolePlan: SceneRolePlan | null,
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

    let text = slotDraft.text.trim();
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

  return applySceneRolePlanToSlots(slots, sceneRolePlan, notes, genericPromoHeadline, genericPromoCta);
}

function applySceneRolePlanToSlots(
  slots: CopyPlanSlot[],
  sceneRolePlan: SceneRolePlan | null,
  notes: string[],
  headlineFallback: string,
  ctaFallback: string,
): CopyPlanSlot[] {
  if (!sceneRolePlan) {
    return slots;
  }

  const slotByKey = new Map(slots.map((slot) => [slot.key, slot] as const));
  const allowedKeys = new Set(
    sceneRolePlan.roles
      .map((role) => role.mappedSlotKey)
      .filter(
        (slotKey): slotKey is CopyPlanSlot["key"] =>
          slotKey !== "background" &&
          slotKey !== "hero_image" &&
          slotKey !== "decoration",
      ),
  );

  const filtered = [...slotByKey.values()].filter((slot) => allowedKeys.has(slot.key));
  const filteredByKey = new Map(filtered.map((slot) => [slot.key, slot] as const));

  for (const role of sceneRolePlan.roles) {
    if (
      role.mappedSlotKey === "background" ||
      role.mappedSlotKey === "hero_image" ||
      role.mappedSlotKey === "decoration"
    ) {
      continue;
    }
    if (filteredByKey.has(role.mappedSlotKey)) {
      continue;
    }
    if (!role.required) {
      continue;
    }

    const fallbackText =
      role.key === "primaryMessage"
        ? headlineFallback
        : role.key === "cta"
          ? ctaFallback
          : role.key === "offerEmphasis"
            ? "최대 50% OFF"
            : role.key === "badge"
              ? "SALE"
              : role.key === "legalNote"
                ? "이벤트 기간 내 혜택 적용"
                : "지금 확인하세요";
    filtered.push({
      key: role.mappedSlotKey,
      text: fallbackText,
      priority: role.priority,
      required: role.required,
      maxLength: role.maxLength ?? 36,
      toneHint: role.toneHint,
    });
    notes.push(`Recovered required ${role.key} from scene-role-plan with fallback text.`);
  }

  const slotOrder: Array<CopyPlanSlot["key"]> = [
    "badge_text",
    "headline",
    "subheadline",
    "offer_line",
    "cta",
    "footer_note",
  ];
  return filtered.sort(
    (left, right) => slotOrder.indexOf(left.key) - slotOrder.indexOf(right.key),
  );
}
