import {
  MeetingRecord,
  MeetingRepositoryMode,
  MeetingStatus,
} from "../types/meeting.types";

export interface MeetingScaffoldResponseDto {
  module: "meeting";
  repositoryMode: MeetingRepositoryMode;
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
