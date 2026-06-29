"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CurrentUserAvatar } from "../auth/CurrentUserAvatar";
import { LogoutButton } from "../auth/LogoutButton";
import { CurrentWorkspaceSwitcher } from "../workspace/CurrentWorkspaceSwitcher";
import { createGithubClient } from "../../lib/github/githubClient.mjs";
import { createTaskClient } from "../../lib/task/taskClient.mjs";
import {
  extractWorkspaceIdFromPathname,
  workspaceDashboardHref,
  workspaceReviewsHref,
  workspaceTasksHref,
} from "../../lib/workspace/currentWorkspace.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";

type GithubConnection = {
  id?: string;
  status?: string;
  installationId?: string;
  connectedAt?: string;
};

type GithubRepository = {
  id: string;
  owner: string;
  repoName: string;
  url: string;
  defaultBranch?: string;
  syncedAt?: string | null;
};

type GithubIssue = {
  id: string;
  number: number;
  title: string;
  state: string;
  url: string;
  labels?: string[];
  linkedTaskId?: string | null;
  syncStatus?: string;
  lastSyncedAt?: string | null;
};

type GithubPullRequest = {
  id: string;
  number: number;
  title: string;
  state: string;
  url: string;
  authorLogin?: string | null;
  branch?: string;
  baseBranch?: string;
  changedFilesCount?: number;
  linkedTaskIds?: string[];
  reviewRoomId?: string | null;
  syncedAt?: string | null;
};

type TaskSummary = {
  id: string;
  title: string;
  status: string;
  priority?: string;
};

function resolveWorkspaceId(pathname: string) {
  return extractWorkspaceIdFromPathname(pathname) ?? mockWorkspaces[0].id;
}

function formatLabel(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "unknown";
}

