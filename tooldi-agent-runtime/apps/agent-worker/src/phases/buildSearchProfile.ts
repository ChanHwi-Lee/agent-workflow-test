import { createRequestId } from "@tooldi/agent-domain";
import type { TemplatePriorSummary } from "@tooldi/agent-contracts";
import {
  normalizeTemplateAssetPolicy,
  templateAssetPolicyAllowsFamily,
  templateAssetPolicyPrefersPhoto,
} from "@tooldi/agent-llm";

import type { NormalizedIntent, SearchProfileArtifact } from "../types.js";

const RETAIL_MENU_CONTRADICTION_FLAG_CODES = new Set([
  "fashion_menu_photo_contradiction",
  "menu_type_domain_conflict",
  "promotion_style_domain_conflict",
  "search_keyword_subject_drift",
]);

export async function buildSearchProfile(
  intent: NormalizedIntent,
  templatePriorSummary?: TemplatePriorSummary | null,
): Promise<SearchProfileArtifact> {
  const assetPolicy = normalizeTemplateAssetPolicy(intent.assetPolicy);
  const genericPromoIntent = isGenericPromoIntent(intent);
  const retailMenuContradiction = hasFashionRetailMenuContradiction(intent);
  const templatePriorKeyword = deriveTemplatePriorKeyword(templatePriorSummary);
  const seasonKeyword = deriveSeasonKeyword(intent);
  const subjectKeyword = deriveSubjectKeyword(
    intent,
    retailMenuContradiction,
    genericPromoIntent,
  );
  const promotionKeyword = derivePromotionKeyword(
    intent,
    retailMenuContradiction,
    genericPromoIntent,
  );
  const orientationHint = deriveOrientationHint(intent.canvasPreset);
  const photoFormat = derivePhotoFormat(orientationHint);
  const photoTheme = derivePhotoTheme(templatePriorSummary);
  const shapeTheme = deriveShapeTheme(templatePriorSummary);
  const shapeMethodResolution = deriveShapeMethod(intent);
  const shapeTypePlan = deriveShapeTypePlan(intent);
  const fontLanguage = deriveFontLanguage(intent);
  const fontCategoryPlan = deriveFontCategoryPlan(intent);
  const fontWeightPlan = deriveFontWeightPlan(intent);
  const photoPreferred = templateAssetPolicyPrefersPhoto(assetPolicy);
  const photoEnabled = templateAssetPolicyAllowsFamily(assetPolicy, "photo");
  const photoType = photoEnabled
    ? derivePhotoType(intent)
    : null;
  const backgroundKeyword =
    seasonKeyword ??
    promotionKeyword ??
    subjectKeyword ??
    templatePriorKeyword ??
    firstKeyword(intent);
  const graphicKeyword =
    promotionKeyword ?? subjectKeyword ?? templatePriorKeyword ?? backgroundKeyword;
  const photoKeyword =
    genericPromoIntent
      ? promotionKeyword ?? seasonKeyword ?? templatePriorKeyword ?? backgroundKeyword
      : retailMenuContradiction
      ? photoPreferred
        ? subjectKeyword ?? promotionKeyword ?? templatePriorKeyword ?? backgroundKeyword
        : promotionKeyword ?? subjectKeyword ?? templatePriorKeyword ?? backgroundKeyword
      : intent.facets.menuType !== null
      ? subjectKeyword ?? promotionKeyword ?? templatePriorKeyword ?? backgroundKeyword
      : photoPreferred
      ? subjectKeyword ?? promotionKeyword ?? templatePriorKeyword ?? backgroundKeyword
      : promotionKeyword ?? subjectKeyword ?? templatePriorKeyword ?? backgroundKeyword;
  const pricePreference = derivePricePreference(intent, templatePriorSummary);
  const ownerBias = deriveOwnerBias(intent, templatePriorSummary);
  const graphicCategoryName = deriveGraphicCategoryName(intent, shapeTypePlan);
  const shapeQueries = buildShapeQueries({
    primaryKeyword: graphicKeyword,
    subjectKeyword,
    templatePriorKeyword,
    seasonalKeyword: seasonKeyword ?? firstKeyword(intent),
    theme: shapeTheme,
    typePlan: shapeTypePlan,
    method: shapeMethodResolution.value,
    price: pricePreference,
    ownerBias,
    categoryName: graphicCategoryName,
  });

  return {
    profileId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    plannerMode: intent.plannerMode,
    templateKind: intent.templateKind,
    domain: intent.domain,
    audience: intent.audience,
    campaignGoal: intent.campaignGoal,
    canvasPreset: intent.canvasPreset,
    layoutIntent: intent.layoutIntent,
    tone: intent.tone,
    assetPolicy,
    searchKeywords: [...intent.searchKeywords],
    facets: intent.facets,
    summary:
      `${intent.domain} create-template search profile for ${intent.campaignGoal} ` +
      `using ${intent.searchKeywords.join(", ")}` +
      (templatePriorKeyword
        ? `; template prior keyword=${templatePriorKeyword}`
        : "") +
      (retailMenuContradiction
        ? "; retail/menu contradiction was repaired into fashion-weighted query cues before serialization"
        : ""),
    background: {
      objective: "seasonal_backdrop",
      rationale:
        backgroundKeyword === "봄"
          ? "Seasonality drives the backdrop search first"
          : "Fallback backdrop search uses the strongest available subject keyword",
      queries: [
        {
          label: "background_pattern_primary",
          type: "pattern",
          keyword: backgroundKeyword,
          source: "search",
        },
        {
          label: "background_image_secondary",
          type: "image",
          keyword: backgroundKeyword,
          source: "search",
        },
        {
          label: "background_pattern_fallback",
          type: "pattern",
          keyword: null,
          source: "initial_load",
        },
      ],
    },
    graphic: {
      objective: "supporting_promotional_graphics",
      rationale:
        buildShapeRationale({
          hasPromotionKeyword: promotionKeyword !== null,
          shapeTheme,
          shapeMethod: shapeMethodResolution.value,
          methodConflict: shapeMethodResolution.conflicted,
          typePlan: shapeTypePlan,
        }) +
        (retailMenuContradiction
          ? " Retail/menu contradiction was repaired before shape-query serialization, so fashion-retail promotional cues stay ahead of menu taxonomy."
          : ""),
      queries: shapeQueries,
    },
    photo: {
      enabled: photoEnabled,
      objective: "hero_visual_candidate",
      rationale:
        (photoPreferred
          ? "Photo is preferred for this intent when a safe hero candidate exists; real picture query fields stay aligned to Tooldi direct picture theme/type/format surfaces"
          : photoEnabled
            ? photoTheme !== null
              ? "Photo remains optional and uses a grounded contents_theme serial on the direct picture transport when one exists."
              : "Photo remains optional and should only win when it fits the composition safely; no grounded contents_theme serial is available for this profile."
            : "Photo is currently de-emphasized by the asset policy and remains disabled for this profile") +
        (retailMenuContradiction
          ? " Retail/menu contradiction was repaired before picture-query serialization, so menu-taxonomy cues were demoted in favor of fashion-retail signals."
          : ""),
      orientationHint,
      queries: photoEnabled
        ? [
            {
              label: "photo_primary_keyword",
              keyword: photoKeyword,
              theme: photoTheme,
              type: photoType,
              format: photoFormat,
              price: pricePreference,
              ownerBias,
              source: "search",
              transportApplied: {
                keyword: photoKeyword !== null,
                theme: photoTheme !== null,
                type: photoType !== null,
                format: photoFormat !== null,
                price: pricePreference !== null,
                owner: ownerBias !== null,
                source: true,
              },
            },
            {
              label: "photo_seasonal_fallback",
              keyword: seasonKeyword ?? backgroundKeyword,
              theme: null,
              type: photoType,
              format: photoFormat,
              price: pricePreference,
              ownerBias,
              source: "search",
              transportApplied: {
                keyword: (seasonKeyword ?? backgroundKeyword) !== null,
                theme: false,
                type: photoType !== null,
                format: photoFormat !== null,
                price: pricePreference !== null,
                owner: ownerBias !== null,
                source: true,
              },
            },
            {
              label: "photo_format_fallback",
              keyword: null,
              theme: null,
              type: photoType,
              format: photoFormat,
              price: pricePreference,
              ownerBias,
              source: "initial_load",
              transportApplied: {
                keyword: false,
                theme: false,
                type: photoType !== null,
                format: photoFormat !== null,
                price: pricePreference !== null,
                owner: ownerBias !== null,
                source: true,
              },
            },
          ]
        : [],
    },
    font: {
      objective: "readable_korean_promotional_typography",
      rationale: buildFontRationale(fontLanguage, fontCategoryPlan, fontWeightPlan),
      sourceSurface: "Editor::loadFont",
      typographyHint: intent.brandConstraints.typographyHint,
      language: fontLanguage,
      category: fontCategoryPlan,
      weight: fontWeightPlan,
    },
  };
}

