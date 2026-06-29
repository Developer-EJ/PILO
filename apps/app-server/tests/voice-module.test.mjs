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

function createMeetingService() {
  return new MeetingService(
    new MockMeetingRepository(),
    new MockCurrentMemberAdapter(),
    new MockMeetingReportWorkflowClient(),
    new MockTaskDraftClient(),
  );
}

function createVoiceService(meetingService = createMeetingService()) {
  return new VoiceService(
    new MockVoiceRepository(),
    new MockVoiceRoomProvider(),
    meetingService,
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
    const meetingService = createMeetingService();
    const service = createVoiceService(meetingService);
    const controller = new VoiceController(service);
    const meeting = meetingService.createMeeting("workspace-1", {
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
    const meetingService = createMeetingService();
    const service = createVoiceService(meetingService);
    const controller = new VoiceController(service);
    const meeting = meetingService.createMeeting("workspace-1", {
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
});
