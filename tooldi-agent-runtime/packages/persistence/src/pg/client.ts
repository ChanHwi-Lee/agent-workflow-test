export interface PgClientConfig {
  connectionString: string;
  schema?: string;
  applicationName?: string;
  ssl?: boolean;
}

export interface QueryResult<Row extends object = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}

export interface PgClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

class PgClientPlaceholder implements PgClient {
  private connected = false;

  constructor(private readonly config: PgClientConfig) {}

  async connect(): Promise<void> {
    this.connected = true;
  }

  async end(): Promise<void> {
    this.connected = false;
  }

  async query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    if (!this.connected) {
      throw new Error("PgClientPlaceholder.query called before connect()");
    }

    throw new Error(
      `PgClientPlaceholder.query is not implemented yet for schema ${this.config.schema ?? "public"}: ${sql} (${parameters.length} params)`,
    );
  }
}

export function createPgClient(config: PgClientConfig): PgClient {
  return new PgClientPlaceholder(config);
}
