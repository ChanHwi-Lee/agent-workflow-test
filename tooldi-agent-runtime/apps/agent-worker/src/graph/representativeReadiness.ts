import type {
  RepresentativeReadinessSummary,
  SelectionDecision,
  TypographyDecision,
} from "../types.js";

export function buildRepresentativeReadiness(
  selectionDecision: SelectionDecision,
  typographyDecision: TypographyDecision,
  representativePathEnabled: boolean,
): RepresentativeReadinessSummary {
  const uniqueGraphicCandidateIds = new Set(
    (selectionDecision.graphicCompositionSet?.roles ?? [])
      .map((role) => role.candidateId)
      .filter((candidateId) => candidateId.length > 0),
  );
  const materializedRealGraphicCount = uniqueGraphicCandidateIds.size;
  const graphicStatus =
    materializedRealGraphicCount >= 2
      ? "target_met"
      : materializedRealGraphicCount >= 1
        ? "degraded"
        : "failed";
  const graphicReasonCodes =
    graphicStatus === "target_met"
      ? []
      : graphicStatus === "degraded"
        ? ["graphic_real_target_not_met"]
        : ["graphic_real_missing"];

  const displayRealSelected = typographyDecision.display !== null;
  const bodyRealSelected = typographyDecision.body !== null;
  const realSelectionCount = Number(displayRealSelected) + Number(bodyRealSelected);
  const fontStatus =
    displayRealSelected && bodyRealSelected
      ? "target_met"
      : realSelectionCount >= 1
        ? "degraded"
        : "failed";
  const fontReasonCodes =
    fontStatus === "target_met"
      ? []
      : fontStatus === "degraded"
        ? ["font_real_target_not_met"]
        : ["font_real_missing"];

  const overallStatus = representativePathEnabled
    ? graphicStatus === "failed" || fontStatus === "failed"
      ? "failed"
      : graphicStatus === "degraded" || fontStatus === "degraded"
        ? "degraded"
        : "target_met"
    : "not_applicable";

  return {
    path: "generic_promo_phase6",
    overallStatus,
    background: {
      status: "not_applicable",
      mode: "generated_solid",
      colorHex: selectionDecision.selectedBackgroundColorHex,
      reasonCodes: [],
    },
    graphic: {
      status: graphicStatus,
      targetRequired: 2,
      minimumRequired: 1,
      materializedRealCount: materializedRealGraphicCount,
      reasonCodes: graphicReasonCodes,
    },
    font: {
      status: fontStatus,
      targetRequired: "display_and_body",
      minimumRequired: 1,
      displayRealSelected,
      bodyRealSelected,
      realSelectionCount,
      reasonCodes: fontReasonCodes,
    },
  };
}

export function buildRepresentativeReadinessWarnings(
  readiness: RepresentativeReadinessSummary,
): Array<{ code: string; message: string }> {
  const warnings: Array<{ code: string; message: string }> = [];

  if (readiness.graphic.status === "degraded") {
    warnings.push({
      code: "graphic_real_target_not_met",
      message:
        "Representative path materialized fewer real graphic assets than the target density for generic promo.",
    });
  }

  if (readiness.font.status === "degraded") {
    warnings.push({
      code: "font_real_target_not_met",
      message:
        "Representative path selected only one real typography role and fell back for the remaining text role.",
    });
  }

  return warnings;
}
