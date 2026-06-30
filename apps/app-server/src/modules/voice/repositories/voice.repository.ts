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

type MaybePromise<T> = T | Promise<T>;

export interface VoiceRepository {
  readonly mode: VoiceRepositoryMode;

  createVoiceRoom(input: CreateVoiceRoomInput): MaybePromise<VoiceRoomRecord>;

  findVoiceRoomById(
    voiceRoomId: string,
  ): MaybePromise<VoiceRoomRecord | null>;

  findVoiceRoomByMeetingId(
    meetingId: string,
  ): MaybePromise<VoiceRoomRecord | null>;

  updateVoiceRoom(
    voiceRoomId: string,
    input: UpdateVoiceRoomInput,
  ): MaybePromise<VoiceRoomRecord>;

  createVoiceSession(
    input: CreateVoiceSessionInput,
  ): MaybePromise<VoiceSessionRecord>;

  listVoiceSessionsByVoiceRoom(
    voiceRoomId: string,
  ): MaybePromise<VoiceSessionRecord[]>;

  findVoiceSessionById(
    voiceSessionId: string,
  ): MaybePromise<VoiceSessionRecord | null>;

  findActiveVoiceSessionByMember(
    voiceRoomId: string,
    memberId: string | null,
  ): MaybePromise<VoiceSessionRecord | null>;

  updateVoiceSession(
    voiceSessionId: string,
    input: UpdateVoiceSessionInput,
  ): MaybePromise<VoiceSessionRecord>;
}
