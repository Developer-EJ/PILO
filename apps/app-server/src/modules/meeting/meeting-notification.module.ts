import { Module } from "@nestjs/common";
import { CommonModule } from "../../common/common.module";
import { DatabaseModule } from "../../database/database.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import {
  CurrentUserMeetingInvitationController,
  MeetingNotificationController
} from "./meeting-notification.controller";
import { MeetingNotificationService } from "./meeting-notification.service";

@Module({
  imports: [CommonModule, DatabaseModule, WorkspaceModule],
  controllers: [
    MeetingNotificationController,
    CurrentUserMeetingInvitationController
  ],
  providers: [MeetingNotificationService],
  exports: [MeetingNotificationService]
})
export class MeetingNotificationModule {}
