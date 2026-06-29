import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  CreateVoiceRoomInput,
  UpdateVoiceRoomInput,
  VoiceRepositoryMode,
  VoiceRoomRecord,
} from "../types/voice.types";
import { VoiceRepository } from "./voice.repository";

@Injectable()
export class MockVoiceRepository implements VoiceRepository {
  readonly mode: VoiceRepositoryMode = "mock";

  private readonly voiceRooms = new Map<string, VoiceRoomRecord>();

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
}
