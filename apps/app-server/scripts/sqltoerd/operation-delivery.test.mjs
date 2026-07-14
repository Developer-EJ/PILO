import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const migrationFilenames = await readdir(
  new URL("../../../../db/migrations/", import.meta.url)
);

assert.ok(
  migrationFilenames.includes("059_create_sql_erd_operation_delivery.sql"),
  "SQLtoERD operation delivery migration must exist"
);

const migration = await readFile(
  new URL(
    "../../../../db/migrations/059_create_sql_erd_operation_delivery.sql",
    import.meta.url
  ),
  "utf8"
);

assert.match(migration, /ADD COLUMN write_protocol TEXT NOT NULL DEFAULT 'snapshot'/);
assert.match(migration, /write_protocol IN \('snapshot', 'operations_v1'\)/);
assert.match(migration, /ADD COLUMN latest_op_seq BIGINT NOT NULL DEFAULT 0/);
assert.match(migration, /CREATE TABLE public\.sql_erd_session_operations/);
assert.match(migration, /UNIQUE \(session_id, op_seq\)/);
assert.match(
  migration,
  /UNIQUE \(session_id, actor_user_id, client_operation_id\)/
);
assert.match(migration, /CREATE TABLE public\.sql_erd_session_operation_outbox/);
assert.match(migration, /status IN \('pending', 'publishing', 'delivered'\)/);
assert.match(
  migration,
  /idx_sql_erd_operation_outbox_publishing_claimed_at/
);
assert.match(
  migration,
  /ALTER TABLE public\.sql_erd_session_operations ENABLE ROW LEVEL SECURITY/
);
assert.match(
  migration,
  /ALTER TABLE public\.sql_erd_session_operation_outbox ENABLE ROW LEVEL SECURITY/
);
