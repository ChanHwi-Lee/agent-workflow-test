import { createRequestId } from "@tooldi/agent-domain";

import type {
  NormalizedIntent,
  SceneBindingPlan,
  SceneCtaShapeLanguage,
  SceneLayoutPlan,
  SceneMotifTag,
  ScenePalettePolicy,
  SceneStylePlan,
  SceneTypographyCategoryHint,
  SceneTypographyPolicy,
  SceneTypographyTone,
  TemplatePriorBundle,
} from "../types.js";
import {
  calculateRelativeLuminance,
  normalizeHexColor,
} from "./mutationReadabilityPolicy.js";

type CanvasObject = Record<string, unknown>;

export function buildSceneStylePlans(
  intent: NormalizedIntent,
  templatePriorBundle: TemplatePriorBundle | null,
  sceneLayoutPlan: SceneLayoutPlan | null,
): {
  sceneStylePlan: SceneStylePlan | null;
  sceneBindingPlan: SceneBindingPlan | null;
} {
  const selectedTemplateCode = templatePriorBundle?.selectedTemplateCode ?? null;
  const selectedTemplateTitle = templatePriorBundle?.selectedTemplateTitle ?? null;
  if (!templatePriorBundle || !selectedTemplateCode || !selectedTemplateTitle) {
    return {
      sceneStylePlan: null,
      sceneBindingPlan: null,
    };
  }

  const selectedCandidate = templatePriorBundle.candidates.find(
    (candidate) => candidate.templateCode === selectedTemplateCode,
  );
  const firstPage = readFirstParsedPage(selectedCandidate?.fetchedDocument ?? null);
  if (!firstPage) {
    return {
      sceneStylePlan: null,
      sceneBindingPlan: null,
    };
  }

  const flattenedObjects = flattenObjects(readObjectArray(firstPage.objects));
  const textObjects = flattenedObjects.filter(isTextLikeObject);
  const nonTextObjects = flattenedObjects.filter((object) => !isTextLikeObject(object));
  const canvasWidth = asNumber(firstPage.width);
  const canvasHeight = asNumber(firstPage.height);
  const backgroundKind = resolveBackgroundKind(firstPage);
  const palettePolicy = extractPalettePolicy(
    firstPage,
    textObjects,
    nonTextObjects,
    intent.backgroundColorHex ?? "#ffffff",
    canvasWidth,
    canvasHeight,
  );
  const motifTags = extractMotifTags(selectedCandidate, firstPage, flattenedObjects);
  const ctaShapeLanguage = resolveCtaShapeLanguage(
    firstPage,
    flattenedObjects,
    canvasWidth,
    canvasHeight,
  );
  const promoSurfaceColorHex = detectPromoSurfaceColor(
    nonTextObjects,
    canvasWidth,
    canvasHeight,
  );
  const promoTextColorHex = detectPromoTextColor(
    textObjects,
    promoSurfaceColorHex,
    canvasWidth,
    canvasHeight,
  );
  const badgeLikeTreatment =
    motifTags.includes("coupon") ||
    motifTags.includes("ribbon") ||
    detectBadgeLikeLabel(textObjects, canvasHeight);
  const typographyPolicy = extractTypographyPolicy(textObjects, motifTags);

  const sceneStylePlan: SceneStylePlan = {
    planId: createRequestId(),
    runId: intent.runId,
    traceId: intent.traceId,
    workflowVariant: templatePriorBundle.workflowVariant,
    selectedTemplateCode,
    selectedTemplateTitle,
    backgroundKind,
    palettePolicy,
    typographyPolicy,
    motifTags,
    ctaShapeLanguage,
    badgeLikeTreatment,
    promoSurfaceColorHex,
    promoTextColorHex,
    summary:
      `Scene style extracted palette/background/typography from template ${selectedTemplateCode} ` +
      `with ${motifTags.length} motif tags and ${ctaShapeLanguage} CTA treatment.`,
  };

  const sceneBindingPlan = buildSceneBindingPlan(
    sceneStylePlan,
    sceneLayoutPlan,
  );

  return {
    sceneStylePlan,
    sceneBindingPlan,
  };
}

