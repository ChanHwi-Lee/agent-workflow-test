import { traceLlmCall } from "@tooldi/agent-observability";

import type { V6Usage } from "./v6HtmlGen.js";

const GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TREND_TIMEOUT_MS = 30000;

export interface V6TrendCitation {
  readonly title: string | null;
  readonly uri: string;
}

export interface V6TrendTypography {
  readonly weight?: string;
  readonly scale?: string;
  readonly notes?: string;
}

export interface V6TrendBrief {
  readonly model: string;
  readonly summary: string;
  readonly palette: ReadonlyArray<string>;
  readonly typography: V6TrendTypography;
  readonly composition: string;
  readonly motifs: ReadonlyArray<string>;
  readonly tone: string;
  readonly notes: string;
  readonly searchQueries: ReadonlyArray<string>;
  readonly citations: ReadonlyArray<V6TrendCitation>;
  readonly contextForHtmlGen: string;
  readonly latencyMs: number;
  readonly usage: V6Usage | null;
  readonly generatedAt: string;
}

export interface V6TrendResearchInput {
  readonly runId: string;
  readonly traceId: string;
  readonly userPrompt: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly locale: string;
  readonly timezone: string;
  readonly now: string;
}

export interface V6TrendResearcher {
  research(input: V6TrendResearchInput): Promise<V6TrendBrief>;
}

export interface GeminiV6TrendResearcherOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
}

interface RawTrendJson {
  summary?: unknown;
  palette?: unknown;
  typography?: unknown;
  composition?: unknown;
  motifs?: unknown;
  tone?: unknown;
  notes?: unknown;
}

export class V6TrendResearchError extends Error {
  readonly status: number | null;
  readonly body: unknown;

  constructor(message: string, status: number | null, body: unknown) {
    super(message);
    this.name = "V6TrendResearchError";
    this.status = status;
    this.body = body;
  }
}

const TREND_SYSTEM_PROMPT = `You are a visual-design-trend researcher for a Korean canvas editor (Tooldi).

Research current visual trends for the user's design request and return only current visual direction that can improve a generated banner/poster design.

Focus only on:
1. Color palette
2. Typography
3. Composition
4. Visual motifs
5. Tone

Limits:
- Korea-first. Global trends only if directly relevant.
- Bias toward recent design/SNS/e-commerce references.
- Ignore pricing, product specs, legal text, interaction UX, accessibility, and copywriting.
- Do not fabricate. If evidence is weak, say so in notes.

Output a single JSON object, no markdown fences:
{
  "summary": "2-3 sentences",
  "palette": ["#RRGGBB", "#RRGGBB"],
  "typography": { "weight": "...", "scale": "...", "notes": "..." },
  "composition": "1-2 sentence visual layout direction",
  "motifs": ["motif cue"],
  "tone": "...",
  "notes": "gaps or caveats"
}`;

