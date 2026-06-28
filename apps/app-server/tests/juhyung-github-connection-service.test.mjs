import assert from "node:assert/strict";
import process from "node:process";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { BadRequestException } = require("@nestjs/common");
const {
  JuhyungGithubConnectionService,
} = require("../src/modules/juhyung/juhyung-github-connection.service");

describe("JuhyungGithubConnectionService", () => {
  it("starts a GitHub App installation flow after validating workspace membership", async () => {
    const previousSlug = process.env.GITHUB_APP_SLUG;
    process.env.GITHUB_APP_SLUG = "pilo-dev";
    const calls = [];
    const workspaceAccess = {
      requireWorkspaceMember: async (workspaceId, actor) => {
        calls.push(["workspace.requireWorkspaceMember", workspaceId, actor]);
        return { id: "member-1", workspaceId };
      },
    };
    const repository = {
      createPendingConnectionIntent: async (input) => {
        calls.push(["repository.createPendingConnectionIntent", input]);
        return { id: "connection-1", ...input };
      },
    };
    const service = new JuhyungGithubConnectionService(
      repository,
      workspaceAccess,
    );

    const response = await service.startConnection(
      "workspace-1",
      { scopes: ["metadata", "contents"] },
      { userId: "user-1", memberId: "member-1" },
    );

    assert.match(response.state, /^[A-Za-z0-9_-]+$/);
    assert.equal(
      response.installationUrl,
      `https://github.com/apps/pilo-dev/installations/new?state=${encodeURIComponent(response.state)}`,
    );
    assert.deepEqual(calls, [
      [
        "workspace.requireWorkspaceMember",
        "workspace-1",
        { userId: "user-1", memberId: "member-1" },
      ],
      [
        "repository.createPendingConnectionIntent",
        {
          workspaceId: "workspace-1",
          connectedByMemberId: "member-1",
          scopes: ["metadata", "contents"],
          stateNonce: response.state,
        },
      ],
    ]);

    if (previousSlug === undefined) {
      delete process.env.GITHUB_APP_SLUG;
    } else {
      process.env.GITHUB_APP_SLUG = previousSlug;
    }
  });

  it("completes a callback by persisting the installation on the pending workspace intent", async () => {
    const calls = [];
    const repository = {
      completeConnectionIntent: async (input) => {
        calls.push(["repository.completeConnectionIntent", input]);
        return {
          id: "connection-1",
          workspaceId: "workspace-1",
          provider: "github_app",
          installationId: "12345678",
          githubAccountLogin: "team-org",
          connectedAt: "2026-06-27T12:00:00.000Z",
          revokedAt: null,
        };
      },
    };
    const service = new JuhyungGithubConnectionService(repository, {});

    const summary = await service.completeAppCallback({
      state: "nonce-1",
      installationId: "12345678",
      githubAccountLogin: "team-org",
      scopes: ["metadata"],
    });

    assert.equal(summary.installationId, "12345678");
    assert.deepEqual(calls, [
      [
        "repository.completeConnectionIntent",
        {
          stateNonce: "nonce-1",
          installationId: "12345678",
          githubAccountLogin: "team-org",
          scopes: ["metadata"],
        },
      ],
    ]);
  });

  it("rejects callbacks without a valid state before touching storage", async () => {
    const repository = {
      completeConnectionIntent: async () => {
        throw new Error("should not persist a callback without state");
      },
    };
    const service = new JuhyungGithubConnectionService(repository, {});

    await assert.rejects(
      () =>
        service.completeAppCallback({
          state: "",
          installationId: "12345678",
        }),
      BadRequestException,
    );
  });

  it("lists and revokes connections only after workspace membership validation", async () => {
    const calls = [];
    const workspaceAccess = {
      requireWorkspaceMember: async (workspaceId, actor) => {
        calls.push(["workspace.requireWorkspaceMember", workspaceId, actor]);
        return { id: "member-1", workspaceId };
      },
    };
    const repository = {
      listConnections: async (workspaceId) => {
        calls.push(["repository.listConnections", workspaceId]);
        return [{ id: "connection-1", workspaceId, revokedAt: null }];
      },
      revokeConnection: async (workspaceId, connectionId) => {
        calls.push(["repository.revokeConnection", workspaceId, connectionId]);
        return { id: connectionId, workspaceId, revokedAt: "now" };
      },
    };
    const service = new JuhyungGithubConnectionService(
      repository,
      workspaceAccess,
    );

    await service.listConnections("workspace-1", { memberId: "member-1" });
    const revoked = await service.revokeConnection(
      "workspace-1",
      "connection-1",
      { memberId: "member-1" },
    );

    assert.equal(revoked.revokedAt, "now");
    assert.deepEqual(calls, [
      [
        "workspace.requireWorkspaceMember",
        "workspace-1",
        { memberId: "member-1" },
      ],
      ["repository.listConnections", "workspace-1"],
      [
        "workspace.requireWorkspaceMember",
        "workspace-1",
        { memberId: "member-1" },
      ],
      ["repository.revokeConnection", "workspace-1", "connection-1"],
    ]);
  });
});
