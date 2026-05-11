import type { AgentWorkerEnv } from "@tooldi/agent-config";
import { traceLlmCall } from "@tooldi/agent-observability";

import { runClaudeCodeText } from "./v6ClaudeCodeHtmlGen.js";
import { stripMarkdownFences, type V6Usage } from "./v6HtmlGen.js";

const GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface V6DebugHtmlPreviewInput {
  readonly provider: AgentWorkerEnv["htmlGenProvider"];
  readonly googleApiKey: string | null;
  readonly claudeCodeModel: string;
  readonly claudeCodeEffort: AgentWorkerEnv["claudeCodeEffort"];
  readonly claudeCodeTimeoutMs: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly userPrompt: string;
  readonly trendContext: string | null;
}

export interface V6DebugHtmlPreviewArtifact {
  readonly kind: "unrestricted-html" | "v6-constrained-html";
  readonly model: string;
  readonly html: string;
  readonly rawHtml: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly userPrompt: string;
  readonly trendContext: string | null;
  readonly latencyMs: number;
  readonly usage: V6Usage | null;
  readonly generatedAt: string;
}

const UNRESTRICTED_HTML_SYSTEM_PROMPT = `You are a senior visual web designer creating a one-off HTML preview for a Korean design editor debug panel.

This preview is NOT used for editor conversion. It is only shown inside a sandboxed iframe for visual comparison against the editor-safe v6 HTML.

Design freedom:
- You may use normal HTML structure, <style> blocks, classes, CSS variables, gradients, filters, blend modes, pseudo-elements, keyframes, layout systems, and nested markup.
- You may create a full HTML document or a single root element.
- You may use placeholder:// image URLs for product/hero imagery; make the placeholder hint specific and useful.
- Do not include JavaScript, external scripts, external stylesheets, forms, inputs, iframes, video, audio, or network URLs other than placeholder:// image hints.

Output only renderable HTML. No markdown fences. No explanation.`;

export async function runV6UnrestrictedDebugHtmlPreview(
  input: V6DebugHtmlPreviewInput,
): Promise<V6DebugHtmlPreviewArtifact> {
  const prompt = buildUnrestrictedUserPrompt(input);

  if (input.provider === "claude_code") {
    const result = await runClaudeCodeText({
      prompt,
      systemPrompt: UNRESTRICTED_HTML_SYSTEM_PROMPT,
      model: input.claudeCodeModel,
      effort: input.claudeCodeEffort,
      timeoutMs: input.claudeCodeTimeoutMs,
      cwd: "/tmp",
    });

    if (result.timedOut || result.exitCode !== 0) {
      throw new Error(
        `claude debug html preview failed status=${result.exitCode} timedOut=${result.timedOut}: ${result.stderr.slice(0, 300)}`,
      );
    }

    const rawHtml = result.stdout.trim();
    return {
      kind: "unrestricted-html",
      model: `claude-code:${input.claudeCodeModel}`,
      html: stripMarkdownFences(rawHtml),
      rawHtml,
      canvasWidth: input.canvasWidth,
      canvasHeight: input.canvasHeight,
      userPrompt: input.userPrompt,
      trendContext: input.trendContext,
      latencyMs: result.latencyMs,
      usage: null,
      generatedAt: new Date().toISOString(),
    };
  }

  if (!input.googleApiKey) {
    throw new Error("GOOGLE_API_KEY is required for Gemini debug HTML preview");
  }

  return runGeminiUnrestrictedDebugHtmlPreview(input.googleApiKey, prompt, input);
}

export function buildV6ConstrainedDebugHtmlPreviewArtifact(input: {
  readonly model: string;
  readonly html: string;
  readonly rawHtml: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly userPrompt: string;
  readonly trendContext: string | null;
  readonly latencyMs: number;
  readonly usage: V6Usage | null;
}): V6DebugHtmlPreviewArtifact {
  return {
    kind: "v6-constrained-html",
    model: input.model,
    html: input.html,
    rawHtml: input.rawHtml,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    userPrompt: input.userPrompt,
    trendContext: input.trendContext,
    latencyMs: input.latencyMs,
    usage: input.usage,
    generatedAt: new Date().toISOString(),
  };
}

async function runGeminiUnrestrictedDebugHtmlPreview(
  apiKey: string,
  userText: string,
  input: V6DebugHtmlPreviewInput,
): Promise<V6DebugHtmlPreviewArtifact> {
  const model = "gemini-3.1-flash-lite-preview";
  const url = `${GEMINI_REST_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  return traceLlmCall(
    {
      name: "v6.debugHtmlPreview",
      model,
      provider: "google",
      invocationParams: { temperature: 0.85, topP: 0.95, maxOutputTokens: 8192 },
      tags: ["debug"],
    },
    async () => {
      const startedAt = Date.now();
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            role: "system",
            parts: [{ text: UNRESTRICTED_HTML_SYSTEM_PROMPT }],
          },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: {
            temperature: 0.85,
            topP: 0.95,
            maxOutputTokens: 8192,
          },
        }),
      });
      const latencyMs = Date.now() - startedAt;
      const rawResponse = await resp.text();
      const parsed = JSON.parse(rawResponse) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
          thoughtsTokenCount?: number;
          cachedContentTokenCount?: number;
        };
        error?: { status?: string; message?: string };
      };
      if (!resp.ok || parsed.error) {
        throw new Error(
          `Gemini debug html preview failed status=${resp.status}: ${parsed.error?.message ?? rawResponse.slice(0, 300)}`,
        );
      }
      const rawHtml = (parsed.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      const usage = parsed.usageMetadata;
      const artifact: V6DebugHtmlPreviewArtifact = {
        kind: "unrestricted-html",
        model,
        html: stripMarkdownFences(rawHtml),
        rawHtml,
        canvasWidth: input.canvasWidth,
        canvasHeight: input.canvasHeight,
        userPrompt: input.userPrompt,
        trendContext: input.trendContext,
        latencyMs,
        usage: usage
          ? {
              promptTokenCount: usage.promptTokenCount ?? null,
              candidatesTokenCount: usage.candidatesTokenCount ?? null,
              totalTokenCount: usage.totalTokenCount ?? null,
              thoughtsTokenCount: usage.thoughtsTokenCount ?? null,
              cachedContentTokenCount: usage.cachedContentTokenCount ?? null,
            }
          : null,
        generatedAt: new Date().toISOString(),
      };
      return {
        body: artifact,
        outputText: rawHtml,
        geminiUsage: usage ?? null,
      };
    },
  );
}

function buildUnrestrictedUserPrompt(input: V6DebugHtmlPreviewInput): string {
  const trendBlock = input.trendContext
    ? `\n\nDesign trend context to apply visually:\n${input.trendContext}`
    : "";
  return `Canvas: ${input.canvasWidth}px x ${input.canvasHeight}px

User request:
${input.userPrompt.trim()}${trendBlock}

Make a polished visual HTML preview that explores what the design could look like without Tooldi editor-safe HTML restrictions. Keep all factual text from the user request accurate.`;
}
