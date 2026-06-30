import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import process from "node:process";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  ConflictException,
  InternalServerErrorException,
} = require("@nestjs/common");
const {
  JuhyungGithubProviderClient,
} = require("../src/modules/juhyung/juhyung-github-provider.client");
const {
  JuhyungGithubSyncService,
} = require("../src/modules/juhyung/juhyung-github-sync.service");

describe("JuhyungGithubSyncService", () => {
  it("syncs repositories and pull requests through the GitHub App API", async () => {
    const previousAppId = process.env.GITHUB_APP_ID;
    const previousPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
    process.env.GITHUB_APP_ID = "12345";
    process.env.GITHUB_APP_PRIVATE_KEY = String(privateKeyPem).replace(
      /\n/g,
      "\\n",
    );

    try {
      const calls = [];
      const fetcher = async (url, init = {}) => {
        calls.push(["fetch", url, init.method, init.headers]);

        if (
          url ===
          "https://api.github.com/app/installations/installation-1/access_tokens"
        ) {
          assert.match(init.headers.Authorization, /^Bearer [^.]+\.[^.]+\./);
          return jsonResponse({ token: "installation-token-1" });
        }

        assert.equal(init.headers.Authorization, "Bearer installation-token-1");

        if (
          url ===
          "https://api.github.com/installation/repositories?per_page=100"
        ) {
          return jsonResponse({
            repositories: [
              {
                owner: { login: "pilo-org" },
                name: "pilo-app",
                html_url: "https://github.com/pilo-org/pilo-app",
                default_branch: "main",
              },
            ],
          });
        }

        if (
          url ===
          "https://api.github.com/repos/pilo-org/pilo-app/pulls?state=all&per_page=100"
        ) {
          return jsonResponse([
            {
              number: 7,
              title: "Wire Review Room to runtime PRs",
              state: "open",
              html_url: "https://github.com/pilo-org/pilo-app/pull/7",
              user: { login: "juhyung" },
              head: { ref: "feature/review-runtime" },
              base: { ref: "main" },
              changed_files: 3,
              additions: 42,
              deletions: 9,
              created_at: "2026-06-30T00:00:00Z",
              merged_at: null,
              closed_at: null,
            },
          ]);
        }

        throw new Error(`Unexpected GitHub request: ${url}`);
      };
      const workspaceAccess = {
        requireWorkspaceMember: async (workspaceId, actor) => {
          calls.push(["workspace.requireWorkspaceMember", workspaceId, actor]);
          return { id: "member-1", workspaceId };
        },
      };
      const repository = {
        listActiveGithubConnectionsForWorkspace: async (workspaceId) => {
          calls.push([
            "repository.listActiveGithubConnectionsForWorkspace",
            workspaceId,
          ]);
          return [
            {
              id: "connection-1",
              workspaceId,
              installationId: "installation-1",
            },
          ];
        },
        upsertGithubRepository: async (input) => {
          assert.equal(input.syncedAt instanceof Date, true);
          calls.push([
            "repository.upsertGithubRepository",
            withoutSyncedAt(input),
          ]);
          return {
            id: "repository-1",
            workspaceId: input.workspaceId,
            owner: input.owner,
            repoName: input.repoName,
            url: input.url,
            defaultBranch: input.defaultBranch,
            updatedAt: input.syncedAt,
          };
        },
        upsertPullRequest: async (input) => {
          assert.equal(input.syncedAt instanceof Date, true);
          calls.push(["repository.upsertPullRequest", withoutSyncedAt(input)]);
          return {
            id: "pull-request-1",
            repositoryId: input.repositoryId,
            number: input.number,
            title: input.title,
            authorLogin: input.authorLogin,
            state: input.state,
            branch: input.branch,
            baseBranch: input.baseBranch,
            url: input.url,
            changedFilesCount: input.changedFilesCount,
            additions: input.additions,
            deletions: input.deletions,
            syncedAt: input.syncedAt,
          };
        },
      };
      const service = new JuhyungGithubSyncService(
        repository,
        workspaceAccess,
        new JuhyungGithubProviderClient(fetcher),
      );

      const summary = await service.syncRepositories("workspace-1", {
        userId: "user-1",
        memberId: "member-1",
      });

      assert.match(summary.syncedAt, /^2026-|^20/);
      assert.deepEqual(summary.repositories, [
        {
          id: "repository-1",
          workspaceId: "workspace-1",
          owner: "pilo-org",
          repoName: "pilo-app",
          url: "https://github.com/pilo-org/pilo-app",
          defaultBranch: "main",
          syncedAt: summary.repositories[0].syncedAt,
        },
      ]);
      assert.deepEqual(summary.pullRequests, [
        {
          id: "pull-request-1",
          repositoryId: "repository-1",
          number: 7,
          title: "Wire Review Room to runtime PRs",
          authorLogin: "juhyung",
          state: "open",
          branch: "feature/review-runtime",
          baseBranch: "main",
          url: "https://github.com/pilo-org/pilo-app/pull/7",
          changedFilesCount: 3,
          additions: 42,
          deletions: 9,
          linkedTaskIds: [],
          syncedAt: summary.pullRequests[0].syncedAt,
        },
      ]);
      assert.deepEqual(calls.map(toComparableCall), [
        [
          "workspace.requireWorkspaceMember",
          "workspace-1",
          { userId: "user-1", memberId: "member-1" },
        ],
        ["repository.listActiveGithubConnectionsForWorkspace", "workspace-1"],
        [
          "fetch",
          "https://api.github.com/app/installations/installation-1/access_tokens",
          "POST",
        ],
        [
          "fetch",
          "https://api.github.com/installation/repositories?per_page=100",
          "GET",
        ],
        [
          "repository.upsertGithubRepository",
          {
            workspaceId: "workspace-1",
            githubConnectionId: "connection-1",
            installationId: "installation-1",
            owner: "pilo-org",
            repoName: "pilo-app",
            url: "https://github.com/pilo-org/pilo-app",
            defaultBranch: "main",
          },
        ],
        [
          "fetch",
          "https://api.github.com/repos/pilo-org/pilo-app/pulls?state=all&per_page=100",
          "GET",
        ],
        [
          "repository.upsertPullRequest",
          {
            repositoryId: "repository-1",
            number: 7,
            title: "Wire Review Room to runtime PRs",
            authorLogin: "juhyung",
            state: "open",
            branch: "feature/review-runtime",
            baseBranch: "main",
            url: "https://github.com/pilo-org/pilo-app/pull/7",
            changedFilesCount: 3,
            additions: 42,
            deletions: 9,
            openedAt: "2026-06-30T00:00:00Z",
            mergedAt: null,
            closedAt: null,
          },
        ],
      ]);
    } finally {
      restoreEnv("GITHUB_APP_ID", previousAppId);
      restoreEnv("GITHUB_APP_PRIVATE_KEY", previousPrivateKey);
    }
  });

  it("fails explicitly when GitHub App provider env is missing", async () => {
    const previousAppId = process.env.GITHUB_APP_ID;
    const previousPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;

    try {
      let fetcherCalled = false;
      const service = new JuhyungGithubSyncService(
        {
          listActiveGithubConnectionsForWorkspace: async () => [
            {
              id: "connection-1",
              workspaceId: "workspace-1",
              installationId: "installation-1",
            },
          ],
        },
        {
          requireWorkspaceMember: async () => ({ id: "member-1" }),
        },
        new JuhyungGithubProviderClient(async () => {
          fetcherCalled = true;
          throw new Error("fetcher should not run without provider env");
        }),
      );

      await assert.rejects(
        () => service.syncRepositories("workspace-1", { memberId: "member-1" }),
        InternalServerErrorException,
      );
      assert.equal(fetcherCalled, false);
    } finally {
      restoreEnv("GITHUB_APP_ID", previousAppId);
      restoreEnv("GITHUB_APP_PRIVATE_KEY", previousPrivateKey);
    }
  });

  it("returns a conflict when no active GitHub App connection exists", async () => {
    const service = new JuhyungGithubSyncService(
      {
        listActiveGithubConnectionsForWorkspace: async () => [],
      },
      {
        requireWorkspaceMember: async () => ({ id: "member-1" }),
      },
      new JuhyungGithubProviderClient(async () => {
        throw new Error("fetcher should not run without a connection");
      }),
    );

    await assert.rejects(
      () => service.syncRepositories("workspace-1", { memberId: "member-1" }),
      (error) =>
        error instanceof ConflictException &&
        error.message ===
          "Active GitHub App connection is required before repository sync",
    );
  });
});

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    async json() {
      return body;
    },
  };
}

function withoutSyncedAt(input) {
  const rest = { ...input };
  delete rest.syncedAt;
  return rest;
}

function toComparableCall(call) {
  if (call[0] !== "fetch") {
    return call;
  }

  return [call[0], call[1], call[2]];
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
