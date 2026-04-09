import { createRequestId } from "@tooldi/agent-domain";
import type { TemplatePriorSummary } from "@tooldi/agent-contracts";
import {
  normalizeTemplateAssetPolicy,
  templateAssetPolicyPenaltyForFamily,
  templateAssetPolicyPrefersPhoto,
} from "@tooldi/agent-llm";
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
  templatePriorSummary: TemplatePriorSummary,
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
    .sort(
      (left, right) =>
        scoreBackgroundAsset(right, searchProfile, templatePriorSummary) -
        scoreBackgroundAsset(left, searchProfile, templatePriorSummary),
    )
    .slice(0, 8);
  const candidates = assignFallbacks(
    ranked.map((asset) =>
      mapBackgroundAssetToCandidate(asset, searchProfile, templatePriorSummary),
    ),
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
  templatePriorSummary: TemplatePriorSummary,
): Promise<{
  candidates: TemplateCandidate[];
  summary: SourceSearchFamilySummary;
}> {
  const attempts: SourceSearchFamilySummary["queryAttempts"] = [];
  const queries = searchProfile.graphic.queries.map((plannedQuery) => ({
    label: plannedQuery.label,
    plannedQuery,
    query: createGraphicTransportQuery(plannedQuery),
  }));

  let selectedAssets: TooldiGraphicAsset[] = [];
  for (const attempt of queries) {
    const result = await sourceClient.searchGraphicAssets(attempt.query);
    attempts.push({
      label: attempt.label,
      query: {
        keyword: attempt.query.keyword ?? null,
        theme: attempt.query.theme ?? null,
        type: attempt.query.type ?? null,
        method: attempt.query.method ?? null,
        page: attempt.query.page,
        transportPage: attempt.query.page,
        transportType: attempt.query.type ?? null,
        transportPrice: attempt.query.price ?? null,
        transportOwner: attempt.query.owner ?? null,
        transportTheme: attempt.query.theme ?? null,
        transportMethod: attempt.query.method ?? null,
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
        scoreGraphicAsset(right, searchProfile, templatePriorSummary) -
        scoreGraphicAsset(left, searchProfile, templatePriorSummary),
    )
    .slice(0, 12);
  const candidates = assignFallbacks(
    ranked.map((asset) =>
      mapGraphicAssetToCandidate(asset, searchProfile, templatePriorSummary),
    ),
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

function createGraphicTransportQuery(
  plannedQuery: SearchProfileArtifact["graphic"]["queries"][number],
): SearchGraphicAssetsQuery {
  return {
    page: 0,
    ...(plannedQuery.keyword !== null ? { keyword: plannedQuery.keyword } : {}),
    ...(plannedQuery.price !== null ? { price: plannedQuery.price } : {}),
    ...(plannedQuery.ownerBias === "follow" ? { owner: "follow" as const } : {}),
    ...(plannedQuery.theme !== null ? { theme: plannedQuery.theme } : {}),
    ...(plannedQuery.type !== null ? { type: plannedQuery.type } : {}),
    ...(plannedQuery.method !== null ? { method: plannedQuery.method } : {}),
  };
}

async function searchPhotoCandidates(
  sourceClient: TooldiCatalogSourceClient,
  searchProfile: SearchProfileArtifact,
  templatePriorSummary: TemplatePriorSummary,
): Promise<{
  candidates: TemplateCandidate[];
  summary: SourceSearchFamilySummary;
}> {
  const attempts: SourceSearchFamilySummary["queryAttempts"] = [];
  const preferredOrientation =
    searchProfile.photo.orientationHint ??
    mapPhotoFormatToOrientation(searchProfile.photo.queries[0]?.format ?? null) ??
    "landscape";
  const queries = searchProfile.photo.queries.map((plannedQuery) => ({
    label: plannedQuery.label,
    theme: plannedQuery.theme,
    type: plannedQuery.type,
    format: plannedQuery.format,
    query: {
      page: 0,
      source: plannedQuery.source,
      ...(plannedQuery.keyword !== null
        ? { keyword: plannedQuery.keyword }
        : {}),
      ...(plannedQuery.price !== null ? { price: plannedQuery.price } : {}),
      ...(plannedQuery.ownerBias === "follow" ? { owner: "follow" as const } : {}),
      ...(plannedQuery.theme !== null ? { theme: plannedQuery.theme } : {}),
      ...(plannedQuery.type !== null ? { type: plannedQuery.type } : {}),
      ...(plannedQuery.format !== null ? { format: plannedQuery.format } : {}),
    } satisfies SearchPhotoAssetsQuery,
  }));

  let selectedAssets: TooldiPhotoAsset[] = [];
  for (const attempt of queries) {
    const result = await sourceClient.searchPhotoAssets(attempt.query);
    attempts.push({
      label: attempt.label,
      query: {
        keyword: attempt.query.keyword ?? null,
        theme: attempt.query.theme ?? null,
        type: attempt.query.type ?? null,
        format: attempt.query.format ?? null,
        page: attempt.query.page,
        source: attempt.query.source ?? null,
        transportPrice: attempt.query.price ?? null,
        transportOwner: attempt.query.owner ?? null,
        transportTheme: attempt.query.theme ?? null,
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
        scorePhotoAsset(
          right,
          preferredOrientation,
          searchProfile,
          templatePriorSummary,
        ) -
        scorePhotoAsset(
          left,
          preferredOrientation,
          searchProfile,
          templatePriorSummary,
        ),
    )
    .slice(0, 8);
  const candidates = assignFallbacks(
    ranked.map((asset) =>
      mapPhotoAssetToCandidate(
        asset,
        preferredOrientation,
        searchProfile,
        templatePriorSummary,
      ),
    ),
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
  searchProfile: SearchProfileArtifact,
  templatePriorSummary: TemplatePriorSummary,
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
    fitScore: scoreBackgroundAsset(asset, searchProfile, templatePriorSummary),
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
  searchProfile: SearchProfileArtifact,
  templatePriorSummary: TemplatePriorSummary,
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
    fitScore: scoreGraphicAsset(asset, searchProfile, templatePriorSummary),
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
  searchProfile: SearchProfileArtifact,
  templatePriorSummary: TemplatePriorSummary,
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
    fitScore: scorePhotoAsset(
      asset,
      preferredOrientation,
      searchProfile,
      templatePriorSummary,
    ),
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

function scoreBackgroundAsset(
  asset: TooldiBackgroundAsset,
  searchProfile: SearchProfileArtifact,
  templatePriorSummary: TemplatePriorSummary,
): number {
  const templatePriorKeyword = templatePriorSummary.selectedTemplatePrior.keyword;

  return Number(
    (
      (asset.backgroundKind === "pattern" ? 0.9 : 0.76) +
      (asset.keywordTokens.includes("봄") ? 0.04 : 0) +
      (templatePriorKeyword !== null && asset.keywordTokens.includes(templatePriorKeyword)
        ? 0.03
        : 0) +
      scoreFamilyAdjustment(searchProfile, "background") +
      (asset.thumbnailUrl ? 0.01 : 0)
    ).toFixed(3),
  );
}

function scoreGraphicAsset(
  asset: TooldiGraphicAsset,
  searchProfile: SearchProfileArtifact,
  templatePriorSummary: TemplatePriorSummary,
): number {
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
  const primaryGraphicKeyword = searchProfile.graphic.queries[0]?.keyword;
  const templatePriorKeyword = templatePriorSummary.selectedTemplatePrior.keyword;
  const themePriorBonus =
    templatePriorSummary.selectedContentsThemePrior.shape.status !== "unavailable" &&
    (templatePriorSummary.dominantThemePrior === "contents_theme_prior" ||
      templatePriorSummary.dominantThemePrior === "mixed")
      ? 0.015
      : 0;

  return Number(
    (
      base +
      (asset.keywordTokens.includes("봄") ? 0.03 : 0) +
      (primaryGraphicKeyword != null &&
      asset.keywordTokens.includes(primaryGraphicKeyword)
        ? 0.04
        : 0) +
      (templatePriorKeyword !== null && asset.keywordTokens.includes(templatePriorKeyword)
        ? 0.03
        : 0) +
      themePriorBonus +
      scoreFamilyAdjustment(searchProfile, "graphic") +
      (asset.thumbnailUrl ? 0.01 : 0)
    ).toFixed(3),
  );
}

function scorePhotoAsset(
  asset: TooldiPhotoAsset,
  preferredOrientation: TooldiPhotoAsset["orientation"],
  searchProfile: SearchProfileArtifact,
  templatePriorSummary: TemplatePriorSummary,
): number {
  const base =
    asset.orientation === preferredOrientation
      ? 0.9
      : asset.orientation === "square"
        ? 0.84
      : 0.78;
  const primaryPhotoKeyword = searchProfile.photo.queries[0]?.keyword;
  const templatePriorKeyword = templatePriorSummary.selectedTemplatePrior.keyword;
  const themePriorBonus =
    templatePriorSummary.selectedContentsThemePrior.picture.status !== "unavailable" &&
    (templatePriorSummary.dominantThemePrior === "contents_theme_prior" ||
      templatePriorSummary.dominantThemePrior === "mixed")
      ? 0.015
      : 0;

  return Number(
    (
      base +
      (asset.keywordTokens.includes("봄") ? 0.03 : 0) +
      (primaryPhotoKeyword != null && asset.keywordTokens.includes(primaryPhotoKeyword)
        ? 0.04
        : 0) +
      (templatePriorKeyword !== null && asset.keywordTokens.includes(templatePriorKeyword)
        ? 0.03
        : 0) +
      themePriorBonus +
      scoreFamilyAdjustment(searchProfile, "photo") +
      (asset.thumbnailUrl ? 0.01 : 0) +
      (asset.backgroundRemovalHint ? 0.01 : 0)
    ).toFixed(3),
  );
}

function scoreFamilyAdjustment(
  searchProfile: SearchProfileArtifact,
  family: "background" | "graphic" | "photo",
): number {
  const assetPolicy = normalizeTemplateAssetPolicy(searchProfile.assetPolicy);
  let adjustment = 0;

  if (assetPolicy.preferredFamilies.includes(family)) {
    adjustment += family === "background" ? 0.003 : 0.005;
  }
  if (
    assetPolicy.primaryVisualPolicy === "graphic_preferred" &&
    family === "graphic"
  ) {
    adjustment += 0.005;
  }
  if (
    assetPolicy.primaryVisualPolicy === "photo_preferred" &&
    family === "photo"
  ) {
    adjustment += 0.005;
  }
  if (
    assetPolicy.primaryVisualPolicy === "balanced" &&
    (family === "graphic" || family === "photo") &&
    assetPolicy.preferredFamilies.includes(family)
  ) {
    adjustment += 0.003;
  }
  if (family === "photo" && templateAssetPolicyPrefersPhoto(assetPolicy)) {
    adjustment += 0.003;
  }

  return adjustment - templateAssetPolicyPenaltyForFamily(assetPolicy, family);
}

function mapPhotoFormatToOrientation(
  format: SearchProfileArtifact["photo"]["queries"][number]["format"],
): TooldiPhotoAsset["orientation"] | null {
  if (format === "horizontal") {
    return "landscape";
  }
  if (format === "vertical") {
    return "portrait";
  }
  if (format === "square") {
    return "square";
  }
  return null;
}

function createLayoutCandidateSet(
  input: HydratedPlanningInput,
  intent: NormalizedIntent,
): TemplateCandidateSet {
  const wideCanvas =
    input.request.editorContext.canvasWidth >= input.request.editorContext.canvasHeight;
  const assetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  const graphicPreferred =
    assetPolicy.primaryVisualPolicy === "graphic_preferred";
  const badgeIntent = intent.layoutIntent === "badge_led";

  return {
    setId: `layout_candidates_${createRequestId()}`,
    family: "layout",
    candidates: [
      {
        candidateId: "layout_left_copy_right_graphic",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Copy cluster on the left with a richer multi-graphic field on the right",
        fitScore:
          wideCanvas && graphicPreferred
            ? 0.97
            : wideCanvas
              ? 0.9
              : 0.7,
        selectionReasons: [
          "optimized for generic promo banners that want graphic-heavy emphasis",
          "gives headline, CTA, and accent graphics clearer separation on wide canvases",
        ],
        riskFlags: [],
        fallbackIfRejected: "layout_framed_promo",
        executionAllowed: true,
        payload: {
          variantKey: "left_copy_right_graphic",
          layoutMode: "left_copy_right_graphic",
          themeTokens: ["graphic", "promo", "wide"],
        },
      },
      {
        candidateId: "layout_framed_promo",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Framed promotional poster with graphic-led accents and centered focus",
        fitScore:
          graphicPreferred && !badgeIntent
            ? wideCanvas
              ? 0.93
              : 0.89
            : wideCanvas
              ? 0.87
              : 0.84,
        selectionReasons: [
          "works well for graphic-led promo posters without requiring a photo hero",
          "supports medium-density accent structure and stronger CTA framing",
        ],
        riskFlags: ["requires multiple graphic roles for the best result"],
        fallbackIfRejected: "layout_center_stack_promo",
        executionAllowed: true,
        payload: {
          variantKey: "framed_promo",
          layoutMode: "framed_promo",
          themeTokens: ["promo", "frame", "graphic"],
        },
      },
      {
        candidateId: "layout_center_stack_promo",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Centered promo stack with clearer spacing for CTA and accent graphics",
        fitScore:
          !wideCanvas && graphicPreferred
            ? 0.95
            : wideCanvas
              ? 0.86
              : 0.9,
        selectionReasons: [
          "safer centered fallback for generic promo banners",
          "reserves more room for badge, CTA, and supporting decoration than the legacy center stack",
        ],
        riskFlags: [],
        fallbackIfRejected: "layout_center_stack",
        executionAllowed: true,
        payload: {
          variantKey: "center_stack_promo",
          layoutMode: "center_stack_promo",
          themeTokens: ["promo", "stacked", "graphic"],
        },
      },
      {
        candidateId: "layout_badge_promo_stack",
        family: "layout",
        sourceFamily: "derived_policy",
        summary: "Badge-forward promo stack with compact copy and promotion tokens",
        fitScore: badgeIntent ? 0.94 : 0.82,
        selectionReasons: [
          "best when the prompt or repaired intent explicitly wants badge-led promotion",
          "keeps coupon/badge/ribbon motifs visible without collapsing the CTA block",
        ],
        riskFlags: ["can feel visually busy if too many accents survive ranking"],
        fallbackIfRejected: "layout_center_stack_promo",
        executionAllowed: true,
        payload: {
          variantKey: "badge_promo_stack",
          layoutMode: "badge_promo_stack",
          themeTokens: ["badge", "promo", "graphic"],
        },
      },
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
        fitScore: wideCanvas ? 0.76 : 0.82,
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
        fitScore: badgeIntent ? 0.84 : 0.7,
        selectionReasons: ["useful for promotion-focused CTA rhythm"],
        riskFlags: ["more visually busy"],
        fallbackIfRejected: "layout_badge_promo_stack",
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
