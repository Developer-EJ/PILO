import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  CreateMeetingAgendaRequestDto,
  CreateMeetingMemoRequestDto,
  CreateMeetingRequestDto,
  CreateMeetingParticipantRequestDto,
  CreateTranscriptSegmentRequestDto,
  MeetingAgendaResponseDto,
  MeetingMemoResponseDto,
  MeetingParticipantResponseDto,
  MeetingResponseDto,
  MeetingScaffoldResponseDto,
  ReorderMeetingAgendaRequestDto,
  TranscriptSegmentResponseDto,
  UpdateMeetingAgendaStatusRequestDto,
  UpdateMeetingStatusRequestDto,
} from "./dto/meeting-scaffold-response.dto";
import { MeetingService } from "./meeting.service";

@Controller("api")
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Get("meetings")
  getScaffoldStatus(): MeetingScaffoldResponseDto {
    return this.meetingService.getScaffoldStatus();
  }

  @Post("workspaces/:workspaceId/meetings")
  createMeeting(
    @Param("workspaceId") workspaceId: string,
    @Body() requestBody: CreateMeetingRequestDto,
  ): MeetingResponseDto {
    return this.meetingService.createMeeting(workspaceId, requestBody);
  }

  @Get("workspaces/:workspaceId/meetings")
  listMeetings(
    @Param("workspaceId") workspaceId: string,
  ): MeetingResponseDto[] {
    return this.meetingService.listMeetings(workspaceId);
  }

  @Get("meetings/:meetingId")
  getMeeting(@Param("meetingId") meetingId: string): MeetingResponseDto {
    return this.meetingService.getMeeting(meetingId);
  }

  @Patch("meetings/:meetingId/status")
  updateMeetingStatus(
    @Param("meetingId") meetingId: string,
    @Body() requestBody: UpdateMeetingStatusRequestDto,
  ): MeetingResponseDto {
    return this.meetingService.updateMeetingStatus(meetingId, requestBody);
  }

  @Post("meetings/:meetingId/participants")
  addParticipant(
    @Param("meetingId") meetingId: string,
    @Body() requestBody: CreateMeetingParticipantRequestDto,
  ): MeetingParticipantResponseDto {
    return this.meetingService.addParticipant(meetingId, requestBody);
  }

  @Get("meetings/:meetingId/participants")
  listParticipants(
    @Param("meetingId") meetingId: string,
  ): MeetingParticipantResponseDto[] {
    return this.meetingService.listParticipants(meetingId);
  }

  @Patch("meetings/:meetingId/participants/:participantId/leave")
  leaveParticipant(
    @Param("meetingId") meetingId: string,
    @Param("participantId") participantId: string,
  ): MeetingParticipantResponseDto {
    return this.meetingService.leaveParticipant(meetingId, participantId);
  }

  @Post("meetings/:meetingId/agendas")
  createAgenda(
    @Param("meetingId") meetingId: string,
    @Body() requestBody: CreateMeetingAgendaRequestDto,
  ): MeetingAgendaResponseDto {
    return this.meetingService.createAgenda(meetingId, requestBody);
  }

  @Get("meetings/:meetingId/agendas")
  listAgendas(
    @Param("meetingId") meetingId: string,
  ): MeetingAgendaResponseDto[] {
    return this.meetingService.listAgendas(meetingId);
  }

  @Patch("meetings/:meetingId/agendas/:agendaId/status")
  updateAgendaStatus(
    @Param("meetingId") meetingId: string,
    @Param("agendaId") agendaId: string,
    @Body() requestBody: UpdateMeetingAgendaStatusRequestDto,
  ): MeetingAgendaResponseDto {
    return this.meetingService.updateAgendaStatus(
      meetingId,
      agendaId,
      requestBody,
    );
  }

  @Patch("meetings/:meetingId/agendas/:agendaId/sort-order")
  reorderAgenda(
    @Param("meetingId") meetingId: string,
    @Param("agendaId") agendaId: string,
    @Body() requestBody: ReorderMeetingAgendaRequestDto,
  ): MeetingAgendaResponseDto {
    return this.meetingService.reorderAgenda(meetingId, agendaId, requestBody);
  }

  @Post("meetings/:meetingId/memos")
  createMemo(
    @Param("meetingId") meetingId: string,
    @Body() requestBody: CreateMeetingMemoRequestDto,
  ): MeetingMemoResponseDto {
    return this.meetingService.createMemo(meetingId, requestBody);
  }

  @Get("meetings/:meetingId/memos")
  listMemos(@Param("meetingId") meetingId: string): MeetingMemoResponseDto[] {
    return this.meetingService.listMemos(meetingId);
  }

  @Post("meetings/:meetingId/transcript-segments")
  createTranscriptSegment(
    @Param("meetingId") meetingId: string,
    @Body() requestBody: CreateTranscriptSegmentRequestDto,
  ): TranscriptSegmentResponseDto {
    return this.meetingService.createTranscriptSegment(meetingId, requestBody);
  }

  @Get("meetings/:meetingId/transcript-segments")
  listTranscriptSegments(
    @Param("meetingId") meetingId: string,
  ): TranscriptSegmentResponseDto[] {
    return this.meetingService.listTranscriptSegments(meetingId);
  }
}
