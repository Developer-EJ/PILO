"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CurrentUserAvatar } from "../auth/CurrentUserAvatar";
import { LogoutButton } from "../auth/LogoutButton";
import { createWorkspaceDashboardClient } from "../../lib/workspace/dashboardClient.mjs";
import {
  extractWorkspaceIdFromPathname,
  readStoredWorkspaceId,
  resolveCurrentWorkspaceSelection,
  workspaceAgentHref,
  workspaceCanvasHref,
  workspaceDashboardHref,
  workspaceGithubHref,
  workspaceMeetingsHref,
  workspaceReviewsHref,
  workspaceTasksHref,
} from "../../lib/workspace/currentWorkspace.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";
import { CurrentWorkspaceSwitcher } from "./CurrentWorkspaceSwitcher";

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
};

type DashboardNavItem = {
  label: string;
  active?: boolean;
  badge?: string;
  href?: string;
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
  return {
    dashboard: workspaceDashboardHref(workspaceId),
    canvas: workspaceCanvasHref(workspaceId),
    tasks: workspaceTasksHref(workspaceId),
    github: workspaceGithubHref(workspaceId),
    meetings: workspaceMeetingsHref(workspaceId),
    reviews: workspaceReviewsHref(workspaceId),
    agent: workspaceAgentHref(workspaceId),
  };
}

function buildDashboardNavItems(
  dashboard: DashboardRecord | null,
  workspaceId: string,
): DashboardNavItem[] {
  const routes = buildWorkspaceRoutes(workspaceId);
  const reviewCount =
    dashboard?.prAnalyses?.length ??
    dashboard?.pullRequests.filter((pr) =>
      ["review_requested", "changes_requested"].includes(pr.state),
    ).length ??
    0;
  const githubCount =
    (dashboard?.githubIssues?.length ?? 0) + (dashboard?.pullRequests.length ?? 0);

  return [
    {
      label: "홈 / 대시보드",
      active: true,
      href: routes.dashboard,
    },
    {
      label: "Canvas",
      href: routes.canvas,
    },
    {
      label: "Tasks",
      badge: dashboard ? String(dashboard.tasks.length) : undefined,
      href: routes.tasks,
    },
    {
      label: "GitHub",
      badge: dashboard && githubCount ? String(githubCount) : undefined,
      href: routes.github,
    },
    {
      label: "Meetings / Voice / Reports",
      badge: dashboard?.meetingReports.length
        ? String(dashboard.meetingReports.length)
        : undefined,
      href: routes.meetings,
    },
    {
      label: "Reviews",
      badge: dashboard && reviewCount ? String(reviewCount) : undefined,
      href: routes.reviews,
    },
    {
      label: "Agent / Planning",
      badge: dashboard?.agentActions.length
        ? String(dashboard.agentActions.length)
        : undefined,
      href: routes.agent,
    },
  ];
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
  if (task.isDelayed) return "지연";
  if (!task.dueDate) return "-";

  const today = new Date();
  const dueDate = new Date(`${task.dueDate}T00:00:00`);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.ceil(
    (dueDate.getTime() - new Date(today.toDateString()).getTime()) / dayMs,
  );

  if (diffDays <= 0) return "오늘";
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

  return {
    stats: [
      {
        label: "진행 중 Task",
        value: String(inProgressTasks.length),
        icon: "⚡",
        tone: "primary",
        href: routes.tasks,
      },
      {
        label: "리뷰 대기 PR",
        value: String(reviewPrs.length),
        icon: "◆",
        tone: "warning",
        href: routes.reviews,
      },
      {
        label: "이번 주 마감",
        value: String(countDueThisWeek(dashboard.tasks)),
        icon: "●",
        tone: "success",
        href: routes.tasks,
      },
      {
        label: "막힌 작업",
        value: String(blockedTasks || delayedTasks),
        icon: "■",
        tone: "danger",
        href: routes.agent,
      },
    ],
    navItems: buildDashboardNavItems(dashboard, workspaceId),
    routes,
    todayTasks,
    reviewPrs: visiblePrs,
    agentSuggestions: visibleActions.map((action) => ({
      text:
        typeof action.payload?.title === "string"
          ? `${action.payload.title} 작업 제안이 확인을 기다리고 있어요.`
          : `${action.type} 제안이 확인을 기다리고 있어요.`,
      cta: action.requiresConfirmation ? "확인 필요" : "상세 보기",
    })),
    decisions: visibleMeetings.map((meeting) => ({
      id: meeting.id,
      text: `${meeting.title}: 결정 ${meeting.decisionCount}개, 액션 ${meeting.actionItemCount}개, 리스크 ${meeting.riskCount}개`,
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
      <aside className="sidebar" aria-label="PILO navigation preview">
        <div className="brand">
          <CurrentWorkspaceSwitcher />
        </div>
        <nav className="nav-list" aria-label="Dashboard only navigation">
          {navItems.map((item) => {
            const className = item.active ? "nav-item active" : "nav-item";
            const content = (
              <>
                <span>{item.label}</span>
                {item.badge ? <b>{item.badge}</b> : null}
              </>
            );

            return item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className={className}
                aria-current={item.active ? "page" : undefined}
              >
                {content}
              </Link>
            ) : (
              <div key={item.label} className={className} aria-disabled="true">
                {content}
              </div>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">DASHBOARD</p>
            <h1>홈 / 대시보드</h1>
          </div>
          <div className="topbar-actions">
            <Link className="meeting-chip" href={workspaceMeetingsHref(workspaceId)}>
              <span className="live-dot" />
              회의 중<code>03:18</code>
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
              title="대시보드를 불러오는 중"
              description="Workspace read model을 확인하고 있어요."
            />
          ) : null}

          {state.status === "error" ? (
            <DashboardStatusPanel
              title="대시보드를 불러오지 못했어요"
              description="잠시 후 다시 시도하거나 app-server 연결 상태를 확인해 주세요."
            />
          ) : null}

          {state.status === "ready" && viewModel ? (
            <>
              {state.warnings.length ? (
                <div className="dashboard-notice">
                  일부 read model이 비어 있어 가능한 데이터만 표시하고 있어요.
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

              <div className="content-grid">
                <div className="left-column">
                  <section className="panel">
                    <div className="panel-head">
                      <h2>오늘 해야 할 일</h2>
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
                        <EmptyRow text="표시할 Task가 아직 없어요." />
                      )}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="panel-head">
                      <h2>리뷰 대기 PR</h2>
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
                              <div className="pr-icon">◇</div>
                              <div>
                                <strong>{pr.title}</strong>
                                <small>
                                  #{pr.number} · {pr.authorLogin ?? "unknown"}
                                </small>
                              </div>
                              <b className={`pill tone-${tone}`}>{pr.state}</b>
                            </Link>
                          );
                        })
                      ) : (
                        <EmptyRow text="리뷰 대기 PR이 없어요." />
                      )}
                    </div>
                  </section>
                </div>

                <div className="right-column">
                  <section className="agent-panel">
                    <div className="agent-title">
                      <span>✦</span>
                      <h2>Agent 다음 제안</h2>
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
                      <EmptyRow text="대기 중인 Agent 제안이 없어요." />
                    )}
                  </section>

                  <section className="panel decision-panel">
                    <div className="panel-head">
                      <h2>최근 회의 결정</h2>
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
                            <span>✓</span>
                            {decision.text}
                          </Link>
                        ))
                      ) : (
                        <EmptyRow text="최근 회의록 요약이 없어요." />
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
