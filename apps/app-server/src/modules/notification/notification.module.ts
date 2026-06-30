import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { MockNotificationRepository } from "./repositories/notification.mock-repository";
import { NOTIFICATION_REPOSITORY } from "./repositories/notification.repository";

@Module({
  imports: [AuthModule, WorkspaceModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: MockNotificationRepository,
    },
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
