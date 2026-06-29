import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import "reflect-metadata";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { MockVoiceEventGuard } = require("../src/voice/mock-voice-event.guard");
const { VoiceEventsService } = require("../src/voice/voice-events.service");
const { VOICE_SERVER_EVENT_NAMES } = require("../src/voice/voice-events.types");

function createVoiceEventsService() {
  return new VoiceEventsService(new MockVoiceEventGuard());
}

describe("voice realtime events", () => {
  it("builds joined and left events with stable payloads", () => {
    const service = createVoiceEventsService();
    const request = {
      workspaceId: "workspace-1",
      meetingId: "meeting-1",
      voiceRoomId: "voice-room-1",
      voiceSessionId: "voice-session-1",
      memberId: "member-1",
      mockAuth: true,
    };

    const joinedEvent = service.createJoinedEvent(request);
    const leftEvent = service.createLeftEvent(request);

    assert.equal(joinedEvent.event, VOICE_SERVER_EVENT_NAMES.joined);
    assert.equal(leftEvent.event, VOICE_SERVER_EVENT_NAMES.left);
    assert.deepEqual(
      {
        ...joinedEvent.data,
        occurredAt: "stable",
      },
      {
        workspaceId: "workspace-1",
        meetingId: "meeting-1",
        voiceRoomId: "voice-room-1",
        voiceSessionId: "voice-session-1",
        memberId: "member-1",
        occurredAt: "stable",
      },
    );
  });

  it("builds meeting voice status broadcast payloads", () => {
    const service = createVoiceEventsService();

    const event = service.createMeetingVoiceStatusEvent({
      workspaceId: "workspace-1",
      meetingId: "meeting-1",
      voiceRoomId: "voice-room-1",
      activeSessionCount: 2,
      recordingStatus: "recording",
      mockAuth: true,
    });

    assert.equal(event.event, VOICE_SERVER_EVENT_NAMES.meetingStatus);
    assert.equal(event.data.workspaceId, "workspace-1");
    assert.equal(event.data.meetingId, "meeting-1");
    assert.equal(event.data.voiceRoomId, "voice-room-1");
    assert.equal(event.data.activeSessionCount, 2);
    assert.equal(event.data.recordingStatus, "recording");
  });

  it("requires mock auth for internal client voice events", () => {
    const service = createVoiceEventsService();

    assert.throws(() =>
      service.createJoinedEvent({
        workspaceId: "workspace-1",
        meetingId: "meeting-1",
        voiceRoomId: "voice-room-1",
        voiceSessionId: "voice-session-1",
        memberId: "member-1",
      }),
    );
    assert.throws(() =>
      service.createMeetingVoiceStatusEvent({
        workspaceId: "workspace-1",
        meetingId: "meeting-1",
        voiceRoomId: "voice-room-1",
        activeSessionCount: 1,
        recordingStatus: "paused",
        mockAuth: true,
      }),
    );
  });

  it("keeps provider events separate from internal voice events", () => {
    const service = createVoiceEventsService();

    const event = service.createProviderEvent({
      provider: "livekit",
      providerEventName: "participant_joined",
      roomName: "provider-room-1",
      raw: {
        participantSid: "PA_mock",
      },
    });

    assert.equal(event.event, VOICE_SERVER_EVENT_NAMES.providerEventReceived);
    assert.notEqual(event.event, VOICE_SERVER_EVENT_NAMES.joined);
    assert.equal(event.data.provider, "livekit");
    assert.equal(event.data.providerEventName, "participant_joined");
    assert.equal(event.data.roomName, "provider-room-1");
    assert.deepEqual(event.data.raw, {
      participantSid: "PA_mock",
    });
  });
});
