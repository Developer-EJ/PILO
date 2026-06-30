"use client";

import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTaskGithubProgressClient,
  milestoneStatuses,
  resolveTaskGithubProgressClientMode,
  taskPriorities,
  taskStatuses,
} from "../../lib/task/taskGithubProgressClient.mjs";
import { createWorkspaceDashboardFixture } from "../../lib/workspace/dashboardClient.mjs";
import styles from "./TaskWorkspace.module.css";

type WorkspaceView = "tasks" | "github" | "progress";

type TaskWorkspaceProps = {
  workspaceId: string;
  view: WorkspaceView;
};

type MemberSummary = {
  memberId: string;
  name?: string;
  displayName?: string;
};

type TaskSummary = {
  id: string;
  workspaceId: string;
  milestoneId?: string | null;
  title: string;
  status: string;
  priority: string;
  assignee?: { memberId?: string; name?: string | null } | null;
  dueDate?: string | null;
  isDelayed?: boolean;
  linkedIssueCount?: number;
  linkedPrCount?: number;
  updatedAt?: string;
};

type ChecklistItem = {
  id: string;
  taskId: string;
  title: string;
  status: string;
};

type TaskDetail = TaskSummary & {
  checklistItems?: ChecklistItem[];
};

type TaskComment = {
  id: string;
  body: string;
  author?: { name?: string } | null;
  createdAt: string;
};

type TaskActivityLog = {
  id: string;
  action: string;
  createdAt: string;
};

type MilestoneSummary = {
  id: string;
  title: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
};

type TaskDraftSummary = {
  id: string;
  title: string;
  description?: string | null;
  priority: string;
  dueDate?: string | null;
  status: string;
  taskId?: string | null;
};

type GithubConnectionSummary = {
  id: string;
  provider: string;
  installationId?: string | null;
  githubAccountLogin?: string | null;
  scopes?: string[];
  connectedAt?: string;
  revokedAt?: string | null;
};

type GithubReadModel = {
  repositories: Array<{
    id: string;
    owner: string;
    repoName: string;
    url: string;
    defaultBranch?: string | null;
  }>;
  issues: Array<{
    id: string;
    number: number;
    title: string;
    state: string;
    url: string;
    labels?: string[];
    linkedTaskId?: string | null;
  }>;
  pullRequests: Array<{
    id: string;
    number: number;
    title: string;
    state: string;
    authorLogin?: string | null;
    branch?: string | null;
    url: string;
    linkedTaskIds?: string[];
  }>;
  pullRequestChangedFiles: Array<{
    pullRequestId: string;
    path: string;
    status: string;
    changes: number;
  }>;
  source: string;
  deferred: boolean;
};

type ProgressSummary = {
  workspaceId: string;
  milestoneId: string | null;
  totalTasks: number;
  doneTasks: number;
  blockedTasks: number;
  reviewTasks: number;
  delayedTasks: number;
  progressRate: number;
  capturedAt: string;
};

type DashboardTaskTab = "all" | "mine" | "upcoming" | "completed";

type CalendarDay = {
  date: Date;
  isToday: boolean;
  key: string;
  label: string;
  weekday: string;
};

const dashboardTaskTabs: Array<{ id: DashboardTaskTab; label: string }> = [
  { id: "all", label: "전체" },
  { id: "mine", label: "내 작업" },
  { id: "upcoming", label: "예정" },
  { id: "completed", label: "완료" },
];

const calendarHours = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];

const calendarWeekdays = ["월", "화", "수", "목", "금", "토", "일"];
const monthLabels = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
];

const dashboardStatusLabels: Record<string, string> = {
  todo: "대기",
  in_progress: "진행 중",
  in_review: "검토 예정",
  done: "완료",
  blocked: "막힘",
};

const statusLabels: Record<string, string> = {
  todo: "할 일",
  in_progress: "진행 중",
  in_review: "검토 중",
  done: "완료",
  blocked: "막힘",
};

const priorityLabels: Record<string, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
  urgent: "긴급",
};

const milestoneStatusLabels: Record<string, string> = {
  planned: "예정",
  in_progress: "진행 중",
  done: "완료",
};

const draftStatusLabels: Record<string, string> = {
  draft: "초안",
  approved: "승인됨",
  rejected: "거절됨",
};

const githubStateLabels: Record<string, string> = {
  open: "열림",
  closed: "닫힘",
  review_requested: "리뷰 요청",
  changes_requested: "수정 요청",
  merged: "병합됨",
  modified: "수정됨",
  added: "추가됨",
  deleted: "삭제됨",
  fixture: "fixture 데이터",
};

const activityLabels: Record<string, string> = {
  "task.created": "작업 생성",
  "task.updated": "작업 수정",
  "task.deleted": "작업 삭제",
  "task.status_changed": "상태 변경",
  "task.comment_created": "댓글 추가",
  "task.checklist_item_created": "체크리스트 추가",
  "task.checklist_item_updated": "체크리스트 수정",
  "task.checklist_item_deleted": "체크리스트 삭제",
};

const modeLabels: Record<string, string> = {
  api: "실제 API",
  mock: "모의 데이터",
};

