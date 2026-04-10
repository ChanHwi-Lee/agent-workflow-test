export {
  TooldiCatalogSourceError,
  tooldiCatalogSourceModes,
} from "./tooldiCatalogSourceTypes.js";
export type {
  CreateTooldiApiCatalogSourceClientOptions,
  ListFontAssetsQuery,
  SearchBackgroundAssetsQuery,
  SearchGraphicAssetsQuery,
  SearchPhotoAssetsQuery,
  TooldiBackgroundAsset,
  TooldiCatalogAssetBase,
  TooldiCatalogSearchResult,
  TooldiCatalogSourceClient,
  TooldiCatalogSourceErrorCode,
  TooldiCatalogSourceFamily,
  TooldiCatalogSourceMode,
  TooldiFontAsset,
  TooldiFontWeightAsset,
  TooldiGraphicAsset,
  TooldiInsertMode,
  TooldiPhotoAsset,
  TooldiPriceType,
} from "./tooldiCatalogSourceTypes.js";

import type {
  CreateTooldiApiCatalogSourceClientOptions,
  ListFontAssetsQuery,
  SearchBackgroundAssetsQuery,
  SearchGraphicAssetsQuery,
  SearchPhotoAssetsQuery,
  TooldiBackgroundAsset,
  TooldiCatalogSearchResult,
  TooldiCatalogSourceClient,
  TooldiFontAsset,
  TooldiGraphicAsset,
  TooldiPhotoAsset,
} from "./tooldiCatalogSourceTypes.js";
import { TooldiCatalogSourceError } from "./tooldiCatalogSourceTypes.js";

import {
  assertDirectListResponse,
  assertListSuccessResponse,
  mapPriceToLegacyCode,
  normalizeBackgroundAsset,
  normalizeFontAsset,
  normalizeGraphicAsset,
  normalizePhotoAsset,
  toDirectPage,
  type ApiListSuccess,
  type BackgroundApiRow,
  type DirectListSuccess,
  type FontApiRow,
  type PhotoApiRow,
  type ShapeApiRow,
} from "./tooldiCatalogAssetMapper.js";
import { TooldiCatalogSourceHttpClient } from "./tooldiCatalogSourceHttp.js";

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
  private readonly httpClient: TooldiCatalogSourceHttpClient;

  constructor(options: CreateTooldiApiCatalogSourceClientOptions) {
    this.httpClient = new TooldiCatalogSourceHttpClient(options);
  }

  async searchBackgroundAssets(
    query: SearchBackgroundAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiBackgroundAsset>> {
    const path = "/editor/get_background_contents";
    const response = await this.httpClient.postJson<ApiListSuccess<BackgroundApiRow>>(
      path,
      {
        type: query.type,
        page: query.page,
        ...(query.keyword ? { keyword: query.keyword } : {}),
        ...(query.source ? { source: query.source } : {}),
      },
    );
    assertListSuccessResponse(response, `${this.httpClient.baseUrl}${path}`);
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
    const path = "/shape";
    const response = await this.httpClient.postJson<DirectListSuccess<ShapeApiRow>>(
      path,
      {
        page: toDirectPage(query.page),
        ...(query.keyword ? { keyword: query.keyword } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.price ? { price: mapPriceToLegacyCode(query.price) } : {}),
        ...(query.sort ? { sort: query.sort } : {}),
        ...(query.owner ? { owner: query.owner } : {}),
        ...(query.theme ? { theme: query.theme } : {}),
        ...(query.method ? { method: query.method } : {}),
      },
    );
    assertDirectListResponse(response, `${this.httpClient.baseUrl}${path}`);
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
    const path = "/picture";
    const response = await this.httpClient.postJson<DirectListSuccess<PhotoApiRow>>(
      path,
      {
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
    );
    assertDirectListResponse(response, `${this.httpClient.baseUrl}${path}`);
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
    const path = "/editor/loadFont";
    const response = await this.httpClient.getJson<FontApiRow[]>(path);
    if (!Array.isArray(response)) {
      throw new TooldiCatalogSourceError({
        code: "invalid_response",
        message: "Tooldi font catalog returned an invalid payload",
        url: `${this.httpClient.baseUrl}${path}`,
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
}

export function createPlaceholderTooldiCatalogSourceClient(): TooldiCatalogSourceClient {
  return new PlaceholderTooldiCatalogSourceClient();
}

export function createTooldiApiCatalogSourceClient(
  options: CreateTooldiApiCatalogSourceClientOptions,
): TooldiCatalogSourceClient {
  return new TooldiApiCatalogSourceClient(options);
}
