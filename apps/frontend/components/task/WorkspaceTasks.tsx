"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CurrentUserAvatar } from "../auth/CurrentUserAvatar";
import { LogoutButton } from "../auth/LogoutButton";
import { CurrentWorkspaceSwitcher } from "../workspace/CurrentWorkspaceSwitcher";
import { createTaskClient } from "../../lib/task/taskClient.mjs";
import {
  extractWorkspaceIdFromPathname,
  workspaceAgentHref,
  workspaceDashboardHref,
  workspaceGithubHref,
  workspaceMeetingsHref,
} from "../../lib/workspace/currentWorkspace.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";

type TaskStatus = "todo" | "in_progress" | "in_review" | "done" | "blocked";
type TaskPriority = "low" | "medium" | "high" | "urgent";

type TaskSummary = {
  id: string;
  workspaceId: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: {
    name?: string | null;
    memberId?: string | null;
  } | null;
  dueDate?: string | null;
  isDelayed?: boolean;
  linkedIssueCount?: number;
  linkedPrCount?: number;
  updatedAt?: string;
};

type TaskDraft = {
  id: string;
  title: string;
  description?: string | null;
  status: "draft" | "approved" | "rejected";
  priority?: TaskPriority;
  dueDate?: string | null;
  taskId?: string | null;
  updatedAt?: string;
};

type ProgressSummary = {
  totalTasks: number;
  doneTasks: number;
  blockedTasks: number;
  reviewTasks: number;
  delayedTasks: number;
  progressRate: number;
};

const taskStatuses: TaskStatus[] = [
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
];

const taskPriorities: TaskPriority[] = ["low", "medium", "high", "urgent"];

