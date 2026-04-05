export const runtimeEnvironments = [
  "development",
  "test",
  "production",
] as const;

export type RuntimeEnvironment = (typeof runtimeEnvironments)[number];

export const logLevels = [
  "debug",
  "info",
  "warn",
  "error",
] as const;

export type LogLevel = (typeof logLevels)[number];

export interface SharedRuntimeEnv {
  nodeEnv: RuntimeEnvironment;
  logLevel: LogLevel;
  postgresUrl: string;
  redisUrl: string;
  objectStoreBucket: string;
  objectStorePrefix: string;
  objectStoreEndpoint: string | null;
}

export interface AgentApiEnv extends SharedRuntimeEnv {
  host: string;
  port: number;
  publicBaseUrl: string;
  sseHeartbeatIntervalMs: number;
}

export interface AgentWorkerEnv extends SharedRuntimeEnv {
  workerConcurrency: number;
  heartbeatIntervalMs: number;
  leaseTtlMs: number;
}

export type EnvSource = Record<string, string | undefined>;

function readString(
  source: EnvSource,
  key: string,
  fallback?: string,
): string {
  const value = source[key] ?? fallback;
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function readNumber(
  source: EnvSource,
  key: string,
  fallback: number,
): number {
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

function readOptionalString(
  source: EnvSource,
  key: string,
): string | null {
  const value = source[key];
  if (value === undefined || value.trim().length === 0) {
    return null;
  }
  return value;
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

export function loadSharedEnv(source: EnvSource = process.env): SharedRuntimeEnv {
  return {
    nodeEnv: readRuntimeEnvironment(source),
    logLevel: readLogLevel(source),
    postgresUrl: readString(
      source,
      "POSTGRES_URL",
      "postgres://localhost:5432/tooldi_agent_runtime",
    ),
    redisUrl: readString(source, "REDIS_URL", "redis://localhost:6379/0"),
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
    sseHeartbeatIntervalMs: readNumber(source, "SSE_HEARTBEAT_INTERVAL_MS", 15000),
  };
}

export function loadAgentWorkerEnv(
  source: EnvSource = process.env,
): AgentWorkerEnv {
  return {
    ...loadSharedEnv(source),
    workerConcurrency: readNumber(source, "WORKER_CONCURRENCY", 4),
    heartbeatIntervalMs: readNumber(source, "WORKER_HEARTBEAT_INTERVAL_MS", 5000),
    leaseTtlMs: readNumber(source, "WORKER_LEASE_TTL_MS", 30000),
  };
}
