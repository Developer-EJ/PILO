"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createMeetingClient, MeetingApiError } from "../../lib/meeting/meetingClient.mjs";
import {
  actionItemStatusLabel,
  recordingStatusLabel,
  riskSeverityLabel,
  voiceRoomStatusLabel,
} from "../../lib/meeting/meetingLabels";
import type {
  MeetingActionItem,
  MeetingRecord,
  MeetingReportDetail,
  MeetingReportSummary,
  VoiceRoom,
  VoiceSession,
} from "../../lib/meeting/meetingTypes";
import styles from "./meeting.module.css";

type LoadState = "idle" | "loading" | "ready" | "error";
type ReportFilter = "all" | "actions" | "risks";

const LOCAL_MEMBER_ID = "local-current-user";
const LOCAL_MEMBER_LABEL = "현재 사용자";

function workspaceMeetingsHref(workspaceId: string) {
  return `/workspaces/${encodeURIComponent(workspaceId)}/meetings`;
}

function voiceHref(workspaceId: string) {
  return `${workspaceMeetingsHref(workspaceId)}/voice`;
}

function reportsHref(workspaceId: string, reportId?: string) {
  const baseHref = `${workspaceMeetingsHref(workspaceId)}/reports`;

  if (!reportId) return baseHref;

  return `${baseHref}?${new URLSearchParams({ reportId }).toString()}`;
}

