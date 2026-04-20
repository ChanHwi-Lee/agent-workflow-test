import {
  METHOD_B_DEFAULT_MODEL,
  METHOD_B_SYSTEM_PROMPT,
} from "./v5MethodBSystemPrompt.js";

export interface MethodBHtmlGenOptions {
  readonly prompt: string;
  readonly apiKey: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface MethodBUsage {
  readonly promptTokenCount: number | null;
  readonly candidatesTokenCount: number | null;
  readonly totalTokenCount: number | null;
  readonly thoughtsTokenCount: number | null;
  readonly cachedContentTokenCount: number | null;
}

export interface MethodBHtmlGenResult {
  readonly model: string;
  readonly html: string;
  readonly latencyMs: number;
  readonly finishReason: string | null;
  readonly usage: MethodBUsage | null;
  readonly finishedAt: string;
}

export class MethodBGenerationError extends Error {
  readonly status: number | null;
  readonly body: unknown;
  constructor(message: string, status: number | null, body: unknown) {
    super(message);
    this.name = "MethodBGenerationError";
    this.status = status;
    this.body = body;
  }
}

const GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function runMethodBHtmlGen(
  options: MethodBHtmlGenOptions,
): Promise<MethodBHtmlGenResult> {
  const model = options.model ?? METHOD_B_DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const generationConfig = {
    temperature: options.temperature ?? 0.2,
    topP: options.topP ?? 0.95,
    maxOutputTokens: options.maxOutputTokens ?? 8192,
  };

  const url = `${GEMINI_REST_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`;
  const body = {
    systemInstruction: {
      role: "system",
      parts: [{ text: METHOD_B_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: options.prompt }],
      },
    ],
    generationConfig,
  };

  const startedAt = Date.now();
  const resp = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - startedAt;
  const rawText = await resp.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new MethodBGenerationError(
      `non-json response status=${resp.status}: ${rawText.slice(0, 200)}`,
      resp.status,
      rawText,
    );
  }

  const body_ = parsed as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
      thoughtsTokenCount?: number;
      cachedContentTokenCount?: number;
    };
    error?: { status?: string; message?: string };
  };

  if (!resp.ok || body_.error) {
    const message = `api-error status=${resp.status} ${body_.error?.status ?? ""} ${body_.error?.message ?? ""}`.slice(
      0,
      400,
    );
    throw new MethodBGenerationError(message, resp.status, parsed);
  }

  const candidate = body_.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const html = parts.map((p) => p.text ?? "").join("");
  const usage = body_.usageMetadata ?? null;

  return {
    model,
    html,
    latencyMs,
    finishReason: candidate?.finishReason ?? null,
    usage: usage
      ? {
          promptTokenCount: usage.promptTokenCount ?? null,
          candidatesTokenCount: usage.candidatesTokenCount ?? null,
          totalTokenCount: usage.totalTokenCount ?? null,
          thoughtsTokenCount: usage.thoughtsTokenCount ?? null,
          cachedContentTokenCount: usage.cachedContentTokenCount ?? null,
        }
      : null,
    finishedAt: new Date().toISOString(),
  };
}
