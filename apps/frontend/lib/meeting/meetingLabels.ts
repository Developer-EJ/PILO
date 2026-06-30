import type {
  MeetingActionItemStatus,
  MeetingAgendaStatus,
  MeetingDecisionStatus,
  MeetingRiskSeverity,
  MeetingStatus,
  TranscriptSource,
  VoiceRoomStatus,
  VoiceSessionRecordingStatus,
} from "./meetingTypes";

const meetingStatusLabels: Record<MeetingStatus, string> = {
  scheduled: "예정",
  in_progress: "진행 중",
  ended: "종료",
  report_generated: "리포트 생성됨",
};

const agendaStatusLabels: Record<MeetingAgendaStatus, string> = {
  open: "진행",
  done: "완료",
  skipped: "건너뜀",
};

const transcriptSourceLabels: Record<TranscriptSource, string> = {
  text: "직접 입력",
  stt: "STT 전사",
};

const decisionStatusLabels: Record<MeetingDecisionStatus, string> = {
  decided: "결정됨",
  pending: "보류",
  reopened: "재논의",
};

const riskSeverityLabels: Record<MeetingRiskSeverity, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
  critical: "치명적",
};

const actionItemStatusLabels: Record<MeetingActionItemStatus, string> = {
  draft: "초안",
  approved: "승인됨",
  converted: "작업 초안 생성됨",
  rejected: "거절됨",
};

const voiceRoomStatusLabels: Record<VoiceRoomStatus, string> = {
  active: "활성",
  inactive: "비활성",
  archived: "보관됨",
};

const recordingStatusLabels: Record<VoiceSessionRecordingStatus, string> = {
  not_recording: "대기",
  recording: "녹음 중",
  processing: "처리 중",
  completed: "완료",
  failed: "실패",
};

export function meetingStatusLabel(status: MeetingStatus) {
  return meetingStatusLabels[status] ?? status;
}

export function agendaStatusLabel(status: MeetingAgendaStatus) {
  return agendaStatusLabels[status] ?? status;
}

export function transcriptSourceLabel(source: TranscriptSource) {
  return transcriptSourceLabels[source] ?? source;
}

export function decisionStatusLabel(status: MeetingDecisionStatus) {
  return decisionStatusLabels[status] ?? status;
}

export function riskSeverityLabel(severity: MeetingRiskSeverity) {
  return riskSeverityLabels[severity] ?? severity;
}

export function actionItemStatusLabel(status: MeetingActionItemStatus) {
  return actionItemStatusLabels[status] ?? status;
}

export function voiceRoomStatusLabel(status: VoiceRoomStatus) {
  return voiceRoomStatusLabels[status] ?? status;
}

export function recordingStatusLabel(status: VoiceSessionRecordingStatus) {
  return recordingStatusLabels[status] ?? status;
}