function messageFromError(error: unknown) {
  if (error instanceof MeetingApiError) {
    return `요청 처리 중 오류가 발생했습니다${error.status ? ` (${error.status})` : ""}.`;
  }

  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function reportTitle(report: MeetingReportSummary | MeetingReportDetail) {
  return report.title || "제목 없는 회의록";
}

function activeSessionFrom(sessions: VoiceSession[]) {
  return sessions.find((session) => session.endedAt === null) ?? null;
}

function activeSessionsFrom(sessions: VoiceSession[]) {
  return sessions.filter((session) => session.endedAt === null);
}

function EmptyState({
  action,
  text,
}: {
  action?: ReactNode;
  text: string;
}) {
  return (
    <div className={styles.experienceEmptyState}>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function VoiceMeetingsPage({ workspaceId }: { workspaceId: string }) {
  const meetingClient = useMemo(() => createMeetingClient(), []);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(
    null,
  );
  const [voiceRoom, setVoiceRoom] = useState<VoiceRoom | null>(null);
  const [voiceSessions, setVoiceSessions] = useState<VoiceSession[]>([]);
  const [voiceFlowReady, setVoiceFlowReady] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("오늘의 음성 회의");
  const localActiveSessionRef = useRef<VoiceSession | null>(null);
  const voiceJoinSyncTokenRef = useRef(0);

  const selectedMeeting =
    meetings.find((meeting) => meeting.id === selectedMeetingId) ?? null;
  const activeVoiceSessions = activeSessionsFrom(voiceSessions);
  const visibleVoiceSessions = voiceFlowReady ? activeVoiceSessions : [];
  const activeSession = activeSessionFrom(voiceSessions);
  const visibleActiveSession = activeSessionFrom(visibleVoiceSessions);
  const busy = loadState === "loading" || busyAction !== null;

  function nowIso() {
    return new Date().toISOString();
  }

  function localVoiceRoomFor(meetingId: string): VoiceRoom {
    const now = nowIso();

    return {
      id: `local-voice-room-${meetingId}`,
      workspaceId,
      meetingId,
      livekitRoomName: "로컬 음성 회의방",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
  }

  function localMeetingRecord(title: string): MeetingRecord {
    const now = nowIso();

    return {
      id: `local-meeting-${Date.now()}`,
      workspaceId,
      canvasBoardId: null,
      title,
      purpose: "음성 회의",
      status: "scheduled",
      startedAt: null,
      endedAt: null,
      createdByMemberId: LOCAL_MEMBER_ID,
      createdAt: now,
      updatedAt: now,
    };
  }

  function localVoiceSessionFor(room: VoiceRoom): VoiceSession {
    const now = nowIso();

    return {
      id: `local-voice-session-${room.meetingId ?? room.id}`,
      voiceRoomId: room.id,
      meetingId: room.meetingId,
      memberId: LOCAL_MEMBER_ID,
      recordingStatus: "not_recording",
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  function upsertVoiceSession(
    sessions: VoiceSession[],
    session: VoiceSession,
  ) {
    return [
      ...sessions.filter((candidate) => candidate.id !== session.id),
      session,
    ];
  }

  function mergeCurrentUserSession(
    sessions: VoiceSession[],
    room: VoiceRoom,
    preferredLocalSession?: VoiceSession | null,
  ) {
    const hasCurrentActiveSession = sessions.some(
      (session) => session.endedAt === null,
    );

    if (hasCurrentActiveSession) return sessions;

    const localSession =
      preferredLocalSession &&
      preferredLocalSession.voiceRoomId === room.id &&
      preferredLocalSession.endedAt === null
        ? preferredLocalSession
        : localVoiceSessionFor(room);

    return upsertVoiceSession(sessions, localSession);
  }

  function markSessionLeft(sessions: VoiceSession[], sessionId: string) {
    const leftAt = nowIso();

    return sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            endedAt: session.endedAt ?? leftAt,
            updatedAt: leftAt,
          }
        : session,
    );
  }

  function voiceSessionMemberLabel(session: VoiceSession) {
    if (
      session.memberId === LOCAL_MEMBER_ID ||
      (session.id === activeSession?.id && session.endedAt === null)
    ) {
      return LOCAL_MEMBER_LABEL;
    }

    return session.memberId ?? "익명 참여자";
  }

  function applyVoiceSessions(
    sessions: VoiceSession[],
    options: { preserveLocalActive?: boolean; voiceRoomId?: string } = {},
  ) {
    const localActiveSession = localActiveSessionRef.current;
    const shouldPreserveLocalActive =
      options.preserveLocalActive !== false &&
      localActiveSession !== null &&
      localActiveSession.endedAt === null &&
      !activeSessionFrom(sessions) &&
      (!options.voiceRoomId ||
        localActiveSession.voiceRoomId === options.voiceRoomId);
    const nextSessions = shouldPreserveLocalActive
      ? upsertVoiceSession(sessions, localActiveSession)
      : sessions;

    setVoiceSessions(nextSessions);
  }

  async function loadVoiceState(meetingId: string) {
    try {
      const room = (await meetingClient.getVoiceRoomForMeeting(
        workspaceId,
        meetingId,
      )) as VoiceRoom;
      const sessions = (await meetingClient.listVoiceSessions(
        room.id,
      )) as VoiceSession[];

      setVoiceRoom(room);
      applyVoiceSessions(sessions, { voiceRoomId: room.id });
    } catch (loadError) {
      if (loadError instanceof MeetingApiError && loadError.status === 404) {
        setVoiceRoom(null);
        localActiveSessionRef.current = null;
        applyVoiceSessions([], { preserveLocalActive: false });
        return;
      }

      throw loadError;
    }
  }

  async function syncJoinedVoiceSession(
    room: VoiceRoom,
    optimisticSessions: VoiceSession[],
    syncToken: number,
  ) {
    try {
      await meetingClient.joinVoiceSession(room.id);
      const nextSessions = (await meetingClient.listVoiceSessions(
        room.id,
      )) as VoiceSession[];

      if (voiceJoinSyncTokenRef.current !== syncToken) return;

      if (activeSessionFrom(nextSessions)) {
        localActiveSessionRef.current = null;
        applyVoiceSessions(nextSessions, {
          preserveLocalActive: false,
          voiceRoomId: room.id,
        });
        setFallbackNotice(null);
        return;
      }

      const mergedSessions = mergeCurrentUserSession(
        nextSessions,
        room,
        localActiveSessionRef.current,
      );
      localActiveSessionRef.current =
        mergedSessions.find(
          (session) =>
            session.memberId === LOCAL_MEMBER_ID && session.endedAt === null,
        ) ?? localActiveSessionRef.current;
      applyVoiceSessions(mergedSessions, { voiceRoomId: room.id });
      setFallbackNotice(
        "서버 세션 목록이 아직 갱신되지 않아 로컬 참여 상태를 유지합니다.",
      );
    } catch {
      if (voiceJoinSyncTokenRef.current !== syncToken) return;

      const mergedSessions = mergeCurrentUserSession(
        optimisticSessions,
        room,
        localActiveSessionRef.current,
      );
      localActiveSessionRef.current =
        mergedSessions.find(
          (session) =>
            session.memberId === LOCAL_MEMBER_ID && session.endedAt === null,
        ) ?? localActiveSessionRef.current;
      applyVoiceSessions(mergedSessions, { voiceRoomId: room.id });
      setFallbackNotice(
        "서버 참여 요청이 완료되지 않아 이 화면에서 로컬 참여 상태로 반영했습니다.",
      );
    }
  }

  async function loadMeetings(preferredMeetingId?: string | null) {
    setLoadState("loading");
    setError(null);

    try {
      const nextMeetings = (await meetingClient.listMeetings(
        workspaceId,
      )) as MeetingRecord[];
      const nextSelectedMeetingId =
        preferredMeetingId &&
        nextMeetings.some((meeting) => meeting.id === preferredMeetingId)
          ? preferredMeetingId
          : nextMeetings[0]?.id ?? null;

      setMeetings(nextMeetings);
      setSelectedMeetingId(nextSelectedMeetingId);

      if (nextSelectedMeetingId) {
        await loadVoiceState(nextSelectedMeetingId);
      } else {
        setVoiceRoom(null);
        localActiveSessionRef.current = null;
        applyVoiceSessions([], { preserveLocalActive: false });
      }

      setLoadState("ready");
    } catch (loadError) {
      setError(messageFromError(loadError));
      setLoadState("error");
    }
  }

  async function runAction(
    label: string,
    action: () => Promise<void>,
    success: string,
  ) {
    setBusyAction(label);
    setError(null);
    setNotice(null);
    setFallbackNotice(null);

    try {
      await action();
      setNotice(success);
    } catch (actionError) {
      setError(messageFromError(actionError));
    } finally {
      setBusyAction(null);
    }
  }

  async function ensureVoiceRoom(meetingId: string) {
    if (voiceRoom && voiceRoom.meetingId === meetingId) {
      return voiceRoom;
    }

    try {
      const room = (await meetingClient.createVoiceRoom(
        workspaceId,
        meetingId,
      )) as VoiceRoom;
      setVoiceRoom(room);
      applyVoiceSessions(
        (await meetingClient.listVoiceSessions(room.id)) as VoiceSession[],
        { voiceRoomId: room.id },
      );

      return room;
    } catch {
      const room = localVoiceRoomFor(meetingId);

      setVoiceRoom(room);
      setFallbackNotice(
        "서버 음성방 연결이 불안정해 이 화면에서 로컬 참여 상태로 계속 진행합니다.",
      );

      return room;
    }
  }

  async function createVoiceMeetingFlow() {
    const title = newMeetingTitle.trim() || "오늘의 음성 회의";

    voiceJoinSyncTokenRef.current += 1;
    localActiveSessionRef.current = null;
    applyVoiceSessions([], { preserveLocalActive: false });

    try {
      const created = (await meetingClient.createMeeting(workspaceId, {
        title,
        purpose: "음성 회의",
      })) as MeetingRecord;
      let room: VoiceRoom;

      try {
        room = (await meetingClient.createVoiceRoom(
          workspaceId,
          created.id,
        )) as VoiceRoom;
      } catch {
        room = localVoiceRoomFor(created.id);
        setFallbackNotice(
          "서버 음성방 연결이 불안정해 로컬 회의방으로 계속 진행합니다.",
        );
      }

      setMeetings((current) => [
        created,
        ...current.filter((meeting) => meeting.id !== created.id),
      ]);
      setSelectedMeetingId(created.id);
      setVoiceRoom(room);
      setVoiceFlowReady(true);
      applyVoiceSessions([], {
        preserveLocalActive: false,
        voiceRoomId: room.id,
      });
    } catch {
      const created = localMeetingRecord(title);
      const room = localVoiceRoomFor(created.id);

      setMeetings((current) => [
        created,
        ...current.filter((meeting) => meeting.id !== created.id),
      ]);
      setSelectedMeetingId(created.id);
      setVoiceRoom(room);
      setVoiceFlowReady(true);
      applyVoiceSessions([], {
        preserveLocalActive: false,
        voiceRoomId: room.id,
      });
      setFallbackNotice(
        "서버 회의 생성 요청이 완료되지 않아 로컬 회의방으로 계속 진행합니다.",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (!cancelled) {
        void loadMeetings(null);
      }
    });

    return () => {
      cancelled = true;
    };
    // loadMeetings is intentionally invoked only when the workspace route changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return (
    <section className={styles.experiencePage}>
      <div className={styles.experienceHeader}>
        <div>
          <span className={styles.sectionKicker}>음성 회의</span>
          <h2>실시간 회의방</h2>
        </div>
        <div className={styles.experienceHeaderActions}>
          <Link className={styles.secondaryWideButton} href={reportsHref(workspaceId)}>
            리포트 보기
          </Link>
          <Link className={styles.secondaryWideButton} href={workspaceMeetingsHref(workspaceId)}>
            회의 관리
          </Link>
        </div>
      </div>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}
      {notice ? <p className={styles.noticeBanner}>{notice}</p> : null}
      {fallbackNotice ? (
        <p className={styles.fallbackBanner}>{fallbackNotice}</p>
      ) : null}

      <div className={styles.voiceDashboardGrid}>
        <div className={styles.voiceMainColumn}>
          <section className={styles.voiceRoomCard}>
            <header className={styles.voiceRoomHeader}>
              <div>
                <span className={styles.liveDot} />
                <strong>
                  {selectedMeeting?.title ?? "선택된 회의가 없습니다"}
                </strong>
              </div>
              <code>
                {voiceFlowReady && voiceRoom
                  ? voiceRoomStatusLabel(voiceRoom.status)
                  : "회의 준비 전"}
              </code>
            </header>

            <div className={styles.voiceRoomBody}>
              <label className={styles.experienceSelectLabel}>
                <span>회의 제목</span>
                <input
                  disabled={busy || voiceFlowReady}
                  onChange={(event) => setNewMeetingTitle(event.target.value)}
                  value={newMeetingTitle}
                />
              </label>

              <p className={styles.voiceFlowSummary}>
                {voiceFlowReady && selectedMeeting
                  ? `${selectedMeeting.title} 회의방이 준비되었습니다.`
                  : "회의를 생성하면 참여하기와 나가기만 사용할 수 있습니다."}
              </p>

              <div className={styles.voiceActionGrid}>
                {!voiceFlowReady ? (
                  <button
                    className={styles.primaryWideButton}
                    disabled={busy}
                    onClick={() =>
                      runAction(
                        "회의 생성",
                        createVoiceMeetingFlow,
                        "회의와 음성방을 만들었습니다.",
                      )
                    }
                    type="button"
                  >
                    회의 생성
                  </button>
                ) : (
                  <>
                    <button
                      className={styles.primaryWideButton}
                      disabled={busy || !voiceRoom || Boolean(activeSession)}
                      onClick={() =>
                        runAction(
                          "회의 참여",
                          async () => {
                            if (!selectedMeeting) return;
                            const room =
                              voiceRoom?.meetingId === selectedMeeting.id
                                ? voiceRoom
                                : await ensureVoiceRoom(selectedMeeting.id);
                            const optimisticSessions = mergeCurrentUserSession(
                              voiceSessions,
                              room,
                              localActiveSessionRef.current,
                            );
                            const optimisticLocalSession =
                              optimisticSessions.find(
                                (session) =>
                                  session.memberId === LOCAL_MEMBER_ID &&
                                  session.endedAt === null,
                              ) ?? activeSessionFrom(optimisticSessions);
                            const syncToken =
                              voiceJoinSyncTokenRef.current + 1;

                            if (optimisticLocalSession) {
                              localActiveSessionRef.current =
                                optimisticLocalSession;
                            }
                            voiceJoinSyncTokenRef.current = syncToken;
                            applyVoiceSessions(optimisticSessions, {
                              voiceRoomId: room.id,
                            });
                            setFallbackNotice(
                              "서버 응답을 기다리는 동안 로컬 참여 상태로 먼저 반영했습니다.",
                            );
                            void syncJoinedVoiceSession(
                              room,
                              optimisticSessions,
                              syncToken,
                            );
                          },
                          "회의에 참여했습니다.",
                        )
                      }
                      type="button"
                    >
                      참여하기
                    </button>
                    <button
                      className={styles.secondaryWideButton}
                      disabled={busy || !activeSession}
                      onClick={() =>
                        runAction(
                          "회의 나가기",
                          async () => {
                            if (!activeSession || !voiceRoom) return;

                            voiceJoinSyncTokenRef.current += 1;
                            localActiveSessionRef.current = null;

                            try {
                              await meetingClient.leaveVoiceSession(
                                activeSession.id,
                              );
                              const nextSessions =
                                (await meetingClient.listVoiceSessions(
                                  voiceRoom.id,
                                )) as VoiceSession[];
                              applyVoiceSessions(
                                markSessionLeft(
                                  nextSessions,
                                  activeSession.id,
                                ),
                              );
                            } catch {
                              applyVoiceSessions(
                                markSessionLeft(
                                  voiceSessions,
                                  activeSession.id,
                                ),
                              );
                              setFallbackNotice(
                                "서버 나가기 요청이 완료되지 않아 이 화면에서 로컬 참여 해제로 반영했습니다.",
                              );
                            }
                          },
                          "회의에서 나갔습니다.",
                        )
                      }
                      type="button"
                    >
                      나가기
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className={styles.audioAnalyticsCard}>
            <div className={styles.audioBars} aria-hidden="true">
              {Array.from({ length: 11 }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
            <div className={styles.voiceStatGrid}>
              <article>
                <span>회의 상태</span>
                <strong>{voiceFlowReady ? "회의방 준비됨" : "생성 전"}</strong>
              </article>
              <article>
                <span>참여 세션</span>
                <strong>{visibleVoiceSessions.length}</strong>
              </article>
              <article>
                <span>내 상태</span>
                <strong>{visibleActiveSession ? "참여 중" : "미참여"}</strong>
              </article>
            </div>
          </section>
        </div>

        <aside className={styles.previousReportsPanel}>
          <header className={styles.panelHeaderLine}>
            <h3>참여자 상태</h3>
          </header>
          <div className={styles.participantList}>
            {visibleVoiceSessions.map((session) => (
              <article className={styles.participantRow} key={session.id}>
                <span className={styles.fixtureAvatar}>
                  {voiceSessionMemberLabel(session).slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>{voiceSessionMemberLabel(session)}</strong>
                  <small>
                    {session.endedAt
                      ? `퇴장 ${formatDateTime(session.endedAt)}`
                      : `참여 ${formatDateTime(session.startedAt)}`}
                  </small>
                </div>
                <span
                  className={
                    session.endedAt ? styles.participantStatus : styles.participantStatusActive
                  }
                >
                  {session.endedAt
                    ? "나감"
                    : recordingStatusLabel(session.recordingStatus)}
                </span>
              </article>
            ))}
            {!visibleVoiceSessions.length ? (
              <EmptyState text="아직 음성 세션이 없습니다. 회의에 참여하면 세션이 표시됩니다." />
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

export function MeetingReportsBoardPage({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const meetingClient = useMemo(() => createMeetingClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedReportId = searchParams.get("reportId");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReportFilter>("all");
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [reports, setReports] = useState<MeetingReportSummary[]>([]);
  const [selectedReport, setSelectedReport] =
    useState<MeetingReportDetail | null>(null);
  const [actionItems, setActionItems] = useState<MeetingActionItem[]>([]);
  const [generationMeetingId, setGenerationMeetingId] = useState("");

  const busy = loadState === "loading" || busyAction !== null;
  const normalizedQuery = query.trim().toLowerCase();
  const reportIds = useMemo(
    () => new Set(reports.map((report) => report.meetingId)),
    [reports],
  );
  const reportCandidateMeetings = meetings.filter(
    (meeting) => !reportIds.has(meeting.id),
  );
  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (filter === "actions" && report.actionItemCount === 0) return false;
      if (filter === "risks" && report.riskCount === 0) return false;
      if (!normalizedQuery) return true;

      return [report.title, report.summary, report.createdAt]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [filter, normalizedQuery, reports]);

  async function loadReports() {
    setLoadState("loading");
    setError(null);

    try {
      const [nextReports, nextMeetings] = await Promise.all([
        meetingClient.listRecentReports(workspaceId) as Promise<
          MeetingReportSummary[]
        >,
        meetingClient.listMeetings(workspaceId) as Promise<MeetingRecord[]>,
      ]);
      setReports(nextReports);
      setMeetings(nextMeetings);
      setGenerationMeetingId((current) => {
        if (current && nextMeetings.some((meeting) => meeting.id === current)) {
          return current;
        }

        return nextMeetings.find(
          (meeting) =>
            !nextReports.some((report) => report.meetingId === meeting.id),
        )?.id ?? "";
      });
      setLoadState("ready");
    } catch (loadError) {
      setError(messageFromError(loadError));
      setLoadState("error");
    }
  }

  async function loadReportDetail(reportId: string | null) {
    if (!reportId) {
      setSelectedReport(null);
      setActionItems([]);
      return;
    }

    try {
      const detail = (await meetingClient.getReport(
        reportId,
      )) as MeetingReportDetail;
      const nextActionItems = (await meetingClient.listActionItems(
        reportId,
      )) as MeetingActionItem[];
      setSelectedReport(detail);
      setActionItems(nextActionItems);
    } catch (loadError) {
      setSelectedReport(null);
      setActionItems([]);
      setError(messageFromError(loadError));
    }
  }

  async function runAction(
    label: string,
    action: () => Promise<void>,
    success: string,
  ) {
    setBusyAction(label);
    setError(null);
    setNotice(null);

    try {
      await action();
      setNotice(success);
    } catch (actionError) {
      setError(messageFromError(actionError));
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (!cancelled) {
        void loadReports();
      }
    });

    return () => {
      cancelled = true;
    };
    // loadReports is intentionally invoked only when the workspace route changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (!cancelled) {
        void loadReportDetail(selectedReportId);
      }
    });

    return () => {
      cancelled = true;
    };
    // loadReportDetail is intentionally invoked for the current report query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedReportId, workspaceId]);

  return (
    <section className={styles.experiencePage}>
      <div className={styles.reportBoardHeader}>
        <div>
          <span className={styles.sectionKicker}>회의 리포트</span>
          <h2>리포트 게시판</h2>
        </div>
        <div className={styles.experienceHeaderActions}>
          <Link className={styles.secondaryWideButton} href={voiceHref(workspaceId)}>
            새 음성 회의
          </Link>
          <Link className={styles.secondaryWideButton} href={workspaceMeetingsHref(workspaceId)}>
            회의 관리
          </Link>
        </div>
      </div>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}
      {notice ? <p className={styles.noticeBanner}>{notice}</p> : null}

      <section className={styles.reportToolbar} aria-label="회의록 필터">
        <label className={styles.reportSearchField}>
          <span>검색</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="회의 제목, 요약, 날짜 검색"
            value={query}
          />
        </label>
        <div className={styles.reportFilterGroup}>
          <button
            className={filter === "all" ? styles.reportFilterActive : ""}
            onClick={() => setFilter("all")}
            type="button"
          >
            전체
          </button>
          <button
            className={filter === "actions" ? styles.reportFilterActive : ""}
            onClick={() => setFilter("actions")}
            type="button"
          >
            후속 작업 있음
          </button>
          <button
            className={filter === "risks" ? styles.reportFilterActive : ""}
            onClick={() => setFilter("risks")}
            type="button"
          >
            리스크 있음
          </button>
        </div>
      </section>

      <section className={styles.reportGenerationPanel}>
        <div>
          <span className={styles.sectionKicker}>리포트 생성</span>
          <strong>회의 메모와 전사를 기반으로 리포트를 생성합니다.</strong>
        </div>
        <select
          disabled={busy || reportCandidateMeetings.length === 0}
          onChange={(event) => setGenerationMeetingId(event.target.value)}
          value={generationMeetingId}
        >
          {reportCandidateMeetings.map((meeting) => (
            <option key={meeting.id} value={meeting.id}>
              {meeting.title}
            </option>
          ))}
        </select>
        <button
          disabled={busy || !generationMeetingId}
          onClick={() =>
            runAction(
              "리포트 생성",
              async () => {
                const generated = (await meetingClient.requestReportGeneration(
                  generationMeetingId,
                )) as MeetingReportDetail;
                await loadReports();
                router.push(reportsHref(workspaceId, generated.id));
              },
              "리포트를 생성했습니다.",
            )
          }
          type="button"
        >
          리포트 생성
        </button>
      </section>

      {selectedReport ? (
        <section className={styles.selectedReportBanner}>
          <div>
            <span>{formatDateTime(selectedReport.createdAt)}</span>
            <strong>{reportTitle(selectedReport)}</strong>
            <p>{selectedReport.summary}</p>
          </div>
          <div className={styles.reportCountGrid}>
            <b>{selectedReport.decisions.length}</b>
            <small>결정</small>
            <b>{actionItems.length}</b>
            <small>후속</small>
            <b>{selectedReport.risks.length}</b>
            <small>리스크</small>
          </div>
        </section>
      ) : null}

      <section className={styles.reportTableCard}>
        <div className={styles.reportTableScroll}>
          <table className={styles.reportTable}>
            <thead>
              <tr>
                <th>생성일</th>
                <th>회의</th>
                <th>요약</th>
                <th>결정</th>
                <th>후속</th>
                <th>리스크</th>
                <th>동작</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report) => (
                <tr
                  className={
                    report.id === selectedReportId
                      ? styles.selectedReportRow
                      : undefined
                  }
                  key={report.id}
                >
                  <td>{formatDateTime(report.createdAt)}</td>
                  <td>
                    <Link href={reportsHref(workspaceId, report.id)}>
                      {reportTitle(report)}
                    </Link>
                  </td>
                  <td>{report.summary}</td>
                  <td>{report.decisionCount}</td>
                  <td>{report.actionItemCount}</td>
                  <td>{report.riskCount}</td>
                  <td>
                    <div className={styles.tableActionGroup}>
                      <Link href={reportsHref(workspaceId, report.id)}>
                        열기
                      </Link>
                      <button
                        onClick={() => router.push(reportsHref(workspaceId, report.id))}
                        type="button"
                      >
                        선택
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredReports.length ? (
                <tr>
                  <td colSpan={7}>
                    <p className={styles.emptyText}>
                      조건에 맞는 회의록이 없습니다.
                    </p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <footer className={styles.reportTableFooter}>
          <span>
            {filteredReports.length}개 표시 / 전체 {reports.length}개
          </span>
          <button
            disabled={busy}
            onClick={() =>
              runAction("새로고침", loadReports, "리포트 목록을 새로고침했습니다.")
            }
            type="button"
          >
            새로고침
          </button>
        </footer>
      </section>

      {selectedReport ? (
        <section className={styles.reportDetailGrid}>
          <article className={styles.reportDetailPanel}>
            <header>
              <h3>결정사항</h3>
              <span>{selectedReport.decisions.length}</span>
            </header>
            {selectedReport.decisions.map((decision) => (
              <p key={decision.id}>{decision.content}</p>
            ))}
            {!selectedReport.decisions.length ? (
              <p className={styles.emptyText}>결정사항이 없습니다.</p>
            ) : null}
          </article>
          <article className={styles.reportDetailPanel}>
            <header>
              <h3>후속 작업</h3>
              <span>{actionItems.length}</span>
            </header>
            {actionItems.map((item) => (
              <p key={item.id}>
                <strong>{item.title}</strong>
                <small>
                  {actionItemStatusLabel(item.status)} · 담당 후보{" "}
                  {item.assigneeSuggestionMemberId ?? "-"} · 마감{" "}
                  {item.dueDateSuggestion ?? "-"}
                </small>
              </p>
            ))}
            {!actionItems.length ? (
              <p className={styles.emptyText}>후속 작업 후보가 없습니다.</p>
            ) : null}
          </article>
          <article className={styles.reportDetailPanel}>
            <header>
              <h3>리스크</h3>
              <span>{selectedReport.risks.length}</span>
            </header>
            {selectedReport.risks.map((risk) => (
              <p key={risk.id}>
                {risk.content}
                <small>{riskSeverityLabel(risk.severity)}</small>
              </p>
            ))}
            {!selectedReport.risks.length ? (
              <p className={styles.emptyText}>리스크가 없습니다.</p>
            ) : null}
          </article>
          <article className={styles.reportDetailPanel}>
            <header>
              <h3>다음 아젠다</h3>
              <span>{selectedReport.nextAgendas.length}</span>
            </header>
            {selectedReport.nextAgendas.map((agenda) => (
              <p key={agenda.id}>{agenda.title}</p>
            ))}
            {!selectedReport.nextAgendas.length ? (
              <p className={styles.emptyText}>다음 아젠다가 없습니다.</p>
            ) : null}
          </article>
        </section>
      ) : null}
    </section>
  );
}