function buildSceneBindingPlan(
  sceneStylePlan: SceneStylePlan,
  sceneLayoutPlan: SceneLayoutPlan | null,
): SceneBindingPlan {
  const preferredDecorationMode = resolvePreferredDecorationMode(
    sceneStylePlan.motifTags,
    sceneLayoutPlan?.primaryVisualFamily ?? "graphic",
  );
  const preferredBadgeProminence = sceneStylePlan.badgeLikeTreatment
    ? "dominant"
    : sceneLayoutPlan?.layoutFamily === "promo_badge"
      ? "supporting"
      : "none";
  const preferredCtaTreatment = resolvePreferredCtaTreatment(
    sceneStylePlan.ctaShapeLanguage,
    preferredBadgeProminence,
  );
  const preferredAccentDensity =
    preferredDecorationMode === "promo_multi_graphic" ||
    sceneStylePlan.motifTags.length >= 2
      ? "medium"
      : "minimal";
  const backgroundMode =
    sceneStylePlan.backgroundKind === "pattern"
      ? "spring_pattern"
      : sceneStylePlan.backgroundKind === "gradient"
        ? "pastel_gradient"
        : "generated_solid";
  const accentTextColorHex =
    sceneStylePlan.palettePolicy.accentColorHex ??
    sceneStylePlan.palettePolicy.primaryTextColorHex ??
    contrastingTextColor(sceneStylePlan.palettePolicy.backgroundColorHex);
  const inverseTextColorHex =
    sceneStylePlan.palettePolicy.ctaTextColorHex ??
    contrastingTextColor(
      sceneStylePlan.palettePolicy.accentColorHex ??
        sceneStylePlan.palettePolicy.backgroundColorHex,
    );
  const promoSurfaceColorHex =
    sceneStylePlan.promoSurfaceColorHex ??
    sceneStylePlan.palettePolicy.accentColorHex ??
    sceneStylePlan.palettePolicy.ctaSurfaceColorHex ??
    null;
  const promoTextColorReference = sceneStylePlan.promoTextColorHex;
  const promoTextColorHex =
    promoSurfaceColorHex && promoTextColorReference
      ? contrastRatio(promoSurfaceColorHex, promoTextColorReference) >= 3
        ? promoTextColorReference
        : contrastingTextColor(promoSurfaceColorHex)
      : promoSurfaceColorHex
        ? contrastingTextColor(promoSurfaceColorHex)
        : sceneStylePlan.palettePolicy.primaryTextColorHex;
  const promoTextColorSource =
    promoSurfaceColorHex && promoTextColorReference
      ? contrastRatio(promoSurfaceColorHex, promoTextColorReference) >= 3
        ? "reference"
        : "contrast_fallback"
      : promoSurfaceColorHex
        ? "contrast_fallback"
        : null;
  const includeRibbon =
    sceneStylePlan.badgeLikeTreatment ||
    sceneStylePlan.motifTags.includes("ribbon") ||
    sceneStylePlan.motifTags.includes("coupon");
  const includeFrame =
    preferredCtaTreatment === "framed" &&
    sceneLayoutPlan?.layoutFamily === "promo_frame";

  return {
    planId: createRequestId(),
    runId: sceneStylePlan.runId,
    traceId: sceneStylePlan.traceId,
    workflowVariant: sceneStylePlan.workflowVariant,
    selectedTemplateCode: sceneStylePlan.selectedTemplateCode,
    selectedTemplateTitle: sceneStylePlan.selectedTemplateTitle,
    backgroundMode,
    backgroundColorHex: sceneStylePlan.palettePolicy.backgroundColorHex,
    secondaryBackgroundColorHex: sceneStylePlan.palettePolicy.secondaryBackgroundColorHex,
    primaryTextColorHex: sceneStylePlan.palettePolicy.primaryTextColorHex,
    secondaryTextColorHex: sceneStylePlan.palettePolicy.secondaryTextColorHex,
    accentTextColorHex,
    inverseTextColorHex,
    promoSurfaceColorHex,
    promoTextColorHex,
    promoTextColorSource,
    ctaSurfaceColorHex: sceneStylePlan.palettePolicy.ctaSurfaceColorHex,
    ctaTextColorHex: sceneStylePlan.palettePolicy.ctaTextColorHex,
    ctaShapeLanguage: sceneStylePlan.ctaShapeLanguage,
    preferredDecorationMode,
    preferredAccentDensity,
    preferredBadgeProminence,
    preferredCtaTreatment,
    motifTags: sceneStylePlan.motifTags,
    includeRibbon,
    includeFrame,
    summary:
      `Scene binding maps ${sceneStylePlan.selectedTemplateCode} style into ` +
      `${backgroundMode}/${preferredDecorationMode}/${preferredCtaTreatment}.`,
  };
}

