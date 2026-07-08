import { Module } from "@nestjs/common";
import { CommonModule } from "../../common/common.module";
import { DatabaseModule } from "../../database/database.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { LiveKitEgressService } from "./livekit-egress.service";
import { LiveKitTokenService } from "./livekit-token.service";
import { MeetingReminderController } from "./meeting-reminder.controller";
import { MeetingReminderService } from "./meeting-reminder.service";
import { MeetingController } from "./meeting.controller";
import { MeetingReportJobService } from "./meeting-report-job.service";
import { MeetingService } from "./meeting.service";

@Module({
  imports: [CommonModule, DatabaseModule, WorkspaceModule],
  controllers: [MeetingController, MeetingReminderController],
  providers: [
    MeetingService,
    MeetingReminderService,
    LiveKitEgressService,
    LiveKitTokenService,
    MeetingReportJobService
  ],
  exports: [MeetingService]
})
export class MeetingModule {}
