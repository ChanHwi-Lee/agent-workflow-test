import type {
  SearchBackgroundAssetsQuery,
  TooldiBackgroundAsset,
  TooldiFontAsset,
  TooldiGraphicAsset,
  TooldiPhotoAsset,
  TooldiPriceType,
} from "./tooldiCatalogSourceTypes.js";
import { TooldiCatalogSourceError } from "./tooldiCatalogSourceTypes.js";

export interface BackgroundApiRow extends Record<string, unknown> {
  serial: string;
  category?: string;
  categorySerial?: string;
  priceType?: "free" | "paid";
  userSerial?: string;
  username?: string;
  keywords?: string[];
  thumbnail?: string;
  image?: string;
  uid?: string;
  width?: number;
  height?: number;
  isAi?: boolean;
}

export interface ShapeApiRow extends Record<string, unknown> {
  serial: string;
  category?: string;
  categoryName?: string;
  categorySerial?: string;
  priceType?: "free" | "paid";
  userSerial?: string;
  username?: string;
  keywords?: string[];
  thumbnail?: string;
  image?: string;
  uid?: string;
  isAi?: boolean;
}

export interface PhotoApiRow extends Record<string, unknown> {
  serial: string;
  priceType?: "free" | "paid";
  userSerial?: string;
  username?: string;
  keywords?: string[];
  thumbnail?: string;
  image?: string;
  uid?: string;
  width?: number;
  height?: number;
  isAi?: boolean;
}

export interface ApiListSuccess<T> {
  result: true;
  page?: number;
  hasNextPage?: boolean;
  data: T[];
  trace_id?: string;
}

export interface DirectListSuccess<T> {
  list: T[];
  page?: number;
  last_page?: boolean;
}

interface FontWeightApiRow extends Record<string, unknown> {
  serial: string;
  fontSerial: string;
  fontWeight: string;
  convertWeight: string;
  fontFace: string;
  fontFamily: string;
  extension: string;
  fileType: string;
  orgFilename: string;
  savedFilename: string;
  thumbnail?: string;
}

export interface FontApiRow extends Record<string, unknown> {
  serial: string;
  fontName: string;
  fontFace: string;
  fontLanguage: "KOR" | "ENG";
  fontCategory: string;
  supportedLanguages: Array<"KOR" | "ENG" | "CHN" | "JPN">;
  thumbnail?: string;
  fontWeights: FontWeightApiRow[];
}

export function normalizeBackgroundAsset(
  asset: BackgroundApiRow,
  query: SearchBackgroundAssetsQuery,
): TooldiBackgroundAsset {
  const backgroundKind = normalizeBackgroundKind(asset.category, query.type);
  return {
    assetId: `background:${asset.serial}`,
    sourceFamily: "background_source",
    contentType: "background",
    serial: asset.serial,
    uid: stringOrNull(asset.uid),
    title: createAssetTitle(backgroundKind, asset.keywords, asset.serial),
    keywordTokens: normalizeKeywords(asset.keywords),
    width: numberOrNull(asset.width),
    height: numberOrNull(asset.height),
    thumbnailUrl: stringOrNull(asset.thumbnail),
    originUrl: stringOrNull(asset.image),
    priceType: normalizePriceType(asset.priceType),
    isAi: Boolean(asset.isAi),
    creatorSerial: stringOrNull(asset.userSerial),
    insertMode: "page_background",
    backgroundKind,
    sourcePayload: asset,
  };
}

export function normalizeGraphicAsset(asset: ShapeApiRow): TooldiGraphicAsset {
  const graphicKind = normalizeGraphicKind(
    asset.categorySerial,
    asset.category ?? asset.categoryName,
  );
  const extension = inferExtension(asset.image);
  return {
    assetId: `graphic:${asset.serial}`,
    sourceFamily: "graphic_source",
    contentType: "graphic",
    serial: asset.serial,
    uid: stringOrNull(asset.uid),
    title: createAssetTitle(graphicKind, asset.keywords, asset.serial),
    keywordTokens: normalizeKeywords(asset.keywords),
    width: null,
    height: null,
    thumbnailUrl: stringOrNull(asset.thumbnail),
    originUrl: stringOrNull(asset.image),
    priceType: normalizePriceType(asset.priceType),
    isAi: Boolean(asset.isAi),
    creatorSerial: stringOrNull(asset.userSerial),
    insertMode: "object_element",
    graphicKind,
    extension,
    sourcePayload: asset,
  };
}

export function normalizePhotoAsset(asset: PhotoApiRow): TooldiPhotoAsset {
  const width = numberOrNull(asset.width);
  const height = numberOrNull(asset.height);
  return {
    assetId: `photo:${asset.serial}`,
    sourceFamily: "photo_source",
    contentType: "photo",
    serial: asset.serial,
    uid: stringOrNull(asset.uid),
    title: createAssetTitle("photo", asset.keywords, asset.serial),
    keywordTokens: normalizeKeywords(asset.keywords),
    width,
    height,
    thumbnailUrl: stringOrNull(asset.thumbnail),
    originUrl: stringOrNull(asset.image),
    priceType: normalizePriceType(asset.priceType),
    isAi: Boolean(asset.isAi),
    creatorSerial: stringOrNull(asset.userSerial),
    insertMode: "object_image",
    orientation: normalizeOrientation(width, height),
    backgroundRemovalHint: hasBackgroundRemovalKeyword(asset.keywords),
    sourcePayload: asset,
  };
}

