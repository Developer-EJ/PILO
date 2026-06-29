import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import "reflect-metadata";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { MeetingService } = require("../src/modules/meeting/meeting.service");
const {
  MockCurrentMemberAdapter,
} = require("../src/modules/meeting/adapters/mock-current-member.adapter");
const {
  MockMeetingReportWorkflowClient,
} = require("../src/modules/meeting/adapters/mock-meeting-report-workflow.adapter");
const {
  MockTaskDraftClient,
} = require("../src/modules/meeting/adapters/mock-task-draft.adapter");
const {
  MockMeetingRepository,
} = require("../src/modules/meeting/repositories/meeting.mock-repository");
const { VoiceController } = require("../src/modules/voice/voice.controller");
const { VoiceService } = require("../src/modules/voice/voice.service");
const {
  MockVoiceRoomProvider,
} = require("../src/modules/voice/adapters/mock-voice-room-provider.adapter");
const {
  MockVoiceRepository,
} = require("../src/modules/voice/repositories/voice.mock-repository");
const {
  VOICE_REPOSITORY,
} = require("../src/modules/voice/repositories/voice.repository");

function createMeetingContext() {
  const currentMemberAdapter = new MockCurrentMemberAdapter();
  const meetingService = new MeetingService(
    new MockMeetingRepository(),
    currentMemberAdapter,
    new MockMeetingReportWorkflowClient(),
    new MockTaskDraftClient(),
  );

  return {
    currentMemberAdapter,
    meetingService,
  };
}

function createVoiceService(context = createMeetingContext()) {
  return new VoiceService(
    new MockVoiceRepository(),
    new MockVoiceRoomProvider(),
    context.meetingService,
    context.currentMemberAdapter,
  );
}

