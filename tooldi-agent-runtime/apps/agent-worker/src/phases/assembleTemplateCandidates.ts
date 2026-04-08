import { createRequestId } from "@tooldi/agent-domain";
import type {
  TemplateCandidate,
  TemplateCandidateSet,
  TemplateCatalogClient,
  TooldiBackgroundAsset,
  TooldiCatalogSourceClient,
  TooldiCatalogSourceMode,
  TooldiGraphicAsset,
  TooldiPhotoAsset,
  SearchBackgroundAssetsQuery,
  SearchGraphicAssetsQuery,
  SearchPhotoAssetsQuery,
} from "@tooldi/tool-adapters";

import type {
  HydratedPlanningInput,
  NormalizedIntent,
  SearchProfileArtifact,
  SourceSearchFamilySummary,
  TemplateCandidateBundle,
} from "../types.js";

export class SpringCatalogActivationError extends Error {
  constructor(
    readonly code: "background_candidates_empty" | "graphic_candidates_empty",
    message: string,
  ) {
    super(message);
    this.name = "SpringCatalogActivationError";
  }
}

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
  dependencies: AssembleTemplateCandidatesDependencies,
): Promise<AssembleTemplateCandidatesResult> {
  const catalogContext = {
    canvasWidth: input.request.editorContext.canvasWidth,
    canvasHeight: input.request.editorContext.canvasHeight,
    templateKind: intent.templateKind,
    tone: intent.tone,
    assetPolicy: intent.assetPolicy,
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

  if (dependencies.sourceMode !== "tooldi_api") {
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
    ),
    searchGraphicCandidates(dependencies.tooldiCatalogSourceClient, searchProfile),
    dependencies.allowPhotoCandidates
      ? searchPhotoCandidates(
          dependencies.tooldiCatalogSourceClient,
          searchProfile,
        )
      : Promise.resolve({
          candidates: [] as TemplateCandidate[],
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

async function searchBackgroundCandidates(
  sourceClient: TooldiCatalogSourceClient,
  searchProfile: SearchProfileArtifact,
): Promise<{
  candidates: TemplateCandidate[];
  summary: SourceSearchFamilySummary;
}> {
  const attempts: SourceSearchFamilySummary["queryAttempts"] = [];
  const queries = searchProfile.background.queries.map((plannedQuery) => ({
    label: plannedQuery.label,
    query: {
      type: plannedQuery.type,
      page: 1,
      source: plannedQuery.source,
      ...(plannedQuery.keyword !== null
        ? { keyword: plannedQuery.keyword }
        : {}),
    } satisfies SearchBackgroundAssetsQuery,
  }));

  let selectedAssets: TooldiBackgroundAsset[] = [];
  for (const attempt of queries) {
    const result = await sourceClient.searchBackgroundAssets(attempt.query);
    attempts.push({
      label: attempt.label,
      query: {
        type: attempt.query.type,
        keyword: attempt.query.keyword ?? null,
        page: attempt.query.page,
        source: attempt.query.source ?? null,
      },
      returnedCount: result.assets.length,
    });
    if (result.assets.length > 0) {
      selectedAssets = result.assets;
      break;
    }
  }

  const ranked = [...selectedAssets]
    .sort((left, right) => scoreBackgroundAsset(right) - scoreBackgroundAsset(left))
    .slice(0, 8);
  const candidates = assignFallbacks(
    ranked.map((asset) => mapBackgroundAssetToCandidate(asset)),
  );

  return {
    candidates,
    summary: {
      family: "background",
      queryAttempts: attempts,
      returnedCount: selectedAssets.length,
      filteredCount: candidates.length,
      fallbackUsed: attempts.length > 1 && attempts[0]?.returnedCount === 0,
      selectedAssetId: null,
      selectedSerial: null,
      selectedCategory: null,
    },
  };
}

async function searchGraphicCandidates(
  sourceClient: TooldiCatalogSourceClient,
  searchProfile: SearchProfileArtifact,
): Promise<{
  candidates: TemplateCandidate[];
  summary: SourceSearchFamilySummary;
}> {
  const attempts: SourceSearchFamilySummary["queryAttempts"] = [];
  const queries = searchProfile.graphic.queries.map((plannedQuery) => ({
    label: plannedQuery.label,
    query: {
      page: 0,
      ...(plannedQuery.keyword !== null
        ? { keyword: plannedQuery.keyword }
        : {}),
      ...(plannedQuery.categoryName !== null
        ? { categoryName: plannedQuery.categoryName }
        : {}),
      ...(plannedQuery.shapeType !== null
        ? { shapeType: plannedQuery.shapeType }
        : {}),
      ...(plannedQuery.price !== null ? { price: plannedQuery.price } : {}),
      ...(plannedQuery.format !== null ? { format: plannedQuery.format } : {}),
    } satisfies SearchGraphicAssetsQuery,
  }));

  let selectedAssets: TooldiGraphicAsset[] = [];
  for (const attempt of queries) {
    const result = await sourceClient.searchGraphicAssets(attempt.query);
    attempts.push({
      label: attempt.label,
      query: {
        type: attempt.query.shapeType ?? null,
        keyword: attempt.query.keyword ?? null,
        page: attempt.query.page,
      },
      returnedCount: result.assets.length,
    });
    if (result.assets.length > 0) {
      selectedAssets = result.assets;
      break;
    }
  }

  const ranked = [...selectedAssets]
    .sort((left, right) => scoreGraphicAsset(right) - scoreGraphicAsset(left))
    .slice(0, 12);
  const candidates = assignFallbacks(
    ranked.map((asset) => mapGraphicAssetToCandidate(asset)),
  );

  return {
    candidates,
    summary: {
      family: "graphic",
      queryAttempts: attempts,
      returnedCount: selectedAssets.length,
      filteredCount: candidates.length,
      fallbackUsed: attempts.length > 1 && attempts[0]?.returnedCount === 0,
      selectedAssetId: null,
      selectedSerial: null,
      selectedCategory: null,
    },
  };
}

async function searchPhotoCandidates(
  sourceClient: TooldiCatalogSourceClient,
  searchProfile: SearchProfileArtifact,
): Promise<{
  candidates: TemplateCandidate[];
  summary: SourceSearchFamilySummary;
}> {
  const attempts: SourceSearchFamilySummary["queryAttempts"] = [];
  const preferredOrientation = searchProfile.photo.orientationHint ?? "landscape";
  const queries = searchProfile.photo.queries.map((plannedQuery) => ({
    label: plannedQuery.label,
    query: {
      page: 0,
      source: plannedQuery.source,
      ...(plannedQuery.keyword !== null
        ? { keyword: plannedQuery.keyword }
        : {}),
      ...(plannedQuery.orientation !== null
        ? { orientation: plannedQuery.orientation }
        : {}),
      ...(plannedQuery.backgroundRemoval !== null
        ? { backgroundRemoval: plannedQuery.backgroundRemoval }
        : {}),
    } satisfies SearchPhotoAssetsQuery,
  }));

  let selectedAssets: TooldiPhotoAsset[] = [];
  for (const attempt of queries) {
    const result = await sourceClient.searchPhotoAssets(attempt.query);
    attempts.push({
      label: attempt.label,
      query: {
        keyword: attempt.query.keyword ?? null,
        page: attempt.query.page,
        orientation: attempt.query.orientation ?? null,
        source: attempt.query.source ?? null,
      },
      returnedCount: result.assets.length,
    });
    if (result.assets.length > 0) {
      selectedAssets = result.assets;
      break;
    }
  }

  const ranked = [...selectedAssets]
    .sort(
      (left, right) =>
        scorePhotoAsset(right, preferredOrientation) -
        scorePhotoAsset(left, preferredOrientation),
    )
    .slice(0, 8);
  const candidates = assignFallbacks(
    ranked.map((asset) => mapPhotoAssetToCandidate(asset, preferredOrientation)),
  );

  return {
    candidates,
    summary: {
      family: "photo",
      queryAttempts: attempts,
      returnedCount: selectedAssets.length,
      filteredCount: candidates.length,
      fallbackUsed: attempts.length > 1 && attempts[0]?.returnedCount === 0,
      selectedAssetId: null,
      selectedSerial: null,
      selectedCategory: null,
    },
  };
}

function mapBackgroundAssetToCandidate(
  asset: TooldiBackgroundAsset,
): TemplateCandidate {
  return {
    candidateId: `background_real_${asset.serial}`,
    family: "background",
    sourceFamily: asset.sourceFamily,
    sourceAssetId: asset.assetId,
    sourceSerial: asset.serial,
    sourceCategory: asset.backgroundKind,
    thumbnailUrl: asset.thumbnailUrl,
    insertMode: asset.insertMode,
    summary: `${asset.title} (${asset.backgroundKind})`,
    fitScore: scoreBackgroundAsset(asset),
    selectionReasons: [
      asset.backgroundKind === "pattern"
        ? "pattern backgrounds are preferred for spring readability"
        : "image background kept as fallback when pattern inventory is weak",
      asset.keywordTokens.includes("봄")
        ? "seasonal keyword hit detected"
        : "usable spring fallback despite weaker keyword match",
      "real Tooldi background inventory candidate",
    ],
    riskFlags:
      asset.backgroundKind === "image"
        ? ["background image is rendered via safe visual fallback in v1"]
        : [],
    fallbackIfRejected: "",
    executionAllowed: true,
    payload: {
      variantKey: asset.serial,
      backgroundMode:
        asset.backgroundKind === "pattern" ? "spring_pattern" : "pastel_gradient",
      themeTokens: ["spring", asset.backgroundKind],
    },
  };
}

function mapGraphicAssetToCandidate(
  asset: TooldiGraphicAsset,
): TemplateCandidate {
  const decorationMode =
    asset.graphicKind === "calligraphy" || asset.graphicKind === "wordart"
      ? "ribbon_badge"
      : "graphic_cluster";

  return {
    candidateId: `graphic_real_${asset.serial}`,
    family: "decoration",
    sourceFamily: asset.sourceFamily,
    sourceAssetId: asset.assetId,
    sourceSerial: asset.serial,
    sourceCategory: asset.graphicKind,
    thumbnailUrl: asset.thumbnailUrl,
    insertMode: asset.insertMode,
    summary: `${asset.title} (${asset.graphicKind})`,
    fitScore: scoreGraphicAsset(asset),
    selectionReasons: [
      "real Tooldi graphic inventory candidate",
      asset.keywordTokens.includes("봄")
        ? "seasonal keyword hit detected"
        : "graphic kept as stable fallback candidate",
      decorationMode === "ribbon_badge"
        ? "graphic kind suits badge-led promotional polish"
        : "graphic kind suits decorative cluster polish",
    ],
    riskFlags: [],
    fallbackIfRejected: "",
    executionAllowed: true,
    payload: {
      variantKey: asset.serial,
      decorationMode,
      themeTokens: ["spring", asset.graphicKind],
    },
  };
}

function mapPhotoAssetToCandidate(
  asset: TooldiPhotoAsset,
  preferredOrientation: TooldiPhotoAsset["orientation"],
): TemplateCandidate {
  const orientationMatches = asset.orientation === preferredOrientation;

  return {
    candidateId: `photo_real_${asset.serial}`,
    family: "photo",
    sourceFamily: asset.sourceFamily,
    sourceAssetId: asset.assetId,
    sourceSerial: asset.serial,
    sourceCategory: asset.orientation,
    sourceUid: asset.uid,
    sourceOriginUrl: asset.originUrl,
    sourceWidth: asset.width,
    sourceHeight: asset.height,
    thumbnailUrl: asset.thumbnailUrl,
    insertMode: asset.insertMode,
    summary: `${asset.title} (${asset.orientation})`,
    fitScore: scorePhotoAsset(asset, preferredOrientation),
    selectionReasons: [
      "real Tooldi photo inventory candidate",
      asset.keywordTokens.includes("봄")
        ? "seasonal keyword hit detected"
        : "kept as generic spring fallback photo",
      orientationMatches
        ? "orientation supports hero-photo compare for the current canvas"
        : "orientation kept for fallback only",
    ],
    riskFlags: [
      ...(orientationMatches ? [] : ["orientation mismatch raises crop risk"]),
      ...(asset.backgroundRemovalHint
        ? []
        : ["subject separation may reduce copy readability"]),
    ],
    fallbackIfRejected: "",
    executionAllowed: orientationMatches && !!asset.originUrl && !!asset.width && !!asset.height,
    payload: {
      variantKey: asset.serial,
      decorationMode: "photo_support",
      photoBranchMode: "photo_selected",
      photoOrientation: asset.orientation,
      themeTokens: ["spring", "photo", asset.orientation],
    },
  };
}

function assignFallbacks(candidates: TemplateCandidate[]): TemplateCandidate[] {
  return candidates.map((candidate, index) => ({
    ...candidate,
    fallbackIfRejected:
      candidates[index + 1]?.candidateId ?? candidate.candidateId,
  }));
}

function scoreBackgroundAsset(asset: TooldiBackgroundAsset): number {
  return Number(
    (
      (asset.backgroundKind === "pattern" ? 0.9 : 0.76) +
      (asset.keywordTokens.includes("봄") ? 0.04 : 0) +
      (asset.thumbnailUrl ? 0.01 : 0)
    ).toFixed(3),
  );
}

function scoreGraphicAsset(asset: TooldiGraphicAsset): number {
  const base =
    asset.graphicKind === "illust"
      ? 0.92
      : asset.graphicKind === "calligraphy"
        ? 0.9
        : asset.graphicKind === "bitmap"
          ? 0.88
          : asset.graphicKind === "icon"
            ? 0.84
            : asset.graphicKind === "wordart"
              ? 0.83
              : 0.78;

  return Number(
    (
      base +
      (asset.keywordTokens.includes("봄") ? 0.03 : 0) +
      (asset.thumbnailUrl ? 0.01 : 0)
    ).toFixed(3),
  );
}

function scorePhotoAsset(
  asset: TooldiPhotoAsset,
  preferredOrientation: TooldiPhotoAsset["orientation"],
): number {
  const base =
    asset.orientation === preferredOrientation
      ? 0.9
      : asset.orientation === "square"
        ? 0.84
        : 0.78;

  return Number(
    (
      base +
      (asset.keywordTokens.includes("봄") ? 0.03 : 0) +
      (asset.thumbnailUrl ? 0.01 : 0) +
      (asset.backgroundRemovalHint ? 0.01 : 0)
    ).toFixed(3),
  );
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
        candidateId: "layout_copy_left_with_right_photo",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Copy cluster on the left with a dedicated photo hero field on the right",
        fitScore: wideCanvas ? 0.91 : 0.68,
        selectionReasons: [
          "dedicated wide-only layout for a single hero photo object",
          "keeps copy and photo fields explicitly separated",
        ],
        riskFlags: ["requires executable photo metadata and fail-fast execution path"],
        fallbackIfRejected: "layout_copy_left_with_right_decoration",
        executionAllowed: wideCanvas,
        payload: {
          variantKey: "copy_left_with_right_photo",
          layoutMode: "copy_left_with_right_photo",
          themeTokens: ["copy", "wide", "photo"],
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
        selectionReasons: ["useful for promotion-focused CTA rhythm"],
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
