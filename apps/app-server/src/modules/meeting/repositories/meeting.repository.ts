import {
  CreateMeetingInput,
  MeetingRecord,
  MeetingStatus,
  UpdateMeetingInput,
} from "../types/meeting.types";

export const MEETING_REPOSITORY = Symbol("MEETING_REPOSITORY");

export interface MeetingRepository {
  listMeetingStatusValues(): readonly MeetingStatus[];

  createMeeting(input: CreateMeetingInput): MeetingRecord;

  listMeetingsByWorkspace(workspaceId: string): MeetingRecord[];

  findMeetingById(meetingId: string): MeetingRecord | null;

  updateMeeting(meetingId: string, input: UpdateMeetingInput): MeetingRecord;
}
