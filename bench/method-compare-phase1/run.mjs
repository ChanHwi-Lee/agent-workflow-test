// Method-compare Phase-1 runner.
// Calls a Gemini model once per (prompt, method) cell and persists raw outputs.
//
// Usage:
//   node run.mjs                                             (default: model=gemini-2.5-pro, outputSubdir=outputs)
//   node run.mjs --only=method-a
//   node run.mjs --limit=3
//   node run.mjs --model=gemini-3.1-pro-preview --outputSubdir=outputs-3.1-pro
//
// Env: GOOGLE_API_KEY (loaded via dotenv from ../../tooldi-agent-runtime/.env.local)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENV_PATH = resolve(__dirname, "../../tooldi-agent-runtime/.env.local");
dotenvConfig({ path: ENV_PATH });

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
  console.error(`[run] GOOGLE_API_KEY missing. Expected in ${ENV_PATH}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const MODEL_ID = args.model ?? "gemini-2.5-pro";
const OUTPUT_SUBDIR = args.outputSubdir ?? "outputs";
const MAX_CONCURRENCY = args.concurrency ? Number.parseInt(args.concurrency, 10) : 3;
const MAX_RETRIES = 2; // initial + 2 retries (for 429 / preview throttling)

const only = args.only ?? null; // "method-a" | "method-b" | null
const limit = args.limit ? Number.parseInt(args.limit, 10) : null;

const prompts = JSON.parse(
  await readFile(resolve(__dirname, "prompts.json"), "utf8")
);
const promptsToRun = limit ? prompts.slice(0, limit) : prompts;

const systemA = await readFile(resolve(__dirname, "method-a-system.txt"), "utf8");
const systemB = await readFile(resolve(__dirname, "method-b-system.txt"), "utf8");
const systemC = await readFile(resolve(__dirname, "method-c-system.txt"), "utf8");

// Canvas size for method-c (v6 free HTML). method-a/b do not require canvas
// size in the user message; method-c does because the v6 system prompt says
// "canvas size is given in the user message". Mirrors runtime
// `buildV6UserMessage` in `apps/agent-worker/src/phases/v6SystemPrompt.ts`.
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 628;

function parseArgs(argv) {
  const out = {};
  for (const tok of argv) {
    if (tok.startsWith("--")) {
      const [k, v] = tok.slice(2).split("=");
      out[k] = v ?? true;
    }
  }
  return out;
}

function methodsToRun() {
  if (only === "method-a") return ["method-a"];
  if (only === "method-b") return ["method-b"];
  if (only === "method-c") return ["method-c"];
  return ["method-a", "method-b", "method-c"];
}

function systemPromptFor(method) {
  if (method === "method-a") return systemA;
  if (method === "method-b") return systemB;
  return systemC;
}

function userMessageFor(method, prompt) {
  if (method === "method-c") {
    return `Canvas: ${CANVAS_WIDTH}px × ${CANVAS_HEIGHT}px.\n\nUser request:\n${prompt.trim()}`;
  }
  return prompt;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Direct REST call — gives us full usageMetadata (incl. thoughtsTokenCount)
// and avoids SDK-version drift for preview model ids.
async function callGeminiRest({ method, prompt }) {
  const systemInstruction = systemPromptFor(method);
  const userText = userMessageFor(method, prompt);
  const generationConfig = {
    temperature: method === "method-c" ? 0.7 : 0.2,
    topP: 0.95,
    maxOutputTokens: 8192,
  };
  if (method === "method-a") {
    generationConfig.responseMimeType = "application/json";
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${GOOGLE_API_KEY}`;
  const body = {
    systemInstruction: { role: "system", parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig,
  };

  const startedAt = Date.now();
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - startedAt;

  const rawText = await resp.text();
  let j;
  try {
    j = JSON.parse(rawText);
  } catch (err) {
    const e = new Error(`non-json response status=${resp.status}: ${rawText.slice(0, 200)}`);
    e.status = resp.status;
    throw e;
  }

  if (!resp.ok || j.error) {
    const e = new Error(
      `api-error status=${resp.status} ${j.error?.status ?? ""} ${j.error?.message ?? ""}`.slice(0, 400)
    );
    e.status = resp.status;
    e.body = j;
    throw e;
  }

  // extract text
  const cand = j.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  const usage = j.usageMetadata ?? null;

  // Method A fallback: if responseMimeType=json failed to produce JSON (e.g. model strips braces),
  // we still persist raw text; grader handles fence stripping.
  return {
    model: MODEL_ID,
    method,
    prompt,
    latencyMs,
    outputText: text,
    outputBytes: Buffer.byteLength(text, "utf8"),
    usage: usage
      ? {
          promptTokenCount: usage.promptTokenCount ?? null,
          candidatesTokenCount: usage.candidatesTokenCount ?? null,
          totalTokenCount: usage.totalTokenCount ?? null,
          thoughtsTokenCount: usage.thoughtsTokenCount ?? null,
          cachedContentTokenCount: usage.cachedContentTokenCount ?? null,
        }
      : null,
    finishReason: cand?.finishReason ?? null,
    finishedAt: new Date().toISOString(),
  };
}

async function runCell({ method, promptDef }) {
  const outPath = resolve(__dirname, OUTPUT_SUBDIR, method, `${promptDef.id}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callGeminiRest({ method, prompt: promptDef.prompt });
      const record = {
        id: promptDef.id,
        domain: promptDef.domain,
        method,
        attempt,
        ok: true,
        ...result,
      };
      await writeFile(outPath, JSON.stringify(record, null, 2), "utf8");
      console.log(
        `[run] ok   model=${MODEL_ID} method=${method} ${promptDef.id} attempt=${attempt} latency=${result.latencyMs}ms bytes=${result.outputBytes} thought=${result.usage?.thoughtsTokenCount ?? "-"}`
      );
      return;
    } catch (err) {
      lastError = err;
      const is429 = err?.status === 429 || /rate|quota|RESOURCE_EXHAUSTED/i.test(err?.message ?? "");
      const backoff = is429 ? 6000 * (attempt + 1) : 1500 * (attempt + 1);
      console.warn(
        `[run] fail model=${MODEL_ID} method=${method} ${promptDef.id} attempt=${attempt} err=${(err?.message ?? String(err)).slice(0, 160)} backoff=${backoff}ms`
      );
      if (attempt < MAX_RETRIES) await sleep(backoff);
    }
  }
  const errorRecord = {
    id: promptDef.id,
    domain: promptDef.domain,
    method,
    model: MODEL_ID,
    ok: false,
    error: lastError?.message ?? String(lastError),
    finishedAt: new Date().toISOString(),
  };
  await writeFile(outPath, JSON.stringify(errorRecord, null, 2), "utf8");
}

async function runWithPool(tasks, concurrency) {
  const queue = tasks.slice();
  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) return;
      try {
        await task();
      } catch (err) {
        console.warn(`[run] worker caught err=${err?.message ?? String(err)}`);
      }
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
}

const methodList = methodsToRun();
const tasks = [];
for (const method of methodList) {
  for (const promptDef of promptsToRun) {
    tasks.push(() => runCell({ method, promptDef }));
  }
}

console.log(
  `[run] start model=${MODEL_ID} subdir=${OUTPUT_SUBDIR} calls=${tasks.length} methods=${methodList.join(",")} prompts=${promptsToRun.length} concurrency=${MAX_CONCURRENCY}`
);
const startedAt = Date.now();
await runWithPool(tasks, MAX_CONCURRENCY);
const elapsedMs = Date.now() - startedAt;
console.log(`[run] done model=${MODEL_ID} total=${tasks.length} elapsed=${elapsedMs}ms`);
