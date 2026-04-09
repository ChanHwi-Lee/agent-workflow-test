import { createRequestId } from "@tooldi/agent-domain";
import type { TemplatePriorSummary } from "@tooldi/agent-contracts";
import {
  normalizeTemplateAssetPolicy,
  templateAssetPolicyAllowsFamily,
  templateAssetPolicyPrefersPhoto,
} from "@tooldi/agent-llm";

import type { NormalizedIntent } from "../types.js";

const LOCKED_CONTENTS_THEME_COUNTS = {
  template: 8,
  shape: 6,
  picture: 6,
} as const;

const LOCKED_SPRING_INVENTORY_COUNTS = {
  template: 1880,
  shape: 44291,
  picture: 1941,
} as const;

const TEMPLATE_QUERY_SURFACE =
  "POST /editor/get_templates (keyword, canvas, categorySerial, price, follow, page)";

const TEMPLATE_PRIOR_EVIDENCE_REFS = [
  "tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md:270",
  "tooldi-agent-workflow-v1-tooldi-content-discovery.md:172",
  "/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Editor.php:1353",
] as const;

const TEMPLATE_PRIOR_CONTEXT_REFS = [
  "tooldi-agent-workflow-v1-create-template-current-state-as-is.md:127",
  "tooldi-agent-workflow-v1-doc-index.md:17",
] as const;

const CONTENTS_THEME_EVIDENCE_REFS = [
  "tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md:153",
  "tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md:276",
  "/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Picture.php:41",
  "/home/ubuntu/github/tooldi/TOOLDi_API_PHP/application/controllers/Shape.php:40",
] as const;

const CONTENTS_THEME_CONTEXT_REFS = [
  "tooldi-agent-workflow-v1-create-template-current-state-as-is.md:89",
  "tooldi-agent-workflow-v1-tooldi-content-discovery.md:534",
] as const;

const FAMILY_POLICY_EVIDENCE_REFS = [
  "tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md:207",
  "tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md:308",
  "tooldi-agent-workflow-v1-scope-operations-decisions.md:44",
] as const;

const FAMILY_POLICY_CONTEXT_REFS = [
  "tooldi-agent-workflow-v1-create-template-current-state-as-is.md:115",
  "tooldi-agent-workflow-v1-doc-index.md:28",
] as const;

const DOMAIN_WEIGHT_EVIDENCE_REFS = [
  "tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md:296",
  "tooldi-agent-workflow-v1-template-intelligence-design-lock.md:58",
] as const;

const DOMAIN_WEIGHT_CONTEXT_REFS = [
  "tooldi-agent-workflow-v1-create-template-current-state-as-is.md:141",
  "tooldi-agent-workflow-v1-next-implementation-roadmap.md:17",
] as const;

