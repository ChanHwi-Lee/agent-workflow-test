// AGW v6 pipeline orchestrator — Stage 1 → 2 → 3, pure composition.
//
//   Stage 1: LLM free HTML generation (v6HtmlGen)
//   Stage 2a: security-only validation (v6HtmlValidator)
//   Stage 2b: Playwright render + DOM extraction (v6BrowserRender)
//   Stage 3:  primitive mapping (v6PrimitiveMapper)
//
// Mapping to Canvas Mutation Protocol (`@tooldi/agent-contracts`) is deferred
// to Phase 4 Integration where LangGraph noder 교체 and SSE 경로 재사용이
//이뤄진다. 이 파이프라인은 V6 내부 표현까지만 생산한다.
//
// Dependency injection: 모든 단계를 함수 subject 로 외부에서 주입받는다.
// 이유:
//   - LLM 호출은 실 네트워크 필요 → 테스트에서 fake 로 교체
//   - Playwright Browser 는 warm pool 에서 재사용 (Phase 5 인프라)
//   - Validator/Mapper 는 순수함수지만 signature 통일을 위해 같은 패턴 사용

import type {
  V6HtmlValidationIssue,
  V6HtmlValidationResult,
} from "./v6HtmlValidator.js";
import type { V6HtmlGenResult, V6Usage } from "./v6HtmlGen.js";
import type {
  V6Canvas,
  V6ExtractionResult,
  V6MappingResult,
  V6PrimitiveCommand,
} from "./v6Types.js";

export interface V6PipelineInput {
  readonly runId: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly userPrompt: string;
  readonly trendContext?: string | null;
  readonly apiKey: string;
}

export interface V6PipelineDependencies {
  readonly generateHtml: (args: {
    canvasWidth: number;
    canvasHeight: number;
    userPrompt: string;
    trendContext?: string | null;
    apiKey: string;
  }) => Promise<V6HtmlGenResult>;
  readonly validateHtml: (html: string) => V6HtmlValidationResult;
  readonly renderAndExtract: (
    html: string,
    canvas: V6Canvas,
  ) => Promise<V6ExtractionResult>;
  readonly mapElements: (extraction: V6ExtractionResult) => V6MappingResult;
}

export interface V6PipelineLatency {
  readonly htmlGenMs: number;
  readonly renderMs: number;
  readonly totalMs: number;
}

export interface V6PipelineResult {
  readonly runId: string;
  readonly html: string;
  readonly extraction: V6ExtractionResult;
  readonly commands: ReadonlyArray<V6PrimitiveCommand>;
  readonly validationIssues: ReadonlyArray<V6HtmlValidationIssue>;
  readonly usage: V6Usage | null;
  readonly latency: V6PipelineLatency;
  readonly model: string;
}

export class V6HtmlValidationError extends Error {
  readonly issues: ReadonlyArray<V6HtmlValidationIssue>;
  readonly html: string;
  constructor(issues: ReadonlyArray<V6HtmlValidationIssue>, html: string) {
    const errorIssues = issues.filter((i) => i.severity === "error");
    const summary = errorIssues
      .slice(0, 3)
      .map((i) => `${i.code}:${i.message}`)
      .join("; ");
    super(
      `v6 HTML security validation failed (${errorIssues.length} error${errorIssues.length === 1 ? "" : "s"}): ${summary}`,
    );
    this.name = "V6HtmlValidationError";
    this.issues = issues;
    this.html = html;
  }
}

export class V6EmptyCommandsError extends Error {
  readonly html: string;
  readonly extraction: V6ExtractionResult;
  constructor(html: string, extraction: V6ExtractionResult) {
    super(
      `v6 pipeline produced 0 primitives; cannot emit empty canvas.mutation envelope`,
    );
    this.name = "V6EmptyCommandsError";
    this.html = html;
    this.extraction = extraction;
  }
}

export async function runV6Pipeline(
  input: V6PipelineInput,
  deps: V6PipelineDependencies,
): Promise<V6PipelineResult> {
  const pipelineStart = Date.now();

  const genResult = await deps.generateHtml({
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    userPrompt: input.userPrompt,
    trendContext: input.trendContext ?? null,
    apiKey: input.apiKey,
  });
  const html = genResult.html;

  const validation = deps.validateHtml(html);
  if (!validation.ok) {
    throw new V6HtmlValidationError(validation.issues, html);
  }

  const renderStart = Date.now();
  const extraction = await deps.renderAndExtract(html, {
    width: input.canvasWidth,
    height: input.canvasHeight,
  });
  const renderMs = Date.now() - renderStart;

  const mapping = deps.mapElements(extraction);
  if (mapping.commands.length === 0) {
    throw new V6EmptyCommandsError(html, extraction);
  }

  const totalMs = Date.now() - pipelineStart;

  return {
    runId: input.runId,
    html,
    extraction,
    commands: mapping.commands,
    validationIssues: validation.issues,
    usage: genResult.usage,
    latency: {
      htmlGenMs: genResult.latencyMs,
      renderMs,
      totalMs,
    },
    model: genResult.model,
  };
}
