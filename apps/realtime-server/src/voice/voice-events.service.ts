import { BadRequestException, Injectable } from "@nestjs/common";
import { MockVoiceEventGuard } from "./mock-voice-event.guard";
import {
  MeetingVoiceStatusPayload,
  MeetingVoiceStatusRequest,
  ProviderVoiceEventPayload,
  ProviderVoiceEventRequest,
  VOICE_RECORDING_STATUS_VALUES,
  VOICE_SERVER_EVENT_NAMES,
  VoiceMemberEventPayload,
  VoiceMemberEventRequest,
  VoiceRealtimeEvent,
  VoiceRecordingStatus,
} from "./voice-events.types";

@Injectable()
export class VoiceEventsService {
  constructor(private readonly mockVoiceEventGuard: MockVoiceEventGuard) {}

  createJoinedEvent(
    request: VoiceMemberEventRequest,
  ): VoiceRealtimeEvent<VoiceMemberEventPayload> {
    this.mockVoiceEventGuard.assertAllowed(request);

    return {
      event: VOICE_SERVER_EVENT_NAMES.joined,
      data: this.toMemberEventPayload(request),
    };
  }

  createLeftEvent(
    request: VoiceMemberEventRequest,
  ): VoiceRealtimeEvent<VoiceMemberEventPayload> {
    this.mockVoiceEventGuard.assertAllowed(request);

    return {
      event: VOICE_SERVER_EVENT_NAMES.left,
      data: this.toMemberEventPayload(request),
    };
  }

  createMeetingVoiceStatusEvent(
    request: MeetingVoiceStatusRequest,
  ): VoiceRealtimeEvent<MeetingVoiceStatusPayload> {
    this.mockVoiceEventGuard.assertAllowed(request);

    return {
      event: VOICE_SERVER_EVENT_NAMES.meetingStatus,
      data: {
        workspaceId: this.requireNonEmptyString(
          request.workspaceId,
          "workspaceId",
        ),
        meetingId: this.requireNonEmptyString(request.meetingId, "meetingId"),
        voiceRoomId: this.requireNonEmptyString(
          request.voiceRoomId,
          "voiceRoomId",
        ),
        activeSessionCount: this.requireNonNegativeInteger(
          request.activeSessionCount,
          "activeSessionCount",
        ),
        recordingStatus: this.parseRecordingStatus(request.recordingStatus),
        occurredAt: new Date().toISOString(),
      },
    };
  }

  createProviderEvent(
    request: ProviderVoiceEventRequest,
  ): VoiceRealtimeEvent<ProviderVoiceEventPayload> {
    return {
      event: VOICE_SERVER_EVENT_NAMES.providerEventReceived,
      data: {
        provider: this.requireNonEmptyString(request.provider, "provider"),
        providerEventName: this.requireNonEmptyString(
          request.providerEventName,
          "providerEventName",
        ),
        roomName: this.requireNonEmptyString(request.roomName, "roomName"),
        raw: request.raw ?? null,
        receivedAt: new Date().toISOString(),
      },
    };
  }

  private toMemberEventPayload(
    request: VoiceMemberEventRequest,
  ): VoiceMemberEventPayload {
    return {
      workspaceId: this.requireNonEmptyString(
        request.workspaceId,
        "workspaceId",
      ),
      meetingId: this.requireNonEmptyString(request.meetingId, "meetingId"),
      voiceRoomId: this.requireNonEmptyString(
        request.voiceRoomId,
        "voiceRoomId",
      ),
      voiceSessionId: this.requireNonEmptyString(
        request.voiceSessionId,
        "voiceSessionId",
      ),
      memberId: this.requireNonEmptyString(request.memberId, "memberId"),
      occurredAt: new Date().toISOString(),
    };
  }

  private parseRecordingStatus(value: unknown): VoiceRecordingStatus {
    if (
      typeof value === "string" &&
      VOICE_RECORDING_STATUS_VALUES.includes(value as VoiceRecordingStatus)
    ) {
      return value as VoiceRecordingStatus;
    }

    throw new BadRequestException(
      `recordingStatus must be one of: ${VOICE_RECORDING_STATUS_VALUES.join(", ")}`,
    );
  }

  private requireNonEmptyString(value: unknown, fieldName: string): string {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    throw new BadRequestException(`${fieldName} must be a non-empty string`);
  }

  private requireNonNegativeInteger(value: unknown, fieldName: string): number {
    if (Number.isInteger(value) && Number(value) >= 0) {
      return Number(value);
    }

    throw new BadRequestException(
      `${fieldName} must be a non-negative integer`,
    );
  }
}
