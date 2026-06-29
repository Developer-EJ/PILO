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
});
