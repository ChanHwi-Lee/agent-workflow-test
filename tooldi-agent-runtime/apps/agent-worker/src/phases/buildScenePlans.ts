import { createRequestId } from "@tooldi/agent-domain";

import type {
  AbstractLayoutCtaAnchor,
  AbstractLayoutDensity,
  AbstractLayoutFamily,
  AbstractLayoutSlotTopology,
  NormalizedIntent,
  SceneLayoutPlan,
  SceneRolePlan,
  SceneRolePlanEntry,
  TemplatePriorBundle,
} from "../types.js";

export function buildScenePlans(
  intent: NormalizedIntent,
  templatePriorBundle: TemplatePriorBundle | null,
): {
  sceneRolePlan: SceneRolePlan | null;
  sceneLayoutPlan: SceneLayoutPlan | null;
} {
  const scaffold = templatePriorBundle?.selectedScaffold;
  if (!templatePriorBundle || !scaffold || !templatePriorBundle.selectedTemplateCode || !templatePriorBundle.selectedTemplateTitle) {
    return {
      sceneRolePlan: null,
      sceneLayoutPlan: null,
    };
  }

  const resolved = resolveLayoutFromIntent(intent, scaffold);
  const roles = buildSceneRoleEntries(intent, resolved.layoutFamily, resolved.primaryVisualFamily);

  return {
    sceneRolePlan: {
      planId: createRequestId(),
      runId: intent.runId,
      traceId: intent.traceId,
      workflowVariant: templatePriorBundle.workflowVariant,
      selectedTemplateCode: templatePriorBundle.selectedTemplateCode,
      selectedTemplateTitle: templatePriorBundle.selectedTemplateTitle,
      roles,
      summary:
        `Scene roles derived from scaffold ${templatePriorBundle.selectedTemplateCode} ` +
        `with ${roles.length} active roles.`,
    },
    sceneLayoutPlan: {
      planId: createRequestId(),
      runId: intent.runId,
      traceId: intent.traceId,
      workflowVariant: templatePriorBundle.workflowVariant,
      selectedTemplateCode: templatePriorBundle.selectedTemplateCode,
      selectedTemplateTitle: templatePriorBundle.selectedTemplateTitle,
      layoutFamily: resolved.layoutFamily,
      layoutMode: resolved.layoutMode,
      copyAnchor: resolved.copyAnchor,
      visualAnchor: resolved.visualAnchor,
      ctaAnchor: resolved.ctaAnchor,
      density: resolved.density,
      slotTopology: resolved.slotTopology,
      primaryVisualFamily: resolved.primaryVisualFamily,
      resolution: resolved.resolution,
      summary:
        `Scene layout resolved ${resolved.layoutFamily}/${resolved.layoutMode} ` +
        `from scaffold ${templatePriorBundle.selectedTemplateCode} with ${resolved.resolution}.`,
    },
  };
}

function resolveLayoutFromIntent(
  intent: NormalizedIntent,
  scaffold: NonNullable<TemplatePriorBundle["selectedScaffold"]>,
): {
  layoutFamily: AbstractLayoutFamily;
  layoutMode: SceneLayoutPlan["layoutMode"];
  copyAnchor: SceneLayoutPlan["copyAnchor"];
  visualAnchor: SceneLayoutPlan["visualAnchor"];
  ctaAnchor: AbstractLayoutCtaAnchor;
  density: AbstractLayoutDensity;
  slotTopology: AbstractLayoutSlotTopology;
  primaryVisualFamily: "graphic" | "photo";
  resolution: SceneLayoutPlan["resolution"];
} {
  let layoutFamily = scaffold.layoutFamilyHint;
  let layoutMode = scaffold.layoutModeHint;
  let copyAnchor = scaffold.copyAnchor;
  let visualAnchor = scaffold.visualAnchor;
  let primaryVisualFamily = scaffold.primaryVisualFamilyHint;
  let resolution: SceneLayoutPlan["resolution"] = "scaffold";

  if (intent.layoutIntent === "badge_led" && layoutFamily !== "promo_badge") {
    layoutFamily = "promo_badge";
    layoutMode = "badge_promo_stack";
    copyAnchor = "center";
    visualAnchor = "center";
    primaryVisualFamily = "graphic";
    resolution = "intent_override";
  }

  if (intent.layoutIntent === "copy_focused" && layoutFamily === "subject_hero") {
    layoutFamily = "promo_split";
    layoutMode = "left_copy_right_graphic";
    primaryVisualFamily = "graphic";
    resolution = "intent_override";
  }

  if (intent.primaryVisualPolicy === "graphic_preferred" && primaryVisualFamily === "photo") {
    primaryVisualFamily = "graphic";
    if (layoutMode === "copy_left_with_right_photo") {
      layoutMode = copyAnchor === "center" ? "center_stack_promo" : "left_copy_right_graphic";
    }
    if (layoutFamily === "subject_hero") {
      layoutFamily = copyAnchor === "center" ? "promo_center" : "promo_split";
    }
    resolution = "intent_override";
  }

  const hasOffer = intent.offerIntent === "sale" || intent.campaignGoal === "sale_conversion";
  const slotTopology = resolveSlotTopology(layoutFamily, primaryVisualFamily, hasOffer);
  const ctaAnchor = copyAnchor === "center" ? "bottom_center" : "below_copy";
  const density = intent.layoutIntent === "badge_led" ? "dense" : copyAnchor === "center" ? "airy" : "balanced";

  return {
    layoutFamily,
    layoutMode,
    copyAnchor,
    visualAnchor,
    ctaAnchor,
    density,
    slotTopology,
    primaryVisualFamily,
    resolution,
  };
}

