import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { URL } from "node:url";

const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  {
    encoding: "utf8",
  },
);
const agentRegistryMigration = readFileSync(
  new URL(
    "../prisma/migrations/202606291141_sein_agent_create_registry/migration.sql",
    import.meta.url,
  ),
  {
    encoding: "utf8",
  },
);
const reviewGraphMigration = readFileSync(
  new URL(
    "../prisma/migrations/202606301420_review_graph_persistence/migration.sql",
    import.meta.url,
  ),
  {
    encoding: "utf8",
  },
);
const changedFilesMigration = readFileSync(
  new URL(
    "../prisma/migrations/202606301500_review_changed_files_persistence/migration.sql",
    import.meta.url,
  ),
  {
    encoding: "utf8",
  },
);
const reviewRoomArtifactsMigration = readFileSync(
  new URL(
    "../prisma/migrations/202606301530_review_room_artifacts_persistence/migration.sql",
    import.meta.url,
  ),
  {
    encoding: "utf8",
  },
);
const reviewPrSummarySnapshotMigration = readFileSync(
  new URL(
    "../prisma/migrations/202606301600_review_pr_summary_snapshot/migration.sql",
    import.meta.url,
  ),
  {
    encoding: "utf8",
  },
);
const logicalSchema = readFileSync(
  new URL("../../../docs/db/pilo_erd_schema.sql", import.meta.url),
  {
    encoding: "utf8",
  },
);

