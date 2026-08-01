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

const modeArgument = process.argv.find((argument) => argument.startsWith("--mode="));
const mode = modeArgument?.slice("--mode=".length) ?? "fixed";
assert.ok(["baseline", "fixed"].includes(mode), "mode must be baseline or fixed");

const SESSION_COUNT = 5;
const EDITS_PER_SESSION = 300;
const EDITS_PER_ROUND = SESSION_COUNT * EDITS_PER_SESSION;
const ROUND_COUNT = Number(process.env.E2E_ROUNDS ?? (mode === "fixed" ? "3" : "1"));
const ARRAY_NAME = "two-node-scaling-e2e-edits";
const TIMEOUT_MS = 30_000;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://pilo:pilo@127.0.0.1:5432/pilo";
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const APP_DIRECT_URL =
  process.env.E2E_APP_DIRECT_URL ?? "http://127.0.0.1:4000/api/v1";
const APP_DIRECT_ORIGIN = new URL(APP_DIRECT_URL).origin;
const APP_PROXY_ORIGIN =
  process.env.E2E_TWO_NODE_PROXY_ORIGIN ?? "http://127.0.0.1:4110";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const realtimeRoot = resolve(scriptDirectory, "..");
const nodeDefinitions = [
  { id: "realtime-a", httpUrl: "http://127.0.0.1:4101" },
  { id: "realtime-b", httpUrl: "http://127.0.0.1:4102" },
].map((node) => ({
  ...node,
  wsUrl: node.httpUrl.replace(/^http/, "ws") + "/sync/documents",
}));

const pool = new Pool({ connectionString: DATABASE_URL });
const metrics = [];
const documentEvents = [];
const realtimeProcesses = new Map();
let phase = "setup";

