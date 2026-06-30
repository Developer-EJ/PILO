"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CurrentUserAvatar } from "../auth/CurrentUserAvatar";
import { LogoutButton } from "../auth/LogoutButton";
import { createNotificationClient } from "../../lib/notification/notificationClient.mjs";
import {
  createWorkspaceDashboardClient,
  resolveWorkspaceDashboardClientMode,
} from "../../lib/workspace/dashboardClient.mjs";
import {
  buildWorkspaceFeatureRoutes,
  buildWorkspaceFeatureTabs,
  extractWorkspaceIdFromPathname,
  readStoredWorkspaceId,
  resolveCurrentWorkspaceSelection,
  workspaceDashboardHref,
  writeStoredWorkspaceId,
} from "../../lib/workspace/currentWorkspace.mjs";
import {
  createWorkspaceClient,
} from "../../lib/workspace/workspaceClient.mjs";
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

type WorkspaceNotification = {
  id: string;
  workspaceId: string;
  recipientUserId: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  relatedObject: {
    type: string;
    id: string;
  } | null;
  createdAt: string;
};

type DashboardRecord = {
  source?: string;
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

type NotificationState =
  | { status: "loading"; notifications: WorkspaceNotification[] }
  | { status: "ready"; notifications: WorkspaceNotification[] }
  | { status: "error"; notifications: WorkspaceNotification[] };

type WorkspaceSelectionState =
  | { status: "loading"; workspaceId: null; error: null }
  | { status: "ready"; workspaceId: string; error: null }
  | { status: "empty"; workspaceId: null; error: null }
  | { status: "error"; workspaceId: null; error: string };

type WorkspaceCreateState =
  | { status: "idle"; error: null }
  | { status: "creating"; error: null }
  | { status: "error"; error: string };

const initialState: DashboardState = {
  status: "loading",
  dashboard: null,
  warnings: [],
};

const initialNotificationState: NotificationState = {
  status: "loading",
  notifications: [],
};

const initialWorkspaceSelectionState: WorkspaceSelectionState = {
  status: "loading",
  workspaceId: null,
  error: null,
};

const initialWorkspaceCreateState: WorkspaceCreateState = {
  status: "idle",
  error: null,
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
  return task.assignee?.name ?? task.priority ?? "작업";
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

function formatAgentAction(action: DashboardAgentAction) {
  const title = action.payload?.title;

  if (typeof title === "string" && title.trim()) {
    return `${title} 검토 승인을 기다리고 있습니다.`;
  }

  return `${action.type} 검토 승인을 기다리고 있습니다.`;
}

function formatNotificationType(type: string) {
  const labels: Record<string, string> = {
    agent_approval_required: "에이전트 승인 필요",
    github_sync_failed: "GitHub 동기화 실패",
    mention: "멘션",
    report_created: "리포트 생성",
    task_assigned: "태스크 할당",
  };

  return labels[type] ?? type.replace(/_/g, " ");
}

function toneForNotification(notification: WorkspaceNotification) {
  if (notification.type === "agent_approval_required") return "warning";
  if (notification.type === "github_sync_failed") return "danger";
  if (notification.type === "report_created") return "success";

  return "primary";
}

function notificationHref(
  notification: WorkspaceNotification,
  routes: ReturnType<typeof buildWorkspaceRoutes>,
) {
  const relatedType = notification.relatedObject?.type;

  if (relatedType === "task") return routes.tasks;
  if (relatedType === "pull_request") return routes.reviews;
  if (relatedType === "agent_action") return routes.agent;
  if (relatedType === "meeting_report") return routes.meetings;
  if (relatedType === "github_connection") return routes.github;

  return routes.dashboard;
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
        label: "진행 중 태스크",
        value: String(inProgressTasks.length),
        icon: "T",
        tone: "primary",
        href: routes.tasks,
      },
      {
        label: "리뷰 대기 PR",
        value: String(reviewPrs.length),
        icon: "R",
        tone: "warning",
        href: routes.reviews,
      },
      {
        label: "이번 주 마감",
        value: String(countDueThisWeek(dashboard.tasks)),
        icon: "D",
        tone: "success",
        href: routes.tasks,
      },
      {
        label: "막힌 작업",
        value: String(blockedTasks + delayedTasks),
        icon: "!",
        tone: "danger",
        href: routes.agent,
      },
    ],
    featureLinks: [
      {
        label: "캔버스",
        value: String(canvasCount),
        meta: "연결 카드",
        icon: "C",
        tone: "primary",
        href: routes.canvas,
      },
      {
        label: "태스크",
        value: String(dashboard.tasks.length),
        meta: "작업 보드",
        icon: "T",
        tone: "danger",
        href: routes.tasks,
      },
      {
        label: "GitHub",
        value: String(githubCount),
        meta: "이슈 + PR",
        icon: "G",
        tone: "success",
        href: routes.github,
      },
      {
        label: "회의",
        value: String(dashboard.meetingReports.length),
        meta: "리포트",
        icon: "M",
        tone: "warning",
        href: routes.meetings,
      },
      {
        label: "리뷰",
        value: String(reviewPrs.length),
        meta: "리뷰 대기",
        icon: "R",
        tone: "warning",
        href: routes.reviews,
      },
      {
        label: "에이전트",
        value: String(dashboard.agentActions.length),
        meta: "승인 액션",
        icon: "A",
        tone: "primary",
        href: routes.agent,
      },
      {
        label: "프로젝트 설정",
        value: "시작",
        meta: "계획 초안",
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
      cta: action.requiresConfirmation ? "승인 필요" : "자세히 보기",
    })),
    decisions: visibleMeetings.map((meeting) => ({
      id: meeting.id,
      text: `${meeting.title}: 결정 ${meeting.decisionCount}개, 액션 ${meeting.actionItemCount}개, 리스크 ${meeting.riskCount}개`,
    })),
  };
}

