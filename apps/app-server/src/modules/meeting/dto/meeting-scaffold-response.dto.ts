import { MeetingStatus } from "../types/meeting.types";

export interface MeetingScaffoldResponseDto {
  module: "meeting";
  meetingStatusValues: readonly MeetingStatus[];
}
