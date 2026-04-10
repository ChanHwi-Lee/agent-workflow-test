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
  searchBackgroundCandidates,
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

  if (dependencies.sourceMode === "placeholder") {
    const [background, graphicDecorations, photoCandidates] = await Promise.all([
      dependencies.templateCatalogClient.listBackgroundCandidates(catalogContext),
      dependencies.templateCatalogClient.listGraphicCandidates(catalogContext),
      dependencies.allowPhotoCandidates
        ? dependencies.templateCatalogClient.listPhotoCandidates(catalogContext)
        : Promise.resolve(emptyPhotoCandidates),
    ]);

    return {
      candidates: {
        background,
        layout: createLayoutCandidateSet(input, intent),
        decoration: {
          setId: `decoration_candidates_${createRequestId()}`,
          family: "decoration",
          candidates: [...graphicDecorations.candidates],
        },
        photo: photoCandidates,
      },
      sourceSearch: {
        background: {
          family: "background",
          queryAttempts: [],
          returnedCount: background.candidates.length,
          filteredCount: background.candidates.length,
          fallbackUsed: false,
          selectedAssetId: null,
          selectedSerial: null,
          selectedCategory: null,
        },
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

  const [backgroundSearch, graphicSearch, photoSearch] = await Promise.all([
    searchBackgroundCandidates(
      dependencies.tooldiCatalogSourceClient,
      searchProfile,
      templatePriorSummary,
    ),
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

  if (backgroundSearch.candidates.length === 0) {
    throw new SpringCatalogActivationError(
      "background_candidates_empty",
      "Spring real-source activation could not find background candidates",
    );
  }

  if (graphicSearch.candidates.length === 0) {
    throw new SpringCatalogActivationError(
      "graphic_candidates_empty",
      "Spring real-source activation could not find graphic candidates",
    );
  }

  return {
    candidates: {
      background: {
        setId: `background_candidates_${createRequestId()}`,
        family: "background",
        candidates: backgroundSearch.candidates,
      },
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
      background: backgroundSearch.summary,
      graphic: graphicSearch.summary,
      photo: photoSearch.summary,
    },
  };
}
