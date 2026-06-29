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
