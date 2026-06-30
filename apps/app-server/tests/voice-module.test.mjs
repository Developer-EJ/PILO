import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import "reflect-metadata";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { RequestMethod } = require("@nestjs/common");
const {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} = require("@nestjs/common/constants");
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
const { VoiceRouteGuard } = require("../src/modules/voice/voice-route.guard");
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
  it("keeps the voice repository behind an injectable token", async () => {
    assert.equal(typeof VOICE_REPOSITORY, "symbol");
  });

  it("exposes scaffold status through the service and controller", async () => {
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
    assert.equal(
      Reflect.getMetadata(PATH_METADATA, controller.getScaffoldStatus),
      "voice",
    );
    assert.equal(
      Reflect.getMetadata(METHOD_METADATA, controller.getScaffoldStatus),
      RequestMethod.GET,
    );
    assert.equal(
      Reflect.getMetadata(PATH_METADATA, controller.submitAudioChunk),
      "voice-sessions/:voiceSessionId/audio-chunks",
    );
    assert.equal(
      Reflect.getMetadata(METHOD_METADATA, controller.submitAudioChunk),
      RequestMethod.POST,
    );
    assert.deepEqual(
      Reflect.getMetadata(
        GUARDS_METADATA,
        VoiceController.prototype.createVoiceRoom,
      ),
      [VoiceRouteGuard],
    );
    assert.deepEqual(
      Reflect.getMetadata(
        GUARDS_METADATA,
        VoiceController.prototype.submitAudioChunk,
      ),
      [VoiceRouteGuard],
    );
    assert.equal(
      Reflect.getMetadata(
        GUARDS_METADATA,
        VoiceController.prototype.getScaffoldStatus,
      ),
      undefined,
    );
  });

  it("creates and reads one placeholder voice room per meeting", async () => {
    const context = createMeetingContext();
    const service = createVoiceService(context);
    const controller = new VoiceController(service);
    const meeting = await context.meetingService.createMeeting("workspace-1", {
      title: "Voice room meeting",
    });

    const voiceRoom = await controller.createVoiceRoom("workspace-1", meeting.id);
    const duplicateVoiceRoom = await controller.createVoiceRoom(
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
      await controller.getVoiceRoomForMeeting("workspace-1", meeting.id),
      voiceRoom,
    );
  });

  it("validates meeting workspace boundaries and voice room statuses", async () => {
    const context = createMeetingContext();
    const service = createVoiceService(context);
    const controller = new VoiceController(service);
    const meeting = await context.meetingService.createMeeting("workspace-1", {
      title: "Voice room validation meeting",
    });
    const voiceRoom = await controller.createVoiceRoom("workspace-1", meeting.id);

    await assert.rejects(async () => controller.createVoiceRoom("workspace-2", meeting.id));
    await assert.rejects(async () =>
      controller.getVoiceRoomForMeeting("workspace-2", meeting.id),
    );
    await assert.rejects(async () =>
      controller.updateVoiceRoomStatus(voiceRoom.id, {
        status: "paused",
      }),
    );

    const inactiveVoiceRoom = await controller.updateVoiceRoomStatus(voiceRoom.id, {
      status: "inactive",
    });
    const archivedVoiceRoom = await controller.updateVoiceRoomStatus(voiceRoom.id, {
      status: "archived",
    });

    assert.equal(inactiveVoiceRoom.status, "inactive");
    assert.equal(archivedVoiceRoom.status, "archived");
  });

  it("resolves route workspace ids from voice rooms and sessions", async () => {
    const context = createMeetingContext();
    const service = createVoiceService(context);
    const meeting = await context.meetingService.createMeeting("workspace-1", {
      title: "Voice route guard meeting",
    });
    const voiceRoom = await service.createVoiceRoom("workspace-1", meeting.id);
    const voiceSession = await service.joinVoiceSession(voiceRoom.id);

    assert.equal(
      await service.resolveRouteWorkspaceId({ meetingId: meeting.id }),
      "workspace-1",
    );
    assert.equal(
      await service.resolveRouteWorkspaceId({ voiceRoomId: voiceRoom.id }),
      "workspace-1",
    );
    assert.equal(
      await service.resolveRouteWorkspaceId({ voiceSessionId: voiceSession.id }),
      "workspace-1",
    );
    await assert.rejects(async () =>
      service.resolveRouteWorkspaceId({
        workspaceId: "workspace-2",
        voiceRoomId: voiceRoom.id,
      }),
    );
  });

  it("joins, lists, updates recording status, and leaves voice sessions", async () => {
    const context = createMeetingContext();
    const currentMember =
      context.currentMemberAdapter.getCurrentMember("workspace-1");
    const service = createVoiceService(context);
    const controller = new VoiceController(service);
    const meeting = await context.meetingService.createMeeting("workspace-1", {
      title: "Voice session meeting",
    });
    const voiceRoom = await controller.createVoiceRoom("workspace-1", meeting.id);

    const voiceSession = await controller.joinVoiceSession(voiceRoom.id);

    assert.equal(voiceSession.voiceRoomId, voiceRoom.id);
    assert.equal(voiceSession.meetingId, meeting.id);
    assert.equal(voiceSession.memberId, currentMember.id);
    assert.equal(voiceSession.recordingStatus, "not_recording");
    assert.notEqual(voiceSession.startedAt, null);
    assert.equal(voiceSession.endedAt, null);
    assert.deepEqual(await controller.listVoiceSessions(voiceRoom.id), [
      voiceSession,
    ]);

    const recordingSession = await controller.updateVoiceSessionRecordingStatus(
      voiceSession.id,
      {
        recordingStatus: "recording",
      },
    );

    assert.equal(recordingSession.recordingStatus, "recording");

    const endedSession = await await controller.leaveVoiceSession(voiceSession.id);

    assert.notEqual(endedSession.endedAt, null);
    assert.equal(
      new Date(endedSession.endedAt).getTime() >=
        new Date(endedSession.startedAt).getTime(),
      true,
    );
  });

  it("turns submitted audio chunks into meeting STT transcript segments", async () => {
    const context = createMeetingContext();
    const currentMember =
      context.currentMemberAdapter.getCurrentMember("workspace-1");
    const service = createVoiceService(context);
    const controller = new VoiceController(service);
    const meeting = await context.meetingService.createMeeting("workspace-1", {
      title: "Voice STT meeting",
    });
    const voiceRoom = await controller.createVoiceRoom("workspace-1", meeting.id);
    const voiceSession = await controller.joinVoiceSession(voiceRoom.id);

    await controller.updateVoiceSessionRecordingStatus(voiceSession.id, {
      recordingStatus: "recording",
    });

    const result = await controller.submitAudioChunk(voiceSession.id, {
      sequence: 1,
      mimeType: "audio/webm",
      audioBase64: Buffer.from("hello").toString("base64"),
      capturedStartedAt: "2026-06-30T00:00:00.000Z",
      capturedEndedAt: "2026-06-30T00:00:02.000Z",
    });

    assert.equal(result.voiceSession.recordingStatus, "completed");
    assert.equal(result.voiceSession.id, voiceSession.id);
    assert.equal(result.transcriptSegment.meetingId, meeting.id);
    assert.equal(result.transcriptSegment.source, "stt");
    assert.equal(result.transcriptSegment.speakerMemberId, currentMember.id);
    assert.equal(
      result.transcriptSegment.body,
      "Local STT chunk 1 captured 5 bytes of audio/webm audio.",
    );
    assert.deepEqual(
      await context.meetingService.listTranscriptSegments(meeting.id),
      [result.transcriptSegment],
    );
    await assert.rejects(async () =>
      controller.submitAudioChunk(voiceSession.id, {
        sequence: 2,
        mimeType: "audio/webm",
        audioBase64: "not-base64",
      }),
    );
  });

  it("rejects duplicate joins, duplicate leaves, invalid recording status, and ended session updates", async () => {
    const context = createMeetingContext();
    const service = createVoiceService(context);
    const controller = new VoiceController(service);
    const meeting = await context.meetingService.createMeeting("workspace-1", {
      title: "Voice session validation meeting",
    });
    const voiceRoom = await controller.createVoiceRoom("workspace-1", meeting.id);
    const voiceSession = await controller.joinVoiceSession(voiceRoom.id);

    await assert.rejects(async () => controller.joinVoiceSession(voiceRoom.id));
    await assert.rejects(async () =>
      await controller.updateVoiceSessionRecordingStatus(voiceSession.id, {
        recordingStatus: "paused",
      }),
    );

    await controller.leaveVoiceSession(voiceSession.id);

    await assert.rejects(async () => controller.leaveVoiceSession(voiceSession.id));
    await assert.rejects(async () =>
      await controller.updateVoiceSessionRecordingStatus(voiceSession.id, {
        recordingStatus: "completed",
      }),
    );
  });
});
