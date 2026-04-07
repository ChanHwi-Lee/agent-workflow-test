import { createRequestId } from "@tooldi/agent-domain";

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
  const selectedBackground = pickByPriority(
    filterCandidatesByPolicy(
      candidates.background.candidates,
      dependencies.selectionPolicy,
      dependencies.retrievalStage,
    ),
    ["background_source", "graphic_source", "photo_source"],
  );
  const selectedLayout = pickLayout(intent, candidates);
  const selectedDecoration = pickByPriority(
    filterCandidatesByPolicy(
      candidates.decoration.candidates,
      dependencies.selectionPolicy,
      dependencies.retrievalStage,
    ),
    ["graphic_source", "photo_source"],
  );

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
    ],
    selectedBackgroundCandidateId: selectedBackground.candidateId,
    selectedLayoutCandidateId: selectedLayout.candidateId,
    selectedDecorationCandidateId: selectedDecoration.candidateId,
    selectedBackgroundAssetId: selectedBackground.sourceAssetId ?? null,
    selectedBackgroundSerial: selectedBackground.sourceSerial ?? null,
    selectedBackgroundCategory: selectedBackground.sourceCategory ?? null,
    selectedDecorationAssetId: selectedDecoration.sourceAssetId ?? null,
    selectedDecorationSerial: selectedDecoration.sourceSerial ?? null,
    selectedDecorationCategory: selectedDecoration.sourceCategory ?? null,
    backgroundMode: selectedBackground.payload.backgroundMode ?? "spring_pattern",
    layoutMode:
      selectedLayout.payload.layoutMode ?? "copy_left_with_right_decoration",
    decorationMode:
      selectedDecoration.payload.decorationMode ?? "graphic_cluster",
    executionStrategy: "graphic_first_shape_text_group",
    summary: `Selected ${selectedBackground.payload.variantKey}, ${selectedLayout.payload.variantKey}, ${selectedDecoration.payload.variantKey} for a spring banner`,
    fallbackSummary:
      "Fallback to shape/text/group-safe composition if photo or unsupported graphic execution is required",
  };
}

function pickLayout(
  intent: NormalizedIntent,
  candidates: TemplateCandidateBundle,
) {
  const preferredLayoutMode =
    intent.layoutIntent === "badge_led"
      ? "badge_led"
      : intent.canvasPreset === "wide_1200x628"
        ? "copy_left_with_right_decoration"
        : "center_stack";

  const preferred = candidates.layout.candidates.find(
    (candidate) => candidate.payload.layoutMode === preferredLayoutMode,
  );

  return (
    preferred ??
    candidates.layout.candidates.reduce((best, current) =>
      current.fitScore > best.fitScore ? current : best,
    )
  );
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
