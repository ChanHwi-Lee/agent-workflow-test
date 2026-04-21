// Gemini REST caller — matches the style of agent-worker/v6HtmlGen.ts and
// bench/method-compare-phase1/run.mjs. Adds optional `tools` support for the
// google_search grounding tool (docs: https://ai.google.dev/gemini-api/docs/google-search).

const GEMINI_REST_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.body = body;
  }
}

export async function callGemini({
  apiKey,
  model,
  systemInstruction,
  userText,
  tools,
  temperature = 0.7,
  topP = 0.95,
  maxOutputTokens = 8192,
  responseMimeType,
}) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: {
      temperature,
      topP,
      maxOutputTokens,
      ...(responseMimeType ? { responseMimeType } : {}),
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { role: 'system', parts: [{ text: systemInstruction }] };
  }
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const url = `${GEMINI_REST_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const startedAt = Date.now();
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - startedAt;
  const rawText = await resp.text();

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new GeminiError(
      `non-json response status=${resp.status}: ${rawText.slice(0, 300)}`,
      resp.status,
      rawText,
    );
  }

  if (!resp.ok || parsed.error) {
    throw new GeminiError(
      `api-error status=${resp.status} ${parsed.error?.status ?? ''} ${parsed.error?.message ?? ''}`.slice(0, 600),
      resp.status,
      parsed,
    );
  }

  const cand = parsed.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? '').join('');
  return {
    text,
    latencyMs,
    finishReason: cand?.finishReason ?? null,
    groundingMetadata: cand?.groundingMetadata ?? null,
    usage: parsed.usageMetadata ?? null,
  };
}
