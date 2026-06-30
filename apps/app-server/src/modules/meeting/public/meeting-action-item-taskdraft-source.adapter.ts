import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  MEETING_REPOSITORY,
  type MeetingRepository,
} from "../repositories/meeting.repository";

export const MEETING_ACTION_ITEM_TASK_DRAFT_SOURCE = Symbol(
  "MEETING_ACTION_ITEM_TASK_DRAFT_SOURCE",
);

export interface MeetingActionItemTaskDraftSourceInput {
  workspaceId: string;
  meetingId: string;
  actionItemId: string;
}

export interface MeetingTaskCreateDraftPayload {
  workspaceId: string;
  sourceType: "meeting_action_item";
  sourceId: string;
  title: string;
  description: string | null;
  assigneeMemberId: string | null;
  priority: "medium";
  dueDate: string | null;
}

export interface MeetingActionItemTaskDraftSourceResult {
  meetingId: string;
  reportId: string;
  actionItemId: string;
  payload: MeetingTaskCreateDraftPayload;
}

export interface MeetingActionItemTaskDraftSource {
  createTaskDraftPayload(
    input: MeetingActionItemTaskDraftSourceInput,
  ): MeetingActionItemTaskDraftSourceResult;
}

@Injectable()
export class MeetingActionItemTaskDraftSourceAdapter
  implements MeetingActionItemTaskDraftSource
{
  constructor(
    @Inject(MEETING_REPOSITORY)
    private readonly meetingRepository: MeetingRepository,
  ) {}

  createTaskDraftPayload(
    input: MeetingActionItemTaskDraftSourceInput,
  ): MeetingActionItemTaskDraftSourceResult {
    const workspaceId = readRequiredString(input.workspaceId, "workspaceId");
    const meetingId = readRequiredString(input.meetingId, "meetingId");
    const actionItemId = readRequiredString(input.actionItemId, "actionItemId");
    const meeting = this.meetingRepository.findMeetingById(meetingId);
    if (!meeting || meeting.workspaceId !== workspaceId) {
      throw new NotFoundException("Meeting not found");
    }

    const actionItem = this.meetingRepository.findActionItemById(actionItemId);
    if (!actionItem) {
      throw new NotFoundException("Meeting action item not found");
    }

    const report = this.meetingRepository.findReportById(actionItem.reportId);
    if (!report || report.meetingId !== meeting.id) {
      throw new NotFoundException("Meeting action item not found");
    }

    if (actionItem.status === "converted" || actionItem.status === "rejected") {
      throw new BadRequestException(
        "Meeting action item cannot be proposed as a TaskDraft",
      );
    }

    return {
      meetingId: meeting.id,
      reportId: report.id,
      actionItemId: actionItem.id,
      payload: {
        workspaceId: meeting.workspaceId,
        sourceType: "meeting_action_item",
        sourceId: actionItem.id,
        title: actionItem.title,
        description: actionItem.description,
        assigneeMemberId: actionItem.assigneeSuggestionMemberId,
        priority: "medium",
        dueDate: actionItem.dueDateSuggestion,
      },
    };
  }
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}
