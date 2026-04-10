import { createRequestId } from "@tooldi/agent-domain";
import type { TemplatePriorSummary } from "@tooldi/agent-contracts";

import type {
  AssetPlan,
  ConcreteLayoutClusterZone,
  GraphicCompositionRole,
  NormalizedIntent,
  SearchProfileArtifact,
  SelectionDecision,
} from "../types.js";

export async function buildAssetPlan(
  intent: NormalizedIntent,
  templatePriorSummary: TemplatePriorSummary,
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
): Promise<AssetPlan> {
  const primaryVisualFamily =
    selectionDecision.photoBranchMode === "photo_selected" &&
    selectionDecision.topPhotoCandidateId !== null
      ? "photo"
      : "graphic";

  const graphicRoleBindings =
    selectionDecision.graphicCompositionSet?.roles.map((role) => ({
      role: role.role,
      candidateId: role.candidateId,
      sourceAssetId: role.sourceAssetId,
      sourceSerial: role.sourceSerial,
      sourceCategory: role.sourceCategory,
      variantKey: role.variantKey,
      decorationMode: role.decorationMode,
      required: isRequiredGraphicRole(primaryVisualFamily, role.role),
      zonePreference: resolveRoleZonePreference(role.role, selectionDecision.layoutMode),
    })) ?? [];

  const hasCtaContainer = graphicRoleBindings.some(
    (binding) => binding.role === "cta_container",
  );

  const photoBinding =
    primaryVisualFamily === "photo"
      ? {
          candidateId: selectionDecision.topPhotoCandidateId ?? "photo_unknown",
          sourceAssetId: selectionDecision.topPhotoAssetId,
          sourceSerial: selectionDecision.topPhotoSerial,
          sourceCategory: selectionDecision.topPhotoCategory,
          sourceUid: selectionDecision.topPhotoUid,
          sourceOriginUrl: selectionDecision.topPhotoUrl,
          sourceWidth: selectionDecision.topPhotoWidth,
          sourceHeight: selectionDecision.topPhotoHeight,
          orientation: selectionDecision.topPhotoOrientation,
          fitMode: "cover" as const,
          cropMode: "centered_cover" as const,
          required: true,
        }
      : null;

  const eligibilityReasons: string[] = [];
  let degraded = false;
  let canRender = true;

  if (!selectionDecision.selectedBackgroundCandidateId) {
    canRender = false;
    eligibilityReasons.push("background_binding_missing");
  }

  if (primaryVisualFamily === "photo") {
    if (
      photoBinding === null ||
      !photoBinding.sourceOriginUrl ||
      photoBinding.sourceWidth === null ||
      photoBinding.sourceHeight === null
    ) {
      canRender = false;
      eligibilityReasons.push("photo_binding_incomplete");
    }
  }

  if (
    primaryVisualFamily === "graphic" &&
    !graphicRoleBindings.some((binding) => binding.role === "primary_accent")
  ) {
    degraded = true;
    eligibilityReasons.push("primary_accent_missing");
  }

  if (!hasCtaContainer) {
    degraded = true;
    eligibilityReasons.push("cta_container_missing_fallback_pill");
  }

  const promotedKeyword =
    templatePriorSummary.selectedTemplatePrior.keyword ??
    searchProfile.graphic.queries[0]?.keyword ??
    searchProfile.photo.queries[0]?.keyword ??
    null;
  const backgroundColorHex =
    intent.backgroundColorHex ??
    selectionDecision.selectedBackgroundColorHex ??
    searchProfile.background.colorHex;

  return {
    planId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    plannerMode: intent.plannerMode,
    primaryVisualFamily,
    backgroundBinding: {
      candidateId: selectionDecision.selectedBackgroundCandidateId,
      sourceKind: "generated_solid",
      sourceAssetId: selectionDecision.selectedBackgroundAssetId,
      sourceSerial: selectionDecision.selectedBackgroundSerial,
      sourceCategory: selectionDecision.selectedBackgroundCategory,
      colorHex: backgroundColorHex,
      backgroundMode: selectionDecision.backgroundMode,
    },
    graphicRoleBindings,
    photoBinding,
    fallbackPolicy: {
      missingOptionalGraphicRoles: "drop",
      missingCtaContainer: "fallback_cta_pill",
      unavailablePhotoPrimary: "demote_to_graphic_primary",
    },
    executionEligibility: {
      canRender,
      degraded,
      reasons: eligibilityReasons,
    },
    summary:
      `Asset plan promotes ${primaryVisualFamily} as the primary visual family` +
      (promotedKeyword ? ` using prior/query keyword "${promotedKeyword}"` : "") +
      ` with ${graphicRoleBindings.length} graphic role bindings.`,
  };
}

function isRequiredGraphicRole(
  primaryVisualFamily: AssetPlan["primaryVisualFamily"],
  role: GraphicCompositionRole,
): boolean {
  if (role === "primary_accent" || role === "cta_container") {
    return true;
  }
  if (primaryVisualFamily === "graphic" && role === "secondary_accent") {
    return true;
  }
  return false;
}

function resolveRoleZonePreference(
  role: GraphicCompositionRole,
  layoutMode: SelectionDecision["layoutMode"],
): ConcreteLayoutClusterZone {
  if (role === "frame") {
    return "frame";
  }
  if (role === "cta_container") {
    return layoutMode === "badge_promo_stack" ? "center_cluster" : "bottom_strip";
  }
  if (role === "badge_or_ribbon") {
    return "bottom_strip";
  }
  if (role === "corner_accent") {
    return "top_corner";
  }
  if (
    layoutMode === "center_stack" ||
    layoutMode === "center_stack_promo" ||
    layoutMode === "badge_promo_stack" ||
    layoutMode === "badge_led"
  ) {
    return "center_cluster";
  }
  return "right_cluster";
}
