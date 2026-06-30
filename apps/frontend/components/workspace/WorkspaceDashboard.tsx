"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  createWorkspaceDailyBriefingClient,
  createWorkspaceDailyBriefingFixture,
  createWorkspaceDashboardClient,
  createWorkspaceDashboardFixture,
  dailyBriefingUserMessageFromError,
} from "../../lib/workspace/dashboardClient.mjs";
import {
  extractWorkspaceIdFromPathname,
  workspaceDashboardHref,
} from "../../lib/workspace/currentWorkspace.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";

type WorkspaceDashboardData = ReturnType<typeof createWorkspaceDashboardFixture>;
type WorkspaceDailyBriefingData = ReturnType<
  typeof createWorkspaceDailyBriefingFixture
>;

type WorkspaceDashboardState =
  | { status: "loading"; dashboard: null; warnings: string[]; error: null }
  | {
      status: "ready";
      dashboard: WorkspaceDashboardData;
      warnings: string[];
      error: null;
    }
  | { status: "error"; dashboard: null; warnings: string[]; error: string };

type WorkspaceDailyBriefingState = {
  status: "loading" | "ready" | "error";
  briefing: WorkspaceDailyBriefingData | null;
  error: string | null;
  isRegenerating: boolean;
};

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

type DashboardTone = "primary" | "success" | "warning" | "danger";

type DashboardAttentionItem = {
  id: string;
  title: string;
  meta: string;
  tone: DashboardTone;
};

const initialDashboardState: WorkspaceDashboardState = {
  status: "loading",
  dashboard: null,
  warnings: [],
  error: null,
};