export async function buildTemplatePriorSummary(
  intent: NormalizedIntent,
): Promise<TemplatePriorSummary> {
  const assetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  const templateKeyword = deriveTemplatePriorKeyword(intent);
  const categorySerial = deriveTemplateCategorySerial(intent.canvasPreset);
  const templatePriorStatus =
    categorySerial && templateKeyword
      ? deriveTemplatePriorStatus(intent)
      : "unavailable";
  const templatePriorCompetitiveness =
    templatePriorStatus === "competitive_only"
      ? "competitive_only"
      : templatePriorStatus === "supportive_only"
        ? "supportive_only"
        : "not_applicable";
  const templatePriorCandidates = buildTemplatePriorCandidates(
    intent,
    templateKeyword,
    categorySerial,
    templatePriorStatus,
    templatePriorCompetitiveness,
  );
  const hasSpringThemeSignal = hasKeyword(intent, "봄") || intent.facets.seasonality === "spring";
  const photoAllowed = templateAssetPolicyAllowsFamily(assetPolicy, "photo");
  const photoPreferred = templateAssetPolicyPrefersPhoto(assetPolicy);
  const selectedContentsThemePrior = {
    template: buildContentsThemeSelection("template", hasSpringThemeSignal, false),
    shape: buildContentsThemeSelection("shape", hasSpringThemeSignal, !photoPreferred),
    picture: buildContentsThemeSelection("picture", hasSpringThemeSignal, photoAllowed),
  } satisfies TemplatePriorSummary["selectedContentsThemePrior"];
  const contentsThemePriorMatches = buildContentsThemePriorMatches(
    hasSpringThemeSignal,
    photoAllowed,
    photoPreferred,
  );
  const keywordThemeMatches = buildKeywordThemeMatches(
    intent,
    templateKeyword,
    categorySerial,
    photoAllowed,
  );
  const dominantThemePrior = determineDominantThemePrior(
    templatePriorStatus,
    contentsThemePriorMatches.length,
  );
  const rankingRationaleEntries = buildRankingRationaleEntries({
    intent,
    templatePriorCandidates,
    selectedContentsThemePrior,
    hasSpringThemeSignal,
    photoAllowed,
    photoPreferred,
    templateKeyword,
    categorySerial,
  });
  const familyCoverage = {
    template: templatePriorStatus !== "unavailable",
    shape: hasSpringThemeSignal && LOCKED_CONTENTS_THEME_COUNTS.shape > 0,
    picture: hasSpringThemeSignal && LOCKED_CONTENTS_THEME_COUNTS.picture > 0,
  } satisfies TemplatePriorSummary["familyCoverage"];

  return {
    summaryId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    plannerMode: intent.plannerMode,
    templatePriorCandidates,
    selectedTemplatePrior: {
      status: templatePriorStatus,
      competitiveness: templatePriorCompetitiveness,
      summary:
        templatePriorStatus === "unavailable"
          ? "Template prior stayed unavailable because no grounded template keyword/category pair could be derived from canonical intent."
          : `Template prior stays ${templatePriorStatus} using category ${categorySerial} and keyword '${templateKeyword}' on the real Tooldi template search surface.`,
      keyword: templateKeyword,
      categorySerial,
      querySurface: TEMPLATE_QUERY_SURFACE,
      evidenceRefs: [...TEMPLATE_PRIOR_EVIDENCE_REFS],
      contextRefs: [...TEMPLATE_PRIOR_CONTEXT_REFS],
    },
    selectedContentsThemePrior,
    dominantThemePrior,
    contentsThemePriorMatches,
    keywordThemeMatches,
    familyCoverage,
    rankingBiases: buildRankingBiases(
      intent,
      hasSpringThemeSignal,
      photoAllowed,
      photoPreferred,
      templatePriorStatus,
    ),
    rankingRationaleEntries,
    summary: buildSummary(
      intent,
      templateKeyword,
      categorySerial,
      dominantThemePrior,
      hasSpringThemeSignal,
    ),
  };
}

function buildTemplatePriorCandidates(
  intent: NormalizedIntent,
  templateKeyword: string | null,
  categorySerial: string | null,
  templatePriorStatus: TemplatePriorSummary["selectedTemplatePrior"]["status"],
  templatePriorCompetitiveness: TemplatePriorSummary["selectedTemplatePrior"]["competitiveness"],
): TemplatePriorSummary["templatePriorCandidates"] {
  const candidateInputs = collectTemplatePriorCandidateInputs(intent);
  if (candidateInputs.length === 0) {
    return [
      {
        rank: 1,
        sourceSignal: "template_prior_unavailable",
        keyword: null,
        categorySerial,
        status: "unavailable",
        competitiveness: "not_applicable",
        selected: false,
        rationale:
          "No grounded template prior candidate could be derived from canonical intent, so downstream ranking must lean on direct family evidence.",
        evidenceRefs: [...TEMPLATE_PRIOR_EVIDENCE_REFS],
        contextRefs: [...TEMPLATE_PRIOR_CONTEXT_REFS],
      },
    ];
  }

  return candidateInputs.map((candidate, index) => {
    const selected =
      categorySerial !== null &&
      templateKeyword !== null &&
      candidate.keyword === templateKeyword;

    return {
      rank: index + 1,
      sourceSignal: candidate.sourceSignal,
      keyword: candidate.keyword,
      categorySerial,
      status:
        categorySerial === null
          ? "unavailable"
          : selected
            ? templatePriorStatus
            : "supportive_only",
      competitiveness:
        categorySerial === null
          ? "not_applicable"
          : selected
            ? templatePriorCompetitiveness
            : "supportive_only",
      selected,
      rationale: candidate.rationale,
      evidenceRefs: [...candidate.evidenceRefs],
      contextRefs: [...candidate.contextRefs],
    };
  });
}

