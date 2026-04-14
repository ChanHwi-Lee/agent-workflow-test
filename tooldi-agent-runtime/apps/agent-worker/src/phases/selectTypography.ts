import { createRequestId } from "@tooldi/agent-domain";
import type {
  TooldiCatalogSourceClient,
  TooldiCatalogSourceMode,
  TooldiFontAsset,
  TooldiFontWeightAsset,
} from "@tooldi/tool-adapters";

import type {
  HydratedPlanningInput,
  SceneStylePlan,
  SourceSearchFamilySummary,
  TypographyChoice,
  TypographyDecision,
} from "../types.js";

export interface SelectTypographyDependencies {
  sourceClient: TooldiCatalogSourceClient;
  sourceMode: TooldiCatalogSourceMode;
  sceneStylePlan?: SceneStylePlan | null;
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
        matchedTemplateFontFamily: dependencies.sceneStylePlan?.typographyPolicy.templateFontFamily ?? null,
        appliedTone: dependencies.sceneStylePlan?.typographyPolicy.tone ?? null,
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
  const typographyPolicy = dependencies.sceneStylePlan?.typographyPolicy ?? null;
  const displayFont =
    pickPreferredFont(
      koreanFonts,
      typographyPolicy?.categoryHints ?? ["고딕"],
      typographyPolicy?.displayWeightTarget ?? 700,
      typographyPolicy?.templateFontFamily ?? null,
    ) ?? null;
  const bodyFont =
    pickBodyFont(koreanFonts, displayFont, typographyPolicy) ?? null;

  const displayChoice = displayFont
    ? mapTypographyChoice(displayFont, typographyPolicy?.displayWeightTarget ?? 700)
    : null;
  const bodyChoice = bodyFont
    ? mapTypographyChoice(bodyFont, typographyPolicy?.bodyWeightTarget ?? 400)
    : null;
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
      matchedTemplateFontFamily: typographyPolicy?.templateFontFamily ?? null,
      appliedTone: typographyPolicy?.tone ?? null,
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
  templateFontFamily: string | null,
): TooldiFontAsset | null {
  const preferredPool = fonts.filter((font) =>
    preferredCategories.some((category) => font.fontCategory.includes(category)),
  );
  const pool = preferredPool.length > 0 ? preferredPool : fonts;
  const normalizedTemplateFamily = templateFontFamily?.toLowerCase() ?? null;
  const templateFontSerial = extractTemplateFontSerial(templateFontFamily);

  return (
    [...pool].sort((left, right) => {
      return scoreFontCandidate(right, desiredWeight, normalizedTemplateFamily, templateFontSerial) -
        scoreFontCandidate(left, desiredWeight, normalizedTemplateFamily, templateFontSerial);
    })[0] ?? null
  );
}

function pickBodyFont(
  fonts: TooldiFontAsset[],
  displayFont: TooldiFontAsset | null,
  typographyPolicy: SceneStylePlan["typographyPolicy"] | null,
): TooldiFontAsset | null {
  const desiredWeight = typographyPolicy?.bodyWeightTarget ?? 400;
  if (displayFont && findClosestWeight(displayFont.fontWeights, desiredWeight)) {
    return displayFont;
  }

  return (
    pickPreferredFont(
      fonts,
      typographyPolicy?.categoryHints ?? ["고딕", "명조"],
      desiredWeight,
      typographyPolicy?.templateFontFamily ?? null,
    ) ??
    pickPreferredFont(fonts, [], desiredWeight, typographyPolicy?.templateFontFamily ?? null)
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

function scoreFontCandidate(
  font: TooldiFontAsset,
  desiredWeight: number,
  normalizedTemplateFamily: string | null,
  templateFontSerial: string | null,
): number {
  const closestWeight = findClosestWeight(font.fontWeights, desiredWeight);
  const weightScore = closestWeight
    ? 100 - Math.abs(closestWeight.fontWeight - desiredWeight)
    : 0;
  const serialScore =
    templateFontSerial && font.serial === templateFontSerial ? 60 : 0;
  const familyScore =
    normalizedTemplateFamily &&
    [font.fontName, font.fontFace, font.fontCategory]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(normalizedTemplateFamily))
      ? 25
      : 0;
  return weightScore + familyScore + serialScore;
}

function extractTemplateFontSerial(
  templateFontFamily: string | null,
): string | null {
  if (!templateFontFamily) {
    return null;
  }
  const match = templateFontFamily.match(/^(\d+)_\d+$/);
  return match?.[1] ?? null;
}
