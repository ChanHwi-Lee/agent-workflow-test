import type { RunJobEnvelope } from "@tooldi/agent-contracts";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import {
  createTemplateAbstractLayoutGenerator,
  createTemplateCopyPlanGenerator,
  createTemplatePlanner,
} from "@tooldi/agent-llm";
import {
  createWorkerGraphCheckpointer,
  type WorkerGraphCheckpointerHandle,
} from "@tooldi/agent-graph";
import type { Logger } from "@tooldi/agent-observability";
import {
  createObjectStoreClient,
  createPgClient,
  type ObjectStoreClient,
  type PgClient,
} from "@tooldi/agent-persistence";
import type {
  AssetStorageClient,
  ImagePrimitiveClient,
  TemplateCatalogClient,
  TextLayoutHelper,
  TooldiCatalogSourceClient,
} from "@tooldi/tool-adapters";
import type { ToolRegistry } from "@tooldi/tool-registry";

import { createBackendCallbackClient, type BackendCallbackClient } from "./clients/backendCallbackClient.js";
import { createWorkerLogger } from "./lib/logger.js";
import { createRunQueueConsumer, type RunQueueConsumer } from "./lib/runQueueConsumer.js";
import { processRunJob, type ProcessRunJobDependencies } from "./jobs/processRunJob.js";
import { createAssetStorageClient } from "./tools/adapters/assetStorageAdapter.js";
import { createImagePrimitiveClient } from "./tools/adapters/imagePrimitiveAdapter.js";
import { createTemplateCatalogClient } from "./tools/adapters/templateCatalogAdapter.js";
import { createTextLayoutHelper } from "./tools/adapters/textLayoutHelperAdapter.js";
import { createWorkerToolRegistry } from "./tools/registry.js";
import { createTooldiCatalogSourceClient } from "./tools/adapters/tooldiCatalogSourceAdapter.js";
import type { ProcessRunJobResult } from "./types.js";
import { buildAdaptiveCompositionDecision } from "./phases/buildAdaptiveCompositionDecision.js";
import type { AdaptiveCompositionDecisionBuilder } from "./graph/runJobGraphTypes.js";
import type { V6NodeOverrides } from "./graph/v6PipelineNode.js";

export interface BuildWorkerRuntimeOptions {
  env: AgentWorkerEnv;
  logger?: Logger;
  objectStore?: ObjectStoreClient;
  pgClient?: PgClient;
  callbackClient?: BackendCallbackClient;
  queueConsumer?: RunQueueConsumer;
  toolRegistry?: ToolRegistry;
  imagePrimitiveClient?: ImagePrimitiveClient;
  assetStorageClient?: AssetStorageClient;
  textLayoutHelper?: TextLayoutHelper;
  templateCatalogClient?: TemplateCatalogClient;
  tooldiCatalogSourceClient?: TooldiCatalogSourceClient;
  templatePlanner?: ProcessRunJobDependencies["templatePlanner"];
  templateCopyPlanGenerator?: ProcessRunJobDependencies["templateCopyPlanGenerator"];
  templateAbstractLayoutGenerator?: ProcessRunJobDependencies["templateAbstractLayoutGenerator"];
  adaptiveCompositionDecisionBuilder?: AdaptiveCompositionDecisionBuilder;
  v6Overrides?: V6NodeOverrides;
}

export interface AgentWorkerRuntime extends ProcessRunJobDependencies {
  env: AgentWorkerEnv;
  tooldiCatalogSourceClient: TooldiCatalogSourceClient;
  processRunJob(job: RunJobEnvelope): Promise<ProcessRunJobResult>;
  close(): Promise<void>;
}

