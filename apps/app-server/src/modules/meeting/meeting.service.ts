import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CURRENT_MEMBER_ADAPTER,
  CurrentMemberAdapter,
} from "./adapters/current-member.adapter";
import {
  CreateMeetingRequestDto,
  MeetingResponseDto,
  MeetingScaffoldResponseDto,
  UpdateMeetingStatusRequestDto,
} from "./dto/meeting-scaffold-response.dto";
import {
  MEETING_REPOSITORY,
  MeetingRepository,
} from "./repositories/meeting.repository";
import {
  MEETING_STATUS_VALUES,
  MeetingRecord,
  MeetingStatus,
} from "./types/meeting.types";

@Injectable()
export class MeetingService {
  constructor(
    @Inject(MEETING_REPOSITORY)
    private readonly meetingRepository: MeetingRepository,
    @Inject(CURRENT_MEMBER_ADAPTER)
    private readonly currentMemberAdapter: CurrentMemberAdapter,
  ) {}

  getScaffoldStatus(): MeetingScaffoldResponseDto {
    return {
      module: "meeting",
      repositoryMode: this.meetingRepository.mode,
      meetingStatusValues: this.meetingRepository.listMeetingStatusValues(),
    };
  }

  createMeeting(
    workspaceId: string,
    requestBody: CreateMeetingRequestDto,
  ): MeetingResponseDto {
    const currentMember = this.currentMemberAdapter.getCurrentMember(
      this.requireNonEmptyString(workspaceId, "workspaceId"),
    );

    return this.meetingRepository.createMeeting({
      workspaceId: currentMember.workspaceId,
      title: this.requireNonEmptyString(requestBody.title, "title"),
      purpose: this.optionalString(requestBody.purpose, "purpose"),
      canvasBoardId: this.optionalString(
        requestBody.canvasBoardId,
        "canvasBoardId",
      ),
      createdByMemberId: currentMember.id,
    });
  }

  listMeetings(workspaceId: string): MeetingResponseDto[] {
    return this.meetingRepository.listMeetingsByWorkspace(
      this.requireNonEmptyString(workspaceId, "workspaceId"),
    );
  }

  getMeeting(meetingId: string): MeetingResponseDto {
    return this.requireMeeting(meetingId);
  }

  getMeetingForWorkspace(
    workspaceId: string,
    meetingId: string,
  ): MeetingResponseDto {
    const meeting = this.requireMeeting(meetingId);
    const expectedWorkspaceId = this.requireNonEmptyString(
      workspaceId,
      "workspaceId",
    );

    if (meeting.workspaceId !== expectedWorkspaceId) {
      throw new NotFoundException("Meeting not found in workspace");
    }

    return meeting;
  }

  updateMeetingStatus(
    meetingId: string,
    requestBody: UpdateMeetingStatusRequestDto,
  ): MeetingResponseDto {
    const meeting = this.requireMeeting(meetingId);
    const nextStatus = this.parseMeetingStatus(requestBody.status);
    const now = new Date().toISOString();

    return this.meetingRepository.updateMeeting(meeting.id, {
      status: nextStatus,
      startedAt:
        nextStatus === "in_progress" || nextStatus === "ended"
          ? (meeting.startedAt ?? now)
          : meeting.startedAt,
      endedAt: nextStatus === "ended" ? now : meeting.endedAt,
      updatedAt: now,
    });
  }

  private requireMeeting(meetingId: string): MeetingRecord {
    const meeting = this.meetingRepository.findMeetingById(
      this.requireNonEmptyString(meetingId, "meetingId"),
    );

    if (!meeting) {
      throw new NotFoundException("Meeting not found");
    }

    return meeting;
  }

  private parseMeetingStatus(value: unknown): MeetingStatus {
    if (
      typeof value === "string" &&
      MEETING_STATUS_VALUES.includes(value as MeetingStatus)
    ) {
      return value as MeetingStatus;
    }

    throw new BadRequestException(
      `status must be one of: ${MEETING_STATUS_VALUES.join(", ")}`,
    );
  }

  private requireNonEmptyString(value: unknown, fieldName: string): string {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    throw new BadRequestException(`${fieldName} must be a non-empty string`);
  }

  private optionalString(value: unknown, fieldName: string): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value === "string") {
      return value.trim().length > 0 ? value.trim() : null;
    }

    throw new BadRequestException(`${fieldName} must be a string`);
  }
}
