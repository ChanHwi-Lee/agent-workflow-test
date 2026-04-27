import { MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type pg from "pg";
import type { AgentWorkerEnv } from "@tooldi/agent-config";
import type { Logger } from "@tooldi/agent-observability";

export interface WorkerGraphCheckpointerHandle {
  checkpointer: BaseCheckpointSaver;
  // pool 의 lifecycle 은 caller (worker runtime) 가 책임진다. wrapper 의 close 는
  // checkpointer 자체의 정리만 담당하며, pool.end() 를 호출하지 않는다.
  close(): Promise<void>;
}

export async function createWorkerGraphCheckpointer(
  env: AgentWorkerEnv,
  logger: Logger,
  pool: pg.Pool | null,
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

  if (!pool) {
    throw new Error(
      "createWorkerGraphCheckpointer: pg.Pool is required in postgres mode",
    );
  }

  // node-postgres 공식 권장 (application 당 single pool, 모든 ORM/library 공유) 에 따라
  // caller 가 만든 pool 을 PostgresSaver 와 Drizzle 가 함께 consume 한다.
  const checkpointer = new PostgresSaver(pool, undefined, {
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
      // PostgresSaver.end() 는 결국 this.pool.end() 만 호출하므로,
      // pool 의 owner 인 caller 가 pool.end() 하는 것으로 충분 (double-close 회피).
    },
  };
}

export function buildLangGraphThreadId(
  runId: string,
  attemptSeq: number,
): string {
  return `${runId}:${attemptSeq}`;
}
