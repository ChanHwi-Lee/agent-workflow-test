import { spawn } from "node:child_process";

import {
  buildV6UserMessage,
  V6_SYSTEM_PROMPT,
} from "./v6SystemPrompt.js";
import {
  stripMarkdownFences,
  V6HtmlGenerationError,
  type V6HtmlGenResult,
} from "./v6HtmlGen.js";

export interface V6ClaudeCodeHtmlGenOptions {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly userPrompt: string;
  readonly trendContext?: string | null;
  readonly model?: string;
  readonly effort?: "low" | "medium" | "high" | "xhigh" | "max";
  readonly timeoutMs?: number;
  readonly cwd?: string;
}

const DEFAULT_CLAUDE_CODE_MODEL = "sonnet";
const DEFAULT_CLAUDE_CODE_EFFORT = "low";
const DEFAULT_CLAUDE_CODE_TIMEOUT_MS = 180000;

export async function runV6ClaudeCodeHtmlGen(
  options: V6ClaudeCodeHtmlGenOptions,
): Promise<V6HtmlGenResult> {
  const model = options.model ?? DEFAULT_CLAUDE_CODE_MODEL;
  const effort = options.effort ?? DEFAULT_CLAUDE_CODE_EFFORT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CLAUDE_CODE_TIMEOUT_MS;
  const userMessage = buildV6UserMessage({
    canvasWidth: options.canvasWidth,
    canvasHeight: options.canvasHeight,
    userPrompt: options.userPrompt,
    trendContext: options.trendContext ?? null,
  });

  const { stdout, stderr, exitCode, timedOut, latencyMs } = await runClaudeCodeText({
    prompt: userMessage,
    systemPrompt: V6_SYSTEM_PROMPT,
    model,
    effort,
    timeoutMs,
    ...(options.cwd ? { cwd: options.cwd } : {}),
  });

  if (timedOut) {
    throw new V6HtmlGenerationError(
      `claude-code-timeout after ${timeoutMs}ms`,
      null,
      { stderr: stderr.slice(0, 2000) },
    );
  }

  if (exitCode !== 0) {
    throw new V6HtmlGenerationError(
      `claude-code-exit status=${exitCode}: ${stderr.slice(0, 400)}`,
      null,
      { exitCode, stderr: stderr.slice(0, 4000), stdout: stdout.slice(0, 1000) },
    );
  }

  const rawHtml = stdout.trim();
  const html = stripMarkdownFences(rawHtml);
  return {
    model: `claude-code:${model}`,
    html,
    rawHtml,
    latencyMs,
    finishReason: "STOP",
    usage: null,
    finishedAt: new Date().toISOString(),
  };
}

export interface RunClaudeCodeTextOptions {
  readonly prompt: string;
  readonly systemPrompt: string;
  readonly model?: string;
  readonly effort?: "low" | "medium" | "high" | "xhigh" | "max";
  readonly timeoutMs?: number;
  readonly cwd?: string;
}

export async function runClaudeCodeText(
  options: RunClaudeCodeTextOptions,
): Promise<{
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly latencyMs: number;
}> {
  const model = options.model ?? DEFAULT_CLAUDE_CODE_MODEL;
  const effort = options.effort ?? DEFAULT_CLAUDE_CODE_EFFORT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_CLAUDE_CODE_TIMEOUT_MS;
  const args = [
    "-p",
    options.prompt,
    "--model",
    model,
    "--effort",
    effort,
    "--output-format",
    "text",
    "--no-session-persistence",
    "--tools",
    "",
    "--disable-slash-commands",
    "--setting-sources",
    "project",
    "--permission-mode",
    "dontAsk",
    "--system-prompt",
    options.systemPrompt,
  ];

  const startedAt = Date.now();
  const { stdout, stderr, exitCode, timedOut } = await runClaudeCli(args, {
    cwd: options.cwd ?? "/tmp",
    timeoutMs,
  });
  const latencyMs = Date.now() - startedAt;
  return { stdout, stderr, exitCode, timedOut, latencyMs };
}

function runClaudeCli(
  args: ReadonlyArray<string>,
  options: { readonly cwd: string; readonly timeoutMs: number },
): Promise<{
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);

    child.stdin.end();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode, timedOut });
    });
  });
}
