#!/usr/bin/env node
// AGW v6 system-prompt strip — A/B offline bench harness.
//
// Calls Gemini REST directly, renders output HTML in headless Playwright,
// extracts geometry, and runs the v6 render-quality report. Bypasses the
// langgraph worker + toolditor frontend so the comparison is isolated to
// the prompt's effect on the LLM.
//
// Lossless trade-off: handoff §Locked Decisions records that v6 → Toolditor
// canvas mapping is lossless-verified, so the toolditor canvas screenshot is
// redundant with the v6-html preview screenshot. We only capture the latter.
//
// Usage:
//   GOOGLE_API_KEY=... node bench/v6-prompt-strip-ab/run-bench.mjs \
//     --variants A,B --runs 3 \
//     --out /tmp/v6-bench-AB/<TS>

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = resolve(__dirname, '../..');

const RUNTIME_DIST = resolve(
  WORKTREE_ROOT,
  'tooldi-agent-runtime/apps/agent-worker/dist/phases',
);

// Use the worktree's compiled dist for the live system prompts and geometry
// extraction. Both A and B are exported regardless of V6_PROMPT_VARIANT.
const promptModule = await import(`${RUNTIME_DIST}/v6SystemPrompt.js`);
const renderModule = await import(`${RUNTIME_DIST}/v6BrowserRender.js`);
const reportModule = await import(`${RUNTIME_DIST}/v6RenderQualityReport.js`);

const {
  V6_SYSTEM_PROMPT_A,
  V6_SYSTEM_PROMPT_B,
  V6_DEFAULT_MODEL,
  buildV6UserMessage,
} = promptModule;
const { renderAndExtract, launchEphemeralBrowser } = renderModule;
const { buildV6RenderQualityReport, formatV6RenderQualityRetryFeedback } =
  reportModule;

// 6 cases per handoff §A/B 6 케이스. Sourced from
// toolditor/scripts/agent-workflow-v6-bench-prompts.json (frozen snapshot
// inlined here so the harness is hermetic).
const CASES = [
  {
    id: '23-stress-image-product-ad',
    domain: '상품 광고',
    prompt:
      "이미지 중심의 신제품 무선 헤드폰 광고 배너. 제품이 가장 크게 보이고, 핵심 카피는 '몰입을 깨우는 사운드'. 보조 정보는 노이즈 캔슬링, 40시간 배터리, 사전예약 15% 할인만 간결하게. 어두운 배경에서도 제품 실루엣과 버튼이 묻히지 않게.",
    size: { width: 1200, height: 628 },
  },
  {
    id: '25-stress-square-card',
    domain: '정사각 카드',
    prompt:
      "인스타그램 정사각 카드형 광고. 작은 디저트 브랜드의 말차 티라미수 출시 소식. 제품 사진 느낌이 중심이고, '말차의 쌉싸름함과 크림의 부드러움'이라는 감성 카피, 출시일 5월 2일, 매장 한정 수량을 포함. 모바일 피드에서 읽히는 구성.",
    size: { width: 1080, height: 1080 },
  },
  {
    id: '26-stress-wide-banner',
    domain: '배너형 광고',
    prompt:
      '가로로 긴 웹 상단 배너 광고. 클라우드 백업 서비스 1년 플랜 30% 할인, 기업 보안 인증, 24시간 복구 지원, 무료 상담 신청. 높이가 낮은 배너에서도 로고 영역, 핵심 혜택, CTA가 눌리지 않고 정리되게 만들어줘.',
    size: { width: 1600, height: 400 },
  },
  {
    id: '18-mobile-game',
    domain: '게임',
    prompt:
      '모바일 RPG 신규 시즌 업데이트 배너. 신규 캐릭터 공개, 사전등록 보상 지급. 역동적이고 강한 판타지 게임 느낌, 지금 사전등록 CTA.',
    size: { width: 1200, height: 628 },
  },
  {
    id: '13-wedding-invitation',
    domain: '웨딩',
    prompt:
      '청첩장 제작 서비스 봄 웨딩 초대장 할인 배너. 샘플 신청 무료, 첫 주문 15% 할인. 우아하고 따뜻한 분위기, 샘플 받아보기 CTA.',
    size: { width: 1200, height: 628 },
  },
  {
    id: '21-stress-long-korean-copy',
    domain: '긴 카피',
    prompt:
      "긴 한국어 카피를 안정적으로 처리하는 브랜드 캠페인 배너. 헤드라인은 '오늘의 선택이 내일의 일상을 바꿉니다'. 서브카피는 친환경 소재, 지역 생산자 협업, 투명한 가격 정책, 7일 무료 반품, 첫 구매 10% 쿠폰을 모두 담아야 한다. 정보가 많지만 답답하지 않게 정돈하고 브랜드 신뢰감을 살려줘.",
    size: { width: 1200, height: 628 },
  },
];

