import { Module } from "@nestjs/common";
import { CURRENT_MEMBER_ADAPTER } from "./adapters/current-member.adapter";
import { MockCurrentMemberAdapter } from "./adapters/mock-current-member.adapter";
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
    {
      provide: CURRENT_MEMBER_ADAPTER,
      useClass: MockCurrentMemberAdapter,
    },
  ],
  exports: [MeetingService],
})
export class MeetingModule {}
