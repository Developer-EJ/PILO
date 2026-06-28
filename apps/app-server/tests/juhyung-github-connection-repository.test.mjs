import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  BadRequestException,
  ConflictException,
  NotFoundException,
} = require("@nestjs/common");
const {
  JuhyungGithubConnectionRepository,
} = require("../src/modules/juhyung/juhyung-github-connection.repository");

const connectedAt = new Date("2026-06-27T12:00:00.000Z");

describe("JuhyungGithubConnectionRepository", () => {
  it("creates a pending connection intent with a single-use state nonce", async () => {
    const calls = [];
    const database = {
      githubConnection: {
        create: async (args) => {
          calls.push(args);
          return {
            id: "connection-1",
            provider: "github_app",
            installationId: null,
            githubAccountLogin: null,
            connectedAt,
            revokedAt: null,
            ...args.data,
          };
        },
      },
    };
    const repository = new JuhyungGithubConnectionRepository(database);

    const intent = await repository.createPendingConnectionIntent({
      workspaceId: "workspace-1",
      connectedByMemberId: "member-1",
      scopes: ["metadata"],
      stateNonce: "nonce-1",
    });

    assert.equal(intent.stateNonce, "nonce-1");
    assert.deepEqual(calls, [
      {
        data: {
          workspaceId: "workspace-1",
          provider: "github_app",
          connectedByMemberId: "member-1",
          scopes: ["metadata"],
          stateNonce: "nonce-1",
        },
      },
    ]);
  });

  it("completes a pending intent and returns the public connection summary", async () => {
    const calls = [];
    const database = {
      githubConnection: {
        findFirst: async (args) => {
          calls.push(["findFirst", args]);
          if (args.where.stateNonce === "nonce-1") {
            return {
              id: "connection-1",
              workspaceId: "workspace-1",
              scopes: ["metadata"],
            };
          }
          return null;
        },
        update: async (args) => {
          calls.push(["update", args]);
          return {
            id: "connection-1",
            workspaceId: "workspace-1",
            provider: "github_app",
            installationId: args.data.installationId,
            githubAccountLogin: args.data.githubAccountLogin,
            scopes: args.data.scopes,
            connectedAt,
            revokedAt: null,
          };
        },
      },
    };
    const repository = new JuhyungGithubConnectionRepository(database);

    const summary = await repository.completeConnectionIntent({
      stateNonce: "nonce-1",
      installationId: "12345678",
      githubAccountLogin: "team-org",
      scopes: ["metadata", "contents"],
    });

    assert.deepEqual(summary, {
      id: "connection-1",
      workspaceId: "workspace-1",
      provider: "github_app",
      installationId: "12345678",
      githubAccountLogin: "team-org",
      scopes: ["metadata", "contents"],
      connectedAt: "2026-06-27T12:00:00.000Z",
      revokedAt: null,
    });
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0], [
      "findFirst",
      {
        where: {
          stateNonce: "nonce-1",
          installationId: null,
          revokedAt: null,
        },
      },
    ]);
    assert.deepEqual(calls[1], [
      "findFirst",
      {
        where: {
          installationId: "12345678",
          revokedAt: null,
          NOT: { workspaceId: "workspace-1" },
        },
      },
    ]);
    assert.equal(calls[2][1].where.id, "connection-1");
    assert.equal(calls[2][1].data.installationId, "12345678");
    assert.equal(calls[2][1].data.githubAccountLogin, "team-org");
    assert.deepEqual(calls[2][1].data.scopes, ["metadata", "contents"]);
    assert.equal(calls[2][1].data.stateNonce, null);
    assert.ok(calls[2][1].data.connectedAt instanceof Date);
    assert.ok(calls[2][1].data.updatedAt instanceof Date);
  });

  it("rejects callbacks with unknown state nonce", async () => {
    const database = {
      githubConnection: {
        findFirst: async () => null,
      },
    };
    const repository = new JuhyungGithubConnectionRepository(database);

    await assert.rejects(
      () =>
        repository.completeConnectionIntent({
          stateNonce: "unknown",
          installationId: "12345678",
          githubAccountLogin: null,
          scopes: [],
        }),
      BadRequestException,
    );
  });

  it("rejects installation ids that already belong to another workspace", async () => {
    const database = {
      githubConnection: {
        findFirst: async (args) => {
          if (args.where.stateNonce === "nonce-1") {
            return {
              id: "connection-1",
              workspaceId: "workspace-1",
              scopes: [],
            };
          }
          return { id: "connection-2", workspaceId: "workspace-2" };
        },
      },
    };
    const repository = new JuhyungGithubConnectionRepository(database);

    await assert.rejects(
      () =>
        repository.completeConnectionIntent({
          stateNonce: "nonce-1",
          installationId: "12345678",
          githubAccountLogin: "team-org",
          scopes: [],
        }),
      ConflictException,
    );
  });

  it("rejects installation ids that lose a database uniqueness race during callback completion", async () => {
    const database = {
      githubConnection: {
        findFirst: async (args) => {
          if (args.where.stateNonce === "nonce-1") {
            return {
              id: "connection-1",
              workspaceId: "workspace-1",
              scopes: [],
            };
          }
          return null;
        },
        update: async () => {
          throw { code: "P2002" };
        },
      },
    };
    const repository = new JuhyungGithubConnectionRepository(database);

    await assert.rejects(
      () =>
        repository.completeConnectionIntent({
          stateNonce: "nonce-1",
          installationId: "12345678",
          githubAccountLogin: "team-org",
          scopes: [],
        }),
      ConflictException,
    );
  });

  it("lists active workspace connections and records revoked state", async () => {
    const calls = [];
    const database = {
      githubConnection: {
        findMany: async (args) => {
          calls.push(["findMany", args]);
          return [
            {
              id: "connection-1",
              workspaceId: "workspace-1",
              provider: "github_app",
              installationId: "12345678",
              githubAccountLogin: "team-org",
              scopes: ["metadata"],
              connectedAt,
              revokedAt: null,
            },
          ];
        },
        findFirst: async (args) => {
          calls.push(["findFirst", args]);
          return { id: "connection-1", workspaceId: "workspace-1" };
        },
        update: async (args) => {
          calls.push(["update", args]);
          return {
            id: "connection-1",
            workspaceId: "workspace-1",
            provider: "github_app",
            installationId: "12345678",
            githubAccountLogin: "team-org",
            scopes: ["metadata"],
            connectedAt,
            revokedAt: args.data.revokedAt,
          };
        },
      },
    };
    const repository = new JuhyungGithubConnectionRepository(database);

    const connections = await repository.listConnections("workspace-1");
    const revoked = await repository.revokeConnection(
      "workspace-1",
      "connection-1",
    );

    assert.equal(connections[0].revokedAt, null);
    assert.match(revoked.revokedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(calls[0], [
      "findMany",
      {
        where: {
          workspaceId: "workspace-1",
          installationId: { not: null },
        },
        orderBy: [{ connectedAt: "desc" }, { createdAt: "desc" }],
      },
    ]);
    assert.deepEqual(calls[1], [
      "findFirst",
      {
        where: {
          id: "connection-1",
          workspaceId: "workspace-1",
          installationId: { not: null },
          revokedAt: null,
        },
      },
    ]);
    assert.equal(calls[2][1].where.id, "connection-1");
    assert.ok(calls[2][1].data.revokedAt instanceof Date);
    assert.ok(calls[2][1].data.updatedAt instanceof Date);
  });

  it("throws NotFoundException when revoking a missing or already revoked connection", async () => {
    const calls = [];
    const database = {
      githubConnection: {
        findFirst: async (args) => {
          calls.push(["findFirst", args]);
          return null;
        },
        update: async () => {
          throw new Error("should not update a missing GitHub connection");
        },
      },
    };
    const repository = new JuhyungGithubConnectionRepository(database);

    await assert.rejects(
      () => repository.revokeConnection("workspace-1", "connection-1"),
      NotFoundException,
    );
    assert.deepEqual(calls, [
      [
        "findFirst",
        {
          where: {
            id: "connection-1",
            workspaceId: "workspace-1",
            installationId: { not: null },
            revokedAt: null,
          },
        },
      ],
    ]);
  });
});
