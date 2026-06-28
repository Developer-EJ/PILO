import {
  MeetingAgendaRecord,
  MeetingRecord,
  MeetingParticipantRecord,
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

export interface CreateMeetingParticipantRequestDto {
  memberId?: unknown;
  role?: unknown;
}

export interface CreateMeetingAgendaRequestDto {
  title?: unknown;
  sortOrder?: unknown;
}

export interface UpdateMeetingAgendaStatusRequestDto {
  status?: unknown;
}

export interface ReorderMeetingAgendaRequestDto {
  sortOrder?: unknown;
}

export type MeetingResponseDto = MeetingRecord;

export type MeetingParticipantResponseDto = MeetingParticipantRecord;

export type MeetingAgendaResponseDto = MeetingAgendaRecord;
