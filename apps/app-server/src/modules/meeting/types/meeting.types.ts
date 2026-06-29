export const MEETING_STATUS_VALUES = Object.freeze([
  "scheduled",
  "in_progress",
  "ended",
  "report_generated",
] as const);

export const MEETING_AGENDA_STATUS_VALUES = Object.freeze([
  "open",
  "done",
  "skipped",
] as const);

export const TRANSCRIPT_SOURCE_VALUES = ["text", "stt"] as const;

export const MEETING_DECISION_STATUS_VALUES = [
  "decided",
  "pending",
  "reopened",
] as const;

export const MEETING_REPORT_RISK_SEVERITY_VALUES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export type MeetingStatus = (typeof MEETING_STATUS_VALUES)[number];

export type MeetingAgendaStatus = (typeof MEETING_AGENDA_STATUS_VALUES)[number];

export type TranscriptSource = (typeof TRANSCRIPT_SOURCE_VALUES)[number];

export type MeetingDecisionStatus =
  (typeof MEETING_DECISION_STATUS_VALUES)[number];

export type MeetingReportRiskSeverity =
  (typeof MEETING_REPORT_RISK_SEVERITY_VALUES)[number];

export type MeetingRepositoryMode = "mock";

export interface WorkspaceMemberRef {
  id: string;
  workspaceId: string;
  displayName?: string;
}

export interface MeetingRecord {
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
}

export interface CreateMeetingInput {
  workspaceId: string;
  canvasBoardId?: string | null;
  title: string;
  purpose?: string | null;
  createdByMemberId: string;
}

export interface UpdateMeetingInput {
  status: MeetingStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  updatedAt: string;
}

export interface MeetingParticipantRecord {
  id: string;
  meetingId: string;
  memberId: string;
  role: string | null;
  joinedAt: string;
  leftAt: string | null;
}

export interface CreateMeetingParticipantInput {
  meetingId: string;
  memberId: string;
  role?: string | null;
}

export interface MeetingAgendaRecord {
  id: string;
  meetingId: string;
  title: string;
  status: MeetingAgendaStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMeetingAgendaInput {
  meetingId: string;
  title: string;
  sortOrder?: number;
}

export interface UpdateMeetingAgendaInput {
  status?: MeetingAgendaStatus;
  sortOrder?: number;
  updatedAt: string;
}

export interface MeetingMemoRecord {
  id: string;
  meetingId: string;
  authorMemberId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMeetingMemoInput {
  meetingId: string;
  authorMemberId?: string | null;
  body: string;
}

export interface TranscriptSegmentRecord {
  id: string;
  meetingId: string;
  speakerMemberId: string | null;
  source: TranscriptSource;
  body: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface CreateTranscriptSegmentInput {
  meetingId: string;
  speakerMemberId?: string | null;
  source: TranscriptSource;
  body: string;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface MeetingReportRecord {
  id: string;
  meetingId: string;
  summary: string;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMeetingReportInput {
  meetingId: string;
  summary: string;
  createdByMemberId?: string | null;
}

export interface MeetingDecisionRecord {
  id: string;
  reportId: string;
  content: string;
  status: MeetingDecisionStatus;
  linkedTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMeetingDecisionInput {
  reportId: string;
  content: string;
  status?: MeetingDecisionStatus;
  linkedTaskId?: string | null;
}

export interface MeetingReportRiskRecord {
  id: string;
  reportId: string;
  content: string;
  severity: MeetingReportRiskSeverity;
  sortOrder: number;
  createdAt: string;
}

export interface CreateMeetingReportRiskInput {
  reportId: string;
  content: string;
  severity?: MeetingReportRiskSeverity;
  sortOrder?: number;
}

export interface MeetingReportNextAgendaRecord {
  id: string;
  reportId: string;
  title: string;
  sortOrder: number;
  createdAt: string;
}

export interface CreateMeetingReportNextAgendaInput {
  reportId: string;
  title: string;
  sortOrder?: number;
}

export interface MeetingDecisionReadModel {
  id: string;
  reportId: string;
  content: string;
  status: MeetingDecisionStatus;
  linkedTaskId: string | null;
  createdAt: string;
}

export interface MeetingReportRiskReadModel {
  id: string;
  reportId: string;
  content: string;
  severity: MeetingReportRiskSeverity;
  sortOrder: number;
  createdAt: string;
}

export interface MeetingReportNextAgendaReadModel {
  id: string;
  reportId: string;
  title: string;
  sortOrder: number;
  createdAt: string;
}

export interface MeetingReportSummary {
  id: string;
  meetingId: string;
  workspaceId: string;
  title: string;
  summary: string;
  decisionCount: number;
  actionItemCount: number;
  riskCount: number;
  createdAt: string;
}

export interface MeetingReportDetail extends MeetingReportSummary {
  decisions: MeetingDecisionReadModel[];
  risks: MeetingReportRiskReadModel[];
  nextAgendas: MeetingReportNextAgendaReadModel[];
}
