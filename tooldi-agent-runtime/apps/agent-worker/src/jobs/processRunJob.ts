import { Command } from "@langchain/langgraph";

import type {
  InterviewQuestion,
  RunJobEnvelope,
} from "@tooldi/agent-contracts";
import { buildLangGraphThreadId } from "@tooldi/agent-graph";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type { Logger } from "@tooldi/agent-observability";
import type { ObjectStoreClient } from "@tooldi/agent-persistence";
import type {
  AssetStorageClient,
  ImagePrimitiveClient,
  TemplateCatalogClient,
  TextLayoutHelper,
  TooldiCatalogSourceClient,
} from "@tooldi/tool-adapters";
import type { ToolRegistry } from "@tooldi/tool-registry";

import type { BackendCallbackClient } from "../clients/backendCallbackClient.js";
import { buildRunJobGraph, type RunJobGraphDependencies } from "../graph/runJobGraph.js";
import type { ProcessRunJobResult } from "../types.js";

export interface ProcessRunJobDependencies extends RunJobGraphDependencies {
  env: AgentWorkerEnv;
  logger: Logger;
  objectStore: ObjectStoreClient;
  callbackClient: BackendCallbackClient;
  toolRegistry: ToolRegistry;
  imagePrimitiveClient: ImagePrimitiveClient;
  assetStorageClient: AssetStorageClient;
  textLayoutHelper: TextLayoutHelper;
  templateCatalogClient: TemplateCatalogClient;
  tooldiCatalogSourceClient?: TooldiCatalogSourceClient;
}

export interface InterviewAwaitingPayload {
  type: "interview.awaiting";
  runId: string;
  questions: ReadonlyArray<InterviewQuestion>;
  timeoutMs?: number;
}

export class InterviewPendingError extends Error {
  readonly payload: InterviewAwaitingPayload;
  constructor(payload: InterviewAwaitingPayload) {
    super(`Run paused awaiting interview answer: runId=${payload.runId}`);
    this.name = "InterviewPendingError";
    this.payload = payload;
  }
}

export function isInterviewPendingError(
  value: unknown,
): value is InterviewPendingError {
  return value instanceof InterviewPendingError;
}

function buildRunConfig(job: RunJobEnvelope) {
  return {
    configurable: {
      thread_id: buildLangGraphThreadId(job.runId, job.attemptSeq),
    },
    recursionLimit: 128,
  };
}

interface PendingInterruptPayload {
  readonly value?: unknown;
}

function isInterviewAwaitingPayload(
  raw: unknown,
): raw is InterviewAwaitingPayload {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  return (
    obj.type === "interview.awaiting" &&
    typeof obj.runId === "string" &&
    Array.isArray(obj.questions)
  );
}

async function detectInterviewInterrupt(
  graph: ReturnType<typeof buildRunJobGraph>,
  config: ReturnType<typeof buildRunConfig>,
): Promise<InterviewAwaitingPayload | null> {
  const snapshot = await graph.getState(config);
  const interrupts = snapshot.tasks.flatMap(
    (task) => (task.interrupts as PendingInterruptPayload[] | undefined) ?? [],
  );
  for (const entry of interrupts) {
    if (isInterviewAwaitingPayload(entry.value)) {
      return entry.value;
    }
  }
  return null;
}

export async function processRunJob(
  job: RunJobEnvelope,
  dependencies: ProcessRunJobDependencies,
): Promise<ProcessRunJobResult> {
  const graph = buildRunJobGraph(dependencies);
  const config = buildRunConfig(job);
  const finalState = await graph.invoke({ job }, config);

  if (finalState.result) {
    return finalState.result;
  }

  const pendingInterview = await detectInterviewInterrupt(graph, config);
  if (pendingInterview) {
    throw new InterviewPendingError(pendingInterview);
  }

  throw new Error("LangGraph run completed without a ProcessRunJobResult");
}

export interface ResumeRunArgs {
  runId: string;
  attemptSeq: number;
  answers: unknown;
}

export class DuplicateResumeIgnoredError extends Error {
  readonly runId: string;
  readonly attemptSeq: number;
  constructor(runId: string, attemptSeq: number) {
    super(
      `resumeRunJob: no pending interrupt for runId=${runId} attemptSeq=${attemptSeq}; ignoring duplicate resume`,
    );
    this.name = "DuplicateResumeIgnoredError";
    this.runId = runId;
    this.attemptSeq = attemptSeq;
  }
}

export function isDuplicateResumeIgnoredError(
  value: unknown,
): value is DuplicateResumeIgnoredError {
  return value instanceof DuplicateResumeIgnoredError;
}

export async function resumeRunJob(
  args: ResumeRunArgs,
  dependencies: ProcessRunJobDependencies,
): Promise<ProcessRunJobResult> {
  const graph = buildRunJobGraph(dependencies);
  const config = {
    configurable: {
      thread_id: buildLangGraphThreadId(args.runId, args.attemptSeq),
    },
    recursionLimit: 128,
  };

  const preState = await graph.getState(config);
  const pendingInterrupts = preState.tasks.flatMap(
    (task) => (task.interrupts as PendingInterruptPayload[] | undefined) ?? [],
  );
  if (pendingInterrupts.length === 0) {
    const existingResult = (preState.values as { result?: ProcessRunJobResult } | null)
      ?.result;
    if (existingResult) {
      return existingResult;
    }
    throw new DuplicateResumeIgnoredError(args.runId, args.attemptSeq);
  }

  const finalState = await graph.invoke(
    new Command({ resume: { answers: args.answers } }),
    config,
  );

  if (finalState.result) {
    return finalState.result;
  }

  const pendingInterview = await detectInterviewInterrupt(graph, config);
  if (pendingInterview) {
    throw new InterviewPendingError(pendingInterview);
  }

  throw new Error(
    "LangGraph resume completed without a ProcessRunJobResult and without a follow-up interrupt",
  );
}
