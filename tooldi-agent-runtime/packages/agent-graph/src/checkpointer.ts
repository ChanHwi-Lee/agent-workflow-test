import { MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type { Logger } from "@tooldi/agent-observability";

export interface WorkerGraphCheckpointerHandle {
  checkpointer: BaseCheckpointSaver;
  close(): Promise<void>;
}

export async function createWorkerGraphCheckpointer(
  env: AgentWorkerEnv,
  logger: Logger,
): Promise<WorkerGraphCheckpointerHandle> {
  if (env.langGraphCheckpointerMode === "memory") {
    logger.info("LangGraph worker checkpointer configured", {
      mode: "memory",
    });
    return {
      checkpointer: new MemorySaver(),
      async close() {},
    };
  }

  const connectionString =
    env.langGraphCheckpointerPostgresUrl ?? env.postgresUrl;
  const checkpointer = PostgresSaver.fromConnString(connectionString, {
    schema: env.langGraphCheckpointerSchema,
  });
  await checkpointer.setup();
  logger.info("LangGraph worker checkpointer configured", {
    mode: "postgres",
    schema: env.langGraphCheckpointerSchema,
  });
  return {
    checkpointer,
    async close() {
      await checkpointer.end();
    },
  };
}

export function buildLangGraphThreadId(
  runId: string,
  attemptSeq: number,
): string {
  return `${runId}:${attemptSeq}`;
}
