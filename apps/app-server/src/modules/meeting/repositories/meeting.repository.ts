import { MeetingStatus } from "../types/meeting.types";

export const MEETING_REPOSITORY = Symbol("MEETING_REPOSITORY");

export interface MeetingRepository {
  listMeetingStatusValues(): readonly MeetingStatus[];
}
