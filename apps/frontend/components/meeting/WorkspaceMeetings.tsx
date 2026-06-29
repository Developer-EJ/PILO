"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CurrentUserAvatar } from "../auth/CurrentUserAvatar";
import { LogoutButton } from "../auth/LogoutButton";
import { CurrentWorkspaceSwitcher } from "../workspace/CurrentWorkspaceSwitcher";
import { createMeetingClient } from "../../lib/meeting/meetingClient.mjs";
import { createVoiceClient } from "../../lib/voice/voiceClient.mjs";
import { createWorkspaceDashboardFixture } from "../../lib/workspace/dashboardClient.mjs";
import {
  buildWorkspaceFeatureTabs,
  extractWorkspaceIdFromPathname,
} from "../../lib/workspace/currentWorkspace.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";

type MeetingStatus =
  | "scheduled"
  | "in_progress"
  | "ended"
  | "report_generated";
type AgendaStatus = "open" | "done" | "skipped";
type TranscriptSource = "text" | "stt";
type ActionItemStatus = "draft" | "approved" | "converted" | "rejected";
type RecordingStatus =
  | "not_recording"
  | "recording"
  | "processing"
  | "completed"
  | "failed";

type Meeting = {
  id: string;
  workspaceId: string;
  canvasBoardId: string | null;
  title: string;
  purpose: string | null;
  status: MeetingStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdByMemberId: string;
  createdAt: string;
  updatedAt: string;
};