function buildSceneRoleEntries(
  intent: NormalizedIntent,
  layoutFamily: AbstractLayoutFamily,
  primaryVisualFamily: "graphic" | "photo",
): SceneRolePlanEntry[] {
  const roles: SceneRolePlanEntry[] = [
    {
      key: "background",
      required: true,
      preferredZone: "background",
      mappedExecutionSlotKey: "background",
      priority: "utility",
      maxLength: null,
      toneHint: null,
      source: "scaffold",
      summary: "Base page background derived from the selected scaffold.",
    },
    {
      key: "primaryMessage",
      required: true,
      preferredZone: "copy_cluster",
      mappedExecutionSlotKey: "headline",
      priority: "primary",
      maxLength: 28,
      toneHint: "promotional",
      source: "intent",
      summary: "Primary promotional headline for the banner.",
    },
    {
      key: "cta",
      required: true,
      preferredZone: "copy_cluster",
      mappedExecutionSlotKey: "cta",
      priority: "secondary",
      maxLength: 18,
      toneHint: "promotional",
      source: "intent",
      summary: "Primary CTA block required for ad conversion.",
    },
  ];

  if (layoutFamily !== "promo_badge") {
    roles.push({
      key: "supportingMessage",
      required: intent.subjectBinding !== "subjectless",
      preferredZone: "copy_cluster",
      mappedExecutionSlotKey: "subheadline",
      priority: "secondary",
      maxLength: 36,
      toneHint: "informational",
      source: "intent",
      summary: "Supporting message that clarifies the offer.",
    });
  }

  if (intent.offerIntent === "sale" || intent.campaignGoal === "sale_conversion") {
    roles.push({
      key: "offerEmphasis",
      required: true,
      preferredZone: "copy_cluster",
      mappedExecutionSlotKey: "offer_line",
      priority: "primary",
      maxLength: 20,
      toneHint: "urgent",
      source: "hybrid",
      summary: "Offer emphasis block for discount or limited-time messaging.",
    });
  }

  if (layoutFamily === "promo_badge") {
    roles.push({
      key: "badge",
      required: true,
      preferredZone: "badge",
      mappedExecutionSlotKey: "badge_text",
      priority: "supporting",
      maxLength: 12,
      toneHint: "promotional",
      source: "scaffold",
      summary: "Badge or promo token derived from badge-led scaffold.",
    });
  }

  if (primaryVisualFamily === "photo") {
    roles.push({
      key: "heroVisual",
      required: true,
      preferredZone: "visual_cluster",
      mappedExecutionSlotKey: "hero_image",
      priority: "supporting",
      maxLength: null,
      toneHint: null,
      source: "scaffold",
      summary: "Primary hero visual field derived from the selected template scaffold.",
    });
  } else {
    roles.push({
      key: "accentVisual",
      required: true,
      preferredZone: "visual_cluster",
      mappedExecutionSlotKey: null,
      priority: "supporting",
      maxLength: null,
      toneHint: null,
      source: "scaffold",
      summary: "Graphic accent field derived from the selected template scaffold.",
    });
  }

  roles.push({
    key: "legalNote",
    required: false,
    preferredZone: "footer",
    mappedExecutionSlotKey: "footer_note",
    priority: "utility",
    maxLength: 36,
    toneHint: "informational",
    source: "intent",
    summary: "Footer or disclaimer note for promotional ads.",
  });

  return roles;
}

function resolveSlotTopology(
  layoutFamily: AbstractLayoutFamily,
  primaryVisualFamily: "graphic" | "photo",
  hasOffer: boolean,
): AbstractLayoutSlotTopology {
  if (layoutFamily === "promo_badge") {
    return "badge_headline_offer_cta_footer";
  }
  if (layoutFamily === "subject_hero" || primaryVisualFamily === "photo") {
    return "hero_headline_supporting_cta_footer";
  }
  return hasOffer
    ? "headline_supporting_offer_cta_footer"
    : "headline_supporting_cta_footer";
}