function resolveRouteWorkspaceId(
  pathname: string,
  routeWorkspaceId?: string,
) {
  return routeWorkspaceId ?? extractWorkspaceIdFromPathname(pathname);
}

function isFirstRunRuntimeDashboard(
  dashboard: DashboardRecord,
  dashboardMode: string,
) {
  if (dashboardMode !== "api" || dashboard.source === "fixture") {
    return false;
  }

  return (
    dashboard.tasks.length === 0 &&
    dashboard.pullRequests.length === 0 &&
    dashboard.agentActions.length === 0 &&
    dashboard.meetingReports.length === 0 &&
    (dashboard.githubIssues?.length ?? 0) === 0 &&
    (dashboard.prAnalyses?.length ?? 0) === 0 &&
    (dashboard.canvasEntities?.length ?? 0) === 0
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

function WorkspaceCreatePanel({
  createState,
  onSubmit,
}: {
  createState: WorkspaceCreateState;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="workspace-create-panel">
      <form className="workspace-create-form" onSubmit={onSubmit}>
        <label>
          <span>워크스페이스 이름</span>
          <input
            name="name"
            placeholder="PILO MVP"
            required
            autoComplete="off"
          />
        </label>
        <label>
          <span>프로젝트 설명</span>
          <textarea
            name="description"
            placeholder="어떤 프로젝트를 만들고 있나요?"
          />
        </label>
        <button
          disabled={createState.status === "creating"}
          type="submit"
        >
          워크스페이스 생성
        </button>
        {createState.status === "error" ? (
          <p>{createState.error}</p>
        ) : null}
      </form>
    </section>
  );
}

function ProjectSetupLaunch({ href }: { href: string }) {
  return (
    <section className="project-setup-launch">
      <Link href={href}>프로젝트 설정 시작</Link>
    </section>
  );
}

export function WorkspaceDashboard({
  workspaceId: routeWorkspaceId,
}: {
  workspaceId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const routeSelectedWorkspaceId = useMemo(
    () => resolveRouteWorkspaceId(pathname, routeWorkspaceId),
    [pathname, routeWorkspaceId],
  );
  const [workspaceState, setWorkspaceState] =
    useState<WorkspaceSelectionState>(
      routeSelectedWorkspaceId
        ? {
            status: "ready",
            workspaceId: routeSelectedWorkspaceId,
            error: null,
          }
        : initialWorkspaceSelectionState,
    );
  const workspaceId = routeSelectedWorkspaceId ?? workspaceState.workspaceId;
  const workspaceStatus = routeSelectedWorkspaceId
    ? "ready"
    : workspaceState.status;
  const workspaceError = routeSelectedWorkspaceId ? null : workspaceState.error;
  const [createState, setCreateState] = useState<WorkspaceCreateState>(
    initialWorkspaceCreateState,
  );
  const [state, setState] = useState<DashboardState>(initialState);
  const [notificationState, setNotificationState] = useState<NotificationState>(
    initialNotificationState,
  );
  const [notificationActionIdInFlight, setNotificationActionIdInFlight] =
    useState<string | null>(null);
  const routes = useMemo(
    () => (workspaceId ? buildWorkspaceRoutes(workspaceId) : null),
    [workspaceId],
  );
  const dashboardMode = useMemo(
    () => resolveWorkspaceDashboardClientMode(),
    [],
  );
  const notificationClient = useMemo(() => createNotificationClient(), []);

  useEffect(() => {
    let cancelled = false;

    if (routeSelectedWorkspaceId) {
      writeStoredWorkspaceId(routeSelectedWorkspaceId);
      return () => {
        cancelled = true;
      };
    }

    async function selectWorkspace() {
      setWorkspaceState(initialWorkspaceSelectionState);

      const workspaceClient = createWorkspaceClient();
      const workspaces = await workspaceClient.listWorkspaces();
      const selection = resolveCurrentWorkspaceSelection({
        workspaces,
        storedWorkspaceId: readStoredWorkspaceId(),
      });

      if (cancelled) {
        return;
      }

      if (selection.status === "empty" || !selection.workspace) {
        setWorkspaceState({
          status: "empty",
          workspaceId: null,
          error: null,
        });
        return;
      }

      if (selection.shouldPersist) {
        writeStoredWorkspaceId(selection.workspace.id);
      }

      setWorkspaceState({
        status: "ready",
        workspaceId: selection.workspace.id,
        error: null,
      });

      if (selection.shouldReplaceRoute) {
        router.replace(workspaceDashboardHref(selection.workspace.id));
      }
    }

    selectWorkspace().catch(() => {
      if (!cancelled) {
        setWorkspaceState({
          status: "error",
          workspaceId: null,
          error: "워크스페이스 목록을 불러오지 못했습니다.",
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [routeSelectedWorkspaceId, router]);

  useEffect(() => {
    let cancelled = false;

    if (!workspaceId) {
      return () => {
        cancelled = true;
      };
    }

    async function loadDashboard() {
      setState(initialState);

      const dashboardClient = createWorkspaceDashboardClient();
      const result = await dashboardClient.getDashboard(workspaceId);

      if (!cancelled) {
        const warnings = [...result.warnings];

        if (dashboardMode === "api" && result.dashboard?.source === "fixture") {
          warnings.push("dashboard_fixture_source");
        }

        setState({
          status: "ready",
          dashboard: result.dashboard as unknown as DashboardRecord,
          warnings,
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
  }, [dashboardMode, workspaceId]);

  useEffect(() => {
    let cancelled = false;

    if (!workspaceId) {
      return () => {
        cancelled = true;
      };
    }

    async function loadNotifications() {
      setNotificationState(initialNotificationState);

      const notifications = (await notificationClient.listNotifications(
        workspaceId,
      )) as WorkspaceNotification[];

      if (!cancelled) {
        setNotificationState({
          status: "ready",
          notifications,
        });
      }
    }

    loadNotifications().catch(() => {
      if (!cancelled) {
        setNotificationState({
          status: "error",
          notifications: [],
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [notificationClient, workspaceId]);

  const viewModel = state.dashboard && workspaceId
    ? buildDashboardViewModel(state.dashboard, workspaceId)
    : null;
  const navItems: DashboardNavItem[] =
    viewModel?.navItems ??
    (workspaceId ? buildDashboardNavItems(null, workspaceId) : []);
  const unreadNotificationCount = notificationState.notifications.filter(
    (notification) => !notification.readAt,
  ).length;
  const shouldShowProjectSetup =
    state.status === "ready" &&
    state.dashboard &&
    viewModel &&
    isFirstRunRuntimeDashboard(state.dashboard, dashboardMode);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    if (!name) {
      return;
    }

    setCreateState({ status: "creating", error: null });

    try {
      const workspaceClient = createWorkspaceClient();
      const workspace = await workspaceClient.createWorkspace({
        name,
        description,
        type: "side_project",
      });

      writeStoredWorkspaceId(workspace.id);
      setWorkspaceState({
        status: "ready",
        workspaceId: workspace.id,
        error: null,
      });
      setCreateState(initialWorkspaceCreateState);
      router.replace(workspaceDashboardHref(workspace.id));
    } catch (error) {
      setCreateState({
        status: "error",
        error: "워크스페이스를 생성하지 못했습니다.",
      });
    }
  }

  async function markNotificationRead(notification: WorkspaceNotification) {
    if (!workspaceId || notification.readAt || notificationActionIdInFlight) {
      return;
    }

    setNotificationActionIdInFlight(notification.id);

    try {
      const updatedNotification =
        (await notificationClient.markNotificationRead(notification.id, {
          workspaceId,
        })) as WorkspaceNotification;

      setNotificationState((current) => ({
        status: current.status === "error" ? "ready" : current.status,
        notifications: current.notifications.map((item) =>
          item.id === updatedNotification.id ? updatedNotification : item,
        ),
      }));
    } finally {
      setNotificationActionIdInFlight(null);
    }
  }

  async function markAllNotificationsRead() {
    if (!workspaceId || !unreadNotificationCount || notificationActionIdInFlight) {
      return;
    }

    setNotificationActionIdInFlight("all");

    try {
      const result = (await notificationClient.markWorkspaceNotificationsRead(
        workspaceId,
      )) as { notifications: WorkspaceNotification[] };

      setNotificationState({
        status: "ready",
        notifications: result.notifications,
      });
    } finally {
      setNotificationActionIdInFlight(null);
    }
  }

  return (
    <main className="dashboard-shell">
      <WorkspaceSidebar items={navItems} />

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">대시보드</p>
            <h1>PILO 대시보드</h1>
          </div>
          <div className="topbar-actions">
            <Link className="meeting-chip" href="#workspace-notifications">
              알림 <code>{unreadNotificationCount}</code>
            </Link>
            <Link className="meeting-chip" href={routes?.meetings ?? "#"}>
              <span className="live-dot" />
              회의{" "}
              <code>{state.dashboard?.meetingReports.length ?? 0}</code>
            </Link>
            <LogoutButton />
            <CurrentUserAvatar />
          </div>
        </header>

        <section
          className="dashboard-content"
          aria-label="PILO 대시보드 레이아웃"
        >
          {workspaceStatus === "loading" ? (
            <DashboardStatusPanel
              title="워크스페이스 불러오는 중"
              description="워크스페이스 목록을 준비하고 있습니다."
            />
          ) : null}

          {workspaceStatus === "empty" ? (
            <WorkspaceCreatePanel
              createState={createState}
              onSubmit={createWorkspace}
            />
          ) : null}

          {workspaceStatus === "error" ? (
            <DashboardStatusPanel
              title="워크스페이스를 불러오지 못했습니다"
              description={
                workspaceError ?? "워크스페이스 목록을 불러오지 못했습니다."
              }
            />
          ) : null}

          {workspaceStatus === "ready" && state.status === "loading" ? (
            <DashboardStatusPanel
              title="대시보드 불러오는 중"
              description="워크스페이스 요약 데이터를 준비하고 있습니다."
            />
          ) : null}

          {workspaceStatus === "ready" && state.status === "error" ? (
            <DashboardStatusPanel
              title="대시보드를 불러오지 못했습니다"
              description="app-server 연결을 확인하거나 워크스페이스 화면을 다시 시도해 주세요."
            />
          ) : null}

          {shouldShowProjectSetup && viewModel ? (
            <ProjectSetupLaunch href={viewModel.routes.planning} />
          ) : null}

          {state.status === "ready" && viewModel && !shouldShowProjectSetup ? (
            <>
              {state.warnings.length ? (
                <div className="dashboard-notice">
                  일부 대시보드 영역은 fallback 데이터를 사용 중입니다.
                </div>
              ) : null}

              <div className="stats-grid">
                {viewModel.stats.map((stat) => (
                  <Link className="stat-card" href={stat.href} key={stat.label}>
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
                aria-label="워크스페이스 기능 바로가기"
              >
                {viewModel.featureLinks.map((feature) => (
                  <Link
                    className="dashboard-feature-link"
                    href={feature.href}
                    key={feature.label}
                  >
                    <div>
                      <span>{feature.label}</span>
                      <i className={`tone-${feature.tone}`}>{feature.icon}</i>
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
                      <h2>오늘 할 일</h2>
                      <Link
                        className="panel-action"
                        href={viewModel.routes.tasks}
                      >
                        태스크 열기
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
                        <EmptyRow text="아직 표시할 태스크가 없습니다." />
                      )}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="panel-head">
                      <h2>리뷰 대기 PR</h2>
                      <Link
                        className="panel-action"
                        href={viewModel.routes.github}
                      >
                        GitHub 열기
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
                                  #{pr.number} · {pr.authorLogin ?? "알 수 없음"}
                                </small>
                              </div>
                              <b className={`pill tone-${tone}`}>{pr.state}</b>
                            </Link>
                          );
                        })
                      ) : (
                        <EmptyRow text="리뷰를 기다리는 PR이 없습니다." />
                      )}
                    </div>
                  </section>
                </div>

                <div className="right-column">
                  <section
                    className="panel notification-panel"
                    id="workspace-notifications"
                  >
                    <div className="panel-head">
                      <h2>알림</h2>
                      <button
                        className="panel-action notification-read-all-button"
                        disabled={
                          !unreadNotificationCount ||
                          notificationActionIdInFlight === "all"
                        }
                        onClick={() => void markAllNotificationsRead()}
                        type="button"
                      >
                        모두 읽음
                      </button>
                    </div>
                    <div className="notification-list">
                      {notificationState.status === "loading" ? (
                        <EmptyRow text="알림을 불러오는 중입니다." />
                      ) : null}

                      {notificationState.status === "error" ? (
                        <EmptyRow text="알림을 불러오지 못했습니다." />
                      ) : null}

                      {notificationState.status === "ready" &&
                      notificationState.notifications.length
                        ? notificationState.notifications.map(
                            (notification) => {
                              const tone = toneForNotification(notification);

                              return (
                                <article
                                  className={
                                    notification.readAt
                                      ? "notification-row is-read"
                                      : "notification-row"
                                  }
                                  key={notification.id}
                                >
                                  <Link
                                    className="notification-copy"
                                    href={notificationHref(
                                      notification,
                                      viewModel.routes,
                                    )}
                                  >
                                    <i className={`status-dot tone-${tone}`} />
                                    <span>
                                      <small>
                                        {formatNotificationType(
                                          notification.type,
                                        )}
                                      </small>
                                      <strong>{notification.title}</strong>
                                      <p>{notification.body}</p>
                                    </span>
                                  </Link>
                                  <button
                                    aria-label={`${notification.title} 알림 읽음 처리`}
                                    disabled={
                                      Boolean(notification.readAt) ||
                                      notificationActionIdInFlight ===
                                        notification.id
                                    }
                                    onClick={() =>
                                      void markNotificationRead(notification)
                                    }
                                    type="button"
                                  >
                                    {notification.readAt ? "읽음" : "읽음 처리"}
                                  </button>
                                </article>
                              );
                            },
                          )
                        : null}

                      {notificationState.status === "ready" &&
                      !notificationState.notifications.length ? (
                        <EmptyRow text="아직 알림이 없습니다." />
                      ) : null}
                    </div>
                  </section>

                  <section className="agent-panel">
                    <div className="agent-title">
                      <span>AI</span>
                      <h2>에이전트 제안</h2>
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
                      <EmptyRow text="대기 중인 에이전트 제안이 없습니다." />
                    )}
                  </section>

                  <section className="panel decision-panel">
                    <div className="panel-head">
                      <h2>최근 회의 결정</h2>
                      <Link
                        className="panel-action"
                        href={viewModel.routes.meetings}
                      >
                        회의 열기
                      </Link>
                    </div>
                    <div className="decision-list">
                      {viewModel.decisions.length ? (
                        viewModel.decisions.map((decision) => (
                          <Link
                            href={viewModel.routes.meetings}
                            key={decision.id}
                          >
                            <span>결정</span>
                            {decision.text}
                          </Link>
                        ))
                      ) : (
                        <EmptyRow text="아직 회의 리포트가 없습니다." />
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
