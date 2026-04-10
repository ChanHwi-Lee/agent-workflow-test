import { createRequestId } from "@tooldi/agent-domain";
import type { TemplatePriorSummary } from "@tooldi/agent-contracts";
import {
  normalizeTemplateAssetPolicy,
} from "@tooldi/agent-llm";
import type {
  TemplateCandidateSet,
  TemplateCatalogClient,
  TooldiCatalogSourceClient,
  TooldiCatalogSourceMode,
} from "@tooldi/tool-adapters";

import type {
  HydratedPlanningInput,
  NormalizedIntent,
  SearchProfileArtifact,
  SourceSearchFamilySummary,
  TemplateCandidateBundle,
} from "../types.js";
import {
  searchGraphicCandidates,
  searchPhotoCandidates,
  SpringCatalogActivationError,
} from "./candidateSearchers.js";
import { createLayoutCandidateSet } from "./layoutCandidateSet.js";

export { SpringCatalogActivationError } from "./candidateSearchers.js";

export interface AssembleTemplateCandidatesDependencies {
  templateCatalogClient: TemplateCatalogClient;
  tooldiCatalogSourceClient: TooldiCatalogSourceClient;
  sourceMode: TooldiCatalogSourceMode;
  allowPhotoCandidates: boolean;
}

export interface AssembleTemplateCandidatesResult {
  candidates: TemplateCandidateBundle;
  sourceSearch: {
    background: SourceSearchFamilySummary;
    graphic: SourceSearchFamilySummary;
    photo: SourceSearchFamilySummary;
  };
}

export async function assembleTemplateCandidates(
  input: HydratedPlanningInput,
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
  templatePriorSummary: TemplatePriorSummary,
  dependencies: AssembleTemplateCandidatesDependencies,
): Promise<AssembleTemplateCandidatesResult> {
  const assetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  const catalogContext = {
    canvasWidth: input.request.editorContext.canvasWidth,
    canvasHeight: input.request.editorContext.canvasHeight,
    templateKind: intent.templateKind,
    tone: intent.tone,
    assetPolicy,
  } as const;
  const emptyPhotoCandidates: TemplateCandidateSet = {
    setId: `photo_candidates_${createRequestId()}`,
    family: "photo",
    candidates: [],
  };
  const emptyPhotoSummary: SourceSearchFamilySummary = {
    family: "photo",
    queryAttempts: [],
    returnedCount: 0,
    filteredCount: 0,
    fallbackUsed: false,
    selectedAssetId: null,
    selectedSerial: null,
    selectedCategory: null,
  };
  const generatedBackgroundCandidates = createGeneratedBackgroundCandidateSet(
    intent,
  );
  const generatedBackgroundSummary: SourceSearchFamilySummary = {
    family: "background",
    queryAttempts: [],
    returnedCount: generatedBackgroundCandidates.candidates.length,
    filteredCount: generatedBackgroundCandidates.candidates.length,
    fallbackUsed: false,
    selectedAssetId: null,
    selectedSerial: null,
    selectedCategory: "generated_solid",
  };

  if (dependencies.sourceMode === "placeholder") {
    const [graphicDecorations, photoCandidates] = await Promise.all([
      dependencies.templateCatalogClient.listGraphicCandidates(catalogContext),
      dependencies.allowPhotoCandidates
        ? dependencies.templateCatalogClient.listPhotoCandidates(catalogContext)
        : Promise.resolve(emptyPhotoCandidates),
    ]);

    return {
      candidates: {
        background: generatedBackgroundCandidates,
        layout: createLayoutCandidateSet(input, intent),
        decoration: {
          setId: `decoration_candidates_${createRequestId()}`,
          family: "decoration",
          candidates: [...graphicDecorations.candidates],
        },
        photo: photoCandidates,
      },
      sourceSearch: {
        background: generatedBackgroundSummary,
        graphic: {
          family: "graphic",
          queryAttempts: [],
          returnedCount: graphicDecorations.candidates.length,
          filteredCount: graphicDecorations.candidates.length,
          fallbackUsed: false,
          selectedAssetId: null,
          selectedSerial: null,
          selectedCategory: null,
        },
        photo: {
          ...emptyPhotoSummary,
          returnedCount: photoCandidates.candidates.length,
          filteredCount: photoCandidates.candidates.length,
        },
      },
    };
  }

  const [graphicSearch, photoSearch] = await Promise.all([
    searchGraphicCandidates(
      dependencies.tooldiCatalogSourceClient,
      searchProfile,
      templatePriorSummary,
    ),
    dependencies.allowPhotoCandidates
      ? searchPhotoCandidates(
          dependencies.tooldiCatalogSourceClient,
          searchProfile,
          templatePriorSummary,
        )
      : Promise.resolve({
          candidates: [],
          summary: emptyPhotoSummary,
        }),
  ]);

  if (graphicSearch.candidates.length === 0) {
    throw new SpringCatalogActivationError(
      "graphic_candidates_empty",
      "Spring real-source activation could not find graphic candidates",
    );
  }

  return {
    candidates: {
      background: generatedBackgroundCandidates,
      layout: createLayoutCandidateSet(input, intent),
      decoration: {
        setId: `decoration_candidates_${createRequestId()}`,
        family: "decoration",
        candidates: graphicSearch.candidates,
      },
      photo: {
        ...emptyPhotoCandidates,
        candidates: photoSearch.candidates,
      },
    },
    sourceSearch: {
      background: generatedBackgroundSummary,
      graphic: graphicSearch.summary,
      photo: photoSearch.summary,
    },
  };
}

function createGeneratedBackgroundCandidateSet(
  intent: NormalizedIntent,
): TemplateCandidateSet {
  const colorHex = intent.backgroundColorHex ?? "#ffffff";

  return {
    setId: `background_candidates_${createRequestId()}`,
    family: "background",
    candidates: [
      {
        candidateId: `background_generated_${colorHex.replace("#", "")}`,
        family: "background",
        sourceFamily: "derived_policy",
        sourceCategory: "generated_solid",
        summary: `Generated solid background ${colorHex}`,
        fitScore: 1,
        selectionReasons: [
          "background is generated as a solid color in the current generic-promo representative path",
          "planner-selected color stays inside the current editor-safe solid background lane",
        ],
        riskFlags: [],
        fallbackIfRejected: "",
        executionAllowed: true,
        payload: {
          variantKey: colorHex,
          backgroundMode: "generated_solid",
          backgroundColorHex: colorHex,
          backgroundSourceKind: "generated_solid",
          themeTokens: ["generated", "solid"],
        },
      },
    ],
  };
}
