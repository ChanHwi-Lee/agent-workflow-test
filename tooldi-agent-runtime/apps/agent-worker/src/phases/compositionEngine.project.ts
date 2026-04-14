import { createRequestId } from "@tooldi/agent-domain";

import type {
  CompositionVariant,
  CompositionVariantSet,
  GraphicCompositionEntry,
  GraphicCompositionSet,
  NormalizedIntent,
  SceneBindingPlan,
  SelectionDecision,
  TemplateCandidateBundle,
} from "../types.js";

type BackgroundCandidate =
  TemplateCandidateBundle["background"]["candidates"][number];
type DecorationCandidate =
  TemplateCandidateBundle["decoration"]["candidates"][number];
type PhotoCandidate = TemplateCandidateBundle["photo"]["candidates"][number];

export type ProjectionSelections = {
  background: BackgroundCandidate;
  orderedDecorations: DecorationCandidate[];
  topPhotoCandidate: PhotoCandidate | null;
  photoEligibilityReason: string;
  photoEligibilityMode: SelectionDecision["photoBranchMode"];
};

export function projectWinningVariant(
  intent: NormalizedIntent,
  commonSelections: ProjectionSelections,
  winner: CompositionVariant,
  compositionVariantSet: CompositionVariantSet,
  sceneBindingPlan: SceneBindingPlan | null,
): SelectionDecision {
  const selectedDecoration =
    commonSelections.orderedDecorations.find(
      (candidate) => candidate.candidateId === winner.decorationCandidateId,
    ) ?? commonSelections.orderedDecorations[0] ?? null;
  const graphicCompositionSet =
    winner.familyKey === "copy_left_with_right_photo" &&
    winner.photoMode === "photo_selected"
      ? buildPhotoSupportGraphicCompositionSet(selectedDecoration, sceneBindingPlan)
      : buildGraphicCompositionSet(selectedDecoration, winner, sceneBindingPlan);
  const decorationMode = sceneBindingPlan?.preferredDecorationMode ??
    (winner.familyKey === "copy_left_with_right_photo" &&
    winner.photoMode === "photo_selected"
      ? "photo_support"
      : graphicCompositionSet.roles.length >= 3
        ? "promo_multi_graphic"
        : selectedDecoration?.payload.decorationMode ?? "graphic_cluster");

  return {
    decisionId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    retrievalMode: "none",
    compareCriteria: [
      "seasonalFit",
      "readabilitySupport",
      "ctaVisibilitySupport",
      "layoutCompatibility",
      "executionSimplicity",
      "fallbackSafety",
      "focalSafety",
      "cropSafety",
      "copySeparationSupport",
    ],
    selectedBackgroundCandidateId: commonSelections.background.candidateId,
    selectedLayoutCandidateId: winner.layoutCandidateId,
    selectedDecorationCandidateId: selectedDecoration?.candidateId ?? "",
    topPhotoCandidateId: commonSelections.topPhotoCandidate?.candidateId ?? null,
    selectedBackgroundAssetId: commonSelections.background.sourceAssetId ?? null,
    selectedBackgroundSerial: commonSelections.background.sourceSerial ?? null,
    selectedBackgroundCategory: commonSelections.background.sourceCategory ?? null,
    selectedBackgroundColorHex:
      sceneBindingPlan?.backgroundColorHex ??
      (typeof commonSelections.background.payload.backgroundColorHex === "string" &&
      commonSelections.background.payload.backgroundColorHex.length > 0
        ? commonSelections.background.payload.backgroundColorHex
        : "#ffffff"),
    selectedDecorationAssetId: selectedDecoration?.sourceAssetId ?? null,
    selectedDecorationSerial: selectedDecoration?.sourceSerial ?? null,
    selectedDecorationCategory: selectedDecoration?.sourceCategory ?? null,
    topPhotoAssetId: commonSelections.topPhotoCandidate?.sourceAssetId ?? null,
    topPhotoSerial: commonSelections.topPhotoCandidate?.sourceSerial ?? null,
    topPhotoCategory: commonSelections.topPhotoCandidate?.sourceCategory ?? null,
    topPhotoUid: commonSelections.topPhotoCandidate?.sourceUid ?? null,
    topPhotoUrl: commonSelections.topPhotoCandidate?.sourceOriginUrl ?? null,
    topPhotoWidth: commonSelections.topPhotoCandidate?.sourceWidth ?? null,
    topPhotoHeight: commonSelections.topPhotoCandidate?.sourceHeight ?? null,
    topPhotoOrientation:
      commonSelections.topPhotoCandidate?.payload.photoOrientation ?? null,
    backgroundMode:
      sceneBindingPlan?.backgroundMode ??
      commonSelections.background.payload.backgroundMode ??
      "generated_solid",
    layoutMode: winner.layoutMode,
    decorationMode,
    photoBranchMode: winner.photoMode,
    photoBranchReason:
      winner.familyKey === "copy_left_with_right_photo"
        ? commonSelections.photoEligibilityReason
        : commonSelections.photoEligibilityMode === "photo_selected"
          ? "graphic-first composition remained the stronger winner after internal variant ranking"
          : commonSelections.photoEligibilityReason,
    executionStrategy: winner.executionStrategy,
    graphicCompositionSet,
    summary:
      `Selected ${winner.variantSignature} from ${compositionVariantSet.variants.length} ` +
      `diverse composition variants for ${intent.domain} ${intent.campaignGoal}` +
      (sceneBindingPlan ? ` with ${sceneBindingPlan.preferredDecorationMode} style binding.` : "."),
    fallbackSummary:
      winner.familyKey === "copy_left_with_right_photo" &&
      winner.photoMode === "photo_selected"
        ? "Photo-support composition won the internal variant ranking and will execute through the photo hero path."
        : "Graphic-first composition won the internal variant ranking and remains the editable-safe fallback.",
  };
}

