import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HocuspocusProvider } from "@hocuspocus/provider";
import pg from "pg";
import WebSocket from "ws";
import * as Y from "yjs";

const { Pool } = pg;

const SESSION_COUNT = 5;
const EDITS_PER_SESSION = 300;
const NORMAL_ROUNDS = 3;
const EXPECTED_EDITS_PER_ROUND = SESSION_COUNT * EDITS_PER_SESSION;
const ARRAY_NAME = "single-writer-e2e-edits";
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://pilo:pilo@127.0.0.1:5432/pilo";
const APP_DIRECT_URL =
  process.env.E2E_APP_DIRECT_URL ?? "http://127.0.0.1:4000/api/v1";
const APP_DIRECT_ORIGIN = new URL(APP_DIRECT_URL).origin;
const APP_PROXY_ORIGIN =
  process.env.E2E_APP_PROXY_ORIGIN ?? "http://127.0.0.1:4010";
const REALTIME_HTTP_URL =
  process.env.E2E_REALTIME_HTTP_URL ?? "http://127.0.0.1:4001";
const REALTIME_WS_URL = REALTIME_HTTP_URL.replace(/^http/, "ws") + "/sync/documents";
const TIMEOUT_MS = 20_000;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const realtimeRoot = resolve(scriptDirectory, "..");

const pool = new Pool({ connectionString: DATABASE_URL });
const metrics = [];
let phase = "setup";
let realtimeProcess;
let realtimeStdout = "";
let realtimeStderr = "";

const proxy = createServer(async (request, response) => {
  try {
    const body = await readRequestBody(request);
    const headers = { ...request.headers };
    delete headers.host;
    delete headers["content-length"];

    const upstream = await fetch(`${APP_DIRECT_ORIGIN}${request.url ?? "/"}`, {
      body: body.length === 0 ? undefined : body,
      headers,
      method: request.method,
    });
    const responseBody = Buffer.from(await upstream.arrayBuffer());

    if (
      request.method === "PUT" &&
      (request.url ?? "").endsWith("/snapshot")
    ) {
      metrics.push({
        expectedVersion: readExpectedVersion(body),
        phase,
        status: upstream.status,
      });
    }

    response.writeHead(upstream.status, Object.fromEntries(upstream.headers));
    response.end(responseBody);
  } catch (error) {
    response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: String(error) }));
  }
});

async function main() {
  await waitForHttp(APP_DIRECT_URL, "App Server");
  await listen(proxy, Number(new URL(APP_PROXY_ORIGIN).port || "80"));
  realtimeProcess = startRealtimeServer();
  await waitForHttp(`${REALTIME_HTTP_URL}/health`, "Realtime Server");

  const principal = await seedPrincipal();
  const normalResults = [];

  for (let round = 1; round <= NORMAL_ROUNDS; round += 1) {
    phase = `normal-${round}`;
    normalResults.push(await runNormalRound(principal, round));
  }

  phase = "forced-conflict";
  const forcedConflict = await runForcedConflictRound(principal);

  const normalMetrics = metrics.filter((item) => item.phase.startsWith("normal-"));
  const conflictMetrics = metrics.filter((item) => item.phase === "forced-conflict");
  assert.equal(
    normalMetrics.filter((item) => item.status === 409).length,
    0,
    "normal 5-session runs must not produce checkpoint 409 responses",
  );
  assert.deepEqual(
    conflictMetrics.map((item) => item.status),
    [409, 200],
    "an injected stale checkpoint must be merged and retried exactly once",
  );

  const result = {
    claimScope: "server-received Yjs edits",
    forcedConflict,
    normal: {
      checkpoint409Count: 0,
      editsPerRound: EXPECTED_EDITS_PER_ROUND,
      reconnectPreservationRate: 1,
      rounds: normalResults,
      sessionCount: SESSION_COUNT,
      totalEdits: EXPECTED_EDITS_PER_ROUND * NORMAL_ROUNDS,
    },
    snapshotRequests: metrics,
  };

  console.log(`E2E_RESULT_JSON=${JSON.stringify(result)}`);
}

