"use client";

import {
  actionItemStatusLabel,
  decisionStatusLabel,
  meetingStatusLabel,
  recordingStatusLabel,
  riskSeverityLabel,
  transcriptSourceLabel,
  voiceRoomStatusLabel,
} from "../../lib/meeting/meetingLabels";
import type {
  MeetingActionItem,
  MeetingActionItemTaskDraftResponse,
  MeetingAgenda,
  MeetingAgendaStatus,
  MeetingDecision,
  MeetingMemo,
  MeetingParticipant,
  MeetingRecord,
  MeetingReportDetail,
  MeetingReportNextAgenda,
  MeetingReportRisk,
  TranscriptSegment,
  VoiceRoom,
  VoiceRoomStatus,
  VoiceSession,
  VoiceSessionRecordingStatus,
} from "../../lib/meeting/meetingTypes";
import {
  ActionItemForm,
  AgendaForm,
  DecisionForm,
  MemoForm,
  NextAgendaForm,
  ParticipantForm,
  RiskForm,
  statusLabel,
  TranscriptForm,
} from "./MeetingForms";
import styles from "./meeting.module.css";

function formatDateTime(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toneForMeetingStatus(status: MeetingRecord["status"]) {
  if (status === "in_progress") return styles.toneDanger;
  if (status === "report_generated") return styles.toneSuccess;
  if (status === "ended") return styles.toneWarning;

  return styles.tonePrimary;
}

function toneForActionItem(status: MeetingActionItem["status"]) {
  if (status === "converted") return styles.toneSuccess;
  if (status === "rejected") return styles.toneDanger;
  if (status === "approved") return styles.toneWarning;

  return styles.tonePrimary;
}

export function EmptyPanel({ text }: { text: string }) {
  return <p className={styles.emptyText}>{text}</p>;
}

export function MeetingOverviewPanel({
  agendas,
  busy,
  meeting,
  memos,
  onAddAgenda,
  onAddMemo,
  onAddParticipant,
  onAddTranscript,
  onReorderAgenda,
  onUpdateAgendaStatus,
  onUpdateMeetingStatus,
  participants,
  transcriptSegments,
}: {
  agendas: MeetingAgenda[];
  busy: boolean;
  meeting: MeetingRecord | null;
  memos: MeetingMemo[];
  onAddAgenda: (input: { title: string }) => Promise<void>;
  onAddMemo: (input: { body: string }) => Promise<void>;
  onAddParticipant: (input: {
    memberId: string;
    role: string | null;
  }) => Promise<void>;
  onAddTranscript: (input: {
    body: string;
    source: "text" | "stt";
    startedAt: string | null;
    endedAt: string | null;
  }) => Promise<void>;
  onReorderAgenda: (agendaId: string, sortOrder: number) => Promise<void>;
  onUpdateAgendaStatus: (
    agendaId: string,
    status: MeetingAgendaStatus,
  ) => Promise<void>;
  onUpdateMeetingStatus: (status: MeetingRecord["status"]) => Promise<void>;
  participants: MeetingParticipant[];
  transcriptSegments: TranscriptSegment[];
}) {
  if (!meeting) {
    return (
      <EmptyPanel text="회의를 만들거나 선택하면 아젠다, 메모, 전사를 관리할 수 있습니다." />
    );
  }

  return (
    <div className={styles.panelGrid}>
      <section className={styles.heroPanel}>
        <div>
          <span className={styles.sectionKicker}>현재 회의</span>
          <h2>{meeting.title}</h2>
          <p>{meeting.purpose ?? "목적이 아직 비어 있습니다."}</p>
        </div>
        <div className={styles.heroMeta}>
          <span className={`${styles.statusPill} ${toneForMeetingStatus(meeting.status)}`}>
            {meetingStatusLabel(meeting.status)}
          </span>
          <small>시작 {formatDateTime(meeting.startedAt)}</small>
          <small>종료 {formatDateTime(meeting.endedAt)}</small>
        </div>
        <div className={styles.segmentedActions}>
          {(["scheduled", "in_progress", "ended", "report_generated"] as const).map(
            (status) => (
              <button
                className={
                  meeting.status === status
                    ? `${styles.segmentButton} ${styles.segmentButtonActive}`
                    : styles.segmentButton
                }
                disabled={busy}
                key={status}
                onClick={() => onUpdateMeetingStatus(status)}
                type="button"
              >
                {meetingStatusLabel(status)}
              </button>
            ),
          )}
        </div>
      </section>

      <section className={styles.contentPanel}>
        <div className={styles.panelHeader}>
          <h3>참석자</h3>
          <span>{participants.length}</span>
        </div>
        <ParticipantForm busy={busy} onSubmit={onAddParticipant} />
        <div className={styles.rowList}>
          {participants.map((participant) => (
            <article className={styles.smallRow} key={participant.id}>
              <strong>{participant.memberId}</strong>
              <span>{participant.role ?? "참석자"}</span>
              <small>{participant.leftAt ? "퇴장" : "참여 중"}</small>
            </article>
          ))}
          {!participants.length ? <EmptyPanel text="참석자가 아직 없습니다." /> : null}
        </div>
      </section>

      <section className={styles.contentPanel}>
        <div className={styles.panelHeader}>
          <h3>아젠다</h3>
          <span>{agendas.length}</span>
        </div>
        <AgendaForm busy={busy} onSubmit={onAddAgenda} />
        <div className={styles.rowList}>
          {agendas.map((agenda) => (
            <article className={styles.agendaRow} key={agenda.id}>
              <button
                className={styles.statusDotButton}
                disabled={busy}
                onClick={() =>
                  onUpdateAgendaStatus(
                    agenda.id,
                    agenda.status === "done" ? "open" : "done",
                  )
                }
                title="아젠다 완료 상태 전환"
                type="button"
              >
                {agenda.status === "done" ? "열기" : "완료"}
              </button>
              <strong>{agenda.title}</strong>
              <span>{statusLabel(agenda.status)}</span>
              <div className={styles.orderButtons}>
                <button
                  disabled={busy || agenda.sortOrder === 0}
                  onClick={() => onReorderAgenda(agenda.id, agenda.sortOrder - 1)}
                  title="위로 이동"
                  type="button"
                >
                  위
                </button>
                <button
                  disabled={busy}
                  onClick={() => onReorderAgenda(agenda.id, agenda.sortOrder + 1)}
                  title="아래로 이동"
                  type="button"
                >
                  아래
                </button>
              </div>
            </article>
          ))}
          {!agendas.length ? (
            <EmptyPanel text="아젠다를 추가해 회의 흐름을 정리하세요." />
          ) : null}
        </div>
      </section>

      <section className={styles.contentPanel}>
        <div className={styles.panelHeader}>
          <h3>메모</h3>
          <span>{memos.length}</span>
        </div>
        <MemoForm busy={busy} onSubmit={onAddMemo} />
        <div className={styles.stackList}>
          {memos.map((memo) => (
            <article className={styles.noteBlock} key={memo.id}>
              <p>{memo.body}</p>
              <small>{formatDateTime(memo.createdAt)}</small>
            </article>
          ))}
          {!memos.length ? (
            <EmptyPanel text="회의 중 핵심 내용을 메모로 남겨보세요." />
          ) : null}
        </div>
      </section>

      <section className={styles.contentPanel}>
        <div className={styles.panelHeader}>
          <h3>전사</h3>
          <span>{transcriptSegments.length}</span>
        </div>
        <TranscriptForm busy={busy} onSubmit={onAddTranscript} />
        <div className={styles.stackList}>
          {transcriptSegments.map((segment) => (
            <article className={styles.transcriptBlock} key={segment.id}>
              <span>{transcriptSourceLabel(segment.source)}</span>
              <p>{segment.body}</p>
              <small>
                {formatDateTime(segment.startedAt)} - {formatDateTime(segment.endedAt)}
              </small>
            </article>
          ))}
          {!transcriptSegments.length ? (
            <EmptyPanel text="확정된 STT 또는 직접 입력 전사를 저장하세요." />
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function VoicePanel({
  busy,
  onCreateRoom,
  onJoinSession,
  onLeaveSession,
  onRefreshSessions,
  onSaveTranscript,
  onUpdateRecordingStatus,
  onUpdateRoomStatus,
  voiceRoom,
  voiceSessions,
}: {
  busy: boolean;
  onCreateRoom: () => Promise<void>;
  onJoinSession: () => Promise<void>;
  onLeaveSession: (sessionId: string) => Promise<void>;
  onRefreshSessions: () => Promise<void>;
  onSaveTranscript: (input: {
    body: string;
    source: "text" | "stt";
    startedAt: string | null;
    endedAt: string | null;
  }) => Promise<void>;
  onUpdateRecordingStatus: (
    sessionId: string,
    status: VoiceSessionRecordingStatus,
  ) => Promise<void>;
  onUpdateRoomStatus: (status: VoiceRoomStatus) => Promise<void>;
  voiceRoom: VoiceRoom | null;
  voiceSessions: VoiceSession[];
}) {
  const activeSession = voiceSessions.find((session) => session.endedAt === null) ?? null;

  return (
    <div className={styles.panelGrid}>
      <section className={styles.heroPanel}>
        <div>
          <span className={styles.sectionKicker}>음성 회의방</span>
          <h2>{voiceRoom ? voiceRoom.livekitRoomName ?? "음성 회의방" : "음성 방이 아직 없습니다"}</h2>
          <p>
            음성 세션과 녹음 상태를 관리하고, 확인된 전사는 회의 전사 목록에 저장합니다.
          </p>
        </div>
        <div className={styles.heroMeta}>
          <span className={styles.statusPill}>
            {voiceRoom ? voiceRoomStatusLabel(voiceRoom.status) : "미생성"}
          </span>
          <small>{voiceRoom?.id ?? "방 없음"}</small>
        </div>
        <div className={styles.segmentedActions}>
          <button disabled={busy} onClick={onCreateRoom} type="button">
            {voiceRoom ? "음성 방 새로고침" : "음성 방 만들기"}
          </button>
          <button disabled={busy || !voiceRoom} onClick={onJoinSession} type="button">
            세션 시작
          </button>
          <button disabled={busy || !voiceRoom} onClick={onRefreshSessions} type="button">
            세션 목록 새로고침
          </button>
        </div>
      </section>

      <section className={styles.contentPanel}>
        <div className={styles.panelHeader}>
          <h3>방 상태</h3>
          <span>{voiceRoom ? voiceRoomStatusLabel(voiceRoom.status) : "-"}</span>
        </div>
        <div className={styles.segmentedActions}>
          {(["active", "inactive", "archived"] as const).map((status) => (
            <button
              className={
                voiceRoom?.status === status
                  ? `${styles.segmentButton} ${styles.segmentButtonActive}`
                  : styles.segmentButton
              }
              disabled={busy || !voiceRoom}
              key={status}
              onClick={() => onUpdateRoomStatus(status)}
              type="button"
            >
              {voiceRoomStatusLabel(status)}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.contentPanel}>
        <div className={styles.panelHeader}>
          <h3>음성 세션</h3>
          <span>{voiceSessions.length}</span>
        </div>
        <div className={styles.rowList}>
          {voiceSessions.map((session) => (
            <article className={styles.sessionRow} key={session.id}>
              <div>
                <strong>{session.memberId ?? "현재 사용자"}</strong>
                <small>{session.id}</small>
              </div>
              <span>{recordingStatusLabel(session.recordingStatus)}</span>
              <button
                disabled={busy || session.endedAt !== null}
                onClick={() => onLeaveSession(session.id)}
                type="button"
              >
                종료
              </button>
            </article>
          ))}
          {!voiceSessions.length ? (
            <EmptyPanel text="진행 중인 음성 세션이 없습니다." />
          ) : null}
        </div>
      </section>

      <section className={styles.contentPanel}>
        <div className={styles.panelHeader}>
          <h3>녹음 / STT 상태</h3>
          <span>
            {activeSession
              ? recordingStatusLabel(activeSession.recordingStatus)
              : "활성 세션 없음"}
          </span>
        </div>
        <div className={styles.segmentedActions}>
          {(["not_recording", "recording", "processing", "completed", "failed"] as const).map(
            (status) => (
              <button
                className={
                  activeSession?.recordingStatus === status
                    ? `${styles.segmentButton} ${styles.segmentButtonActive}`
                    : styles.segmentButton
                }
                disabled={busy || !activeSession}
                key={status}
                onClick={() => {
                  if (activeSession) {
                    void onUpdateRecordingStatus(activeSession.id, status);
                  }
                }}
                type="button"
              >
                {recordingStatusLabel(status)}
              </button>
            ),
          )}
        </div>
      </section>

      <section className={styles.contentPanelWide}>
        <div className={styles.panelHeader}>
          <h3>확정 전사 입력</h3>
          <span>회의 전사에 저장</span>
        </div>
        <TranscriptForm busy={busy} defaultSource="stt" onSubmit={onSaveTranscript} />
      </section>
    </div>
  );
}

export function ReportPanel({
  actionItems,
  busy,
  onAddActionItem,
  onAddDecision,
  onAddNextAgenda,
  onAddRisk,
  onApproveActionItem,
  onGenerateReport,
  onRejectActionItem,
  onRequestTaskDraft,
  report,
  taskDraftResults,
}: {
  actionItems: MeetingActionItem[];
  busy: boolean;
  onAddActionItem: Parameters<typeof ActionItemForm>[0]["onSubmit"];
  onAddDecision: Parameters<typeof DecisionForm>[0]["onSubmit"];
  onAddNextAgenda: Parameters<typeof NextAgendaForm>[0]["onSubmit"];
  onAddRisk: Parameters<typeof RiskForm>[0]["onSubmit"];
  onApproveActionItem: (actionItemId: string) => Promise<void>;
  onGenerateReport: () => Promise<void>;
  onRejectActionItem: (actionItemId: string) => Promise<void>;
  onRequestTaskDraft: (actionItemId: string) => Promise<void>;
  report: MeetingReportDetail | null;
  taskDraftResults: Record<string, MeetingActionItemTaskDraftResponse>;
}) {
  return (
    <div className={styles.panelGrid}>
      <section className={styles.heroPanel}>
        <div>
          <span className={styles.sectionKicker}>리포트 초안</span>
          <h2>{report?.title ?? "리포트가 아직 없습니다"}</h2>
          <p>{report?.summary ?? "메모와 전사를 저장한 뒤 리포트를 생성하세요."}</p>
        </div>
        <div className={styles.heroMeta}>
          <span className={styles.statusPill}>{report ? "초안" : "없음"}</span>
          <small>{report ? formatDateTime(report.createdAt) : "-"}</small>
        </div>
        <div className={styles.segmentedActions}>
          <button disabled={busy} onClick={onGenerateReport} type="button">
            리포트 생성 또는 열기
          </button>
        </div>
      </section>

      {!report ? (
        <section className={styles.contentPanelWide}>
          <EmptyPanel text="리포트를 생성하면 결정사항, 리스크, 다음 아젠다, 후속 작업을 편집할 수 있습니다." />
        </section>
      ) : (
        <>
          <section className={styles.contentPanel}>
            <div className={styles.panelHeader}>
              <h3>결정사항</h3>
              <span>{report.decisions.length}</span>
            </div>
            <DecisionForm busy={busy} onSubmit={onAddDecision} />
            <div className={styles.rowList}>
              {report.decisions.map((decision: MeetingDecision) => (
                <article className={styles.smallRow} key={decision.id}>
                  <strong>{decision.content}</strong>
                  <span>{decisionStatusLabel(decision.status)}</span>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.contentPanel}>
            <div className={styles.panelHeader}>
              <h3>리스크</h3>
              <span>{report.risks.length}</span>
            </div>
            <RiskForm busy={busy} onSubmit={onAddRisk} />
            <div className={styles.rowList}>
              {report.risks.map((risk: MeetingReportRisk) => (
                <article className={styles.smallRow} key={risk.id}>
                  <strong>{risk.content}</strong>
                  <span>{riskSeverityLabel(risk.severity)}</span>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.contentPanel}>
            <div className={styles.panelHeader}>
              <h3>다음 아젠다</h3>
              <span>{report.nextAgendas.length}</span>
            </div>
            <NextAgendaForm busy={busy} onSubmit={onAddNextAgenda} />
            <div className={styles.rowList}>
              {report.nextAgendas.map((agenda: MeetingReportNextAgenda) => (
                <article className={styles.smallRow} key={agenda.id}>
                  <strong>{agenda.title}</strong>
                  <span>{agenda.sortOrder + 1}번째</span>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.contentPanelWide}>
            <div className={styles.panelHeader}>
              <h3>후속 작업</h3>
              <span>{actionItems.length}</span>
            </div>
            <ActionItemForm busy={busy} onSubmit={onAddActionItem} />
            <div className={styles.actionList}>
              {actionItems.map((item) => (
                <article className={styles.actionCard} key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span className={`${styles.statusPill} ${toneForActionItem(item.status)}`}>
                      {actionItemStatusLabel(item.status)}
                    </span>
                  </div>
                  <p>{item.description ?? "설명이 비어 있습니다."}</p>
                  <small>
                    담당자 후보 {item.assigneeSuggestionMemberId ?? "-"} · 마감{" "}
                    {item.dueDateSuggestion ?? "-"}
                  </small>
                  <div className={styles.actionButtons}>
                    <button
                      disabled={busy || item.status !== "draft"}
                      onClick={() => onApproveActionItem(item.id)}
                      type="button"
                    >
                      승인
                    </button>
                    <button
                      disabled={busy || item.status !== "draft"}
                      onClick={() => onRejectActionItem(item.id)}
                      type="button"
                    >
                      거절
                    </button>
                    <button
                      disabled={busy || item.status !== "approved"}
                      onClick={() => onRequestTaskDraft(item.id)}
                      type="button"
                    >
                      작업 초안 요청
                    </button>
                  </div>
                  {taskDraftResults[item.id] ? (
                    <code className={styles.resultCode}>
                      작업 초안: {taskDraftResults[item.id].taskDraft.taskId ?? "생성됨"}
                    </code>
                  ) : null}
                </article>
              ))}
              {!actionItems.length ? (
                <EmptyPanel text="후속 작업 후보가 아직 없습니다." />
              ) : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
