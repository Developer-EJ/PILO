import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  JuhyungGithubConnectionController,
  JuhyungGithubAppCallbackController,
} = require("../src/modules/juhyung/juhyung-github-connection.controller");

describe("JuhyungGithubConnectionController", () => {
  it("exposes workspace-scoped start, list, and revoke methods with authenticated request context", async () => {
    const calls = [];
    const service = {
      startConnection: async (workspaceId, body, actor) => {
        calls.push(["startConnection", workspaceId, body, actor]);
        return { state: "nonce-1", installationUrl: "https://github.test" };
      },
      listConnections: async (workspaceId, actor) => {
        calls.push(["listConnections", workspaceId, actor]);
        return [{ id: "connection-1", workspaceId }];
      },
      revokeConnection: async (workspaceId, connectionId, actor) => {
        calls.push(["revokeConnection", workspaceId, connectionId, actor]);
        return { id: connectionId, workspaceId, revokedAt: "now" };
      },
    };
    const controller = new JuhyungGithubConnectionController(service);
    const request = {
      auth: {
        actor: {
          userId: "user-1",
          memberId: "member-1",
        },
      },
    };

    await controller.startConnection(
      "workspace-1",
      { scopes: ["metadata"] },
      request,
    );
    await controller.listConnections("workspace-1", request);
    await controller.revokeConnection("workspace-1", "connection-1", request);

    assert.deepEqual(calls, [
      [
        "startConnection",
        "workspace-1",
        { scopes: ["metadata"] },
        { userId: "user-1", memberId: "member-1" },
      ],
      [
        "listConnections",
        "workspace-1",
        { userId: "user-1", memberId: "member-1" },
      ],
      [
        "revokeConnection",
        "workspace-1",
        "connection-1",
        { userId: "user-1", memberId: "member-1" },
      ],
    ]);
  });

  it("falls back to explicit actor headers when request auth context is absent", async () => {
    const calls = [];
    const service = {
      startConnection: async (workspaceId, body, actor) => {
        calls.push(["startConnection", workspaceId, body, actor]);
        return { state: "nonce-1", installationUrl: "https://github.test" };
      },
      listConnections: async (workspaceId, actor) => {
        calls.push(["listConnections", workspaceId, actor]);
        return [];
      },
      revokeConnection: async (workspaceId, connectionId, actor) => {
        calls.push(["revokeConnection", workspaceId, connectionId, actor]);
        return { id: connectionId, workspaceId, revokedAt: "now" };
      },
    };
    const controller = new JuhyungGithubConnectionController(service);

    await controller.startConnection(
      "workspace-1",
      {},
      {},
      "user-1",
      "member-1",
    );
    await controller.listConnections("workspace-1", {}, "user-1", "member-1");
    await controller.revokeConnection(
      "workspace-1",
      "connection-1",
      {},
      "user-1",
      "member-1",
    );

    assert.deepEqual(calls, [
      [
        "startConnection",
        "workspace-1",
        {},
        { userId: "user-1", memberId: "member-1" },
      ],
      [
        "listConnections",
        "workspace-1",
        { userId: "user-1", memberId: "member-1" },
      ],
      [
        "revokeConnection",
        "workspace-1",
        "connection-1",
        { userId: "user-1", memberId: "member-1" },
      ],
    ]);
  });

  it("exposes the GitHub App callback method", async () => {
    const calls = [];
    const service = {
      completeAppCallback: async (query) => {
        calls.push(["completeAppCallback", query]);
        return { id: "connection-1", installationId: query.installationId };
      },
    };
    const controller = new JuhyungGithubAppCallbackController(service);

    const response = await controller.completeAppCallback({
      state: "nonce-1",
      installation_id: "12345678",
      account_login: "team-org",
      scopes: "metadata,contents",
    });

    assert.equal(response.installationId, "12345678");
    assert.deepEqual(calls, [
      [
        "completeAppCallback",
        {
          state: "nonce-1",
          installationId: "12345678",
          githubAccountLogin: "team-org",
          scopes: ["metadata", "contents"],
        },
      ],
    ]);
  });
});
