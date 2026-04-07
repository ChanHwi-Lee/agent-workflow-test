import { createRequestId } from "@tooldi/agent-domain";
import type {
  PhotoCatalogClient,
  GraphicCatalogClient,
  BackgroundCatalogClient,
  TemplateCandidateSet,
} from "@tooldi/tool-adapters";

import type {
  HydratedPlanningInput,
  NormalizedIntent,
  TemplateCandidateBundle,
} from "../types.js";

export interface AssembleTemplateCandidatesDependencies {
  backgroundCatalogClient: BackgroundCatalogClient;
  graphicCatalogClient: GraphicCatalogClient;
  photoCatalogClient: PhotoCatalogClient;
}

export async function assembleTemplateCandidates(
  input: HydratedPlanningInput,
  intent: NormalizedIntent,
  dependencies: AssembleTemplateCandidatesDependencies,
): Promise<TemplateCandidateBundle> {
  const catalogContext = {
    canvasWidth: input.request.editorContext.canvasWidth,
    canvasHeight: input.request.editorContext.canvasHeight,
    templateKind: intent.templateKind,
    tone: intent.tone,
    assetPolicy: intent.assetPolicy,
  } as const;

  const [background, graphicDecorations, photoDecorations] = await Promise.all([
    dependencies.backgroundCatalogClient.listBackgroundCandidates(catalogContext),
    dependencies.graphicCatalogClient.listGraphicCandidates(catalogContext),
    dependencies.photoCatalogClient.listPhotoCandidates(catalogContext),
  ]);

  return {
    background,
    layout: createLayoutCandidateSet(input, intent),
    decoration: {
      setId: `decoration_candidates_${createRequestId()}`,
      family: "decoration",
      candidates: [
        ...graphicDecorations.candidates,
        ...photoDecorations.candidates,
      ],
    },
  };
}

function createLayoutCandidateSet(
  input: HydratedPlanningInput,
  intent: NormalizedIntent,
): TemplateCandidateSet {
  const wideCanvas =
    input.request.editorContext.canvasWidth >= input.request.editorContext.canvasHeight;

  return {
    setId: `layout_candidates_${createRequestId()}`,
    family: "layout",
    candidates: [
      {
        candidateId: "layout_copy_left_with_right_decoration",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Copy cluster on the left with a decorative field on the right",
        fitScore: wideCanvas ? 0.94 : 0.78,
        selectionReasons: [
          "best fit for wide banner preset",
          "supports readable copy-first hierarchy",
        ],
        riskFlags: [],
        fallbackIfRejected: "layout_center_stack",
        executionAllowed: true,
        payload: {
          variantKey: "copy_left_with_right_decoration",
          layoutMode: "copy_left_with_right_decoration",
          themeTokens: ["copy", "wide", "promo"],
        },
      },
      {
        candidateId: "layout_center_stack",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Centered stack with balanced copy block",
        fitScore: wideCanvas ? 0.82 : 0.9,
        selectionReasons: [
          "safe fallback for non-wide canvas",
          "simple copy hierarchy",
        ],
        riskFlags: [],
        fallbackIfRejected: "layout_copy_left_with_right_decoration",
        executionAllowed: true,
        payload: {
          variantKey: "center_stack",
          layoutMode: "center_stack",
          themeTokens: ["stacked", "balanced"],
        },
      },
      {
        candidateId: "layout_badge_led",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Badge-led promotional block with compact text cluster",
        fitScore: intent.layoutIntent === "badge_led" ? 0.9 : 0.75,
        selectionReasons: [
          "useful for promotion-focused CTA rhythm",
        ],
        riskFlags: ["more visually busy"],
        fallbackIfRejected: "layout_center_stack",
        executionAllowed: true,
        payload: {
          variantKey: "badge_led",
          layoutMode: "badge_led",
          themeTokens: ["badge", "promo"],
        },
      },
    ],
  };
}
