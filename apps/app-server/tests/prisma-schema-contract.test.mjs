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
      /CREATE UNIQUE INDEX github_connections_active_installation_id_unique\s+ON github_connections \(installation_id\)\s+WHERE installation_id IS NOT NULL AND revoked_at IS NULL;/,
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
});
