import type { TemplatePriorSummary } from "@tooldi/agent-contracts";

import type {
  NormalizedIntent,
  SearchProfileArtifact,
  SelectionDecision,
  SourceSearchSummary,
} from "../types.js";
import {
  pushSignalText,
  queryFieldToString,
  RETAIL_MENU_CONTRADICTION_FLAG_CODES,
  sameJsonValue,
  sameStringArray,
} from "./ruleJudgeDomainAnalysis.js";

export function deriveSelectedFamily(
  selectionDecision: SelectionDecision,
): "graphic" | "photo" {
  if (
    selectionDecision.photoBranchMode === "photo_selected" ||
    selectionDecision.executionStrategy === "photo_hero_shape_text_group" ||
    selectionDecision.layoutMode === "copy_left_with_right_photo"
  ) {
    return "photo";
  }
  return "graphic";
}

export function describeSelectionLane(
  selectedFamily: "graphic" | "photo",
): "shape" | "picture" {
  return selectedFamily === "photo" ? "picture" : "shape";
}

export function mapSelectedFamilyToPriorFamily(
  selectedFamily: "graphic" | "photo",
): "shape" | "picture" {
  return selectedFamily === "photo" ? "picture" : "shape";
}

export function describeDominantPrior(
  templatePriorSummary: TemplatePriorSummary,
  selectedPriorFamily: "shape" | "picture",
): string {
  if (templatePriorSummary.dominantThemePrior === "template_prior") {
    return "template prior";
  }
  if (templatePriorSummary.dominantThemePrior === "contents_theme_prior") {
    return `${selectedPriorFamily} contents_theme prior`;
  }
  return "mixed template/theme prior";
}

export function collectSelectedSubjectTexts(
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
): Array<{ source: string; text: string }> {
  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const texts: Array<{ source: string; text: string }> = [];

  if (selectedFamily === "photo") {
    for (const query of searchProfile.photo.queries) {
      pushSignalText(
        texts,
        `searchProfile.photo.${query.label}.keyword`,
        query.keyword,
      );
    }

    for (const attempt of sourceSearchSummary.photo.queryAttempts) {
      pushSignalText(
        texts,
        `sourceSearchSummary.photo.${attempt.label}.keyword`,
        queryFieldToString(attempt.query.keyword),
      );
    }
  } else {
    for (const query of searchProfile.graphic.queries) {
      pushSignalText(
        texts,
        `searchProfile.graphic.${query.label}.keyword`,
        query.keyword,
      );
      pushSignalText(
        texts,
        `searchProfile.graphic.${query.label}.theme`,
        query.theme,
      );
      pushSignalText(
        texts,
        `searchProfile.graphic.${query.label}.type`,
        query.type,
      );
      pushSignalText(
        texts,
        `searchProfile.graphic.${query.label}.method`,
        query.method,
      );
    }

    for (const attempt of sourceSearchSummary.graphic.queryAttempts) {
      pushSignalText(
        texts,
        `sourceSearchSummary.graphic.${attempt.label}.keyword`,
        queryFieldToString(attempt.query.keyword),
      );
      pushSignalText(
        texts,
        `sourceSearchSummary.graphic.${attempt.label}.theme`,
        queryFieldToString(attempt.query.theme),
      );
    }
  }

  pushSignalText(texts, "selectionDecision.summary", selectionDecision.summary);
  pushSignalText(
    texts,
    "selectionDecision.photoBranchReason",
    selectionDecision.photoBranchReason,
  );
  pushSignalText(
    texts,
    "selectionDecision.fallbackSummary",
    selectionDecision.fallbackSummary,
  );

  return texts;
}

export function collectSearchProfileContractMismatches(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
): string[] {
  const mismatches: string[] = [];

  if (searchProfile.templateKind !== intent.templateKind) {
    mismatches.push("templateKind");
  }
  if (searchProfile.domain !== intent.domain) {
    mismatches.push("domain");
  }
  if (searchProfile.audience !== intent.audience) {
    mismatches.push("audience");
  }
  if (searchProfile.campaignGoal !== intent.campaignGoal) {
    mismatches.push("campaignGoal");
  }
  if (searchProfile.canvasPreset !== intent.canvasPreset) {
    mismatches.push("canvasPreset");
  }
  if (searchProfile.layoutIntent !== intent.layoutIntent) {
    mismatches.push("layoutIntent");
  }
  if (searchProfile.tone !== intent.tone) {
    mismatches.push("tone");
  }
  if (!sameStringArray(searchProfile.searchKeywords, intent.searchKeywords)) {
    mismatches.push("searchKeywords");
  }
  if (!sameJsonValue(searchProfile.facets, intent.facets)) {
    mismatches.push("facets");
  }
  if (!sameJsonValue(searchProfile.assetPolicy, intent.assetPolicy)) {
    mismatches.push("assetPolicy");
  }

  return mismatches;
}

