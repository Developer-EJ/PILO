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
  CreateMeetingAgendaRequestDto,
  CreateMeetingRequestDto,
  CreateMeetingParticipantRequestDto,
  MeetingAgendaResponseDto,
  MeetingParticipantResponseDto,
  MeetingResponseDto,
  MeetingScaffoldResponseDto,
  ReorderMeetingAgendaRequestDto,
  UpdateMeetingAgendaStatusRequestDto,
  UpdateMeetingStatusRequestDto,
} from "./dto/meeting-scaffold-response.dto";
import {
  MEETING_REPOSITORY,
  MeetingRepository,
} from "./repositories/meeting.repository";
import {
  MEETING_AGENDA_STATUS_VALUES,
  MEETING_STATUS_VALUES,
  MeetingAgendaRecord,
  MeetingAgendaStatus,
  MeetingRecord,
  MeetingParticipantRecord,
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

  addParticipant(
    meetingId: string,
    requestBody: CreateMeetingParticipantRequestDto,
  ): MeetingParticipantResponseDto {
    const meeting = this.requireMeeting(meetingId);
    const memberId = this.requireNonEmptyString(
      requestBody.memberId,
      "memberId",
    );
    const workspaceMember = this.currentMemberAdapter.getWorkspaceMember(
      meeting.workspaceId,
      memberId,
    );

    if (!workspaceMember) {
      throw new BadRequestException(
        "memberId must belong to meeting workspace",
      );
    }

    const existingParticipant = this.meetingRepository
      .listParticipantsByMeeting(meeting.id)
      .find((participant) => participant.memberId === workspaceMember.id);

    if (existingParticipant) {
      throw new BadRequestException("memberId is already a participant");
    }

    return this.meetingRepository.addParticipant({
      meetingId: meeting.id,
      memberId: workspaceMember.id,
      role: this.optionalString(requestBody.role, "role"),
    });
  }

  listParticipants(meetingId: string): MeetingParticipantResponseDto[] {
    const meeting = this.requireMeeting(meetingId);

    return this.meetingRepository.listParticipantsByMeeting(meeting.id);
  }

  leaveParticipant(
    meetingId: string,
    participantId: string,
  ): MeetingParticipantResponseDto {
    const meeting = this.requireMeeting(meetingId);
    const participant = this.requireParticipant(participantId);

    if (participant.meetingId !== meeting.id) {
      throw new NotFoundException("Meeting participant not found");
    }

    return this.meetingRepository.leaveParticipant(
      participant.id,
      new Date().toISOString(),
    );
  }

  createAgenda(
    meetingId: string,
    requestBody: CreateMeetingAgendaRequestDto,
  ): MeetingAgendaResponseDto {
    const meeting = this.requireMeeting(meetingId);

    return this.meetingRepository.createAgenda({
      meetingId: meeting.id,
      title: this.requireNonEmptyString(requestBody.title, "title"),
      sortOrder: this.optionalNonNegativeInteger(
        requestBody.sortOrder,
        "sortOrder",
      ),
    });
  }

  listAgendas(meetingId: string): MeetingAgendaResponseDto[] {
    const meeting = this.requireMeeting(meetingId);

    return this.meetingRepository.listAgendasByMeeting(meeting.id);
  }

  updateAgendaStatus(
    meetingId: string,
    agendaId: string,
    requestBody: UpdateMeetingAgendaStatusRequestDto,
  ): MeetingAgendaResponseDto {
    const agenda = this.requireAgendaInMeeting(meetingId, agendaId);

    return this.meetingRepository.updateAgenda(agenda.id, {
      status: this.parseAgendaStatus(requestBody.status),
      updatedAt: new Date().toISOString(),
    });
  }

  reorderAgenda(
    meetingId: string,
    agendaId: string,
    requestBody: ReorderMeetingAgendaRequestDto,
  ): MeetingAgendaResponseDto {
    const agenda = this.requireAgendaInMeeting(meetingId, agendaId);

    return this.meetingRepository.updateAgenda(agenda.id, {
      sortOrder: this.requireNonNegativeInteger(
        requestBody.sortOrder,
        "sortOrder",
      ),
      updatedAt: new Date().toISOString(),
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

  private requireParticipant(participantId: string): MeetingParticipantRecord {
    const participant = this.meetingRepository.findParticipantById(
      this.requireNonEmptyString(participantId, "participantId"),
    );

    if (!participant) {
      throw new NotFoundException("Meeting participant not found");
    }

    return participant;
  }

  private requireAgendaInMeeting(
    meetingId: string,
    agendaId: string,
  ): MeetingAgendaRecord {
    const meeting = this.requireMeeting(meetingId);
    const agenda = this.meetingRepository.findAgendaById(
      this.requireNonEmptyString(agendaId, "agendaId"),
    );

    if (!agenda || agenda.meetingId !== meeting.id) {
      throw new NotFoundException("Meeting agenda not found");
    }

    return agenda;
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

  private parseAgendaStatus(value: unknown): MeetingAgendaStatus {
    if (
      typeof value === "string" &&
      MEETING_AGENDA_STATUS_VALUES.includes(value as MeetingAgendaStatus)
    ) {
      return value as MeetingAgendaStatus;
    }

    throw new BadRequestException(
      `status must be one of: ${MEETING_AGENDA_STATUS_VALUES.join(", ")}`,
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

  private requireNonNegativeInteger(value: unknown, fieldName: string): number {
    if (Number.isInteger(value) && Number(value) >= 0) {
      return Number(value);
    }

    throw new BadRequestException(
      `${fieldName} must be a non-negative integer`,
    );
  }

  private optionalNonNegativeInteger(
    value: unknown,
    fieldName: string,
  ): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    return this.requireNonNegativeInteger(value, fieldName);
  }
}
