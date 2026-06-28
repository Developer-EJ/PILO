import { Injectable } from "@nestjs/common";
import { MEETING_STATUS_VALUES, MeetingStatus } from "../types/meeting.types";
import { MeetingRepository } from "./meeting.repository";

@Injectable()
export class MockMeetingRepository implements MeetingRepository {
  listMeetingStatusValues(): readonly MeetingStatus[] {
    return MEETING_STATUS_VALUES;
  }
}
