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
