"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CurrentUserAvatar } from "../auth/CurrentUserAvatar";
import { LogoutButton } from "../auth/LogoutButton";
import { createWorkspaceDashboardClient } from "../../lib/workspace/dashboardClient.mjs";
import {
  buildWorkspaceFeatureRoutes,
  buildWorkspaceFeatureTabs,
  extractWorkspaceIdFromPathname,
  readStoredWorkspaceId,
  resolveCurrentWorkspaceSelection,
} from "../../lib/workspace/currentWorkspace.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

type DashboardTask = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  assignee?: { name?: string | null } | null;
  dueDate?: string | null;
  isDelayed?: boolean;
};

type DashboardPullRequest = {
  id: string;
  number: number;
  title: string;
  authorLogin?: string | null;
  state: string;
};

type DashboardAgentAction = {
  id?: string;
  type: string;
  requiresConfirmation?: boolean;
  payload?: {
    title?: string;
  };
};

type DashboardMeetingReport = {
  id: string;
  title: string;
  decisionCount: number;
  actionItemCount: number;
  riskCount: number;
};

type DashboardRecord = {
  tasks: DashboardTask[];
  progress: {
    blockedTasks?: number;
    delayedTasks?: number;
  } | null;
  githubIssues?: unknown[];
  pullRequests: DashboardPullRequest[];
  prAnalyses?: unknown[];
  agentActions: DashboardAgentAction[];
  meetingReports: DashboardMeetingReport[];
  canvasEntities?: unknown[];
};

type DashboardNavItem = {
  label: string;
  active?: boolean;
  badge?: string;
  href: string;
};

type DashboardState =
  | { status: "loading"; dashboard: null; warnings: string[] }
  | { status: "ready"; dashboard: DashboardRecord; warnings: string[] }
  | { status: "error"; dashboard: null; warnings: string[] };

const initialState: DashboardState = {
  status: "loading",
  dashboard: null,
  warnings: [],
};

function buildWorkspaceRoutes(workspaceId: string) {
  return buildWorkspaceFeatureRoutes(workspaceId);
}

function buildDashboardNavItems(
  dashboard: DashboardRecord | null,
  workspaceId: string,
): DashboardNavItem[] {
  const reviewCount = dashboard
    ? (dashboard.prAnalyses?.length ??
        dashboard.pullRequests.filter((pr) =>
          ["review_requested", "changes_requested"].includes(pr.state),
        ).length)
    : 0;
  const githubCount = dashboard
    ? (dashboard.githubIssues?.length ?? 0) + dashboard.pullRequests.length
    : 0;

  return buildWorkspaceFeatureTabs(workspaceId, {
    active: "dashboard",
    badges: {
      tasks: dashboard ? dashboard.tasks.length : undefined,
      github: githubCount || undefined,
      meetings: dashboard?.meetingReports.length || undefined,
      reviews: reviewCount || undefined,
      agent: dashboard?.agentActions.length || undefined,
    },
  });
}

function toneForTask(task: { isDelayed?: boolean; priority?: string }) {
  if (task.isDelayed) return "danger";
  if (task.priority === "high" || task.priority === "urgent") {
    return "warning";
  }

  return "primary";
}

function toneForPullRequest(pr: { state?: string }) {
  if (pr.state === "changes_requested") return "danger";
  if (pr.state === "review_requested") return "warning";

  return "success";
}

function formatTaskTag(task: {
  assignee?: { name?: string | null } | null;
  priority?: string;
}) {
  return task.assignee?.name ?? task.priority ?? "Task";
}

function formatDue(task: { dueDate?: string | null; isDelayed?: boolean }) {
  if (task.isDelayed) return "Overdue";
  if (!task.dueDate) return "-";

  const today = new Date();
  const dueDate = new Date(`${task.dueDate}T00:00:00`);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.ceil(
    (dueDate.getTime() - new Date(today.toDateString()).getTime()) / dayMs,
  );

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "D-1";

  return `D-${diffDays}`;
}

function countDueThisWeek(tasks: DashboardRecord["tasks"]) {
  const today = new Date();
  const start = new Date(today.toDateString()).getTime();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  return tasks.filter((task) => {
    if (!task.dueDate) return false;

    const dueTime = new Date(`${task.dueDate}T00:00:00`).getTime();

    return dueTime >= start && dueTime <= start + weekMs;
  }).length;
}

function formatAgentAction(action: DashboardAgentAction) {
  const title = action.payload?.title;

  if (typeof title === "string" && title.trim()) {
    return `${title} is waiting for review.`;
  }

  return `${action.type} is waiting for review.`;
}

