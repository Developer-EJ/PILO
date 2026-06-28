import { Injectable } from "@nestjs/common";
import {
  MEETING_STATUS_VALUES,
  MeetingRepositoryMode,
  MeetingStatus,
} from "../types/meeting.types";
import { MeetingRepository } from "./meeting.repository";

@Injectable()
export class MockMeetingRepository implements MeetingRepository {
  readonly mode: MeetingRepositoryMode = "mock";

  listMeetingStatusValues(): readonly MeetingStatus[] {
    return MEETING_STATUS_VALUES;
  }
}