function readFirstParsedPage(
  document: NonNullable<TemplatePriorBundle["candidates"][number]["fetchedDocument"]> | null,
): Record<string, unknown> | null {
  const page = document?.pages[0]?.parsed;
  if (!page || typeof page !== "object") {
    return null;
  }
  return page;
}

function readObjectArray(value: unknown): CanvasObject[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is CanvasObject => typeof entry === "object" && entry !== null,
  );
}

function flattenObjects(objects: CanvasObject[]): CanvasObject[] {
  return objects.flatMap((object) => {
    const children = readObjectArray(object.objects);
    return children.length > 0 ? [object, ...flattenObjects(children)] : [object];
  });
}

function isTextLikeObject(object: CanvasObject): boolean {
  const type = typeof object.type === "string" ? object.type : "";
  return ["text", "textbox", "i-text"].includes(type);
}

function resolveBackgroundKind(
  page: Record<string, unknown>,
): SceneStylePlan["backgroundKind"] {
  const backgroundType =
    typeof page.backgroundType === "string" ? page.backgroundType : null;
  if (
    backgroundType === "image" ||
    backgroundType === "pattern" ||
    backgroundType === "gradient"
  ) {
    return backgroundType;
  }
  if (typeof page.backgroundColor === "string" && normalizeColor(page.backgroundColor)) {
    return "color";
  }
  return "unknown";
}

function extractPalettePolicy(
  page: Record<string, unknown>,
  textObjects: CanvasObject[],
  nonTextObjects: CanvasObject[],
  fallbackBackgroundColorHex: string,
  canvasWidth: number | null,
  canvasHeight: number | null,
): ScenePalettePolicy {
  const backgroundColors = collectColors([
    page.backgroundColor,
    page.gr_fill_color,
    page.background,
    page.bg,
  ]);
  const backgroundColorHex =
    backgroundColors[0] ??
    collectColors(nonTextObjects.slice(0, 3))[0] ??
    normalizeColor(fallbackBackgroundColorHex) ??
    "#ffffff";
  const secondaryBackgroundColorHex =
    backgroundColors.find((color) => color !== backgroundColorHex) ??
    collectColors(nonTextObjects).find((color) => color !== backgroundColorHex) ??
    null;

  const sortedTextObjects = [...textObjects].sort(
    (left, right) => estimateTextPriority(right) - estimateTextPriority(left),
  );
  const primaryTextColorHex =
    collectColors(sortedTextObjects[0])[0] ??
    contrastingTextColor(backgroundColorHex);
  const secondaryTextColorHex =
    collectColors(sortedTextObjects.slice(1))[0] ??
    primaryTextColorHex;
  const accentColorHex =
    collectColors(
      nonTextObjects.filter((object) => isAccentCandidate(object, canvasWidth, canvasHeight)),
    )[0] ??
    collectColors(nonTextObjects).find(
      (color) => color !== backgroundColorHex && color !== primaryTextColorHex,
    ) ??
    null;
  const ctaSurfaceColorHex =
    detectCtaSurfaceColor(nonTextObjects, canvasWidth, canvasHeight) ??
    accentColorHex ??
    invertColorByLuminance(backgroundColorHex);
  const ctaTextColorHex =
    collectColors(
      sortedTextObjects.filter((object) => isCtaTextLike(object, canvasHeight)),
    )[0] ??
    contrastingTextColor(ctaSurfaceColorHex);

  return {
    backgroundColorHex,
    secondaryBackgroundColorHex,
    primaryTextColorHex,
    secondaryTextColorHex,
    accentColorHex,
    ctaSurfaceColorHex,
    ctaTextColorHex,
  };
}

