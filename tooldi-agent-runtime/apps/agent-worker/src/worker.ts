import type { RunJobEnvelope } from "@tooldi/agent-contracts";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
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
import type { ProcessRunJobResult } from "./types.js";

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
}

export interface AgentWorkerRuntime extends ProcessRunJobDependencies {
  env: AgentWorkerEnv;
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
    async processRunJob(job: RunJobEnvelope) {
      return processRunJob(job, runtime);
    },
    async close() {
      if (queueConsumer) {
        await queueConsumer.close();
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
    await pgClient.end();
    throw error;
  }

  logger.info("Agent worker runtime bootstrapped", {
    concurrency: options.env.workerConcurrency,
    heartbeatIntervalMs: options.env.heartbeatIntervalMs,
    leaseTtlMs: options.env.leaseTtlMs,
    queueConsumer: queueConsumer.mode,
    queueName: options.env.bullmqQueueName,
    agentInternalBaseUrl: options.env.agentInternalBaseUrl,
  });

  return runtime;
}
