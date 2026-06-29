import {
  VoiceRepositoryMode,
  VoiceRoomRecord,
  VoiceSessionRecord,
} from "../types/voice.types";

export interface VoiceScaffoldResponseDto {
  module: "voice";
  repositoryMode: VoiceRepositoryMode;
}

export interface UpdateVoiceRoomStatusRequestDto {
  status?: unknown;
}

export interface JoinVoiceSessionRequestDto {
  memberId?: unknown;
}

export interface UpdateVoiceSessionRecordingStatusRequestDto {
  recordingStatus?: unknown;
}

export type VoiceRoomResponseDto = VoiceRoomRecord;

export type VoiceSessionResponseDto = VoiceSessionRecord;