function collectTemplatePriorCandidateInputs(
  intent: NormalizedIntent,
): Array<{
  sourceSignal: string;
  keyword: string;
  rationale: string;
  evidenceRefs: readonly string[];
  contextRefs: readonly string[];
}> {
  const candidates: Array<{
    sourceSignal: string;
    keyword: string;
    rationale: string;
    evidenceRefs: readonly string[];
    contextRefs: readonly string[];
  }> = [];
  const seenKeywords = new Set<string>();
  const pushCandidate = (
    sourceSignal: string,
    keyword: string | null,
    rationale: string,
    evidenceRefs: readonly string[],
    contextRefs: readonly string[],
  ) => {
    if (!keyword) {
      return;
    }

    const normalized = normalizeKeyword(keyword);
    if (!normalized || seenKeywords.has(normalized)) {
      return;
    }

    seenKeywords.add(normalized);
    candidates.push({
      sourceSignal,
      keyword: normalized,
      rationale,
      evidenceRefs,
      contextRefs,
    });
  };

  if (intent.facets.seasonality === "spring") {
    pushCandidate(
      "seasonality:spring",
      findKeyword(intent, ["봄"]) ?? "봄",
      "Seasonality provides the most specific grounded template keyword in this slice, so spring stays ahead of broader promotion or domain fallbacks.",
      TEMPLATE_PRIOR_EVIDENCE_REFS,
      TEMPLATE_PRIOR_CONTEXT_REFS,
    );
  }

  if (intent.facets.promotionStyle === "sale_campaign") {
    pushCandidate(
      "promotion_style:sale_campaign",
      findKeyword(intent, ["세일", "할인", "특가", "쿠폰", "행사"]) ?? "세일",
      "Promotion-style wording stays as the first fallback template prior when the seasonal keyword alone is not sufficient to rank the template lane.",
      TEMPLATE_PRIOR_EVIDENCE_REFS,
      TEMPLATE_PRIOR_CONTEXT_REFS,
    );
  }

  if (intent.facets.menuType === "drink_menu") {
    pushCandidate(
      "menu_type:drink_menu",
      findKeyword(intent, ["신메뉴", "음료", "커피", "라떼"]) ?? "음료",
      "Drink-menu meaning remains a grounded subject fallback so the template prior can preserve beverage intent if higher-priority season or promotion cues weaken.",
      TEMPLATE_PRIOR_EVIDENCE_REFS,
      TEMPLATE_PRIOR_CONTEXT_REFS,
    );
  }

  if (intent.facets.menuType === "food_menu") {
    pushCandidate(
      "menu_type:food_menu",
      findKeyword(intent, ["신메뉴", "메뉴", "요리", "브런치"]) ?? "메뉴",
      "Food-menu meaning remains a grounded subject fallback so template ranking can preserve restaurant semantics without inventing a new template filter.",
      TEMPLATE_PRIOR_EVIDENCE_REFS,
      TEMPLATE_PRIOR_CONTEXT_REFS,
    );
  }

  if (intent.domain === "fashion_retail") {
    pushCandidate(
      "domain:fashion_retail",
      findKeyword(intent, ["패션", "리테일", "의류", "브랜드"]) ?? "패션",
      "Domain-specific retail wording stays available as a lower-priority template prior so fashion meaning remains visible without becoming a rigid family ban.",
      TEMPLATE_PRIOR_EVIDENCE_REFS,
      TEMPLATE_PRIOR_CONTEXT_REFS,
    );
  }

  pushCandidate(
    "search_keyword:fallback",
    intent.searchKeywords[0] ?? null,
    "The first repaired search keyword remains the last fallback template prior candidate so ranking stays auditable even when higher-order meaning is sparse.",
    TEMPLATE_PRIOR_EVIDENCE_REFS,
    TEMPLATE_PRIOR_CONTEXT_REFS,
  );

  return candidates;
}

