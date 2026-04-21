import type { StateGraph } from "@langchain/langgraph";
import type { CreateLayerCommand, ExecutablePlan } from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";
import type { Browser } from "playwright";

import {
  V6_APPLY_OPERATION,
  V6_INPUT_COMMANDS_KEY,
} from "../phases/emitV6Mutations.js";
import { renderAndExtract } from "../phases/v6BrowserRender.js";
import { runV6HtmlGen } from "../phases/v6HtmlGen.js";
import { runV6ClaudeCodeHtmlGen } from "../phases/v6ClaudeCodeHtmlGen.js";
import { validateV6Html } from "../phases/v6HtmlValidator.js";
import { adaptV6Commands } from "../phases/v6CommandAdapter.js";
import { resolveV6PlaceholderAssets } from "../phases/v6AssetResolver.js";
import { mapRenderedElements } from "../phases/v6PrimitiveMapper.js";
import { runV6Pipeline } from "../phases/v6Pipeline.js";
import type {
  V6PipelineDependencies,
  V6PipelineResult,
} from "../phases/v6Pipeline.js";
import type { V6Canvas } from "../phases/v6Types.js";
import { buildHeartbeatBase } from "./graphHelpers.js";
import { shouldStopAfterCurrentAction } from "./nodeUtils.js";
import { RunJobGraphState } from "./runJobGraphState.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";
import type { createRunJobGraphTasks } from "./graphTasks.js";

export class V6ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "V6ConfigError";
  }
}

/**
 * Lightweight Playwright browser supplier. Phase 4 keeps this to an on-demand
 * `launchEphemeralBrowser` factory; Phase 5 replaces it with a warm pool that
 * keeps 1–3 Chromium instances alive across jobs. The pipeline only needs a
 * `Browser`, so the exchange surface between node and infra stays stable.
 */
export type V6BrowserSupplier = () => Promise<Browser>;

export interface V6ProductionDependencyOptions {
  readonly htmlGenProvider?: "gemini" | "claude_code";
  readonly claudeCodeModel?: string;
  readonly claudeCodeEffort?: "low" | "medium" | "high" | "xhigh" | "max";
  readonly claudeCodeTimeoutMs?: number;
}

export function createProductionV6Dependencies(
  options: V6ProductionDependencyOptions = {},
): V6PipelineDependencies {
  return {
    generateHtml: (args) => {
      if (options.htmlGenProvider === "claude_code") {
        return runV6ClaudeCodeHtmlGen({
          canvasWidth: args.canvasWidth,
          canvasHeight: args.canvasHeight,
          userPrompt: args.userPrompt,
          trendContext: args.trendContext ?? null,
          ...(options.claudeCodeModel
            ? { model: options.claudeCodeModel }
            : {}),
          ...(options.claudeCodeEffort
            ? { effort: options.claudeCodeEffort }
            : {}),
          ...(options.claudeCodeTimeoutMs
            ? { timeoutMs: options.claudeCodeTimeoutMs }
            : {}),
        });
      }

      return runV6HtmlGen({
        canvasWidth: args.canvasWidth,
        canvasHeight: args.canvasHeight,
        userPrompt: args.userPrompt,
        trendContext: args.trendContext ?? null,
        apiKey: args.apiKey,
      });
    },
    validateHtml: validateV6Html,
    renderAndExtract: async (_html: string, _canvas: V6Canvas) => {
      throw new Error(
        "v6 renderAndExtract requires a Browser instance; use registerV6PipelineNode which wires the browser supplier",
      );
    },
    mapElements: mapRenderedElements,
  };
}

export interface V6SyntheticPlanArgs {
  runId: string;
  traceId: string;
  attemptSeq: number;
  documentId: string;
  pageId: string;
  operationFamily: ExecutablePlan["intent"]["operationFamily"];
  artifactType: string;
  commands: ReadonlyArray<CreateLayerCommand>;
}

export function buildV6SyntheticPlan(args: V6SyntheticPlanArgs): ExecutablePlan {
  const commitGroup = createRequestId();
  const actionId = createRequestId();

  return {
    planId: createRequestId(),
    planVersion: 1,
    planSchemaVersion: "v6-freeform-layout",
    runId: args.runId,
    traceId: args.traceId,
    attemptSeq: args.attemptSeq,
    intent: {
      operationFamily: args.operationFamily,
      artifactType: args.artifactType,
    },
    constraintsRef: `v6_constraints_${args.runId}`,
    actions: [
      {
        actionId,
        kind: "canvas_mutation",
        operation: V6_APPLY_OPERATION,
        toolName: "v6-freeform-layout-pipeline",
        toolVersion: "1",
        commitGroup,
        liveCommit: true,
        idempotencyKey: `v6_${args.runId}_${args.attemptSeq}`,
        dependsOn: [],
        targetRef: {
          documentId: args.documentId,
          pageId: args.pageId,
          layerId: null,
        },
        inputs: {
          [V6_INPUT_COMMANDS_KEY]: args.commands,
          executionMode: "v6_freeform_layout",
        } as unknown as ExecutablePlan["actions"][number]["inputs"],
        rollback: { strategy: "delete_created_layers" },
      },
    ],
  };
}

export interface V6NodeOverrides {
  deps?: Partial<V6PipelineDependencies>;
  browserSupplier?: V6BrowserSupplier;
}

