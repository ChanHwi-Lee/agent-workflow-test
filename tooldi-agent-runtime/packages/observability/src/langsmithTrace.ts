// LangSmith tracing helpers for tooldi-agent-runtime.
//
// 모든 LLM·이미지 생성 호출이 한 잡 = 한 LangSmith trace 로 묶이도록 하는
// 얇은 래퍼. LANGSMITH_TRACING=true 환경변수가 켜지지 않으면 SDK 자체가
// no-op 으로 동작하므로 본 모듈도 안전하게 통과한다.
//
// 사용 패턴:
//   1) processRunJob: withRunJobTrace(job, () => graph.invoke(...))
//   2) raw fetch LLM 호출: traceLlmCall({ name, model, ... }, async () => fetch(...))
//   3) image gen: traceImageGenCall({ name, model, ... }, async () => ...)
//
// SDK 키 매핑 노트:
//   - LangSmith 가 cost 자동 계산하려면 usage_metadata.input_tokens /
//     output_tokens / total_tokens 키 사용 (OpenAI 의 prompt_tokens 키 아님)
//   - 가격표 lookup 은 metadata.ls_provider + ls_model_name 으로 동작
//   - 이미지 생성은 토큰 단가 표현 불가 → usage_metadata.total_cost 직접 전송

import { Client } from "langsmith";
import { RunTree, type RunTreeConfig } from "langsmith/run_trees";
import {
  traceable,
  withRunTree,
} from "langsmith/traceable";

let cachedClient: Client | null = null;

function getClient(): Client {
  if (!cachedClient) {
    cachedClient = new Client();
  }
  return cachedClient;
}

function isTracingEnabled(): boolean {
  const flag = (process.env.LANGSMITH_TRACING ?? "").toLowerCase();
  return flag === "true" || flag === "1" || flag === "yes";
}

export interface RunJobTraceContext {
  readonly runId: string;
  readonly traceId: string;
  readonly attemptSeq: number;
  readonly queueJobId?: string;
  readonly kind?: string;
}

export interface WithRunJobTraceOptions {
  readonly name?: string;
  readonly extraMetadata?: Record<string, unknown>;
  readonly extraTags?: ReadonlyArray<string>;
}

/**
 * Wrap a job-level async function so all nested LangChain / traceable calls
 * land under one LangSmith root run keyed to the domain traceId.
 *
 * - root run is created with `metadata.tooldi_trace_id = ctx.traceId` so the
 *   UI metadata filter can find every run for a single template generation.
 * - On exit, pending trace batches are flushed best-effort to avoid losing
 *   the last run on short-lived job processes.
 * - When LANGSMITH_TRACING is off, this just calls fn() with no overhead.
 */
export async function withRunJobTrace<T>(
  ctx: RunJobTraceContext,
  fn: () => Promise<T>,
  options: WithRunJobTraceOptions = {},
): Promise<T> {
  if (!isTracingEnabled()) {
    return fn();
  }

  const config: RunTreeConfig = {
    name: options.name ?? "tooldi.run_job",
    run_type: "chain",
    inputs: {
      runId: ctx.runId,
      traceId: ctx.traceId,
      attemptSeq: ctx.attemptSeq,
      ...(ctx.queueJobId !== undefined ? { queueJobId: ctx.queueJobId } : {}),
      ...(ctx.kind !== undefined ? { kind: ctx.kind } : {}),
    },
    metadata: {
      tooldi_trace_id: ctx.traceId,
      tooldi_run_id: ctx.runId,
      tooldi_attempt_seq: ctx.attemptSeq,
      ...(ctx.queueJobId !== undefined ? { tooldi_queue_job_id: ctx.queueJobId } : {}),
      ...(ctx.kind !== undefined ? { tooldi_kind: ctx.kind } : {}),
      ...(options.extraMetadata ?? {}),
    },
    tags: [
      `traceId:${ctx.traceId}`,
      `runId:${ctx.runId}`,
      ...(options.extraTags ?? []),
    ],
    client: getClient(),
  };

  const rt = new RunTree(config);
  await rt.postRun();
  let outputs: unknown = undefined;
  let errorMessage: string | undefined;
  try {
    const result = await withRunTree(rt, fn);
    outputs = serializeJobResult(result);
    return result;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    if (errorMessage !== undefined) {
      await rt.end({ error: errorMessage });
    } else {
      await rt.end({ outputs: { result: outputs } });
    }
    await rt.patchRun();
    try {
      await getClient().awaitPendingTraceBatches();
    } catch {
      // best-effort flush; never fail the job because of LangSmith
    }
  }
}