export function collectFashionRetailMenuContradictionReasons(
  intent: NormalizedIntent,
  searchProfile: SearchProfileArtifact,
): string[] {
  if (intent.domain !== "fashion_retail") {
    return [];
  }

  const reasons: string[] = [];

  if (
    intent.consistencyFlags.some((flag) =>
      RETAIL_MENU_CONTRADICTION_FLAG_CODES.has(flag.code),
    )
  ) {
    reasons.push("normalized intent carried retail/menu contradiction repair flags");
  }

  if (searchProfile.facets.menuType !== null) {
    reasons.push(`facets.menuType=${searchProfile.facets.menuType}`);
  }
  if (searchProfile.campaignGoal === "menu_discovery") {
    reasons.push("campaignGoal=menu_discovery");
  }
  if (searchProfile.facets.promotionStyle === "seasonal_menu_launch") {
    reasons.push("facets.promotionStyle=seasonal_menu_launch");
  }

  const menuBearingFields = [
    ...collectMenuBearingSearchProfileFields(
      searchProfile.searchKeywords,
      "searchProfile.searchKeywords",
    ),
    ...collectMenuBearingSearchProfileFields(
      searchProfile.graphic.queries.map((query) => query.keyword),
      "searchProfile.graphic",
    ),
    ...collectMenuBearingSearchProfileFields(
      searchProfile.photo.queries.map((query) => query.keyword),
      "searchProfile.photo",
    ),
  ];

  if (menuBearingFields.length > 0) {
    reasons.push(`menu-bearing query fields=${menuBearingFields.join(", ")}`);
  }

  return [...new Set(reasons)];
}

export function collectSearchProfileLaneTexts(
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
): Array<{ source: string; text: string }> {
  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const texts: Array<{ source: string; text: string }> = [];

  if (selectedFamily === "photo") {
    for (const query of searchProfile.photo.queries) {
      pushSignalText(
        texts,
        `searchProfile.photo.${query.label}.keyword`,
        query.keyword,
      );
      pushSignalText(
        texts,
        `searchProfile.photo.${query.label}.theme`,
        query.theme,
      );
      pushSignalText(
        texts,
        `searchProfile.photo.${query.label}.type`,
        query.type,
      );
      pushSignalText(
        texts,
        `searchProfile.photo.${query.label}.format`,
        query.format,
      );
    }

    return texts;
  }

  for (const query of searchProfile.graphic.queries) {
    pushSignalText(
      texts,
      `searchProfile.graphic.${query.label}.keyword`,
      query.keyword,
    );
    pushSignalText(
      texts,
      `searchProfile.graphic.${query.label}.theme`,
      query.theme,
    );
    pushSignalText(
      texts,
      `searchProfile.graphic.${query.label}.type`,
      query.type,
    );
    pushSignalText(
      texts,
      `searchProfile.graphic.${query.label}.method`,
      query.method,
    );
  }

  return texts;
}

export function collectSelectedThemeTexts(
  searchProfile: SearchProfileArtifact,
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
): Array<{ source: string; text: string }> {
  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const texts: Array<{ source: string; text: string }> = [];

  if (selectedFamily === "photo") {
    for (const query of searchProfile.photo.queries) {
      pushSignalText(
        texts,
        `searchProfile.photo.${query.label}.theme`,
        query.theme,
      );
    }

    for (const attempt of sourceSearchSummary.photo.queryAttempts) {
      pushSignalText(
        texts,
        `sourceSearchSummary.photo.${attempt.label}.theme`,
        queryFieldToString(attempt.query.theme),
      );
    }
  } else {
    for (const attempt of sourceSearchSummary.graphic.queryAttempts) {
      pushSignalText(
        texts,
        `sourceSearchSummary.graphic.${attempt.label}.theme`,
        queryFieldToString(attempt.query.theme),
      );
    }
  }

  pushSignalText(texts, "selectionDecision.summary", selectionDecision.summary);

  return texts;
}