export function registerV6PipelineNode(
  graph: StateGraph<typeof RunJobGraphState>,
  dependencies: RunJobGraphDependencies,
  tasks: ReturnType<typeof createRunJobGraphTasks>,
  overrides?: V6NodeOverrides,
) {
  const { heartbeatTask, appendEventTask, persistArtifactTask } = tasks;

  const browserSupplier: V6BrowserSupplier =
    overrides?.browserSupplier ?? (async () => {
      // Lazy import so tests that override the supplier don't pull Playwright.
      const { launchEphemeralBrowser } = await import(
        "../phases/v6BrowserRender.js"
      );
      return launchEphemeralBrowser();
    });

  const baseDeps = createProductionV6Dependencies({
    htmlGenProvider: dependencies.env.htmlGenProvider,
    claudeCodeModel: dependencies.env.claudeCodeModel,
    claudeCodeEffort: dependencies.env.claudeCodeEffort,
    claudeCodeTimeoutMs: dependencies.env.claudeCodeTimeoutMs,
  });
  const deps: V6PipelineDependencies = {
    ...baseDeps,
    ...(overrides?.deps ?? {}),
  };

  return graph.addNode("v6_freeform_layout_pipeline", async (state) => {
    if (!state.hydrated || !state.intent) {
      throw new Error(
        "v6_freeform_layout_pipeline requires hydrated input + normalized intent",
      );
    }

    const apiKey = dependencies.env.googleApiKey;
    if (dependencies.env.htmlGenProvider === "gemini" && !apiKey) {
      throw new V6ConfigError(
        "GOOGLE_API_KEY is missing from AgentWorkerEnv; v6 pipeline cannot call Gemini",
      );
    }

    let cooperativeStopRequested = state.cooperativeStopRequested;
    const heartbeatBase = buildHeartbeatBase(state.job);

    const planningHeartbeat = await heartbeatTask(state.job.runId, {
      ...heartbeatBase,
      attemptState: "running",
      phase: "planning",
      heartbeatAt: new Date().toISOString(),
    });
    cooperativeStopRequested ||= shouldStopAfterCurrentAction(
      planningHeartbeat,
    );

    const enterEvent = await appendEventTask(state.job.runId, {
      traceId: state.job.traceId,
      attempt: state.job.attemptSeq,
      queueJobId: state.job.queueJobId,
      event: {
        type: "log",
        level: "info",
        message:
          "[v6] Freeform Layout Pipeline: HTML gen → security validator → browser render → primitive map → adapter",
      },
    });
    cooperativeStopRequested ||= enterEvent.cancelRequested;

    const userPrompt = state.hydrated.request.userInput.prompt;
    const canvasWidth = state.hydrated.request.editorContext.canvasWidth;
    const canvasHeight = state.hydrated.request.editorContext.canvasHeight;

    // Bind the browser supplier into renderAndExtract for this run. Keeping
    // the browser lifetime inside the node (vs. caller) makes the node
    // self-contained during Phase 4; Phase 5 swaps in a warm-pool supplier.
    const browserHandle: { current: Browser | null } = { current: null };
    let v6Result: V6PipelineResult;
    try {
      const boundDeps: V6PipelineDependencies = overrides?.deps?.renderAndExtract
        ? deps
        : {
            ...deps,
            renderAndExtract: async (html: string, canvas: V6Canvas) => {
              if (!browserHandle.current) {
                browserHandle.current = await browserSupplier();
              }
              return renderAndExtract(browserHandle.current, html, { canvas });
            },
          };

      const trendContext =
        dependencies.env.trendResearchMode === "enabled"
          ? state.v6TrendBrief?.contextForHtmlGen ?? null
          : null;

      v6Result = await runV6Pipeline(
        {
          runId: state.job.runId,
          canvasWidth,
          canvasHeight,
          userPrompt,
          trendContext,
          apiKey: apiKey ?? "",
        },
        boundDeps,
      );
    } finally {
      if (browserHandle.current) {
        try {
          await browserHandle.current.close();
        } catch {
          // Browser close failures are non-fatal for pipeline correctness.
        }
      }
    }

    const resolvedV6Commands = await resolveV6PlaceholderAssets({
      runId: state.job.runId,
      userPrompt,
      canvasWidth,
      canvasHeight,
      googleApiKey: dependencies.env.googleApiKey,
      env: dependencies.env,
      commands: v6Result.commands,
    });

    const { commands: createLayerCommands } = adaptV6Commands(resolvedV6Commands, {
      runId: state.job.runId,
    });

    const doneEvent = await appendEventTask(state.job.runId, {
      traceId: state.job.traceId,
      attempt: state.job.attemptSeq,
      queueJobId: state.job.queueJobId,
      event: {
        type: "log",
        level: "info",
        message: `[v6] produced ${createLayerCommands.length} layer commands from ${v6Result.model} in ${v6Result.latency.totalMs}ms (htmlGen ${v6Result.latency.htmlGenMs}ms, render ${v6Result.latency.renderMs}ms)`,
      },
    });
    cooperativeStopRequested ||= doneEvent.cancelRequested;

    const plan = buildV6SyntheticPlan({
      runId: state.job.runId,
      traceId: state.job.traceId,
      attemptSeq: state.job.attemptSeq,
      documentId: state.hydrated.request.editorContext.documentId,
      pageId: state.hydrated.request.editorContext.pageId,
      operationFamily: state.intent.operationFamily,
      artifactType: state.intent.artifactType,
      commands: createLayerCommands,
    });

    const executablePlanRef = await persistArtifactTask(
      `runs/${state.job.runId}/attempts/${state.job.attemptSeq}/executable-plan.json`,
      plan,
      {
        artifactKind: "executable-plan",
        runId: state.job.runId,
        traceId: state.job.traceId,
        attemptSeq: String(state.job.attemptSeq),
      },
    );

    return {
      v6PipelineResult: v6Result,
      plan,
      executablePlanRef,
      cooperativeStopRequested,
    };
  });
}