function extractTypographyPolicy(
  textObjects: CanvasObject[],
  motifTags: SceneMotifTag[],
): SceneTypographyPolicy {
  const sortedTextObjects = [...textObjects].sort(
    (left, right) => estimateTextPriority(right) - estimateTextPriority(left),
  );
  const displayObject = sortedTextObjects[0] ?? null;
  const bodyObject =
    sortedTextObjects.find((object) => isBodyCandidate(object, displayObject)) ??
    sortedTextObjects.find((object) => object !== displayObject) ??
    displayObject;
  const templateFontFamily = readFontFamily(displayObject) ?? readFontFamily(bodyObject);
  const displayFontSize = asNumber(displayObject?.fontSize);
  const bodyFontSize = asNumber(bodyObject?.fontSize);
  const displayWeightTarget = normalizeWeight(
    Math.max(
      asNumber(displayObject?.fontWeight) ?? 0,
      estimateWeightFromSize(displayFontSize),
    ),
    700,
  );
  const bodyWeightTarget = normalizeWeight(
    Math.max(
      asNumber(bodyObject?.fontWeight) ?? 0,
      estimateWeightFromSize(bodyFontSize),
    ),
    400,
  );
  const categoryHints = resolveCategoryHints(templateFontFamily, motifTags);
  const tone = resolveTypographyTone(
    templateFontFamily,
    categoryHints,
    motifTags,
    displayFontSize,
    displayWeightTarget,
  );

  return {
    templateFontFamily,
    categoryHints,
    tone,
    displayWeightTarget,
    bodyWeightTarget: Math.min(bodyWeightTarget, 500),
    summary:
      `Typography maps template family ${templateFontFamily ?? "unknown"} ` +
      `to ${categoryHints.join("/")} with ${tone} tone.`,
  };
}

function extractMotifTags(
  selectedCandidate: TemplatePriorBundle["candidates"][number] | undefined,
  page: Record<string, unknown>,
  objects: CanvasObject[],
): SceneMotifTag[] {
  const texts = [
    selectedCandidate?.title ?? "",
    ...(selectedCandidate?.keywordTokens ?? []),
    typeof page.backgroundType === "string" ? page.backgroundType : "",
  ]
    .join(" ")
    .toLowerCase();

  const tags = new Set<SceneMotifTag>();
  if (/(꽃|플라워|flower|blossom)/.test(texts)) {
    tags.add("floral");
  }
  if (/(잎|leaf|foliage)/.test(texts)) {
    tags.add("leaf");
  }
  if (/(쿠폰|coupon|할인권|voucher)/.test(texts)) {
    tags.add("coupon");
  }
  if (/(리본|ribbon|배지|badge)/.test(texts)) {
    tags.add("ribbon");
  }
  if (/(반짝|spark|star|glow)/.test(texts)) {
    tags.add("spark");
  }

  const circleLikeCount = objects.filter((object) => {
    const type = typeof object.type === "string" ? object.type : "";
    return type === "circle" || type === "ellipse";
  }).length;
  const roundedRectCount = objects.filter((object) => {
    const type = typeof object.type === "string" ? object.type : "";
    return type === "rect" && (asNumber(object.rx) ?? 0) >= 12;
  }).length;
  if (circleLikeCount + roundedRectCount >= 3) {
    tags.add("geometric");
  }
  if (tags.size === 0) {
    tags.add("abstract");
  }
  return [...tags];
}