describe("Prisma workspace member task relations", () => {
  it("uses workspace-scoped member identities for task member foreign keys", () => {
    assert.match(schema, /@@unique\(\[workspaceId, id\]\)/);
    assert.match(
      schema,
      /assigneeMember\s+WorkspaceMember\?\s+@relation\("TaskAssigneeMember", fields: \[workspaceId, assigneeMemberId\], references: \[workspaceId, id\]/,
    );
    assert.match(
      schema,
      /createdByMember\s+WorkspaceMember\?\s+@relation\("TaskCreatedByMember", fields: \[workspaceId, createdByMemberId\], references: \[workspaceId, id\]/,
    );
  });

  it("uses workspace-scoped member identity for GitHub connection creators", () => {
    assert.match(
      schema,
      /connectedByMember\s+WorkspaceMember\?\s+@relation\("GithubConnectionConnectedByMember", fields: \[workspaceId, connectedByMemberId\], references: \[workspaceId, id\]/,
    );
  });

  it("enforces one active GitHub installation across workspaces in the logical schema", () => {
    assert.match(
      logicalSchema,
      /CREATE UNIQUE INDEX IF NOT EXISTS github_connections_active_installation_id_unique\s+ON github_connections \(installation_id\)\s+WHERE installation_id IS NOT NULL AND revoked_at IS NULL;/,
    );
  });

  it("maps Agent Runtime registry models to the owner tables", () => {
    assert.match(
      schema,
      /model Agent\s+{[\s\S]*updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt\s+@map\("updated_at"\)[\s\S]*@@map\("agents"\)/,
    );
    assert.match(
      schema,
      /model AgentWorkflow\s+{[\s\S]*agentId\s+String\s+@map\("agent_id"\)[\s\S]*type\s+String\s+@db\.VarChar\(120\)[\s\S]*version\s+String\s+@default\("v1"\)/,
    );
    assert.match(
      schema,
      /model AgentWorkflow\s+{[\s\S]*inputSchema\s+Json\s+@default\("\{\}"\)\s+@map\("input_schema"\)\s+@db\.JsonB[\s\S]*outputSchema\s+Json\s+@default\("\{\}"\)\s+@map\("output_schema"\)\s+@db\.JsonB[\s\S]*enabled\s+Boolean\s+@default\(true\)/,
    );
    assert.match(
      schema,
      /model AgentWorkflow\s+{[\s\S]*updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt\s+@map\("updated_at"\)/,
    );
    assert.match(
      schema,
      /@@unique\(\[type, version\]\)[\s\S]*@@map\("agent_workflows"\)/,
    );
  });

  it("keeps the Agent Runtime migration aligned with workflow ownership rules", () => {
    assert.match(
      agentRegistryMigration,
      /CREATE TABLE IF NOT EXISTS agent_workflows[\s\S]*agent_id UUID NOT NULL/,
    );
    assert.match(
      agentRegistryMigration,
      /CONSTRAINT agent_workflows_type_version_key UNIQUE \(type, version\)/,
    );
    assert.doesNotMatch(
      agentRegistryMigration,
      /UNIQUE \(agent_id, type, version\)/,
    );
  });

  it("maps Review graph persistence to runtime graph identifiers", () => {
    assert.match(
      schema,
      /model ReviewGraph\s+{[\s\S]*analysisId\s+String\s+@unique\s+@map\("analysis_id"\)\s+@db\.Uuid[\s\S]*intentSummary\s+String\s+@map\("intent_summary"\)[\s\S]*@@map\("review_graphs"\)/,
    );
    assert.match(
      schema,
      /model ReviewNode\s+{[\s\S]*id\s+String\s+@id[\s\S]*functionName\s+String\?\s+@map\("function_name"\)[\s\S]*reviewOrder\s+Int\s+@default\(1\)\s+@map\("review_order"\)[\s\S]*@@map\("review_nodes"\)/,
    );
    assert.match(
      schema,
      /model NodeReviewState\s+{[\s\S]*nodeId\s+String\s+@map\("node_id"\)[\s\S]*@@unique\(\[nodeId, reviewerMemberId\]\)[\s\S]*@@map\("node_review_states"\)/,
    );
    assert.match(reviewGraphMigration, /CREATE TABLE IF NOT EXISTS review_nodes/);
    assert.match(reviewGraphMigration, /id TEXT PRIMARY KEY/);
    assert.doesNotMatch(
      reviewGraphMigration,
      /CREATE TABLE IF NOT EXISTS review_nodes \(\s*id UUID PRIMARY KEY/,
    );
  });

  it("maps Review changed files persistence to runtime read models", () => {
    assert.match(
      schema,
      /model ChangedFile\s+{[\s\S]*analysisId\s+String\s+@map\("analysis_id"\)\s+@db\.Uuid[\s\S]*filePath\s+String\s+@map\("file_path"\)[\s\S]*@@unique\(\[analysisId, filePath\]\)[\s\S]*@@map\("changed_files"\)/,
    );
    assert.match(
      schema,
      /model ChangedFunction\s+{[\s\S]*changedFileId\s+String\s+@map\("changed_file_id"\)\s+@db\.Uuid[\s\S]*name\s+String\s+@db\.VarChar\(255\)[\s\S]*@@unique\(\[changedFileId, name\]\)[\s\S]*@@map\("changed_functions"\)/,
    );
    assert.match(
      changedFilesMigration,
      /CREATE TABLE IF NOT EXISTS changed_files/,
    );
    assert.match(
      changedFilesMigration,
      /CONSTRAINT changed_files_analysis_file_path_key UNIQUE \(analysis_id, file_path\)/,
    );
    assert.match(
      changedFilesMigration,
      /CONSTRAINT changed_functions_file_name_key UNIQUE \(changed_file_id, name\)/,
    );
    assert.match(
      logicalSchema,
      /CREATE INDEX IF NOT EXISTS idx_changed_functions_file_id ON changed_functions\(changed_file_id\);/,
    );
  });

  it("maps Review room artifacts persistence to current runtime APIs", () => {
    assert.match(
      schema,
      /model CodeReviewRoom\s+{[\s\S]*pullRequestId\s+String\s+@unique\s+@map\("pull_request_id"\)\s+@db\.Uuid[\s\S]*pullRequestSnapshot\s+Json\?\s+@map\("pull_request_snapshot"\)\s+@db\.JsonB[\s\S]*@@map\("code_review_rooms"\)/,
    );
    assert.match(
      schema,
      /model ReviewComment\s+{[\s\S]*roomId\s+String\s+@map\("room_id"\)\s+@db\.Uuid[\s\S]*body\s+String[\s\S]*@@map\("review_comments"\)/,
    );
    assert.match(
      schema,
      /model ReviewChecklistItem\s+{[\s\S]*analysisId\s+String\s+@map\("analysis_id"\)\s+@db\.Uuid[\s\S]*@@unique\(\[analysisId, checklistType, sortOrder\]\)[\s\S]*@@map\("review_checklist_items"\)/,
    );
    assert.match(
      reviewRoomArtifactsMigration,
      /CREATE TABLE IF NOT EXISTS code_review_rooms/,
    );
    assert.match(
      reviewRoomArtifactsMigration,
      /CREATE TABLE IF NOT EXISTS review_comments/,
    );
    assert.match(
      reviewRoomArtifactsMigration,
      /CONSTRAINT review_checklist_items_analysis_slot_key UNIQUE \(analysis_id, checklist_type, sort_order\)/,
    );
    assert.match(
      logicalSchema,
      /CREATE INDEX IF NOT EXISTS idx_review_checklist_items_analysis_id ON review_checklist_items\(analysis_id\);/,
    );
    assert.match(logicalSchema, /pull_request_snapshot JSONB/);
    assert.match(
      reviewPrSummarySnapshotMigration,
      /ALTER TABLE code_review_rooms\s+DROP CONSTRAINT IF EXISTS code_review_rooms_pull_request_id_fkey;/,
    );
    assert.match(
      reviewPrSummarySnapshotMigration,
      /ALTER TABLE pull_request_analyses\s+DROP CONSTRAINT IF EXISTS pull_request_analyses_pull_request_id_fkey;/,
    );
    assert.match(
      reviewPrSummarySnapshotMigration,
      /ALTER TABLE review_graphs\s+DROP CONSTRAINT IF EXISTS review_graphs_pull_request_id_fkey;/,
    );
    assert.doesNotMatch(
      logicalSchema,
      /CREATE TABLE code_review_rooms \([\s\S]*pull_request_id UUID NOT NULL REFERENCES pull_requests/,
    );
    assert.doesNotMatch(
      logicalSchema,
      /CREATE TABLE pull_request_analyses \([\s\S]*pull_request_id UUID NOT NULL REFERENCES pull_requests/,
    );
  });
});
