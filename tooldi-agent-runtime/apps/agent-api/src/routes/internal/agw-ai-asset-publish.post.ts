import type { FastifyPluginAsync } from "fastify";

import type { AgentApiEnv } from "@tooldi/agent-config";

import { AgentApiError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { RunRepository } from "../../repositories/runRepository.js";

interface AgwAssetPublishBody {
  runId: string;
  base64: string;
  mimeType: string;
  fileExt: string;
  slotIndex: number;
  prompt?: string;
  model?: string;
}

interface AgwAssetPublishResponse {
  publicUrl: string;
  fileName: string;
  userFileSerial: string;
}

interface AgwAssetPublishRoute {
  Body: Record<string, unknown>;
  Reply: AgwAssetPublishResponse;
}

const PUBLISH_TIMEOUT_MS = 5_000;

export const agwAssetPublishPostRoute: FastifyPluginAsync = async (app) => {
  app.post<AgwAssetPublishRoute>(
    "/internal/agent-workflow/agw-ai-asset-publish",
    { bodyLimit: 20 * 1024 * 1024 },
    async (request, reply) => {
      const tokenHeader = request.headers["x-agent-worker-token"];
      if (!tokenHeader || tokenHeader !== app.config.agentWorkerInternalToken) {
        throw new AgentApiError("authentication_error", "Invalid or missing worker token", 403);
      }

      const body = parseBody(request.body);

      const runRepository = new RunRepository(app.db);
      const run = await runRepository.findById(body.runId);
      if (!run) {
        throw new NotFoundError(`Run not found: ${body.runId}`);
      }

      if (!run.userSerial || run.userSerial === "0") {
        throw new ValidationError(
          `Run ${body.runId} has no valid userSerial; cannot publish asset`,
        );
      }

      const result = await callPhpPublishWithRetry(app.config, run.userSerial, body);
      return reply.code(200).send(result);
    },
  );
};

function parseBody(raw: Record<string, unknown>): AgwAssetPublishBody {
  const { runId, base64, mimeType, fileExt, slotIndex, prompt, model } = raw;
  if (
    typeof runId !== "string" || runId.trim().length === 0 ||
    typeof base64 !== "string" || base64.trim().length === 0 ||
    typeof mimeType !== "string" || mimeType.trim().length === 0 ||
    typeof fileExt !== "string" || fileExt.trim().length === 0 ||
    typeof slotIndex !== "number" || !Number.isInteger(slotIndex) || slotIndex < 0
  ) {
    throw new ValidationError("Missing or invalid required fields: runId, base64, mimeType, fileExt, slotIndex");
  }
  return {
    runId,
    base64,
    mimeType,
    fileExt,
    slotIndex,
    ...(typeof prompt === "string" ? { prompt } : {}),
    ...(typeof model === "string" ? { model } : {}),
  };
}

async function callPhpPublish(
  config: Pick<AgentApiEnv, "tooldiPhpApiBaseUrl" | "tooldiPhpInternalToken">,
  userSerial: string,
  body: AgwAssetPublishBody,
): Promise<AgwAssetPublishResponse> {
  const url = `${config.tooldiPhpApiBaseUrl}/AI/agw_asset_save`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLISH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tooldi-internal-token": config.tooldiPhpInternalToken,
      },
      body: JSON.stringify({
        user_serial: userSerial,
        base64: body.base64,
        mime_type: body.mimeType,
        file_ext: body.fileExt,
        run_id: body.runId,
        slot_index: body.slotIndex,
        prompt: body.prompt ?? "",
        model: body.model ?? "",
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`PHP agw_asset_save responded ${response.status}`);
  }

  const data = (await response.json()) as {
    result: boolean;
    public_url: string;
    file_name: string;
    user_file_serial: string | number;
  };

  if (!data.result) {
    throw new Error("PHP agw_asset_save returned result=false");
  }

  return {
    publicUrl: data.public_url,
    fileName: data.file_name,
    userFileSerial: String(data.user_file_serial),
  };
}

async function callPhpPublishWithRetry(
  config: Pick<AgentApiEnv, "tooldiPhpApiBaseUrl" | "tooldiPhpInternalToken">,
  userSerial: string,
  body: AgwAssetPublishBody,
): Promise<AgwAssetPublishResponse> {
  try {
    return await callPhpPublish(config, userSerial, body);
  } catch {
    return await callPhpPublish(config, userSerial, body);
  }
}
