import assert from "node:assert/strict";
import test from "node:test";

import { loadRealtimeServerConfig } from "../../dist/config/realtime-config.js";

test("disables document Redis sync when the flag is absent", () => {
  const config = loadRealtimeServerConfig({});

  assert.equal(config.documentRedisSyncEnabled, false);
});

test("enables document Redis sync only for the exact true flag", () => {
  const enabled = loadRealtimeServerConfig({
    DOCUMENT_REDIS_SYNC_ENABLED: "true",
    REDIS_URL: "redis://localhost:6379",
  });
  const disabled = loadRealtimeServerConfig({
    DOCUMENT_REDIS_SYNC_ENABLED: "TRUE",
    REDIS_URL: "redis://localhost:6379",
  });

  assert.equal(enabled.documentRedisSyncEnabled, true);
  assert.equal(disabled.documentRedisSyncEnabled, false);
});

test("rejects enabled document Redis sync without REDIS_URL", () => {
  assert.throws(
    () => loadRealtimeServerConfig({ DOCUMENT_REDIS_SYNC_ENABLED: "true" }),
    /DOCUMENT_REDIS_SYNC_ENABLED requires REDIS_URL/,
  );
});

test("rejects enabled document Redis sync with a non-Redis URL", () => {
  assert.throws(
    () =>
      loadRealtimeServerConfig({
        DOCUMENT_REDIS_SYNC_ENABLED: "true",
        REDIS_URL: "https://redis.example.test",
      }),
    /REDIS_URL must use redis: or rediss:/,
  );
});

test("uses the trimmed REALTIME_INSTANCE_ID when supplied", () => {
  const config = loadRealtimeServerConfig({
    REALTIME_INSTANCE_ID: "  realtime-a  ",
  });

  assert.equal(config.realtimeInstanceId, "realtime-a");
});

test("uses a non-empty hostname when REALTIME_INSTANCE_ID is absent", () => {
  const config = loadRealtimeServerConfig({});

  assert.equal(typeof config.realtimeInstanceId, "string");
  assert.ok(config.realtimeInstanceId.length > 0);
});
