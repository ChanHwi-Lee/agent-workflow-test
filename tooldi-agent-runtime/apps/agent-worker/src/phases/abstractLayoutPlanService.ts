import { createRequestId } from "@tooldi/agent-domain";
import type {
  TemplateAbstractLayoutDraft,
  TemplateAbstractLayoutGenerator,
} from "@tooldi/agent-llm";

import type {
  AbstractLayoutPlan,
  AbstractLayoutPlanNormalizationReport,
  NormalizedIntent,
} from "../types.js";
import {
  deriveGenericPromoAbstractLayoutSummary,
  derivePromoSlotTopology,
  isGenericPromoIntent,
} from "./copyAbstractLayoutPlanningShared.js";

export async function buildAbstractLayoutPlanArtifacts(
  prompt: string,
  intent: NormalizedIntent,
  generator: TemplateAbstractLayoutGenerator,
): Promise<{
  abstractLayoutPlan: AbstractLayoutPlan;
  abstractLayoutPlanNormalizationReport: AbstractLayoutPlanNormalizationReport;
}> {
  const genericPromoIntent = isGenericPromoIntent(intent);
  const layoutRepairs: string[] = [];
  const abstractLayoutDraft = await generator.generate({
    prompt,
    brief: intent,
  });
  const abstractLayoutPlan = normalizeAbstractLayoutDraft(
    abstractLayoutDraft,
    intent,
    genericPromoIntent,
    layoutRepairs,
  );

  return {
    abstractLayoutPlan,
    abstractLayoutPlanNormalizationReport: {
      reportId: createRequestId(),
      runId: intent.runId,
      traceId: intent.traceId,
      source: generator.mode,
      draftAvailable: true,
      repairCount: layoutRepairs.length,
      normalizationNotes:
        layoutRepairs.length > 0
          ? layoutRepairs
          : ["Abstract layout draft required no normalization repairs."],
    },
  };
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
    source: intent.plannerMode === "langchain" ? "langchain" : "heuristic",
    layoutFamily,
    copyAnchor,
    visualAnchor,
    ctaAnchor,
    density,
    slotTopology,
    summary,
  };
}