describe("voice module", () => {
  it("keeps the voice repository behind an injectable token", () => {
    assert.equal(typeof VOICE_REPOSITORY, "symbol");
  });

  it("exposes scaffold status through the service and controller", () => {
    const service = createVoiceService();
    const controller = new VoiceController(service);

    assert.deepEqual(service.getScaffoldStatus(), {
      module: "voice",
      repositoryMode: "mock",
    });
    assert.deepEqual(
      controller.getScaffoldStatus(),
      service.getScaffoldStatus(),
    );
  });

  it("creates and reads one placeholder voice room per meeting", () => {
    const context = createMeetingContext();
    const service = createVoiceService(context);
    const controller = new VoiceController(service);
    const meeting = context.meetingService.createMeeting("workspace-1", {
      title: "Voice room meeting",
    });

    const voiceRoom = controller.createVoiceRoom("workspace-1", meeting.id);
    const duplicateVoiceRoom = controller.createVoiceRoom(
      "workspace-1",
      meeting.id,
    );

    assert.equal(voiceRoom.workspaceId, "workspace-1");
    assert.equal(voiceRoom.meetingId, meeting.id);
    assert.equal(voiceRoom.status, "active");
    assert.equal(
      voiceRoom.livekitRoomName,
      `mock-voice-room-workspace-1-${meeting.id}`,
    );
    assert.equal("livekitApiKey" in voiceRoom, false);
    assert.equal("livekitApiSecret" in voiceRoom, false);
    assert.equal(duplicateVoiceRoom.id, voiceRoom.id);
    assert.deepEqual(controller.getVoiceRoom(voiceRoom.id), voiceRoom);
    assert.deepEqual(
      controller.getVoiceRoomForMeeting("workspace-1", meeting.id),
      voiceRoom,
    );
  });

  it("validates meeting workspace boundaries and voice room statuses", () => {
    const context = createMeetingContext();
    const service = createVoiceService(context);
    const controller = new VoiceController(service);
    const meeting = context.meetingService.createMeeting("workspace-1", {
      title: "Voice room validation meeting",
    });
    const voiceRoom = controller.createVoiceRoom("workspace-1", meeting.id);

    assert.throws(() => controller.createVoiceRoom("workspace-2", meeting.id));
    assert.throws(() =>
      controller.getVoiceRoomForMeeting("workspace-2", meeting.id),
    );
    assert.throws(() =>
      controller.updateVoiceRoomStatus(voiceRoom.id, {
        status: "paused",
      }),
    );

    const inactiveVoiceRoom = controller.updateVoiceRoomStatus(voiceRoom.id, {
      status: "inactive",
    });
    const archivedVoiceRoom = controller.updateVoiceRoomStatus(voiceRoom.id, {
      status: "archived",
    });

    assert.equal(inactiveVoiceRoom.status, "inactive");
    assert.equal(archivedVoiceRoom.status, "archived");
  });

  it("joins, lists, updates recording status, and leaves voice sessions", () => {
    const context = createMeetingContext();
    context.currentMemberAdapter.registerWorkspaceMember({
      id: "voice-member-1",
      workspaceId: "workspace-1",
    });
    const service = createVoiceService(context);
    const controller = new VoiceController(service);
    const meeting = context.meetingService.createMeeting("workspace-1", {
      title: "Voice session meeting",
    });
    const voiceRoom = controller.createVoiceRoom("workspace-1", meeting.id);

    const voiceSession = controller.joinVoiceSession(voiceRoom.id, {
      memberId: "voice-member-1",
    });

    assert.equal(voiceSession.voiceRoomId, voiceRoom.id);
    assert.equal(voiceSession.meetingId, meeting.id);
    assert.equal(voiceSession.memberId, "voice-member-1");
    assert.equal(voiceSession.recordingStatus, "not_recording");
    assert.notEqual(voiceSession.startedAt, null);
    assert.equal(voiceSession.endedAt, null);
    assert.deepEqual(controller.listVoiceSessions(voiceRoom.id), [
      voiceSession,
    ]);

    const recordingSession = controller.updateVoiceSessionRecordingStatus(
      voiceSession.id,
      {
        recordingStatus: "recording",
      },
    );

    assert.equal(recordingSession.recordingStatus, "recording");

    const endedSession = controller.leaveVoiceSession(voiceSession.id);

    assert.notEqual(endedSession.endedAt, null);
    assert.equal(
      new Date(endedSession.endedAt).getTime() >=
        new Date(endedSession.startedAt).getTime(),
      true,
    );
  });

  it("rejects duplicate joins, duplicate leaves, invalid members, and ended session updates", () => {
    const context = createMeetingContext();
    context.currentMemberAdapter.registerWorkspaceMember({
      id: "voice-member-2",
      workspaceId: "workspace-1",
    });
    context.currentMemberAdapter.registerWorkspaceMember({
      id: "external-voice-member",
      workspaceId: "workspace-2",
    });
    const service = createVoiceService(context);
    const controller = new VoiceController(service);
    const meeting = context.meetingService.createMeeting("workspace-1", {
      title: "Voice session validation meeting",
    });
    const voiceRoom = controller.createVoiceRoom("workspace-1", meeting.id);
    const voiceSession = controller.joinVoiceSession(voiceRoom.id, {
      memberId: "voice-member-2",
    });

    assert.throws(() =>
      controller.joinVoiceSession(voiceRoom.id, {
        memberId: "voice-member-2",
      }),
    );
    assert.throws(() =>
      controller.joinVoiceSession(voiceRoom.id, {
        memberId: "external-voice-member",
      }),
    );
    assert.throws(() =>
      controller.updateVoiceSessionRecordingStatus(voiceSession.id, {
        recordingStatus: "paused",
      }),
    );

    controller.leaveVoiceSession(voiceSession.id);

    assert.throws(() => controller.leaveVoiceSession(voiceSession.id));
    assert.throws(() =>
      controller.updateVoiceSessionRecordingStatus(voiceSession.id, {
        recordingStatus: "completed",
      }),
    );
  });
});
