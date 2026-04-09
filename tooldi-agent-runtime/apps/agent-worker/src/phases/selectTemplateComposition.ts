import { createRequestId } from "@tooldi/agent-domain";
import { templateAssetPolicyPrefersPhoto } from "@tooldi/agent-llm";

import type {
  SelectionDecision,
  TemplateCandidateBundle,
  NormalizedIntent,
  RetrievalStageResult,
  TemplateSelectionPolicy,
} from "../types.js";

export async function selectTemplateComposition(
  intent: NormalizedIntent,
  candidates: TemplateCandidateBundle,
  dependencies: {
    retrievalStage: RetrievalStageResult;
    selectionPolicy: TemplateSelectionPolicy;
  },
): Promise<SelectionDecision> {
  const baseLayout = pickBaseLayout(intent, candidates);
  const photoLayout = pickPhotoLayout(candidates);
  const selectedBackground = pickByPriority(
    filterCandidatesByPolicy(
      candidates.background.candidates,
      dependencies.selectionPolicy,
      dependencies.retrievalStage,
    ),
    ["background_source", "graphic_source"],
  );
  const selectedDecoration = pickByPriority(
    filterCandidatesByPolicy(
      candidates.decoration.candidates,
      dependencies.selectionPolicy,
      dependencies.retrievalStage,
    ),
    ["graphic_source"],
  );
  const topPhotoCandidate = pickOptionalPhotoCandidate(
    filterCandidatesByPolicy(
      candidates.photo.candidates,
      dependencies.selectionPolicy,
      dependencies.retrievalStage,
    ),
  );
  const photoBranchDecision = decidePhotoBranch(
    intent,
    baseLayout,
    selectedDecoration,
    topPhotoCandidate,
    photoLayout,
    dependencies.selectionPolicy,
  );
  const selectedLayout =
    photoBranchDecision.mode === "photo_selected" && photoLayout
      ? photoLayout
      : baseLayout;

  return {
    decisionId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    retrievalMode: dependencies.retrievalStage.retrievalMode,
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
    selectedBackgroundCandidateId: selectedBackground.candidateId,
    selectedLayoutCandidateId: selectedLayout.candidateId,
    selectedDecorationCandidateId: selectedDecoration.candidateId,
    topPhotoCandidateId: topPhotoCandidate?.candidateId ?? null,
    selectedBackgroundAssetId: selectedBackground.sourceAssetId ?? null,
    selectedBackgroundSerial: selectedBackground.sourceSerial ?? null,
    selectedBackgroundCategory: selectedBackground.sourceCategory ?? null,
    selectedDecorationAssetId: selectedDecoration.sourceAssetId ?? null,
    selectedDecorationSerial: selectedDecoration.sourceSerial ?? null,
    selectedDecorationCategory: selectedDecoration.sourceCategory ?? null,
    topPhotoAssetId: topPhotoCandidate?.sourceAssetId ?? null,
    topPhotoSerial: topPhotoCandidate?.sourceSerial ?? null,
    topPhotoCategory: topPhotoCandidate?.sourceCategory ?? null,
    topPhotoUid: topPhotoCandidate?.sourceUid ?? null,
    topPhotoUrl: topPhotoCandidate?.sourceOriginUrl ?? null,
    topPhotoWidth: topPhotoCandidate?.sourceWidth ?? null,
    topPhotoHeight: topPhotoCandidate?.sourceHeight ?? null,
    topPhotoOrientation: topPhotoCandidate?.payload.photoOrientation ?? null,
    backgroundMode: selectedBackground.payload.backgroundMode ?? "spring_pattern",
    layoutMode: selectedLayout.payload.layoutMode ?? "copy_left_with_right_decoration",
    decorationMode:
      selectedDecoration.payload.decorationMode ?? "graphic_cluster",
    photoBranchMode: photoBranchDecision.mode,
    photoBranchReason: photoBranchDecision.reason,
    executionStrategy:
      photoBranchDecision.mode === "photo_selected"
        ? "photo_hero_shape_text_group"
        : "graphic_first_shape_text_group",
    summary:
      `Selected ${selectedBackground.payload.variantKey}, ${selectedLayout.payload.variantKey}, ` +
      `${selectedDecoration.payload.variantKey} for ${intent.domain} ${intent.campaignGoal}` +
      (topPhotoCandidate
        ? ` while evaluating photo candidate ${topPhotoCandidate.payload.variantKey}`
        : ""),
    fallbackSummary:
      photoBranchDecision.mode === "photo_selected"
        ? "Selection picked the photo hero branch. If photo execution fails, the run fails fast so the operator can inspect the photo metadata and apply diagnostics."
        : "Fallback to shape/text/group-safe composition if photo is not selected during comparison.",
  };
}

function pickBaseLayout(
  intent: NormalizedIntent,
  candidates: TemplateCandidateBundle,
) {
  const baseLayouts = candidates.layout.candidates.filter(
    (candidate) => candidate.payload.layoutMode !== "copy_left_with_right_photo",
  );
  const preferredLayoutMode =
    intent.layoutIntent === "badge_led"
      ? "badge_led"
      : intent.canvasPreset === "wide_1200x628"
        ? "copy_left_with_right_decoration"
        : "center_stack";

  const preferred = baseLayouts.find(
    (candidate) => candidate.payload.layoutMode === preferredLayoutMode,
  );

  return (
    preferred ??
    baseLayouts.reduce((best, current) =>
      current.fitScore > best.fitScore ? current : best,
    )
  );
}

