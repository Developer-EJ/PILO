import { createRequire } from "node:module";

import type { DocumentEventLogger } from "./document-observability";

type RedisExtension = {
  onDestroy: () => Promise<void>;
  onStoreDocument?: (payload: unknown) => Promise<void>;
};

type RedisExtensionConfiguration = {
  host: string;
  identifier: string;
  lockTimeout: number;
  options: {
    db?: number;
    password?: string;
    tls?: Record<string, never>;
    username?: string;
  };
  port: number;
};

const { Redis } = createRequire(__filename)("@hocuspocus/extension-redis") as {
  Redis: new (configuration: RedisExtensionConfiguration) => RedisExtension;
};

export type DocumentRedisSync = {
  close: () => Promise<void>;
  extensions: RedisExtension[];
  status: "disabled" | "ready";
};

export function createDocumentRedisSync({
  createExtension = (configuration) => new Redis(configuration),
  enabled,
  eventLogger,
  instanceId,
  lockRetryDelayMs = 50,
  maxLockWaitMs = 10_000,
  redisUrl,
}: {
  createExtension?: (configuration: RedisExtensionConfiguration) => RedisExtension;
  enabled: boolean;
  eventLogger: DocumentEventLogger;
  instanceId: string;
  lockRetryDelayMs?: number;
  maxLockWaitMs?: number;
  redisUrl: string | null;
}): DocumentRedisSync {
  if (!enabled) {
    return { close: async () => undefined, extensions: [], status: "disabled" };
  }
  if (!redisUrl) {
    throw new Error("DOCUMENT_REDIS_SYNC_ENABLED requires REDIS_URL");
  }

  const parsedUrl = new URL(redisUrl);
  const options: RedisExtensionConfiguration["options"] = {};
  if (parsedUrl.username) options.username = decodeURIComponent(parsedUrl.username);
  if (parsedUrl.password) options.password = decodeURIComponent(parsedUrl.password);
  if (parsedUrl.pathname.length > 1) options.db = Number(parsedUrl.pathname.slice(1));
  if (parsedUrl.protocol === "rediss:") options.tls = {};

  const extension = createExtension({
    host: parsedUrl.hostname,
    identifier: instanceId,
    lockTimeout: 10_000,
    options,
    port: Number(parsedUrl.port || "6379"),
  });
  retryContendedStoreLock(extension, lockRetryDelayMs, maxLockWaitMs);
  eventLogger({ event: "document_redis_sync_ready", status: "ready" });

  let closed = false;
  return {
    async close() {
      if (closed) return;
      closed = true;
      await extension.onDestroy();
    },
    extensions: [extension],
    status: "ready",
  };
}

function retryContendedStoreLock(
  extension: RedisExtension,
  retryDelayMs: number,
  maxWaitMs: number,
) {
  if (!extension.onStoreDocument) return;

  const acquireStoreLock = extension.onStoreDocument.bind(extension);
  extension.onStoreDocument = async (payload) => {
    const deadline = performance.now() + maxWaitMs;
    while (true) {
      try {
        await acquireStoreLock(payload);
        return;
      } catch (error) {
        if (!isStoreLockContention(error) || performance.now() >= deadline) {
          throw error;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  };
}

function isStoreLockContention(error: unknown) {
  return (
    error instanceof Error &&
    error.name === "SkipFurtherHooksError" &&
    error.message === "Another instance is already storing this document"
  );
}