function serializeJobResult(value: unknown): unknown {
  // Avoid emitting huge buffers / dom snapshots into the trace inputs view.
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  try {
    const json = JSON.stringify(value);
    if (json.length > 200_000) {
      return { __truncated: true, length: json.length };
    }
    return JSON.parse(json);
  } catch {
    return { __unserializable: true };
  }
}

/** ------------------------------------------------------------------
 * LLM call wrapper for raw-fetch Gemini / Anthropic REST endpoints.
 * Use it where you can't (or don't want to) replace fetch with the
 * @google/genai SDK. The wrapped function should return the parsed
 * response body so this helper can extract usage metadata.
 * ------------------------------------------------------------------ */

export interface TraceLlmCallOptions {
  readonly name: string;
  readonly model: string;
  readonly provider?: "google" | "google_genai" | "anthropic" | "openai" | string;
  readonly invocationParams?: Record<string, unknown>;
  readonly extraMetadata?: Record<string, unknown>;
  readonly tags?: ReadonlyArray<string>;
}

export interface LlmCallResult<TBody> {
  /** parsed response body (will be sent verbatim as the run output) */
  readonly body: TBody;
  /** rendered prompt or messages for the LangSmith UI */
  readonly inputs?: Record<string, unknown>;
  /** Gemini-style usageMetadata to be mapped to LangSmith usage_metadata */
  readonly geminiUsage?: {
    readonly promptTokenCount?: number | null;
    readonly candidatesTokenCount?: number | null;
    readonly totalTokenCount?: number | null;
    readonly thoughtsTokenCount?: number | null;
    readonly cachedContentTokenCount?: number | null;
  } | null;
  /** Anthropic-style usage: { input_tokens, output_tokens, cache_*_tokens } */
  readonly anthropicUsage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly cache_creation_input_tokens?: number;
    readonly cache_read_input_tokens?: number;
  } | null;
  /** rendered output text/content for UI nicety */
  readonly outputText?: string;
  /** override total_cost in USD if model is not in LangSmith pricing table */
  readonly totalCostUsd?: number;
}

interface LangsmithUsageMetadata {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly total_tokens: number;
  readonly input_token_details?: Record<string, number>;
  readonly output_token_details?: Record<string, number>;
  readonly total_cost?: number;
}

export function buildUsageMetadata(
  result: LlmCallResult<unknown>,
): LangsmithUsageMetadata | undefined {
  if (result.geminiUsage) {
    const u = result.geminiUsage;
    const input = u.promptTokenCount ?? 0;
    // 공식 langsmith Gemini wrapper 와 동일하게 candidates 만 output_tokens 으로
    // 보고하고, thoughtsTokenCount 는 output_token_details.reasoning 으로 분리.
    // 이전 구현은 thoughts 를 output 에 합산해서 LangSmith cost view 를 부풀렸음.
    const output = u.candidatesTokenCount ?? 0;
    const thoughts = u.thoughtsTokenCount;
    const cached = u.cachedContentTokenCount;
    // Gemini 의 totalTokenCount 는 thoughts 까지 이미 포함하므로 fallback 도 동일하게 합산.
    const total =
      u.totalTokenCount ??
      input + output + (typeof thoughts === "number" ? thoughts : 0);
    const inputDetails: Record<string, number> = {};
    if (typeof cached === "number") inputDetails.cache_read = cached;
    const outputDetails: Record<string, number> = {};
    if (typeof thoughts === "number" && thoughts > 0) {
      outputDetails.reasoning = thoughts;
    }
    const out: LangsmithUsageMetadata = {
      input_tokens: input,
      output_tokens: output,
      total_tokens: total,
      ...(Object.keys(inputDetails).length > 0
        ? { input_token_details: inputDetails }
        : {}),
      ...(Object.keys(outputDetails).length > 0
        ? { output_token_details: outputDetails }
        : {}),
      ...(typeof result.totalCostUsd === "number"
        ? { total_cost: result.totalCostUsd }
        : {}),
    };
    return out;
  }
  if (result.anthropicUsage) {
    const u = result.anthropicUsage;
    const input = u.input_tokens ?? 0;
    const output = u.output_tokens ?? 0;
    return {
      input_tokens: input,
      output_tokens: output,
      total_tokens: input + output,
      ...(typeof result.totalCostUsd === "number"
        ? { total_cost: result.totalCostUsd }
        : {}),
    };
  }
  if (typeof result.totalCostUsd === "number") {
    return {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      total_cost: result.totalCostUsd,
    };
  }
  return undefined;
}

/**
 * Wrap an LLM-style call (raw fetch to Gemini / Anthropic / etc.) so the
 * inner work appears as a child `llm` run under the current trace.
 *
 * Caller returns an LlmCallResult so this helper can:
 *   - emit chat-style inputs/outputs for the LangSmith UI
 *   - map provider-specific usage to LangSmith's required usage_metadata shape
 *   - attach ls_provider / ls_model_name so the built-in price map matches
 */
