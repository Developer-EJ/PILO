import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import "reflect-metadata";

const require = createRequire(import.meta.url);
require("ts-node/register");

const {
  MeetingController,
} = require("../src/modules/meeting/meeting.controller");
const { MeetingService } = require("../src/modules/meeting/meeting.service");
const {
  MockMeetingRepository,
} = require("../src/modules/meeting/repositories/meeting.mock-repository");
const {
  MockCurrentMemberAdapter,
} = require("../src/modules/meeting/adapters/mock-current-member.adapter");
const {
  MEETING_REPOSITORY,
} = require("../src/modules/meeting/repositories/meeting.repository");
const {
  MEETING_STATUS_VALUES,
} = require("../src/modules/meeting/types/meeting.types");

describe("meeting module scaffold", () => {
  it("keeps the repository behind an injectable token", () => {
    assert.equal(typeof MEETING_REPOSITORY, "symbol");
  });

  it("exposes scaffold status through the service and controller", () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = new MeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);

    assert.deepEqual(service.getScaffoldStatus(), {
      module: "meeting",
      repositoryMode: "mock",
      meetingStatusValues: MEETING_STATUS_VALUES,
    });
    assert.deepEqual(
      controller.getScaffoldStatus(),
      service.getScaffoldStatus(),
    );
  });

  it("creates, lists, and reads meetings by workspace", () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = new MeetingService(repository, currentMemberAdapter);
    const controller = new MeetingController(service);

    const meeting = controller.createMeeting("workspace-1", {
      title: "Sprint planning",
      purpose: "Plan the next implementation slice",
    });

    assert.equal(meeting.workspaceId, "workspace-1");
    assert.equal(meeting.title, "Sprint planning");
    assert.equal(meeting.purpose, "Plan the next implementation slice");
    assert.equal(meeting.status, "scheduled");
    assert.equal(meeting.startedAt, null);
    assert.equal(meeting.endedAt, null);
    assert.equal(meeting.createdByMemberId.length > 0, true);
    assert.deepEqual(controller.listMeetings("workspace-1"), [meeting]);
    assert.deepEqual(controller.listMeetings("workspace-2"), []);
    assert.deepEqual(controller.getMeeting(meeting.id), meeting);
  });

  it("validates meeting status transitions and timestamps", () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = new MeetingService(repository, currentMemberAdapter);

    const meeting = service.createMeeting("workspace-1", {
      title: "Status meeting",
    });

    const inProgressMeeting = service.updateMeetingStatus(meeting.id, {
      status: "in_progress",
    });

    assert.equal(inProgressMeeting.status, "in_progress");
    assert.notEqual(inProgressMeeting.startedAt, null);
    assert.equal(inProgressMeeting.endedAt, null);

    const endedMeeting = service.updateMeetingStatus(meeting.id, {
      status: "ended",
    });

    assert.equal(endedMeeting.status, "ended");
    assert.notEqual(endedMeeting.startedAt, null);
    assert.notEqual(endedMeeting.endedAt, null);
    assert.equal(
      new Date(endedMeeting.endedAt).getTime() >=
        new Date(endedMeeting.startedAt).getTime(),
      true,
    );
  });

  it("rejects invalid status values and workspace mismatches", () => {
    const repository = new MockMeetingRepository();
    const currentMemberAdapter = new MockCurrentMemberAdapter();
    const service = new MeetingService(repository, currentMemberAdapter);

    const meeting = service.createMeeting("workspace-1", {
      title: "Workspace guard meeting",
    });

    assert.throws(() =>
      service.updateMeetingStatus(meeting.id, {
        status: "invalid",
      }),
    );
    assert.throws(() =>
      service.getMeetingForWorkspace("workspace-2", meeting.id),
    );
  });
});
