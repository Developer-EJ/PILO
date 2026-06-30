"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { meetingStatusLabel } from "../../lib/meeting/meetingLabels";
import { createMeetingClient, MeetingApiError } from "../../lib/meeting/meetingClient.mjs";
import type {
  MeetingActionItem,
  MeetingActionItemTaskDraftResponse,
  MeetingAgenda,
  MeetingAgendaStatus,
  MeetingMemo,
  MeetingParticipant,
  MeetingRecord,
  MeetingReportDetail,
  MeetingReportSummary,
  TranscriptSegment,
  VoiceRoom,
  VoiceRoomStatus,
  VoiceSession,
} from "../../lib/meeting/meetingTypes";
import {
  readStoredWorkspaceId,
  resolveCurrentWorkspaceSelection,
} from "../../lib/workspace/currentWorkspace.mjs";
import { mockWorkspaces } from "../../lib/workspace/workspaceClient.mjs";
import { CreateMeetingForm } from "./MeetingForms";
import {
  MeetingOverviewPanel,
  ReportPanel,
  VoicePanel,
} from "./MeetingPanels";
import styles from "./meeting.module.css";

type LoadState = "idle" | "loading" | "ready" | "error";
type MeetingView = "meeting" | "voice" | "report";

type MeetingWorkspaceProps = {
  workspaceId?: string;
};

type OptionalVoiceRoomResult =
  | { status: "found"; voiceRoom: VoiceRoom; sessions: VoiceSession[] }
  | { status: "missing"; voiceRoom: null; sessions: [] };

function readUrlWorkspaceId() {
  if (typeof window === "undefined") return null;

  try {
    return new URL(window.location.href).searchParams.get("workspaceId");
  } catch (error) {
    return null;
  }
}

function resolveInitialWorkspaceId(explicitWorkspaceId?: string) {
  const trimmedWorkspaceId = explicitWorkspaceId?.trim();

  if (trimmedWorkspaceId) {
    return trimmedWorkspaceId;
  }

  const selection = resolveCurrentWorkspaceSelection({
    workspaces: mockWorkspaces,
    urlWorkspaceId: readUrlWorkspaceId(),
    storedWorkspaceId: readStoredWorkspaceId(),
  });

  return (
    selection.workspace?.id ??
    selection.fallbackWorkspace?.id ??
    mockWorkspaces[0]?.id ??
    "22222222-2222-4222-8222-222222222222"
  );
}

function parseMeetingView(value: string | null): MeetingView {
  if (value === "voice" || value === "report") return value;

  return "meeting";
}

function viewLabel(view: MeetingView) {
  if (view === "voice") return "음성";
  if (view === "report") return "리포트";

  return "회의";
}

function messageFromError(error: unknown) {
  if (error instanceof MeetingApiError) {
    return `요청 처리 중 오류가 발생했습니다${
      error.status ? ` (${error.status})` : ""
    }.`;
  }

  return "알 수 없는 오류가 발생했습니다.";
}

function loadStateLabel(loadState: LoadState) {
  if (loadState === "loading") return "불러오는 중";
  if (loadState === "ready") return "준비됨";
  if (loadState === "error") return "오류";

  return "대기";
}

