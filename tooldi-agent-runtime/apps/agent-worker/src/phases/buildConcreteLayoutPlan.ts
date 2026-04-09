import { createRequestId } from "@tooldi/agent-domain";

import type {
  ConcreteLayoutAnchorZone,
  AbstractLayoutPlan,
  ConcreteLayoutClusterZone,
  ConcreteLayoutPlan,
  CopyPlan,
  GraphicCompositionRole,
  SelectionDecision,
} from "../types.js";

export async function buildConcreteLayoutPlan(
  copyPlan: CopyPlan,
  abstractLayoutPlan: AbstractLayoutPlan,
  selectionDecision: SelectionDecision,
): Promise<ConcreteLayoutPlan> {
  const slotAnchors = resolveSlotAnchors(selectionDecision.layoutMode);
  const clusterZones = resolveClusterZones(selectionDecision.layoutMode);
  const graphicRolePlacementHints =
    selectionDecision.graphicCompositionSet?.roles.map((role) => ({
      role: role.role,
      zone: resolveRoleZone(role.role, selectionDecision.layoutMode),
    })) ?? [];

  return {
    planId: createRequestId(),
    runId: selectionDecision.runId,
    traceId: selectionDecision.traceId,
    plannerMode: copyPlan.plannerMode,
    abstractLayoutFamily: abstractLayoutPlan.layoutFamily,
    resolvedLayoutMode: selectionDecision.layoutMode,
    slotAnchors: {
      headline: slotAnchors.copy,
      subheadline: slotAnchors.copy,
      offer_line:
        selectionDecision.layoutMode === "badge_promo_stack"
          ? "center_copy_stack"
          : slotAnchors.copy,
      cta: slotAnchors.cta,
      footer_note: "footer_strip",
      ...((selectionDecision.layoutMode === "badge_led" ||
        selectionDecision.layoutMode === "badge_promo_stack")
        ? { badge_text: "top_badge_band" as const }
        : {}),
    },
    clusterZones,
    ctaContainerExpected:
      selectionDecision.graphicCompositionSet?.roles.some(
        (role) => role.role === "cta_container",
      ) ?? false,
    graphicRolePlacementHints,
    spacingIntent: abstractLayoutPlan.density,
    summary:
      `Concrete layout maps ${selectionDecision.layoutMode} onto ` +
      `${copyPlan.slots.length} copy slots with ${graphicRolePlacementHints.length} graphic role hints.`,
  };
}

function resolveSlotAnchors(layoutMode: SelectionDecision["layoutMode"]): {
  copy: ConcreteLayoutAnchorZone;
  cta: ConcreteLayoutAnchorZone;
} {
  switch (layoutMode) {
    case "center_stack":
    case "center_stack_promo":
    case "badge_promo_stack":
      return {
        copy: "center_copy_stack",
        cta: "bottom_center",
      };
    case "framed_promo":
      return {
        copy: "framed_copy_column",
        cta: "framed_copy_column",
      };
    default:
      return {
        copy: "left_copy_column",
        cta: "left_copy_column",
      };
  }
}

function resolveClusterZones(
  layoutMode: SelectionDecision["layoutMode"],
): ConcreteLayoutClusterZone[] {
  switch (layoutMode) {
    case "center_stack":
    case "center_stack_promo":
    case "badge_promo_stack":
      return ["center_cluster", "top_corner", "bottom_strip"];
    case "framed_promo":
      return ["frame", "right_cluster", "top_corner", "bottom_strip"];
    default:
      return ["right_cluster", "top_corner", "bottom_strip"];
  }
}

function resolveRoleZone(
  role: GraphicCompositionRole,
  layoutMode: SelectionDecision["layoutMode"],
): ConcreteLayoutClusterZone {
  if (role === "frame") {
    return "frame";
  }
  if (role === "corner_accent") {
    return "top_corner";
  }
  if (role === "badge_or_ribbon") {
    return "bottom_strip";
  }
  if (
    layoutMode === "center_stack" ||
    layoutMode === "center_stack_promo" ||
    layoutMode === "badge_promo_stack"
  ) {
    return "center_cluster";
  }
  return "right_cluster";
}
