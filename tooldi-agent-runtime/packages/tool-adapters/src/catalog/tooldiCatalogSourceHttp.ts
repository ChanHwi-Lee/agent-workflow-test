import type { CreateTooldiApiCatalogSourceClientOptions } from "./tooldiCatalogSourceTypes.js";
import { TooldiCatalogSourceError } from "./tooldiCatalogSourceTypes.js";

type JsonRequest = {
  method: "GET" | "POST";
  body?: Record<string, unknown>;
};

export class TooldiCatalogSourceHttpClient {
  readonly baseUrl: string;
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

  async getJson<T>(path: string): Promise<T> {
    return this.fetchJson(path, { method: "GET" });
  }

  async postJson<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    return this.fetchJson(path, { method: "POST", body });
  }

  private async fetchJson<T>(path: string, request: JsonRequest): Promise<T> {
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
      const response = await this.fetchImpl(url, init);

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