function buildRankingRationaleEntries(input: {
  intent: NormalizedIntent;
  templatePriorCandidates: TemplatePriorSummary["templatePriorCandidates"];
  selectedContentsThemePrior: TemplatePriorSummary["selectedContentsThemePrior"];
  hasSpringThemeSignal: boolean;
  photoAllowed: boolean;
  photoPreferred: boolean;
  templateKeyword: string | null;
  categorySerial: string | null;
}): TemplatePriorSummary["rankingRationaleEntries"] {
  const entries: TemplatePriorSummary["rankingRationaleEntries"] = [
    {
      order: 1,
      signal: "template_prior_candidate_order",
      outcome:
        input.templateKeyword && input.categorySerial
          ? `Selected template prior keyword '${input.templateKeyword}' for category ${input.categorySerial} after evaluating ${input.templatePriorCandidates.length} grounded template candidates.`
          : "No template candidate reached a grounded selection state, so direct family evidence remains the dominant fallback.",
      rationale:
        input.templatePriorCandidates
          .map(
            (candidate) =>
              `#${candidate.rank} ${candidate.keyword ?? "null"} via ${candidate.sourceSignal}`,
          )
          .join(" -> ") +
        " keeps the ranking auditable instead of hiding template-prior ordering inside opaque heuristics.",
      evidenceRefs: [...TEMPLATE_PRIOR_EVIDENCE_REFS],
      contextRefs: [...TEMPLATE_PRIOR_CONTEXT_REFS],
    },
    {
      order: 2,
      signal: "contents_theme_family_coverage",
      outcome: input.hasSpringThemeSignal
        ? `Spring contents_theme prior remained explicit across template=${input.selectedContentsThemePrior.template.status}, shape=${input.selectedContentsThemePrior.shape.status}, picture=${input.selectedContentsThemePrior.picture.status}.`
        : "No grounded contents_theme prior was available, so family theme transport stayed supportive-only and unset.",
      rationale: input.hasSpringThemeSignal
        ? "Contents-theme evidence stays first-class for template, shape, and picture families even when this slice only carries supportive serial placeholders."
        : "The builder kept theme transport explicit but null rather than fabricating a contents_theme serial from prompt wording.",
      evidenceRefs: [...CONTENTS_THEME_EVIDENCE_REFS],
      contextRefs: [...CONTENTS_THEME_CONTEXT_REFS],
    },
    {
      order: 3,
      signal: input.photoPreferred
        ? "asset_policy_photo_tie_break"
        : "asset_policy_graphic_weight",
      outcome: input.photoPreferred
        ? "Photo preference stayed a tie-break only while template and shape lanes remained eligible."
        : input.photoAllowed
          ? "Graphic-first policy promoted shape/vector-safe ranking while keeping picture available as an optional lane."
          : "Asset policy kept picture out of the execution lane while preserving picture prior evidence for auditability.",
      rationale: input.photoPreferred
        ? "Preferred photo families can influence comparison order, but they do not override grounded template or shape evidence by default."
        : input.photoAllowed
          ? "Graphic-first primary visual policy preserves shape/vector-heavy success paths instead of silently demoting them behind photo defaults."
          : "Allowed-family and avoid-family semantics were applied as weighting signals, not as hidden deletion of prior evidence.",
      evidenceRefs: [...FAMILY_POLICY_EVIDENCE_REFS],
      contextRefs: [...FAMILY_POLICY_CONTEXT_REFS],
    },
  ];

  if (
    input.intent.domain === "fashion_retail" &&
    input.intent.facets.promotionStyle === "sale_campaign"
  ) {
    entries.push({
      order: entries.length + 1,
      signal: "domain_weighting_fashion_sale",
      outcome:
        "Fashion-retail sale semantics added a tie-break weight toward template and shape priors without turning picture into a banned family.",
      rationale:
        "Domain stays a weighting signal only, so the ranking can prefer coherent fashion-sale cues while keeping picture and mixed-family outcomes available.",
      evidenceRefs: [...DOMAIN_WEIGHT_EVIDENCE_REFS],
      contextRefs: [...DOMAIN_WEIGHT_CONTEXT_REFS],
    });
  }

  return entries;
}

