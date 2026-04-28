import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import { agentRuntimeSchema } from "../schema/runtime.js";

export interface PgClientConfig {
  connectionString: string;
  schema?: string;
  applicationName?: string;
  ssl?: boolean;
  max?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  runMigrations?: boolean;
}

export interface QueryResult<Row extends object = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}

export type AgentRuntimeDb = NodePgDatabase<typeof agentRuntimeSchema>;

export interface PgClient {
  readonly db: AgentRuntimeDb;
  readonly pool: pg.Pool;
  connect(): Promise<void>;
  end(): Promise<void>;
  query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

const AGENT_RUNTIME_MIGRATE_LOCK_KEY = 728_491_201_002;

class NodePostgresPgClient implements PgClient {
  readonly pool: pg.Pool;
  readonly db: AgentRuntimeDb;
  private connected = false;
  private closed = false;

  constructor(private readonly config: PgClientConfig) {
    this.pool = new pg.Pool({
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
      ...(config.ssl !== undefined ? { ssl: config.ssl } : {}),
    });
    this.db = drizzle({
      client: this.pool,
      schema: agentRuntimeSchema,
    });
  }

  async connect(): Promise<void> {
    if (this.closed) {
      throw new Error("PgClient.connect called after end()");
    }
    if (this.connected) {
      return;
    }
    await this.pool.query("select 1");
    if (this.config.runMigrations !== false) {
      await this.runMigrations();
    }
    this.connected = true;
  }

  async end(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.connected = false;
    this.closed = true;
    await this.pool.end();
  }

  async query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    if (!this.connected) {
      throw new Error("PgClient.query called before connect()");
    }

    const result = await this.pool.query<Row>(sql, [...parameters]);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
    };
  }

  private async runMigrations(): Promise<void> {
    const migrationsFolder = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../drizzle",
    );
    const client = await this.pool.connect();
    try {
      await client.query("select pg_advisory_lock($1)", [
        AGENT_RUNTIME_MIGRATE_LOCK_KEY,
      ]);
      await migrate(this.db, { migrationsFolder });
    } finally {
      try {
        await client.query("select pg_advisory_unlock($1)", [
          AGENT_RUNTIME_MIGRATE_LOCK_KEY,
        ]);
      } finally {
        client.release();
      }
    }
  }
}

export function createPgClient(config: PgClientConfig): PgClient {
  return new NodePostgresPgClient(config);
}

export async function resetAgentRuntimeData(db: PgClient): Promise<void> {
  await db.query(`
    TRUNCATE TABLE
      agent_runtime.run_completions,
      agent_runtime.draft_bundles,
      agent_runtime.cost_summaries,
      agent_runtime.run_recoveries,
      agent_runtime.mutation_ledger,
      agent_runtime.run_events,
      agent_runtime.run_attempts,
      agent_runtime.runs,
      agent_runtime.run_requests
    RESTART IDENTITY
  `);
}
