export interface AgwPublishRequest {
  runId: string;
  base64: string;
  mimeType: string;
  fileExt: string;
  slotIndex: number;
  prompt?: string;
  model?: string;
}

export interface AgwPublishResult {
  publicUrl: string;
  fileName: string;
  userFileSerial: string;
}

export interface AgwAssetPublishClient {
  publishAsset(req: AgwPublishRequest): Promise<AgwPublishResult>;
}

export interface CreateAgwAssetPublishClientOptions {
  baseUrl: string;
  workerInternalToken: string;
  fetchImpl?: typeof fetch;
}

const PUBLISH_TIMEOUT_MS = 5_000;
const PUBLISH_URL_PATH = "/internal/agent-workflow/agw-ai-asset-publish";

class HttpAgwAssetPublishClient implements AgwAssetPublishClient {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    private readonly workerInternalToken: string,
    fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async publishAsset(req: AgwPublishRequest): Promise<AgwPublishResult> {
    try {
      return await this.doRequest(req);
    } catch {
      return await this.doRequest(req);
    }
  }

  private async doRequest(req: AgwPublishRequest): Promise<AgwPublishResult> {
    const url = new URL(PUBLISH_URL_PATH, this.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PUBLISH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-agent-worker-token": this.workerInternalToken,
        },
        body: JSON.stringify({
          runId: req.runId,
          base64: req.base64,
          mimeType: req.mimeType,
          fileExt: req.fileExt,
          slotIndex: req.slotIndex,
          ...(req.prompt !== undefined ? { prompt: req.prompt } : {}),
          ...(req.model !== undefined ? { model: req.model } : {}),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const data = (await response.json()) as {
      publicUrl?: string;
      fileName?: string;
      userFileSerial?: string;
      message?: string;
    };

    if (!response.ok) {
      throw new Error(
        `agw-ai-asset-publish ${response.status}: ${data.message ?? "unknown error"}`,
      );
    }

    if (
      typeof data.publicUrl !== "string" ||
      typeof data.fileName !== "string" ||
      typeof data.userFileSerial !== "string"
    ) {
      throw new Error("agw-ai-asset-publish returned unexpected response shape");
    }

    return {
      publicUrl: data.publicUrl,
      fileName: data.fileName,
      userFileSerial: data.userFileSerial,
    };
  }
}

export function createAgwAssetPublishClient(
  options: CreateAgwAssetPublishClientOptions,
): AgwAssetPublishClient {
  return new HttpAgwAssetPublishClient(
    options.baseUrl,
    options.workerInternalToken,
    options.fetchImpl,
  );
}
