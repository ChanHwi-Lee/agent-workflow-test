export const runtimeEnvironments = [
  "development",
  "test",
  "production",
] as const;

export type RuntimeEnvironment = (typeof runtimeEnvironments)[number];

export const logLevels = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof logLevels)[number];

export interface SharedRuntimeEnv {
  nodeEnv: RuntimeEnvironment;
  logLevel: LogLevel;
  postgresUrl: string;
  redisUrl: string;
  bullmqQueueName: string;
  objectStoreMode: "memory" | "filesystem";
  objectStoreRootDir: string;
  objectStoreBucket: string;
  objectStorePrefix: string;
  objectStoreEndpoint: string | null;
}

export const apiQueueTransportModes = ["bullmq", "memory"] as const;

export type ApiQueueTransportMode = (typeof apiQueueTransportModes)[number];

export interface AgentApiEnv extends SharedRuntimeEnv {
  host: string;
  port: number;
  publicBaseUrl: string;
  sseHeartbeatIntervalMs: number;
  queueTransportMode: ApiQueueTransportMode;
}

export const workerQueueTransportModes = ["bullmq", "disabled"] as const;

export type WorkerQueueTransportMode =
  (typeof workerQueueTransportModes)[number];

export const templatePlannerProviders = [
  "openai",
  "anthropic",
  "google",
] as const;

export interface AgentWorkerEnv extends SharedRuntimeEnv {
  workerConcurrency: number;
  heartbeatIntervalMs: number;
  leaseTtlMs: number;
  queueTransportMode: WorkerQueueTransportMode;
  agentInternalBaseUrl: string;
  templatePlannerMode: "heuristic" | "langchain";
  templatePlannerProvider: (typeof templatePlannerProviders)[number] | null;
  templatePlannerModel: string | null;
  templatePlannerTemperature: number;
  langGraphCheckpointerMode: "memory" | "postgres";
  langGraphCheckpointerPostgresUrl: string | null;
  langGraphCheckpointerSchema: string;
  tooldiCatalogSourceMode: "placeholder" | "tooldi_api" | "tooldi_api_direct";
  tooldiContentApiBaseUrl: string | null;
  tooldiContentApiTimeoutMs: number | null;
  tooldiContentApiCookie: string | null;
  exitAfterBoot: boolean;
}

export type EnvSource = Record<string, string | undefined>;

function readString(source: EnvSource, key: string, fallback?: string): string {
  const value = source[key] ?? fallback;
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function readNumber(source: EnvSource, key: string, fallback: number): number {
  const raw = source[key];
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${key} must be a finite number`);
  }
  return parsed;
}

function readOptionalNumber(
  source: EnvSource,
  key: string,
): number | null {
  const raw = source[key];
  if (raw === undefined || raw.trim().length === 0) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${key} must be a finite number`);
  }
  return parsed <= 0 ? null : parsed;
}

function readOptionalString(source: EnvSource, key: string): string | null {
  const value = source[key];
  if (value === undefined || value.trim().length === 0) {
    return null;
  }
  return value;
}

function readOptionalEnumValue<const Values extends readonly string[]>(
  source: EnvSource,
  key: string,
  values: Values,
): Values[number] | null {
  const value = readOptionalString(source, key);
  if (value === null) {
    return null;
  }
  if (values.includes(value)) {
    return value;
  }
  throw new Error(
    `Unsupported ${key}: ${value}. Expected one of: ${values.join(", ")}`,
  );
}

function readBoolean(
  source: EnvSource,
  key: string,
  fallback: boolean,
): boolean {
  const raw = source[key];
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  if (raw === "1" || raw.toLowerCase() === "true") {
    return true;
  }
  if (raw === "0" || raw.toLowerCase() === "false") {
    return false;
  }
  throw new Error(`Environment variable ${key} must be a boolean-like value`);
}

function readEnumValue<const Values extends readonly string[]>(
  source: EnvSource,
  key: string,
  values: Values,
  fallback: Values[number],
): Values[number] {
  const value = readString(source, key, fallback);
  if (values.includes(value)) {
    return value;
  }
  throw new Error(
    `Unsupported ${key}: ${value}. Expected one of: ${values.join(", ")}`,
  );
}

function readRuntimeEnvironment(source: EnvSource): RuntimeEnvironment {
  const value = readString(source, "NODE_ENV", "development");
  if (runtimeEnvironments.includes(value as RuntimeEnvironment)) {
    return value as RuntimeEnvironment;
  }
  throw new Error(`Unsupported NODE_ENV: ${value}`);
}

function readLogLevel(source: EnvSource): LogLevel {
  const value = readString(source, "LOG_LEVEL", "info");
  if (logLevels.includes(value as LogLevel)) {
    return value as LogLevel;
  }
  throw new Error(`Unsupported LOG_LEVEL: ${value}`);
}