const proxy = createServer(async (request, response) => {
  try {
    const match = (request.url ?? "").match(/^\/(realtime-[ab])(\/api\/v1\/.*)$/);
    if (!match) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "unknown_proxy_route" }));
      return;
    }

    const [, instanceId, upstreamPath] = match;
    const body = await readRequestBody(request);
    const headers = { ...request.headers };
    delete headers.host;
    delete headers["content-length"];

    const upstream = await fetch(`${APP_DIRECT_ORIGIN}${upstreamPath}`, {
      body: body.length === 0 ? undefined : body,
      headers,
      method: request.method,
    });
    const responseBody = Buffer.from(await upstream.arrayBuffer());

    if (request.method === "PUT" && upstreamPath.endsWith("/snapshot")) {
      metrics.push({
        expectedVersion: readExpectedVersion(body),
        instanceId,
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
  for (const node of nodeDefinitions) startRealtimeServer(node);
  await Promise.all(
    nodeDefinitions.map((node) => waitForHttp(`${node.httpUrl}/health`, node.id)),
  );

  const principal = await seedPrincipal();
  const rounds = [];
  for (let round = 1; round <= ROUND_COUNT; round += 1) {
    phase = `round-${round}`;
    rounds.push(await runRound(principal, round));
  }

  let gracefulHandoff = null;
  if (mode === "fixed") {
    phase = "graceful-handoff";
    gracefulHandoff = await runGracefulHandoff(principal, rounds[0]);
  }

  const roundMetrics = metrics.filter((item) => item.phase.startsWith("round-"));
  const checkpoint409Count = roundMetrics.filter((item) => item.status === 409).length;
  const checkpointInstances = [...new Set(roundMetrics.map((item) => item.instanceId))].sort();
  const authenticatedInstances = [
    ...new Set(
      documentEvents
        .filter((event) => event.event === "document_room_authenticated")
        .map((event) => event.instanceId),
    ),
  ].sort();

  assert.deepEqual(
    authenticatedInstances,
    ["realtime-a", "realtime-b"],
    "five sessions must authenticate across both realtime instances",
  );

  if (mode === "baseline") {
    assert.deepEqual(
      checkpointInstances,
      ["realtime-a", "realtime-b"],
      "both uncoordinated instances must attempt a checkpoint",
    );
    assert.ok(checkpoint409Count >= 1, "baseline must capture a real checkpoint 409");
    assert.ok(
      documentEvents.some((event) => event.event === "document_checkpoint_conflict"),
      "baseline must retain the structured checkpoint conflict event",
    );
  } else {
    assert.equal(checkpoint409Count, 0, "Redis-coordinated rounds must have zero 409s");
  }

  const result = {
    checkpoint409Count,
    checkpointInstances,
    editsPerRound: EDITS_PER_ROUND,
    gracefulHandoff,
    instanceIds: nodeDefinitions.map((node) => node.id),
    mode,
    normalOperation: true,
    rounds,
    sessionCount: SESSION_COUNT,
    snapshotRequests: metrics,
    totalEdits: EDITS_PER_ROUND * ROUND_COUNT,
  };

  console.log(`TWO_NODE_E2E_RESULT_JSON=${JSON.stringify(result)}`);
}

async function runRound(principal, round) {
  const documentId = await createDocument(principal, `Two node ${mode} ${round}`);
  const roomName = roomNameFor(principal.workspaceId, documentId);
  const clients = await Promise.all(
    Array.from({ length: SESSION_COUNT }, (_, sessionIndex) => {
      const node = nodeDefinitions[sessionIndex < 3 ? 0 : 1];
      return connectClient(node.wsUrl, roomName, principal.token, node.id);
    }),
  );
  const expected = expectedRoundTokens(round);

  try {
    await Promise.all(
      clients.map(async ({ document }, sessionIndex) => {
        const edits = document.getArray(ARRAY_NAME);
        for (let editIndex = 0; editIndex < EDITS_PER_SESSION; editIndex += 1) {
          edits.push([editToken(round, sessionIndex, editIndex)]);
          if (editIndex % 25 === 24) await delay(0);
        }
      }),
    );

    if (mode === "fixed") {
      await waitUntil(
        () => clients.every(({ document }) => hasExactTokens(document, expected)),
        `round ${round} cross-node convergence`,
      );
    } else {
      await waitUntil(
        () =>
          hasNodeTokens(clients, "realtime-a", expected, [0, 1, 2]) &&
          hasNodeTokens(clients, "realtime-b", expected, [3, 4]),
        `round ${round} local-node convergence`,
      );
    }

    clients.forEach(({ provider }) => provider.destroy());
    const persisted = await waitForPersistedTokens(
      principal,
      documentId,
      expected,
      `round ${round} persisted union`,
    );
    const reconnected = await connectClient(
      nodeDefinitions[1].wsUrl,
      roomName,
      principal.token,
      nodeDefinitions[1].id,
    );
    try {
      assertExactTokens(reconnected.document, expected, `round ${round} reconnect`);
    } finally {
      reconnected.provider.destroy();
    }

    const phaseMetrics = metrics.filter((item) => item.phase === `round-${round}`);
    return {
      checkpoint409Count: phaseMetrics.filter((item) => item.status === 409).length,
      checkpointRequestCount: phaseMetrics.length,
      documentId,
      liveConvergence: mode === "fixed",
      persistedEditCount: persisted.tokens.length,
      persistedVersion: persisted.version,
      reconnectedEditCount: expected.size,
    };
  } finally {
    clients.forEach(({ provider }) => provider.destroy());
  }
}

async function runGracefulHandoff(principal, round) {
  const roomName = roomNameFor(principal.workspaceId, round.documentId);
  const clientA = await connectClient(
    nodeDefinitions[0].wsUrl,
    roomName,
    principal.token,
    nodeDefinitions[0].id,
  );
  const clientB = await connectClient(
    nodeDefinitions[1].wsUrl,
    roomName,
    principal.token,
    nodeDefinitions[1].id,
  );
  const marker = `graceful-handoff-${randomUUID()}`;

  try {
    clientA.document.getArray(ARRAY_NAME).push([marker]);
    await waitUntil(
      () => snapshotTokens(clientB.document).includes(marker),
      "marker replication before graceful termination",
    );
    await stopRealtimeServer("realtime-a");
    clientA.provider.destroy();

    const survivor = await connectClient(
      nodeDefinitions[1].wsUrl,
      roomName,
      principal.token,
      nodeDefinitions[1].id,
    );
    try {
      assert.ok(
        snapshotTokens(survivor.document).includes(marker),
        "survivor reconnect must retain the pre-termination marker",
      );
    } finally {
      survivor.provider.destroy();
    }
    clientB.provider.destroy();

    await waitUntil(async () => {
      const latest = await getDocument(principal, round.documentId);
      return snapshotTokens(decodeSnapshot(latest.snapshot.yjsState)).includes(marker);
    }, "graceful handoff marker persistence");

    return { markerPreserved: true, stoppedInstanceId: "realtime-a" };
  } finally {
    clientA.provider.destroy();
    clientB.provider.destroy();
  }
}

function hasNodeTokens(clients, instanceId, expected, sessionIndexes) {
  const nodeExpected = new Set(
    [...expected].filter((token) =>
      sessionIndexes.some((sessionIndex) => token.includes(`session-${sessionIndex}:`)),
    ),
  );
  return clients
    .filter((client) => client.instanceId === instanceId)
    .every(({ document }) => hasExactTokens(document, nodeExpected));
}

async function seedPrincipal() {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const token = `pilo-two-node-e2e-${randomUUID()}`;
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const database = await pool.connect();
  try {
    await database.query("BEGIN");
    await database.query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3)", [
      userId,
      "Two Node E2E",
      `two-node-${userId}@example.test`,
    ]);
    await database.query(
      "INSERT INTO workspaces (id, name, owner_user_id) VALUES ($1, $2, $3)",
      [workspaceId, "Two Node E2E", userId],
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
  return { token, workspaceId };
}

async function createDocument(principal, name) {
  const data = await apiRequest(
    principal,
    `/workspaces/${principal.workspaceId}/drive/documents`,
    { body: { name }, method: "POST" },
  );
  assert.equal(typeof data.document?.id, "string");
  return data.document.id;
}

async function connectClient(url, name, token, instanceId) {
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
    onAuthenticationFailed: ({ reason }) =>
      rejectSynced(new Error(`Hocuspocus authentication failed: ${reason}`)),
    onSynced: ({ state }) => {
      if (state) resolveSynced();
    },
    token,
    url,
  });

  try {
    await withTimeout(synced, TIMEOUT_MS, `sync ${name} through ${instanceId}`);
    return { document, instanceId, provider };
  } catch (error) {
    provider.destroy();
    throw error;
  }
}

