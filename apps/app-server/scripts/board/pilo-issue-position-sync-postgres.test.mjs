import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.BOARD_POSTGRES_TEST_URL;

if (!connectionString) {
  throw new Error("BOARD_POSTGRES_TEST_URL is required for this PostgreSQL test");
}

const databaseUrl = new URL(connectionString);
assert.ok(
  new Set(["127.0.0.1", "[::1]", "localhost"]).has(databaseUrl.hostname),
  "Board PostgreSQL tests may only use a loopback database"
);
assert.equal(
  databaseUrl.pathname,
  "/pilo_board_issue_operation_test",
  "Board PostgreSQL tests require the disposable pilo_board_issue_operation_test database"
);

const migration = await readFile(
  new URL(
    "../../../../db/migrations/106_fix_pilo_issue_hydration_position_offset.sql",
    import.meta.url
  ),
  "utf8"
);
const client = new pg.Client({ connectionString });
let connected = false;

try {
  await client.connect();
  connected = true;
  assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name, "pilo_board_issue_operation_test");
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await client.query(`
    CREATE TABLE boards (id BIGINT PRIMARY KEY, workspace_id UUID NOT NULL, repository_id BIGINT NOT NULL, project_v2_id UUID NOT NULL);
    CREATE TABLE board_columns (id BIGINT PRIMARY KEY, board_id BIGINT NOT NULL, normalized_name TEXT NOT NULL, status_option_id UUID, status_option_github_id TEXT);
    CREATE TABLE github_issues (id BIGINT PRIMARY KEY, workspace_id UUID NOT NULL, repository_id BIGINT NOT NULL, github_node_id TEXT, issue_number BIGINT NOT NULL, title TEXT NOT NULL DEFAULT '', body TEXT, html_url TEXT, state TEXT, labels JSONB, assignees JSONB, milestone JSONB, github_updated_at TIMESTAMPTZ, raw JSONB);
    CREATE TABLE github_project_v2_items (id UUID PRIMARY KEY, project_v2_id UUID NOT NULL, workspace_id UUID NOT NULL, issue_id BIGINT NOT NULL, content_type TEXT NOT NULL, is_archived BOOLEAN NOT NULL DEFAULT false, status_option_id UUID, status_option_github_id TEXT, status_normalized_name TEXT, github_project_item_node_id TEXT, position DOUBLE PRECISION);
    CREATE TABLE pilo_issues (id BIGSERIAL PRIMARY KEY, board_id BIGINT NOT NULL, column_id BIGINT NOT NULL, workspace_id UUID NOT NULL, repository_id BIGINT NOT NULL, github_issue_id BIGINT NOT NULL, project_item_id UUID NOT NULL, github_issue_node_id TEXT, github_project_item_node_id TEXT, github_issue_number BIGINT NOT NULL, issue_number TEXT NOT NULL, title TEXT NOT NULL, body TEXT, html_url TEXT, state TEXT, labels JSONB, assignees JSONB, milestone JSONB, position BIGINT NOT NULL, github_updated_at TIMESTAMPTZ, last_synced_at TIMESTAMPTZ, raw JSONB, updated_at TIMESTAMPTZ, CONSTRAINT uq_pilo_issues_column_position UNIQUE (column_id, position), CONSTRAINT uq_pilo_issues_board_issue UNIQUE (board_id, issue_number));
  `);
  await client.query(migration);

  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const projectId = "22222222-2222-4222-8222-222222222222";
  await client.query("INSERT INTO boards VALUES (1, $1, 1, $2)", [workspaceId, projectId]);
  await client.query("INSERT INTO board_columns (id, board_id, normalized_name) VALUES (1, 1, 'done'), (2, 1, 'unmapped')");
  await client.query(
    `
    INSERT INTO github_issues (id, workspace_id, repository_id, issue_number, title)
    SELECT value, $1, 1, value, 'Issue ' || value FROM generate_series(1, 523) AS value
    `,
    [workspaceId]
  );
  await client.query(
    `
    INSERT INTO github_project_v2_items (id, project_v2_id, workspace_id, issue_id, content_type, status_normalized_name, github_project_item_node_id, position)
    SELECT ('00000000-0000-0000-0000-' || lpad(value::text, 12, '0'))::uuid, $2, $1, value, 'ISSUE', 'done', 'item-' || value, value FROM generate_series(1, 523) AS value
    `,
    [workspaceId, projectId]
  );
  await client.query(`
    INSERT INTO pilo_issues (board_id, column_id, workspace_id, repository_id, github_issue_id, project_item_id, github_issue_number, issue_number, title, position)
    SELECT 1, 1, $1, 1, value, ('00000000-0000-0000-0000-' || lpad(value::text, 12, '0'))::uuid, value, '#' || value, 'Old ' || value, value - 1 FROM generate_series(1, 76) AS value;
  `, [workspaceId]);
  const original = await client.query("SELECT github_issue_id, id FROM pilo_issues WHERE board_id = 1 ORDER BY github_issue_id");
  await client.query("SELECT refresh_pilo_issues_from_github(1)");
  const result = await client.query("SELECT count(*)::int AS count, min(position)::int AS min, max(position)::int AS max, count(DISTINCT position)::int AS distinct_count FROM pilo_issues WHERE board_id = 1 AND column_id = 1");
  assert.deepEqual(result.rows[0], { count: 523, min: 0, max: 522, distinct_count: 523 });
  const preserved = await client.query("SELECT github_issue_id, id FROM pilo_issues WHERE github_issue_id <= 76 ORDER BY github_issue_id");
  assert.deepEqual(preserved.rows, original.rows, "Existing cache identities must be preserved");
  await client.query("SELECT refresh_pilo_issues_from_github(1)");
  assert.equal((await client.query("SELECT count(*)::int AS count FROM pilo_issues WHERE board_id = 1")).rows[0].count, 523);
  console.log("PILO issue position sync PostgreSQL regression test passed");
} finally {
  if (connected) {
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  }
  await client.end();
}
