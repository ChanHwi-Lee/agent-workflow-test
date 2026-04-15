export {
  TooldiCatalogSourceError,
  tooldiCatalogSourceModes,
} from "./tooldiCatalogSourceTypes.js";
export type {
  CreateTooldiApiCatalogSourceClientOptions,
  GetTemplateDocumentQuery,
  ListFontAssetsQuery,
  SearchBackgroundAssetsQuery,
  SearchGraphicAssetsQuery,
  SearchPhotoAssetsQuery,
  SearchTemplateAssetsQuery,
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
  TooldiTemplateAsset,
  TooldiTemplateDocument,
} from "./tooldiCatalogSourceTypes.js";

import type {
  CreateTooldiApiCatalogSourceClientOptions,
  GetTemplateDocumentQuery,
  ListFontAssetsQuery,
  SearchBackgroundAssetsQuery,
  SearchGraphicAssetsQuery,
  SearchPhotoAssetsQuery,
  SearchTemplateAssetsQuery,
  TooldiBackgroundAsset,
  TooldiCatalogSearchResult,
  TooldiCatalogSourceClient,
  TooldiFontAsset,
  TooldiGraphicAsset,
  TooldiPhotoAsset,
  TooldiTemplateAsset,
  TooldiTemplateDocument,
} from "./tooldiCatalogSourceTypes.js";
import { TooldiCatalogSourceError } from "./tooldiCatalogSourceTypes.js";

import {
  assertDirectListResponse,
  assertListSuccessResponse,
  mapPriceToLegacyCode,
  mapTemplatePriceToLegacyCode,
  normalizeBackgroundAsset,
  normalizeFontAsset,
  normalizeGraphicAsset,
  normalizePhotoAsset,
  normalizeTemplateListResponse,
  normalizeTemplateAsset,
  normalizeTemplateDocument,
  toDirectPage,
  type ApiListSuccess,
  type BackgroundApiRow,
  type DirectListSuccess,
  type FontApiRow,
  type PhotoApiRow,
  type ShapeApiRow,
  type TemplateApiRow,
  type TemplateDataApiResponse,
  type TemplateListApiResponse,
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

  async searchTemplateAssets(
    query: SearchTemplateAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiTemplateAsset>> {
    return {
      sourceFamily: "template_source",
      page: query.page,
      hasNextPage: false,
      traceId: null,
      assets: [],
    };
  }

  async getTemplateDocument(
    query: GetTemplateDocumentQuery,
  ): Promise<TooldiTemplateDocument> {
    return {
      code: query.templateCode,
      metaData: {
        code: query.templateCode,
        innerCode: "",
        title: "",
        width: "0",
        height: "0",
        sizeUnit: "px",
        isShare: false,
        userId: "",
        createdAt: "",
        modifiedAt: "",
        keyword: "",
      },
      canvas: {
        serial: "",
        title: "",
        width: "0",
        height: "0",
        sizeUnit: "px",
      },
      pages: [],
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

  async searchTemplateAssets(
    query: SearchTemplateAssetsQuery,
  ): Promise<TooldiCatalogSearchResult<TooldiTemplateAsset>> {
    const path = "/editor/get_templates";
    const response = await this.httpClient.postJson<TemplateListApiResponse>(
      path,
      {
        keyword: query.keyword,
        page: query.page,
        canvas: query.canvas ?? "",
        ...(query.price
          ? { price: mapTemplatePriceToLegacyCode(query.price) }
          : {}),
        follow: query.follow ?? false,
        categorySerial: query.categorySerial ?? "",
        ...(query.source ? { source: query.source } : {}),
      },
    );
    const normalized = normalizeTemplateListResponse(
      response,
      `${this.httpClient.baseUrl}${path}`,
    );
    return {
      sourceFamily: "template_source",
      page: normalized.page ?? query.page,
      hasNextPage: normalized.hasNextPage ?? false,
      traceId: normalized.trace_id ?? null,
      assets: normalized.data.map((asset) => normalizeTemplateAsset(asset)),
    };
  }

  async getTemplateDocument(
    query: GetTemplateDocumentQuery,
  ): Promise<TooldiTemplateDocument> {
    const path = "/editor/get_template_data";
    const encodedTemplateCode = isBase64Like(query.templateCode)
      ? query.templateCode
      : Buffer.from(query.templateCode, "utf8").toString("base64");
    const response = await this.httpClient.getJson<TemplateDataApiResponse>(
      `${path}?templateCode=${encodeURIComponent(encodedTemplateCode)}&isWorking=${query.isWorking === true ? "true" : "false"}`,
    );

    return normalizeTemplateDocument(
      response,
      { ...query, templateCode: query.templateCode },
      `${this.httpClient.baseUrl}${path}`,
    );
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

function isBase64Like(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) {
    return false;
  }
  return /^[A-Za-z0-9+/=]+$/.test(value);
}
