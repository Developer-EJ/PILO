"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  createWorkspaceDashboardClient,
  createWorkspaceDashboardFixture,
} from "../../lib/workspace/dashboardClient.mjs";
import {
  extractWorkspaceIdFromPathname,
  workspaceCanvasHref,
  workspaceDashboardHref,
} from "../../lib/workspace/currentWorkspace.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";

type WorkspaceDashboardData = ReturnType<typeof createWorkspaceDashboardFixture>;

type WorkspaceDashboardState =
  | { status: "loading"; dashboard: null; warnings: string[]; error: null }
  | {
      status: "ready";
      dashboard: WorkspaceDashboardData;
      warnings: string[];
      error: null;
    }
  | { status: "error"; dashboard: null; warnings: string[]; error: string };

type DashboardTask = {
  id: string;
  title: string;
  status?: string | null;
  priority?: string | null;
  assignee?: { name?: string | null } | null;
  dueDate?: string | null;
  isDelayed?: boolean | null;
};

type DashboardPullRequest = {
  id: string;
  number?: number | null;
  title: string;
  authorLogin?: string | null;
  state?: string | null;
};

type DashboardMeetingReport = {
  id: string;
  title?: string | null;
  summary?: string | null;
  decisionCount?: number | null;
  createdAt?: string | null;
};

type DashboardMember = {
  memberId?: string | null;
  userId?: string | null;
  name?: string | null;
  displayName?: string | null;
  email?: string | null;
  role?: string | null;
};

type DashboardStat = {
  label: string;
  value: string;
  tone: "primary" | "success" | "warning" | "danger";
  icon: string;
};

const initialDashboardState: WorkspaceDashboardState = {
  status: "loading",
  dashboard: null,
  warnings: [],
  error: null,
};

const taskStatusLabels: Record<string, string> = {
  todo: "할 일",
  in_progress: "진행 중",
  in_review: "검토 중",
  done: "완료",
  blocked: "막힘",
};

const prStateLabels: Record<string, string> = {
  open: "열림",
  review_requested: "리뷰 요청",
  approved: "승인",
  changes_requested: "수정 요청",
  merged: "머지됨",
  closed: "닫힘",
};

const roleLabels: Record<string, string> = {
  owner: "소유자",
  admin: "관리자",
  member: "멤버",
  viewer: "조회",
};

function resolveWorkspaceId(pathname: string) {
  return extractWorkspaceIdFromPathname(pathname) ?? mockWorkspaces[0].id;
}

function formatGeneratedAt(value: string | null | undefined) {
  if (!value) return "갱신 시간 없음";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "갱신 시간 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function createWorkspaceBriefItems(description: string | null | undefined) {
  if (!description) return [];

  return description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex < 0) {
        return {
          label: "메모",
          value: line,
        };
      }

      return {
        label: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
      };
    })
    .filter((item) => item.value);
}

function formatDueDate(value: string | null | undefined) {
  if (!value) return "마감일 없음";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "마감일 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function taskTone(task: DashboardTask): DashboardStat["tone"] {
  if (task.isDelayed || task.status === "blocked") return "danger";
  if (task.status === "done") return "success";
  if (task.priority === "high") return "warning";

  return "primary";
}

function buildStats(dashboard: WorkspaceDashboardData): DashboardStat[] {
  const progressRate = dashboard.progress?.progressRate ?? 0;
  const doneTasks = dashboard.progress?.doneTasks ?? 0;
  const blockedTasks = dashboard.progress?.blockedTasks ?? 0;

  return [
    {
      label: "전체 작업",
      value: String(dashboard.tasks.length),
      tone: "primary",
      icon: "T",
    },
    {
      label: "완료 작업",
      value: String(doneTasks),
      tone: "success",
      icon: "D",
    },
    {
      label: "위험 작업",
      value: String(blockedTasks + (dashboard.progress?.delayedTasks ?? 0)),
      tone: blockedTasks ? "danger" : "warning",
      icon: "!",
    },
    {
      label: "진행률",
      value: `${progressRate}%`,
      tone: "success",
      icon: "%",
    },
    {
      label: "리뷰 대기 PR",
      value: String(dashboard.pullRequests.length),
      tone: "warning",
      icon: "PR",
    },
    {
      label: "멤버",
      value: String(dashboard.members.length),
      tone: "primary",
      icon: "M",
    },
  ];
}

