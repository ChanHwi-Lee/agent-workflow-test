// B 경로 — 인터뷰를 수행해 자연어 context 를 얻고, 그 context 를 v6 Stage 1
// (runV6HtmlGen) 의 userPrompt 문자열에 concat 해서 주입한다.
//
// v6 원칙 방어선 (v6 SSOT §1.2 P4 / v5 CTA contract 재현 금지)
// ------------------------------------------------------------
// 인터뷰 답변은 반드시 pure string concat 으로만 userPrompt 에 들어가야 하며,
// runV6HtmlGen 에 별도의 구조화 인자(role / slot / cta_type 등) 를 추가하면
// 안 된다. 구조화 필드가 primitive / command / render QA 계약까지 투영되는
// 순간 v5 CTA contract 재현이 된다. 이 파일에서 userPrompt 외 인자를 넓히고
// 싶은 충동이 들면 즉시 설계 재검토.
//   참고: 두 독립 판정 (아키텍처 원칙 / 데이터 경로 관점) 모두 이 한 가지
//         조건이 유지되는 동안은 SAFE 라고 판정함 (2026-04-23).

import type { Browser } from "playwright";

import {
  runV6HtmlGen,
  V6HtmlGenerationError,
} from "../lib/agentWorkerImports.js";
import {
  generateInterview,
  type GenerateInterviewResult,
  type StructuredInterviewContext,
} from "../lib/interview.js";
import { renderHtmlWithScreenshot } from "../lib/renderWithScreenshot.js";
import type { RunMeta } from "../lib/runs.js";
import type { SeedPrompt } from "../lib/seeds.js";

export interface RunBPathArgs {
  readonly browser: Browser;
  readonly apiKey: string;
  readonly model: string;
  readonly seed: SeedPrompt;
  readonly timestamp: string;
  readonly runIdx: number;
}

export interface RunBPathResult {
  readonly html: string;
  readonly screenshot: Buffer;
  readonly meta: RunMeta;
  readonly extractionElementCount: number;
  readonly interview: StructuredInterviewContext;
  readonly interviewRaw: Omit<GenerateInterviewResult, "context">;
  readonly builtUserPrompt: string;
}

export function buildBUserPrompt(context: StructuredInterviewContext): string {
  const qaLines = context.interview.map((pair, i) => {
    const answerText = Array.isArray(pair.answer)
      ? pair.answer.join(", ")
      : String(pair.answer);
    const otherMark = pair.is_other ? " (기타 자유입력)" : "";
    return `${i + 1}. ${pair.title}\n   → ${answerText}${otherMark}`;
  });
  return [
    "[ORIGINAL PROMPT]",
    context.original_prompt,
    "",
    "[DESIGN BRIEF]",
    context.derived_brief,
    "",
    "[INTERVIEW Q&A]",
    ...qaLines,
  ].join("\n");
}

export async function runBPath(args: RunBPathArgs): Promise<RunBPathResult> {
  const runId = `${args.timestamp}-${args.seed.id}-b-${args.runIdx}`;

  const interview = await generateInterview({
    apiKey: args.apiKey,
    model: args.model,
    prompt: args.seed.prompt,
    canvas: args.seed.canvas,
  });

  const userPrompt = buildBUserPrompt(interview.context);

  let html = "";
  let latencyMs = 0;
  let usage: unknown | null = null;
  try {
    const gen = await runV6HtmlGen({
      apiKey: args.apiKey,
      model: args.model,
      canvasWidth: args.seed.canvas.width,
      canvasHeight: args.seed.canvas.height,
      userPrompt,
    });
    html = gen.html;
    latencyMs = gen.latencyMs;
    usage = gen.usage;
  } catch (e) {
    if (e instanceof V6HtmlGenerationError) {
      throw new Error(
        `V6HtmlGenerationError status=${e.status ?? "null"} msg=${e.message}`,
      );
    }
    throw e;
  }

  const { extraction, screenshot } = await renderHtmlWithScreenshot(
    args.browser,
    html,
    { canvas: args.seed.canvas },
  );

  const meta: RunMeta = {
    runId,
    timestamp: args.timestamp,
    seedId: args.seed.id,
    seedLabel: args.seed.label,
    path: "b",
    runIdx: args.runIdx,
    canvas: args.seed.canvas,
    prompt: args.seed.prompt,
    model: args.model,
    latencyMs,
    usage,
    htmlBytes: Buffer.byteLength(html, "utf-8"),
    extractionElementCount: extraction.elements.length,
  };

  const { context: _ctx, ...interviewRaw } = interview;

  return {
    html,
    screenshot,
    meta,
    extractionElementCount: extraction.elements.length,
    interview: interview.context,
    interviewRaw,
    builtUserPrompt: userPrompt,
  };
}
