import { Module } from "@nestjs/common";
import { CommonModule } from "../../common/common.module";
import { DatabaseModule } from "../../database/database.module";
import { BoardModule } from "../board/board.module";
import { CalendarModule } from "../calendar/calendar.module";
import { MeetingNotificationModule } from "../meeting/meeting-notification.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { MeetingActionItemDeliveryService } from "./meeting-action-item-delivery.service";
import { MeetingActionItemExtractionOutboxPublisherService } from "./meeting-action-item-extraction-outbox-publisher.service";
import { MeetingReportEventGuard } from "./meeting-report-event.guard";
import { MeetingReportInternalController } from "./meeting-report-internal.controller";
import { MeetingReportJobService } from "./meeting-report-job.service";
import { MeetingReportLifecycleService } from "./meeting-report-lifecycle.service";
import { MeetingReportOutboxPublisherService } from "./meeting-report-outbox-publisher.service";
import { MeetingReportOutboxRecoveryService } from "./meeting-report-outbox-recovery.service";
import { MeetingReportRealtimePublisherService } from "./meeting-report-realtime-publisher.service";
import { MeetingReportCandidateService } from "./meeting-report-candidate.service";
import { MeetingReportSearchService } from "./meeting-report-search.service";
import { MeetingTranscriptRagService } from "./meeting-transcript-rag.service";
import { MeetingReportController } from "./meeting-report.controller";
import { MeetingReportService } from "./meeting-report.service";

@Module({
  imports: [
    CommonModule,
    DatabaseModule,
    WorkspaceModule,
    MeetingNotificationModule,
    CalendarModule,
    BoardModule
  ],
  controllers: [MeetingReportController, MeetingReportInternalController],
  providers: [
    MeetingReportService,
    MeetingReportCandidateService,
    MeetingReportSearchService,
    MeetingActionItemDeliveryService,
    MeetingTranscriptRagService,
    MeetingReportJobService,
    MeetingReportLifecycleService,
    MeetingReportEventGuard,
    MeetingReportRealtimePublisherService,
    MeetingReportOutboxPublisherService,
    MeetingActionItemExtractionOutboxPublisherService,
    MeetingReportOutboxRecoveryService
  ],
  exports: [
    MeetingReportService,
    MeetingReportCandidateService,
    MeetingReportSearchService,
    MeetingActionItemDeliveryService,
    MeetingTranscriptRagService,
    MeetingReportJobService,
    MeetingReportLifecycleService,
    MeetingReportRealtimePublisherService
  ]
})
export class MeetingReportModule {}
