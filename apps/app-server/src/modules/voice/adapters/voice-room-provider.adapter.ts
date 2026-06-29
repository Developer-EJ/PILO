export const VOICE_ROOM_PROVIDER = Symbol("VOICE_ROOM_PROVIDER");

export interface CreateProviderRoomNameInput {
  workspaceId: string;
  meetingId: string;
}

export interface VoiceRoomProvider {
  createRoomName(input: CreateProviderRoomNameInput): string;
}