const GEMINI_REST_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_GENERATION_ATTEMPTS = 2; // Matches v6PipelineNode: 1 initial + 1 retry.

function parseArgs(argv) {
  const args = {
    variants: ['A', 'B'],
    runs: 3,
    out: null,
    only: null,
    timeoutMs: 240000,
    model: V6_DEFAULT_MODEL,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (!v || v.startsWith('--'))
        throw new Error(`${a} requires a value`);
      i += 1;
      return v;
    };
    if (a === '--variants') args.variants = next().split(',').map((s) => s.trim().toUpperCase());
    else if (a === '--runs') args.runs = Number.parseInt(next(), 10);
    else if (a === '--out') args.out = resolve(next());
    else if (a === '--only') args.only = next();
    else if (a === '--timeout-ms') args.timeoutMs = Number.parseInt(next(), 10);
    else if (a === '--model') args.model = next();
    else if (a.startsWith('--out=')) args.out = resolve(a.slice('--out='.length));
    else if (a.startsWith('--only=')) args.only = a.slice('--only='.length);
    else if (a.startsWith('--variants=')) args.variants = a.slice('--variants='.length).split(',').map((s) => s.trim().toUpperCase());
    else if (a.startsWith('--runs=')) args.runs = Number.parseInt(a.slice('--runs='.length), 10);
    else if (a.startsWith('--model=')) args.model = a.slice('--model='.length);
    else throw new Error(`Unknown arg ${a}`);
  }
  if (!args.variants.every((v) => v === 'A' || v === 'B'))
    throw new Error('--variants must be subset of {A,B}');
  if (!Number.isFinite(args.runs) || args.runs < 1)
    throw new Error('--runs must be a positive integer');
  if (!args.out) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    args.out = resolve(`/tmp/v6-bench-AB/${ts}`);
  }
  return args;
}

function pickSystemPrompt(variant) {
  if (variant === 'B') return V6_SYSTEM_PROMPT_B;
  if (variant === 'A') return V6_SYSTEM_PROMPT_A;
  throw new Error(`Unknown variant: ${variant}`);
}

function buildUserMessage({ caseDef, retryFeedback }) {
  return buildV6UserMessage({
    canvasWidth: caseDef.size.width,
    canvasHeight: caseDef.size.height,
    userPrompt: caseDef.prompt,
    trendContext: null,
    renderQualityFeedback: retryFeedback ?? null,
  });
}

async function callGemini({ systemPrompt, userMessage, apiKey, model, timeoutMs }) {
  const url = `${GEMINI_REST_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature: 0.35,
      topP: 0.95,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Date.now() - startedAt;
  const rawText = await resp.text();
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(
      `non-json response status=${resp.status}: ${rawText.slice(0, 200)}`,
    );
  }
  if (!resp.ok || parsed?.error) {
    throw new Error(
      `gemini error status=${resp.status}: ${JSON.stringify(parsed?.error ?? parsed).slice(0, 400)}`,
    );
  }
  const candidates = parsed?.candidates ?? [];
  const parts = candidates[0]?.content?.parts ?? [];
  const text = parts.map((p) => p?.text ?? '').join('');
  if (!text)
    throw new Error(
      `gemini returned empty text; finishReason=${candidates[0]?.finishReason ?? '-'}`,
    );
  return {
    rawHtml: text,
    html: stripCodeFence(text),
    finishReason: candidates[0]?.finishReason ?? null,
    latencyMs,
    usage: parsed?.usageMetadata ?? null,
    model,
  };
}

function stripCodeFence(text) {
  let s = text.trim();
  if (s.startsWith('```')) {
    const firstNl = s.indexOf('\n');
    if (firstNl > 0) s = s.slice(firstNl + 1);
    if (s.endsWith('```')) s = s.slice(0, -3);
  }
  return s.trim();
}