function resolveCtaShapeLanguage(
  page: Record<string, unknown>,
  objects: CanvasObject[],
  canvasWidth: number | null,
  canvasHeight: number | null,
): SceneCtaShapeLanguage {
  const ctaLikeShape = objects
    .filter((object) => isRectLike(object))
    .filter((object) => isCtaShapeCandidate(object, canvasWidth, canvasHeight))
    .sort((left, right) => estimateArea(right) - estimateArea(left))[0];

  if (!ctaLikeShape) {
    return page.backgroundType === "gradient" ? "transparent_band" : "pill";
  }

  const width = estimateWidth(ctaLikeShape);
  const height = estimateHeight(ctaLikeShape);
  const roundedness = Math.max(asNumber(ctaLikeShape.rx) ?? 0, asNumber(ctaLikeShape.ry) ?? 0);
  const opacity = asNumber(ctaLikeShape.opacity) ?? 1;
  if (opacity < 0.85 && width > height * 3.8) {
    return "transparent_band";
  }
  if (roundedness >= Math.max(16, height * 0.35)) {
    return "pill";
  }
  if (width > height * 4.2) {
    return "band";
  }
  return "soft_rect";
}

function resolveCategoryHints(
  templateFontFamily: string | null,
  motifTags: SceneMotifTag[],
): SceneTypographyCategoryHint[] {
  const family = templateFontFamily?.toLowerCase() ?? "";
  if (/(명조|serif|roman)/.test(family)) {
    return ["명조", "고딕"];
  }
  if (/(손|hand|brush|script)/.test(family)) {
    return ["손글씨", "고딕"];
  }
  if (motifTags.includes("floral") || motifTags.includes("leaf")) {
    return ["고딕", "손글씨"];
  }
  return ["고딕", "명조"];
}

function resolveTypographyTone(
  templateFontFamily: string | null,
  categoryHints: SceneTypographyCategoryHint[],
  motifTags: SceneMotifTag[],
  displayFontSize: number | null,
  displayWeightTarget: number,
): SceneTypographyTone {
  const family = templateFontFamily?.toLowerCase() ?? "";
  if (/(round|rounded|soft|둥근)/.test(family)) {
    return "rounded";
  }
  if (displayFontSize !== null && displayFontSize >= 72 && displayWeightTarget >= 700) {
    return "rounded";
  }
  if (/(손|hand|brush|script)/.test(family) || motifTags.includes("floral")) {
    return "playful";
  }
  if (categoryHints[0] === "명조") {
    return "formal";
  }
  return "neutral";
}

function resolvePreferredDecorationMode(
  motifTags: SceneMotifTag[],
  primaryVisualFamily: "graphic" | "photo",
): SceneBindingPlan["preferredDecorationMode"] {
  if (motifTags.includes("coupon") || motifTags.includes("ribbon")) {
    return "ribbon_badge";
  }
  if (primaryVisualFamily === "photo") {
    return "photo_support";
  }
  if (
    motifTags.includes("floral") ||
    motifTags.includes("leaf") ||
    motifTags.includes("geometric") ||
    motifTags.includes("abstract")
  ) {
    return "promo_multi_graphic";
  }
  return "graphic_cluster";
}

function resolvePreferredCtaTreatment(
  ctaShapeLanguage: SceneCtaShapeLanguage,
  preferredBadgeProminence: SceneBindingPlan["preferredBadgeProminence"],
): SceneBindingPlan["preferredCtaTreatment"] {
  if (ctaShapeLanguage === "band" || ctaShapeLanguage === "transparent_band") {
    return "framed";
  }
  if (preferredBadgeProminence === "dominant") {
    return "badge_forward";
  }
  return "standard";
}

function isAccentCandidate(
  object: CanvasObject,
  canvasWidth: number | null,
  canvasHeight: number | null,
): boolean {
  if (isTextLikeObject(object)) {
    return false;
  }
  const type = typeof object.type === "string" ? object.type : "";
  if (["rect", "circle", "ellipse", "polygon", "path", "group"].includes(type)) {
    return true;
  }
  if (!canvasWidth || !canvasHeight) {
    return false;
  }
  return (
    estimateWidth(object) < canvasWidth * 0.25 &&
    estimateHeight(object) < canvasHeight * 0.25
  );
}

function detectCtaSurfaceColor(
  nonTextObjects: CanvasObject[],
  canvasWidth: number | null,
  canvasHeight: number | null,
): string | null {
  const candidate = nonTextObjects
    .filter((object) => isRectLike(object))
    .filter((object) => isCtaShapeCandidate(object, canvasWidth, canvasHeight))
    .sort((left, right) => estimateArea(right) - estimateArea(left))[0];
  return candidate ? collectColors(candidate)[0] ?? null : null;
}