function buildDashboardViewModel(
  dashboard: DashboardRecord,
  workspaceId: string,
) {
  const routes = buildWorkspaceRoutes(workspaceId);
  const inProgressTasks = dashboard.tasks.filter(
    (task) => task.status === "in_progress",
  );
  const reviewPrs = dashboard.pullRequests.filter((pr) =>
    ["review_requested", "changes_requested"].includes(pr.state),
  );
  const blockedTasks =
    dashboard.progress?.blockedTasks ??
    dashboard.tasks.filter((task) => task.status === "blocked").length;
  const delayedTasks =
    dashboard.progress?.delayedTasks ??
    dashboard.tasks.filter((task) => task.isDelayed).length;
  const todayTasks = dashboard.tasks.slice(0, 3);
  const visiblePrs = reviewPrs.slice(0, 3);
  const visibleActions = dashboard.agentActions.slice(0, 2);
  const visibleMeetings = dashboard.meetingReports.slice(0, 3);
  const githubCount =
    (dashboard.githubIssues?.length ?? 0) + dashboard.pullRequests.length;
  const canvasCount = dashboard.canvasEntities?.length ?? 0;

  return {
    stats: [
      {
        label: "Active tasks",
        value: String(inProgressTasks.length),
        icon: "T",
        tone: "primary",
        href: routes.tasks,
      },
      {
        label: "Review PRs",
        value: String(reviewPrs.length),
        icon: "R",
        tone: "warning",
        href: routes.reviews,
      },
      {
        label: "Due this week",
        value: String(countDueThisWeek(dashboard.tasks)),
        icon: "D",
        tone: "success",
        href: routes.tasks,
      },
      {
        label: "Blocked work",
        value: String(blockedTasks + delayedTasks),
        icon: "!",
        tone: "danger",
        href: routes.agent,
      },
    ],
    featureLinks: [
      {
        label: "Canvas",
        value: String(canvasCount),
        meta: "linked cards",
        icon: "C",
        tone: "primary",
        href: routes.canvas,
      },
      {
        label: "Tasks",
        value: String(dashboard.tasks.length),
        meta: "task board",
        icon: "T",
        tone: "danger",
        href: routes.tasks,
      },
      {
        label: "GitHub",
        value: String(githubCount),
        meta: "issues + PRs",
        icon: "G",
        tone: "success",
        href: routes.github,
      },
      {
        label: "Meetings",
        value: String(dashboard.meetingReports.length),
        meta: "reports",
        icon: "M",
        tone: "warning",
        href: routes.meetings,
      },
      {
        label: "Reviews",
        value: String(reviewPrs.length),
        meta: "review queue",
        icon: "R",
        tone: "warning",
        href: routes.reviews,
      },
      {
        label: "Agent",
        value: String(dashboard.agentActions.length),
        meta: "actions",
        icon: "A",
        tone: "primary",
        href: routes.agent,
      },
      {
        label: "Planning",
        value: "Run",
        meta: "plan draft",
        icon: "P",
        tone: "success",
        href: routes.planning,
      },
    ],
    navItems: buildDashboardNavItems(dashboard, workspaceId),
    routes,
    todayTasks,
    reviewPrs: visiblePrs,
    agentSuggestions: visibleActions.map((action) => ({
      text: formatAgentAction(action),
      cta: action.requiresConfirmation ? "Needs approval" : "View details",
    })),
    decisions: visibleMeetings.map((meeting) => ({
      id: meeting.id,
      text: `${meeting.title}: ${meeting.decisionCount} decisions, ${meeting.actionItemCount} actions, ${meeting.riskCount} risks`,
    })),
  };
}

function resolveDashboardWorkspaceId(pathname: string) {
  const selection = resolveCurrentWorkspaceSelection({
    workspaces: mockWorkspaces,
    urlWorkspaceId: extractWorkspaceIdFromPathname(pathname),
    storedWorkspaceId: readStoredWorkspaceId(),
  });

  return (
    selection.workspace?.id ??
    selection.fallbackWorkspace?.id ??
    mockWorkspaces[0].id
  );
}

function DashboardStatusPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="dashboard-status-panel" aria-live="polite">
      <strong>{title}</strong>
      <p>{description}</p>
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="empty-row">{text}</p>;
}

