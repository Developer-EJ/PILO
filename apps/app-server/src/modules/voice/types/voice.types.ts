export const VOICE_ROOM_STATUS_VALUES = [
  "active",
  "inactive",
  "archived",
] as const;

export type VoiceRoomStatus = (typeof VOICE_ROOM_STATUS_VALUES)[number];

export type VoiceRepositoryMode = "mock";

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
