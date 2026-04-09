import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type {
  TooldiCatalogSourceClient,
  TooldiCatalogSourceMode,
} from "@tooldi/tool-adapters";
import {
  createPlaceholderTooldiCatalogSourceClient,
  createTooldiApiCatalogSourceClient,
} from "@tooldi/tool-adapters";

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
  TooldiCatalogSourceError,
  TooldiCatalogSourceFamily,
  TooldiCatalogSourceMode,
  TooldiFontAsset,
  TooldiGraphicAsset,
  TooldiPhotoAsset,
} from "@tooldi/tool-adapters";

export function createTooldiCatalogSourceClient(
  env: AgentWorkerEnv,
): TooldiCatalogSourceClient {
  return createTooldiCatalogSourceClientForMode(env.tooldiCatalogSourceMode, env);
}

export function createTooldiCatalogSourceClientForMode(
  mode: TooldiCatalogSourceMode,
  env: Pick<
    AgentWorkerEnv,
    "tooldiContentApiBaseUrl" | "tooldiContentApiTimeoutMs" | "tooldiContentApiCookie"
  >,
): TooldiCatalogSourceClient {
  if (mode === "tooldi_api" || mode === "tooldi_api_direct") {
    if (!env.tooldiContentApiBaseUrl) {
      throw new Error(
        "TOOLDI_CONTENT_API_BASE_URL is required when TOOLDI_CATALOG_SOURCE_MODE is a real Tooldi API mode",
      );
    }

    const baseUrl = new URL(env.tooldiContentApiBaseUrl);
    if (baseUrl.hostname !== "localhost") {
      throw new Error(
        "TOOLDI_CONTENT_API_BASE_URL must use localhost when TOOLDI_CATALOG_SOURCE_MODE uses Tooldi API transport",
      );
    }

    return createTooldiApiCatalogSourceClient({
      baseUrl: baseUrl.toString(),
      timeoutMs: env.tooldiContentApiTimeoutMs,
      cookieHeader: env.tooldiContentApiCookie,
    });
  }

  return createPlaceholderTooldiCatalogSourceClient();
}
