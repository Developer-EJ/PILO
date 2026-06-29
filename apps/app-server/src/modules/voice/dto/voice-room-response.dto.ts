import { VoiceRepositoryMode, VoiceRoomRecord } from "../types/voice.types";

export interface VoiceScaffoldResponseDto {
  module: "voice";
  repositoryMode: VoiceRepositoryMode;
}

export interface UpdateVoiceRoomStatusRequestDto {
  status?: unknown;
}

export type VoiceRoomResponseDto = VoiceRoomRecord;
