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
    const service = new MeetingService(repository);
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
});