function deriveTemplatePriorKeyword(
  templatePriorSummary?: TemplatePriorSummary | null,
): string | null {
  return templatePriorSummary?.selectedTemplatePrior.keyword ?? null;
}

function hasFashionRetailMenuContradiction(intent: NormalizedIntent): boolean {
  if (intent.domain !== "fashion_retail") {
    return false;
  }

  if (
    intent.facets.menuType !== null ||
    intent.facets.promotionStyle === "seasonal_menu_launch" ||
    intent.campaignGoal === "menu_discovery"
  ) {
    return true;
  }

  if (
    intent.consistencyFlags.some((flag) =>
      RETAIL_MENU_CONTRADICTION_FLAG_CODES.has(flag.code),
    )
  ) {
    return true;
  }

  return [intent.goalSummary, ...intent.searchKeywords].some((text) =>
    hasMenuSignal(text),
  );
}

function isGenericPromoIntent(intent: NormalizedIntent): boolean {
  return (
    intent.domain === "general_marketing" &&
    intent.facets.menuType === null &&
    (intent.facets.promotionStyle === "sale_campaign" ||
      intent.facets.promotionStyle === "general_campaign")
  );
}

function hasMenuSignal(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }

  return /메뉴|menu|브런치|brunch|요리|식사|런치|푸드|food|다이닝|dining/i.test(
    text,
  );
}

