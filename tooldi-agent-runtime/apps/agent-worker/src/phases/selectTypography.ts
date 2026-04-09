import { createRequestId } from "@tooldi/agent-domain";
import type {
  TooldiCatalogSourceClient,
  TooldiCatalogSourceMode,
  TooldiFontAsset,
  TooldiFontWeightAsset,
} from "@tooldi/tool-adapters";

import type {
  HydratedPlanningInput,
  SourceSearchFamilySummary,
  TypographyChoice,
  TypographyDecision,
} from "../types.js";

export interface SelectTypographyDependencies {
  sourceClient: TooldiCatalogSourceClient;
  sourceMode: TooldiCatalogSourceMode;
}

export interface SelectTypographyResult {
  decision: TypographyDecision;
  summary: SourceSearchFamilySummary;
}

export async function selectTypography(
  input: HydratedPlanningInput,
  dependencies: SelectTypographyDependencies,
): Promise<SelectTypographyResult> {
  if (dependencies.sourceMode === "placeholder") {
    return {
      decision: {
        decisionId: createRequestId(),
        runId: input.job.runId,
        traceId: input.job.traceId,
        sourceMode: dependencies.sourceMode,
        inventoryCount: 0,
        fallbackUsed: true,
        display: null,
        body: null,
        summary: "Typography kept on editor fallback because real source mode is disabled",
      },
      summary: {
        family: "font",
        queryAttempts: [],
        returnedCount: 0,
        filteredCount: 0,
        fallbackUsed: true,
        selectedAssetId: null,
        selectedSerial: null,
        selectedCategory: null,
      },
    };
  }

  const fontInventory = await dependencies.sourceClient.listFontAssets({
    supportedLanguage: "KOR",
  });
  const koreanFonts = fontInventory.assets.filter((asset) =>
    asset.supportedLanguages.includes("KOR"),
  );
  const displayFont =
    pickPreferredFont(koreanFonts, ["고딕"], 700) ?? null;
  const bodyFont =
    pickBodyFont(koreanFonts, displayFont) ?? null;

  const displayChoice = displayFont ? mapTypographyChoice(displayFont, 700) : null;
  const bodyChoice = bodyFont ? mapTypographyChoice(bodyFont, 400) : null;
  const fallbackUsed = displayChoice === null || bodyChoice === null;

  return {
    decision: {
      decisionId: createRequestId(),
      runId: input.job.runId,
      traceId: input.job.traceId,
      sourceMode: dependencies.sourceMode,
      inventoryCount: koreanFonts.length,
      fallbackUsed,
      display: displayChoice,
      body: bodyChoice,
      summary:
        displayChoice && bodyChoice
          ? `Selected display ${displayChoice.fontToken} and body ${bodyChoice.fontToken}`
          : "Typography partially fell back to editor defaults",
    },
    summary: {
      family: "font",
      queryAttempts: [
        {
          label: "font_inventory",
          query: {
            supportedLanguage: "KOR",
          },
          returnedCount: fontInventory.assets.length,
        },
      ],
      returnedCount: fontInventory.assets.length,
      filteredCount: koreanFonts.length,
      fallbackUsed,
      selectedAssetId: displayChoice?.fontAssetId ?? bodyChoice?.fontAssetId ?? null,
      selectedSerial: displayChoice?.fontSerial ?? bodyChoice?.fontSerial ?? null,
      selectedCategory: displayChoice?.fontCategory ?? bodyChoice?.fontCategory ?? null,
    },
  };
}

function pickPreferredFont(
  fonts: TooldiFontAsset[],
  preferredCategories: string[],
  desiredWeight: number,
): TooldiFontAsset | null {
  const preferredPool = fonts.filter((font) =>
    preferredCategories.some((category) => font.fontCategory.includes(category)),
  );
  const pool = preferredPool.length > 0 ? preferredPool : fonts;

  return (
    [...pool].sort((left, right) => {
      const leftWeight = findClosestWeight(left.fontWeights, desiredWeight);
      const rightWeight = findClosestWeight(right.fontWeights, desiredWeight);
      if (leftWeight === null && rightWeight === null) {
        return 0;
      }
      if (leftWeight === null) {
        return 1;
      }
      if (rightWeight === null) {
        return -1;
      }
      return (
        Math.abs(leftWeight.fontWeight - desiredWeight) -
        Math.abs(rightWeight.fontWeight - desiredWeight)
      );
    })[0] ?? null
  );
}

function pickBodyFont(
  fonts: TooldiFontAsset[],
  displayFont: TooldiFontAsset | null,
): TooldiFontAsset | null {
  if (displayFont && findClosestWeight(displayFont.fontWeights, 400)) {
    return displayFont;
  }

  return (
    pickPreferredFont(fonts, ["고딕", "명조"], 400) ??
    pickPreferredFont(fonts, [], 400)
  );
}

function mapTypographyChoice(
  font: TooldiFontAsset,
  desiredWeight: number,
): TypographyChoice | null {
  const weight = findClosestWeight(font.fontWeights, desiredWeight);
  if (!weight) {
    return null;
  }

  return {
    fontAssetId: font.assetId,
    fontSerial: font.serial,
    fontName: font.fontName,
    fontCategory: font.fontCategory,
    fontFace: font.fontFace,
    fontToken: `${weight.fontSerial}_${weight.fontWeight}`,
    fontWeight: weight.fontWeight,
  };
}

function findClosestWeight(
  weights: TooldiFontWeightAsset[],
  desiredWeight: number,
): { fontFamily: string; fontWeight: number; fontSerial: string } | null {
  const normalized = weights
    .map((weight) => ({
      fontFamily: weight.fontFamily,
      fontSerial: weight.fontSerial,
      fontWeight:
        Number.parseInt(weight.convertWeight, 10) ||
        Number.parseInt(weight.fontWeight, 10) ||
        desiredWeight,
    }))
    .filter((weight) => Number.isFinite(weight.fontWeight));

  if (normalized.length === 0) {
    return null;
  }

  return normalized.sort((left, right) => {
    const leftDistance = Math.abs(left.fontWeight - desiredWeight);
    const rightDistance = Math.abs(right.fontWeight - desiredWeight);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    return right.fontWeight - left.fontWeight;
  })[0]!;
}
