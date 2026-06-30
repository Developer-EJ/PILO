import { Module } from "@nestjs/common";
import { JuhyungModule } from "../juhyung/juhyung.module";
import { CURRENT_MEMBER_ADAPTER } from "./adapters/current-member.adapter";
import { JuhyungTaskDraftClient } from "./adapters/juhyung-task-draft.adapter";
import { MEETING_REPORT_WORKFLOW_CLIENT } from "./adapters/meeting-report-workflow.adapter";
import { MockCurrentMemberAdapter } from "./adapters/mock-current-member.adapter";
import { MockMeetingReportWorkflowClient } from "./adapters/mock-meeting-report-workflow.adapter";
import { TASK_DRAFT_CLIENT } from "./adapters/task-draft.adapter";
import { MeetingController } from "./meeting.controller";
import { MEETING_REPOSITORY } from "./repositories/meeting.repository";
import { MockMeetingRepository } from "./repositories/meeting.mock-repository";
import { MeetingService } from "./meeting.service";

@Module({
  imports: [JuhyungModule],
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
    {
      provide: MEETING_REPORT_WORKFLOW_CLIENT,
      useClass: MockMeetingReportWorkflowClient,
    },
    {
      provide: TASK_DRAFT_CLIENT,
      useClass: JuhyungTaskDraftClient,
    },
  ],
  exports: [MeetingService, CURRENT_MEMBER_ADAPTER],
})
export class MeetingModule {}
