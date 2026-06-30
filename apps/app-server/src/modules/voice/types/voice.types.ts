export const VOICE_ROOM_STATUS_VALUES = [
  "active",
  "inactive",
  "archived",
] as const;

export const VOICE_SESSION_RECORDING_STATUS_VALUES = [
  "not_recording",
  "recording",
  "processing",
  "completed",
  "failed",
] as const;

export type VoiceRoomStatus = (typeof VOICE_ROOM_STATUS_VALUES)[number];

export type VoiceSessionRecordingStatus =
  (typeof VOICE_SESSION_RECORDING_STATUS_VALUES)[number];

export type VoiceRepositoryMode = "mock" | "database";

export interface VoiceRoomRecord {
  id: string;
  workspaceId: string;
  meetingId: string | null;
  livekitRoomName: string | null;
  status: VoiceRoomStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVoiceRoomInput {
  workspaceId: string;
  meetingId?: string | null;
  livekitRoomName?: string | null;
}

export interface UpdateVoiceRoomInput {
  status: VoiceRoomStatus;
  updatedAt: string;
}

export interface VoiceSessionRecord {
  id: string;
  voiceRoomId: string;
  meetingId: string | null;
  memberId: string | null;
  recordingStatus: VoiceSessionRecordingStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVoiceSessionInput {
  voiceRoomId: string;
  meetingId?: string | null;
  memberId?: string | null;
}

export interface UpdateVoiceSessionInput {
  recordingStatus?: VoiceSessionRecordingStatus;
  endedAt?: string | null;
  updatedAt: string;
}