function deriveSeasonKeyword(intent: NormalizedIntent): string | null {
  if (intent.facets.seasonality !== "spring") {
    return null;
  }

  return findKeyword(intent, ["봄"]) ?? "봄";
}

function deriveSubjectKeyword(
  intent: NormalizedIntent,
  retailMenuContradiction: boolean,
  genericPromoIntent: boolean,
): string | null {
  if (genericPromoIntent) {
    return null;
  }

  if (retailMenuContradiction) {
    return (
      findKeyword(intent, [
        "패션",
        "리테일",
        "의류",
        "쇼핑",
        "스타일",
        "브랜드",
      ]) ?? "패션"
    );
  }

  if (intent.facets.menuType === "food_menu") {
    return (
      findKeyword(intent, ["메뉴", "브런치", "요리", "식사", "런치"]) ??
      "메뉴"
    );
  }
  if (intent.facets.menuType === "drink_menu") {
    return (
      findKeyword(intent, [
        "음료",
        "커피",
        "콜드브루",
        "라떼",
        "에이드",
        "차",
        "티",
      ]) ?? "음료"
    );
  }
  if (intent.domain === "fashion_retail") {
    return (
      findKeyword(intent, [
        "패션",
        "리테일",
        "의류",
        "쇼핑",
        "스타일",
        "브랜드",
      ]) ?? "패션"
    );
  }

  return firstKeywordMatching(intent, (keyword) => !isSeasonKeyword(keyword));
}

