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
});
