import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  CreateVoiceSessionInput,
  CreateVoiceRoomInput,
  UpdateVoiceSessionInput,
  UpdateVoiceRoomInput,
  VoiceRepositoryMode,
  VoiceRoomRecord,
  VoiceSessionRecord,
} from "../types/voice.types";
import { VoiceRepository } from "./voice.repository";

@Injectable()
export class MockVoiceRepository implements VoiceRepository {
  readonly mode: VoiceRepositoryMode = "mock";

  private readonly voiceRooms = new Map<string, VoiceRoomRecord>();
  private readonly voiceSessions = new Map<string, VoiceSessionRecord>();

  createVoiceRoom(input: CreateVoiceRoomInput): VoiceRoomRecord {
    const now = new Date().toISOString();
    const voiceRoom: VoiceRoomRecord = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      meetingId: input.meetingId ?? null,
      livekitRoomName: input.livekitRoomName ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    this.voiceRooms.set(voiceRoom.id, voiceRoom);

    return voiceRoom;
  }

  findVoiceRoomById(voiceRoomId: string): VoiceRoomRecord | null {
    return this.voiceRooms.get(voiceRoomId) ?? null;
  }

  findVoiceRoomByMeetingId(meetingId: string): VoiceRoomRecord | null {
    return (
      [...this.voiceRooms.values()].find(
        (voiceRoom) => voiceRoom.meetingId === meetingId,
      ) ?? null
    );
  }

  updateVoiceRoom(
    voiceRoomId: string,
    input: UpdateVoiceRoomInput,
  ): VoiceRoomRecord {
    const voiceRoom = this.voiceRooms.get(voiceRoomId);

    if (!voiceRoom) {
      throw new Error(`Voice room not found: ${voiceRoomId}`);
    }

    const updatedVoiceRoom: VoiceRoomRecord = {
      ...voiceRoom,
      status: input.status,
      updatedAt: input.updatedAt,
    };

    this.voiceRooms.set(voiceRoomId, updatedVoiceRoom);

    return updatedVoiceRoom;
  }

  createVoiceSession(input: CreateVoiceSessionInput): VoiceSessionRecord {
    const now = new Date().toISOString();
    const voiceSession: VoiceSessionRecord = {
      id: randomUUID(),
      voiceRoomId: input.voiceRoomId,
      meetingId: input.meetingId ?? null,
      memberId: input.memberId ?? null,
      recordingStatus: "not_recording",
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.voiceSessions.set(voiceSession.id, voiceSession);

    return voiceSession;
  }

  listVoiceSessionsByVoiceRoom(voiceRoomId: string): VoiceSessionRecord[] {
    return [...this.voiceSessions.values()].filter(
      (voiceSession) => voiceSession.voiceRoomId === voiceRoomId,
    );
  }

  findVoiceSessionById(voiceSessionId: string): VoiceSessionRecord | null {
    return this.voiceSessions.get(voiceSessionId) ?? null;
  }

  findActiveVoiceSessionByMember(
    voiceRoomId: string,
    memberId: string | null,
  ): VoiceSessionRecord | null {
    return (
      this.listVoiceSessionsByVoiceRoom(voiceRoomId).find(
        (voiceSession) =>
          voiceSession.memberId === memberId && voiceSession.endedAt === null,
      ) ?? null
    );
  }

  updateVoiceSession(
    voiceSessionId: string,
    input: UpdateVoiceSessionInput,
  ): VoiceSessionRecord {
    const voiceSession = this.voiceSessions.get(voiceSessionId);

    if (!voiceSession) {
      throw new Error(`Voice session not found: ${voiceSessionId}`);
    }

    const updatedVoiceSession: VoiceSessionRecord = {
      ...voiceSession,
      recordingStatus: input.recordingStatus ?? voiceSession.recordingStatus,
      endedAt:
        input.endedAt === undefined ? voiceSession.endedAt : input.endedAt,
      updatedAt: input.updatedAt,
    };

    this.voiceSessions.set(voiceSessionId, updatedVoiceSession);

    return updatedVoiceSession;
  }
}