function deriveTemplatePriorKeyword(
  intent: NormalizedIntent,
): string | null {
  if (intent.facets.seasonality === "spring" && hasKeyword(intent, "봄")) {
    return "봄";
  }

  if (intent.facets.promotionStyle === "sale_campaign") {
    return findKeyword(intent, ["세일", "할인", "특가", "쿠폰", "행사"]) ?? "세일";
  }

  if (intent.facets.menuType === "drink_menu") {
    return findKeyword(intent, ["신메뉴", "음료", "커피", "라떼"]) ?? "음료";
  }

  if (intent.facets.menuType === "food_menu") {
    return findKeyword(intent, ["신메뉴", "메뉴", "요리", "브런치"]) ?? "메뉴";
  }

  if (intent.domain === "fashion_retail") {
    return findKeyword(intent, ["패션", "리테일", "의류", "브랜드"]) ?? "패션";
  }

  return intent.searchKeywords[0] ?? null;
}

function deriveTemplateCategorySerial(
  canvasPreset: NormalizedIntent["canvasPreset"],
): string | null {
  if (canvasPreset === "wide_1200x628") {
    return "0006";
  }
  if (canvasPreset === "square_1080" || canvasPreset === "story_1080x1920") {
    return "0002";
  }
  return null;
}

function deriveTemplatePriorStatus(
  intent: NormalizedIntent,
): TemplatePriorSummary["selectedTemplatePrior"]["status"] {
  if (
    intent.templateKind === "seasonal_sale_banner" ||
    intent.canvasPreset === "wide_1200x628"
  ) {
    return "competitive_only";
  }
  return "supportive_only";
}

function buildContentsThemeSelection(
  family: "template" | "shape" | "picture",
  hasSpringThemeSignal: boolean,
  primaryFamilyWeight: boolean,
): TemplatePriorSummary["selectedContentsThemePrior"]["template"] {
  if (!hasSpringThemeSignal) {
    return {
      family,
      status: "unavailable",
      serial: null,
      summary:
        "No grounded seasonal theme hint was present, so contents_theme stayed unresolved for this family.",
      evidenceRefs: [...CONTENTS_THEME_EVIDENCE_REFS],
      contextRefs: [...CONTENTS_THEME_CONTEXT_REFS],
    };
  }

  const familyCount = LOCKED_CONTENTS_THEME_COUNTS[family];
  return {
    family,
    status: "supportive_only",
    serial: null,
    summary:
      primaryFamilyWeight
        ? `Spring theme evidence remains available for ${family} (locked active families=${familyCount}), but this slice does not resolve a concrete contents_theme serial yet.`
        : `Spring theme evidence remains supportive for ${family} (locked active families=${familyCount}) until a concrete contents_theme serial is hydrated.`,
    evidenceRefs: [...CONTENTS_THEME_EVIDENCE_REFS],
    contextRefs: [...CONTENTS_THEME_CONTEXT_REFS],
  };
}

