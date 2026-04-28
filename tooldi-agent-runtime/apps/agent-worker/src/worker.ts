import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RunJobEnvelope } from "@tooldi/agent-contracts";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import {
  createWorkerGraphCheckpointer,
  type WorkerGraphCheckpointerHandle,
} from "@tooldi/agent-graph";
import type { Logger } from "@tooldi/agent-observability";
import {
  createAgentRuntimePgPool,
  createObjectStoreClient,
  createPgClient,
  type ObjectStoreClient,
  type PgClient,
} from "@tooldi/agent-persistence";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { createBackendCallbackClient, type BackendCallbackClient } from "./clients/backendCallbackClient.js";
import { createWorkerLogger } from "./lib/logger.js";
import { createRunQueueConsumer, type RunQueueConsumer } from "./lib/runQueueConsumer.js";
import {
  processRunJob,
  resumeRunJob,
  type ProcessRunJobDependencies,
} from "./jobs/processRunJob.js";
import { runWithAdvisoryLock } from "./persistence/advisoryLock.js";
import type { ProcessRunJobResult } from "./types.js";
import type { V6NodeOverrides } from "./graph/v6PipelineNode.js";

// drizzle-orm migrate() 가 multi-instance 동시 실행을 보호하지 않으므로
// (drizzle-orm issue #874) advisory lock 으로 직렬화한다. key 변경 시 같은 lock
// 영역의 다른 worker 와 동기화 필수.
const INTERVIEW_RECORDS_MIGRATE_LOCK_KEY = 728_491_201_001;

export interface BuildWorkerRuntimeOptions {
  env: AgentWorkerEnv;
  logger?: Logger;
  objectStore?: ObjectStoreClient;
  pgClient?: PgClient;
  callbackClient?: BackendCallbackClient;
  queueConsumer?: RunQueueConsumer;
  v6Overrides?: V6NodeOverrides;
  v6TrendResearcher?: ProcessRunJobDependencies["v6TrendResearcher"];
}

export interface AgentWorkerRuntime extends ProcessRunJobDependencies {
  env: AgentWorkerEnv;
  processRunJob(job: RunJobEnvelope): Promise<ProcessRunJobResult>;
  resumeRunJob(
    runId: string,
    attemptSeq: number,
    answers: unknown,
  ): Promise<ProcessRunJobResult>;
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
      applicationName: options.env.postgresApplicationName,
    });
  await pgClient.connect();

  // Runtime 이 pg.Pool 의 owner. PostgresSaver 와 Drizzle 둘 다 이 pool 의 consumer.
  // node-postgres 공식 권장 (application 당 single pool, 모든 ORM/library 공유) 패턴.
  // memory mode 면 pool=null → migrate skip + sidecar db=undefined.
  let pool: pg.Pool | null = null;
  if (options.env.langGraphCheckpointerMode === "postgres") {
    const connectionString =
      options.env.langGraphCheckpointerPostgresUrl ?? options.env.postgresUrl;
    pool = createAgentRuntimePgPool({
      connectionString,
      max: options.env.postgresPoolMax,
      connectionTimeoutMillis: options.env.postgresPoolConnectionTimeoutMs,
      idleTimeoutMillis: options.env.postgresPoolIdleTimeoutMs,
      applicationName: options.env.postgresApplicationName,
    });
    // node-postgres 의 pool 은 idle client backend/network error 를 emit 하는데
    // listener 가 없으면 unhandled error → process crash. 단순 로깅만으로도
    // crash 방어선 역할 (pool 이 자동으로 해당 client 를 종료/제거하므로 추가 정리 X).
    pool.on("error", (error) => {
      logger.error("pg pool client error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  let queueConsumer: RunQueueConsumer | null = null;
  let graphCheckpointerHandle: WorkerGraphCheckpointerHandle | null = null;
  let interviewRecordsDb: NodePgDatabase | undefined;

  try {
    graphCheckpointerHandle = await createWorkerGraphCheckpointer(
      options.env,
      logger,
      pool,
    );

    if (pool) {
      interviewRecordsDb = drizzle({ client: pool });
      const migrationsFolder = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/persistence/drizzle",
      );
      // multi-replica 동시 boot 시 race 방지 (drizzle-orm issue #874).
      await runWithAdvisoryLock(
        pool,
        INTERVIEW_RECORDS_MIGRATE_LOCK_KEY,
        async () => {
          await migrate(interviewRecordsDb!, { migrationsFolder });
        },
      );
      logger.info("Interview records migrations applied", { migrationsFolder });
    }
  } catch (error) {
    // R-2 정책: setup / migrate 실패 시 boot 차단 (LangGraph setup 과 동일).
    if (graphCheckpointerHandle) {
      await graphCheckpointerHandle.close();
    }
    if (pool) {
      await pool.end();
    }
    await pgClient.end();
    throw error;
  }

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
    langGraphCheckpointer: graphCheckpointerHandle.checkpointer,
    ...(interviewRecordsDb ? { interviewRecordsDb } : {}),
    ...(options.v6Overrides
      ? { v6Overrides: options.v6Overrides }
      : {}),
    ...(options.v6TrendResearcher
      ? { v6TrendResearcher: options.v6TrendResearcher }
      : {}),
    async processRunJob(job: RunJobEnvelope) {
      return processRunJob(job, runtime);
    },
    async resumeRunJob(runId: string, attemptSeq: number, answers: unknown) {
      return resumeRunJob({ runId, attemptSeq, answers }, runtime);
    },
    async close() {
      if (queueConsumer) {
        await queueConsumer.close();
      }
      if (graphCheckpointerHandle) {
        await graphCheckpointerHandle.close();
      }
      // pool 의 owner 는 runtime. 여기서 닫는다.
      if (pool) {
        await pool.end();
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
        resumeRunJob: async (payload) => {
          await runtime.resumeRunJob(payload.runId, payload.attemptSeq, payload.answers);
        },
      }));
  } catch (error) {
    if (graphCheckpointerHandle) {
      await graphCheckpointerHandle.close();
    }
    if (pool) {
      await pool.end();
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
