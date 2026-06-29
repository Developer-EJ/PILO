export const VOICE_CLIENT_EVENT_NAMES = {
  join: "voice.join",
  leave: "voice.leave",
  broadcastStatus: "voice.status.broadcast",
  providerEvent: "voice.provider.event",
} as const;

export const VOICE_SERVER_EVENT_NAMES = {
  joined: "voice.joined",
  left: "voice.left",
  meetingStatus: "meeting.voice.status",
  providerEventReceived: "voice.provider.event.received",
} as const;

export const VOICE_RECORDING_STATUS_VALUES = [
  "not_recording",
  "recording",
  "processing",
  "completed",
  "failed",
] as const;

export type VoiceRecordingStatus =
  (typeof VOICE_RECORDING_STATUS_VALUES)[number];

export interface VoiceRealtimeEvent<TPayload> {
  event: string;
  data: TPayload;
}

export interface VoiceMemberEventRequest {
  workspaceId?: unknown;
  meetingId?: unknown;
  voiceRoomId?: unknown;
  voiceSessionId?: unknown;
  memberId?: unknown;
  mockAuth?: unknown;
}

export interface VoiceMemberEventPayload {
  workspaceId: string;
  meetingId: string;
  voiceRoomId: string;
  voiceSessionId: string;
  memberId: string;
  occurredAt: string;
}

export interface MeetingVoiceStatusRequest {
  workspaceId?: unknown;
  meetingId?: unknown;
  voiceRoomId?: unknown;
  activeSessionCount?: unknown;
  recordingStatus?: unknown;
  mockAuth?: unknown;
}

export interface MeetingVoiceStatusPayload {
  workspaceId: string;
  meetingId: string;
  voiceRoomId: string;
  activeSessionCount: number;
  recordingStatus: VoiceRecordingStatus;
  occurredAt: string;
}

export interface ProviderVoiceEventRequest {
  provider?: unknown;
  providerEventName?: unknown;
  roomName?: unknown;
  raw?: unknown;
}

export interface ProviderVoiceEventPayload {
  provider: string;
  providerEventName: string;
  roomName: string;
  raw: unknown;
  receivedAt: string;
}
