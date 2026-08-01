import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { createClient } from "redis";

import type { DocumentEventLogger } from "./document-observability";

type RedisExtension = {
  afterStoreDocument?: (payload: unknown) => Promise<void>;
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

type RedisCommandClient = {
  connect: () => Promise<unknown>;
  destroy: () => void;
  eval: (
    script: string,
    options: { arguments: string[]; keys: string[] },
  ) => Promise<unknown>;
  on: (event: string, listener: () => void) => unknown;
  ping: () => Promise<string>;
  quit: () => Promise<unknown>;
  set: (
    key: string,
    value: string,
    options: { NX: true; PX: number },
  ) => Promise<string | null>;
};

const { Redis } = createRequire(__filename)("@hocuspocus/extension-redis") as {
  Redis: new (configuration: RedisExtensionConfiguration) => RedisExtension;
};

const renewLeaseScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end
return 0`;
const releaseLeaseScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0`;

export type DocumentCheckpointCoordinator = {
  runExclusive: <T>(key: string, work: () => Promise<T>) => Promise<T>;
};

export type DocumentRedisSync = {
  checkpointCoordinator: DocumentCheckpointCoordinator | null;
  close: () => Promise<void>;
  extensions: RedisExtension[];
  readonly status: "disabled" | "ready" | "unavailable";
};

export async function createDocumentRedisSync({
  commandTimeoutMs = 2_000,
  connectTimeoutMs = 5_000,
  createCommandClient = (url) =>
    createClient({
      disableOfflineQueue: true,
      socket: { connectTimeout: connectTimeoutMs },
      url,
    }) as unknown as RedisCommandClient,
  createExtension = (configuration) => new Redis(configuration),
  enabled,
  eventLogger,
  instanceId,
  leaseDurationMs = 30_000,
  lockRetryDelayMs = 50,
  maxLockWaitMs = 10_000,
  redisUrl,
}: {
  commandTimeoutMs?: number;
  connectTimeoutMs?: number;
  createCommandClient?: (url: string) => RedisCommandClient;
  createExtension?: (configuration: RedisExtensionConfiguration) => RedisExtension;
  enabled: boolean;
  eventLogger: DocumentEventLogger;
  instanceId: string;
  leaseDurationMs?: number;
  lockRetryDelayMs?: number;
  maxLockWaitMs?: number;
  redisUrl: string | null;
}): Promise<DocumentRedisSync> {
  if (!enabled) {
    return {
      checkpointCoordinator: null,
      close: async () => undefined,
      extensions: [],
      status: "disabled",
    };
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

  const commandClient = createCommandClient(redisUrl);
  let status: DocumentRedisSync["status"] = "unavailable";
  const updateStatus = (nextStatus: "ready" | "unavailable") => {
    if (status === nextStatus) return;
    status = nextStatus;
    eventLogger({
      event:
        nextStatus === "ready"
          ? "document_redis_sync_ready"
          : "document_redis_sync_unavailable",
      status: nextStatus,
    });
  };
  commandClient.on("ready", () => updateStatus("ready"));
  commandClient.on("end", () => updateStatus("unavailable"));
  commandClient.on("error", () => updateStatus("unavailable"));
  commandClient.on("reconnecting", () => updateStatus("unavailable"));

  try {
    await withTimeout(commandClient.connect(), connectTimeoutMs, "Redis connect");
    await withTimeout(commandClient.ping(), connectTimeoutMs, "Redis ping");
    updateStatus("ready");
  } catch (error) {
    commandClient.destroy();
    throw error;
  }

  const extension = createExtension({
    host: parsedUrl.hostname,
    identifier: instanceId,
    lockTimeout: leaseDurationMs,
    options,
    port: Number(parsedUrl.port || "6379"),
  });
  // Checkpoint locking is handled below with a renewable lease and finally-release.
  // The official extension remains responsible for Yjs sync and awareness fan-out.
  extension.onStoreDocument = async () => undefined;

  const checkpointCoordinator: DocumentCheckpointCoordinator = {
    async runExclusive<T>(key: string, work: () => Promise<T>) {
      const leaseKey = `pilo:documents:checkpoint:${key}`;
      const token = randomUUID();
      const deadline = performance.now() + maxLockWaitMs;
      while (true) {
        let acquired: string | null;
        try {
          acquired = await withTimeout(
            commandClient.set(leaseKey, token, {
              NX: true,
              PX: leaseDurationMs,
            }),
            commandTimeoutMs,
            "Redis checkpoint lock acquisition",
          );
        } catch (error) {
          updateStatus("unavailable");
          throw error;
        }
        if (acquired === "OK") break;
        if (performance.now() >= deadline) {
          throw new Error("Document checkpoint lock acquisition timed out");
        }
        await delay(lockRetryDelayMs);
      }

      let ownershipLost = false;
      let currentRenewal: Promise<void> | null = null;
      const renew = () => {
        if (currentRenewal) return currentRenewal;
        const renewal = (async () => {
          try {
            const renewed = await withTimeout(
              commandClient.eval(renewLeaseScript, {
                arguments: [token, String(leaseDurationMs)],
                keys: [leaseKey],
              }),
              commandTimeoutMs,
              "Redis checkpoint lock renewal",
            );
            if (Number(renewed) !== 1) ownershipLost = true;
          } catch {
            ownershipLost = true;
            updateStatus("unavailable");
          }
        })();
        currentRenewal = renewal;
        void renewal.finally(() => {
          if (currentRenewal === renewal) currentRenewal = null;
        });
        return currentRenewal;
      };
      const renewalTimer = setInterval(
        () => void renew(),
        Math.max(1, Math.floor(leaseDurationMs / 3)),
      );
      renewalTimer.unref();

      try {
        const result = await work();
        clearInterval(renewalTimer);
        const renewalAtCompletion = currentRenewal;
        if (renewalAtCompletion) await renewalAtCompletion;
        if (ownershipLost) {
          throw new Error("Document checkpoint lock ownership lost");
        }
        return result;
      } finally {
        clearInterval(renewalTimer);
        try {
          await withTimeout(
            commandClient.eval(releaseLeaseScript, {
              arguments: [token],
              keys: [leaseKey],
            }),
            commandTimeoutMs,
            "Redis checkpoint lock release",
          );
        } catch {
          updateStatus("unavailable");
        }
      }
    },
  };

  let closed = false;
  return {
    checkpointCoordinator,
    async close() {
      if (closed) return;
      closed = true;
      try {
        await withTimeout(
          extension.onDestroy(),
          commandTimeoutMs,
          "Redis extension close",
        );
      } catch {
        updateStatus("unavailable");
      }
      try {
        await withTimeout(commandClient.quit(), commandTimeoutMs, "Redis quit");
      } catch {
        commandClient.destroy();
      }
    },
    extensions: [extension],
    get status() {
      return status;
    },
  };
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number, label: string) {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