function buildContentsThemePriorMatches(
  hasSpringThemeSignal: boolean,
  photoAllowed: boolean,
  photoPreferred: boolean,
): TemplatePriorSummary["contentsThemePriorMatches"] {
  if (!hasSpringThemeSignal) {
    return [];
  }

  return [
    {
      family: "template",
      signal: "seasonality:spring",
      strength: "supporting",
      summary:
        "Spring meaning can reinforce template keyword/theme match, but the template surface still requires keyword/category grounding instead of a direct theme field.",
      evidenceRefs: [...CONTENTS_THEME_EVIDENCE_REFS],
    },
    {
      family: "shape",
      signal: "seasonality:spring",
      strength: photoPreferred ? "supporting" : "primary",
      summary:
        `Shape contents_theme stays first-class for spring runs, backed by ${LOCKED_SPRING_INVENTORY_COUNTS.shape} active spring shape assets and locked theme-family coverage.`,
      evidenceRefs: [...CONTENTS_THEME_EVIDENCE_REFS],
    },
    {
      family: "picture",
      signal: photoAllowed ? "seasonality:spring" : "seasonality:spring_optional",
      strength: photoPreferred && photoAllowed ? "primary" : "supporting",
      summary:
        photoAllowed
          ? `Picture contents_theme remains available for spring runs, backed by ${LOCKED_SPRING_INVENTORY_COUNTS.picture} active spring pictures even when photo is not forced.`
          : "Picture contents_theme remains auditable for spring runs, but current family policy keeps it non-controlling.",
      evidenceRefs: [...CONTENTS_THEME_EVIDENCE_REFS],
    },
  ];
}

function buildKeywordThemeMatches(
  intent: NormalizedIntent,
  templateKeyword: string | null,
  categorySerial: string | null,
  photoAllowed: boolean,
): TemplatePriorSummary["keywordThemeMatches"] {
  if (!templateKeyword) {
    return [];
  }

  const matches: TemplatePriorSummary["keywordThemeMatches"] = [
    {
      family: "template",
      signal: `template_keyword:${templateKeyword}`,
      strength: categorySerial === "0006" ? "primary" : "supporting",
      summary:
        categorySerial === "0006"
          ? `Template prior can bridge '${templateKeyword}' directly into Tooldi web-banner retrieval through category 0006.`
          : `Template prior can bridge '${templateKeyword}' into the poster-compatible template surface without inventing a theme transport field.`,
      evidenceRefs: [
        ...TEMPLATE_PRIOR_EVIDENCE_REFS,
        "tooldi-agent-workflow-v1-tooldi-content-discovery.md:534",
      ],
    },
  ];

  if (hasKeyword(intent, "봄")) {
    matches.push({
      family: "shape",
      signal: "shape_keyword:봄",
      strength: "supporting",
      summary:
        `Spring keyword grounding keeps shape/vector lanes competitive with ${LOCKED_SPRING_INVENTORY_COUNTS.shape} active seasonal shape assets.`,
      evidenceRefs: [
        "tooldi-agent-workflow-v1-tooldi-content-discovery.md:123",
        "tooldi-agent-workflow-v1-tooldi-content-discovery.md:534",
      ],
    });
  }

  if (photoAllowed && hasKeyword(intent, "봄")) {
    matches.push({
      family: "picture",
      signal: "picture_keyword:봄",
      strength: "supporting",
      summary:
        `Spring keyword grounding preserves an optional photo lane with ${LOCKED_SPRING_INVENTORY_COUNTS.picture} active seasonal picture assets.`,
      evidenceRefs: [
        "tooldi-agent-workflow-v1-tooldi-content-discovery.md:123",
        "tooldi-agent-workflow-v1-create-template-hardening-source-grounded-to-be.md:170",
      ],
    });
  }

  return matches;
}

