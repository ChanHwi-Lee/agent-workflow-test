// v6 HTML generation — mirrors agent-worker/src/phases/v6HtmlGen.ts minus the
// TypeScript interfaces. Accepts optional trendContext; identical code path
// otherwise, so A (no context) vs B (with context) is the only difference.

import { callGemini } from './callGemini.mjs';
import { V6_SYSTEM_PROMPT, V6_DEFAULT_MODEL, buildV6UserMessage } from './v6SystemPrompt.mjs';

export async function generateHtml({ apiKey, canvasWidth, canvasHeight, userPrompt, trendContext, model = V6_DEFAULT_MODEL }) {
  const userText = buildV6UserMessage({ canvasWidth, canvasHeight, userPrompt, trendContext });
  const { text, latencyMs, finishReason, usage } = await callGemini({
    apiKey,
    model,
    systemInstruction: V6_SYSTEM_PROMPT,
    userText,
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: 8192,
  });
  const html = stripMarkdownFences(text);
  return { model, html, rawHtml: text, latencyMs, finishReason, usage, userText };
}

export function stripMarkdownFences(s) {
  if (typeof s !== 'string') return '';
  const trimmed = s.trim();
  const fenceOpen = /^```(?:html|HTML)?\s*\n?/.exec(trimmed);
  if (!fenceOpen) return trimmed;
  const withoutOpen = trimmed.slice(fenceOpen[0].length);
  const fenceClose = /\n?```\s*$/.exec(withoutOpen);
  if (!fenceClose) return withoutOpen.trim();
  return withoutOpen.slice(0, fenceClose.index).trim();
}