async function runNormalRound(principal, round) {
  const documentId = await createDocument(principal, `Single writer E2E ${round}`);
  const roomName = roomNameFor(principal.workspaceId, documentId);
  const clients = await Promise.all(
    Array.from({ length: SESSION_COUNT }, () => connectClient(roomName, principal.token)),
  );
  const expected = expectedRoundTokens(round);
  const allButFinal = new Set(expected);
  const finalToken = editToken(round, SESSION_COUNT - 1, EDITS_PER_SESSION - 1);
  allButFinal.delete(finalToken);

  try {
    await Promise.all(
      clients.map(async ({ document }, sessionIndex) => {
        const editCount =
          sessionIndex === SESSION_COUNT - 1
            ? EDITS_PER_SESSION - 1
            : EDITS_PER_SESSION;
        const edits = document.getArray(ARRAY_NAME);
        for (let editIndex = 0; editIndex < editCount; editIndex += 1) {
          edits.push([editToken(round, sessionIndex, editIndex)]);
          if (editIndex % 25 === 24) await delay(0);
        }
      }),
    );

    await waitUntil(
      () => clients.every(({ document }) => hasExactTokens(document, allButFinal)),
      `round ${round} convergence before the final edit`,
    );

    const finalEditAt = performance.now();
    clients.at(-1).document.getArray(ARRAY_NAME).push([finalToken]);
    await waitUntil(
      () => clients.every(({ document }) => hasExactTokens(document, expected)),
      `round ${round} convergence after 1,500 edits`,
    );
    clients.forEach(({ provider }) => provider.destroy());
    const disconnectAfterFinalEditMs = performance.now() - finalEditAt;
    assert.ok(
      disconnectAfterFinalEditMs < 1_000,
      `round ${round} must disconnect inside the 1s checkpoint debounce window`,
    );

    const persisted = await waitForPersistedTokens(
      principal,
      documentId,
      expected,
      `round ${round} disconnect flush`,
    );
    const reconnected = await connectClient(roomName, principal.token);
    try {
      assertExactTokens(reconnected.document, expected, `round ${round} reconnect`);
    } finally {
      reconnected.provider.destroy();
    }

    const phaseMetrics = metrics.filter((item) => item.phase === `normal-${round}`);
    assert.ok(phaseMetrics.length >= 1, `round ${round} must persist a checkpoint`);
    assert.equal(
      phaseMetrics.filter((item) => item.status === 409).length,
      0,
      `round ${round} must not produce a checkpoint 409`,
    );

    return {
      checkpoint409Count: 0,
      checkpointRequestCount: phaseMetrics.length,
      disconnectAfterFinalEditMs: Math.round(disconnectAfterFinalEditMs),
      documentId,
      persistedEditCount: persisted.tokens.length,
      persistedVersion: persisted.version,
      reconnectedEditCount: expected.size,
    };
  } finally {
    clients.forEach(({ provider }) => provider.destroy());
  }
}

