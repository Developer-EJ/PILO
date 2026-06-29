import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import "reflect-metadata";

const require = createRequire(import.meta.url);
require("ts-node/register");

const { NestFactory } = require("@nestjs/core");
const { FastifyAdapter } = require("@nestjs/platform-fastify");
const { MeetingModule } = require("../src/modules/meeting/meeting.module");
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

  it("exposes scaffold status through the service", () => {
    const repository = new MockMeetingRepository();
    const service = new MeetingService(repository);

    assert.deepEqual(service.getScaffoldStatus(), {
      module: "meeting",
      meetingStatusValues: MEETING_STATUS_VALUES,
    });
  });

  it("exposes scaffold status through GET /api/meetings", async () => {
    const app = await NestFactory.create(MeetingModule, new FastifyAdapter(), {
      logger: false,
    });

    try {
      await app.init();

      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({ method: "GET", url: "/api/meetings" });

      assert.equal(response.statusCode, 200);
      assert.deepEqual(JSON.parse(response.payload), {
        module: "meeting",
        meetingStatusValues: MEETING_STATUS_VALUES,
      });
    } finally {
      await app.close();
    }
  });
});