async function loadEnvLocal() {
  // Mirror the env script: source .env.local from the runtime root.
  const envFile = resolve(WORKTREE_ROOT, 'tooldi-agent-runtime/.env.local');
  try {
    const text = await readFile(envFile, 'utf8');
    for (const line of text.split('\n')) {
      const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2];
      }
    }
  } catch {}
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8');
}

async function runOneGeneration({
  caseDef,
  variant,
  runIndex,
  outDir,
  apiKey,
  browser,
  timeoutMs,
  model,
}) {
  const systemPrompt = pickSystemPrompt(variant);
  const attempts = [];
  let retryFeedback = null;
  let lastReport = null;
  let lastHtml = null;
  const totalStart = Date.now();
  for (let i = 0; i < MAX_GENERATION_ATTEMPTS; i += 1) {
    const attemptIndex = i + 1;
    const userMessage = buildUserMessage({ caseDef, retryFeedback });
    let llm;
    try {
      llm = await callGemini({
        systemPrompt,
        userMessage,
        apiKey,
        model,
        timeoutMs,
      });
    } catch (error) {
      attempts.push({
        attempt: attemptIndex,
        status: 'llm_error',
        error: String(error instanceof Error ? error.message : error),
      });
      break;
    }
    lastHtml = llm.html;
    let extraction;
    try {
      extraction = await renderAndExtract(browser, llm.html, {
        canvas: { width: caseDef.size.width, height: caseDef.size.height },
      });
    } catch (error) {
      attempts.push({
        attempt: attemptIndex,
        status: 'render_error',
        error: String(error instanceof Error ? error.message : error),
        html: llm.html,
      });
      break;
    }
    const report = buildV6RenderQualityReport(extraction);
    lastReport = report;
    const passed = report.blockingIssues.length === 0;
    const attemptDir = join(outDir, 'attempts', String(attemptIndex).padStart(2, '0'));
    await ensureDir(attemptDir);
    await writeFile(join(attemptDir, 'html.html'), llm.html, 'utf8');
    await writeJson(join(attemptDir, 'render-quality-report.json'), report);
    await writeJson(join(attemptDir, 'llm.json'), {
      model: llm.model,
      finishReason: llm.finishReason,
      latencyMs: llm.latencyMs,
      usage: llm.usage,
      systemPromptLength: systemPrompt.length,
      userMessageLength: userMessage.length,
      retryFeedbackLength: retryFeedback?.length ?? 0,
      htmlLength: llm.html.length,
    });
    attempts.push({
      attempt: attemptIndex,
      status: passed ? 'pass' : 'fail_blocking',
      latencyMs: llm.latencyMs,
      blockingIssueCount: report.blockingIssues.length,
      issueCount: report.issues.length,
    });
    if (passed) break;
    if (attemptIndex >= MAX_GENERATION_ATTEMPTS) break;
    retryFeedback = formatV6RenderQualityRetryFeedback(report);
  }
  const totalMs = Date.now() - totalStart;
  // Save final outputs at top level (the last successful attempt, or last attempt overall).
  const finalAttempt = attempts[attempts.length - 1];
  if (lastHtml) await writeFile(join(outDir, 'html.html'), lastHtml, 'utf8');
  if (lastReport) await writeJson(join(outDir, 'render-quality-report.json'), lastReport);
  // Take a preview screenshot of the final HTML (what the user will see).
  let previewSavedAt = null;
  if (lastHtml) {
    try {
      previewSavedAt = await screenshotHtml({
        browser,
        html: lastHtml,
        outPath: join(outDir, 'preview.png'),
        size: caseDef.size,
      });
    } catch (error) {
      previewSavedAt = `error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const summary = {
    variant,
    caseId: caseDef.id,
    domain: caseDef.domain,
    runIndex,
    size: caseDef.size,
    prompt: caseDef.prompt,
    systemPromptLength: systemPrompt.length,
    attempts,
    finalStatus: finalAttempt?.status ?? 'no_attempt',
    firstPassPassed: attempts[0]?.status === 'pass',
    finalPassed: finalAttempt?.status === 'pass',
    blockingIssueCount: lastReport?.blockingIssues.length ?? null,
    totalLatencyMs: totalMs,
    llmCallCount: attempts.length,
    previewSavedAt,
  };
  await writeJson(join(outDir, 'summary.json'), summary);
  return summary;
}

async function screenshotHtml({ browser, html, outPath, size }) {
  // Mirrors v6BrowserRender's setup but only captures a screenshot at the
  // canvas viewport size. Uses a separate context so the route table is fresh.
  const TRANSPARENT_PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const TRANSPARENT_PNG = Buffer.from(TRANSPARENT_PNG_B64, 'base64');
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.route(/^placeholder:\/\//, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: TRANSPARENT_PNG,
      }),
    );
    await page.setViewportSize(size);
    const wrapped = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;}body{overflow:hidden;}</style></head><body>${html}</body></html>`;
    await page.setContent(wrapped, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise((r) => setTimeout(r, 3000)),
        ]);
      }
    });
    await page.screenshot({ path: outPath, fullPage: false });
    return outPath;
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvLocal();
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_API_KEY missing (read .env.local in tooldi-agent-runtime/)');
    process.exit(1);
  }
  let cases = CASES;
  if (args.only) {
    const only = args.only;
    cases = cases.filter((c) => c.id === only || c.id.includes(only));
    if (cases.length === 0)
      throw new Error(`--only=${only} matched zero cases`);
  }
  await ensureDir(args.out);
  const startedAt = new Date().toISOString();
  const manifest = {
    generatedAt: startedAt,
    out: args.out,
    variants: args.variants,
    runs: args.runs,
    cases: cases.map((c) => c.id),
    model: args.model,
    promptLengths: { A: V6_SYSTEM_PROMPT_A.length, B: V6_SYSTEM_PROMPT_B.length },
    timeoutMs: args.timeoutMs,
    maxGenerationAttempts: MAX_GENERATION_ATTEMPTS,
  };
  await writeJson(join(args.out, 'manifest.json'), manifest);
  console.log(
    `[ab-bench] start variants=[${args.variants.join(',')}] runs=${args.runs} cases=${cases.length} out=${args.out}`,
  );

  const browser = await launchEphemeralBrowser();
  const allSummaries = [];
  try {
    for (const variant of args.variants) {
      for (let run = 1; run <= args.runs; run += 1) {
        for (const caseDef of cases) {
          const outDir = join(args.out, variant, `run-${run}`, caseDef.id);
          await ensureDir(outDir);
          console.log(
            `[ab-bench] variant=${variant} run=${run} case=${caseDef.id} starting`,
          );
          try {
            const summary = await runOneGeneration({
              caseDef,
              variant,
              runIndex: run,
              outDir,
              apiKey,
              browser,
              timeoutMs: args.timeoutMs,
              model: args.model,
            });
            allSummaries.push(summary);
            console.log(
              `[ab-bench] variant=${variant} run=${run} case=${caseDef.id} status=${summary.finalStatus} firstPass=${summary.firstPassPassed} attempts=${summary.attempts.length} ms=${summary.totalLatencyMs}`,
            );
          } catch (error) {
            const failure = {
              variant,
              caseId: caseDef.id,
              runIndex: run,
              fatalError: String(error instanceof Error ? error.stack : error),
            };
            allSummaries.push(failure);
            await writeJson(join(outDir, 'fatal-error.json'), failure);
            console.error(
              `[ab-bench] variant=${variant} run=${run} case=${caseDef.id} FATAL: ${failure.fatalError.split('\n')[0]}`,
            );
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  const finishedAt = new Date().toISOString();
  await writeJson(join(args.out, 'all-summaries.json'), {
    startedAt,
    finishedAt,
    runs: allSummaries,
  });
  console.log(`[ab-bench] done out=${args.out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