async function waitForPersistedTokens(principal, documentId, expected, label) {
  let latest;
  await waitUntil(async () => {
    latest = await getDocument(principal, documentId);
    return hasExactTokens(decodeSnapshot(latest.snapshot.yjsState), expected);
  }, label);
  return {
    tokens: snapshotTokens(decodeSnapshot(latest.snapshot.yjsState)),
    version: latest.document.currentVersion,
  };
}

function getDocument(principal, documentId) {
  return apiRequest(
    principal,
    `/workspaces/${principal.workspaceId}/drive/documents/${documentId}`,
  );
}

async function apiRequest(principal, path, options = {}) {
  const response = await fetch(`${APP_DIRECT_URL}${path}`, {
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

function startRealtimeServer(node) {
  const state = { process: null, stderr: "", stdout: "" };
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: realtimeRoot,
    env: {
      ...process.env,
      APP_SERVER_URL: `${APP_PROXY_ORIGIN}/${node.id}/api/v1`,
      DATABASE_URL,
      DOCUMENT_REDIS_SYNC_ENABLED: mode === "fixed" ? "true" : "false",
      PORT: new URL(node.httpUrl).port,
      REALTIME_INSTANCE_ID: node.id,
      REDIS_URL,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  state.process = child;
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    state.stdout = keepTail(state.stdout + text);
    for (const line of text.split(/\r?\n/)) captureDocumentEvent(line);
  });
  child.stderr.on("data", (chunk) => {
    state.stderr = keepTail(state.stderr + chunk.toString());
  });
  realtimeProcesses.set(node.id, state);
}

function captureDocumentEvent(line) {
  try {
    const event = JSON.parse(line);
    if (typeof event.event === "string" && event.event.startsWith("document_")) {
      documentEvents.push(event);
    }
  } catch {
    // Non-JSON lifecycle logs are retained in the process output tail only.
  }
}

async function stopRealtimeServer(instanceId) {
  const state = realtimeProcesses.get(instanceId);
  if (!state || state.process.exitCode !== null) return;
  state.process.kill("SIGTERM");
  await withTimeout(
    new Promise((resolvePromise) => state.process.once("exit", resolvePromise)),
    10_000,
    `${instanceId} graceful shutdown`,
  );
}

async function waitForHttp(url, label) {
  await waitUntil(async () => {
    try {
      const response = await fetch(url);
      return response.ok;
    } catch {
      const state = realtimeProcesses.get(label);
      if (state?.process.exitCode !== null && state?.process.exitCode !== undefined) {
        throw new Error(
          `${label} exited early (${state.process.exitCode})\n${state.stdout}\n${state.stderr}`,
        );
      }
      return false;
    }
  }, `${label} readiness`);
}

function expectedRoundTokens(round) {
  const expected = new Set();
  for (let sessionIndex = 0; sessionIndex < SESSION_COUNT; sessionIndex += 1) {
    for (let editIndex = 0; editIndex < EDITS_PER_SESSION; editIndex += 1) {
      expected.add(editToken(round, sessionIndex, editIndex));
    }
  }
  assert.equal(expected.size, EDITS_PER_ROUND);
  return expected;
}

function editToken(round, sessionIndex, editIndex) {
  return `round-${round}:session-${sessionIndex}:edit-${editIndex}`;
}

function decodeSnapshot(base64) {
  const document = new Y.Doc();
  Y.applyUpdate(document, Buffer.from(base64, "base64"));
  return document;
}

function snapshotTokens(document) {
  return document.getArray(ARRAY_NAME).toArray();
}

function hasExactTokens(document, expected) {
  const tokens = snapshotTokens(document);
  const unique = new Set(tokens);
  return (
    tokens.length === expected.size &&
    unique.size === expected.size &&
    [...expected].every((token) => unique.has(token))
  );
}

function assertExactTokens(document, expected, label) {
  const tokens = snapshotTokens(document);
  const unique = new Set(tokens);
  assert.equal(tokens.length, expected.size, `${label}: edit count`);
  assert.equal(unique.size, expected.size, `${label}: duplicate count`);
  assert.deepEqual([...unique].sort(), [...expected].sort(), `${label}: token set`);
}

function roomNameFor(workspaceId, documentId) {
  return `workspace:${workspaceId}:document:${documentId}:yjs`;
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
  return value.length > 30_000 ? value.slice(-30_000) : value;
}

try {
  await main();
} catch (error) {
  console.error(error);
  for (const [instanceId, state] of realtimeProcesses) {
    if (state.stdout) console.error(`--- ${instanceId} stdout ---\n${state.stdout}`);
    if (state.stderr) console.error(`--- ${instanceId} stderr ---\n${state.stderr}`);
  }
  process.exitCode = 1;
} finally {
  await Promise.all(
    [...realtimeProcesses.keys()].map((instanceId) =>
      stopRealtimeServer(instanceId).catch(() => undefined),
    ),
  );
  await closeServer(proxy).catch(() => undefined);
  await pool.end();
}
