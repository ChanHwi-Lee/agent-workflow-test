import type { StateGraph } from "@langchain/langgraph";
import type { ExecutablePlan } from "@tooldi/agent-contracts";
import { createRequestId } from "@tooldi/agent-domain";

import { validateMethodBHtml } from "../phases/v5HtmlValidator.js";
import { runMethodBHtmlGen } from "../phases/v5MethodBHtmlGen.js";
import { runV5Pipeline } from "../phases/v5PipelineOrchestrator.js";
import type {
  V5PipelineDependencies,
  V5PipelineResult,
} from "../phases/v5PipelineOrchestrator.js";
import { transpileHtmlToCommands } from "../phases/v5Transpile/index.js";
import {
  V5_APPLY_OPERATION,
  V5_INPUT_COMMANDS_KEY,
} from "../phases/emitV5SkeletonMutations.js";
import { buildHeartbeatBase } from "./graphHelpers.js";
import { shouldStopAfterCurrentAction } from "./nodeUtils.js";
import { RunJobGraphState } from "./runJobGraphState.js";
import type { RunJobGraphDependencies } from "./runJobGraphTypes.js";
import type { createRunJobGraphTasks } from "./graphTasks.js";

export class V5ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "V5ConfigError";
  }
}

export function createProductionV5Dependencies(): V5PipelineDependencies {
  return {
    runMethodB: (args) =>
      runMethodBHtmlGen({ prompt: args.prompt, apiKey: args.apiKey }),
    validateHtml: validateMethodBHtml,
    transpile: transpileHtmlToCommands,
  };
}

export function buildV5SyntheticPlan(
  args: {
    runId: string;
    traceId: string;
    attemptSeq: number;
    documentId: string;
    pageId: string;
    operationFamily: ExecutablePlan["intent"]["operationFamily"];
    artifactType: string;
    commands: V5PipelineResult["commands"];
  },
): ExecutablePlan {
  const commitGroup = createRequestId();
  const actionId = createRequestId();

  return {
    planId: createRequestId(),
    planVersion: 1,
    planSchemaVersion: "v5-constrained-html",
    runId: args.runId,
    traceId: args.traceId,
    attemptSeq: args.attemptSeq,
    intent: {
      operationFamily: args.operationFamily,
      artifactType: args.artifactType,
    },
    constraintsRef: `v5_constraints_${args.runId}`,
    actions: [
      {
        actionId,
        kind: "canvas_mutation",
        operation: V5_APPLY_OPERATION,
        toolName: "v5-constrained-html-pipeline",
        toolVersion: "1",
        commitGroup,
        liveCommit: true,
        idempotencyKey: `v5_${args.runId}_${args.attemptSeq}`,
        dependsOn: [],
        targetRef: {
          documentId: args.documentId,
          pageId: args.pageId,
          layerId: null,
        },
        inputs: {
          [V5_INPUT_COMMANDS_KEY]: args.commands,
          executionMode: "v5_constrained_html",
        } as unknown as ExecutablePlan["actions"][number]["inputs"],
        rollback: { strategy: "delete_created_layers" },
      },
    ],
  };
}

export function registerV5PipelineNode(
  graph: StateGraph<typeof RunJobGraphState>,
  dependencies: RunJobGraphDependencies,
  tasks: ReturnType<typeof createRunJobGraphTasks>,
  v5Overrides?: Partial<V5PipelineDependencies>,
) {
  const { heartbeatTask, appendEventTask, persistArtifactTask } = tasks;
  const v5Deps: V5PipelineDependencies = {
    ...createProductionV5Dependencies(),
    ...v5Overrides,
  };

  return graph.addNode("v5_constrained_html_pipeline", async (state) => {
    if (!state.hydrated || !state.intent) {
      throw new Error(
        "v5_constrained_html_pipeline requires hydrated input + normalized intent",
      );
    }

    const apiKey = dependencies.env.googleApiKey;
    if (!apiKey) {
      throw new V5ConfigError(
        "GOOGLE_API_KEY is missing from AgentWorkerEnv; v5 Method B cannot call Gemini",
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
          "[v5] Constrained HTML Pipeline: running Method B → validator → transpile",
      },
    });
    cooperativeStopRequested ||= enterEvent.cancelRequested;

    const userPrompt = state.hydrated.request.userInput.prompt;
    const v5Result = await runV5Pipeline(
      {
        runId: state.job.runId,
        traceId: state.job.traceId,
        userPrompt,
        apiKey,
      },
      v5Deps,
    );

    const doneEvent = await appendEventTask(state.job.runId, {
      traceId: state.job.traceId,
      attempt: state.job.attemptSeq,
      queueJobId: state.job.queueJobId,
      event: {
        type: "log",
        level: "info",
        message: `[v5] produced ${v5Result.commands.length} layer commands from ${v5Result.model} in ${v5Result.latencyMs}ms`,
      },
    });
    cooperativeStopRequested ||= doneEvent.cancelRequested;

    const plan = buildV5SyntheticPlan({
      runId: state.job.runId,
      traceId: state.job.traceId,
      attemptSeq: state.job.attemptSeq,
      documentId: state.hydrated.request.editorContext.documentId,
      pageId: state.hydrated.request.editorContext.pageId,
      operationFamily: state.intent.operationFamily,
      artifactType: state.intent.artifactType,
      commands: v5Result.commands,
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
      v5PipelineResult: v5Result,
      plan,
      executablePlanRef,
      cooperativeStopRequested,
    };
  });
}