type MeetingAgenda = {
  id: string;
  meetingId: string;
  title: string;
  status: AgendaStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type MeetingMemo = {
  id: string;
  meetingId: string;
  authorMemberId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type TranscriptSegment = {
  id: string;
  meetingId: string;
  speakerMemberId: string | null;
  source: TranscriptSource;
  body: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

type MeetingDecision = {
  id: string;
  reportId: string;
  title: string;
  content: string;
  status: string;
  linkedTaskId: string | null;
  createdAt: string;
};

type MeetingRisk = {
  id: string;
  reportId: string;
  content: string;
  severity: string;
  sortOrder: number;
  createdAt: string;
};

type MeetingNextAgenda = {
  id: string;
  reportId: string;
  title: string;
  sortOrder: number;
  createdAt: string;
};

type MeetingReportSummary = {
  id: string;
  meetingId: string;
  workspaceId: string;
  title: string;
  summary: string;
  decisionCount: number;
  actionItemCount: number;
  riskCount: number;
  createdAt: string;
};

type MeetingReportDetail = MeetingReportSummary & {
  decisions: MeetingDecision[];
  risks: MeetingRisk[];
  nextAgendas: MeetingNextAgenda[];
};

type MeetingActionItem = {
  id: string;
  reportId: string;
  title: string;
  description: string | null;
  assigneeSuggestionMemberId: string | null;
  dueDateSuggestion: string | null;
  status: ActionItemStatus;
  convertedTaskId: string | null;
};

type VoiceRoom = {
  id: string;
  workspaceId: string;
  meetingId: string | null;
  livekitRoomName: string | null;
  status: "active" | "inactive" | "archived";
  createdAt: string;
  updatedAt: string;
};

type VoiceSession = {
  id: string;
  voiceRoomId: string;
  meetingId: string | null;
  memberId: string | null;
  recordingStatus: RecordingStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type TaskDraftResult = {
  actionItem: MeetingActionItem;
  taskDraft: {
    taskId?: string;
    id?: string;
    mode?: string;
    payload?: Record<string, unknown>;
  };
};

const statusActions: { label: string; status: MeetingStatus }[] = [
  { label: "Start", status: "in_progress" },
  { label: "End", status: "ended" },
];

const transcriptSources: { label: string; value: TranscriptSource }[] = [
  { label: "Text", value: "text" },
  { label: "STT", value: "stt" },
];

const recordingStatuses: RecordingStatus[] = [
  "not_recording",
  "recording",
  "processing",
  "completed",
  "failed",
];

function resolveWorkspaceId(pathname: string) {
  return extractWorkspaceIdFromPathname(pathname) ?? mockWorkspaces[0].id;
}

function formatDateTime(value: string | null) {
  if (!value) return "Not set";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not set";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

function activeSessionFrom(sessions: VoiceSession[]) {
  return sessions.find((session) => session.endedAt === null) ?? null;
}

function panelCount(label: string, value: number) {
  return (
    <span className="meetings-panel-count">
      {label} <b>{value}</b>
    </span>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="meetings-empty">{children}</p>;
}

export function WorkspaceMeetings() {
  const pathname = usePathname() ?? "/";
  const workspaceId = useMemo(() => resolveWorkspaceId(pathname), [pathname]);
  const dashboard = useMemo(
    () => createWorkspaceDashboardFixture(workspaceId),
    [workspaceId],
  );
  const meetingClient = useMemo(() => createMeetingClient(), []);
  const voiceClient = useMemo(() => createVoiceClient(), []);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(
    null,
  );
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [agendas, setAgendas] = useState<MeetingAgenda[]>([]);
  const [memos, setMemos] = useState<MeetingMemo[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [recentReports, setRecentReports] = useState<MeetingReportSummary[]>(
    [],
  );
  const navItems = useMemo(
    () =>
      buildWorkspaceFeatureTabs(workspaceId, {
        active: "meetings",
        badges: {
          tasks: dashboard.tasks.length,
          meetings: recentReports.length || undefined,
          github: dashboard.pullRequests.length || undefined,
          reviews: dashboard.pullRequests.length || undefined,
        },
      }),
    [
      dashboard.pullRequests.length,
      dashboard.tasks.length,
      recentReports.length,
      workspaceId,
    ],
  );
  const [report, setReport] = useState<MeetingReportDetail | null>(null);
  const [actionItems, setActionItems] = useState<MeetingActionItem[]>([]);
  const [voiceRoom, setVoiceRoom] = useState<VoiceRoom | null>(null);
  const [voiceSessions, setVoiceSessions] = useState<VoiceSession[]>([]);
  const [lastTaskDraft, setLastTaskDraft] = useState<TaskDraftResult | null>(
    null,
  );
  const [title, setTitle] = useState("MVP meeting follow-up");
  const [purpose, setPurpose] = useState("Turn notes into decisions and tasks.");
  const [agendaTitle, setAgendaTitle] = useState("Confirm next owner handoff");
  const [memoBody, setMemoBody] = useState(
    "Capture the decision and keep downstream writes behind public contracts.",
  );
  const [transcriptBody, setTranscriptBody] = useState(
    "This transcript segment can be manual or mock STT.",
  );
  const [transcriptSource, setTranscriptSource] =
    useState<TranscriptSource>("text");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMeetingDetail = useCallback(
    async (
      meetingId: string,
      reports: MeetingReportSummary[] = recentReports,
    ) => {
      const [meeting, nextAgendas, nextMemos, nextTranscripts] =
        await Promise.all([
          meetingClient.getMeeting(meetingId),
          meetingClient.listAgendas(meetingId),
          meetingClient.listMemos(meetingId),
          meetingClient.listTranscriptSegments(meetingId),
        ]);
      const reportSummary =
        reports.find((candidate) => candidate.meetingId === meetingId) ?? null;
      const nextReport = reportSummary
        ? await meetingClient.getReport(reportSummary.id)
        : null;
      const nextActionItems = nextReport
        ? await meetingClient.listActionItems(nextReport.id)
        : [];

      setSelectedMeeting(meeting as Meeting);
      setAgendas(nextAgendas as MeetingAgenda[]);
      setMemos(nextMemos as MeetingMemo[]);
      setTranscripts(nextTranscripts as TranscriptSegment[]);
      setReport(nextReport as MeetingReportDetail | null);
      setActionItems(nextActionItems as MeetingActionItem[]);
    },
    [meetingClient, recentReports],
  );

  const loadWorkspace = useCallback(
    async (preferredMeetingId?: string | null) => {
      setIsLoading(true);
      setError(null);

      try {
        const [nextMeetings, nextReports] = await Promise.all([
          meetingClient.listMeetings(workspaceId),
          meetingClient.listRecentReports(workspaceId),
        ]);
        const meetingList = nextMeetings as Meeting[];
        const reportList = nextReports as MeetingReportSummary[];
        const nextSelected =
          meetingList.find((meeting) => meeting.id === preferredMeetingId) ??
          meetingList[0] ??
          null;

        setMeetings(meetingList);
        setRecentReports(reportList);
        setSelectedMeetingId(nextSelected?.id ?? null);

        if (nextSelected) {
          await loadMeetingDetail(nextSelected.id, reportList);
        } else {
          setSelectedMeeting(null);
          setAgendas([]);
          setMemos([]);
          setTranscripts([]);
          setReport(null);
          setActionItems([]);
        }
      } catch (loadError) {
        setError("Meeting workspace could not be loaded.");
      } finally {
        setIsLoading(false);
      }
    },
    [loadMeetingDetail, meetingClient, workspaceId],
  );

  useEffect(() => {
    void loadWorkspace(selectedMeetingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (!selectedMeetingId) return;

    setVoiceRoom(null);
    setVoiceSessions([]);
    setLastTaskDraft(null);
  }, [selectedMeetingId]);

  async function runAction(action: () => Promise<void>, success: string) {
    if (isWorking) return;

    setIsWorking(true);
    setError(null);

    try {
      await action();
      setNotice(success);
    } catch (actionError) {
      setError("The meeting action could not be completed.");
    } finally {
      setIsWorking(false);
    }
  }

  async function createMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runAction(async () => {
      const meeting = (await meetingClient.createMeeting(workspaceId, {
        title,
        purpose,
      })) as Meeting;

      setTitle("MVP meeting follow-up");
      setPurpose("Turn notes into decisions and tasks.");
      await loadWorkspace(meeting.id);
    }, "Meeting created.");
  }

  async function selectMeeting(meetingId: string) {
    setSelectedMeetingId(meetingId);
    setIsLoading(true);
    setError(null);

    try {
      await loadMeetingDetail(meetingId);
    } catch (loadError) {
      setError("Meeting detail could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  async function updateMeetingStatus(status: MeetingStatus) {
    if (!selectedMeeting) return;

    await runAction(async () => {
      await meetingClient.updateMeetingStatus(selectedMeeting.id, status);
      await loadWorkspace(selectedMeeting.id);
    }, `Meeting marked ${formatStatus(status)}.`);
  }

  async function addAgenda(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedMeeting) return;

    await runAction(async () => {
      await meetingClient.createAgenda(selectedMeeting.id, {
        title: agendaTitle,
      });
      setAgendaTitle("");
      await loadMeetingDetail(selectedMeeting.id);
    }, "Agenda added.");
  }

  async function toggleAgenda(agenda: MeetingAgenda) {
    if (!selectedMeeting) return;

    const nextStatus = agenda.status === "done" ? "open" : "done";

    await runAction(async () => {
      await meetingClient.updateAgendaStatus(
        selectedMeeting.id,
        agenda.id,
        nextStatus,
      );
      await loadMeetingDetail(selectedMeeting.id);
    }, "Agenda updated.");
  }

  async function addMemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedMeeting) return;

    await runAction(async () => {
      await meetingClient.createMemo(selectedMeeting.id, {
        body: memoBody,
      });
      setMemoBody("");
      await loadMeetingDetail(selectedMeeting.id);
    }, "Memo saved.");
  }

  async function addTranscript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedMeeting) return;

    await runAction(async () => {
      await meetingClient.createTranscriptSegment(selectedMeeting.id, {
        source: transcriptSource,
        body: transcriptBody,
      });
      setTranscriptBody("");
      await loadMeetingDetail(selectedMeeting.id);
    }, "Transcript segment added.");
  }

  async function requestReportGeneration() {
    if (!selectedMeeting) return;

    await runAction(async () => {
      const generatedReport = (await meetingClient.requestReportGeneration(
        selectedMeeting.id,
      )) as MeetingReportDetail;
      const nextReports = (await meetingClient.listRecentReports(
        workspaceId,
      )) as MeetingReportSummary[];
      const nextActionItems = (await meetingClient.listActionItems(
        generatedReport.id,
      )) as MeetingActionItem[];

      setReport(generatedReport);
      setRecentReports(nextReports);
      setActionItems(nextActionItems);
      await loadWorkspace(selectedMeeting.id);
    }, "Report generated.");
  }

  async function ensureVoiceRoom() {
    if (!selectedMeeting) return;

    await runAction(async () => {
      const room = (await voiceClient.createVoiceRoom(
        workspaceId,
        selectedMeeting.id,
      )) as VoiceRoom;
      const sessions = (await voiceClient.listVoiceSessions(
        room.id,
      )) as VoiceSession[];

      setVoiceRoom(room);
      setVoiceSessions(sessions);
    }, "Voice room ready.");
  }

  async function joinVoiceSession() {
    if (!voiceRoom) return;

    await runAction(async () => {
      await voiceClient.joinVoiceSession(voiceRoom.id);
      const sessions = (await voiceClient.listVoiceSessions(
        voiceRoom.id,
      )) as VoiceSession[];

      setVoiceSessions(sessions);
    }, "Voice session joined.");
  }

  async function updateRecordingStatus(recordingStatus: RecordingStatus) {
    const activeSession = activeSessionFrom(voiceSessions);

    if (!activeSession || !voiceRoom) return;

    await runAction(async () => {
      await voiceClient.updateRecordingStatus(activeSession.id, recordingStatus);
      const sessions = (await voiceClient.listVoiceSessions(
        voiceRoom.id,
      )) as VoiceSession[];

      setVoiceSessions(sessions);
    }, `Recording marked ${formatStatus(recordingStatus)}.`);
  }

  async function leaveVoiceSession() {
    const activeSession = activeSessionFrom(voiceSessions);

    if (!activeSession || !voiceRoom) return;

    await runAction(async () => {
      await voiceClient.leaveVoiceSession(activeSession.id);
      const sessions = (await voiceClient.listVoiceSessions(
        voiceRoom.id,
      )) as VoiceSession[];

      setVoiceSessions(sessions);
    }, "Voice session ended.");
  }

  async function appendMockSttTranscript() {
    if (!selectedMeeting) return;

    await runAction(async () => {
      await meetingClient.createTranscriptSegment(selectedMeeting.id, {
        source: "stt",
        body: "Mock STT completed and produced a transcript segment.",
        startedAt: new Date(Date.now() - 7000).toISOString(),
        endedAt: new Date().toISOString(),
      });
      await loadMeetingDetail(selectedMeeting.id);
    }, "Mock STT transcript appended.");
  }

  async function approveActionItem(actionItemId: string) {
    if (!report || !selectedMeeting) return;

    await runAction(async () => {
      await meetingClient.approveActionItem(actionItemId);
      const nextActionItems = (await meetingClient.listActionItems(
        report.id,
      )) as MeetingActionItem[];

      setActionItems(nextActionItems);
      await loadMeetingDetail(selectedMeeting.id);
    }, "Action item approved.");
  }

  async function requestTaskDraft(actionItemId: string) {
    if (!report || !selectedMeeting) return;

    await runAction(async () => {
      const result = (await meetingClient.requestActionItemTaskDraft(
        actionItemId,
      )) as TaskDraftResult;
      const nextActionItems = (await meetingClient.listActionItems(
        report.id,
      )) as MeetingActionItem[];

      setLastTaskDraft(result);
      setActionItems(nextActionItems);
      await loadMeetingDetail(selectedMeeting.id);
    }, "Task draft requested.");
  }

  const activeSession = activeSessionFrom(voiceSessions);
  const selectedReportSummary =
    selectedMeeting && report
      ? recentReports.find((candidate) => candidate.id === report.id)
      : null;

  return (
    <main className="dashboard-shell meetings-shell">
      <aside className="sidebar" aria-label="PILO navigation">
        <div className="brand">
          <CurrentWorkspaceSwitcher />
        </div>
        <nav className="nav-list" aria-label="Workspace navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.active ? "nav-item active" : "nav-item"}
              aria-current={item.active ? "page" : undefined}
            >
              <span>{item.label}</span>
              {item.badge ? <b>{item.badge}</b> : null}
            </Link>
          ))}
        </nav>
      </aside>

      <section className="workspace meetings-workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">MEETINGS</p>
            <h1>Meeting workspace</h1>
          </div>
          <div className="topbar-actions">
            <div className="meeting-chip">
              <span className="live-dot" />
              {selectedMeeting?.status
                ? formatStatus(selectedMeeting.status)
                : "ready"}
            </div>
            <LogoutButton />
            <CurrentUserAvatar />
          </div>
        </header>

        <section className="meetings-content" aria-label="Meeting workspace">
          {error ? <div className="meetings-alert">{error}</div> : null}
          {notice ? <div className="meetings-notice">{notice}</div> : null}

          <section className="meetings-command-row">
            <form className="meetings-create-panel" onSubmit={createMeeting}>
              <label htmlFor="meeting-title">New meeting</label>
              <div className="meetings-form-grid">
                <input
                  id="meeting-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Meeting title"
                />
                <input
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  placeholder="Purpose"
                />
                <button type="submit" disabled={isWorking}>
                  Create
                </button>
              </div>
            </form>

            <div className="meetings-status-strip" aria-label="Meeting counts">
              <div>
                <span>Meetings</span>
                <strong>{meetings.length}</strong>
              </div>
              <div>
                <span>Reports</span>
                <strong>{recentReports.length}</strong>
              </div>
              <div>
                <span>Open actions</span>
                <strong>
                  {actionItems.filter((item) => item.status !== "converted")
                    .length}
                </strong>
              </div>
            </div>
          </section>

          <section className="meetings-main-grid">
            <aside className="meetings-list-panel" aria-label="Meeting list">
              <header>
                <h2>Meetings</h2>
                <span>{isLoading ? "Loading" : "Ready"}</span>
              </header>
              <div className="meetings-list">
                {!meetings.length && !isLoading ? (
                  <EmptyState>No meetings yet.</EmptyState>
                ) : null}
                {meetings.map((meeting) => (
                  <button
                    type="button"
                    key={meeting.id}
                    className={
                      meeting.id === selectedMeetingId
                        ? "meetings-list-item active"
                        : "meetings-list-item"
                    }
                    onClick={() => void selectMeeting(meeting.id)}
                  >
                    <span>{formatStatus(meeting.status)}</span>
                    <strong>{meeting.title}</strong>
                    <small>{formatDateTime(meeting.updatedAt)}</small>
                  </button>
                ))}
              </div>

              <section className="meetings-recent-panel">
                <h2>Recent reports</h2>
                {recentReports.length ? (
                  recentReports.map((recentReport) => (
                    <button
                      key={recentReport.id}
                      type="button"
                      onClick={() => void selectMeeting(recentReport.meetingId)}
                      className={
                        recentReport.id === selectedReportSummary?.id
                          ? "meetings-report-link active"
                          : "meetings-report-link"
                      }
                    >
                      <strong>{recentReport.title}</strong>
                      <span>
                        {recentReport.decisionCount} decisions /{" "}
                        {recentReport.actionItemCount} actions /{" "}
                        {recentReport.riskCount} risks
                      </span>
                    </button>
                  ))
                ) : (
                  <EmptyState>No generated reports.</EmptyState>
                )}
              </section>
            </aside>

            <section className="meetings-detail-area">
              {selectedMeeting ? (
                <>
                  <header className="meetings-detail-head">
                    <div>
                      <span>{formatStatus(selectedMeeting.status)}</span>
                      <h2>{selectedMeeting.title}</h2>
                      <p>{selectedMeeting.purpose ?? "No purpose set."}</p>
                    </div>
                    <div className="meetings-head-actions">
                      {statusActions.map((action) => (
                        <button
                          key={action.status}
                          type="button"
                          disabled={
                            isWorking ||
                            selectedMeeting.status === action.status ||
                            selectedMeeting.status === "report_generated"
                          }
                          onClick={() => void updateMeetingStatus(action.status)}
                        >
                          {action.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="primary"
                        disabled={isWorking}
                        onClick={() => void requestReportGeneration()}
                      >
                        Generate report
                      </button>
                    </div>
                  </header>

                  <section className="meetings-detail-grid">
                    <section className="meetings-panel">
                      <header>
                        <h3>Agenda</h3>
                        {panelCount("items", agendas.length)}
                      </header>
                      <form onSubmit={addAgenda} className="meetings-inline-form">
                        <input
                          value={agendaTitle}
                          onChange={(event) =>
                            setAgendaTitle(event.target.value)
                          }
                          placeholder="Agenda item"
                        />
                        <button type="submit" disabled={isWorking}>
                          Add
                        </button>
                      </form>
                      <div className="meetings-agenda-list">
                        {agendas.length ? (
                          agendas.map((agenda) => (
                            <button
                              key={agenda.id}
                              type="button"
                              className={
                                agenda.status === "done"
                                  ? "meetings-agenda done"
                                  : "meetings-agenda"
                              }
                              onClick={() => void toggleAgenda(agenda)}
                            >
                              <span>{agenda.sortOrder + 1}</span>
                              <strong>{agenda.title}</strong>
                              <b>{formatStatus(agenda.status)}</b>
                            </button>
                          ))
                        ) : (
                          <EmptyState>No agenda items.</EmptyState>
                        )}
                      </div>
                    </section>

                    <section className="meetings-panel">
                      <header>
                        <h3>Memos</h3>
                        {panelCount("notes", memos.length)}
                      </header>
                      <form onSubmit={addMemo} className="meetings-stack-form">
                        <textarea
                          value={memoBody}
                          onChange={(event) => setMemoBody(event.target.value)}
                          placeholder="Memo"
                          rows={4}
                        />
                        <button type="submit" disabled={isWorking}>
                          Save memo
                        </button>
                      </form>
                      <div className="meetings-note-list">
                        {memos.length ? (
                          memos.map((memo) => (
                            <article key={memo.id}>
                              <p>{memo.body}</p>
                              <time dateTime={memo.createdAt}>
                                {formatDateTime(memo.createdAt)}
                              </time>
                            </article>
                          ))
                        ) : (
                          <EmptyState>No memos.</EmptyState>
                        )}
                      </div>
                    </section>

                    <section className="meetings-panel">
                      <header>
                        <h3>Voice session</h3>
                        <span className="meetings-panel-count">
                          {voiceRoom ? formatStatus(voiceRoom.status) : "closed"}
                        </span>
                      </header>
                      <div className="meetings-voice-actions">
                        <button
                          type="button"
                          onClick={() => void ensureVoiceRoom()}
                          disabled={isWorking}
                        >
                          Open room
                        </button>
                        <button
                          type="button"
                          onClick={() => void joinVoiceSession()}
                          disabled={isWorking || !voiceRoom || Boolean(activeSession)}
                        >
                          Join
                        </button>
                        <button
                          type="button"
                          onClick={() => void leaveVoiceSession()}
                          disabled={isWorking || !activeSession}
                        >
                          Leave
                        </button>
                      </div>
                      <div className="meetings-recording-controls">
                        {recordingStatuses.map((recordingStatus) => (
                          <button
                            key={recordingStatus}
                            type="button"
                            className={
                              activeSession?.recordingStatus === recordingStatus
                                ? "active"
                                : ""
                            }
                            disabled={isWorking || !activeSession}
                            onClick={() =>
                              void updateRecordingStatus(recordingStatus)
                            }
                          >
                            {formatStatus(recordingStatus)}
                          </button>
                        ))}
                      </div>
                      <div className="meetings-voice-state">
                        <span>Room</span>
                        <code>{voiceRoom?.id ?? "not-open"}</code>
                        <span>Session</span>
                        <code>{activeSession?.id ?? "not-joined"}</code>
                      </div>
                      <button
                        type="button"
                        className="meetings-wide-button"
                        onClick={() => void appendMockSttTranscript()}
                        disabled={isWorking}
                      >
                        Append mock STT segment
                      </button>
                    </section>

                    <section className="meetings-panel">
                      <header>
                        <h3>Transcript</h3>
                        {panelCount("segments", transcripts.length)}
                      </header>
                      <form
                        onSubmit={addTranscript}
                        className="meetings-stack-form"
                      >
                        <div className="meetings-segmented">
                          {transcriptSources.map((source) => (
                            <button
                              key={source.value}
                              type="button"
                              className={
                                transcriptSource === source.value
                                  ? "active"
                                  : ""
                              }
                              onClick={() => setTranscriptSource(source.value)}
                            >
                              {source.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={transcriptBody}
                          onChange={(event) =>
                            setTranscriptBody(event.target.value)
                          }
                          placeholder="Transcript segment"
                          rows={4}
                        />
                        <button type="submit" disabled={isWorking}>
                          Add segment
                        </button>
                      </form>
                      <div className="meetings-transcript-list">
                        {transcripts.length ? (
                          transcripts.map((segment) => (
                            <article key={segment.id}>
                              <span>{segment.source.toUpperCase()}</span>
                              <p>{segment.body}</p>
                              <time dateTime={segment.createdAt}>
                                {formatDateTime(segment.createdAt)}
                              </time>
                            </article>
                          ))
                        ) : (
                          <EmptyState>No transcript segments.</EmptyState>
                        )}
                      </div>
                    </section>

                    <section className="meetings-panel meetings-report-panel">
                      <header>
                        <h3>Report</h3>
                        {report ? (
                          <span className="meetings-panel-count">
                            {formatDateTime(report.createdAt)}
                          </span>
                        ) : (
                          <span className="meetings-panel-count">draft</span>
                        )}
                      </header>
                      {report ? (
                        <div className="meetings-report-body">
                          <p>{report.summary}</p>
                          <div className="meetings-report-columns">
                            <div>
                              <h4>Decisions</h4>
                              {report.decisions.length ? (
                                report.decisions.map((decision) => (
                                  <span key={decision.id}>
                                    {decision.content}
                                  </span>
                                ))
                              ) : (
                                <small>None</small>
                              )}
                            </div>
                            <div>
                              <h4>Risks</h4>
                              {report.risks.length ? (
                                report.risks.map((risk) => (
                                  <span key={risk.id}>{risk.content}</span>
                                ))
                              ) : (
                                <small>None</small>
                              )}
                            </div>
                            <div>
                              <h4>Next agenda</h4>
                              {report.nextAgendas.length ? (
                                report.nextAgendas.map((nextAgenda) => (
                                  <span key={nextAgenda.id}>
                                    {nextAgenda.title}
                                  </span>
                                ))
                              ) : (
                                <small>None</small>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <EmptyState>No report for this meeting.</EmptyState>
                      )}
                    </section>

                    <section className="meetings-panel meetings-actions-panel">
                      <header>
                        <h3>Action items</h3>
                        {panelCount("items", actionItems.length)}
                      </header>
                      <div className="meetings-action-list">
                        {actionItems.length ? (
                          actionItems.map((actionItem) => (
                            <article key={actionItem.id}>
                              <div>
                                <span>{formatStatus(actionItem.status)}</span>
                                <strong>{actionItem.title}</strong>
                                <p>
                                  {actionItem.description ??
                                    "No description provided."}
                                </p>
                                <small>
                                  Due {actionItem.dueDateSuggestion ?? "not set"}
                                </small>
                              </div>
                              <div className="meetings-action-buttons">
                                <button
                                  type="button"
                                  disabled={
                                    isWorking || actionItem.status !== "draft"
                                  }
                                  onClick={() =>
                                    void approveActionItem(actionItem.id)
                                  }
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="primary"
                                  disabled={
                                    isWorking ||
                                    actionItem.status !== "approved"
                                  }
                                  onClick={() =>
                                    void requestTaskDraft(actionItem.id)
                                  }
                                >
                                  Task draft
                                </button>
                              </div>
                            </article>
                          ))
                        ) : (
                          <EmptyState>No action items.</EmptyState>
                        )}
                      </div>
                      {lastTaskDraft ? (
                        <div className="meetings-task-draft">
                          <strong>Task draft request</strong>
                          <code>
                            {lastTaskDraft.taskDraft.taskId ??
                              lastTaskDraft.taskDraft.id ??
                              "pending"}
                          </code>
                          <pre>
                            {JSON.stringify(
                              lastTaskDraft.taskDraft.payload ??
                                lastTaskDraft.taskDraft,
                              null,
                              2,
                            )}
                          </pre>
                        </div>
                      ) : null}
                    </section>
                  </section>
                </>
              ) : (
                <section className="meetings-empty-detail">
                  <h2>No meeting selected</h2>
                  <p>Create or select a meeting to start the workflow.</p>
                </section>
              )}
            </section>
          </section>
        </section>
      </section>
    </main>
  );
}