function derivePromotionKeyword(
  intent: NormalizedIntent,
  retailMenuContradiction: boolean,
  genericPromoIntent: boolean,
): string | null {
  if (genericPromoIntent) {
    return (
      findKeyword(intent, [
        "세일",
        "할인",
        "특가",
        "쿠폰",
        "행사",
        "이벤트",
        "오픈",
        "프로모션",
      ]) ??
      firstKeywordMatching(
        intent,
        (keyword) =>
          !isSeasonKeyword(keyword) &&
          !hasMenuSignal(keyword) &&
          !/패션|리테일|의류|식당|레스토랑|카페/i.test(keyword),
      )
    );
  }

  if (retailMenuContradiction) {
    return (
      findKeyword(intent, [
        "세일",
        "할인",
        "특가",
        "쿠폰",
        "행사",
        "프로모션",
        "신제품",
        "신상",
        "출시",
        "런칭",
        "론칭",
        "홍보",
      ]) ?? "세일"
    );
  }

  switch (intent.facets.promotionStyle) {
    case "seasonal_menu_launch":
      return (
        findKeyword(intent, [
          "신메뉴",
          "시즌메뉴",
          "계절메뉴",
          "출시",
          "런칭",
          "론칭",
        ]) ?? "신메뉴"
      );
    case "new_product_promo":
      return (
        findKeyword(intent, [
          "프로모션",
          "신제품",
          "신상",
          "출시",
          "런칭",
          "론칭",
          "홍보",
        ]) ?? "프로모션"
      );
    case "sale_campaign":
      return findKeyword(intent, ["세일", "할인", "특가", "쿠폰", "행사"]) ?? "세일";
    case "general_campaign":
      return null;
  }
}

function deriveOrientationHint(
  canvasPreset: NormalizedIntent["canvasPreset"],
): SearchProfileArtifact["photo"]["orientationHint"] {
  if (canvasPreset === "wide_1200x628") {
    return "landscape";
  }
  if (canvasPreset === "story_1080x1920") {
    return "portrait";
  }
  if (canvasPreset === "square_1080") {
    return "square";
  }
  return null;
}

function derivePhotoFormat(
  orientationHint: SearchProfileArtifact["photo"]["orientationHint"],
): SearchProfileArtifact["photo"]["queries"][number]["format"] {
  if (orientationHint === "landscape") {
    return "horizontal";
  }
  if (orientationHint === "portrait") {
    return "vertical";
  }
  if (orientationHint === "square") {
    return "square";
  }
  return null;
}

function derivePhotoTheme(
  templatePriorSummary?: TemplatePriorSummary | null,
): SearchProfileArtifact["photo"]["queries"][number]["theme"] {
  return templatePriorSummary?.selectedContentsThemePrior.picture.serial ?? null;
}

function deriveShapeTheme(
  templatePriorSummary?: TemplatePriorSummary | null,
): SearchProfileArtifact["graphic"]["queries"][number]["theme"] {
  return templatePriorSummary?.selectedContentsThemePrior.shape.serial ?? null;
}

function derivePhotoType(
  intent: NormalizedIntent,
): SearchProfileArtifact["photo"]["queries"][number]["type"] {
  const isolatedHeroEligible =
    intent.layoutIntent === "hero_focused" &&
    intent.campaignGoal === "product_trial" &&
    intent.facets.offerSpecificity === "single_product";

  return isolatedHeroEligible ? "rmbg" : "pic";
}