async function runForcedConflictRound(principal) {
  const documentId = await createDocument(principal, "Single writer forced conflict");
  const roomName = roomNameFor(principal.workspaceId, documentId);
  const client = await connectClient(roomName, principal.token);
  const remoteToken = "forced-remote-version-1";
  const localToken = "forced-local-room-update";

  try {
    const remoteDocument = new Y.Doc();
    remoteDocument.getArray(ARRAY_NAME).push([remoteToken]);
    await apiRequest(
      APP_DIRECT_URL,
      principal,
      `/workspaces/${principal.workspaceId}/drive/documents/${documentId}/snapshot`,
      {
        body: {
          contentJson: { type: "doc", content: [] },
          expectedVersion: 0,
          yjsState: Buffer.from(Y.encodeStateAsUpdate(remoteDocument)).toString("base64"),
        },
        method: "PUT",
      },
    );

    client.document.getArray(ARRAY_NAME).push([localToken]);
    await waitUntil(
      () => !client.provider.hasUnsyncedChanges,
      "forced conflict local update acknowledgement",
    );
    client.provider.destroy();

    const expected = new Set([remoteToken, localToken]);
    const persisted = await waitForPersistedTokens(
      principal,
      documentId,
      expected,
      "forced conflict merge and retry",
    );
    assert.equal(persisted.version, 2, "forced conflict retry must persist version 2");

    const reconnected = await connectClient(roomName, principal.token);
    try {
      assertExactTokens(reconnected.document, expected, "forced conflict reconnect");
    } finally {
      reconnected.provider.destroy();
    }

    return {
      conflict409Count: 1,
      documentId,
      mergedRemoteAndLocal: true,
      persistedVersion: persisted.version,
      retryCount: 1,
    };
  } finally {
    client.provider.destroy();
  }
}

async function seedPrincipal() {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const token = `pilo-e2e-${randomUUID()}`;
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const database = await pool.connect();
  try {
    await database.query("BEGIN");
    await database.query(
      "INSERT INTO users (id, name, email) VALUES ($1, $2, $3)",
      [userId, "Single Writer E2E", `single-writer-${userId}@example.test`],
    );
    await database.query(
      "INSERT INTO workspaces (id, name, owner_user_id) VALUES ($1, $2, $3)",
      [workspaceId, "Single Writer E2E", userId],
    );
    await database.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
      [workspaceId, userId],
    );
    await database.query(
      "INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 day')",
      [userId, tokenHash],
    );
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  } finally {
    database.release();
  }
  return { token, userId, workspaceId };
}

async function createDocument(principal, name) {
  const data = await apiRequest(
    APP_DIRECT_URL,
    principal,
    `/workspaces/${principal.workspaceId}/drive/documents`,
    { body: { name }, method: "POST" },
  );
  assert.equal(typeof data.document?.id, "string", "create document must return an id");
  return data.document.id;
}

async function connectClient(name, token) {
  const document = new Y.Doc();
  let resolveSynced;
  let rejectSynced;
  const synced = new Promise((resolvePromise, rejectPromise) => {
    resolveSynced = resolvePromise;
    rejectSynced = rejectPromise;
  });
  const provider = new HocuspocusProvider({
    WebSocketPolyfill: WebSocket,
    document,
    name,
    onAuthenticationFailed: ({ reason }) => {
      rejectSynced(new Error(`Hocuspocus authentication failed: ${reason}`));
    },
    onSynced: ({ state }) => {
      if (state) resolveSynced();
    },
    token,
    url: REALTIME_WS_URL,
  });

  try {
    await withTimeout(synced, TIMEOUT_MS, `sync ${name}`);
    return { document, provider };
  } catch (error) {
    provider.destroy();
    throw error;
  }
}

async function waitForPersistedTokens(principal, documentId, expected, label) {
  let latest;
  await waitUntil(async () => {
    latest = await apiRequest(
      APP_DIRECT_URL,
      principal,
      `/workspaces/${principal.workspaceId}/drive/documents/${documentId}`,
    );
    const document = decodeSnapshot(latest.snapshot.yjsState);
    return hasExactTokens(document, expected);
  }, label);
  return {
    tokens: snapshotTokens(decodeSnapshot(latest.snapshot.yjsState)),
    version: latest.document.currentVersion,
  };
}

function decodeSnapshot(base64) {
  const document = new Y.Doc();
  Y.applyUpdate(document, Buffer.from(base64, "base64"));
  return document;
}