export function normalizeFontAsset(asset: FontApiRow): TooldiFontAsset {
  return {
    assetId: `font:${asset.serial}`,
    sourceFamily: "font_source",
    contentType: "font",
    serial: asset.serial,
    uid: null,
    title: asset.fontName,
    keywordTokens: [asset.fontCategory, ...asset.supportedLanguages],
    width: null,
    height: null,
    thumbnailUrl: stringOrNull(asset.thumbnail),
    originUrl: null,
    priceType: null,
    isAi: false,
    creatorSerial: null,
    insertMode: "font_face",
    fontName: asset.fontName,
    fontFace: asset.fontFace,
    fontLanguage: asset.fontLanguage,
    fontCategory: asset.fontCategory,
    supportedLanguages: asset.supportedLanguages,
    fontWeights: asset.fontWeights.map((weight) => ({
      serial: weight.serial,
      fontSerial: weight.fontSerial,
      fontWeight: weight.fontWeight,
      convertWeight: weight.convertWeight,
      fontFace: weight.fontFace,
      fontFamily: weight.fontFamily,
      extension: weight.extension,
      fileType: weight.fileType,
      orgFilename: weight.orgFilename,
      savedFilename: weight.savedFilename,
      thumbnailUrl: stringOrNull(weight.thumbnail),
    })),
    sourcePayload: asset,
  };
}

export function assertListSuccessResponse<T>(
  response: ApiListSuccess<T>,
  url: string,
): void {
  if (response.result !== true || !Array.isArray(response.data)) {
    throw new TooldiCatalogSourceError({
      code: "invalid_response",
      message: "Tooldi catalog list endpoint returned an invalid payload",
      url,
    });
  }
}

export function assertDirectListResponse<T>(
  response: DirectListSuccess<T>,
  url: string,
): void {
  if (!Array.isArray(response.list)) {
    throw new TooldiCatalogSourceError({
      code: "invalid_response",
      message: "Tooldi direct catalog endpoint returned an invalid payload",
      url,
    });
  }
}

export function mapPriceToLegacyCode(value: "free" | "paid"): "F" | "P" {
  return value === "free" ? "F" : "P";
}

export function toDirectPage(page: number): number {
  return page <= 0 ? 1 : page + 1;
}

function normalizeKeywords(keywords: unknown): string[] {
  if (!Array.isArray(keywords)) {
    return [];
  }
  return keywords.filter((value): value is string => typeof value === "string");
}

function normalizePriceType(value: unknown): TooldiPriceType {
  if (value === "free" || value === "paid") {
    return value;
  }
  return null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function createAssetTitle(
  prefix: string,
  keywords: unknown,
  serial: string,
): string {
  const keywordTokens = normalizeKeywords(keywords);
  if (keywordTokens.length > 0) {
    return keywordTokens.slice(0, 3).join(" / ");
  }
  return `${prefix}_${serial}`;
}

function normalizeBackgroundKind(
  category: unknown,
  fallback: SearchBackgroundAssetsQuery["type"],
): "pattern" | "image" {
  if (category === "pattern" || category === "image") {
    return category;
  }
  return fallback;
}

function normalizeGraphicKind(
  categorySerial: unknown,
  categoryName: unknown,
): TooldiGraphicAsset["graphicKind"] {
  switch (String(categorySerial)) {
    case "40":
      return "bitmap";
    case "30":
      return "illust";
    case "38":
      return "icon";
    case "76":
      return "calligraphy";
    case "41":
      return "frame";
    case "49":
      return "wordart";
    case "77":
      return "font_text";
    case "48":
      return "mix_text";
    case "2":
    case "3":
      return "figure";
    default:
      break;
  }

  switch (categoryName) {
    case "bitmap":
    case "illust":
    case "icon":
    case "calligraphy":
    case "frame":
    case "wordart":
    case "font_text":
    case "mix_text":
      return categoryName;
    case "rect":
    case "line":
      return "figure";
    default:
      return "unknown";
  }
}

function normalizeOrientation(
  width: number | null,
  height: number | null,
): TooldiPhotoAsset["orientation"] {
  if (width === null || height === null || width === height) {
    return "square";
  }
  return width > height ? "landscape" : "portrait";
}

function hasBackgroundRemovalKeyword(keywords: unknown): boolean {
  return normalizeKeywords(keywords).some((token) => token.includes("배경제거"));
}

function inferExtension(imageUrl: unknown): string | null {
  if (typeof imageUrl !== "string" || imageUrl.length === 0) {
    return null;
  }
  const normalized = imageUrl.split("?")[0] ?? imageUrl;
  const index = normalized.lastIndexOf(".");
  if (index === -1) {
    return null;
  }
  return normalized.slice(index).toLowerCase();
}
