import { Module } from "@nestjs/common";
import { MeetingController } from "./meeting.controller";
import { MEETING_REPOSITORY } from "./repositories/meeting.repository";
import { MockMeetingRepository } from "./repositories/meeting.mock-repository";
import { MeetingService } from "./meeting.service";

@Module({
  controllers: [MeetingController],
  providers: [
    MeetingService,
    {
      provide: MEETING_REPOSITORY,
      useClass: MockMeetingRepository,
    },
  ],
  exports: [MeetingService],
})
export class MeetingModule {}
