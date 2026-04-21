// AGW v6 HTML generator — Gemini REST caller for Stage 1.
//
// Philosophy lock:
//   - Stage 1 출력은 free HTML. grammar 검증은 Stage 1 이후 v6HtmlValidator
//     (security-only) 에서만 수행.
//   - 이 모듈은 REST 호출과 usage 메트릭 추출만 책임. 출력은 그대로 반환한다.

import {
  V6_DEFAULT_MODEL,
  V6_SYSTEM_PROMPT,
  buildV6UserMessage,
} from "./v6SystemPrompt.js";

export interface V6HtmlGenOptions {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly userPrompt: string;
  readonly apiKey: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface V6Usage {
  readonly promptTokenCount: number | null;
  readonly candidatesTokenCount: number | null;
  readonly totalTokenCount: number | null;
  readonly thoughtsTokenCount: number | null;
  readonly cachedContentTokenCount: number | null;
}

export interface V6HtmlGenResult {
  readonly model: string;
  readonly html: string;
  readonly rawHtml: string;
  readonly latencyMs: number;
  readonly finishReason: string | null;
  readonly usage: V6Usage | null;
  readonly finishedAt: string;
}

export class V6HtmlGenerationError extends Error {
  readonly status: number | null;
  readonly body: unknown;
  constructor(message: string, status: number | null, body: unknown) {
    super(message);
    this.name = "V6HtmlGenerationError";
    this.status = status;
    this.body = body;
  }
}

const GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function runV6HtmlGen(
  options: V6HtmlGenOptions,
): Promise<V6HtmlGenResult> {
  const model = options.model ?? V6_DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const generationConfig = {
    temperature: options.temperature ?? 0.7,
    topP: options.topP ?? 0.95,
    maxOutputTokens: options.maxOutputTokens ?? 8192,
  };

  const userMessage = buildV6UserMessage({
    canvasWidth: options.canvasWidth,
    canvasHeight: options.canvasHeight,
    userPrompt: options.userPrompt,
  });

  const url = `${GEMINI_REST_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`;
  const body = {
    systemInstruction: {
      role: "system",
      parts: [{ text: V6_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userMessage }],
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
    throw new V6HtmlGenerationError(
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
    throw new V6HtmlGenerationError(message, resp.status, parsed);
  }

  const candidate = body_.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const rawHtml = parts.map((p) => p.text ?? "").join("");
  const html = stripMarkdownFences(rawHtml);
  const usage = body_.usageMetadata ?? null;

  return {
    model,
    html,
    rawHtml,
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

/**
 * Strip a leading ```html / ``` fence and the trailing ``` if the model ignored
 * the "no markdown fences" instruction. Preserves anything that is already raw
 * HTML. Trims leading/trailing whitespace so downstream validators don't trip
 * on wrapper newlines.
 */
export function stripMarkdownFences(s: string): string {
  const trimmed = s.trim();
  const fenceOpen = /^```(?:html|HTML)?\s*\n?/.exec(trimmed);
  if (!fenceOpen) return trimmed;
  const withoutOpen = trimmed.slice(fenceOpen[0].length);
  const fenceClose = /\n?```\s*$/.exec(withoutOpen);
  if (!fenceClose) return withoutOpen.trim();
  return withoutOpen.slice(0, fenceClose.index).trim();
}
