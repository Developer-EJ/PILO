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

export type MeetingStatus = (typeof MEETING_STATUS_VALUES)[number];

export type MeetingAgendaStatus = (typeof MEETING_AGENDA_STATUS_VALUES)[number];

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