export function collectPrimaryVisualTexts(
  selectionDecision: SelectionDecision,
  sourceSearchSummary: SourceSearchSummary,
): Array<{ source: string; text: string }> {
  const selectedFamily = deriveSelectedFamily(selectionDecision);
  const texts: Array<{ source: string; text: string }> = [];

  pushSignalText(texts, "selectionDecision.summary", selectionDecision.summary);
  pushSignalText(
    texts,
    "selectionDecision.photoBranchReason",
    selectionDecision.photoBranchReason,
  );
  pushSignalText(
    texts,
    "selectionDecision.fallbackSummary",
    selectionDecision.fallbackSummary,
  );

  if (selectedFamily === "photo") {
    pushSignalText(
      texts,
      "selectionDecision.topPhotoCategory",
      selectionDecision.topPhotoCategory,
    );

    for (const attempt of sourceSearchSummary.photo.queryAttempts) {
      pushSignalText(
        texts,
        `sourceSearchSummary.photo.${attempt.label}.keyword`,
        queryFieldToString(attempt.query.keyword),
      );
      pushSignalText(
        texts,
        `sourceSearchSummary.photo.${attempt.label}.theme`,
        queryFieldToString(attempt.query.theme),
      );
      pushSignalText(
        texts,
        `sourceSearchSummary.photo.${attempt.label}.type`,
        queryFieldToString(attempt.query.type),
      );
      pushSignalText(
        texts,
        `sourceSearchSummary.photo.${attempt.label}.format`,
        queryFieldToString(attempt.query.format),
      );
    }

    return texts;
  }

  pushSignalText(
    texts,
    "selectionDecision.selectedDecorationCategory",
    selectionDecision.selectedDecorationCategory,
  );
  pushSignalText(
    texts,
    "selectionDecision.selectedBackgroundCategory",
    selectionDecision.selectedBackgroundCategory,
  );

  for (const attempt of sourceSearchSummary.graphic.queryAttempts) {
    pushSignalText(
      texts,
      `sourceSearchSummary.graphic.${attempt.label}.keyword`,
      queryFieldToString(attempt.query.keyword),
    );
    pushSignalText(
      texts,
      `sourceSearchSummary.graphic.${attempt.label}.theme`,
      queryFieldToString(attempt.query.theme),
    );
    pushSignalText(
      texts,
      `sourceSearchSummary.graphic.${attempt.label}.type`,
      queryFieldToString(attempt.query.type),
    );
    pushSignalText(
      texts,
      `sourceSearchSummary.graphic.${attempt.label}.method`,
      queryFieldToString(attempt.query.method),
    );
  }

  return texts;
}

export function collectPriorSubjectTexts(
  templatePriorSummary: TemplatePriorSummary | null,
): Array<{ source: string; text: string }> {
  if (!templatePriorSummary) {
    return [];
  }

  const texts: Array<{ source: string; text: string }> = [];
  pushSignalText(
    texts,
    "templatePriorSummary.selectedTemplatePrior.summary",
    templatePriorSummary.selectedTemplatePrior.summary,
  );
  pushSignalText(
    texts,
    "templatePriorSummary.selectedTemplatePrior.keyword",
    templatePriorSummary.selectedTemplatePrior.keyword,
  );

  for (const match of templatePriorSummary.keywordThemeMatches) {
    pushSignalText(
      texts,
      `templatePriorSummary.keywordThemeMatches.${match.family}.signal`,
      match.signal,
    );
    pushSignalText(
      texts,
      `templatePriorSummary.keywordThemeMatches.${match.family}.summary`,
      match.summary,
    );
  }

  return texts;
}

export function collectPriorThemeTexts(
  templatePriorSummary: TemplatePriorSummary | null,
): Array<{ source: string; text: string }> {
  if (!templatePriorSummary) {
    return [];
  }

  const texts: Array<{ source: string; text: string }> = [];
  pushSignalText(
    texts,
    "templatePriorSummary.selectedTemplatePrior.summary",
    templatePriorSummary.selectedTemplatePrior.summary,
  );
  pushSignalText(
    texts,
    "templatePriorSummary.selectedTemplatePrior.keyword",
    templatePriorSummary.selectedTemplatePrior.keyword,
  );

  for (const prior of Object.values(templatePriorSummary.selectedContentsThemePrior)) {
    pushSignalText(
      texts,
      `templatePriorSummary.selectedContentsThemePrior.${prior.family}.summary`,
      prior.summary,
    );
    pushSignalText(
      texts,
      `templatePriorSummary.selectedContentsThemePrior.${prior.family}.serial`,
      prior.serial,
    );
  }

  for (const match of templatePriorSummary.contentsThemePriorMatches) {
    pushSignalText(
      texts,
      `templatePriorSummary.contentsThemePriorMatches.${match.family}.signal`,
      match.signal,
    );
    pushSignalText(
      texts,
      `templatePriorSummary.contentsThemePriorMatches.${match.family}.summary`,
      match.summary,
    );
  }

  for (const bias of templatePriorSummary.rankingBiases) {
    pushSignalText(
      texts,
      "templatePriorSummary.rankingBiases.bias",
      bias.bias,
    );
    pushSignalText(
      texts,
      "templatePriorSummary.rankingBiases.rationale",
      bias.rationale,
    );
  }

  return texts;
}

function collectMenuBearingSearchProfileFields(
  values: Array<string | null>,
  prefix: string,
): string[] {
  const matches: string[] = [];

  for (const [index, value] of values.entries()) {
    if (!value || !hasMenuSignal(value)) {
      continue;
    }
    matches.push(`${prefix}[${index}]=${value}`);
  }

  return matches;
}

function hasMenuSignal(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }

  return /메뉴|menu|브런치|brunch|요리|식사|런치|푸드|food|다이닝|dining/i.test(
    text,
  );
}
