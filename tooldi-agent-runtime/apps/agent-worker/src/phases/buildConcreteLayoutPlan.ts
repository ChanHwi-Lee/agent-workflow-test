import { createRequestId } from "@tooldi/agent-domain";
import type { ExecutionSlotKey } from "@tooldi/agent-contracts";
import type { TextLayoutHelper } from "@tooldi/tool-adapters";

import type {
  AssetPlan,
  ConcreteLayoutAnchorZone,
  AbstractLayoutPlan,
  HydratedPlanningInput,
  ConcreteLayoutClusterZone,
  CopyPlan,
  GraphicCompositionRole,
  LayoutBounds,
  SelectionDecision,
  ConcreteLayoutPlan,
} from "../types.js";
import { createGeometryPresets, resolveBoundsForAnchor } from "./layoutGeometry.js";

export interface BuildConcreteLayoutPlanDependencies {
  textLayoutHelper: TextLayoutHelper;
}

export async function buildConcreteLayoutPlan(
  input: HydratedPlanningInput,
  copyPlan: CopyPlan,
  abstractLayoutPlan: AbstractLayoutPlan,
  assetPlan: AssetPlan,
  selectionDecision: SelectionDecision,
  dependencies: BuildConcreteLayoutPlanDependencies,
): Promise<ConcreteLayoutPlan> {
  const resolvedSlotTopology = resolveSlotTopology(
    copyPlan,
    abstractLayoutPlan,
    assetPlan,
  );
  const resolvedLayoutMode = resolveLayoutMode(
    abstractLayoutPlan,
    assetPlan,
    selectionDecision,
  );
  const slotAnchors = resolveSlotAnchors(abstractLayoutPlan, resolvedSlotTopology);
  const clusterZones = resolveClusterZones(abstractLayoutPlan, assetPlan);
  const graphicRolePlacementHints = assetPlan.graphicRoleBindings.map((binding) => ({
    role: binding.role,
    zone: resolvePlacementZone(binding.zonePreference, clusterZones, binding.role),
  }));
  const hasBadgeSlot = copyPlan.slots.some((slot) => slot.key === "badge_text");
  const ctaContainerExpected =
    copyPlan.slots.some((slot) => slot.key === "cta") &&
    (assetPlan.primaryVisualFamily === "graphic" ||
      assetPlan.graphicRoleBindings.some((binding) => binding.role === "cta_container"));
  const headlineText =
    copyPlan.slots.find((slot) => slot.key === "headline")?.text ?? copyPlan.primaryMessage;
  const headlineLayout = await dependencies.textLayoutHelper.estimate({
    text: headlineText.slice(0, 48),
    maxWidth: Math.max(320, input.request.editorContext.canvasWidth - 160),
  });
  const headlineEstimatedHeight = headlineLayout.height;
  const geometryPresets = createGeometryPresets(
    input.request.editorContext.canvasWidth,
    input.request.editorContext.canvasHeight,
    abstractLayoutPlan.layoutFamily,
    resolvedLayoutMode,
    selectionDecision.decorationMode,
    headlineEstimatedHeight,
    abstractLayoutPlan.density,
  );
  const resolvedSlotBounds = buildResolvedSlotBounds(
    copyPlan,
    slotAnchors,
    hasBadgeSlot,
    assetPlan,
    geometryPresets,
    input.request.editorContext.canvasWidth,
    input.request.editorContext.canvasHeight,
  );

  return {
    planId: createRequestId(),
    runId: selectionDecision.runId,
    traceId: selectionDecision.traceId,
    plannerMode: copyPlan.plannerMode,
    abstractLayoutFamily: abstractLayoutPlan.layoutFamily,
    resolvedSlotTopology,
    primaryVisualFamily: assetPlan.primaryVisualFamily,
    resolvedLayoutMode,
    slotAnchors: {
      headline: slotAnchors.copy,
      subheadline: slotAnchors.copy,
      ...(copyPlan.slots.some((slot) => slot.key === "offer_line")
        ? { offer_line: slotAnchors.copy }
        : {}),
      cta: slotAnchors.cta,
      footer_note: "footer_strip",
      ...(hasBadgeSlot ? { badge_text: "top_badge_band" as const } : {}),
    },
    resolvedSlotBounds,
    headlineEstimatedHeight,
    clusterZones,
    ctaContainerExpected,
    graphicRolePlacementHints,
    spacingIntent: abstractLayoutPlan.density,
    summary:
      `Concrete layout resolves ${abstractLayoutPlan.layoutFamily}/${resolvedSlotTopology} ` +
      `into ${resolvedLayoutMode} with ${copyPlan.slots.length} copy slots and ` +
      `${graphicRolePlacementHints.length} graphic role hints for ${assetPlan.primaryVisualFamily} primary visual.`,
  };
}

function buildResolvedSlotBounds(
  copyPlan: CopyPlan,
  slotAnchors: {
    copy: ConcreteLayoutAnchorZone;
    cta: ConcreteLayoutAnchorZone;
  },
  hasBadgeSlot: boolean,
  assetPlan: AssetPlan,
  geometryPresets: ReturnType<typeof createGeometryPresets>,
  canvasWidth: number,
  canvasHeight: number,
): Partial<Record<ExecutionSlotKey, LayoutBounds>> {
  const bounds: Partial<Record<ExecutionSlotKey, LayoutBounds>> = {
    background: {
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
    },
    headline: resolveBoundsForAnchor(slotAnchors.copy, "headline", geometryPresets),
    subheadline: resolveBoundsForAnchor(
      slotAnchors.copy,
      "subheadline",
      geometryPresets,
    ),
    cta: resolveBoundsForAnchor(slotAnchors.cta, "cta", geometryPresets),
    footer_note: resolveBoundsForAnchor(
      "footer_strip",
      "footer_note",
      geometryPresets,
    ),
  };

  if (copyPlan.slots.some((slot) => slot.key === "offer_line")) {
    bounds.offer_line = resolveBoundsForAnchor(
      slotAnchors.copy,
      "offer_line",
      geometryPresets,
    );
  }

  if (hasBadgeSlot) {
    bounds.badge_text = resolveBoundsForAnchor(
      "top_badge_band",
      "badge_text",
      geometryPresets,
    );
  }

  if (assetPlan.primaryVisualFamily === "photo" && assetPlan.photoBinding !== null) {
    bounds.hero_image = geometryPresets.current.heroPanel;
  }

  return bounds;
}