export async function buildWorkerRuntime(
  options: BuildWorkerRuntimeOptions,
): Promise<AgentWorkerRuntime> {
  const logger = options.logger ?? createWorkerLogger(options.env);
  const pgClient =
    options.pgClient ??
    createPgClient({
      connectionString: options.env.postgresUrl,
      applicationName: "agent-worker",
    });
  await pgClient.connect();

  let queueConsumer: RunQueueConsumer | null = null;
  let graphCheckpointerHandle: WorkerGraphCheckpointerHandle | null = null;

  graphCheckpointerHandle = await createWorkerGraphCheckpointer(options.env, logger);

  const runtime: AgentWorkerRuntime = {
    env: options.env,
    logger,
    objectStore:
      options.objectStore ??
      createObjectStoreClient({
        mode: options.env.objectStoreMode,
        rootDir: options.env.objectStoreRootDir,
        bucket: options.env.objectStoreBucket,
        prefix: options.env.objectStorePrefix,
      }),
    callbackClient:
      options.callbackClient ??
      createBackendCallbackClient({
        logger,
        baseUrl: options.env.agentInternalBaseUrl,
      }),
    toolRegistry: options.toolRegistry ?? createWorkerToolRegistry(),
    imagePrimitiveClient: options.imagePrimitiveClient ?? createImagePrimitiveClient(),
    assetStorageClient: options.assetStorageClient ?? createAssetStorageClient(),
    textLayoutHelper: options.textLayoutHelper ?? createTextLayoutHelper(),
    templateCatalogClient:
      options.templateCatalogClient ?? createTemplateCatalogClient(),
    langGraphCheckpointer: graphCheckpointerHandle.checkpointer,
    templatePlanner:
      options.templatePlanner ?? createTemplatePlanner(options.env, logger),
    templateCopyPlanGenerator:
      options.templateCopyPlanGenerator ??
      createTemplateCopyPlanGenerator(options.env, logger),
    templateAbstractLayoutGenerator:
      options.templateAbstractLayoutGenerator ??
      createTemplateAbstractLayoutGenerator(options.env, logger),
    adaptiveCompositionDecisionBuilder:
      options.adaptiveCompositionDecisionBuilder ??
      (async (input) => {
        if (!input.provider || !input.modelName) {
          return null;
        }
        return buildAdaptiveCompositionDecision({
          runId: input.runId,
          traceId: input.traceId,
          projectedGraph: input.projectedGraph,
          messageAtomPlan: input.messageAtomPlan,
          sceneStylePlan: input.sceneStylePlan ?? null,
          palette: input.palette,
          provider: input.provider,
          modelName: input.modelName,
          temperature: input.temperature,
        });
      }),
    tooldiCatalogSourceClient:
      options.tooldiCatalogSourceClient ??
      createTooldiCatalogSourceClient(options.env),
    ...(options.v6Overrides
      ? { v6Overrides: options.v6Overrides }
      : {}),
    async processRunJob(job: RunJobEnvelope) {
      return processRunJob(job, runtime);
    },
    async close() {
      if (queueConsumer) {
        await queueConsumer.close();
      }
      if (graphCheckpointerHandle) {
        await graphCheckpointerHandle.close();
      }
      await pgClient.end();
    },
  };

  try {
    queueConsumer =
      options.queueConsumer ??
      (await createRunQueueConsumer({
        env: options.env,
        logger,
        processRunJob: async (job) => {
          await runtime.processRunJob(job);
        },
      }));
  } catch (error) {
    if (graphCheckpointerHandle) {
      await graphCheckpointerHandle.close();
    }
    await pgClient.end();
    throw error;
  }

  logger.info("Agent worker runtime bootstrapped", {
    concurrency: options.env.workerConcurrency,
    heartbeatIntervalMs: options.env.heartbeatIntervalMs,
    leaseTtlMs: options.env.leaseTtlMs,
    langGraphCheckpointerMode: options.env.langGraphCheckpointerMode,
    queueConsumer: queueConsumer.mode,
    queueName: options.env.bullmqQueueName,
    agentInternalBaseUrl: options.env.agentInternalBaseUrl,
    tooldiCatalogSourceMode: options.env.tooldiCatalogSourceMode,
  });

  return runtime;
}
