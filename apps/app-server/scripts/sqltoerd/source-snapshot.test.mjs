import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

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