function detectPromoSurfaceColor(
  nonTextObjects: CanvasObject[],
  canvasWidth: number | null,
  canvasHeight: number | null,
): string | null {
  const candidate = nonTextObjects
    .filter((object) => isRectLike(object))
    .filter((object) => isPromoShapeCandidate(object, canvasWidth, canvasHeight))
    .sort((left, right) => estimateArea(right) - estimateArea(left))[0];
  return candidate ? collectColors(candidate)[0] ?? null : null;
}

function detectPromoTextColor(
  textObjects: CanvasObject[],
  promoSurfaceColorHex: string | null,
  canvasWidth: number | null,
  canvasHeight: number | null,
): string | null {
  const candidate = textObjects
    .filter((object) => isPromoTextLike(object, canvasWidth, canvasHeight))
    .sort((left, right) => estimateTextPriority(right) - estimateTextPriority(left))[0];
  const candidateColor = candidate ? collectColors(candidate)[0] ?? null : null;
  if (!candidateColor) {
    return promoSurfaceColorHex ? contrastingTextColor(promoSurfaceColorHex) : null;
  }
  return candidateColor;
}

function isRectLike(object: CanvasObject): boolean {
  const type = typeof object.type === "string" ? object.type : "";
  return type === "rect" || type === "textbox" || type === "group";
}

function isCtaShapeCandidate(
  object: CanvasObject,
  canvasWidth: number | null,
  canvasHeight: number | null,
): boolean {
  if (!canvasWidth || !canvasHeight) {
    return false;
  }
  const width = estimateWidth(object);
  const height = estimateHeight(object);
  const top = asNumber(object.top) ?? 0;
  return (
    width >= canvasWidth * 0.16 &&
    width <= canvasWidth * 0.7 &&
    height >= canvasHeight * 0.04 &&
    height <= canvasHeight * 0.18 &&
    top >= canvasHeight * 0.45
  );
}

function isPromoShapeCandidate(
  object: CanvasObject,
  canvasWidth: number | null,
  canvasHeight: number | null,
): boolean {
  if (!canvasWidth || !canvasHeight) {
    return false;
  }
  const width = estimateWidth(object);
  const height = estimateHeight(object);
  const top = asNumber(object.top) ?? asNumber(object.top_from_zero) ?? 0;
  return (
    width >= canvasWidth * 0.14 &&
    width <= canvasWidth * 0.7 &&
    height >= canvasHeight * 0.04 &&
    height <= canvasHeight * 0.18 &&
    top >= canvasHeight * 0.08 &&
    top <= canvasHeight * 0.55
  );
}

function isCtaTextLike(object: CanvasObject, canvasHeight: number | null): boolean {
  if (!isTextLikeObject(object) || !canvasHeight) {
    return false;
  }
  const top = asNumber(object.top) ?? 0;
  const width = estimateWidth(object);
  return top >= canvasHeight * 0.42 && width <= 280;
}

function isPromoTextLike(
  object: CanvasObject,
  canvasWidth: number | null,
  canvasHeight: number | null,
): boolean {
  if (!isTextLikeObject(object) || !canvasWidth || !canvasHeight) {
    return false;
  }
  const top = asNumber(object.top) ?? asNumber(object.top_from_zero) ?? 0;
  const width = estimateWidth(object);
  const height = estimateHeight(object);
  return (
    top >= canvasHeight * 0.08 &&
    top <= canvasHeight * 0.55 &&
    width >= canvasWidth * 0.12 &&
    width <= canvasWidth * 0.7 &&
    height <= canvasHeight * 0.14
  );
}

function detectBadgeLikeLabel(
  textObjects: CanvasObject[],
  canvasHeight: number | null,
): boolean {
  if (!canvasHeight) {
    return false;
  }
  return textObjects.some((object) => {
    const top = asNumber(object.top) ?? asNumber(object.top_from_zero) ?? 0;
    return top < canvasHeight * 0.22 && estimateWidth(object) < 280;
  });
}

