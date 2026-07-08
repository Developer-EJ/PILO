import { Injectable } from "@nestjs/common";
import { badRequest } from "../../common/api-error";
import { WorkspaceService } from "../workspace/workspace.service";
import type { CreateMeetingReminderRequest } from "./meeting-reminder.dto";

export interface MeetingReminderPayload {
  id: string;
  workspaceId: string;
  meetingId: string;
  userId: string;
  remindAt: string;
  message: string;
  isSent: boolean;
  sentAt: string | null;
}

@Injectable()
export class MeetingReminderService {
  constructor(private readonly workspaceService: WorkspaceService) {}

  async createReminder(
    currentUserId: string,
    workspaceId: string,
    meetingId: string,
    input: CreateMeetingReminderRequest | undefined
  ): Promise<MeetingReminderPayload> {
    await this.workspaceService.assertWorkspaceAccess(currentUserId, workspaceId);

    const draft = this.parseCreateReminderRequest(input);
    const now = Date.now();

    return {
      id: `preview-${now}`,
      workspaceId,
      meetingId,
      userId: draft.userId ?? currentUserId,
      remindAt: draft.remindAt,
      message: draft.message,
      isSent: false,
      sentAt: null
    };
  }

  async listReminders(
    currentUserId: string,
    workspaceId: string,
    meetingId: string
  ): Promise<MeetingReminderPayload[]> {
    await this.workspaceService.assertWorkspaceAccess(currentUserId, workspaceId);

    return [
      {
        id: "preview-meeting-reminder",
        workspaceId,
        meetingId,
        userId: currentUserId,
        remindAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        message: "회의 시작 10분 전입니다.",
        isSent: false,
        sentAt: null
      }
    ];
  }

  private parseCreateReminderRequest(
    input: CreateMeetingReminderRequest | undefined
  ): { userId: string | null; remindAt: string; message: string } {
    const userId =
      typeof input?.userId === "string" && input.userId.trim()
        ? input.userId.trim()
        : null;
    const remindAt =
      typeof input?.remindAt === "string" && input.remindAt.trim()
        ? input.remindAt.trim()
        : null;
    const message =
      typeof input?.message === "string" && input.message.trim()
        ? input.message.trim()
        : null;

    if (!remindAt || Number.isNaN(new Date(remindAt).getTime())) {
      throw badRequest("Reminder time must be a valid date");
    }

    if (!message) {
      throw badRequest("Reminder message is required");
    }

    return {
      userId,
      remindAt,
      message
    };
  }
}