function buildShapeQueries(input: {
  primaryKeyword: string | null;
  subjectKeyword: string | null;
  templatePriorKeyword: string | null;
  seasonalKeyword: string | null;
  theme: SearchProfileArtifact["graphic"]["queries"][number]["theme"];
  typePlan: ShapeTypePlan;
  method: SearchProfileArtifact["graphic"]["queries"][number]["method"];
  price: SearchProfileArtifact["graphic"]["queries"][number]["price"];
  ownerBias: SearchProfileArtifact["graphic"]["queries"][number]["ownerBias"];
  categoryName: SearchProfileArtifact["graphic"]["queries"][number]["categoryName"];
}): SearchProfileArtifact["graphic"]["queries"] {
  const queries: SearchProfileArtifact["graphic"]["queries"] = [];
  const seenSignatures = new Set<string>();
  const pushQuery = (
    label: string,
    keyword: string | null,
    type: SearchProfileArtifact["graphic"]["queries"][number]["type"],
  ) => {
    const signature = `${keyword ?? "null"}|${input.theme ?? "null"}|${type ?? "null"}|${input.method ?? "null"}|${input.price ?? "null"}|${input.ownerBias ?? "null"}|${input.categoryName ?? "null"}`;
    if (seenSignatures.has(signature)) {
      return;
    }
    seenSignatures.add(signature);
    queries.push({
      label,
      keyword,
      theme: input.theme,
      type,
      method: input.method,
      price: input.price,
      ownerBias: input.ownerBias,
      categoryName: input.categoryName,
      transportApplied: {
        keyword: keyword !== null,
        theme: input.theme !== null,
        type: type !== null,
        method: input.method !== null,
        price: input.price !== null,
        owner: input.ownerBias !== null,
        categoryName: input.categoryName !== null,
      },
    });
  };

  pushQuery("shape_primary_keyword", input.primaryKeyword, input.typePlan.primaryType);

  for (const alternateType of input.typePlan.alternateTypes) {
    pushQuery("shape_primary_type_repair", input.primaryKeyword, alternateType);
  }

  pushQuery(
    "shape_template_prior_support",
    input.templatePriorKeyword,
    input.typePlan.primaryType,
  );
  pushQuery(
    "shape_subject_fallback",
    input.subjectKeyword,
    input.typePlan.primaryType,
  );
  pushQuery(
    "shape_seasonal_fallback",
    input.seasonalKeyword,
    input.typePlan.primaryType,
  );

  return queries;
}

interface ShapeTypePlan {
  primaryType: SearchProfileArtifact["graphic"]["queries"][number]["type"];
  alternateTypes: SearchProfileArtifact["graphic"]["queries"][number]["type"][];
  conflicted: boolean;
}

function deriveShapeTypePlan(intent: NormalizedIntent): ShapeTypePlan {
  const signalText = [intent.goalSummary, ...intent.searchKeywords].join(" ");
  let vectorScore = 0;
  let bitmapScore = 0;

  if (intent.layoutIntent === "badge_led") {
    vectorScore += 1;
  }
  if (intent.templateKind === "seasonal_sale_banner") {
    vectorScore += 1;
  }
  if (intent.domain === "fashion_retail") {
    vectorScore += 1;
  }

  if (
    /벡터|아이콘|로고|도형|패턴|프레임|라인|워드아트|일러스트|illust|icon/i.test(
      signalText,
    )
  ) {
    vectorScore += 2;
  }
  if (
    /비트맵|텍스처|질감|브러시|콜라주|스티커|bitmap|texture|collage/i.test(
      signalText,
    )
  ) {
    bitmapScore += 2;
  }
  if (/캘리그라피|calligraphy/i.test(signalText)) {
    vectorScore += 1;
    bitmapScore += 1;
  }

  const conflicted = vectorScore > 0 && bitmapScore > 0;
  if (bitmapScore > vectorScore) {
    return {
      primaryType: "bitmap",
      alternateTypes: conflicted ? ["vector"] : [],
      conflicted,
    };
  }

  return {
    primaryType: "vector",
    alternateTypes: conflicted ? ["bitmap"] : [],
    conflicted,
  };
}

