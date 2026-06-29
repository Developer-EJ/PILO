import {
  CreateVoiceSessionInput,
  CreateVoiceRoomInput,
  UpdateVoiceSessionInput,
  UpdateVoiceRoomInput,
  VoiceRepositoryMode,
  VoiceRoomRecord,
  VoiceSessionRecord,
} from "../types/voice.types";

export const VOICE_REPOSITORY = Symbol("VOICE_REPOSITORY");

export interface VoiceRepository {
  readonly mode: VoiceRepositoryMode;

  createVoiceRoom(input: CreateVoiceRoomInput): VoiceRoomRecord;

  findVoiceRoomById(voiceRoomId: string): VoiceRoomRecord | null;

  findVoiceRoomByMeetingId(meetingId: string): VoiceRoomRecord | null;

  updateVoiceRoom(
    voiceRoomId: string,
    input: UpdateVoiceRoomInput,
  ): VoiceRoomRecord;

  createVoiceSession(input: CreateVoiceSessionInput): VoiceSessionRecord;

  listVoiceSessionsByVoiceRoom(voiceRoomId: string): VoiceSessionRecord[];

  findVoiceSessionById(voiceSessionId: string): VoiceSessionRecord | null;

  findActiveVoiceSessionByMember(
    voiceRoomId: string,
    memberId: string | null,
  ): VoiceSessionRecord | null;

  updateVoiceSession(
    voiceSessionId: string,
    input: UpdateVoiceSessionInput,
  ): VoiceSessionRecord;
}
