// Gemini REST JSON caller — 인터뷰 질문 생성 / 자동 응답을 구조화 출력으로 받기
// 위한 경량 래퍼. agent-worker 의 v6HtmlGen 은 HTML 전용이라 별도 호출을 둔다.

const GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiJsonOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly thinkingLevel?: "minimal" | "low" | "medium" | "high";
  readonly responseSchema?: unknown;
  readonly fetchImpl?: typeof fetch;
}

export interface GeminiUsage {
  readonly promptTokenCount: number | null;
  readonly candidatesTokenCount: number | null;
  readonly totalTokenCount: number | null;
  readonly thoughtsTokenCount: number | null;
}

export interface GeminiJsonResult<T> {
  readonly data: T;
  readonly rawText: string;
  readonly model: string;
  readonly latencyMs: number;
  readonly finishReason: string | null;
  readonly usage: GeminiUsage | null;
}

export class GeminiJsonError extends Error {
  readonly status: number | null;
  readonly body: unknown;
  constructor(message: string, status: number | null, body: unknown) {
    super(message);
    this.name = "GeminiJsonError";
    this.status = status;
    this.body = body;
  }
}

export async function callGeminiJson<T>(
  options: GeminiJsonOptions,
): Promise<GeminiJsonResult<T>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature ?? 0.4,
    topP: options.topP ?? 0.95,
    maxOutputTokens: options.maxOutputTokens ?? 4096,
    responseMimeType: "application/json",
    thinkingConfig: { thinkingLevel: options.thinkingLevel ?? "low" },
  };
  if (options.responseSchema) {
    generationConfig.responseSchema = options.responseSchema;
  }

  const url = `${GEMINI_REST_BASE}/models/${encodeURIComponent(
    options.model,
  )}:generateContent?key=${encodeURIComponent(options.apiKey)}`;
  const body = {
    systemInstruction: {
      role: "system",
      parts: [{ text: options.systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: options.userPrompt }],
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
    throw new GeminiJsonError(
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
    };
    error?: { status?: string; message?: string };
  };

  if (!resp.ok || body_.error) {
    const message =
      `api-error status=${resp.status} ${body_.error?.status ?? ""} ${body_.error?.message ?? ""}`.slice(
        0,
        400,
      );
    throw new GeminiJsonError(message, resp.status, parsed);
  }

  const candidate = body_.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new GeminiJsonError(
      `model-output-not-json: ${text.slice(0, 200)}`,
      resp.status,
      text,
    );
  }
  const usage = body_.usageMetadata ?? null;

  return {
    data,
    rawText: text,
    model: options.model,
    latencyMs,
    finishReason: candidate?.finishReason ?? null,
    usage: usage
      ? {
          promptTokenCount: usage.promptTokenCount ?? null,
          candidatesTokenCount: usage.candidatesTokenCount ?? null,
          totalTokenCount: usage.totalTokenCount ?? null,
          thoughtsTokenCount: usage.thoughtsTokenCount ?? null,
        }
      : null,
  };
}