export function createGeminiV6TrendResearcher(
  options: GeminiV6TrendResearcherOptions,
): V6TrendResearcher {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TREND_TIMEOUT_MS;

  return {
    async research(input) {
      return traceLlmCall(
        {
          name: "v6.trendResearch",
          model: options.model,
          provider: "google",
          invocationParams: {
            temperature: 0.3,
            topP: 0.95,
            maxOutputTokens: 2048,
            grounding: "google_search",
          },
        },
        async () => {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const userText = buildTrendUserMessage(input);
        const url = `${GEMINI_REST_BASE}/models/${encodeURIComponent(options.model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`;
        const resp = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: {
              role: "system",
              parts: [{ text: TREND_SYSTEM_PROMPT }],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: userText }],
              },
            ],
            tools: [{ google_search: {} }],
            generationConfig: {
              temperature: 0.3,
              topP: 0.95,
              maxOutputTokens: 2048,
            },
          }),
        });
        const rawText = await resp.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          throw new V6TrendResearchError(
            `trend research returned non-json status=${resp.status}`,
            resp.status,
            rawText.slice(0, 500),
          );
        }

        const body = parsed as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            groundingMetadata?: {
              webSearchQueries?: unknown;
              groundingChunks?: Array<{
                web?: { title?: string; uri?: string };
                title?: string;
                uri?: string;
              }>;
            };
          }>;
          usageMetadata?: GeminiUsageMetadata;
          error?: { status?: string; message?: string };
        };

        if (!resp.ok || body.error) {
          throw new V6TrendResearchError(
            `trend research api-error status=${resp.status} ${body.error?.status ?? ""} ${body.error?.message ?? ""}`.slice(
              0,
              500,
            ),
            resp.status,
            parsed,
          );
        }

        const candidate = body.candidates?.[0];
        const text = (candidate?.content?.parts ?? [])
          .map((part) => part.text ?? "")
          .join("");
        const trend = normalizeTrendJson(parseTrendJson(text));
        const groundingMetadata = candidate?.groundingMetadata;
        const searchQueries = Array.isArray(groundingMetadata?.webSearchQueries)
          ? groundingMetadata.webSearchQueries.filter(
              (query): query is string =>
                typeof query === "string" && query.trim().length > 0,
            )
          : [];
        const citations = (groundingMetadata?.groundingChunks ?? [])
          .map((chunk) => ({
            title: chunk.web?.title ?? chunk.title ?? null,
            uri: chunk.web?.uri ?? chunk.uri ?? null,
          }))
          .filter((citation): citation is V6TrendCitation =>
            typeof citation.uri === "string" && citation.uri.length > 0,
          );

        const result: V6TrendBrief = {
          model: options.model,
          ...trend,
          searchQueries,
          citations,
          contextForHtmlGen: formatTrendForHtmlGen(trend),
          latencyMs: Date.now() - startedAt,
          usage: normalizeUsage(body.usageMetadata),
          generatedAt: new Date().toISOString(),
        };
        return {
          body: result,
          outputText: text,
          geminiUsage: body.usageMetadata ?? null,
        };
      } finally {
        clearTimeout(timeout);
      }
        },
      );
    },
  };
}

export class InMemoryV6TrendCache {
  private readonly entries = new Map<
    string,
    { readonly expiresAtMs: number; readonly value: V6TrendBrief }
  >();

  constructor(private readonly ttlSeconds: number) {}

  get(key: string): V6TrendBrief | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAtMs) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: V6TrendBrief): void {
    if (this.ttlSeconds <= 0) return;
    this.entries.set(key, {
      expiresAtMs: Date.now() + this.ttlSeconds * 1000,
      value,
    });
  }
}

export function buildV6TrendCacheKey(input: {
  readonly userPrompt: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly locale: string;
  readonly timezone: string;
  readonly now: string;
}): string {
  const week = input.now.slice(0, 10);
  return [
    normalizeCacheToken(input.locale),
    normalizeCacheToken(input.timezone),
    `${input.canvasWidth}x${input.canvasHeight}`,
    week,
    normalizeCacheToken(input.userPrompt),
  ].join("|");
}

