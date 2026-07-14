import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("reflect-metadata");
const {
  validateSqlErdSourcePublishRequest,
  validateSqlErdSourceSnapshotBatchQuery
} = require(
  "../../dist/modules/sql-erd/sql-erd-source-snapshot.validation.js"
);

const migrationDirectory = new URL("../../../../db/migrations/", import.meta.url);
const migrationFilenames = await readdir(migrationDirectory);

assert.ok(
  migrationFilenames.includes("062_create_sql_erd_source_snapshots_and_locks.sql"),
  "SQLtoERD source snapshot migration must exist"
);

const migration = await readFile(
  new URL(
    "../../../../db/migrations/062_create_sql_erd_source_snapshots_and_locks.sql",
    import.meta.url
  ),
  "utf8"
);

assert.match(migration, /CREATE TABLE public\.sql_erd_session_source_snapshots/);
assert.match(migration, /UNIQUE \(workspace_id, session_id, id\)/);
assert.match(migration, /CREATE TABLE public\.sql_erd_session_source_locks/);
assert.match(migration, /FOREIGN KEY \(workspace_id, session_id, source_snapshot_id\)/);
assert.match(migration, /ON DELETE RESTRICT/);
assert.match(migration, /operation_type IN \('layout_patch', 'source_snapshot'\)/);
assert.match(migration, /source_snapshot_id IS NULL/);
assert.match(migration, /source_snapshot_id IS NOT NULL/);
assert.match(migration, /prevent_sql_erd_source_snapshot_mutation/);
assert.match(migration, /octet_length\(source_text\)/);
assert.match(migration, /3 \* 1024 \* 1024/);

const sessionId = "11111111-1111-4111-8111-111111111111";
const sourcePublishRequest = {
  baseRevision: 1,
  clientOperationId: "source-publish-1",
  dialect: "postgresql",
  leaseId: "22222222-2222-4222-8222-222222222222",
  modelJson: { version: 1, schema: { relations: [], tables: [] } },
  sourceFormat: "sql",
  sourceText: "CREATE TABLE users (id bigint primary key);"
};

assert.deepEqual(validateSqlErdSourcePublishRequest(sourcePublishRequest), sourcePublishRequest);
assert.deepEqual(
  validateSqlErdSourceSnapshotBatchQuery({
    ids: `${sessionId},${sessionId},22222222-2222-4222-8222-222222222222`
  }),
  { ids: [sessionId, "22222222-2222-4222-8222-222222222222"] }
);

assert.throws(
  () => validateSqlErdSourcePublishRequest({ ...sourcePublishRequest, layoutJson: {} }),
  (error) => error.getStatus() === 400 && /unknown field/.test(error.getResponse().error.message)
);
assert.throws(
  () =>
    validateSqlErdSourceSnapshotBatchQuery({
      ids: [sessionId, "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"].join(",")
    }),
  (error) => error.getStatus() === 400 && /between 1 and 3/.test(error.getResponse().error.message)
);
assert.throws(
  () => validateSqlErdSourceSnapshotBatchQuery({ ids: "x".repeat(2049) }),
  (error) => error.getStatus() === 400 && /too long/.test(error.getResponse().error.message)
);