function pickPhotoLayout(candidates: TemplateCandidateBundle) {
  return (
    candidates.layout.candidates.find(
      (candidate) => candidate.payload.layoutMode === "copy_left_with_right_photo",
    ) ?? null
  );
}

function pickOptionalPhotoCandidate<
  T extends {
    fitScore: number;
    executionAllowed: boolean;
  },
>(candidates: T[]): T | null {
  if (candidates.length === 0) {
    return null;
  }

  const ranked = [...candidates].sort((left, right) => {
    if (left.executionAllowed !== right.executionAllowed) {
      return left.executionAllowed ? -1 : 1;
    }
    return right.fitScore - left.fitScore;
  });

  return ranked[0] ?? null;
}

function filterCandidatesByPolicy<
  T extends {
    sourceFamily: string;
  },
>(
  candidates: T[],
  selectionPolicy: TemplateSelectionPolicy,
  retrievalStage: RetrievalStageResult,
): T[] {
  const allowedSources = new Set(retrievalStage.allowedSourceFamilies);
  const filtered = candidates.filter((candidate) =>
    allowedSources.has(
      candidate.sourceFamily as RetrievalStageResult["allowedSourceFamilies"][number],
    ),
  );

  if (selectionPolicy.allowPhotoCandidates) {
    return filtered;
  }

  const withoutPhotos = filtered.filter(
    (candidate) => candidate.sourceFamily !== "photo_source",
  );
  return withoutPhotos.length > 0 ? withoutPhotos : filtered;
}

function pickByPriority<
  T extends {
    sourceFamily: string;
    fitScore: number;
    executionAllowed: boolean;
  },
>(candidates: T[], sourcePriority: string[]): T {
  const executionSafe = candidates.filter((candidate) => candidate.executionAllowed);
  const pool = executionSafe.length > 0 ? executionSafe : candidates;

  const ranked = [...pool].sort((left, right) => {
    const leftPriority = sourcePriority.indexOf(left.sourceFamily);
    const rightPriority = sourcePriority.indexOf(right.sourceFamily);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return right.fitScore - left.fitScore;
  });

  return ranked[0]!;
}

function decidePhotoBranch(
  intent: NormalizedIntent,
  selectedLayout: {
    payload: {
      layoutMode?:
        | "copy_left_with_right_decoration"
        | "copy_left_with_right_photo"
        | "center_stack"
        | "badge_led";
    };
  },
  selectedDecoration: {
    fitScore: number;
  },
  topPhotoCandidate:
    | {
        fitScore: number;
        executionAllowed: boolean;
        payload: {
          photoOrientation?: "portrait" | "landscape" | "square";
        };
      }
    | null,
  photoLayout:
    | {
        executionAllowed: boolean;
      }
    | null,
  selectionPolicy: TemplateSelectionPolicy,
): {
  mode: SelectionDecision["photoBranchMode"];
  reason: string;
} {
  const photoPreferred = templateAssetPolicyPrefersPhoto(intent.assetPolicy);
  const photoPromotionTolerance = photoPreferred ? 0.08 : 0.03;

  if (!selectionPolicy.allowPhotoCandidates) {
    return {
      mode: "not_considered",
      reason: "photo-catalog tool is disabled in the current selection policy",
    };
  }

  if (!topPhotoCandidate) {
    return {
      mode: "graphic_preferred",
      reason: "no eligible photo candidate was returned from the current Tooldi source query waterfall",
    };
  }

  if (intent.canvasPreset !== "wide_1200x628") {
    return {
      mode: "not_considered",
      reason: "photo branch phase A only compares hero-photo layouts on the representative wide preset",
    };
  }

  if (selectedLayout.payload.layoutMode !== "copy_left_with_right_decoration") {
    return {
      mode: "not_considered",
      reason: "selected layout does not expose a dedicated hero-photo field",
    };
  }

  if (!photoLayout?.executionAllowed) {
    return {
      mode: "graphic_preferred",
      reason: "photo branch requires an executable wide-preset photo layout candidate",
    };
  }

  if (!topPhotoCandidate.executionAllowed) {
    return {
      mode: "graphic_preferred",
      reason:
        "photo candidate is missing executable metadata required for the hero-photo slot",
    };
  }

  if (topPhotoCandidate.payload.photoOrientation === "portrait") {
    return {
      mode: "graphic_preferred",
      reason: "portrait photo candidate raises crop/focal risk for the wide preset hero-photo slot",
    };
  }

  if (
    topPhotoCandidate.fitScore + photoPromotionTolerance >=
    selectedDecoration.fitScore
  ) {
    return {
      mode: "photo_selected",
      reason:
        "photo candidate stayed within the promotion tolerance window and is preferred for the wide preset hero-photo slot",
    };
  }

  return {
    mode: "graphic_preferred",
    reason:
      photoPreferred
        ? "graphic-first path still remained safer than the preferred photo path after comparison"
        : "graphic-first path remains safer for readability and execution despite the available photo candidate",
  };
}
