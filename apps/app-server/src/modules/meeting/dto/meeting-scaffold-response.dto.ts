import { MeetingRecord, MeetingStatus } from "../types/meeting.types";

export interface MeetingScaffoldResponseDto {
  module: "meeting";
  meetingStatusValues: readonly MeetingStatus[];
}

export interface CreateMeetingRequestDto {
  title?: unknown;
  purpose?: unknown;
  canvasBoardId?: unknown;
}

export interface UpdateMeetingStatusRequestDto {
  status?: unknown;
}

export type MeetingResponseDto = MeetingRecord;