function formatSyncTime(value: string | null | undefined) {
  if (!value) return "Not synced";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not synced";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function WorkspaceGithub() {
  const pathname = usePathname() ?? "/";
  const workspaceId = useMemo(() => resolveWorkspaceId(pathname), [pathname]);
  const routes = useMemo(
    () => ({
      dashboard: workspaceDashboardHref(workspaceId),
      tasks: workspaceTasksHref(workspaceId),
      reviews: workspaceReviewsHref(workspaceId),
    }),
    [workspaceId],
  );
  const githubClient = useMemo(() => createGithubClient(), []);
  const taskClient = useMemo(() => createTaskClient(), []);
  const [connections, setConnections] = useState<GithubConnection[]>([]);
  const [repositories, setRepositories] = useState<GithubRepository[]>([]);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(
    null,
  );
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [issues, setIssues] = useState<GithubIssue[]>([]);
  const [pullRequests, setPullRequests] = useState<GithubPullRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedRepository =
    repositories.find((repository) => repository.id === selectedRepositoryId) ??
    repositories[0] ??
    null;
  const selectedTask =
    tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;

  const loadRepositoryData = useCallback(
    async (repository: GithubRepository | null) => {
      if (!repository) {
        setIssues([]);
        setPullRequests([]);
        return;
      }

      const [nextIssues, nextPullRequests] = await Promise.all([
        githubClient.listIssues(repository.id, { workspaceId }),
        githubClient.listPullRequests(repository.id, { workspaceId }),
      ]);

      setIssues(nextIssues as GithubIssue[]);
      setPullRequests(nextPullRequests as GithubPullRequest[]);
    },
    [githubClient, workspaceId],
  );

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextConnections, nextRepositories, nextTasks] = await Promise.all([
        githubClient.listConnections(workspaceId),
        githubClient.listRepositories(workspaceId),
        taskClient.listTasks(workspaceId),
      ]);
      const repositoryList = nextRepositories as GithubRepository[];
      const taskList = nextTasks as TaskSummary[];
      const repository =
        repositoryList.find(
          (candidate) => candidate.id === selectedRepositoryId,
        ) ??
        repositoryList[0] ??
        null;

      setConnections(nextConnections as GithubConnection[]);
      setRepositories(repositoryList);
      setTasks(taskList);
      setSelectedTaskId((currentTaskId) =>
        taskList.some((task) => task.id === currentTaskId)
          ? currentTaskId
          : taskList[0]?.id ?? null,
      );
      setSelectedRepositoryId(repository?.id ?? null);
      await loadRepositoryData(repository);
    } catch (loadError) {
      setError("GitHub workspace could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [
    githubClient,
    loadRepositoryData,
    selectedRepositoryId,
    taskClient,
    workspaceId,
  ]);

  useEffect(() => {
    void loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function startConnection() {
    if (isWorking) return;

    setIsWorking(true);
    setError(null);

    try {
      const result = await githubClient.startConnection(workspaceId);

      setNotice(
        result?.installationUrl
          ? "GitHub installation handoff is ready."
          : "GitHub connection flow started.",
      );
    } catch (connectionError) {
      setError("GitHub connection could not be started.");
    } finally {
      setIsWorking(false);
    }
  }

  async function selectRepository(repositoryId: string) {
    const repository =
      repositories.find((candidate) => candidate.id === repositoryId) ?? null;

    setSelectedRepositoryId(repositoryId);
    setIsLoading(true);
    setError(null);

    try {
      await loadRepositoryData(repository);
    } catch (loadError) {
      setError("Repository metadata could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  async function createIssueFromSelectedTask() {
    if (isWorking || !selectedRepository || !selectedTask) return;

    setIsWorking(true);
    setError(null);

    try {
      await githubClient.createIssueFromTask(selectedTask.id, {
        repositoryId: selectedRepository.id,
        title: selectedTask.title,
        workspaceId,
      });
      await loadRepositoryData(selectedRepository);
      setNotice(`Issue created from "${selectedTask.title}".`);
    } catch (actionError) {
      setError("GitHub issue could not be created from the selected task.");
    } finally {
      setIsWorking(false);
    }
  }

  async function linkIssueToSelectedTask(issue: GithubIssue) {
    if (isWorking || !selectedRepository || !selectedTask) return;

    setIsWorking(true);
    setError(null);

    try {
      await githubClient.linkIssueToTask(issue.id, selectedTask.id, {
        workspaceId,
      });
      await loadRepositoryData(selectedRepository);
      setNotice(`Issue #${issue.number} linked to "${selectedTask.title}".`);
    } catch (actionError) {
      setError("GitHub issue could not be linked to the selected task.");
    } finally {
      setIsWorking(false);
    }
  }

  async function linkPullRequestToSelectedTask(pullRequest: GithubPullRequest) {
    if (isWorking || !selectedRepository || !selectedTask) return;

    setIsWorking(true);
    setError(null);

    try {
      await githubClient.linkPullRequestToTask(pullRequest.id, selectedTask.id, {
        workspaceId,
      });
      await loadRepositoryData(selectedRepository);
      setNotice(
        `PR #${pullRequest.number} linked to "${selectedTask.title}".`,
      );
    } catch (actionError) {
      setError("Pull request could not be linked to the selected task.");
    } finally {
      setIsWorking(false);
    }
  }

  const openIssueCount = issues.filter((issue) => issue.state === "open").length;
  const reviewPrCount = pullRequests.filter((pullRequest) =>
    ["review_requested", "changes_requested"].includes(pullRequest.state),
  ).length;

  return (
    <main className="dashboard-shell github-shell">
      <aside className="sidebar" aria-label="PILO navigation">
        <div className="brand">
          <CurrentWorkspaceSwitcher />
        </div>
        <nav className="nav-list" aria-label="Workspace navigation">
          <Link className="nav-item" href={routes.dashboard}>
            <span>Dashboard</span>
          </Link>
          <Link className="nav-item" href={routes.tasks}>
            <span>Tasks</span>
          </Link>
          <Link className="nav-item active" href={`${routes.dashboard}/github`}>
            <span>GitHub</span>
            <b>{pullRequests.length + issues.length}</b>
          </Link>
          <Link className="nav-item" href={routes.reviews}>
            <span>Reviews</span>
            {reviewPrCount ? <b>{reviewPrCount}</b> : null}
          </Link>
        </nav>
      </aside>

      <section className="workspace github-workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">GITHUB</p>
            <h1>GitHub workspace</h1>
          </div>
          <div className="topbar-actions">
            <button
              className="github-connect-button"
              type="button"
              disabled={isWorking}
              onClick={() => void startConnection()}
            >
              Connect repo
            </button>
            <LogoutButton />
            <CurrentUserAvatar />
          </div>
        </header>

        <section className="github-content" aria-label="GitHub workspace">
          {error ? <div className="github-alert">{error}</div> : null}
          {notice ? <div className="github-notice">{notice}</div> : null}

          <section className="github-summary-grid" aria-label="GitHub summary">
            <div>
              <span>Repositories</span>
              <strong>{repositories.length}</strong>
            </div>
            <div>
              <span>Open issues</span>
              <strong>{openIssueCount}</strong>
            </div>
            <div>
              <span>Pull requests</span>
              <strong>{pullRequests.length}</strong>
            </div>
            <div>
              <span>Needs review</span>
              <strong>{reviewPrCount}</strong>
            </div>
          </section>

          <section className="github-main-grid">
            <aside className="github-repo-panel" aria-label="Repositories">
              <header>
                <h2>Repositories</h2>
                <span>{connections.length ? "Connected" : "Mock ready"}</span>
              </header>
              <div className="github-repo-list">
                {repositories.length ? (
                  repositories.map((repository) => (
                    <button
                      key={repository.id}
                      type="button"
                      className={
                        repository.id === selectedRepository?.id
                          ? "github-repo active"
                          : "github-repo"
                      }
                      onClick={() => void selectRepository(repository.id)}
                    >
                      <strong>
                        {repository.owner}/{repository.repoName}
                      </strong>
                      <span>{repository.defaultBranch ?? "dev"}</span>
                      <small>{formatSyncTime(repository.syncedAt)}</small>
                    </button>
                  ))
                ) : (
                  <p className="github-empty">No repositories.</p>
                )}
              </div>
            </aside>

            <section className="github-data-area">
              <header className="github-data-head">
                <div>
                  <span>{isLoading ? "Loading" : "Ready"}</span>
                  <h2>
                    {selectedRepository
                      ? `${selectedRepository.owner}/${selectedRepository.repoName}`
                      : "No repository selected"}
                  </h2>
                </div>
                {selectedRepository ? (
                  <a href={selectedRepository.url} rel="noreferrer" target="_blank">
                    Open in GitHub
                  </a>
                ) : null}
              </header>

              <div className="github-task-linkbar">
                <label>
                  <span>Selected task</span>
                  <select
                    value={selectedTask?.id ?? ""}
                    onChange={(event) => setSelectedTaskId(event.target.value)}
                    disabled={isWorking || !tasks.length}
                  >
                    {tasks.length ? (
                      tasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))
                    ) : (
                      <option value="">No tasks</option>
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={isWorking || !selectedRepository || !selectedTask}
                  onClick={() => void createIssueFromSelectedTask()}
                >
                  Create issue from task
                </button>
              </div>

              <div className="github-data-grid">
                <section className="github-panel">
                  <header>
                    <h3>Issues</h3>
                    <span>{issues.length}</span>
                  </header>
                  <div className="github-item-list">
                    {issues.length ? (
                      issues.map((issue) => (
                        <article className="github-item" key={issue.id}>
                          <div>
                            <span>#{issue.number} {formatLabel(issue.state)}</span>
                            <strong>{issue.title}</strong>
                            <small>
                              {issue.labels?.length
                                ? issue.labels.join(", ")
                                : "No labels"}
                            </small>
                          </div>
                          <div className="github-item-actions">
                            <a href={issue.url} rel="noreferrer" target="_blank">
                              GitHub
                            </a>
                            {issue.linkedTaskId ? (
                              <Link href={routes.tasks}>Task</Link>
                            ) : (
                              <button
                                type="button"
                                disabled={isWorking || !selectedTask}
                                onClick={() => void linkIssueToSelectedTask(issue)}
                              >
                                Link task
                              </button>
                            )}
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="github-empty">No issues.</p>
                    )}
                  </div>
                </section>

                <section className="github-panel">
                  <header>
                    <h3>Pull requests</h3>
                    <span>{pullRequests.length}</span>
                  </header>
                  <div className="github-item-list">
                    {pullRequests.length ? (
                      pullRequests.map((pullRequest) => (
                        <article className="github-item" key={pullRequest.id}>
                          <div>
                            <span>
                              #{pullRequest.number}{" "}
                              {formatLabel(pullRequest.state)}
                            </span>
                            <strong>{pullRequest.title}</strong>
                            <small>
                              {pullRequest.branch ?? "feature"} to{" "}
                              {pullRequest.baseBranch ?? "dev"} /{" "}
                              {pullRequest.changedFilesCount ?? 0} files
                            </small>
                          </div>
                          <div className="github-item-actions">
                            <a
                              href={pullRequest.url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              GitHub
                            </a>
                            <button
                              type="button"
                              disabled={
                                isWorking ||
                                !selectedTask ||
                                Boolean(
                                  pullRequest.linkedTaskIds?.includes(
                                    selectedTask.id,
                                  ),
                                )
                              }
                              onClick={() =>
                                void linkPullRequestToSelectedTask(pullRequest)
                              }
                            >
                              {selectedTask &&
                              pullRequest.linkedTaskIds?.includes(selectedTask.id)
                                ? "Task linked"
                                : "Link task"}
                            </button>
                            <Link href={routes.reviews}>Review</Link>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="github-empty">No pull requests.</p>
                    )}
                  </div>
                </section>
              </div>
            </section>
          </section>
        </section>
      </section>
    </main>
  );
}
