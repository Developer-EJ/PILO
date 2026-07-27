import { Module } from "@nestjs/common";
import { CommonModule } from "../../common/common.module";
import { DatabaseModule } from "../../database/database.module";
import { MeetingReportModule } from "../meeting-report/meeting-report.module";
import { ScreenShareModule } from "../screen-share/screen-share.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { LiveKitEgressService } from "./livekit-egress.service";
import { LiveKitTokenService } from "./livekit-token.service";
import { LiveKitWebhookController } from "./livekit-webhook.controller";
import { LiveKitWebhookService } from "./livekit-webhook.service";
import { MeetingController } from "./meeting.controller";
import { CurrentUserMeetingController } from "./current-user-meeting.controller";
import { MeetingRecordingRetentionService } from "./meeting-recording-retention.service";
import { MeetingStateRealtimePublisherService } from "./meeting-state-realtime-publisher.service";
import { MeetingService } from "./meeting.service";
import { MeetingMembershipRevocationService } from "./meeting-membership-revocation.service";
import { MeetingNotificationModule } from "./meeting-notification.module";

@Module({
  imports: [
    CommonModule,
    DatabaseModule,
    WorkspaceModule,
    ScreenShareModule,
    MeetingNotificationModule,
    MeetingReportModule
  ],
  controllers: [
    MeetingController,
    CurrentUserMeetingController,
    LiveKitWebhookController
  ],
  providers: [
    MeetingService,
    MeetingMembershipRevocationService,
    LiveKitEgressService,
    LiveKitTokenService,
    LiveKitWebhookService,
    MeetingStateRealtimePublisherService,
    MeetingRecordingRetentionService
  ],
  exports: [
    MeetingService
  ]
})
export class MeetingModule {}