function cx(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function memberLabel(member?: MemberSummary | null) {
  return member?.name ?? member?.displayName ?? member?.memberId ?? "미배정";
}

function taskAssigneeLabel(task: TaskSummary) {
  return task.assignee?.name ?? task.assignee?.memberId ?? "미배정";
}

function statusLabel(status: string) {
  return statusLabels[status] ?? status;
}

function priorityLabel(priority: string) {
  return priorityLabels[priority] ?? priority;
}

function milestoneStatusLabel(status: string) {
  return milestoneStatusLabels[status] ?? status;
}

function draftStatusLabel(status: string) {
  return draftStatusLabels[status] ?? status;
}

function githubStateLabel(state: unknown) {
  return githubStateLabels[String(state ?? "fixture")] ?? String(state);
}

function activityLabel(action: string) {
  return activityLabels[action] ?? action;
}

function formatDate(value?: string | null) {
  return value ? value.slice(0, 10) : "-";
}

function parseDateOnly(value?: string | null) {
  if (!value) return null;

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function todayDateOnly() {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function taskDateKey(task: TaskSummary) {
  const date = parseDateOnly(task.dueDate);

  return date ? dateKey(date) : "unscheduled";
}

function formatCalendarDate(date: Date) {
  return `${monthLabels[date.getMonth()]} ${date.getDate()}일`;
}

function formatTaskDate(value?: string | null) {
  const date = parseDateOnly(value);

  return date ? formatCalendarDate(date) : "날짜 없음";
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  start.setDate(start.getDate() + diff);

  return start;
}

function buildCalendarWeek(weekOffset: number): CalendarDay[] {
  const today = todayDateOnly();
  const start = startOfWeek(today);
  start.setDate(start.getDate() + weekOffset * 7);

  return calendarWeekdays.map((weekday, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    return {
      date,
      isToday: dateKey(date) === dateKey(today),
      key: dateKey(date),
      label: formatCalendarDate(date),
      weekday,
    };
  });
}

function formatWeekRange(days: CalendarDay[]) {
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;

  if (!first || !last) return "";

  return `${formatCalendarDate(first)} - ${formatCalendarDate(last)}, ${last.getFullYear()}`;
}

function dashboardStatusLabel(status: string) {
  return dashboardStatusLabels[status] ?? status;
}

function dashboardStatusClass(status: string) {
  if (status === "todo") return styles.dashboardStatusPending;
  if (status === "in_progress") return styles.dashboardStatusProgress;
  if (status === "in_review") return styles.dashboardStatusScheduled;
  if (status === "done") return styles.dashboardStatusCompleted;
  if (status === "blocked") return styles.dashboardStatusBlocked;

  return "";
}

function dashboardEventClass(status: string) {
  if (status === "todo") return styles.calendarEventPending;
  if (status === "in_progress") return styles.calendarEventProgress;
  if (status === "in_review") return styles.calendarEventScheduled;
  if (status === "done") return styles.calendarEventCompleted;
  if (status === "blocked") return styles.calendarEventBlocked;

  return "";
}

function isCompletedTask(task: TaskSummary) {
  return task.status === "done";
}

function filterDashboardTasks(
  tasks: TaskSummary[],
  tab: DashboardTaskTab,
  currentMemberId?: string,
) {
  if (tab === "mine") {
    return currentMemberId
      ? tasks.filter((task) => task.assignee?.memberId === currentMemberId)
      : [];
  }

  if (tab === "upcoming") {
    const today = todayDateOnly();

    return tasks.filter((task) => {
      const dueDate = parseDateOnly(task.dueDate);

      return Boolean(dueDate && dueDate >= today && !isCompletedTask(task));
    });
  }

  if (tab === "completed") {
    return tasks.filter(isCompletedTask);
  }

  return tasks;
}

function groupTasksByDate(tasks: TaskSummary[]) {
  return tasks.reduce<Record<string, TaskSummary[]>>((groups, task) => {
    const key = taskDateKey(task);

    return {
      ...groups,
      [key]: [...(groups[key] ?? []), task],
    };
  }, {});
}

function calendarEventStyle(
  dayIndex: number,
  task: TaskSummary,
  taskIndex: number,
): CSSProperties {
  const statusOffset =
    task.status === "done"
      ? 4
      : task.status === "in_review"
        ? 3
        : task.status === "blocked"
          ? 2
          : task.status === "todo"
            ? 1
            : 0;
  const rowCount = Math.max(1, calendarHours.length - 2);
  const startRow = 1 + ((taskIndex * 2 + dayIndex + statusOffset) % rowCount);
  const rowSpan = task.status === "todo" ? 2 : 3;

  return {
    gridRow: `${startRow} / span ${rowSpan}`,
  };
}

function statusClass(status: string) {
  if (status === "blocked") return styles.statusBlocked;
  if (status === "done") return styles.statusDone;

  return "";
}

function priorityClass(priority: string) {
  return priority === "high" || priority === "urgent"
    ? styles.priorityHigh
    : "";
}

function visibleTasks(tasks: TaskSummary[], search: string) {
  const normalizedSearch = search.trim().toLowerCase();

  if (!normalizedSearch) {
    return tasks;
  }

  return tasks.filter((task) =>
    task.title.toLowerCase().includes(normalizedSearch),
  );
}

function buildProgressHistory(progress: ProgressSummary | null) {
  if (!progress) {
    return [];
  }

  return [14, 7, 0].map((daysAgo) => {
    const captured = new Date(progress.capturedAt);
    captured.setDate(captured.getDate() - daysAgo);
    const drift = daysAgo === 14 ? -12 : daysAgo === 7 ? -5 : 0;

    return {
      ...progress,
      id: `mock-progress-${daysAgo}`,
      progressRate: Math.max(0, progress.progressRate + drift),
      capturedAt: captured.toISOString(),
    };
  });
}

function sortByUpdatedAt(tasks: TaskSummary[]) {
  return [...tasks].sort((left, right) =>
    String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")),
  );
}

export function TaskWorkspace({ workspaceId, view }: TaskWorkspaceProps) {
  const mode = resolveTaskGithubProgressClientMode();
  const fixture = useMemo(
    () => createWorkspaceDashboardFixture(workspaceId),
    [workspaceId],
  );
  const members = fixture.members as MemberSummary[];
  const client = useMemo(
    () => createTaskGithubProgressClient({ workspaceId }),
    [workspaceId],
  );
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [milestones, setMilestones] = useState<MilestoneSummary[]>([]);
  const [taskDrafts, setTaskDrafts] = useState<TaskDraftSummary[]>([]);
  const [connections, setConnections] = useState<GithubConnectionSummary[]>([]);
  const [githubReadModel, setGithubReadModel] =
    useState<GithubReadModel | null>(null);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activityLogs, setActivityLogs] = useState<TaskActivityLog[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [milestoneFilter, setMilestoneFilter] = useState("");
  const [search, setSearch] = useState("");
  const [taskTab, setTaskTab] = useState<DashboardTaskTab>("all");
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);

  const filteredTasks = visibleTasks(sortByUpdatedAt(tasks), search);
  const currentMemberId =
    fixture.currentMember?.memberId ?? members[0]?.memberId;
  const dashboardTasks = useMemo(
    () => filterDashboardTasks(filteredTasks, taskTab, currentMemberId),
    [currentMemberId, filteredTasks, taskTab],
  );
  const calendarDays = useMemo(
    () => buildCalendarWeek(calendarWeekOffset),
    [calendarWeekOffset],
  );
  const calendarTasksByDate = useMemo(
    () => groupTasksByDate(filteredTasks),
    [filteredTasks],
  );
  const weekRangeLabel = useMemo(
    () => formatWeekRange(calendarDays),
    [calendarDays],
  );
  const completedTaskCount = useMemo(
    () => tasks.filter(isCompletedTask).length,
    [tasks],
  );
  const activeTaskCount = Math.max(0, tasks.length - completedTaskCount);

  const refreshDomainData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const taskQuery = {
        status: statusFilter,
        priority: priorityFilter,
        milestoneId: milestoneFilter,
      };
      const [
        nextTasks,
        nextMilestones,
        nextDrafts,
        nextConnections,
        nextGithubReadModel,
      ] = await Promise.all([
        client.listTasks(workspaceId, taskQuery),
        client.listMilestones(workspaceId),
        client.listTaskDrafts(workspaceId),
        client.listGithubConnections(workspaceId),
        client.getDeferredGithubReadModel(workspaceId),
      ]);
      const normalizedTasks = Array.isArray(nextTasks) ? nextTasks : [];
      const nextProgress = await client.calculateProgress(
        workspaceId,
        normalizedTasks,
        {
          milestoneId: milestoneFilter || null,
        },
      );

      setTasks(normalizedTasks);
      setMilestones(Array.isArray(nextMilestones) ? nextMilestones : []);
      setTaskDrafts(Array.isArray(nextDrafts) ? nextDrafts : []);
      setConnections(Array.isArray(nextConnections) ? nextConnections : []);
      setGithubReadModel(nextGithubReadModel);
      setProgress(nextProgress);
      setSelectedTaskId((current) => {
        if (current && normalizedTasks.some((task) => task.id === current)) {
          return current;
        }

        return normalizedTasks[0]?.id ?? null;
      });
    } catch (loadError) {
      setError("주형 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [client, milestoneFilter, priorityFilter, statusFilter, workspaceId]);

  const refreshSelectedTask = useCallback(async () => {
    if (!selectedTaskId) {
      setSelectedTask(null);
      setComments([]);
      setActivityLogs([]);
      return;
    }

    try {
      const [detail, nextComments, nextActivityLogs] = await Promise.all([
        client.getTask(selectedTaskId),
        client.listTaskComments(selectedTaskId),
        client.listTaskActivityLogs(selectedTaskId),
      ]);

      setSelectedTask(detail);
      setComments(Array.isArray(nextComments) ? nextComments : []);
      setActivityLogs(Array.isArray(nextActivityLogs) ? nextActivityLogs : []);
    } catch (detailError) {
      setSelectedTask(tasks.find((task) => task.id === selectedTaskId) ?? null);
      setComments([]);
      setActivityLogs([]);
    }
  }, [client, selectedTaskId, tasks]);

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (!cancelled) {
        void refreshDomainData();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [refreshDomainData]);

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (!cancelled) {
        void refreshSelectedTask();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [refreshSelectedTask]);

  async function runMutation(label: string, action: () => Promise<unknown>) {
    setBusyAction(label);
    setError(null);
    setNotice(null);

    try {
      await action();
      await refreshDomainData();
      await refreshSelectedTask();
    } catch (mutationError) {
      setError("요청을 처리하지 못했습니다.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();

    if (!title) return;

    await runMutation("create-task", async () => {
      const task = await client.createTask(workspaceId, {
        title,
        description: String(data.get("description") ?? "").trim() || null,
        status: String(data.get("status") ?? "todo"),
        priority: String(data.get("priority") ?? "medium"),
        assigneeMemberId: String(data.get("assigneeMemberId") ?? "") || null,
        dueDate: String(data.get("dueDate") ?? "") || null,
        milestoneId: String(data.get("milestoneId") ?? "") || null,
      });

      setSelectedTaskId((task as TaskSummary).id);
      setNotice("작업이 생성되었습니다.");
      form.reset();
    });
  }

  async function handleCreateQuickTask(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();

    await handleCreateTask(event);

    if (title) {
      setIsQuickAddOpen(false);
    }
  }

  async function handleCreateMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();

    if (!title) return;

    await runMutation("create-milestone", async () => {
      await client.createMilestone(workspaceId, {
        title,
        status: String(data.get("status") ?? "planned"),
        startDate: String(data.get("startDate") ?? "") || null,
        endDate: String(data.get("endDate") ?? "") || null,
      });
      setNotice("마일스톤이 생성되었습니다.");
      form.reset();
    });
  }

  async function handleCreateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();

    if (!title) return;

    await runMutation("create-draft", async () => {
      await client.createTaskDraft(workspaceId, {
        title,
        description: String(data.get("description") ?? "").trim() || null,
        assigneeMemberId: String(data.get("assigneeMemberId") ?? "") || null,
        priority: String(data.get("priority") ?? "medium"),
        dueDate: String(data.get("dueDate") ?? "") || null,
      });
      setNotice("작업 초안이 생성되었습니다.");
      form.reset();
    });
  }

  async function handleAddChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTaskId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();

    if (!title) return;

    await runMutation("checklist", async () => {
      await client.createChecklistItem(selectedTaskId, { title });
      form.reset();
    });
  }

  async function handleAddComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTaskId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = String(data.get("body") ?? "").trim();

    if (!body) return;

    await runMutation("comment", async () => {
      await client.createTaskComment(selectedTaskId, { body });
      form.reset();
    });
  }

  async function handleStartGithubConnection() {
    await runMutation("github-start", async () => {
      const response = await client.startGithubConnection(workspaceId);
      const nextInstallUrl =
        typeof response === "object" &&
        response !== null &&
        "installationUrl" in response
          ? String(response.installationUrl)
          : null;

      setInstallUrl(nextInstallUrl);
      setNotice(
        mode === "api"
          ? "GitHub App 설치 URL이 준비되었습니다."
          : "모의 GitHub App 연결이 추가되었습니다.",
      );
    });
  }

  const renderTaskBoard = () => (
    <div className={styles.taskDashboardShell}>
      <div className={styles.taskDashboard}>
        <section className={cx(styles.panel, styles.calendarPanel)}>
          <div className={styles.calendarPanelHeader}>
            <div>
              <h2>주간 작업 캘린더</h2>
              <p>
                진행할 작업 {activeTaskCount}개, 완료 {completedTaskCount}개
              </p>
            </div>
            <div className={styles.calendarControls}>
              <button
                aria-label="이전 주"
                className={styles.iconButton}
                onClick={() => setCalendarWeekOffset((offset) => offset - 1)}
                type="button"
              >
                &lt;
              </button>
              <button
                className={styles.controlButton}
                onClick={() => setCalendarWeekOffset(0)}
                type="button"
              >
                오늘
              </button>
              <strong className={styles.weekRangeLabel}>
                {weekRangeLabel}
              </strong>
              <button
                aria-label="다음 주"
                className={styles.iconButton}
                onClick={() => setCalendarWeekOffset((offset) => offset + 1)}
                type="button"
              >
                &gt;
              </button>
              <span className={styles.modeChip}>주간</span>
              <button
                className={styles.primaryButton}
                onClick={() => setIsQuickAddOpen(true)}
                type="button"
              >
                + 새 작업
              </button>
            </div>
          </div>

          <div className={styles.calendarSurface}>
            <div className={styles.calendarHeaderGrid}>
              <span className={styles.calendarCorner} aria-hidden="true" />
              {calendarDays.map((day) => (
                <div
                  className={cx(
                    styles.calendarDayHeader,
                    day.isToday && styles.calendarDayToday,
                  )}
                  key={day.key}
                >
                  <strong>{day.weekday}</strong>
                  <span>{day.label}</span>
                </div>
              ))}
            </div>
            <div className={styles.calendarBodyGrid}>
              <div className={styles.timeScale}>
                {calendarHours.map((hour) => (
                  <span key={hour}>{hour}</span>
                ))}
              </div>
              <div className={styles.currentTimeLine} aria-hidden="true" />
              <div className={styles.calendarColumns}>
                {calendarDays.map((day, dayIndex) => {
                  const dayTasks = calendarTasksByDate[day.key] ?? [];

                  return (
                    <div className={styles.calendarColumn} key={day.key}>
                      {calendarHours.map((hour) => (
                        <span className={styles.calendarHourTrack} key={hour} />
                      ))}
                      {dayTasks.slice(0, 4).map((task, taskIndex) => (
                        <button
                          className={cx(
                            styles.calendarEvent,
                            dashboardEventClass(task.status),
                          )}
                          key={task.id}
                          onClick={() => setSelectedTaskId(task.id)}
                          style={calendarEventStyle(dayIndex, task, taskIndex)}
                          type="button"
                        >
                          <strong>{task.title}</strong>
                          <span>
                            {taskAssigneeLabel(task)} ·{" "}
                            {dashboardStatusLabel(task.status)}
                          </span>
                        </button>
                      ))}
                      {dayTasks.length > 4 ? (
                        <span className={styles.moreEvents}>
                          +{dayTasks.length - 4}개 더
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={styles.calendarLegend}>
            <span>
              <i className={styles.legendProgress} /> 진행 중
            </span>
            <span>
              <i className={styles.legendPending} /> 대기
            </span>
            <span>
              <i className={styles.legendScheduled} /> 검토 예정
            </span>
            <span>
              <i className={styles.legendCompleted} /> 완료
            </span>
          </div>
        </section>

        <section className={cx(styles.panel, styles.tasksPanel)}>
          <div className={styles.tasksPanelHeader}>
            <div>
              <h2>작업</h2>
              <p>{dashboardTasks.length}개 표시</p>
            </div>
            <button
              aria-label="작업 필터 초기화"
              className={styles.moreButton}
              onClick={() => {
                setTaskTab("all");
                setStatusFilter("");
                setPriorityFilter("");
                setMilestoneFilter("");
                setSearch("");
              }}
              type="button"
            >
              초기화
            </button>
          </div>

          <div
            aria-label="Task filters"
            className={styles.taskTabs}
            role="tablist"
          >
            {dashboardTaskTabs.map((tab) => (
              <button
                aria-selected={taskTab === tab.id}
                className={
                  taskTab === tab.id ? styles.taskTabActive : styles.taskTab
                }
                key={tab.id}
                onClick={() => setTaskTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <label className={styles.taskSearchField}>
            <span>검색</span>
            <input
              aria-label="작업 검색"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="작업 제목 검색"
              value={search}
            />
          </label>

          <div className={styles.taskFilterRow}>
            <select
              aria-label="상태 필터"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="">모든 상태</option>
              {taskStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
            <select
              aria-label="우선순위 필터"
              onChange={(event) => setPriorityFilter(event.target.value)}
              value={priorityFilter}
            >
              <option value="">모든 우선순위</option>
              {taskPriorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priorityLabel(priority)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.dashboardTaskList}>
            {dashboardTasks.length ? (
              dashboardTasks.map((task) => {
                const nextStatus = isCompletedTask(task) ? "todo" : "done";

                return (
                  <article className={styles.dashboardTaskRow} key={task.id}>
                    <input
                      aria-label={`${task.title} 완료 상태 전환`}
                      checked={isCompletedTask(task)}
                      className={styles.dashboardCheckbox}
                      disabled={busyAction !== null}
                      onChange={() =>
                        runMutation(`complete-${task.id}`, () =>
                          client.updateTaskStatus(task.id, nextStatus),
                        )
                      }
                      type="checkbox"
                    />
                    <button
                      className={styles.dashboardTaskTitle}
                      onClick={() => setSelectedTaskId(task.id)}
                      type="button"
                    >
                      <strong>{task.title}</strong>
                      <span>{taskAssigneeLabel(task)}</span>
                    </button>
                    <span
                      className={cx(
                        styles.dashboardStatusPill,
                        dashboardStatusClass(task.status),
                      )}
                    >
                      {dashboardStatusLabel(task.status)}
                    </span>
                    <time dateTime={task.dueDate ?? undefined}>
                      {formatTaskDate(task.dueDate)}
                    </time>
                  </article>
                );
              })
            ) : (
              <p className={styles.emptyState}>
                현재 보기 조건에 맞는 작업이 없습니다.
              </p>
            )}
          </div>

          {isQuickAddOpen ? (
            <form
              className={styles.quickAddTaskForm}
              onSubmit={handleCreateQuickTask}
            >
              <input name="title" placeholder="작업 제목" required />
              <input name="dueDate" type="date" />
              <input name="description" type="hidden" defaultValue="" />
              <input name="status" type="hidden" defaultValue="todo" />
              <input name="priority" type="hidden" defaultValue="medium" />
              <input name="assigneeMemberId" type="hidden" defaultValue="" />
              <input name="milestoneId" type="hidden" defaultValue="" />
              <button
                className={styles.primaryButton}
                disabled={busyAction !== null}
                type="submit"
              >
                만들기
              </button>
              <button
                className={styles.controlButton}
                onClick={() => setIsQuickAddOpen(false)}
                type="button"
              >
                취소
              </button>
            </form>
          ) : (
            <button
              className={styles.addTaskInlineButton}
              onClick={() => setIsQuickAddOpen(true)}
              type="button"
            >
              + 새 작업 추가
            </button>
          )}
        </section>
      </div>

      <details className={styles.advancedTaskTools}>
        <summary>고급 작업 관리</summary>
        <div className={styles.advancedTaskToolsGrid}>
          <section className={styles.stack}>
            <div className={styles.toolbar}>
              <input
                aria-label="작업 검색"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="작업 제목 검색"
                value={search}
              />
              <select
                aria-label="상태 필터"
                onChange={(event) => setStatusFilter(event.target.value)}
                value={statusFilter}
              >
                <option value="">모든 상태</option>
                {taskStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
              <select
                aria-label="우선순위 필터"
                onChange={(event) => setPriorityFilter(event.target.value)}
                value={priorityFilter}
              >
                <option value="">모든 우선순위</option>
                {taskPriorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priorityLabel(priority)}
                  </option>
                ))}
              </select>
              <select
                aria-label="마일스톤 필터"
                onChange={(event) => setMilestoneFilter(event.target.value)}
                value={milestoneFilter}
              >
                <option value="">모든 마일스톤</option>
                {milestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.title}
                  </option>
                ))}
              </select>
            </div>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>작업 목록</h2>
                <span>{filteredTasks.length}개 표시</span>
              </div>
              <div className={styles.taskList}>
                {filteredTasks.length ? (
                  filteredTasks.map((task) => (
                    <article className={styles.taskItem} key={task.id}>
                      <button
                        className={styles.taskButton}
                        onClick={() => setSelectedTaskId(task.id)}
                        type="button"
                      >
                        <strong>{task.title}</strong>
                        <div className={styles.metaRow}>
                          <span
                            className={cx(
                              styles.statusPill,
                              statusClass(task.status),
                            )}
                          >
                            {statusLabel(task.status)}
                          </span>
                          <span
                            className={cx(
                              styles.priorityPill,
                              priorityClass(task.priority),
                            )}
                          >
                            {priorityLabel(task.priority)}
                          </span>
                          <span>{taskAssigneeLabel(task)}</span>
                          <span>마감 {formatDate(task.dueDate)}</span>
                          {task.isDelayed ? <span>지연</span> : null}
                        </div>
                      </button>
                      <div className={styles.buttonRow}>
                        {taskStatuses.map((status) => (
                          <button
                            className={
                              task.status === status
                                ? styles.statusButtonActive
                                : styles.statusButton
                            }
                            disabled={
                              busyAction !== null || task.status === status
                            }
                            key={status}
                            onClick={() =>
                              runMutation(`status-${task.id}`, () =>
                                client.updateTaskStatus(task.id, status),
                              )
                            }
                            type="button"
                          >
                            {statusLabel(status)}
                          </button>
                        ))}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className={styles.emptyState}>
                    조건에 맞는 작업이 없습니다.
                  </p>
                )}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>새 작업</h2>
                <span>실제 런타임 API</span>
              </div>
              <form className={styles.formGrid} onSubmit={handleCreateTask}>
                <label className={styles.wideField}>
                  제목
                  <input
                    name="title"
                    placeholder="예: GitHub 이슈 연결"
                    required
                  />
                </label>
                <label className={styles.wideField}>
                  설명
                  <textarea
                    name="description"
                    placeholder="작업 범위와 확인 조건"
                  />
                </label>
                <label>
                  상태
                  <select defaultValue="todo" name="status">
                    {taskStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  우선순위
                  <select defaultValue="medium" name="priority">
                    {taskPriorities.map((priority) => (
                      <option key={priority} value={priority}>
                        {priorityLabel(priority)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  담당자
                  <select defaultValue="" name="assigneeMemberId">
                    <option value="">미배정</option>
                    {members.map((member) => (
                      <option key={member.memberId} value={member.memberId}>
                        {memberLabel(member)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  마감일
                  <input name="dueDate" type="date" />
                </label>
                <label className={styles.wideField}>
                  마일스톤
                  <select defaultValue="" name="milestoneId">
                    <option value="">마일스톤 없음</option>
                    {milestones.map((milestone) => (
                      <option key={milestone.id} value={milestone.id}>
                        {milestone.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={cx(styles.buttonRow, styles.wideField)}>
                  <button
                    className={styles.primaryButton}
                    disabled={busyAction !== null}
                    type="submit"
                  >
                    작업 만들기
                  </button>
                </div>
              </form>
            </section>
          </section>

          <section className={styles.stack}>
            <TaskDetailPanel
              activityLogs={activityLogs}
              busyAction={busyAction}
              client={client}
              comments={comments}
              onAddChecklist={handleAddChecklist}
              onAddComment={handleAddComment}
              onRefresh={async () => {
                await refreshDomainData();
                await refreshSelectedTask();
              }}
              runMutation={runMutation}
              selectedTask={selectedTask}
              selectedTaskId={selectedTaskId}
            />

            <MilestonePanel
              busyAction={busyAction}
              milestones={milestones}
              onCreateMilestone={handleCreateMilestone}
              runMutation={runMutation}
              client={client}
            />

            <TaskDraftPanel
              busyAction={busyAction}
              client={client}
              drafts={taskDrafts}
              members={members}
              onCreateDraft={handleCreateDraft}
              runMutation={runMutation}
            />
          </section>
        </div>
      </details>
    </div>
  );

  const renderGithub = () => (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>GitHub App 연결</h2>
          <span>실제 런타임 API</span>
        </div>
        <div className={styles.buttonRow}>
          <button
            className={styles.primaryButton}
            disabled={busyAction !== null}
            onClick={handleStartGithubConnection}
            type="button"
          >
            GitHub App 설치 시작
          </button>
          {installUrl ? (
            <a className={styles.externalLink} href={installUrl}>
              설치 URL 열기
            </a>
          ) : null}
        </div>
        <div className={styles.connectionList}>
          {connections.length ? (
            connections.map((connection) => (
              <article className={styles.connectionItem} key={connection.id}>
                <div className={styles.panelHeader}>
                  <h3>
                    {connection.githubAccountLogin ?? connection.provider}
                  </h3>
                  <span>{connection.revokedAt ? "해제됨" : "활성"}</span>
                </div>
                <p className={styles.taskMeta}>
                  설치 ID {connection.installationId ?? "대기 중"} · 권한{" "}
                  {(connection.scopes ?? []).join(", ") || "없음"}
                </p>
                {!connection.revokedAt ? (
                  <button
                    className={styles.dangerButton}
                    disabled={busyAction !== null}
                    onClick={() =>
                      runMutation(`revoke-${connection.id}`, () =>
                        client.revokeGithubConnection(
                          workspaceId,
                          connection.id,
                        ),
                      )
                    }
                    type="button"
                  >
                    연결 해제
                  </button>
                ) : null}
              </article>
            ))
          ) : (
            <p className={styles.emptyState}>
              GitHub App 연결이 아직 없습니다.
            </p>
          )}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>저장소 / 이슈 / PR 읽기 모델</h2>
          <span className={styles.deferredPill}>지연 구현 fixture</span>
        </div>
        <p className={styles.notice}>
          저장소 동기화, 이슈/PR 목록, 변경 파일 원본 API는 계약상 지연
          구현입니다. 이 영역은 공개 읽기 모델 형태를 검증하는 fixture만
          표시합니다.
        </p>
        <div className={styles.twoColumn}>
          <GithubList
            items={githubReadModel?.repositories ?? []}
            title="저장소"
          />
          <GithubList items={githubReadModel?.issues ?? []} title="이슈" />
        </div>
        <GithubList items={githubReadModel?.pullRequests ?? []} title="PR" />
        <GithubList
          items={githubReadModel?.pullRequestChangedFiles ?? []}
          title="변경 파일 원본"
        />
      </section>
    </div>
  );

  const renderProgress = () => {
    const history = buildProgressHistory(progress);

    return (
      <div className={styles.stack}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>진행 요약</h2>
            <span>작업 API 기반 계산</span>
          </div>
          <select
            aria-label="마일스톤 진행률 필터"
            onChange={(event) => setMilestoneFilter(event.target.value)}
            value={milestoneFilter}
          >
            <option value="">모든 마일스톤</option>
            {milestones.map((milestone) => (
              <option key={milestone.id} value={milestone.id}>
                {milestone.title}
              </option>
            ))}
          </select>
          {progress ? (
            <>
              <div className={styles.progressBarTrack}>
                <div
                  className={styles.progressBar}
                  style={{ width: `${Math.min(100, progress.progressRate)}%` }}
                />
              </div>
              <div className={styles.progressGrid}>
                <ProgressCard
                  label="진행률"
                  value={`${progress.progressRate}%`}
                />
                <ProgressCard label="전체" value={progress.totalTasks} />
                <ProgressCard label="완료" value={progress.doneTasks} />
                <ProgressCard label="검토 중" value={progress.reviewTasks} />
                <ProgressCard label="막힘" value={progress.blockedTasks} />
              </div>
              <p className={styles.progressMeta}>
                지연 {progress.delayedTasks}개 · 기준 시각{" "}
                {formatDate(progress.capturedAt)}
              </p>
            </>
          ) : (
            <p className={styles.emptyState}>진행률 계산 대상이 없습니다.</p>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>스냅샷 기록</h2>
            <span className={styles.deferredPill}>지연 구현 모의 데이터</span>
          </div>
          <p className={styles.notice}>
            `/api/workspaces/:workspaceId/progress/history`는 아직 실제 런타임
            API가 아닙니다. 이 목록은 현재 요약을 기준으로 만든 로컬 모의
            데이터입니다.
          </p>
          <div className={styles.historyList}>
            {history.map((snapshot) => (
              <article className={styles.historyItem} key={snapshot.id}>
                <strong>{snapshot.progressRate}%</strong>
                <p className={styles.progressMeta}>
                  {formatDate(snapshot.capturedAt)} · 완료 {snapshot.doneTasks}/
                  {snapshot.totalTasks} · 막힘 {snapshot.blockedTasks}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  };

  return (
    <section className={styles.content}>
      <div className={styles.metaRow} aria-label="작업 데이터 모드">
        <span className={styles.modePill}>{modeLabels[mode] ?? mode}</span>
        {mode === "mock" ? (
          <span className={styles.mockPill}>fixture 경계</span>
        ) : null}
      </div>
      {loading ? (
        <p className={styles.notice}>주형 데이터를 불러오는 중입니다.</p>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {view === "tasks" ? renderTaskBoard() : null}
      {view === "github" ? renderGithub() : null}
      {view === "progress" ? renderProgress() : null}
    </section>
  );
}

function TaskDetailPanel({
  activityLogs,
  busyAction,
  client,
  comments,
  onAddChecklist,
  onAddComment,
  onRefresh,
  runMutation,
  selectedTask,
  selectedTaskId,
}: {
  activityLogs: TaskActivityLog[];
  busyAction: string | null;
  client: ReturnType<typeof createTaskGithubProgressClient>;
  comments: TaskComment[];
  onAddChecklist: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onAddComment: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onRefresh: () => Promise<void>;
  runMutation: (label: string, action: () => Promise<unknown>) => Promise<void>;
  selectedTask: TaskDetail | null;
  selectedTaskId: string | null;
}) {
  if (!selectedTask || !selectedTaskId) {
    return (
      <section className={styles.panel}>
        <p className={styles.emptyState}>작업을 선택하면 상세가 표시됩니다.</p>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <div className={styles.detailTitle}>
        <div className={styles.metaRow}>
          <span
            className={cx(styles.statusPill, statusClass(selectedTask.status))}
          >
            {statusLabel(selectedTask.status)}
          </span>
          <span
            className={cx(
              styles.priorityPill,
              priorityClass(selectedTask.priority),
            )}
          >
            {priorityLabel(selectedTask.priority)}
          </span>
        </div>
        <h2>{selectedTask.title}</h2>
        <p className={styles.taskMeta}>
          {taskAssigneeLabel(selectedTask)} · 마감{" "}
          {formatDate(selectedTask.dueDate)}
        </p>
      </div>
      <div className={styles.buttonRow}>
        {taskStatuses.map((status) => (
          <button
            className={
              selectedTask.status === status
                ? styles.statusButtonActive
                : styles.statusButton
            }
            disabled={busyAction !== null || selectedTask.status === status}
            key={status}
            onClick={() =>
              runMutation(`detail-status-${status}`, () =>
                client.updateTaskStatus(selectedTaskId, status),
              )
            }
            type="button"
          >
            {statusLabel(status)}
          </button>
        ))}
        <button
          className={styles.dangerButton}
          disabled={busyAction !== null}
          onClick={() =>
            runMutation("delete-task", () => client.deleteTask(selectedTaskId))
          }
          type="button"
        >
          삭제
        </button>
      </div>

      <div>
        <div className={styles.panelHeader}>
          <h3>체크리스트</h3>
          <span>{selectedTask.checklistItems?.length ?? 0}</span>
        </div>
        <div className={styles.checklist}>
          {(selectedTask.checklistItems ?? []).map((item) => (
            <label className={styles.checklistItem} key={item.id}>
              <input
                checked={item.status === "done"}
                disabled={busyAction !== null}
                onChange={(event) =>
                  runMutation(`check-${item.id}`, async () => {
                    await client.updateChecklistItem(selectedTaskId, item.id, {
                      status: event.target.checked ? "done" : "todo",
                    });
                    await onRefresh();
                  })
                }
                type="checkbox"
              />
              <span>{item.title}</span>
              <button
                className={styles.ghostButton}
                disabled={busyAction !== null}
                onClick={() =>
                  runMutation(`delete-check-${item.id}`, async () => {
                    await client.deleteChecklistItem(selectedTaskId, item.id);
                    await onRefresh();
                  })
                }
                type="button"
              >
                삭제
              </button>
            </label>
          ))}
        </div>
        <form className={styles.inlineFormCompact} onSubmit={onAddChecklist}>
          <input name="title" placeholder="새 체크리스트 항목" />
          <button
            className={styles.secondaryButton}
            disabled={busyAction !== null}
            type="submit"
          >
            추가
          </button>
        </form>
      </div>

      <div>
        <div className={styles.panelHeader}>
          <h3>댓글</h3>
          <span>{comments.length}</span>
        </div>
        <form className={styles.inlineForm} onSubmit={onAddComment}>
          <textarea name="body" placeholder="작업 댓글을 입력하세요" />
          <button
            className={styles.secondaryButton}
            disabled={busyAction !== null}
            type="submit"
          >
            댓글 추가
          </button>
        </form>
        <div className={styles.logList}>
          {comments.map((comment) => (
            <article className={styles.logItem} key={comment.id}>
              <strong>{comment.author?.name ?? "멤버"}</strong>
              <p className={styles.taskMeta}>{comment.body}</p>
            </article>
          ))}
        </div>
      </div>

      <div>
        <div className={styles.panelHeader}>
          <h3>활동 기록</h3>
          <span>{activityLogs.length}</span>
        </div>
        <div className={styles.logList}>
          {activityLogs.slice(0, 6).map((log) => (
            <article className={styles.logItem} key={log.id}>
              <strong>{activityLabel(log.action)}</strong>
              <p className={styles.taskMeta}>{formatDate(log.createdAt)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function MilestonePanel({
  busyAction,
  client,
  milestones,
  onCreateMilestone,
  runMutation,
}: {
  busyAction: string | null;
  client: ReturnType<typeof createTaskGithubProgressClient>;
  milestones: MilestoneSummary[];
  onCreateMilestone: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  runMutation: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>마일스톤</h2>
        <span>실제 런타임 API</span>
      </div>
      <form className={styles.formGrid} onSubmit={onCreateMilestone}>
        <label className={styles.wideField}>
          제목
          <input name="title" placeholder="예: MVP 백엔드" required />
        </label>
        <label>
          상태
          <select defaultValue="planned" name="status">
            {milestoneStatuses.map((status) => (
              <option key={status} value={status}>
                {milestoneStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label>
          시작일
          <input name="startDate" type="date" />
        </label>
        <label>
          종료일
          <input name="endDate" type="date" />
        </label>
        <div className={cx(styles.buttonRow, styles.wideField)}>
          <button
            className={styles.secondaryButton}
            disabled={busyAction !== null}
            type="submit"
          >
            마일스톤 만들기
          </button>
        </div>
      </form>
      <div className={styles.milestoneList}>
        {milestones.map((milestone) => (
          <article className={styles.milestoneItem} key={milestone.id}>
            <div className={styles.panelHeader}>
              <strong>{milestone.title}</strong>
              <span>{milestoneStatusLabel(milestone.status)}</span>
            </div>
            <p className={styles.taskMeta}>
              {formatDate(milestone.startDate)} -{" "}
              {formatDate(milestone.endDate)}
            </p>
            <div className={styles.buttonRow}>
              {milestoneStatuses.map((status) => (
                <button
                  className={
                    milestone.status === status
                      ? styles.statusButtonActive
                      : styles.statusButton
                  }
                  disabled={busyAction !== null || milestone.status === status}
                  key={status}
                  onClick={() =>
                    runMutation(`milestone-${milestone.id}-${status}`, () =>
                      client.updateMilestone(milestone.id, { status }),
                    )
                  }
                  type="button"
                >
                  {milestoneStatusLabel(status)}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TaskDraftPanel({
  busyAction,
  client,
  drafts,
  members,
  onCreateDraft,
  runMutation,
}: {
  busyAction: string | null;
  client: ReturnType<typeof createTaskGithubProgressClient>;
  drafts: TaskDraftSummary[];
  members: MemberSummary[];
  onCreateDraft: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  runMutation: (label: string, action: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2>작업 초안 승인 대기열</h2>
        <span>생성/승인/거절 API</span>
      </div>
      <p className={styles.notice}>
        작업 초안 목록 API는 지연 구현입니다. 이 큐는 fixture와 이 화면에서
        생성한 초안만 보여줍니다.
      </p>
      <form className={styles.formGrid} onSubmit={onCreateDraft}>
        <label className={styles.wideField}>
          제목
          <input name="title" placeholder="초안 제목" required />
        </label>
        <label className={styles.wideField}>
          설명
          <textarea name="description" placeholder="초안 설명" />
        </label>
        <label>
          담당자
          <select defaultValue="" name="assigneeMemberId">
            <option value="">미배정</option>
            {members.map((member) => (
              <option key={member.memberId} value={member.memberId}>
                {memberLabel(member)}
              </option>
            ))}
          </select>
        </label>
        <label>
          우선순위
          <select defaultValue="medium" name="priority">
            {taskPriorities.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabel(priority)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.wideField}>
          마감일
          <input name="dueDate" type="date" />
        </label>
        <div className={cx(styles.buttonRow, styles.wideField)}>
          <button
            className={styles.secondaryButton}
            disabled={busyAction !== null}
            type="submit"
          >
            초안 만들기
          </button>
        </div>
      </form>
      <div className={styles.draftList}>
        {drafts.map((draft) => (
          <article className={styles.draftItem} key={draft.id}>
            <div className={styles.panelHeader}>
              <strong>{draft.title}</strong>
              <span>{draftStatusLabel(draft.status)}</span>
            </div>
            <p className={styles.taskMeta}>
              {priorityLabel(draft.priority)} · 마감 {formatDate(draft.dueDate)}{" "}
              · 작업 {draft.taskId ?? "-"}
            </p>
            {draft.description ? (
              <p className={styles.taskMeta}>{draft.description}</p>
            ) : null}
            {draft.status === "draft" ? (
              <div className={styles.buttonRow}>
                <button
                  className={styles.primaryButton}
                  disabled={busyAction !== null}
                  onClick={() =>
                    runMutation(`approve-${draft.id}`, () =>
                      client.approveTaskDraft(draft.id),
                    )
                  }
                  type="button"
                >
                  승인
                </button>
                <button
                  className={styles.dangerButton}
                  disabled={busyAction !== null}
                  onClick={() =>
                    runMutation(`reject-${draft.id}`, () =>
                      client.rejectTaskDraft(draft.id),
                    )
                  }
                  type="button"
                >
                  거절
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function GithubList({
  items,
  title,
}: {
  items: Array<Record<string, unknown>>;
  title: string;
}) {
  return (
    <section className={styles.githubList}>
      <div className={styles.panelHeader}>
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      {items.length ? (
        items.map((item, index) => (
          <article className={styles.githubItem} key={String(item.id ?? index)}>
            <strong>
              {String(
                item.title ??
                  item.repoName ??
                  item.path ??
                  item.githubAccountLogin ??
                  "GitHub 항목",
              )}
            </strong>
            <p className={styles.githubMeta}>
              {item.number ? `#${String(item.number)} · ` : ""}
              {githubStateLabel(
                item.state ?? item.status ?? item.defaultBranch ?? "fixture",
              )}
              {item.changes ? ` · 변경 ${String(item.changes)}줄` : ""}
            </p>
            {typeof item.url === "string" ? (
              <a className={styles.externalLink} href={item.url}>
                GitHub에서 열기
              </a>
            ) : null}
          </article>
        ))
      ) : (
        <p className={styles.emptyState}>표시할 fixture 행이 없습니다.</p>
      )}
    </section>
  );
}

function ProgressCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <article className={styles.progressCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
