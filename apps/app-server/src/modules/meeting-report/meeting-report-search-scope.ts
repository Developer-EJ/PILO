import type { MeetingReportStatus } from "./meeting-report.types";

export type MeetingReportSearchIntent =
  | "exists"
  | "list"
  | "summary"
  | "evidence";

export type MeetingReportSearchFallback = "none" | "workspace_evidence";

export interface MeetingReportSearchScope {
  title?: string;
  from?: string;
  to?: string;
  status?: MeetingReportStatus;
  roomName?: string;
  intent: MeetingReportSearchIntent;
  sort: "latest";
  /**
   * Select the newest report after applying status/date/room filters.
   * Title searches deliberately ignore this flag so duplicate exact or fuzzy
   * titles still require a user choice.
   */
  latest?: true;
  limit?: number;
  fallback: MeetingReportSearchFallback;
}

export interface MeetingReportSearchScopeDraft {
  title?: string;
  from?: string;
  to?: string;
  status?: MeetingReportStatus;
  roomName?: string;
  latest?: true;
  limit?: number;
  fallback?: MeetingReportSearchFallback;
}

export function createMeetingReportSearchScope(
  draft: MeetingReportSearchScopeDraft,
  intent: MeetingReportSearchIntent
): MeetingReportSearchScope {
  const fallback = draft.fallback ?? "none";
  if (intent !== "evidence" && fallback !== "none") {
    throw new Error("Workspace evidence fallback is only valid for evidence search");
  }
  return {
    ...(draft.title ? { title: draft.title } : {}),
    ...(draft.from ? { from: draft.from } : {}),
    ...(draft.to ? { to: draft.to } : {}),
    ...(draft.status ? { status: draft.status } : {}),
    ...(draft.roomName ? { roomName: draft.roomName } : {}),
    intent,
    sort: "latest",
    ...(draft.latest ? { latest: true } : {}),
    ...(draft.limit === undefined ? {} : { limit: draft.limit }),
    fallback
  };
}
