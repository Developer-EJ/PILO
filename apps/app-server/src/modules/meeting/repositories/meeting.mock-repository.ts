import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  CreateMeetingInput,
  MEETING_STATUS_VALUES,
  MeetingRecord,
  MeetingStatus,
  UpdateMeetingInput,
} from "../types/meeting.types";
import { MeetingRepository } from "./meeting.repository";

@Injectable()
export class MockMeetingRepository implements MeetingRepository {
  private readonly meetings = new Map<string, MeetingRecord>();

  listMeetingStatusValues(): readonly MeetingStatus[] {
    return MEETING_STATUS_VALUES;
  }

  createMeeting(input: CreateMeetingInput): MeetingRecord {
    const now = new Date().toISOString();
    const meeting: MeetingRecord = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      canvasBoardId: input.canvasBoardId ?? null,
      title: input.title,
      purpose: input.purpose ?? null,
      status: "scheduled",
      startedAt: null,
      endedAt: null,
      createdByMemberId: input.createdByMemberId,
      createdAt: now,
      updatedAt: now,
    };

    this.meetings.set(meeting.id, meeting);

    return meeting;
  }

  listMeetingsByWorkspace(workspaceId: string): MeetingRecord[] {
    return [...this.meetings.values()].filter(
      (meeting) => meeting.workspaceId === workspaceId,
    );
  }

  findMeetingById(meetingId: string): MeetingRecord | null {
    return this.meetings.get(meetingId) ?? null;
  }

  updateMeeting(meetingId: string, input: UpdateMeetingInput): MeetingRecord {
    const meeting = this.meetings.get(meetingId);

    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    const updatedMeeting: MeetingRecord = {
      ...meeting,
      status: input.status,
      startedAt:
        input.startedAt === undefined ? meeting.startedAt : input.startedAt,
      endedAt: input.endedAt === undefined ? meeting.endedAt : input.endedAt,
      updatedAt: input.updatedAt,
    };

    this.meetings.set(meetingId, updatedMeeting);

    return updatedMeeting;
  }
}