function collectColors(value: unknown): string[] {
  const collected: string[] = [];
  collectColorsRecursive(value, collected);
  return [...new Set(collected)];
}

function collectColorsRecursive(value: unknown, colors: string[]): void {
  if (typeof value === "string") {
    const normalized = normalizeColor(value);
    if (normalized) {
      colors.push(normalized);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectColorsRecursive(entry, colors);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  for (const [key, entry] of Object.entries(record)) {
    if (
      key.toLowerCase().includes("color") ||
      key === "fill" ||
      key === "stroke" ||
      key === "background"
    ) {
      collectColorsRecursive(entry, colors);
    }
  }
}

function normalizeColor(value: string): string | null {
  const trimmed = value.trim();
  if (/^#?[0-9a-f]{3}$/i.test(trimmed) || /^#?[0-9a-f]{6}$/i.test(trimmed)) {
    return normalizeHexColor(trimmed).toLowerCase();
  }
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([01](?:\.\d+)?))?\s*\)$/i,
  );
  if (!rgbMatch) {
    return null;
  }
  const red = parseRgbChannel(rgbMatch[1]);
  const green = parseRgbChannel(rgbMatch[2]);
  const blue = parseRgbChannel(rgbMatch[3]);
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`.toLowerCase();
}

function estimateTextPriority(object: CanvasObject): number {
  const fontSize = asNumber(object.fontSize) ?? 0;
  const fontWeight = asNumber(object.fontWeight) ?? 400;
  return fontSize * Math.max(fontWeight / 400, 1) + estimateArea(object) * 0.0005;
}

function isBodyCandidate(
  object: CanvasObject,
  displayObject: CanvasObject | null,
): boolean {
  if (!displayObject || object === displayObject) {
    return false;
  }
  const displayFontSize = asNumber(displayObject.fontSize) ?? 0;
  const objectFontSize = asNumber(object.fontSize) ?? 0;
  if (displayFontSize > 0 && objectFontSize > 0) {
    return objectFontSize <= displayFontSize * 0.8;
  }
  return estimateArea(object) <= estimateArea(displayObject) * 0.6;
}

function estimateWeightFromSize(size: number | null): number {
  if (!size) {
    return 400;
  }
  if (size >= 52) {
    return 800;
  }
  if (size >= 34) {
    return 700;
  }
  return 400;
}

function normalizeWeight(weight: number | null, fallback: number): number {
  if (!weight || !Number.isFinite(weight)) {
    return fallback;
  }
  if (weight >= 800) {
    return 800;
  }
  if (weight >= 700) {
    return 700;
  }
  if (weight >= 500) {
    return 500;
  }
  return 400;
}

function readFontFamily(object: CanvasObject | null): string | null {
  if (!object) {
    return null;
  }
  return typeof object.fontFamily === "string" && object.fontFamily.trim().length > 0
    ? object.fontFamily.trim()
    : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function estimateWidth(object: CanvasObject): number {
  return (asNumber(object.width) ?? 0) * (asNumber(object.scaleX) ?? 1);
}

function estimateHeight(object: CanvasObject): number {
  return (asNumber(object.height) ?? 0) * (asNumber(object.scaleY) ?? 1);
}

function estimateArea(object: CanvasObject): number {
  return estimateWidth(object) * estimateHeight(object);
}

function contrastingTextColor(backgroundColorHex: string): string {
  return calculateRelativeLuminance(backgroundColorHex) >= 0.58 ? "#111111" : "#ffffff";
}

function invertColorByLuminance(colorHex: string): string {
  return calculateRelativeLuminance(colorHex) >= 0.58 ? "#111111" : "#f8fafc";
}

function contrastRatio(foregroundColorHex: string, backgroundColorHex: string): number {
  const lighter = Math.max(
    calculateRelativeLuminance(foregroundColorHex),
    calculateRelativeLuminance(backgroundColorHex),
  );
  const darker = Math.min(
    calculateRelativeLuminance(foregroundColorHex),
    calculateRelativeLuminance(backgroundColorHex),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgbChannel(channel: string | undefined): number {
  return Math.max(0, Math.min(255, Number.parseInt(channel || "0", 10)));
}
