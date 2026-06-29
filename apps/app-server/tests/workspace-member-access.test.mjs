import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { ForbiddenException, UnauthorizedException } = require("@nestjs/common");
const {
  WorkspaceMemberAccessService,
} = require("../src/modules/workspace/workspace-member-access.service");

describe("WorkspaceMemberAccessService", () => {
  it("loads the current member by workspace and user id", async () => {
    const calls = [];
    const database = {
      workspaceMember: {
        findFirst: async (args) => {
          calls.push(args);
          return {
            id: "member-1",
            workspaceId: "workspace-1",
            userId: "user-1",
            role: "member",
          };
        },
      },
    };
    const service = new WorkspaceMemberAccessService(database);

    const member = await service.requireWorkspaceMember("workspace-1", {
      userId: "user-1",
    });

    assert.equal(member.id, "member-1");
    assert.deepEqual(calls, [
      {
        where: {
          workspaceId: "workspace-1",
          userId: "user-1",
        },
      },
    ]);
  });

  it("loads the current member by explicit member id and workspace", async () => {
    const calls = [];
    const database = {
      workspaceMember: {
        findFirst: async (args) => {
          calls.push(args);
          return {
            id: "member-1",
            workspaceId: "workspace-1",
            userId: "user-1",
            role: "owner",
          };
        },
      },
    };
    const service = new WorkspaceMemberAccessService(database);

    const member = await service.requireWorkspaceMember("workspace-1", {
      memberId: "member-1",
    });

    assert.equal(member.role, "owner");
    assert.deepEqual(calls, [
      {
        where: {
          id: "member-1",
          workspaceId: "workspace-1",
        },
      },
    ]);
  });

  it("loads the current member only when user id and member id match the same workspace row", async () => {
    const calls = [];
    const database = {
      workspaceMember: {
        findFirst: async (args) => {
          calls.push(args);
          return {
            id: "member-1",
            workspaceId: "workspace-1",
            userId: "user-1",
            role: "owner",
          };
        },
      },
    };
    const service = new WorkspaceMemberAccessService(database);

    const member = await service.requireWorkspaceMember("workspace-1", {
      userId: "user-1",
      memberId: "member-1",
    });

    assert.equal(member.id, "member-1");
    assert.deepEqual(calls, [
      {
        where: {
          id: "member-1",
          workspaceId: "workspace-1",
          userId: "user-1",
        },
      },
    ]);
  });

  it("rejects mismatched user and member ids with ForbiddenException", async () => {
    const calls = [];
    const service = new WorkspaceMemberAccessService({
      workspaceMember: {
        findFirst: async (args) => {
          calls.push(args);
          return null;
        },
      },
    });

    await assert.rejects(
      () =>
        service.requireWorkspaceMember("workspace-1", {
          userId: "user-1",
          memberId: "member-2",
        }),
      ForbiddenException,
    );
    assert.deepEqual(calls, [
      {
        where: {
          id: "member-2",
          workspaceId: "workspace-1",
          userId: "user-1",
        },
      },
    ]);
  });

  it("rejects missing actor identity with UnauthorizedException", async () => {
    const service = new WorkspaceMemberAccessService({
      workspaceMember: {
        findFirst: async () => {
          throw new Error("should not query without an actor");
        },
      },
    });

    await assert.rejects(
      () => service.requireWorkspaceMember("workspace-1", {}),
      UnauthorizedException,
    );
  });

  it("rejects missing actor context with UnauthorizedException", async () => {
    const service = new WorkspaceMemberAccessService({
      workspaceMember: {
        findFirst: async () => {
          throw new Error("should not query without an actor");
        },
      },
    });

    await assert.rejects(
      () => service.requireWorkspaceMember("workspace-1"),
      UnauthorizedException,
    );
  });

  it("rejects actors outside the workspace with ForbiddenException", async () => {
    const service = new WorkspaceMemberAccessService({
      workspaceMember: {
        findFirst: async () => null,
      },
    });

    await assert.rejects(
      () =>
        service.requireWorkspaceMember("workspace-1", {
          userId: "user-2",
        }),
      ForbiddenException,
    );
  });
});
