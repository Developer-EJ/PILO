import {
  CreateVoiceRoomInput,
  UpdateVoiceRoomInput,
  VoiceRepositoryMode,
  VoiceRoomRecord,
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
}
