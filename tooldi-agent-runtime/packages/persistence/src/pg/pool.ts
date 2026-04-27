import pg from "pg";

export interface AgentRuntimePgPoolConfig {
  connectionString: string;
  // node-postgres production 권장 옵션. caller 가 env-configurable 로 전달.
  max?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  applicationName?: string;
}

// Pool ownership 위치: 이 factory 가 만든 pg.Pool 의 lifecycle 은 caller 가 책임진다.
// LangGraph PostgresSaver 와 Drizzle 둘 다 이 pool 의 consumer 로 주입되며,
// node-postgres 공식 권장 (application 당 single pool sharing) 패턴.
export function createAgentRuntimePgPool(
  config: AgentRuntimePgPoolConfig,
): pg.Pool {
  return new pg.Pool({
    connectionString: config.connectionString,
    ...(config.max !== undefined ? { max: config.max } : {}),
    ...(config.connectionTimeoutMillis !== undefined
      ? { connectionTimeoutMillis: config.connectionTimeoutMillis }
      : {}),
    ...(config.idleTimeoutMillis !== undefined
      ? { idleTimeoutMillis: config.idleTimeoutMillis }
      : {}),
    ...(config.applicationName !== undefined
      ? { application_name: config.applicationName }
      : {}),
  });
}