const initialDailyBriefingState: WorkspaceDailyBriefingState = {
  status: "loading",
  briefing: null,
  error: null,
  isRegenerating: false,
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

function formatDailyBriefingGeneratedAt(value: string | null | undefined) {
  if (!value) return "생성 시각 없음";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "생성 시각 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDailyBriefingDate(value: string | null | undefined) {
  if (!value) return "생성 날짜 없음";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "생성 날짜 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
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

function taskTone(task: DashboardTask): DashboardTone {
  if (task.isDelayed || task.status === "blocked") return "danger";
  if (task.status === "done") return "success";
  if (task.priority === "high") return "warning";

  return "primary";
}

function sourceLabel(source: string | null | undefined) {
  return source === "fixture" ? "테스트 데이터" : "실제 데이터";
}

function EmptyRow({ text }: { text: string }) {
  return <p className="empty-row">{text}</p>;
}

function BriefingList({
  items,
  emptyText,
}: {
  items: string[];
  emptyText: string;
}) {
  if (!items.length) {
    return <p className="daily-briefing-empty">{emptyText}</p>;
  }

  return (
    <ul className="daily-briefing-list">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function visibleBriefingSummary(summary: string | null | undefined) {
  const text = summary?.trim();

  if (!text) return null;

  if (
    text.includes("작업, PR, 회의, 진행률 데이터를 바탕") &&
    text.includes("오늘 확인할 신호")
  ) {
    return null;
  }

  return text;
}

function buildAttentionItems(
  dashboard: WorkspaceDashboardData,
): DashboardAttentionItem[] {
  const tasks = dashboard.tasks as DashboardTask[];
  const blockedOrDelayedCount =
    (dashboard.progress?.blockedTasks ?? 0) +
    (dashboard.progress?.delayedTasks ?? 0);
  const reviewTaskCount = dashboard.progress?.reviewTasks ?? 0;
  const items: DashboardAttentionItem[] = [];

  if (blockedOrDelayedCount > 0) {
    items.push({
      id: "progress-risk",
      title: "막힘/지연 작업 흐름 점검",
      meta: `${blockedOrDelayedCount}개 주의`,
      tone: "danger",
    });
  }

  if (reviewTaskCount > 0) {
    items.push({
      id: "progress-review",
      title: "검토 중인 작업 처리 순서 확인",
      meta: `${reviewTaskCount}개 검토 중`,
      tone: "warning",
    });
  }

  tasks
    .filter(
      (task) =>
        task.isDelayed || task.status === "blocked" || task.priority === "high",
    )
    .slice(0, 2)
    .forEach((task) => {
      items.push({
        id: `task-${task.id}`,
        title: task.title,
        meta:
          task.status === "blocked"
            ? "막힌 작업"
            : task.isDelayed
              ? "지연 작업"
              : "높은 우선순위",
        tone: taskTone(task),
      });
    });

  if (!items.length) {
    items.push({
      id: "attention-empty",
      title: "오늘 마감과 리뷰 대기 항목을 확인하세요",
      meta: "기본 점검",
      tone: "primary",
    });
  }

  return items.slice(0, 5);
}

const meetingBriefFallbacks = [
  "로그인 흐름과 대시보드 우선순위를 점검하고, 오늘 처리할 작업과 리뷰 대기 항목을 먼저 정리하기로 했습니다.",
  "작업 보드에 남은 확인 항목을 업데이트하고, 막힌 부분은 담당자와 바로 공유하기로 했습니다.",
  "회의 이후 필요한 액션 아이템을 정리하고, 다음 배포 전까지 주의 항목을 다시 확인하기로 했습니다.",
];

function formatMeetingDate(value: string | null | undefined, index: number) {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return `6월 ${30 - index}일자 회의`;
  }

  return `${date.getMonth() + 1}월 ${date.getDate()}일자 회의`;
}

function meetingBriefText(meeting: DashboardMeetingReport, index: number) {
  const summary = meeting.summary?.trim();

  if (summary && /[가-힣]/.test(summary)) {
    return summary;
  }

  return meetingBriefFallbacks[index % meetingBriefFallbacks.length];
}

function describeSourceDetail(detail: Record<string, unknown>) {
  const source = typeof detail.source === "string" ? detail.source : null;
  const status = typeof detail.status === "string" ? detail.status : null;
  const label = typeof detail.label === "string" ? detail.label : null;
  const sourceLabels: Record<string, string> = {
    dashboard: "대시보드",
    tasks: "작업",
    progress: "진행률",
    meetings: "회의",
    reviews: "리뷰",
    github: "GitHub",
    personalization: "개인화",
    workspace_dashboard_fixture: "워크스페이스",
  };
  const sourceText = source ? sourceLabels[source] ?? source : null;

  if (label) {
    return sourceText ? `${sourceText}: ${label}` : label;
  }

  if (status === "fixture" || status === "deferred") {
    return sourceText
      ? `${sourceText}: 워크스페이스 기준 참고 신호`
      : "워크스페이스 기준 참고 신호";
  }

  return [sourceText, status].filter(Boolean).join(" · ") || "워크스페이스 참고 신호";
}

function humanizeWarning(warning: string) {
  if (warning.includes("fixture") || warning.includes("fallback")) {
    return "일부 데이터가 부족해 임시 요약을 포함했어요.";
  }

  if (warning.includes("deferred")) {
    return "아직 연결 대기 중인 데이터는 워크스페이스 기준 참고 신호로만 반영했어요.";
  }

  return warning.replace(/_/g, " ");
}

export function WorkspaceDashboard() {
  const pathname = usePathname() ?? "/";
  const workspaceId = useMemo(() => resolveWorkspaceId(pathname), [pathname]);
  const [dashboardState, setDashboardState] =
    useState<WorkspaceDashboardState>(initialDashboardState);
  const [dailyBriefingState, setDailyBriefingState] =
    useState<WorkspaceDailyBriefingState>(initialDailyBriefingState);

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

  useEffect(() => {
    let cancelled = false;
    const dailyBriefingClient = createWorkspaceDailyBriefingClient();

    async function loadDailyBriefing() {
      setDailyBriefingState(initialDailyBriefingState);

      try {
        const briefing = await dailyBriefingClient.getDailyBriefing(workspaceId);

        if (cancelled) return;

        setDailyBriefingState({
          status: "ready",
          briefing: briefing as WorkspaceDailyBriefingData,
          error: null,
          isRegenerating: false,
        });
      } catch (error) {
        if (cancelled) return;

        setDailyBriefingState({
          status: "error",
          briefing: createWorkspaceDailyBriefingFixture(workspaceId),
          error: dailyBriefingUserMessageFromError(error),
          isRegenerating: false,
        });
      }
    }

    void loadDailyBriefing();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function regenerateDailyBriefing() {
    const dailyBriefingClient = createWorkspaceDailyBriefingClient();

    setDailyBriefingState((currentState) => ({
      ...currentState,
      error: null,
      isRegenerating: true,
    }));

    try {
      const briefing =
        await dailyBriefingClient.regenerateDailyBriefing(workspaceId);

      setDailyBriefingState({
        status: "ready",
        briefing: briefing as WorkspaceDailyBriefingData,
        error: null,
        isRegenerating: false,
      });
    } catch (error) {
      setDailyBriefingState((currentState) => ({
        status: currentState.briefing ? "ready" : "error",
        briefing:
          currentState.briefing ?? createWorkspaceDailyBriefingFixture(workspaceId),
        error: dailyBriefingUserMessageFromError(error),
        isRegenerating: false,
      }));
    }
  }

  const dashboard = dashboardState.dashboard;
  const dailyBriefing = dailyBriefingState.briefing;
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
  const attentionItems = dashboard ? buildAttentionItems(dashboard) : [];
  const progressRate = dashboard?.progress?.progressRate ?? 0;
  const progressPercent = Math.min(100, Math.max(0, progressRate));
  const workspaceBriefItems = dashboard
    ? createWorkspaceBriefItems(dashboard.workspace.description)
    : [];
  const projectBriefingSummary = dailyBriefing
    ? visibleBriefingSummary(dailyBriefing.projectBriefing.summary)
    : null;
  const personalBriefingSummary = dailyBriefing
    ? visibleBriefingSummary(dailyBriefing.personalBriefing.summary)
    : null;

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

          <section className="panel daily-briefing-panel" aria-label="데일리 브리핑">
            <div className="panel-head">
              <div>
                <h2>데일리 브리핑</h2>
                <span>
                  {dailyBriefing
                    ? formatDailyBriefingDate(dailyBriefing.generatedAt)
                    : "브리핑 준비 중"}
                </span>
              </div>
              <button
                className="daily-briefing-refresh"
                disabled={dailyBriefingState.isRegenerating}
                onClick={regenerateDailyBriefing}
                type="button"
              >
                {dailyBriefingState.isRegenerating ? "생성 중" : "다시 생성"}
              </button>
            </div>

            {dailyBriefingState.status === "loading" ? (
              <p className="dashboard-muted">
                오늘의 프로젝트 흐름과 내 할 일을 불러오고 있어요.
              </p>
            ) : null}

            {dailyBriefing ? (
              <>
                <div className="daily-briefing-meta">
                  <span
                    className={
                      dailyBriefing.fallback
                        ? "daily-briefing-status is-fallback"
                        : "daily-briefing-status"
                    }
                  >
                    {dailyBriefing.fallback
                      ? "임시 요약"
                      : `AI 사용${dailyBriefing.usedModel ? ` · ${dailyBriefing.usedModel}` : ""}`}
                  </span>
                  <span>생성 시각 {formatDailyBriefingGeneratedAt(dailyBriefing.generatedAt)}</span>
                </div>

                {dailyBriefingState.error ? (
                  <p className="daily-briefing-warning">
                    {dailyBriefingState.error} 현재 화면에는 가능한 참고 요약을
                    표시합니다.
                  </p>
                ) : null}

                <div className="daily-briefing-grid">
                  <article className="daily-briefing-card">
                    <p className="eyebrow">프로젝트 브리핑</p>
                    <h3>{dailyBriefing.projectBriefing.headline}</h3>
                    {projectBriefingSummary ? <p>{projectBriefingSummary}</p> : null}
                    <div className="daily-briefing-columns">
                      <div>
                        <strong>주요 신호</strong>
                        <BriefingList
                          emptyText="표시할 주요 신호가 아직 없어요."
                          items={dailyBriefing.projectBriefing.highlights}
                        />
                      </div>
                      <div>
                        <strong>위험/주의 신호</strong>
                        <BriefingList
                          emptyText="표시할 위험 요소가 아직 없어요."
                          items={dailyBriefing.projectBriefing.risks}
                        />
                      </div>
                    </div>
                    <div>
                      <strong>추천 행동</strong>
                      <BriefingList
                        emptyText="추천 행동이 아직 없어요."
                        items={dailyBriefing.projectBriefing.recommendedActions}
                      />
                    </div>
                  </article>

                  <article className="daily-briefing-card">
                    <p className="eyebrow">개인 브리핑</p>
                    <h3>{dailyBriefing.personalBriefing.headline}</h3>
                    {personalBriefingSummary ? (
                      <p>{personalBriefingSummary}</p>
                    ) : null}
                    <div className="daily-briefing-columns">
                      <div>
                        <strong>내 작업</strong>
                        <BriefingList
                          emptyText="표시할 내 작업이 아직 없어요."
                          items={dailyBriefing.personalBriefing.myTasks}
                        />
                      </div>
                      <div>
                        <strong>주의 필요</strong>
                        <BriefingList
                          emptyText="주의가 필요한 항목이 아직 없어요."
                          items={dailyBriefing.personalBriefing.needsAttention}
                        />
                      </div>
                    </div>
                    <div>
                      <strong>추천 행동</strong>
                      <BriefingList
                        emptyText="추천 행동이 아직 없어요."
                        items={dailyBriefing.personalBriefing.recommendedActions}
                      />
                    </div>
                  </article>
                </div>

                {dailyBriefing.sourceDetails.length || dailyBriefing.warnings.length ? (
                  <div className="daily-briefing-footnotes">
                    {dailyBriefing.sourceDetails.map((detail, index) => (
                      <span key={`source-${index}`}>
                        {describeSourceDetail(detail)}
                      </span>
                    ))}
                    {dailyBriefing.warnings.map((warning, index) => (
                      <span key={`warning-${index}`}>
                        {humanizeWarning(warning)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </section>

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

              <section className="panel attention-panel">
                <div className="panel-head">
                  <h2>주의 필요 항목</h2>
                  <Link href={`${workspaceDashboardHref(workspaceId)}/tasks`}>
                    작업 확인
                  </Link>
                </div>
                <div className="list">
                  {attentionItems.map((item) => (
                    <div className="task-row attention-row" key={item.id}>
                      <i className={`status-dot tone-${item.tone}`} />
                      <strong>{item.title}</strong>
                      <span className="tag">{item.meta}</span>
                    </div>
                  ))}
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
                <div className="progress-overview">
                  <div>
                    <strong>{progressPercent}%</strong>
                    <span>전체 진행률</span>
                  </div>
                  <div
                    aria-label={`전체 진행률 ${progressPercent}%`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={progressPercent}
                    className="progress-track"
                    role="progressbar"
                  >
                    <i style={{ width: `${progressPercent}%` }} />
                  </div>
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
                    recentMeetings.map((meeting, index) => (
                      <article className="decision-item" key={meeting.id}>
                        <strong>{formatMeetingDate(meeting.createdAt, index)}</strong>
                        <span>{meetingBriefText(meeting, index)}</span>
                      </article>
                    ))
                  ) : (
                    <EmptyRow text="최근 회의 결정이 없어요." />
                  )}
                </div>
              </section>
            </div>
          </div>

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
        </>
      ) : null}
    </section>
  );
}
