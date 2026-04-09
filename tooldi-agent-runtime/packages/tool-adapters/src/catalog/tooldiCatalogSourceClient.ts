export const tooldiCatalogSourceModes = [
  "placeholder",
  "tooldi_api",
  "tooldi_api_direct",
] as const;

export type TooldiCatalogSourceMode =
  (typeof tooldiCatalogSourceModes)[number];

export type TooldiCatalogSourceFamily =
  | "background_source"
  | "graphic_source"
  | "photo_source"
  | "font_source";

export type TooldiInsertMode =
  | "page_background"
  | "object_element"
  | "object_image"
  | "font_face";

export type TooldiPriceType = "free" | "paid" | null;

export interface TooldiCatalogAssetBase {
  assetId: string;
  sourceFamily: TooldiCatalogSourceFamily;
  contentType: string;
  serial: string;
  uid: string | null;
  title: string;
  keywordTokens: string[];
  width: number | null;
  height: number | null;
  thumbnailUrl: string | null;
  originUrl: string | null;
  priceType: TooldiPriceType;
  isAi: boolean;
  creatorSerial: string | null;
  insertMode: TooldiInsertMode;
  sourcePayload: Record<string, unknown>;
}

export interface TooldiBackgroundAsset extends TooldiCatalogAssetBase {
  sourceFamily: "background_source";
  contentType: "background";
  insertMode: "page_background";
  backgroundKind: "pattern" | "image";
}

export interface TooldiGraphicAsset extends TooldiCatalogAssetBase {
  sourceFamily: "graphic_source";
  contentType: "graphic";
  insertMode: "object_element";
  graphicKind:
    | "bitmap"
    | "illust"
    | "icon"
    | "calligraphy"
    | "frame"
    | "figure"
    | "wordart"
    | "font_text"
    | "mix_text"
    | "unknown";
  extension: string | null;
}

export interface TooldiPhotoAsset extends TooldiCatalogAssetBase {
  sourceFamily: "photo_source";
  contentType: "photo";
  insertMode: "object_image";
  orientation: "portrait" | "landscape" | "square";
  backgroundRemovalHint: boolean;
}

export interface TooldiFontWeightAsset {
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
  thumbnailUrl: string | null;
}

export interface TooldiFontAsset extends TooldiCatalogAssetBase {
  sourceFamily: "font_source";
  contentType: "font";
  insertMode: "font_face";
  fontName: string;
  fontFace: string;
  fontLanguage: "KOR" | "ENG";
  fontCategory: string;
  supportedLanguages: Array<"KOR" | "ENG" | "CHN" | "JPN">;
  fontWeights: TooldiFontWeightAsset[];
}

export interface TooldiCatalogSearchResult<
  TAsset extends TooldiCatalogAssetBase,
> {
  sourceFamily: TAsset["sourceFamily"];
  page: number;
  hasNextPage: boolean;
  traceId: string | null;
  assets: TAsset[];
}

export interface SearchBackgroundAssetsQuery {
  type: "pattern" | "image";
  keyword?: string;
  page: number;
  source?: "initial_load" | "search";
}

export interface SearchGraphicAssetsQuery {
  keyword?: string;
  page: number;
  price?: "free" | "paid";
  owner?: "follow" | "superb" | "gold" | "silver" | "regular";
  theme?: string;
  sort?: "new" | "sales";
  type?: "vector" | "bitmap";
  method?: "ai" | "creator";
}

export interface SearchPhotoAssetsQuery {
  keyword?: string;
  page: number;
  price?: "free" | "paid";
  owner?: "follow" | "superb" | "gold" | "silver" | "regular";
  theme?: string;
  sort?: "new" | "sales";
  type?: "pic" | "rmbg";
  format?: "square" | "horizontal" | "vertical";
  source?: "initial_load" | "search";
}

export interface ListFontAssetsQuery {
  fontCategory?: string;
  supportedLanguage?: "KOR" | "ENG" | "CHN" | "JPN";
}

