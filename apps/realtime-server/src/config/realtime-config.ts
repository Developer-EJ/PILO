import { hostname } from "node:os";

export type RealtimeServerConfig = {
  appServerUrl: string;
  canvasActivityToken: string | null;
  corsOrigin: string | string[];
  databaseApplicationName: string;
  databasePoolConnectionTimeoutMs: number;
  databasePoolIdleTimeoutMs: number;
  databasePoolMax: number;
  databaseSsl: boolean;
  databaseUrl: string;
  documentRedisSyncEnabled: boolean;
  port: number;
  realtimeInstanceId: string;
  redisUrl: string | null;
  scope: string;
};

const API_BASE_PATH = "/api/v1";
const DEFAULT_DATABASE_URL = "postgresql://pilo:pilo@localhost:5432/pilo";
const DEFAULT_APP_SERVER_URL = "http://localhost:4000";
const DEFAULT_DATABASE_POOL_MAX = 1;
const DEFAULT_DATABASE_POOL_IDLE_TIMEOUT_MS = 10_000;
const DEFAULT_DATABASE_POOL_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_DATABASE_APPLICATION_NAME = "pilo-realtime-server";

function parseCorsOrigin(value: string | undefined) {
  if (!value) return "*";

  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) return "*";
  if (origins.length === 1) return origins[0] ?? "*";

  return origins;
}

export function loadRealtimeServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): RealtimeServerConfig {
  const redisUrl = env.REDIS_URL?.trim() || null;
  const documentRedisSyncEnabled = env.DOCUMENT_REDIS_SYNC_ENABLED === "true";

  if (documentRedisSyncEnabled && !redisUrl) {
    throw new Error("DOCUMENT_REDIS_SYNC_ENABLED requires REDIS_URL");
  }
  if (documentRedisSyncEnabled && redisUrl) {
    validateRedisUrl(redisUrl);
  }

  return {
    appServerUrl: normalizeAppServerBaseUrl(
      env.APP_SERVER_URL?.trim() ||
        env.API_PUBLIC_ORIGIN?.trim() ||
        DEFAULT_APP_SERVER_URL,
    ),
    canvasActivityToken: env.REALTIME_CANVAS_ACTIVITY_TOKEN?.trim() || null,
    corsOrigin: parseCorsOrigin(env.SOCKET_IO_CORS_ORIGIN),
    databaseApplicationName:
      env.DATABASE_APPLICATION_NAME?.trim() || DEFAULT_DATABASE_APPLICATION_NAME,
    databasePoolConnectionTimeoutMs: parsePositiveInteger(
      env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
      "DATABASE_POOL_CONNECTION_TIMEOUT_MS",
      DEFAULT_DATABASE_POOL_CONNECTION_TIMEOUT_MS,
    ),
    databasePoolIdleTimeoutMs: parsePositiveInteger(
      env.DATABASE_POOL_IDLE_TIMEOUT_MS,
      "DATABASE_POOL_IDLE_TIMEOUT_MS",
      DEFAULT_DATABASE_POOL_IDLE_TIMEOUT_MS,
    ),
    databasePoolMax: parsePositiveInteger(
      env.DATABASE_POOL_MAX,
      "DATABASE_POOL_MAX",
      DEFAULT_DATABASE_POOL_MAX,
    ),
    databaseSsl: env.DATABASE_SSL === "true",
    databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    documentRedisSyncEnabled,
    port: Number.parseInt(env.PORT ?? "3001", 10),
    realtimeInstanceId: env.REALTIME_INSTANCE_ID?.trim() || hostname(),
    redisUrl,
    scope: env.REALTIME_SCOPE ?? "notifications_status_only",
  };
}

function validateRedisUrl(redisUrl: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(redisUrl);
  } catch {
    throw new Error("REDIS_URL must use redis: or rediss:");
  }

  if (parsedUrl.protocol !== "redis:" && parsedUrl.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis: or rediss:");
  }
}

function normalizeAppServerBaseUrl(appServerUrl: string) {
  const trimmedUrl = appServerUrl.trim().replace(/\/+$/, "");

  return trimmedUrl.endsWith(API_BASE_PATH)
    ? trimmedUrl
    : `${trimmedUrl}${API_BASE_PATH}`;
}

function parsePositiveInteger(
  value: string | undefined,
  variableName: string,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${variableName} must be a positive integer`);
  }

  return parsed;
}
