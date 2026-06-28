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

  it("maps Agent Runtime registry models to the owner tables", () => {
    assert.match(schema, /model Agent\s+{[\s\S]*@@map\("agents"\)/);
    assert.match(
      schema,
      /model AgentWorkflow\s+{[\s\S]*agentId\s+String\s+@map\("agent_id"\)[\s\S]*type\s+String\s+@db\.VarChar\(120\)[\s\S]*version\s+String\s+@default\("v1"\)/,
    );
    assert.match(
      schema,
      /@@unique\(\[agentId, type, version\]\)[\s\S]*@@map\("agent_workflows"\)/,
    );
  });
});