export function MeetingWorkspace({
  workspaceId: explicitWorkspaceId,
}: MeetingWorkspaceProps = {}) {
  const searchParams = useSearchParams();
  const activeView = parseMeetingView(searchParams.get("view"));
  const workspaceId = useMemo(
    () => resolveInitialWorkspaceId(explicitWorkspaceId),
    [explicitWorkspaceId],
  );
  const meetingClient = useMemo(() => createMeetingClient(), []);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [agendas, setAgendas] = useState<MeetingAgenda[]>([]);
  const [memos, setMemos] = useState<MeetingMemo[]>([]);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [recentReports, setRecentReports] = useState<MeetingReportSummary[]>([]);
  const [report, setReport] = useState<MeetingReportDetail | null>(null);
  const [actionItems, setActionItems] = useState<MeetingActionItem[]>([]);
  const [voiceRoom, setVoiceRoom] = useState<VoiceRoom | null>(null);
  const [voiceSessions, setVoiceSessions] = useState<VoiceSession[]>([]);
  const [taskDraftResults, setTaskDraftResults] = useState<
    Record<string, MeetingActionItemTaskDraftResponse>
  >({});

  const selectedMeeting =
    meetings.find((meeting) => meeting.id === selectedMeetingId) ?? null;
  const busy = busyAction !== null || loadState === "loading";

  async function loadOptionalVoiceRoom(
    meetingId: string,
  ): Promise<OptionalVoiceRoomResult> {
    try {
      const room = (await meetingClient.getVoiceRoomForMeeting(
        workspaceId,
        meetingId,
      )) as VoiceRoom;
      const sessions = (await meetingClient.listVoiceSessions(room.id)) as VoiceSession[];

      return { status: "found", voiceRoom: room, sessions };
    } catch (loadError) {
      if (loadError instanceof MeetingApiError && loadError.status === 404) {
        return { status: "missing", voiceRoom: null, sessions: [] };
      }

      throw loadError;
    }
  }

  async function loadSelectedMeeting(meetingId: string) {
    setLoadState("loading");
    setError(null);

    try {
      const [
        meeting,
        nextParticipants,
        nextAgendas,
        nextMemos,
        nextTranscriptSegments,
        nextReports,
        voiceResult,
      ] = await Promise.all([
        meetingClient.getMeeting(meetingId) as Promise<MeetingRecord>,
        meetingClient.listParticipants(meetingId) as Promise<MeetingParticipant[]>,
        meetingClient.listAgendas(meetingId) as Promise<MeetingAgenda[]>,
        meetingClient.listMemos(meetingId) as Promise<MeetingMemo[]>,
        meetingClient.listTranscriptSegments(meetingId) as Promise<TranscriptSegment[]>,
        meetingClient.listRecentReports(workspaceId) as Promise<MeetingReportSummary[]>,
        loadOptionalVoiceRoom(meetingId),
      ]);
      const reportSummary =
        nextReports.find((candidate) => candidate.meetingId === meeting.id) ?? null;
      const nextReport = reportSummary
        ? ((await meetingClient.getReport(reportSummary.id)) as MeetingReportDetail)
        : null;
      const nextActionItems = nextReport
        ? ((await meetingClient.listActionItems(nextReport.id)) as MeetingActionItem[])
        : [];

      setMeetings((current) =>
        current.map((candidate) =>
          candidate.id === meeting.id ? meeting : candidate,
        ),
      );
      setParticipants(nextParticipants);
      setAgendas(nextAgendas);
      setMemos(nextMemos);
      setTranscriptSegments(nextTranscriptSegments);
      setRecentReports(nextReports);
      setReport(nextReport);
      setActionItems(nextActionItems);
      setVoiceRoom(voiceResult.voiceRoom);
      setVoiceSessions(voiceResult.sessions);
      setLoadState("ready");
    } catch (loadError) {
      setError(messageFromError(loadError));
      setLoadState("error");
    }
  }

  async function loadMeetingIndex(preferredMeetingId?: string | null) {
    setLoadState("loading");
    setError(null);

    try {
      const [nextMeetings, nextReports] = await Promise.all([
        meetingClient.listMeetings(workspaceId) as Promise<MeetingRecord[]>,
        meetingClient.listRecentReports(workspaceId) as Promise<MeetingReportSummary[]>,
      ]);
      const nextSelectedId =
        preferredMeetingId && nextMeetings.some((meeting) => meeting.id === preferredMeetingId)
          ? preferredMeetingId
          : nextMeetings[0]?.id ?? null;

      setMeetings(nextMeetings);
      setRecentReports(nextReports);
      setSelectedMeetingId(nextSelectedId);

      if (!nextSelectedId) {
        setParticipants([]);
        setAgendas([]);
        setMemos([]);
        setTranscriptSegments([]);
        setReport(null);
        setActionItems([]);
        setVoiceRoom(null);
        setVoiceSessions([]);
        setLoadState("ready");
      }
    } catch (loadError) {
      setError(messageFromError(loadError));
      setLoadState("error");
    }
  }

  async function refreshSelectedMeeting() {
    if (!selectedMeetingId) {
      await loadMeetingIndex(null);
      return;
    }

    await loadSelectedMeeting(selectedMeetingId);
  }

  async function runAction(label: string, action: () => Promise<void>, success: string) {
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
        void loadMeetingIndex(null);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (!cancelled && selectedMeetingId) {
        void loadSelectedMeeting(selectedMeetingId);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeetingId]);

  return (
    <section className={styles.meetingShell}>
      <section className={styles.workspacePane}>
        <section className={styles.content}>
          <section className={styles.meetingControlPanel}>
            <div className={styles.meetingControlMeta}>
              <span className={styles.sectionKicker}>현재 보기</span>
              <strong>{viewLabel(activeView)}</strong>
              <small>최근 리포트 {recentReports.length}개</small>
            </div>
            <label>
              <span>회의 선택</span>
              <select
                disabled={busy || meetings.length === 0}
                onChange={(event) => setSelectedMeetingId(event.target.value || null)}
                value={selectedMeetingId ?? ""}
              >
                {!meetings.length ? <option value="">회의 없음</option> : null}
                {meetings.map((meeting) => (
                  <option key={meeting.id} value={meeting.id}>
                    {meeting.title} · {meetingStatusLabel(meeting.status)}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy}
              onClick={() => {
                void loadMeetingIndex(selectedMeetingId);
              }}
              type="button"
            >
              새로고침
            </button>
            <span className={styles.busyChip}>
              {busyAction ?? loadStateLabel(loadState)}
            </span>
          </section>

          <section className={styles.createPanel}>
            <div>
              <span className={styles.sectionKicker}>새 회의</span>
              <h2>워크스페이스 안에서 회의 시작</h2>
            </div>
            <CreateMeetingForm
              busy={busy}
              onSubmit={async (input) => {
                await runAction(
                  "회의 생성 중",
                  async () => {
                    const created = (await meetingClient.createMeeting(
                      workspaceId,
                      input,
                    )) as MeetingRecord;

                    await loadMeetingIndex(created.id);
                  },
                  "회의가 생성됐습니다.",
                );
              }}
            />
          </section>

          {error ? <div className={styles.errorBanner}>{error}</div> : null}
          {notice ? <div className={styles.noticeBanner}>{notice}</div> : null}

          {activeView === "meeting" ? (
            <MeetingOverviewPanel
              agendas={agendas}
              busy={busy}
              meeting={selectedMeeting}
              memos={memos}
              onAddAgenda={async (input) => {
                await runAction(
                  "아젠다 추가 중",
                  async () => {
                    if (!selectedMeetingId) return;
                    await meetingClient.createAgenda(selectedMeetingId, input);
                    await refreshSelectedMeeting();
                  },
                  "아젠다가 추가됐습니다.",
                );
              }}
              onAddMemo={async (input) => {
                await runAction(
                  "메모 저장 중",
                  async () => {
                    if (!selectedMeetingId) return;
                    await meetingClient.createMemo(selectedMeetingId, input);
                    await refreshSelectedMeeting();
                  },
                  "메모가 저장됐습니다.",
                );
              }}
              onAddParticipant={async (input) => {
                await runAction(
                  "참석자 추가 중",
                  async () => {
                    if (!selectedMeetingId) return;
                    await meetingClient.addParticipant(selectedMeetingId, input);
                    await refreshSelectedMeeting();
                  },
                  "참석자가 추가됐습니다.",
                );
              }}
              onAddTranscript={async (input) => {
                await runAction(
                  "전사 저장 중",
                  async () => {
                    if (!selectedMeetingId) return;
                    await meetingClient.createTranscriptSegment(selectedMeetingId, input);
                    await refreshSelectedMeeting();
                  },
                  "전사가 저장됐습니다.",
                );
              }}
              onReorderAgenda={async (agendaId, sortOrder) => {
                await runAction(
                  "아젠다 순서 변경 중",
                  async () => {
                    if (!selectedMeetingId) return;
                    await meetingClient.reorderAgenda(selectedMeetingId, agendaId, sortOrder);
                    await refreshSelectedMeeting();
                  },
                  "아젠다 순서가 변경됐습니다.",
                );
              }}
              onUpdateAgendaStatus={async (agendaId, status) => {
                await runAction(
                  "아젠다 상태 변경 중",
                  async () => {
                    if (!selectedMeetingId) return;
                    await meetingClient.updateAgendaStatus(
                      selectedMeetingId,
                      agendaId,
                      status,
                    );
                    await refreshSelectedMeeting();
                  },
                  "아젠다 상태가 변경됐습니다.",
                );
              }}
              onUpdateMeetingStatus={async (status) => {
                await runAction(
                  "회의 상태 변경 중",
                  async () => {
                    if (!selectedMeetingId) return;
                    await meetingClient.updateMeetingStatus(selectedMeetingId, status);
                    await refreshSelectedMeeting();
                  },
                  "회의 상태가 변경됐습니다.",
                );
              }}
              participants={participants}
              transcriptSegments={transcriptSegments}
            />
          ) : null}

          {activeView === "voice" ? (
            <VoicePanel
              busy={busy}
              onCreateRoom={async () => {
                await runAction(
                  "음성 방 준비 중",
                  async () => {
                    if (!selectedMeetingId) return;
                    const room = (await meetingClient.createVoiceRoom(
                      workspaceId,
                      selectedMeetingId,
                    )) as VoiceRoom;
                    const sessions = (await meetingClient.listVoiceSessions(
                      room.id,
                    )) as VoiceSession[];

                    setVoiceRoom(room);
                    setVoiceSessions(sessions);
                  },
                  "음성 방이 준비됐습니다.",
                );
              }}
              onJoinSession={async () => {
                await runAction(
                  "음성 세션 시작 중",
                  async () => {
                    if (!voiceRoom) return;
                    await meetingClient.joinVoiceSession(voiceRoom.id);
                    setVoiceSessions(
                      (await meetingClient.listVoiceSessions(voiceRoom.id)) as VoiceSession[],
                    );
                  },
                  "음성 세션이 시작됐습니다.",
                );
              }}
              onLeaveSession={async (sessionId) => {
                await runAction(
                  "음성 세션 종료 중",
                  async () => {
                    await meetingClient.leaveVoiceSession(sessionId);
                    if (voiceRoom) {
                      setVoiceSessions(
                        (await meetingClient.listVoiceSessions(
                          voiceRoom.id,
                        )) as VoiceSession[],
                      );
                    }
                  },
                  "음성 세션이 종료됐습니다.",
                );
              }}
              onRefreshSessions={async () => {
                await runAction(
                  "세션 목록 갱신 중",
                  async () => {
                    if (!voiceRoom) return;
                    setVoiceSessions(
                      (await meetingClient.listVoiceSessions(voiceRoom.id)) as VoiceSession[],
                    );
                  },
                  "음성 세션 목록을 갱신했습니다.",
                );
              }}
              onSaveTranscript={async (input) => {
                await runAction(
                  "전사 저장 중",
                  async () => {
                    if (!selectedMeetingId) return;
                    await meetingClient.createTranscriptSegment(selectedMeetingId, input);
                    await refreshSelectedMeeting();
                  },
                  "STT 전사가 회의에 저장됐습니다.",
                );
              }}
              onUpdateRecordingStatus={async (sessionId, recordingStatus) => {
                await runAction(
                  "녹음 상태 변경 중",
                  async () => {
                    await meetingClient.updateVoiceSessionRecordingStatus(
                      sessionId,
                      recordingStatus,
                    );
                    if (voiceRoom) {
                      setVoiceSessions(
                        (await meetingClient.listVoiceSessions(
                          voiceRoom.id,
                        )) as VoiceSession[],
                      );
                    }
                  },
                  "녹음 상태가 변경됐습니다.",
                );
              }}
              onUpdateRoomStatus={async (status: VoiceRoomStatus) => {
                await runAction(
                  "음성 방 상태 변경 중",
                  async () => {
                    if (!voiceRoom) return;
                    setVoiceRoom(
                      (await meetingClient.updateVoiceRoomStatus(
                        voiceRoom.id,
                        status,
                      )) as VoiceRoom,
                    );
                  },
                  "음성 방 상태가 변경됐습니다.",
                );
              }}
              voiceRoom={voiceRoom}
              voiceSessions={voiceSessions}
            />
          ) : null}

          {activeView === "report" ? (
            <ReportPanel
              actionItems={actionItems}
              busy={busy}
              onAddActionItem={async (input) => {
                await runAction(
                  "후속 작업 저장 중",
                  async () => {
                    if (!report) return;
                    await meetingClient.createActionItem(report.id, input);
                    await refreshSelectedMeeting();
                  },
                  "후속 작업이 저장됐습니다.",
                );
              }}
              onAddDecision={async (input) => {
                await runAction(
                  "결정사항 저장 중",
                  async () => {
                    if (!report) return;
                    await meetingClient.createDecision(report.id, input);
                    await refreshSelectedMeeting();
                  },
                  "결정사항이 저장됐습니다.",
                );
              }}
              onAddNextAgenda={async (input) => {
                await runAction(
                  "다음 아젠다 저장 중",
                  async () => {
                    if (!report) return;
                    await meetingClient.createNextAgenda(report.id, input);
                    await refreshSelectedMeeting();
                  },
                  "다음 아젠다가 저장됐습니다.",
                );
              }}
              onAddRisk={async (input) => {
                await runAction(
                  "리스크 저장 중",
                  async () => {
                    if (!report) return;
                    await meetingClient.createRisk(report.id, input);
                    await refreshSelectedMeeting();
                  },
                  "리스크가 저장됐습니다.",
                );
              }}
              onApproveActionItem={async (actionItemId) => {
                await runAction(
                  "후속 작업 승인 중",
                  async () => {
                    await meetingClient.approveActionItem(actionItemId);
                    await refreshSelectedMeeting();
                  },
                  "후속 작업이 승인됐습니다.",
                );
              }}
              onGenerateReport={async () => {
                await runAction(
                  "리포트 생성 중",
                  async () => {
                    if (!selectedMeetingId) return;
                    const nextReport = (await meetingClient.requestReportGeneration(
                      selectedMeetingId,
                    )) as MeetingReportDetail;

                    setReport(nextReport);
                    setActionItems(
                      (await meetingClient.listActionItems(
                        nextReport.id,
                      )) as MeetingActionItem[],
                    );
                    setRecentReports(
                      (await meetingClient.listRecentReports(
                        workspaceId,
                      )) as MeetingReportSummary[],
                    );
                  },
                  "리포트 초안이 생성됐습니다.",
                );
              }}
              onRejectActionItem={async (actionItemId) => {
                await runAction(
                  "후속 작업 거절 중",
                  async () => {
                    await meetingClient.rejectActionItem(actionItemId);
                    await refreshSelectedMeeting();
                  },
                  "후속 작업이 거절됐습니다.",
                );
              }}
              onRequestTaskDraft={async (actionItemId) => {
                await runAction(
                  "작업 초안 요청 중",
                  async () => {
                    const result = (await meetingClient.requestActionItemTaskDraft(
                      actionItemId,
                    )) as MeetingActionItemTaskDraftResponse;

                    setTaskDraftResults((current) => ({
                      ...current,
                      [actionItemId]: result,
                    }));
                    await refreshSelectedMeeting();
                  },
                  "작업 초안 요청이 완료됐습니다.",
                );
              }}
              report={report}
              taskDraftResults={taskDraftResults}
            />
          ) : null}
        </section>
      </section>
    </section>
  );
}
