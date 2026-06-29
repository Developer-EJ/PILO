export const MEETING_STATUS_VALUES = Object.freeze([
  "scheduled",
  "in_progress",
  "ended",
  "report_generated",
] as const);

export type MeetingStatus = (typeof MEETING_STATUS_VALUES)[number];

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
