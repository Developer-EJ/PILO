import {
  buildWorkspaceApiUrl,
  defaultWorkspaceApiBaseUrl,
  WorkspaceApiError,
} from "../workspace/workspaceClient.mjs";
import { workspaceDashboardFixture } from "../workspace/workspaceDashboardFixture.mjs";

const DEFAULT_GITHUB_MODE = "mock";

export function defaultGithubMode() {
  return (
    process.env.NEXT_PUBLIC_PILO_GITHUB_MODE ??
    process.env.NEXT_PUBLIC_PILO_WORKSPACE_MODE ??
    DEFAULT_GITHUB_MODE
  );
}

export function resolveGithubClientMode(mode = defaultGithubMode()) {
  return mode === "api" ? "api" : "mock";
}

export function buildGithubApiUrl(
  path,
  baseUrl = defaultWorkspaceApiBaseUrl(),
) {
  if (!path.startsWith("/api/")) {
    throw new GithubApiError("GitHub API path must start with /api/", {
      path,
    });
  }

  return buildWorkspaceApiUrl(path, baseUrl);
}

export class GithubApiError extends WorkspaceApiError {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "GithubApiError";
  }
}

async function readGithubJson(response, path) {
  try {
    return await response.json();
  } catch (error) {
    throw new GithubApiError("GitHub API returned invalid JSON", {
      status: response.status,
      path,
    });
  }
}

