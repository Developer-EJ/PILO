import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { apiResponse, ApiSuccessResponse } from "../../common/api-response";
import { AuthGuard } from "../../common/auth.guard";
import { CurrentUserId } from "../../common/current-user.decorator";
import {
  MeetingReportActionItemExtractionRetryPayload,
  MeetingReportActionItemMutationPayload,
  MeetingReportContentMutationPayload,
  MeetingReportDeletionPayload,
  MeetingReportDetailResponsePayload,
  MeetingReportListPayload,
  MeetingReportRegenerationPayload,
  MeetingReportService
} from "./meeting-report.service";
import {
  MeetingActionItemDeliveryOptionsPayload,
  MeetingActionItemDeliveryPayload,
  MeetingActionItemDeliveryService
} from "./meeting-action-item-delivery.service";

@Controller("workspaces/:workspaceId")
@UseGuards(AuthGuard)
export class MeetingReportController {
  constructor(
    private readonly meetingReportService: MeetingReportService,
    private readonly meetingActionItemDeliveryService: MeetingActionItemDeliveryService
  ) {}

  @Get("meeting-reports")
  async listReports(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Query("cursor") cursor: unknown,
    @Query("from") from: unknown,
    @Query("q") q: unknown,
    @Query("status") status: unknown,
    @Query("to") to: unknown,
    @Query("limit") limit: unknown
  ): Promise<ApiSuccessResponse<MeetingReportListPayload>> {
    const result = await this.meetingReportService.listReports(currentUserId, workspaceId, {
      cursor,
      from,
      q,
      status,
      to,
      limit
    });
    return apiResponse(result);
  }

  @Get("meeting-reports/:reportId")
  async getReport(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("reportId") reportId: string
  ): Promise<ApiSuccessResponse<MeetingReportDetailResponsePayload>> {
    const result = await this.meetingReportService.getReport(
      currentUserId,
      workspaceId,
      reportId
    );
    return apiResponse(result);
  }

  @Patch("meeting-reports/:reportId")
  async updateReportContent(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("reportId") reportId: string,
    @Body() body: unknown
  ): Promise<ApiSuccessResponse<MeetingReportContentMutationPayload>> {
    return apiResponse(
      await this.meetingReportService.updateMeetingReportContent(
        currentUserId,
        workspaceId,
        reportId,
        body
      )
    );
  }

  @Delete("meeting-reports/:reportId")
  async deleteReport(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("reportId") reportId: string
  ): Promise<ApiSuccessResponse<MeetingReportDeletionPayload>> {
    return apiResponse(
      await this.meetingReportService.deleteReport(currentUserId, workspaceId, reportId)
    );
  }

  @Patch("meeting-reports/:reportId/action-items/:actionItemId")
  async updateReportActionItem(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("reportId") reportId: string,
    @Param("actionItemId") actionItemId: string,
    @Body() body: unknown
  ): Promise<ApiSuccessResponse<MeetingReportActionItemMutationPayload>> {
    return apiResponse(
      await this.meetingReportService.updateMeetingReportActionItem(
        currentUserId,
        workspaceId,
        reportId,
        actionItemId,
        body
      )
    );
  }

  @Post("meeting-reports/:reportId/action-items/:actionItemId/approve")
  async approveReportActionItem(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("reportId") reportId: string,
    @Param("actionItemId") actionItemId: string
  ): Promise<ApiSuccessResponse<MeetingReportActionItemMutationPayload>> {
    return apiResponse(
      await this.meetingReportService.approveMeetingReportActionItem(
        currentUserId,
        workspaceId,
        reportId,
        actionItemId
      )
    );
  }

  @Get("meeting-reports/:reportId/action-items/:actionItemId/delivery-options")
  async getReportActionItemDeliveryOptions(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("reportId") reportId: string,
    @Param("actionItemId") actionItemId: string
  ): Promise<ApiSuccessResponse<MeetingActionItemDeliveryOptionsPayload>> {
    return apiResponse(
      await this.meetingActionItemDeliveryService.listIssueDeliveryOptions(
        currentUserId,
        workspaceId,
        reportId,
        actionItemId
      )
    );
  }

  @Post("meeting-reports/:reportId/action-items/:actionItemId/deliveries")
  async deliverReportActionItem(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("reportId") reportId: string,
    @Param("actionItemId") actionItemId: string,
    @Body() body: unknown
  ): Promise<ApiSuccessResponse<MeetingActionItemDeliveryPayload>> {
    return apiResponse(
      await this.meetingActionItemDeliveryService.deliver(
        currentUserId,
        workspaceId,
        reportId,
        actionItemId,
        body
      )
    );
  }

  @Post("meeting-reports/:reportId/action-items/:actionItemId/dismiss")
  async dismissReportActionItem(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("reportId") reportId: string,
    @Param("actionItemId") actionItemId: string
  ): Promise<ApiSuccessResponse<MeetingReportActionItemMutationPayload>> {
    return apiResponse(
      await this.meetingReportService.dismissMeetingReportActionItem(
        currentUserId,
        workspaceId,
        reportId,
        actionItemId
      )
    );
  }

  @Get("meetings/:meetingId/reports")
  async listMeetingReports(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("meetingId") meetingId: string
  ): Promise<ApiSuccessResponse<MeetingReportListPayload>> {
    const result = await this.meetingReportService.listMeetingReports(
      currentUserId,
      workspaceId,
      meetingId
    );
    return apiResponse(result);
  }

  @Post("meeting-reports/:reportId/regeneration-jobs")
  async requestReportRegeneration(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("reportId") reportId: string
  ): Promise<ApiSuccessResponse<MeetingReportRegenerationPayload>> {
    const result = await this.meetingReportService.requestReportRegeneration(
      currentUserId,
      workspaceId,
      reportId
    );
    return apiResponse(result);
  }

  @Post("meeting-reports/:reportId/action-item-extractions/retry")
  async retryReportActionItemExtraction(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("reportId") reportId: string
  ): Promise<ApiSuccessResponse<MeetingReportActionItemExtractionRetryPayload>> {
    return apiResponse(
      await this.meetingReportService.retryMeetingReportActionItemExtraction(
        currentUserId,
        workspaceId,
        reportId
      )
    );
  }
}