function resolveSlotAnchors(
  abstractLayoutPlan: AbstractLayoutPlan,
  resolvedSlotTopology: ConcreteLayoutPlan["resolvedSlotTopology"],
): {
  copy: ConcreteLayoutAnchorZone;
  cta: ConcreteLayoutAnchorZone;
} {
  const copy =
    abstractLayoutPlan.copyAnchor === "center"
      ? "center_copy_stack"
      : abstractLayoutPlan.layoutFamily === "promo_frame"
        ? "framed_copy_column"
        : "left_copy_column";

  if (resolvedSlotTopology === "badge_headline_offer_cta_footer") {
    return {
      copy: abstractLayoutPlan.copyAnchor === "center" ? "center_copy_stack" : copy,
      cta:
        abstractLayoutPlan.ctaAnchor === "bottom_center"
          ? "bottom_center"
          : abstractLayoutPlan.copyAnchor === "center"
            ? "center_copy_stack"
            : copy,
    };
  }

  return {
    copy,
    cta:
      abstractLayoutPlan.ctaAnchor === "bottom_center"
        ? "bottom_center"
        : copy,
  };
}

function resolveClusterZones(
  abstractLayoutPlan: AbstractLayoutPlan,
  assetPlan: AssetPlan,
): ConcreteLayoutClusterZone[] {
  switch (abstractLayoutPlan.layoutFamily) {
    case "promo_center":
    case "promo_badge":
      return ["center_cluster", "top_corner", "bottom_strip"];
    case "promo_frame":
      return ["frame", "right_cluster", "top_corner", "bottom_strip"];
    case "subject_hero":
      return assetPlan.primaryVisualFamily === "photo"
        ? ["hero_panel", "top_corner", "bottom_strip"]
        : ["right_cluster", "top_corner", "bottom_strip"];
    case "promo_split":
    default:
      return ["right_cluster", "top_corner", "bottom_strip"];
  }
}

function resolvePlacementZone(
  preferredZone: ConcreteLayoutClusterZone,
  clusterZones: ConcreteLayoutClusterZone[],
  role: GraphicCompositionRole,
): ConcreteLayoutClusterZone {
  if (clusterZones.includes(preferredZone)) {
    return preferredZone;
  }

  if (role === "frame") {
    return clusterZones.includes("frame") ? "frame" : clusterZones[0]!;
  }
  if (role === "corner_accent") {
    return clusterZones.includes("top_corner") ? "top_corner" : clusterZones[0]!;
  }
  if (role === "badge_or_ribbon") {
    return clusterZones.includes("bottom_strip")
      ? "bottom_strip"
      : clusterZones[0]!;
  }
  if (role === "cta_container") {
    return (
      clusterZones.find((zone) =>
        ["bottom_strip", "center_cluster", "right_cluster"].includes(zone),
      ) ?? clusterZones[0]!
    );
  }
  return (
    clusterZones.find((zone) =>
      ["right_cluster", "center_cluster", "hero_panel"].includes(zone),
    ) ?? clusterZones[0]!
  );
}

function resolveSlotTopology(
  copyPlan: CopyPlan,
  abstractLayoutPlan: AbstractLayoutPlan,
  assetPlan: AssetPlan,
): ConcreteLayoutPlan["resolvedSlotTopology"] {
  const hasOfferLine = copyPlan.slots.some((slot) => slot.key === "offer_line");
  const hasBadgeText = copyPlan.slots.some((slot) => slot.key === "badge_text");

  if (
    assetPlan.primaryVisualFamily === "photo" &&
    abstractLayoutPlan.layoutFamily === "subject_hero"
  ) {
    return "hero_headline_supporting_cta_footer";
  }

  if (hasBadgeText || abstractLayoutPlan.layoutFamily === "promo_badge") {
    return "badge_headline_offer_cta_footer";
  }

  return hasOfferLine
    ? "headline_supporting_offer_cta_footer"
    : "headline_supporting_cta_footer";
}

function resolveLayoutMode(
  abstractLayoutPlan: AbstractLayoutPlan,
  assetPlan: AssetPlan,
  selectionDecision: SelectionDecision,
): SelectionDecision["layoutMode"] {
  switch (abstractLayoutPlan.layoutFamily) {
    case "promo_center":
      return selectionDecision.layoutMode === "badge_led"
        ? "center_stack"
        : "center_stack_promo";
    case "promo_badge":
      return "badge_promo_stack";
    case "promo_frame":
      return "framed_promo";
    case "subject_hero":
      return assetPlan.primaryVisualFamily === "photo"
        ? "copy_left_with_right_photo"
        : "left_copy_right_graphic";
    case "promo_split":
    default:
      return assetPlan.primaryVisualFamily === "photo"
        ? "copy_left_with_right_photo"
        : "left_copy_right_graphic";
  }
}
