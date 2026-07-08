import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { apiResponse, ApiSuccessResponse } from "../../common/api-response";
import { AuthGuard } from "../../common/auth.guard";
import { CurrentUserId } from "../../common/current-user.decorator";
import type { CreateMeetingReminderRequest } from "./meeting-reminder.dto";
import {
  MeetingReminderPayload,
  MeetingReminderService
} from "./meeting-reminder.service";

@Controller("workspaces/:workspaceId/meetings/:meetingId/reminders")
@UseGuards(AuthGuard)
export class MeetingReminderController {
  constructor(private readonly reminderService: MeetingReminderService) {}

  @Get()
  async listReminders(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("meetingId") meetingId: string
  ): Promise<ApiSuccessResponse<MeetingReminderPayload[]>> {
    const result = await this.reminderService.listReminders(
      currentUserId,
      workspaceId,
      meetingId
    );
    return apiResponse(result);
  }

  @Post()
  async createReminder(
    @CurrentUserId() currentUserId: string,
    @Param("workspaceId") workspaceId: string,
    @Param("meetingId") meetingId: string,
    @Body() body: CreateMeetingReminderRequest | undefined
  ): Promise<ApiSuccessResponse<MeetingReminderPayload>> {
    const result = await this.reminderService.createReminder(
      currentUserId,
      workspaceId,
      meetingId,
      body
    );
    return apiResponse(result);
  }
}
