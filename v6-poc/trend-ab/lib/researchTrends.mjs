// Trend research node — Gemini with google_search grounding tool.
//
// Takes a user design prompt, returns a compact textual summary of current
// visual trends relevant to the subject, to be spliced into the HTML gen
// prompt. The search tool is a native Gemini capability (docs:
// https://ai.google.dev/gemini-api/docs/google-search).
//
// Design notes:
//   - Domain-scoped system prompt — only color/typography/composition/motifs/
//     tone for Korean design editor use. Ignores pricing, legal, UX.
//   - Output is structured JSON (model returns JSON; we also accept prose
//     fallback if JSON parsing fails).
//   - Grounding model: gemini-3-flash-preview (docs-confirmed tool support).
//     Kept separate from HTML-gen model so A/B only changes the *context*
//     injected, not the HTML-gen model itself.

import { callGemini, GeminiError } from './callGemini.mjs';

const TREND_MODEL = 'gemini-3-flash-preview';

const TREND_SYSTEM_PROMPT = `You are a visual-design-trend researcher for a Korean canvas editor (Tooldi). You will receive a user design request and must search the live web for the most relevant and recent visual trends that would make the resulting design feel current and resonate with its target audience.

Focus scope (in priority order):
1. Color palette — currently popular color combinations for this subject/audience (not evergreen defaults).
2. Typography — weight patterns, scale, which styles feel modern now.
3. Composition — layout patterns trending on SNS / e-commerce banners for similar subjects.
4. Visual motifs — icon styles, shape languages, decorative elements currently popular.
5. Tone — is the target audience responding to minimal/maximal, elegant/playful at the moment?

Scope and limits:
- Korea-first (서울 기준). Global trends only if directly relevant.
- Today's date is 2026-04-21. Bias toward 2025H2–2026 signal.
- Ignore: pricing, product specs, legal text, UX/interaction patterns, copywriting, accessibility.
- Absolutely no fabrication. If you find nothing specific for this subject, say so in the notes field; do not invent.

Output: a single JSON object, no markdown fences, no surrounding prose. Schema:
{
  "summary": "2-3 sentences distilling the current visual direction for this subject",
  "palette": ["#RRGGBB", "#RRGGBB", ...],
  "typography": { "weight": "..", "scale": "..", "notes": ".." },
  "composition": "1-2 sentence layout pattern description",
  "motifs": ["decoration/icon cue", ...],
  "tone": "..",
  "notes": "any gaps or caveats"
}`;

export async function researchTrends({ apiKey, userPrompt, debug = false }) {
  const { text, latencyMs, groundingMetadata, usage } = await callGemini({
    apiKey,
    model: TREND_MODEL,
    systemInstruction: TREND_SYSTEM_PROMPT,
    userText: `Design request to research:\n${userPrompt.trim()}\n\nYou MUST use the google_search tool at least once to find concrete, recent references. Do not answer from memory alone — search for current sources in Korean design, SNS trends, and e-commerce banners for this subject. Cite every fact.`,
    tools: [{ google_search: {} }],
    temperature: 0.3,
    topP: 0.95,
    maxOutputTokens: 2048,
  });
  if (debug) {
    console.error('[trend debug] groundingMetadata keys:',
      groundingMetadata ? Object.keys(groundingMetadata) : null);
    console.error('[trend debug] groundingMetadata:',
      JSON.stringify(groundingMetadata, null, 2)?.slice(0, 2000));
  }

  const trend = parseTrendJson(text);
  const citations = (groundingMetadata?.groundingChunks ?? [])
    .map((c) => ({ title: c.web?.title ?? c.title ?? null, uri: c.web?.uri ?? c.uri ?? null }))
    .filter((c) => c.uri);
  // Filter out the empty-string placeholder Gemini sometimes emits at index 0.
  const searchQueries = (groundingMetadata?.webSearchQueries ?? []).filter((q) => typeof q === 'string' && q.trim().length > 0);

  const contextForHtmlGen = formatTrendForPrompt(trend);

  return {
    model: TREND_MODEL,
    rawText: text,
    trend,
    citations,
    searchQueries,
    contextForHtmlGen,
    latencyMs,
    usage,
  };
}

function parseTrendJson(text) {
  if (!text) return null;
  let s = text.trim();
  const fenceOpen = /^```(?:json|JSON)?\s*\n?/.exec(s);
  if (fenceOpen) {
    s = s.slice(fenceOpen[0].length);
    const fenceClose = /\n?```\s*$/.exec(s);
    if (fenceClose) s = s.slice(0, fenceClose.index);
  }
  try {
    return JSON.parse(s);
  } catch {
    // Extract first {...} block
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return { raw: s };
    try {
      return JSON.parse(m[0]);
    } catch {
      return { raw: s };
    }
  }
}

function formatTrendForPrompt(trend) {
  if (!trend) return '';
  if (trend.raw) return trend.raw;
  const lines = [];
  if (trend.summary) lines.push(`Summary: ${trend.summary}`);
  if (Array.isArray(trend.palette) && trend.palette.length) {
    lines.push(`Palette (use as inspiration, pick 2-4): ${trend.palette.join(', ')}`);
  }
  if (trend.typography) {
    const t = trend.typography;
    const tparts = [];
    if (t.weight) tparts.push(`weight=${t.weight}`);
    if (t.scale) tparts.push(`scale=${t.scale}`);
    if (t.notes) tparts.push(`notes=${t.notes}`);
    if (tparts.length) lines.push(`Typography: ${tparts.join('; ')}`);
  }
  if (trend.composition) lines.push(`Composition: ${trend.composition}`);
  if (Array.isArray(trend.motifs) && trend.motifs.length) {
    lines.push(`Motifs: ${trend.motifs.join(', ')}`);
  }
  if (trend.tone) lines.push(`Tone: ${trend.tone}`);
  if (trend.notes) lines.push(`Notes: ${trend.notes}`);
  return lines.join('\n');
}

export { GeminiError };
