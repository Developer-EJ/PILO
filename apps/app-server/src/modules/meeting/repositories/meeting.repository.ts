import { MeetingRepositoryMode, MeetingStatus } from "../types/meeting.types";

export const MEETING_REPOSITORY = Symbol("MEETING_REPOSITORY");

export interface MeetingRepository {
  readonly mode: MeetingRepositoryMode;

  listMeetingStatusValues(): readonly MeetingStatus[];
}