function expectedRoundTokens(round) {
  const expected = new Set();
  for (let sessionIndex = 0; sessionIndex < SESSION_COUNT; sessionIndex += 1) {
    for (let editIndex = 0; editIndex < EDITS_PER_SESSION; editIndex += 1) {
      expected.add(editToken(round, sessionIndex, editIndex));
    }
  }
  assert.equal(expected.size, EXPECTED_EDITS_PER_ROUND);
  return expected;
}

function editToken(round, sessionIndex, editIndex) {
  return `round-${round}:session-${sessionIndex}:edit-${editIndex}`;
}

function snapshotTokens(document) {
  return document.getArray(ARRAY_NAME).toArray();
}

function hasExactTokens(document, expected) {
  const tokens = snapshotTokens(document);
  if (tokens.length !== expected.size) return false;
  const unique = new Set(tokens);
  return unique.size === expected.size && [...expected].every((token) => unique.has(token));
}

function assertExactTokens(document, expected, label) {
  const tokens = snapshotTokens(document);
  const unique = new Set(tokens);
  assert.equal(tokens.length, expected.size, `${label}: persisted edit count`);
  assert.equal(unique.size, expected.size, `${label}: duplicate edit count`);
  assert.deepEqual(
    [...unique].sort(),
    [...expected].sort(),
    `${label}: no edit may be missing or unexpected`,
  );
}

function roomNameFor(workspaceId, documentId) {
  return `workspace:${workspaceId}:document:${documentId}:yjs`;
}

async function apiRequest(baseUrl, principal, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${principal.token}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    method: options.method ?? "GET",
  });
  const payload = await response.json();
  if (!response.ok || payload?.success !== true) {
    throw new Error(`API ${response.status} ${path}: ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

function startRealtimeServer() {
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: realtimeRoot,
    env: {
      ...process.env,
      APP_SERVER_URL: APP_PROXY_ORIGIN,
      DATABASE_URL,
      PORT: new URL(REALTIME_HTTP_URL).port || "4001",
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => {
    realtimeStdout = keepTail(realtimeStdout + chunk.toString());
  });
  child.stderr.on("data", (chunk) => {
    realtimeStderr = keepTail(realtimeStderr + chunk.toString());
  });
  return child;
}

async function waitForHttp(url, label) {
  await waitUntil(async () => {
    try {
      await fetch(url);
      return true;
    } catch {
      if (realtimeProcess?.exitCode !== null && realtimeProcess?.exitCode !== undefined) {
        throw new Error(
          `${label} exited early (${realtimeProcess.exitCode})\n${realtimeStdout}\n${realtimeStderr}`,
        );
      }
      return false;
    }
  }, `${label} readiness`);
}

async function waitUntil(predicate, label, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await delay(25);
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError}` : ""}`);
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    delay(timeoutMs).then(() => {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }),
  ]);
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function listen(server, port) {
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, "127.0.0.1", resolvePromise);
  });
}

function closeServer(server) {
  return new Promise((resolvePromise) => server.close(() => resolvePromise()));
}

function readRequestBody(request) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolvePromise(Buffer.concat(chunks)));
    request.on("error", rejectPromise);
  });
}

function readExpectedVersion(body) {
  try {
    return JSON.parse(body.toString("utf8")).expectedVersion;
  } catch {
    return null;
  }
}

function keepTail(value) {
  return value.length > 20_000 ? value.slice(-20_000) : value;
}

try {
  await main();
} catch (error) {
  console.error(error);
  if (realtimeStdout) console.error("--- realtime stdout ---\n" + realtimeStdout);
  if (realtimeStderr) console.error("--- realtime stderr ---\n" + realtimeStderr);
  process.exitCode = 1;
} finally {
  if (realtimeProcess && realtimeProcess.exitCode === null) {
    realtimeProcess.kill("SIGTERM");
    await Promise.race([new Promise((resolvePromise) => realtimeProcess.once("exit", resolvePromise)), delay(5_000)]);
  }
  await closeServer(proxy).catch(() => undefined);
  await pool.end();
}