export interface TooldiCatalogSourceClient {
  searchBackgroundAssets(
    query: SearchBackgroundAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiBackgroundAsset>>;
  searchGraphicAssets(
    query: SearchGraphicAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiGraphicAsset>>;
  searchPhotoAssets(
    query: SearchPhotoAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiPhotoAsset>>;
  listFontAssets(
    query?: ListFontAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiFontAsset>>;
}

export type TooldiCatalogSourceErrorCode =
  | "request_failed"
  | "timeout"
  | "invalid_response";

export class TooldiCatalogSourceError extends Error {
  readonly code: TooldiCatalogSourceErrorCode;
  readonly url: string;
  readonly status: number | null;

  constructor(input: {
    code: TooldiCatalogSourceErrorCode;
    message: string;
    url: string;
    status?: number | null;
    cause?: unknown;
  }) {
    super(input.message, input.cause ? { cause: input.cause } : undefined);
    this.name = "TooldiCatalogSourceError";
    this.code = input.code;
    this.url = input.url;
    this.status = input.status ?? null;
  }
}

export interface CreateTooldiApiCatalogSourceClientOptions {
  baseUrl: string;
  timeoutMs?: number | null;
  cookieHeader?: string | null;
  fetchImpl?: typeof fetch;
}

interface BackgroundApiRow extends Record<string, unknown> {
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

interface ShapeApiRow extends Record<string, unknown> {
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

interface PhotoApiRow extends Record<string, unknown> {
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

interface ApiListSuccess<T> {
  result: true;
  page?: number;
  hasNextPage?: boolean;
  data: T[];
  trace_id?: string;
}

interface DirectListSuccess<T> {
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

interface FontApiRow extends Record<string, unknown> {
  serial: string;
  fontName: string;
  fontFace: string;
  fontLanguage: "KOR" | "ENG";
  fontCategory: string;
  supportedLanguages: Array<"KOR" | "ENG" | "CHN" | "JPN">;
  thumbnail?: string;
  fontWeights: FontWeightApiRow[];
}

class PlaceholderTooldiCatalogSourceClient
  implements TooldiCatalogSourceClient
{
  async searchBackgroundAssets(
    query: SearchBackgroundAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiBackgroundAsset>> {
    return {
      sourceFamily: "background_source",
      page: query.page,
      hasNextPage: false,
      traceId: null,
      assets: [],
    };
  }

  async searchGraphicAssets(
    query: SearchGraphicAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiGraphicAsset>> {
    return {
      sourceFamily: "graphic_source",
      page: query.page,
      hasNextPage: false,
      traceId: null,
      assets: [],
    };
  }

  async searchPhotoAssets(
    query: SearchPhotoAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiPhotoAsset>> {
    return {
      sourceFamily: "photo_source",
      page: query.page,
      hasNextPage: false,
      traceId: null,
      assets: [],
    };
  }

  async listFontAssets(): Promise<TooldiCatalogSearchResult<TooldiFontAsset>> {
    return {
      sourceFamily: "font_source",
      page: 0,
      hasNextPage: false,
      traceId: null,
      assets: [],
    };
  }
}

class TooldiApiCatalogSourceClient implements TooldiCatalogSourceClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number | null;
  private readonly cookieHeader: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CreateTooldiApiCatalogSourceClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.timeoutMs =
      options.timeoutMs != null && options.timeoutMs > 0
        ? options.timeoutMs
        : null;
    this.cookieHeader = options.cookieHeader ?? null;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async searchBackgroundAssets(
    query: SearchBackgroundAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiBackgroundAsset>> {
    const response = await this.fetchJson<ApiListSuccess<BackgroundApiRow>>(
      "/editor/get_background_contents",
      {
        method: "POST",
        body: {
          type: query.type,
          page: query.page,
          ...(query.keyword ? { keyword: query.keyword } : {}),
          ...(query.source ? { source: query.source } : {}),
        },
      },
    );
    assertListSuccessResponse(response, `${this.baseUrl}/editor/get_background_contents`);
    return {
      sourceFamily: "background_source",
      page: response.page ?? query.page,
      hasNextPage: response.hasNextPage ?? false,
      traceId: response.trace_id ?? null,
      assets: response.data.map((asset) => normalizeBackgroundAsset(asset, query)),
    };
  }

  async searchGraphicAssets(
    query: SearchGraphicAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiGraphicAsset>> {
    const response = await this.fetchJson<DirectListSuccess<ShapeApiRow>>(
      "/shape",
      {
        method: "POST",
        body: {
          page: toDirectPage(query.page),
          ...(query.keyword ? { keyword: query.keyword } : {}),
          ...(query.type ? { type: query.type } : {}),
          ...(query.price ? { price: mapPriceToLegacyCode(query.price) } : {}),
          ...(query.sort ? { sort: query.sort } : {}),
          ...(query.owner ? { owner: query.owner } : {}),
          ...(query.theme ? { theme: query.theme } : {}),
          ...(query.method ? { method: query.method } : {}),
        },
      },
    );
    assertDirectListResponse(response, `${this.baseUrl}/shape`);
    return {
      sourceFamily: "graphic_source",
      page: query.page,
      hasNextPage: response.last_page === undefined ? false : !response.last_page,
      traceId: null,
      assets: response.list.map((asset) => normalizeGraphicAsset(asset)),
    };
  }

  async searchPhotoAssets(
    query: SearchPhotoAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiPhotoAsset>> {
    const response = await this.fetchJson<DirectListSuccess<PhotoApiRow>>(
      "/picture",
      {
        method: "POST",
        body: {
          page: toDirectPage(query.page),
          ...(query.keyword ? { keyword: query.keyword } : {}),
          ...(query.type ? { type: query.type } : {}),
          ...(query.format ? { format: query.format } : {}),
          ...(query.price ? { price: mapPriceToLegacyCode(query.price) } : {}),
          ...(query.sort ? { sort: query.sort } : {}),
          ...(query.owner ? { owner: query.owner } : {}),
          ...(query.theme ? { theme: query.theme } : {}),
          ...(query.source ? { source: query.source } : {}),
        },
      },
    );
    assertDirectListResponse(response, `${this.baseUrl}/picture`);
    return {
      sourceFamily: "photo_source",
      page: query.page,
      hasNextPage: response.last_page === undefined ? false : !response.last_page,
      traceId: null,
      assets: response.list.map((asset) => normalizePhotoAsset(asset)),
    };
  }

  async listFontAssets(
    query?: ListFontAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiFontAsset>> {
    const response = await this.fetchJson<FontApiRow[]>("/editor/loadFont", {
      method: "GET",
    });
    if (!Array.isArray(response)) {
      throw new TooldiCatalogSourceError({
        code: "invalid_response",
        message: "Tooldi font catalog returned an invalid payload",
        url: `${this.baseUrl}/editor/loadFont`,
      });
    }
    let assets = response.map((asset) => normalizeFontAsset(asset));

    if (query?.fontCategory) {
      assets = assets.filter((asset) => asset.fontCategory === query.fontCategory);
    }

    if (query?.supportedLanguage) {
      assets = assets.filter((asset) =>
        asset.supportedLanguages.includes(query.supportedLanguage!),
      );
    }

    return {
      sourceFamily: "font_source",
      page: 0,
      hasNextPage: false,
      traceId: null,
      assets,
    };
  }

  private async fetchJson<T>(
    path: string,
    request: {
      method: "GET" | "POST";
      body?: Record<string, unknown>;
    },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers({
      Accept: "application/json",
    });
    if (this.cookieHeader) {
      headers.set("Cookie", this.cookieHeader);
    }
    let body: string | undefined;
    if (request.body) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(request.body);
    }

    try {
      const init: RequestInit = {
        method: request.method,
        headers,
      };
      if (this.timeoutMs !== null) {
        init.signal = AbortSignal.timeout(this.timeoutMs);
      }
      if (body !== undefined) {
        init.body = body;
      }
      const response = await this.fetchImpl(url, {
        ...init,
      });

      if (!response.ok) {
        throw new TooldiCatalogSourceError({
          code: "request_failed",
          message: `Tooldi catalog request failed: ${response.status}`,
          url,
          status: response.status,
        });
      }
      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new TooldiCatalogSourceError({
          code: "invalid_response",
          message: "Tooldi catalog response body is not valid JSON",
          url,
          status: response.status,
          cause: error,
        });
      }
    } catch (error) {
      if (error instanceof TooldiCatalogSourceError) {
        throw error;
      }
      if (isTimeoutError(error)) {
        throw new TooldiCatalogSourceError({
          code: "timeout",
          message: `Tooldi catalog request timed out after ${this.timeoutMs ?? 0}ms`,
          url,
          cause: error,
        });
      }
      throw new TooldiCatalogSourceError({
        code: "request_failed",
        message: "Tooldi catalog request failed",
        url,
        cause: error,
      });
    }
  }
}

export function createPlaceholderTooldiCatalogSourceClient(): TooldiCatalogSourceClient {
  return new PlaceholderTooldiCatalogSourceClient();
}

export function createTooldiApiCatalogSourceClient(
  options: CreateTooldiApiCatalogSourceClientOptions,
): TooldiCatalogSourceClient {
  return new TooldiApiCatalogSourceClient(options);
}

function normalizeBackgroundAsset(
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

function normalizeGraphicAsset(asset: ShapeApiRow): TooldiGraphicAsset {
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

function normalizePhotoAsset(asset: PhotoApiRow): TooldiPhotoAsset {
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

function normalizeFontAsset(asset: FontApiRow): TooldiFontAsset {
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

function assertListSuccessResponse<T>(
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

function assertDirectListResponse<T>(
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

function mapPriceToLegacyCode(value: "free" | "paid"): "F" | "P" {
  return value === "free" ? "F" : "P";
}

function toDirectPage(page: number): number {
  return page <= 0 ? 1 : page + 1;
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

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}