function buildGraphicCompositionSet(
  selectedDecoration: DecorationCandidate | null,
  variant: CompositionVariant,
  sceneBindingPlan: SceneBindingPlan | null,
): GraphicCompositionSet {
  if (!selectedDecoration) {
    return {
      density: "minimal",
      roles: [],
      summary: "Graphic composition is empty because no decoration candidate is available.",
    };
  }

  const accentDensity = sceneBindingPlan?.preferredAccentDensity ??
    variant.accentDensity;
  const badgeProminence = sceneBindingPlan?.preferredBadgeProminence ??
    variant.badgeProminence;
  const ctaTreatment = sceneBindingPlan?.preferredCtaTreatment ??
    variant.ctaTreatment;
  const structuralBandCta = usesWideBandCta(sceneBindingPlan);
  const roles: GraphicCompositionEntry[] = [
    buildGraphicRoleEntry("primary_accent", selectedDecoration),
  ];

  if (!structuralBandCta) {
    roles.push(buildGraphicRoleEntry("cta_container", selectedDecoration));
  }

  if (accentDensity === "medium") {
    roles.push(buildGraphicRoleEntry("secondary_accent", selectedDecoration));
  }

  if (accentDensity === "medium" || variant.negativeSpaceBias !== "tight") {
    roles.push(buildGraphicRoleEntry("corner_accent", selectedDecoration));
  }

  if (badgeProminence !== "none") {
    roles.push(buildGraphicRoleEntry("badge_or_ribbon", selectedDecoration));
  }

  if (ctaTreatment === "framed" && shouldIncludeFrameRole(variant, sceneBindingPlan)) {
    roles.push(buildGraphicRoleEntry("frame", selectedDecoration));
  }

  return {
    density: roles.length >= 3 ? "medium" : "minimal",
    roles,
    summary:
      roles.length >= 3
        ? `Graphic composition uses ${roles.length} roles for ${variant.variantSignature}.`
        : `Graphic composition keeps a compact accent set for ${variant.variantSignature}.`,
  };
}

function buildPhotoSupportGraphicCompositionSet(
  selectedDecoration: DecorationCandidate | null,
  sceneBindingPlan: SceneBindingPlan | null,
): GraphicCompositionSet {
  if (!selectedDecoration) {
    return {
      density: "minimal",
      roles: [],
      summary: "Photo-support composition has no decoration candidate to frame the CTA.",
    };
  }

  const roles: GraphicCompositionEntry[] = [
    buildGraphicRoleEntry("corner_accent", selectedDecoration),
  ];
  if (!usesWideBandCta(sceneBindingPlan)) {
    roles.unshift(buildGraphicRoleEntry("cta_container", selectedDecoration));
  }
  if (
    sceneBindingPlan?.preferredBadgeProminence === "dominant" ||
    sceneBindingPlan?.includeRibbon
  ) {
    roles.push(buildGraphicRoleEntry("badge_or_ribbon", selectedDecoration));
  }

  return {
    density: "minimal",
    roles,
    summary:
      "Photo-support composition keeps a compact CTA container and corner accent set.",
  };
}

function buildGraphicRoleEntry(
  role: GraphicCompositionEntry["role"],
  decoration: DecorationCandidate,
): GraphicCompositionEntry {
  return {
    role,
    candidateId: decoration.candidateId,
    sourceAssetId: decoration.sourceAssetId ?? null,
    sourceSerial: decoration.sourceSerial ?? null,
    sourceCategory: decoration.sourceCategory ?? null,
    variantKey: decoration.payload.variantKey,
    decorationMode: decoration.payload.decorationMode ?? "graphic_cluster",
  };
}

function usesWideBandCta(sceneBindingPlan: SceneBindingPlan | null): boolean {
  return (
    sceneBindingPlan?.ctaShapeLanguage === "band" ||
    sceneBindingPlan?.ctaShapeLanguage === "transparent_band"
  );
}

function shouldIncludeFrameRole(
  variant: CompositionVariant,
  sceneBindingPlan: SceneBindingPlan | null,
): boolean {
  if (variant.familyKey === "framed_promo") {
    return true;
  }
  return sceneBindingPlan?.includeFrame === true;
}