async function requestGithubJson(path, init, { baseUrl, fetcher }) {
  const response = await fetcher(buildGithubApiUrl(path, baseUrl), {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new GithubApiError("GitHub API request failed", {
      status: response.status,
      path,
    });
  }

  if (response.status === 204) {
    return null;
  }

  return readGithubJson(response, path);
}

export function createGithubFixture(workspaceId) {
  const repository = {
    id: "55555555-5555-4555-8555-555555555501",
    workspaceId,
    owner: "example",
    repoName: "pilo",
    url: "https://github.com/example/pilo",
    defaultBranch: "dev",
    syncedAt: "2026-06-27T10:00:00.000Z",
  };

  return {
    connections: [],
    repositories: [repository],
    issues: workspaceDashboardFixture.githubIssues.filter(
      (issue) => issue.repositoryId === repository.id,
    ),
    pullRequests: workspaceDashboardFixture.pullRequests.filter(
      (pullRequest) => pullRequest.repositoryId === repository.id,
    ),
  };
}

export function createMockGithubClient() {
  const fixtureByWorkspaceId = new Map();

  function fixtureForWorkspace(workspaceId) {
    if (!fixtureByWorkspaceId.has(workspaceId)) {
      fixtureByWorkspaceId.set(workspaceId, createGithubFixture(workspaceId));
    }

    return fixtureByWorkspaceId.get(workspaceId);
  }

  return {
    async listConnections(workspaceId) {
      return [...fixtureForWorkspace(workspaceId).connections];
    },
    async startConnection(workspaceId) {
      const state = `mock-state-${Date.now()}`;

      return {
        state,
        installationUrl: `https://github.com/apps/pilo/installations/new?state=${encodeURIComponent(state)}`,
      };
    },
    async listRepositories(workspaceId) {
      return [...fixtureForWorkspace(workspaceId).repositories];
    },
    async listIssues(repositoryId, { workspaceId } = {}) {
      const workspaceFixture = fixtureForWorkspace(
        workspaceId ?? workspaceDashboardFixture.workspace.id,
      );

      return workspaceFixture.issues.filter(
        (issue) => issue.repositoryId === repositoryId,
      );
    },
    async listPullRequests(repositoryId, { workspaceId } = {}) {
      const workspaceFixture = fixtureForWorkspace(
        workspaceId ?? workspaceDashboardFixture.workspace.id,
      );

      return workspaceFixture.pullRequests.filter(
        (pullRequest) => pullRequest.repositoryId === repositoryId,
      );
    },
    async createIssueFromTask(taskId, { repositoryId, title, workspaceId } = {}) {
      const resolvedWorkspaceId =
        workspaceId ?? workspaceDashboardFixture.workspace.id;
      const workspaceFixture = fixtureForWorkspace(resolvedWorkspaceId);
      const repository =
        workspaceFixture.repositories.find(
          (candidate) => candidate.id === repositoryId,
        ) ?? workspaceFixture.repositories[0];
      const nextNumber =
        Math.max(0, ...workspaceFixture.issues.map((issue) => issue.number)) + 1;
      const issue = {
        id: `github-issue-local-${Date.now()}`,
        repositoryId: repository.id,
        number: nextNumber,
        title: String(title ?? "Task issue").trim() || "Task issue",
        state: "open",
        url: `${repository.url.replace(/\/+$/, "")}/issues/${nextNumber}`,
        labels: [],
        linkedTaskId: taskId,
        syncedAt: new Date().toISOString(),
      };

      workspaceFixture.issues = [issue, ...workspaceFixture.issues];

      return issue;
    },
    async linkIssueToTask(issueId, taskId, { workspaceId } = {}) {
      const workspaceFixture = fixtureForWorkspace(
        workspaceId ?? workspaceDashboardFixture.workspace.id,
      );
      const issue = workspaceFixture.issues.find(
        (candidate) => candidate.id === issueId,
      );

      if (!issue) {
        throw new GithubApiError("GitHub issue not found", {
          status: 404,
          path: `/api/github/issues/${issueId}/link-task`,
        });
      }

      issue.linkedTaskId = taskId;

      return { ...issue };
    },
    async linkPullRequestToTask(pullRequestId, taskId, { workspaceId } = {}) {
      const workspaceFixture = fixtureForWorkspace(
        workspaceId ?? workspaceDashboardFixture.workspace.id,
      );
      const pullRequest = workspaceFixture.pullRequests.find(
        (candidate) => candidate.id === pullRequestId,
      );

      if (!pullRequest) {
        throw new GithubApiError("Pull request not found", {
          status: 404,
          path: `/api/github/pull-requests/${pullRequestId}/link-task`,
        });
      }

      pullRequest.linkedTaskIds = [
        ...new Set([...(pullRequest.linkedTaskIds ?? []), taskId]),
      ];

      return { ...pullRequest };
    },
  };
}

export function createGithubApiClient({
  baseUrl = defaultWorkspaceApiBaseUrl(),
  fetcher = fetch,
} = {}) {
  return {
    async listConnections(workspaceId) {
      return requestGithubJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/github/connections`,
        undefined,
        { baseUrl, fetcher },
      );
    },
    async startConnection(workspaceId) {
      return requestGithubJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/github/connections`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
        { baseUrl, fetcher },
      );
    },
    async listRepositories(workspaceId) {
      return requestGithubJson(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/github/repositories`,
        undefined,
        { baseUrl, fetcher },
      );
    },
    async listIssues(repositoryId) {
      return requestGithubJson(
        `/api/repositories/${encodeURIComponent(repositoryId)}/issues`,
        undefined,
        { baseUrl, fetcher },
      );
    },
    async listPullRequests(repositoryId) {
      return requestGithubJson(
        `/api/repositories/${encodeURIComponent(repositoryId)}/pull-requests`,
        undefined,
        { baseUrl, fetcher },
      );
    },
    async createIssueFromTask(taskId, input) {
      return requestGithubJson(
        `/api/tasks/${encodeURIComponent(taskId)}/github-issues`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
        { baseUrl, fetcher },
      );
    },
    async linkIssueToTask(issueId, taskId) {
      return requestGithubJson(
        `/api/github/issues/${encodeURIComponent(issueId)}/link-task`,
        {
          method: "POST",
          body: JSON.stringify({ taskId }),
        },
        { baseUrl, fetcher },
      );
    },
    async linkPullRequestToTask(pullRequestId, taskId) {
      return requestGithubJson(
        `/api/github/pull-requests/${encodeURIComponent(pullRequestId)}/link-task`,
        {
          method: "POST",
          body: JSON.stringify({ taskId }),
        },
        { baseUrl, fetcher },
      );
    },
  };
}

export function createGithubClient(options = {}) {
  const mode = resolveGithubClientMode(options.mode);

  if (mode === "api") {
    return createGithubApiClient(options);
  }

  return createMockGithubClient(options.mock);
}