function deriveShapeMethod(intent: NormalizedIntent): {
  value: SearchProfileArtifact["graphic"]["queries"][number]["method"];
  conflicted: boolean;
} {
  const signalText = [intent.goalSummary, ...intent.searchKeywords].join(" ");
  const wantsAi =
    /\bai\b|ai생성|생성형|자동생성|제너레이티브/i.test(signalText);
  const wantsCreator =
    /크리에이터|작가|핸드메이드|수작업|직접 만든|creator/i.test(signalText);

  if (wantsAi && wantsCreator) {
    return {
      value: null,
      conflicted: true,
    };
  }
  if (wantsAi) {
    return {
      value: "ai",
      conflicted: false,
    };
  }
  if (wantsCreator) {
    return {
      value: "creator",
      conflicted: false,
    };
  }

  return {
    value: null,
    conflicted: false,
  };
}

function buildShapeRationale(input: {
  hasPromotionKeyword: boolean;
  shapeTheme: SearchProfileArtifact["graphic"]["queries"][number]["theme"];
  shapeMethod: SearchProfileArtifact["graphic"]["queries"][number]["method"];
  methodConflict: boolean;
  typePlan: ShapeTypePlan;
}): string {
  const rationaleParts = [
    input.hasPromotionKeyword
      ? "Shape search keeps the repaired promotional keyword but serializes only canonical Shape::index fields."
      : "Shape search falls back to repaired subject keywords while staying on canonical Shape::index fields.",
    input.shapeTheme === null
      ? "No grounded contents_theme serial is available for the current direct shape query plan."
      : "A grounded shape theme prior was carried into the direct shape query transport.",
    input.shapeMethod === null
      ? input.methodConflict
        ? "Conflicting AI and creator origin cues were neutralized so method remains open."
        : "Method stays omitted until canonical intent carries an explicit origin preference."
      : `Method is constrained to ${input.shapeMethod} from explicit origin cues.`,
    input.typePlan.conflicted
      ? `Mixed vector and bitmap cues were preserved as ordered type attempts, starting with ${input.typePlan.primaryType}.`
      : `Type is constrained to ${input.typePlan.primaryType} from repaired shape-execution signals.`,
  ];

  return rationaleParts.join(" ");
}

function derivePricePreference(
  _intent: NormalizedIntent,
  _templatePriorSummary?: TemplatePriorSummary | null,
): "free" | "paid" | null {
  return null;
}

function deriveOwnerBias(
  _intent: NormalizedIntent,
  _templatePriorSummary?: TemplatePriorSummary | null,
): "follow" | null {
  return null;
}

function deriveGraphicCategoryName(
  intent: NormalizedIntent,
  shapeTypePlan: ShapeTypePlan,
): string | null {
  const signalText = [intent.goalSummary, ...intent.searchKeywords].join(" ");
  if (/캘리그라피|calligraphy/i.test(signalText)) {
    return "calligraphy";
  }
  if (/아이콘|icon/i.test(signalText)) {
    return "icon";
  }
  if (/프레임|frame/i.test(signalText)) {
    return "frame";
  }
  if (shapeTypePlan.primaryType === "bitmap") {
    return "bitmap";
  }
  if (shapeTypePlan.primaryType === "vector") {
    return "illust";
  }
  return null;
}

type FontCategoryAttempt =
  SearchProfileArtifact["font"]["category"]["attempts"][number];

function deriveFontLanguage(
  _intent: NormalizedIntent,
): SearchProfileArtifact["font"]["language"] {
  return {
    value: "KOR",
    rationale:
      "Current create_template copy and brand context are Korean-first, so inventory eligibility filters for fonts whose supportedLanguages include KOR while fontLanguage remains a tie-break signal only.",
  };
}

