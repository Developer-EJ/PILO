import { TranscriptSegmentResponseDto } from "../../meeting/dto/meeting-scaffold-response.dto";
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

export interface UpdateVoiceSessionRecordingStatusRequestDto {
  recordingStatus?: unknown;
}

export interface SubmitVoiceAudioChunkRequestDto {
  sequence?: unknown;
  mimeType?: unknown;
  audioBase64?: unknown;
  capturedStartedAt?: unknown;
  capturedEndedAt?: unknown;
}

export interface VoiceAudioTranscriptResponseDto {
  voiceSession: VoiceSessionResponseDto;
  transcriptSegment: TranscriptSegmentResponseDto;
}

export type VoiceRoomResponseDto = VoiceRoomRecord;

export type VoiceSessionResponseDto = VoiceSessionRecord;