function determineDominantThemePrior(
  templatePriorStatus: TemplatePriorSummary["selectedTemplatePrior"]["status"],
  contentsThemeMatchCount: number,
): TemplatePriorSummary["dominantThemePrior"] {
  if (templatePriorStatus !== "unavailable") {
    return "template_prior";
  }
  if (contentsThemeMatchCount > 0) {
    return "contents_theme_prior";
  }
  return "none";
}

function buildRankingBiases(
  intent: NormalizedIntent,
  hasSpringThemeSignal: boolean,
  photoAllowed: boolean,
  photoPreferred: boolean,
  templatePriorStatus: TemplatePriorSummary["selectedTemplatePrior"]["status"],
): TemplatePriorSummary["rankingBiases"] {
  const biases: TemplatePriorSummary["rankingBiases"] = [];

  if (templatePriorStatus !== "unavailable") {
    biases.push({
      bias: "template_query_surface_alignment",
      effect: "promote",
      rationale:
        "Real Tooldi template retrieval accepts keyword, canvas, and categorySerial, so canonical template prior remains visible before direct asset selection.",
    });
  }

  if (hasSpringThemeSignal) {
    biases.push({
      bias: "spring_contents_theme_availability",
      effect: "supportive_only",
      rationale:
        `Locked contents_theme family coverage (template=${LOCKED_CONTENTS_THEME_COUNTS.template}, shape=${LOCKED_CONTENTS_THEME_COUNTS.shape}, picture=${LOCKED_CONTENTS_THEME_COUNTS.picture}) stays auditable even before concrete serial hydration.`,
    });
  }

  biases.push({
    bias: photoPreferred ? "photo_lane_optional_weight" : "shape_lane_stable_weight",
    effect: photoPreferred ? "tie_break" : "promote",
    rationale: photoPreferred
      ? "Photo preference stays a soft ranking signal only; the prior summary does not ban graphic or shape-heavy outcomes."
      : "Graphic-first policy keeps shape/vector-heavy outcomes on the normal success path instead of demoting them behind photo defaults.",
  });

  if (!photoAllowed) {
    biases.push({
      bias: "photo_lane_not_executed",
      effect: "supportive_only",
      rationale:
        "Picture prior evidence remains visible for auditability, but current family policy keeps it out of the dominant execution lane.",
    });
  }

  if (
    intent.domain === "fashion_retail" &&
    intent.facets.promotionStyle === "sale_campaign"
  ) {
    biases.push({
      bias: "fashion_sale_domain_weight",
      effect: "tie_break",
      rationale:
        "Fashion-retail sale semantics weight template and shape priors without rigidly banning picture families.",
    });
  }

  return biases;
}

function buildSummary(
  intent: NormalizedIntent,
  templateKeyword: string | null,
  categorySerial: string | null,
  dominantThemePrior: TemplatePriorSummary["dominantThemePrior"],
  hasSpringThemeSignal: boolean,
): string {
  if (!templateKeyword || !categorySerial) {
    return "No grounded lightweight template prior could be derived from canonical intent, so direct family evidence remains dominant.";
  }

  return (
    `Lightweight prior summary kept ${dominantThemePrior} visible via template keyword '${templateKeyword}' ` +
    `and category ${categorySerial} for ${intent.domain}; ` +
    (hasSpringThemeSignal
      ? "spring contents_theme availability stayed supportive-only until concrete serial hydration."
      : "no grounded contents_theme serial was available in this slice.")
  );
}

function hasKeyword(intent: NormalizedIntent, keyword: string): boolean {
  return intent.searchKeywords.some((value) => normalizeKeyword(value) === keyword);
}

function findKeyword(
  intent: NormalizedIntent,
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    if (hasKeyword(intent, normalizeKeyword(candidate))) {
      return normalizeKeyword(candidate);
    }
  }

  return null;
}

function normalizeKeyword(value: string): string {
  return value.trim().replace(/[^\p{L}\p{N}]/gu, "");
}
