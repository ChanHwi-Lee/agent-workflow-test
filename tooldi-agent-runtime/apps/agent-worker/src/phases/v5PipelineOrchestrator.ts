import type {
  HtmlValidationIssue,
  HtmlValidationResult,
} from "./v5HtmlValidator.js";
import type {
  MethodBHtmlGenResult,
  MethodBUsage,
} from "./v5MethodBHtmlGen.js";
import type {
  AgentCreateLayerCommand,
  TranspileOptions,
  TranspileResult,
  TranspileWarning,
} from "./v5Transpile/index.js";

export interface V5PipelineInput {
  readonly runId: string;
  readonly traceId: string;
  readonly userPrompt: string;
  readonly apiKey: string;
}

export interface V5PipelineDependencies {
  readonly runMethodB: (args: {
    prompt: string;
    apiKey: string;
  }) => Promise<MethodBHtmlGenResult>;
  readonly validateHtml: (html: string) => HtmlValidationResult;
  readonly transpile: (
    html: string,
    options: TranspileOptions,
  ) => TranspileResult;
}

export interface V5PipelineResult {
  readonly html: string;
  readonly commands: AgentCreateLayerCommand[];
  readonly warnings: TranspileWarning[];
  readonly usage: MethodBUsage | null;
  readonly latencyMs: number;
  readonly model: string;
}

export class V5HtmlValidationError extends Error {
  readonly issues: HtmlValidationIssue[];
  readonly html: string;
  constructor(issues: HtmlValidationIssue[], html: string) {
    const errorIssues = issues.filter((i) => i.severity === "error");
    const summary = errorIssues
      .slice(0, 3)
      .map((i) => `${i.code}:${i.message}`)
      .join("; ");
    super(
      `v5 HTML grammar validation failed (${errorIssues.length} error${errorIssues.length === 1 ? "" : "s"}): ${summary}`,
    );
    this.name = "V5HtmlValidationError";
    this.issues = issues;
    this.html = html;
  }
}

export class V5TranspileEmptyError extends Error {
  readonly html: string;
  readonly warnings: TranspileWarning[];
  constructor(html: string, warnings: TranspileWarning[]) {
    super(
      `v5 transpile produced 0 commands; cannot emit an empty canvas.mutation envelope`,
    );
    this.name = "V5TranspileEmptyError";
    this.html = html;
    this.warnings = warnings;
  }
}

/**
 * Orchestrates v5 Stages 2/3/5 in order.
 * Stage 1 (Intent Normalize) is handled by the existing `normalize_intent`
 * graph node and not redone here; the caller supplies `userPrompt` already.
 * Stage 4 (RAG Asset Swap) and Stage 6 (overflow post-processor) are out of
 * scope for this commit and deferred to work orders C and A respectively.
 *
 * Pure composition: no LangGraph / state dependency. All side effects are
 * encapsulated in injected dependencies so unit tests can stub them.
 */
export async function runV5Pipeline(
  input: V5PipelineInput,
  deps: V5PipelineDependencies,
): Promise<V5PipelineResult> {
  const methodBResult = await deps.runMethodB({
    prompt: input.userPrompt,
    apiKey: input.apiKey,
  });

  const validation = deps.validateHtml(methodBResult.html);
  if (!validation.ok) {
    throw new V5HtmlValidationError(validation.issues, methodBResult.html);
  }

  const transpileOutput = deps.transpile(methodBResult.html, {
    runId: input.runId,
  });
  if (transpileOutput.commands.length === 0) {
    throw new V5TranspileEmptyError(methodBResult.html, transpileOutput.warnings);
  }

  return {
    html: methodBResult.html,
    commands: transpileOutput.commands,
    warnings: transpileOutput.warnings,
    usage: methodBResult.usage,
    latencyMs: methodBResult.latencyMs,
    model: methodBResult.model,
  };
}