function resolveWorkspaceId(pathname: string) {
  return extractWorkspaceIdFromPathname(pathname) ?? mockWorkspaces[0].id;
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function nextStatus(status: TaskStatus): TaskStatus {
  if (status === "todo") return "in_progress";
  if (status === "in_progress") return "in_review";
  if (status === "in_review") return "done";
  if (status === "blocked") return "in_progress";

  return "done";
}

function dueLabel(task: TaskSummary) {
  if (task.isDelayed) return "Overdue";
  if (!task.dueDate) return "No due date";

  return task.dueDate;
}

export function WorkspaceTasks() {
  const pathname = usePathname() ?? "/";
  const workspaceId = useMemo(() => resolveWorkspaceId(pathname), [pathname]);
  const routes = useMemo(
    () => ({
      dashboard: workspaceDashboardHref(workspaceId),
      github: workspaceGithubHref(workspaceId),
      meetings: workspaceMeetingsHref(workspaceId),
      agent: workspaceAgentHref(workspaceId),
    }),
    [workspaceId],
  );
  const taskClient = useMemo(() => createTaskClient(), []);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [drafts, setDrafts] = useState<TaskDraft[]>([]);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [title, setTitle] = useState("Implement MVP task workflow");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("2026-07-05");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextTasks, nextDrafts, nextProgress] = await Promise.all([
        taskClient.listTasks(workspaceId),
        taskClient.listTaskDrafts(workspaceId),
        taskClient.getProgressSummary(workspaceId),
      ]);

      setTasks(nextTasks as TaskSummary[]);
      setDrafts(nextDrafts as TaskDraft[]);
      setProgress(nextProgress as ProgressSummary);
    } catch (loadError) {
      setError("Task workspace could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [taskClient, workspaceId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  async function runAction(action: () => Promise<void>, success: string) {
    if (isWorking) return;

    setIsWorking(true);
    setError(null);

    try {
      await action();
      setNotice(success);
    } catch (actionError) {
      setError("Task action could not be completed.");
    } finally {
      setIsWorking(false);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runAction(async () => {
      await taskClient.createTask(workspaceId, {
        title,
        priority,
        dueDate,
      });
      setTitle("Implement MVP task workflow");
      await loadWorkspace();
    }, "Task created.");
  }

  async function updateStatus(task: TaskSummary, status: TaskStatus) {
    await runAction(async () => {
      await taskClient.updateTaskStatus(task.id, status, { workspaceId });
      await loadWorkspace();
    }, `Task moved to ${formatLabel(status)}.`);
  }

  async function approveDraft(draft: TaskDraft) {
    await runAction(async () => {
      await taskClient.approveTaskDraft(draft.id, { workspaceId });
      await loadWorkspace();
    }, "Task draft approved.");
  }

  async function rejectDraft(draft: TaskDraft) {
    await runAction(async () => {
      await taskClient.rejectTaskDraft(draft.id, { workspaceId });
      await loadWorkspace();
    }, "Task draft rejected.");
  }

  const groupedTasks = taskStatuses.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status),
  }));
  const openDrafts = drafts.filter((draft) => draft.status === "draft");

  return (
    <main className="dashboard-shell tasks-shell">
      <aside className="sidebar" aria-label="PILO navigation">
        <div className="brand">
          <CurrentWorkspaceSwitcher />
        </div>
        <nav className="nav-list" aria-label="Workspace navigation">
          <Link className="nav-item" href={routes.dashboard}>
            <span>Dashboard</span>
          </Link>
          <Link className="nav-item active" href={`${routes.dashboard}/tasks`}>
            <span>Tasks</span>
            <b>{tasks.length}</b>
          </Link>
          <Link className="nav-item" href={routes.github}>
            <span>GitHub</span>
          </Link>
          <Link className="nav-item" href={routes.meetings}>
            <span>Meetings / Reports</span>
          </Link>
          <Link className="nav-item" href={routes.agent}>
            <span>Agent / Planning</span>
            {openDrafts.length ? <b>{openDrafts.length}</b> : null}
          </Link>
        </nav>
      </aside>

      <section className="workspace tasks-workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">TASKS</p>
            <h1>Task workspace</h1>
          </div>
          <div className="topbar-actions">
            <div className="meeting-chip">
              Drafts <code>{openDrafts.length}</code>
            </div>
            <LogoutButton />
            <CurrentUserAvatar />
          </div>
        </header>

        <section className="tasks-content" aria-label="Task workspace">
          {error ? <div className="tasks-alert">{error}</div> : null}
          {notice ? <div className="tasks-notice">{notice}</div> : null}

          <section className="tasks-command-panel">
            <header>
              <div>
                <h2>Create task</h2>
                <p>Manual tasks and approved drafts land in the same board.</p>
              </div>
              <span>{isLoading ? "Loading" : "Ready"}</span>
            </header>
            <form className="tasks-create-form" onSubmit={createTask}>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Task title"
              />
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
              >
                {taskPriorities.map((item) => (
                  <option key={item} value={item}>
                    {formatLabel(item)}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
              <button type="submit" disabled={isWorking}>
                Create
              </button>
            </form>
          </section>

          <section className="tasks-stats-grid" aria-label="Progress summary">
            <div>
              <span>Total</span>
              <strong>{progress?.totalTasks ?? tasks.length}</strong>
            </div>
            <div>
              <span>Done</span>
              <strong>{progress?.doneTasks ?? 0}</strong>
            </div>
            <div>
              <span>Blocked</span>
              <strong>{progress?.blockedTasks ?? 0}</strong>
            </div>
            <div>
              <span>Progress</span>
              <strong>{progress?.progressRate ?? 0}%</strong>
            </div>
          </section>

          <section className="tasks-board-grid" aria-label="Task board">
            {groupedTasks.map((group) => (
              <section className="tasks-column" key={group.status}>
                <header>
                  <h2>{formatLabel(group.status)}</h2>
                  <span>{group.tasks.length}</span>
                </header>
                <div className="tasks-card-list">
                  {group.tasks.length ? (
                    group.tasks.map((task) => (
                      <article className="tasks-card" key={task.id}>
                        <div className="tasks-card-head">
                          <span className={`tasks-priority tone-${task.priority}`}>
                            {formatLabel(task.priority)}
                          </span>
                          <b>{dueLabel(task)}</b>
                        </div>
                        <strong>{task.title}</strong>
                        <small>{task.assignee?.name ?? "Unassigned"}</small>
                        <div className="tasks-links-row">
                          <span>Issues {task.linkedIssueCount ?? 0}</span>
                          <span>PRs {task.linkedPrCount ?? 0}</span>
                        </div>
                        <div className="tasks-card-actions">
                          {task.status !== "done" ? (
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() => void updateStatus(task, nextStatus(task.status))}
                            >
                              Move to {formatLabel(nextStatus(task.status))}
                            </button>
                          ) : null}
                          {task.status !== "blocked" && task.status !== "done" ? (
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() => void updateStatus(task, "blocked")}
                            >
                              Block
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="tasks-empty">No tasks.</p>
                  )}
                </div>
              </section>
            ))}
          </section>

          <section className="tasks-drafts-panel" aria-label="Task drafts">
            <header>
              <div>
                <h2>Task drafts</h2>
                <p>Agent and Meeting outputs stay as drafts until approved.</p>
              </div>
              <span>{drafts.length}</span>
            </header>
            <div className="tasks-draft-list">
              {drafts.length ? (
                drafts.map((draft) => (
                  <article className="tasks-draft" key={draft.id}>
                    <div>
                      <span>{formatLabel(draft.status)}</span>
                      <strong>{draft.title}</strong>
                      <p>{draft.description ?? "No description."}</p>
                      <small>
                        {formatLabel(draft.priority ?? "medium")} /{" "}
                        {draft.dueDate ?? "No due date"}
                      </small>
                    </div>
                    <div className="tasks-draft-actions">
                      <button
                        type="button"
                        disabled={isWorking || draft.status !== "draft"}
                        onClick={() => void approveDraft(draft)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={isWorking || draft.status !== "draft"}
                        onClick={() => void rejectDraft(draft)}
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="tasks-empty">No task drafts.</p>
              )}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