export function formatTrendForHtmlGen(
  trend: Pick<
    V6TrendBrief,
    "summary" | "palette" | "typography" | "composition" | "motifs" | "tone" | "notes"
  >,
): string {
  const lines: string[] = [];
  lines.push("Design application brief from current visual trend research:");
  if (trend.summary) lines.push(`Current direction: ${trend.summary}`);
  if (trend.palette.length > 0) {
    lines.push(`Use palette direction: ${trend.palette.join(", ")}. Pick 2-4 colors that fit the user's subject; do not use all colors mechanically.`);
  }
  const typographyParts = [
    trend.typography.weight ? `weight=${trend.typography.weight}` : null,
    trend.typography.scale ? `scale=${trend.typography.scale}` : null,
    trend.typography.notes ? `notes=${trend.typography.notes}` : null,
  ].filter((part): part is string => Boolean(part));
  if (typographyParts.length > 0) {
    lines.push(`Typography direction: ${typographyParts.join("; ")}`);
  }
  if (trend.composition) {
    lines.push(`Composition direction: ${trend.composition}`);
  }
  if (trend.motifs.length > 0) {
    lines.push(`Must express at least two visual cues from these motifs through actual HTML/SVG/shape/image-placeholder elements, not only through text labels: ${trend.motifs.join(", ")}`);
  }
  if (trend.tone) {
    lines.push(`Tone to convey visually: ${trend.tone}`);
  }
  lines.push(
    "Primary visual rule: make the user's product/event visibly concrete. If the request names a product, create a clear product/hero visual area using placeholder:// image hints and/or SVG shapes, plus sensory details such as texture, lighting, condensation, material, ingredient, motion, or depth when relevant.",
  );
  lines.push(
    "Avoid: a generic flat card that only copies the palette; empty hero frames; decorative motifs with no connection to the requested subject.",
  );
  if (trend.notes) lines.push(`Caveats: ${trend.notes}`);
  return lines.join("\n");
}

function buildTrendUserMessage(input: V6TrendResearchInput): string {
  return `Design request:
${input.userPrompt.trim()}

Canvas: ${input.canvasWidth}px x ${input.canvasHeight}px
Locale: ${input.locale}
Timezone: ${input.timezone}
Current date/time: ${input.now}

You MUST use Google Search at least once to find concrete, recent references. Do not answer from memory alone. Cite every factual trend claim through grounding metadata.`;
}

function parseTrendJson(text: string): RawTrendJson {
  const trimmed = stripMarkdownFences(text);
  try {
    return JSON.parse(trimmed) as RawTrendJson;
  } catch {
    const match = /\{[\s\S]*\}/.exec(trimmed);
    if (!match) return { summary: trimmed };
    try {
      return JSON.parse(match[0]) as RawTrendJson;
    } catch {
      return { summary: trimmed };
    }
  }
}

function normalizeTrendJson(raw: RawTrendJson) {
  const typography =
    raw.typography && typeof raw.typography === "object"
      ? (raw.typography as Record<string, unknown>)
      : {};

  return {
    summary: readString(raw.summary),
    palette: readStringArray(raw.palette).filter((color) =>
      /^#[0-9a-fA-F]{6}$/.test(color),
    ),
    typography: {
      ...(readString(typography.weight)
        ? { weight: readString(typography.weight) }
        : {}),
      ...(readString(typography.scale)
        ? { scale: readString(typography.scale) }
        : {}),
      ...(readString(typography.notes)
        ? { notes: readString(typography.notes) }
        : {}),
    },
    composition: readString(raw.composition),
    motifs: readStringArray(raw.motifs),
    tone: readString(raw.tone),
    notes: readString(raw.notes),
  };
}

function normalizeUsage(usage: GeminiUsageMetadata | undefined): V6Usage | null {
  if (!usage) return null;
  return {
    promptTokenCount: usage.promptTokenCount ?? null,
    candidatesTokenCount: usage.candidatesTokenCount ?? null,
    totalTokenCount: usage.totalTokenCount ?? null,
    thoughtsTokenCount: usage.thoughtsTokenCount ?? null,
    cachedContentTokenCount: usage.cachedContentTokenCount ?? null,
  };
}

function stripMarkdownFences(s: string): string {
  const trimmed = s.trim();
  const fenceOpen = /^```(?:json|JSON)?\s*\n?/.exec(trimmed);
  if (!fenceOpen) return trimmed;
  const withoutOpen = trimmed.slice(fenceOpen[0].length);
  const fenceClose = /\n?```\s*$/.exec(withoutOpen);
  if (!fenceClose) return withoutOpen.trim();
  return withoutOpen.slice(0, fenceClose.index).trim();
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function normalizeCacheToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 240);
}
