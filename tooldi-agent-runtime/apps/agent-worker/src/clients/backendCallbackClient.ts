import type {
  RunFinalizeRequest,
  WaitMutationAckQuery,
  WaitMutationAckResponse,
  WorkerAppendEventRequest,
  WorkerAppendEventResponse,
  WorkerFinalizeResponse,
  WorkerHeartbeatRequest,
  WorkerHeartbeatResponse,
} from "@tooldi/agent-contracts";
import {
  firstWaitMutationAckResponseError,
  firstWorkerAppendEventResponseError,
  firstWorkerFinalizeResponseError,
  firstWorkerHeartbeatResponseError,
  isWaitMutationAckResponse,
  isWorkerAppendEventResponse,
  isWorkerFinalizeResponse,
  isWorkerHeartbeatResponse,
} from "@tooldi/agent-contracts";
import type { Logger } from "@tooldi/agent-observability";

export interface BackendCallbackClient {
  heartbeat(
    runId: string,
    request: WorkerHeartbeatRequest,
  ): Promise<WorkerHeartbeatResponse>;
  appendEvent(
    runId: string,
    request: WorkerAppendEventRequest,
  ): Promise<WorkerAppendEventResponse>;
  waitMutationAck(
    runId: string,
    mutationId: string,
    query: WaitMutationAckQuery,
  ): Promise<WaitMutationAckResponse>;
  finalize(
    runId: string,
    request: RunFinalizeRequest,
  ): Promise<WorkerFinalizeResponse>;
}

export interface CreateBackendCallbackClientOptions {
  logger: Logger;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

class HttpBackendCallbackClient implements BackendCallbackClient {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly logger: Logger,
    private readonly baseUrl: string,
    fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async heartbeat(
    runId: string,
    request: WorkerHeartbeatRequest,
  ): Promise<WorkerHeartbeatResponse> {
    const payload = await this.requestJson({
      method: "POST",
      url: this.buildRunUrl(runId, "heartbeats"),
      body: request,
    });
    if (!isWorkerHeartbeatResponse(payload)) {
      throw new Error(
        firstWorkerHeartbeatResponseError(payload) ??
          "Heartbeat response failed shared contract validation",
      );
    }
    return payload;
  }

  async appendEvent(
    runId: string,
    request: WorkerAppendEventRequest,
  ): Promise<WorkerAppendEventResponse> {
    const payload = await this.requestJson({
      method: "POST",
      url: this.buildRunUrl(runId, "events"),
      body: request,
    });
    if (!isWorkerAppendEventResponse(payload)) {
      throw new Error(
        firstWorkerAppendEventResponseError(payload) ??
          "Append event response failed shared contract validation",
      );
    }
    return payload;
  }

  async waitMutationAck(
    runId: string,
    mutationId: string,
    query: WaitMutationAckQuery,
  ): Promise<WaitMutationAckResponse> {
    const url = new URL(
      `/internal/agent-workflow/runs/${encodeURIComponent(runId)}/mutations/${encodeURIComponent(mutationId)}/acks`,
      this.baseUrl,
    );
    if (query.waitMs !== undefined) {
      url.searchParams.set("waitMs", String(query.waitMs));
    }

    const payload = await this.requestJson({
      method: "GET",
      url,
    });
    if (!isWaitMutationAckResponse(payload)) {
      throw new Error(
        firstWaitMutationAckResponseError(payload) ??
          "Wait mutation ack response failed shared contract validation",
      );
    }
    return payload;
  }

  async finalize(
    runId: string,
    request: RunFinalizeRequest,
  ): Promise<WorkerFinalizeResponse> {
    const payload = await this.requestJson({
      method: "POST",
      url: this.buildRunUrl(runId, "finalize"),
      body: request,
    });
    if (!isWorkerFinalizeResponse(payload)) {
      throw new Error(
        firstWorkerFinalizeResponseError(payload) ??
          "Finalize response failed shared contract validation",
      );
    }
    return payload;
  }

  private buildRunUrl(runId: string, suffix: string): URL {
    return new URL(
      `/internal/agent-workflow/runs/${encodeURIComponent(runId)}/${suffix}`,
      this.baseUrl,
    );
  }

  private async requestJson(input: {
    method: "GET" | "POST";
    url: URL;
    body?: object;
  }): Promise<unknown> {
    this.logger.debug("Worker backend callback request", {
      method: input.method,
      url: input.url.toString(),
    });

    const requestInit: RequestInit = {
      method: input.method,
      ...(input.body
        ? {
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify(input.body),
          }
        : {}),
    };

    const response = await this.fetchImpl(input.url, requestInit);

    const payload = await this.readJsonPayload(response);
    if (!response.ok) {
      throw new Error(
        `Backend callback ${input.method} ${input.url.pathname} failed with ${response.status}: ${this.describeErrorPayload(payload)}`,
      );
    }
    return payload;
  }

  private async readJsonPayload(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      if (text.length === 0) {
        return null;
      }
      return text;
    }
    return response.json();
  }

  private describeErrorPayload(payload: unknown): string {
    if (typeof payload === "string" && payload.length > 0) {
      return payload;
    }
    if (
      payload &&
      typeof payload === "object" &&
      "message" in payload &&
      typeof payload.message === "string"
    ) {
      return payload.message;
    }
    return "Unexpected error response";
  }
}

export function createBackendCallbackClient(
  options: CreateBackendCallbackClientOptions,
): BackendCallbackClient {
  return new HttpBackendCallbackClient(
    options.logger,
    options.baseUrl,
    options.fetchImpl,
  );
}