function sourceLabel(source: string | null | undefined) {
  return source === "fixture" ? "테스트 데이터" : "실제 데이터";
}

function EmptyRow({ text }: { text: string }) {
  return <p className="empty-row">{text}</p>;
}

export function WorkspaceDashboard() {
  const pathname = usePathname() ?? "/";
  const workspaceId = useMemo(() => resolveWorkspaceId(pathname), [pathname]);
  const [dashboardState, setDashboardState] =
    useState<WorkspaceDashboardState>(initialDashboardState);

  useEffect(() => {
    let cancelled = false;
    const dashboardClient = createWorkspaceDashboardClient();

    async function loadDashboard() {
      setDashboardState(initialDashboardState);

      try {
        const result = await dashboardClient.getDashboard(workspaceId);

        if (cancelled) return;

        setDashboardState({
          status: "ready",
          dashboard: result.dashboard as WorkspaceDashboardData,
          warnings: result.warnings,
          error: null,
        });
      } catch (error) {
        if (cancelled) return;

        setDashboardState({
          status: "error",
          dashboard: null,
          warnings: [],
          error:
            error instanceof Error
              ? error.message
              : "대시보드를 불러오지 못했어요.",
        });
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const dashboard = dashboardState.dashboard;
  const stats = dashboard ? buildStats(dashboard) : [];
  const upcomingTasks = dashboard
    ? [...(dashboard.tasks as DashboardTask[])]
        .sort((left, right) =>
          String(left.dueDate ?? "").localeCompare(String(right.dueDate ?? "")),
        )
        .slice(0, 5)
    : [];
  const reviewPrs = dashboard
    ? (dashboard.pullRequests as DashboardPullRequest[]).slice(0, 5)
    : [];
  const recentMeetings = dashboard
    ? (dashboard.meetingReports as DashboardMeetingReport[]).slice(0, 3)
    : [];
  const members = dashboard
    ? (dashboard.members as DashboardMember[]).slice(0, 6)
    : [];
  const workspaceBriefItems = dashboard
    ? createWorkspaceBriefItems(dashboard.workspace.description)
    : [];

  return (
    <section className="dashboard-content" aria-label="PILO 대시보드">
      {dashboardState.status === "loading" ? (
        <section className="panel">
          <div className="panel-head">
            <h2>대시보드를 불러오는 중</h2>
            <span>워크스페이스 데이터 확인</span>
          </div>
          <p className="dashboard-muted">
            작업, PR, 회의, 진행률 정보를 모으고 있어요.
          </p>
        </section>
      ) : null}

      {dashboardState.status === "error" ? (
        <section className="panel">
          <div className="panel-head">
            <h2>대시보드를 불러오지 못했어요</h2>
            <span>연결 오류</span>
          </div>
          <p className="dashboard-notice" role="alert">
            {dashboardState.error}
          </p>
        </section>
      ) : null}

      {dashboardState.status === "ready" && dashboard ? (
        <>
          <div className="meeting-chip">
            <span className="live-dot" />
            {sourceLabel(dashboard.source)}
            <code>{formatGeneratedAt(dashboard.generatedAt)}</code>
          </div>

          {dashboardState.warnings.length ? (
            <div className="dashboard-notice">
              일부 섹션 데이터가 비어 있어 가능한 정보만 표시하고 있어요.
            </div>
          ) : null}

          {workspaceBriefItems.length ? (
            <section className="workspace-brief-panel" aria-label="워크스페이스 요약">
              <div>
                <p className="eyebrow">온보딩 요약</p>
                <h2>{dashboard.workspace.name}</h2>
              </div>
              <dl>
                {workspaceBriefItems.map((item) => (
                  <div key={`${item.label}-${item.value}`}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <div className="stats-grid">
            {stats.map((stat) => (
              <article className="stat-card" key={stat.label}>
                <div>
                  <span>{stat.label}</span>
                  <i className={`tone-${stat.tone}`}>{stat.icon}</i>
                </div>
                <strong>{stat.value}</strong>
              </article>
            ))}
          </div>

          <div className="content-grid">
            <div className="left-column">
              <section className="panel">
                <div className="panel-head">
                  <h2>다가오는 작업</h2>
                  <Link href={`${workspaceDashboardHref(workspaceId)}/tasks`}>
                    작업 보드
                  </Link>
                </div>
                <div className="list">
                  {upcomingTasks.length ? (
                    upcomingTasks.map((task) => (
                      <div className="task-row" key={task.id}>
                        <i className={`status-dot tone-${taskTone(task)}`} />
                        <strong>{task.title}</strong>
                        <span className="tag">
                          {taskStatusLabels[task.status ?? ""] ??
                            task.status ??
                            "상태 없음"}
                        </span>
                        <b className={`due tone-${taskTone(task)}`}>
                          {formatDueDate(task.dueDate)}
                        </b>
                      </div>
                    ))
                  ) : (
                    <EmptyRow text="표시할 작업이 아직 없어요." />
                  )}
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h2>리뷰 대기 PR</h2>
                  <Link href={`${workspaceDashboardHref(workspaceId)}/reviews`}>
                    코드 리뷰
                  </Link>
                </div>
                <div className="list">
                  {reviewPrs.length ? (
                    reviewPrs.map((pr) => (
                      <div className="pr-row" key={pr.id}>
                        <div className="pr-icon">PR</div>
                        <div>
                          <strong>{pr.title}</strong>
                          <small>
                            #{pr.number ?? "-"} · {pr.authorLogin ?? "작성자 없음"}
                          </small>
                        </div>
                        <b className="pill tone-warning">
                          {prStateLabels[pr.state ?? ""] ??
                            pr.state ??
                            "상태 없음"}
                        </b>
                      </div>
                    ))
                  ) : (
                    <EmptyRow text="리뷰 대기 PR이 없어요." />
                  )}
                </div>
              </section>
            </div>

            <div className="right-column">
              <section className="panel">
                <div className="panel-head">
                  <h2>진행률</h2>
                  <Link href={`${workspaceDashboardHref(workspaceId)}/progress`}>
                    자세히 보기
                  </Link>
                </div>
                <div className="list">
                  <div className="task-row">
                    <i className="status-dot tone-success" />
                    <strong>완료</strong>
                    <b className="due tone-success">
                      {dashboard.progress?.doneTasks ?? 0}개
                    </b>
                  </div>
                  <div className="task-row">
                    <i className="status-dot tone-warning" />
                    <strong>검토 중</strong>
                    <b className="due tone-warning">
                      {dashboard.progress?.reviewTasks ?? 0}개
                    </b>
                  </div>
                  <div className="task-row">
                    <i className="status-dot tone-danger" />
                    <strong>막힘/지연</strong>
                    <b className="due tone-danger">
                      {(dashboard.progress?.blockedTasks ?? 0) +
                        (dashboard.progress?.delayedTasks ?? 0)}
                      개
                    </b>
                  </div>
                </div>
              </section>

              <section className="panel decision-panel">
                <div className="panel-head">
                  <h2>최근 회의 결정</h2>
                  <Link href={`${workspaceDashboardHref(workspaceId)}/meetings`}>
                    회의로 이동
                  </Link>
                </div>
                <div className="decision-list">
                  {recentMeetings.length ? (
                    recentMeetings.map((meeting) => (
                      <p key={meeting.id}>
                        <span>{meeting.decisionCount ?? 0}</span>
                        {meeting.summary ?? meeting.title ?? "회의 요약 없음"}
                      </p>
                    ))
                  ) : (
                    <EmptyRow text="최근 회의 결정이 없어요." />
                  )}
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h2>멤버 현황</h2>
                  <Link href={workspaceCanvasHref(workspaceId)}>캔버스</Link>
                </div>
                <div className="list">
                  {members.length ? (
                    members.map((member) => (
                      <div
                        className="task-row"
                        key={member.memberId ?? member.userId ?? member.email}
                      >
                        <i className="status-dot tone-primary" />
                        <strong>
                          {member.displayName ?? member.name ?? "이름 없음"}
                        </strong>
                        <span className="tag">
                          {roleLabels[member.role ?? ""] ??
                            member.role ??
                            "역할 없음"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <EmptyRow text="표시할 멤버가 없어요." />
                  )}
                </div>
              </section>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