export function WorkspaceDashboard() {
  const pathname = usePathname() ?? "/";
  const workspaceId = useMemo(
    () => resolveDashboardWorkspaceId(pathname),
    [pathname],
  );
  const [state, setState] = useState<DashboardState>(initialState);
  const routes = useMemo(() => buildWorkspaceRoutes(workspaceId), [workspaceId]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setState(initialState);

      const dashboardClient = createWorkspaceDashboardClient();
      const result = await dashboardClient.getDashboard(workspaceId);

      if (!cancelled) {
        setState({
          status: "ready",
          dashboard: result.dashboard as unknown as DashboardRecord,
          warnings: result.warnings,
        });
      }
    }

    loadDashboard().catch(() => {
      if (!cancelled) {
        setState({
          status: "error",
          dashboard: null,
          warnings: ["dashboard_load_failed"],
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const viewModel = state.dashboard
    ? buildDashboardViewModel(state.dashboard, workspaceId)
    : null;
  const navItems: DashboardNavItem[] =
    viewModel?.navItems ?? buildDashboardNavItems(null, workspaceId);

  return (
    <main className="dashboard-shell">
      <WorkspaceSidebar items={navItems} />

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">DASHBOARD</p>
            <h1>PILO Dashboard</h1>
          </div>
          <div className="topbar-actions">
            <Link className="meeting-chip" href={routes.meetings}>
              <span className="live-dot" />
              Meetings <code>{state.dashboard?.meetingReports.length ?? 0}</code>
            </Link>
            <LogoutButton />
            <CurrentUserAvatar />
          </div>
        </header>

        <section
          className="dashboard-content"
          aria-label="PILO dashboard layout"
        >
          {state.status === "loading" ? (
            <DashboardStatusPanel
              title="Loading dashboard"
              description="Workspace summary data is being prepared."
            />
          ) : null}

          {state.status === "error" ? (
            <DashboardStatusPanel
              title="Dashboard could not be loaded"
              description="Check the app-server connection or retry the workspace view."
            />
          ) : null}

          {state.status === "ready" && viewModel ? (
            <>
              {state.warnings.length ? (
                <div className="dashboard-notice">
                  Some dashboard sections are using fallback data.
                </div>
              ) : null}

              <div className="stats-grid">
                {viewModel.stats.map((stat) => (
                  <Link
                    className="stat-card"
                    href={stat.href}
                    key={stat.label}
                  >
                    <div>
                      <span>{stat.label}</span>
                      <i className={`tone-${stat.tone}`}>{stat.icon}</i>
                    </div>
                    <strong>{stat.value}</strong>
                  </Link>
                ))}
              </div>

              <section
                className="dashboard-feature-links"
                aria-label="Workspace feature shortcuts"
              >
                {viewModel.featureLinks.map((feature) => (
                  <Link
                    className="dashboard-feature-link"
                    href={feature.href}
                    key={feature.label}
                  >
                    <div>
                      <span>{feature.label}</span>
                      <i className={`tone-${feature.tone}`}>
                        {feature.icon}
                      </i>
                    </div>
                    <strong>{feature.value}</strong>
                    <small>{feature.meta}</small>
                  </Link>
                ))}
              </section>

              <div className="content-grid">
                <div className="left-column">
                  <section className="panel">
                    <div className="panel-head">
                      <h2>Today's work</h2>
                      <Link className="panel-action" href={viewModel.routes.tasks}>
                        Open Tasks
                      </Link>
                    </div>
                    <div className="list">
                      {viewModel.todayTasks.length ? (
                        viewModel.todayTasks.map((task) => {
                          const tone = toneForTask(task);

                          return (
                            <Link
                              className="task-row"
                              href={viewModel.routes.tasks}
                              key={task.id}
                            >
                              <i className={`status-dot tone-${tone}`} />
                              <strong>{task.title}</strong>
                              <span className="tag">{formatTaskTag(task)}</span>
                              <b className={`due tone-${tone}`}>
                                {formatDue(task)}
                              </b>
                            </Link>
                          );
                        })
                      ) : (
                        <EmptyRow text="No task items yet." />
                      )}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="panel-head">
                      <h2>PRs waiting for review</h2>
                      <Link className="panel-action" href={viewModel.routes.github}>
                        Open GitHub
                      </Link>
                    </div>
                    <div className="list">
                      {viewModel.reviewPrs.length ? (
                        viewModel.reviewPrs.map((pr) => {
                          const tone = toneForPullRequest(pr);

                          return (
                            <Link
                              className="pr-row"
                              href={viewModel.routes.reviews}
                              key={pr.id}
                            >
                              <div className="pr-icon">PR</div>
                              <div>
                                <strong>{pr.title}</strong>
                                <small>
                                  #{pr.number} by {pr.authorLogin ?? "unknown"}
                                </small>
                              </div>
                              <b className={`pill tone-${tone}`}>{pr.state}</b>
                            </Link>
                          );
                        })
                      ) : (
                        <EmptyRow text="No pull requests are waiting." />
                      )}
                    </div>
                  </section>
                </div>

                <div className="right-column">
                  <section className="agent-panel">
                    <div className="agent-title">
                      <span>AI</span>
                      <h2>Agent suggestions</h2>
                    </div>
                    {viewModel.agentSuggestions.length ? (
                      viewModel.agentSuggestions.map((item) => (
                        <Link
                          className="agent-card"
                          href={viewModel.routes.agent}
                          key={item.text}
                        >
                          <p>{item.text}</p>
                          <span>{item.cta}</span>
                        </Link>
                      ))
                    ) : (
                      <EmptyRow text="No Agent suggestions are waiting." />
                    )}
                  </section>

                  <section className="panel decision-panel">
                    <div className="panel-head">
                      <h2>Recent meeting decisions</h2>
                      <Link className="panel-action" href={viewModel.routes.meetings}>
                        Open Meetings
                      </Link>
                    </div>
                    <div className="decision-list">
                      {viewModel.decisions.length ? (
                        viewModel.decisions.map((decision) => (
                          <Link
                            href={viewModel.routes.meetings}
                            key={decision.id}
                          >
                            <span>OK</span>
                            {decision.text}
                          </Link>
                        ))
                      ) : (
                        <EmptyRow text="No meeting reports yet." />
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}
