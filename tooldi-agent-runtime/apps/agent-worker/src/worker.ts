import type { RunJobEnvelope } from "@tooldi/agent-contracts";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type { Logger } from "@tooldi/agent-observability";
import {
  createObjectStoreClient,
  createPgClient,
  type ObjectStoreClient,
  type PgClient,
} from "@tooldi/agent-persistence";
import type { AssetStorageClient, ImagePrimitiveClient, TextLayoutHelper } from "@tooldi/tool-adapters";
import type { ToolRegistry } from "@tooldi/tool-registry";

import { createBackendCallbackClient, type BackendCallbackClient } from "./clients/backendCallbackClient.js";
import { createWorkerLogger } from "./lib/logger.js";
import { processRunJob, type ProcessRunJobDependencies } from "./jobs/processRunJob.js";
import { createAssetStorageClient } from "./tools/adapters/assetStorageAdapter.js";
import { createImagePrimitiveClient } from "./tools/adapters/imagePrimitiveAdapter.js";
import { createTextLayoutHelper } from "./tools/adapters/textLayoutHelperAdapter.js";
import { createWorkerToolRegistry } from "./tools/registry.js";
import type { ProcessRunJobResult } from "./types.js";

export interface BuildWorkerRuntimeOptions {
  env: AgentWorkerEnv;
  logger?: Logger;
  objectStore?: ObjectStoreClient;
  pgClient?: PgClient;
  callbackClient?: BackendCallbackClient;
  toolRegistry?: ToolRegistry;
  imagePrimitiveClient?: ImagePrimitiveClient;
  assetStorageClient?: AssetStorageClient;
  textLayoutHelper?: TextLayoutHelper;
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

  const runtime: AgentWorkerRuntime = {
    env: options.env,
    logger,
    objectStore:
      options.objectStore ??
      createObjectStoreClient({
        bucket: options.env.objectStoreBucket,
      }),
    callbackClient: options.callbackClient ?? createBackendCallbackClient(logger),
    toolRegistry: options.toolRegistry ?? createWorkerToolRegistry(),
    imagePrimitiveClient: options.imagePrimitiveClient ?? createImagePrimitiveClient(),
    assetStorageClient: options.assetStorageClient ?? createAssetStorageClient(),
    textLayoutHelper: options.textLayoutHelper ?? createTextLayoutHelper(),
    async processRunJob(job: RunJobEnvelope) {
      return processRunJob(job, runtime);
    },
    async close() {
      await pgClient.end();
    },
  };

  logger.info("Agent worker runtime bootstrapped", {
    concurrency: options.env.workerConcurrency,
    heartbeatIntervalMs: options.env.heartbeatIntervalMs,
    leaseTtlMs: options.env.leaseTtlMs,
    queueConsumer: "not_wired_yet",
  });

  return runtime;
}
