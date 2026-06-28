import { MeetingRepositoryMode, MeetingStatus } from "../types/meeting.types";

export interface MeetingScaffoldResponseDto {
  module: "meeting";
  repositoryMode: MeetingRepositoryMode;
  meetingStatusValues: readonly MeetingStatus[];
}