export async function traceLlmCall<TBody>(
  options: TraceLlmCallOptions,
  fn: () => Promise<LlmCallResult<TBody>>,
): Promise<TBody> {
  const provider = options.provider ?? "google";
  // Pattern (B) — body 는 closure 변수에 보관해서 traceable 출력에서 제외한다.
  // LangSmith trace output 에 raw response (이미지 바이트, 거대한 JSON 등) 가
  // 새지 않도록 보장한다.
  let capturedBody: TBody | undefined;
  const traced = traceable(
    async () => {
      const result = await fn();
      capturedBody = result.body;
      const usage = buildUsageMetadata(result);
      const choices = result.outputText
        ? [{ message: { role: "assistant", content: result.outputText } }]
        : undefined;
      // Hoist choices / usage_metadata to top-level so LangSmith picks them up.
      return {
        ...(choices ? { choices } : {}),
        ...(usage ? { usage_metadata: usage } : {}),
      };
    },
    {
      name: options.name,
      run_type: "llm",
      ...(options.tags ? { tags: [...options.tags] } : {}),
      metadata: {
        ls_provider: provider,
        ls_model_name: options.model,
        ...(options.invocationParams
          ? { invocation_params: options.invocationParams }
          : {}),
        ...(options.extraMetadata ?? {}),
      },
    },
  );
  // Pass the rendered messages as input by closing over them in fn();
  // traceable captures fn args, so we expose a config-style placeholder.
  await traced();
  return capturedBody as TBody;
}

/** ------------------------------------------------------------------
 * Image-generation wrapper.
 * LangSmith has no image-specific run_type and its Model Price Map is
 * token-based. We model image gen as run_type:"tool" and submit a manual
 * total_cost (USD) computed from a per-image unit price table.
 * ------------------------------------------------------------------ */

export interface TraceImageGenOptions {
  readonly name: string;
  readonly model: string;
  readonly provider?: string;
  readonly prompt: string;
  readonly imageCount: number;
  readonly mimeType?: string;
  readonly bytes?: number;
  readonly unitCostUsd?: number;
  readonly extraMetadata?: Record<string, unknown>;
  readonly tags?: ReadonlyArray<string>;
}

export interface ImageGenResult<T> {
  readonly body: T;
  readonly outputSummary?: Record<string, unknown>;
  /**
   * Override the per-call cost (USD) computed dynamically (e.g., from the
   * Gemini response's actual output token count or image dimensions).
   * Falls back to options.unitCostUsd × options.imageCount when omitted.
   */
  readonly totalCostUsd?: number;
  /**
   * Output tokens reported by the provider (Gemini billing input).
   * Recorded as usage_metadata.output_tokens for visibility.
   */
  readonly outputTokens?: number;
}

export async function traceImageGenCall<T>(
  options: TraceImageGenOptions,
  fn: () => Promise<ImageGenResult<T>>,
): Promise<T> {
  // Pattern (B) — raw image body 는 closure 변수에 보관해서 traceable 출력에서
  // 분리한다. 그래야 LangSmith run output 에 Uint8Array / base64 같은 거대한
  // 바이너리가 기록되지 않는다.
  let capturedBody: T | undefined;
  const traced = traceable(
    async (input: {
      prompt: string;
      imageCount: number;
      model: string;
    }) => {
      const result = await fn();
      capturedBody = result.body;
      const fallbackCost =
        typeof options.unitCostUsd === "number"
          ? options.unitCostUsd * Math.max(0, options.imageCount)
          : undefined;
      const totalCost =
        typeof result.totalCostUsd === "number"
          ? result.totalCostUsd
          : fallbackCost;
      const outputTokens =
        typeof result.outputTokens === "number" ? result.outputTokens : 0;
      return {
        summary: {
          model: input.model,
          imageCount: input.imageCount,
          ...(options.mimeType ? { mimeType: options.mimeType } : {}),
          ...(options.bytes !== undefined ? { bytes: options.bytes } : {}),
          ...(result.outputSummary ?? {}),
        },
        ...(totalCost !== undefined
          ? {
              usage_metadata: {
                input_tokens: 0,
                output_tokens: outputTokens,
                total_tokens: outputTokens,
                total_cost: totalCost,
              },
            }
          : {}),
      };
    },
    {
      name: options.name,
      run_type: "tool",
      ...(options.tags ? { tags: [...options.tags] } : {}),
      metadata: {
        ls_provider: options.provider ?? "google_genai",
        ls_model_name: options.model,
        ...(options.extraMetadata ?? {}),
      },
    },
  );
  await traced({
    prompt: options.prompt.slice(0, 4000),
    imageCount: options.imageCount,
    model: options.model,
  });
  return capturedBody as T;
}