function deriveFontCategoryPlan(
  intent: NormalizedIntent,
): SearchProfileArtifact["font"]["category"] {
  const signalText = [
    intent.brandConstraints.typographyHint ?? "",
    intent.goalSummary,
    ...intent.searchKeywords,
  ].join(" ");
  const attempts: FontCategoryAttempt[] = [];
  const pushAttempt = (category: FontCategoryAttempt) => {
    if (!attempts.includes(category)) {
      attempts.push(category);
    }
  };

  let primaryReason =
    "No explicit typography category cue was repaired, so the category order defaults to readable 고딕 first and then relaxes through the remaining Tooldi labels.";
  if (/손글씨|캘리|handwrit|script/i.test(signalText)) {
    pushAttempt("손글씨");
    primaryReason =
      "Handwritten typography cues were repaired into a 손글씨-first category attempt before broader readable fallbacks.";
  } else if (/명조|serif|에디토리얼|editorial/i.test(signalText)) {
    pushAttempt("명조");
    primaryReason =
      "Serif or editorial typography cues were repaired into a 명조-first category attempt before broader readable fallbacks.";
  } else if (/고딕|sans|산세리프|둥근|가독|readable|명확|혜택|가격/i.test(signalText)) {
    pushAttempt("고딕");
    primaryReason =
      "Readable, sans-like, or promotional clarity cues were repaired into a 고딕-first category attempt.";
  } else {
    pushAttempt("고딕");
  }

  for (const category of ["고딕", "명조", "손글씨"] as const) {
    pushAttempt(category);
  }

  return {
    attempts,
    rationale:
      `${primaryReason} Category fallback remains restricted to the real Tooldi labels ` +
      `${attempts.join(" -> ")}.`,
  };
}

function deriveFontWeightPlan(
  intent: NormalizedIntent,
): SearchProfileArtifact["font"]["weight"] {
  const displayTarget = intent.requiredSlots.includes("headline") ? 700 : 600;
  const bodyTarget = intent.requiredSlots.includes("supporting_copy")
    ? intent.layoutIntent === "copy_focused"
      ? 500
      : 400
    : null;

  return {
    displayTarget,
    bodyTarget,
    rationale:
      bodyTarget === null
        ? `Headline emphasis targets ${displayTarget}, and no supporting-copy slot requires a secondary body weight. Weight resolution falls back to the nearest available value from fontWeights[].fontWeight or convertWeight.`
        : `Headline emphasis targets ${displayTarget}, while supporting copy targets ${bodyTarget} for ${intent.layoutIntent} layouts. Weight resolution falls back to the nearest available value from fontWeights[].fontWeight or convertWeight.`,
  };
}

function buildFontRationale(
  language: SearchProfileArtifact["font"]["language"],
  category: SearchProfileArtifact["font"]["category"],
  weight: SearchProfileArtifact["font"]["weight"],
): string {
  return (
    "Font retrieval uses Editor::loadFont inventory rather than a standalone font search surface. " +
    `Apply ${language.value} eligibility first, then rank categories as ${category.attempts.join(" -> ")}, ` +
    `then resolve display/body targets ${weight.displayTarget}/${weight.bodyTarget ?? "n/a"} ` +
    "against the nearest available inventory weights."
  );
}

function firstKeyword(intent: NormalizedIntent): string | null {
  return intent.searchKeywords[0] ?? null;
}

function findKeyword(
  intent: NormalizedIntent,
  candidates: string[],
): string | null {
  const candidateSet = new Set(candidates);

  return (
    firstKeywordMatching(intent, (keyword) => candidateSet.has(keyword)) ?? null
  );
}

function firstKeywordMatching(
  intent: NormalizedIntent,
  predicate: (keyword: string) => boolean,
): string | null {
  return intent.searchKeywords.find((keyword) => predicate(keyword)) ?? null;
}

function isSeasonKeyword(keyword: string): boolean {
  return keyword === "봄";
}