export function loadSharedEnv(
  source: EnvSource = process.env,
): SharedRuntimeEnv {
  return {
    nodeEnv: readRuntimeEnvironment(source),
    logLevel: readLogLevel(source),
    postgresUrl: readString(
      source,
      "POSTGRES_URL",
      "postgres://localhost:5432/tooldi_agent_runtime",
    ),
    redisUrl: readString(source, "REDIS_URL", "redis://localhost:6379/0"),
    bullmqQueueName: readString(
      source,
      "BULLMQ_QUEUE_NAME",
      "agent-workflow-interactive",
    ),
    objectStoreMode: readEnumValue(
      source,
      "OBJECT_STORE_MODE",
      ["memory", "filesystem"] as const,
      "filesystem",
    ),
    objectStoreRootDir: readString(
      source,
      "OBJECT_STORE_ROOT_DIR",
      "/tmp/tooldi-agent-runtime-object-store",
    ),
    objectStoreBucket: readString(
      source,
      "OBJECT_STORE_BUCKET",
      "tooldi-agent-runtime-local",
    ),
    objectStorePrefix: readString(
      source,
      "OBJECT_STORE_PREFIX",
      "agent-runtime",
    ),
    objectStoreEndpoint: readOptionalString(source, "OBJECT_STORE_ENDPOINT"),
  };
}

export function loadAgentApiEnv(source: EnvSource = process.env): AgentApiEnv {
  const shared = loadSharedEnv(source);
  const host = readString(source, "API_HOST", "0.0.0.0");
  const port = readNumber(source, "API_PORT", 3000);

  return {
    ...shared,
    host,
    port,
    publicBaseUrl: readString(
      source,
      "PUBLIC_BASE_URL",
      `http://${host}:${port}`,
    ),
    sseHeartbeatIntervalMs: readNumber(
      source,
      "SSE_HEARTBEAT_INTERVAL_MS",
      15000,
    ),
    queueTransportMode: readEnumValue(
      source,
      "API_QUEUE_TRANSPORT_MODE",
      apiQueueTransportModes,
      "bullmq",
    ),
  };
}

export function loadAgentWorkerEnv(
  source: EnvSource = process.env,
): AgentWorkerEnv {
  const tooldiCatalogSourceMode = readEnumValue(
    source,
    "TOOLDI_CATALOG_SOURCE_MODE",
    ["placeholder", "tooldi_api", "tooldi_api_direct"] as const,
    "placeholder",
  );
  const tooldiContentApiBaseUrl = readOptionalString(
    source,
    "TOOLDI_CONTENT_API_BASE_URL",
  );
  if (
    (tooldiCatalogSourceMode === "tooldi_api" ||
      tooldiCatalogSourceMode === "tooldi_api_direct") &&
    !tooldiContentApiBaseUrl
  ) {
    throw new Error(
      "Missing required environment variable: TOOLDI_CONTENT_API_BASE_URL",
    );
  }

  return {
    ...loadSharedEnv(source),
    workerConcurrency: readNumber(source, "WORKER_CONCURRENCY", 4),
    heartbeatIntervalMs: readNumber(
      source,
      "WORKER_HEARTBEAT_INTERVAL_MS",
      5000,
    ),
    leaseTtlMs: readNumber(source, "WORKER_LEASE_TTL_MS", 30000),
    queueTransportMode: readEnumValue(
      source,
      "WORKER_QUEUE_TRANSPORT_MODE",
      workerQueueTransportModes,
      "bullmq",
    ),
    agentInternalBaseUrl: readString(
      source,
      "AGENT_INTERNAL_BASE_URL",
      "http://127.0.0.1:3000",
    ),
    templatePlannerMode: readEnumValue(
      source,
      "TEMPLATE_PLANNER_MODE",
      ["heuristic", "langchain"] as const,
      "heuristic",
    ),
    templatePlannerProvider: readOptionalEnumValue(
      source,
      "TEMPLATE_PLANNER_PROVIDER",
      templatePlannerProviders,
    ),
    templatePlannerModel: readOptionalString(source, "TEMPLATE_PLANNER_MODEL"),
    templatePlannerTemperature: readNumber(
      source,
      "TEMPLATE_PLANNER_TEMPERATURE",
      0,
    ),
    langGraphCheckpointerMode: readEnumValue(
      source,
      "LANGGRAPH_CHECKPOINTER_MODE",
      ["memory", "postgres"] as const,
      "postgres",
    ),
    langGraphCheckpointerPostgresUrl: readOptionalString(
      source,
      "LANGGRAPH_CHECKPOINTER_POSTGRES_URL",
    ),
    langGraphCheckpointerSchema: readString(
      source,
      "LANGGRAPH_CHECKPOINTER_SCHEMA",
      "agent_langgraph",
    ),
    tooldiCatalogSourceMode,
    tooldiContentApiBaseUrl,
    tooldiContentApiTimeoutMs: readOptionalNumber(
      source,
      "TOOLDI_CONTENT_API_TIMEOUT_MS",
    ),
    tooldiContentApiCookie: readOptionalString(
      source,
      "TOOLDI_CONTENT_API_COOKIE",
    ),
    exitAfterBoot: readBoolean(source, "WORKER_EXIT_AFTER_BOOT", false),
  };
}
