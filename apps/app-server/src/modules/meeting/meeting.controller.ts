import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { WorkspaceActor } from "../workspace/public/workspace-access-public.service";
import {
  ConvertMeetingActionItemRequestDto,
  CreateMeetingActionItemRequestDto,
  CreateMeetingAgendaRequestDto,
  CreateMeetingDecisionRequestDto,
  CreateMeetingMemoRequestDto,
  CreateMeetingRequestDto,
  CreateMeetingParticipantRequestDto,
  CreateMeetingReportNextAgendaRequestDto,
  CreateMeetingReportRiskRequestDto,
  CreateTranscriptSegmentRequestDto,
  MeetingActionItemResponseDto,
  MeetingActionItemTaskDraftResponseDto,
  MeetingAgendaResponseDto,
  MeetingDecisionResponseDto,
  MeetingMemoResponseDto,
  MeetingParticipantResponseDto,
  MeetingReportCanvasEntityRefDto,
  MeetingReportNextAgendaResponseDto,
  MeetingReportResponseDto,
  MeetingReportRiskResponseDto,
  MeetingReportSummaryDto,
  MeetingResponseDto,
  MeetingScaffoldResponseDto,
  ReorderMeetingAgendaRequestDto,
  TranscriptSegmentResponseDto,
  UpdateMeetingAgendaStatusRequestDto,
  UpdateMeetingStatusRequestDto,
} from "./dto/meeting-scaffold-response.dto";
import { MeetingRouteGuard } from "./meeting-route.guard";
import { MeetingService } from "./meeting.service";

@Controller()
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Get("meetings")
  getScaffoldStatus(): MeetingScaffoldResponseDto {
    return this.meetingService.getScaffoldStatus();
  }

  @Post("workspaces/:workspaceId/meetings")
  @UseGuards(MeetingRouteGuard)
  createMeeting(
    @Param("workspaceId") workspaceId: string,
    @Body() requestBody: CreateMeetingRequestDto,
  ): MeetingResponseDto {
    return this.meetingService.createMeeting(workspaceId, requestBody);
  }

  @Get("workspaces/:workspaceId/meetings")
  @UseGuards(MeetingRouteGuard)
  listMeetings(
    @Param("workspaceId") workspaceId: string,
  ): MeetingResponseDto[] {
    return this.meetingService.listMeetings(workspaceId);
  }

  @Get("meetings/:meetingId")
  @UseGuards(MeetingRouteGuard)
  getMeeting(@Param("meetingId") meetingId: string): MeetingResponseDto {
    return this.meetingService.getMeeting(meetingId);
  }

  @Patch("meetings/:meetingId/status")
  @UseGuards(MeetingRouteGuard)
  updateMeetingStatus(
    @Param("meetingId") meetingId: string,
    @Body() requestBody: UpdateMeetingStatusRequestDto,
  ): MeetingResponseDto {
    return this.meetingService.updateMeetingStatus(meetingId, requestBody);
  }

  @Post("meetings/:meetingId/participants")
  @UseGuards(MeetingRouteGuard)
  addParticipant(
    @Param("meetingId") meetingId: string,
    @Body() requestBody: CreateMeetingParticipantRequestDto,
  ): MeetingParticipantResponseDto {
    return this.meetingService.addParticipant(meetingId, requestBody);
  }

  @Get("meetings/:meetingId/participants")
  @UseGuards(MeetingRouteGuard)
  listParticipants(
    @Param("meetingId") meetingId: string,
  ): MeetingParticipantResponseDto[] {
    return this.meetingService.listParticipants(meetingId);
  }

  @Patch("meetings/:meetingId/participants/:participantId/leave")
  @UseGuards(MeetingRouteGuard)
  leaveParticipant(
    @Param("meetingId") meetingId: string,
    @Param("participantId") participantId: string,
  ): MeetingParticipantResponseDto {
    return this.meetingService.leaveParticipant(meetingId, participantId);
  }

  @Post("meetings/:meetingId/agendas")
  @UseGuards(MeetingRouteGuard)
  createAgenda(
    @Param("meetingId") meetingId: string,
    @Body() requestBody: CreateMeetingAgendaRequestDto,
  ): MeetingAgendaResponseDto {
    return this.meetingService.createAgenda(meetingId, requestBody);
  }

  @Get("meetings/:meetingId/agendas")
  @UseGuards(MeetingRouteGuard)
  listAgendas(
    @Param("meetingId") meetingId: string,
  ): MeetingAgendaResponseDto[] {
    return this.meetingService.listAgendas(meetingId);
  }

  @Patch("meetings/:meetingId/agendas/:agendaId/status")
  @UseGuards(MeetingRouteGuard)
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
  @UseGuards(MeetingRouteGuard)
  reorderAgenda(
    @Param("meetingId") meetingId: string,
    @Param("agendaId") agendaId: string,
    @Body() requestBody: ReorderMeetingAgendaRequestDto,
  ): MeetingAgendaResponseDto {
    return this.meetingService.reorderAgenda(meetingId, agendaId, requestBody);
  }

  @Post("meetings/:meetingId/memos")
  @UseGuards(MeetingRouteGuard)
  createMemo(
    @Param("meetingId") meetingId: string,
    @Body() requestBody: CreateMeetingMemoRequestDto,
  ): MeetingMemoResponseDto {
    return this.meetingService.createMemo(meetingId, requestBody);
  }

  @Get("meetings/:meetingId/memos")
  @UseGuards(MeetingRouteGuard)
  listMemos(@Param("meetingId") meetingId: string): MeetingMemoResponseDto[] {
    return this.meetingService.listMemos(meetingId);
  }

  @Post("meetings/:meetingId/transcript-segments")
  @UseGuards(MeetingRouteGuard)
  createTranscriptSegment(
    @Param("meetingId") meetingId: string,
    @Body() requestBody: CreateTranscriptSegmentRequestDto,
  ): TranscriptSegmentResponseDto {
    return this.meetingService.createTranscriptSegment(meetingId, requestBody);
  }

  @Get("meetings/:meetingId/transcript-segments")
  @UseGuards(MeetingRouteGuard)
  listTranscriptSegments(
    @Param("meetingId") meetingId: string,
  ): TranscriptSegmentResponseDto[] {
    return this.meetingService.listTranscriptSegments(meetingId);
  }

  @Post("meetings/:meetingId/report-generation")
  @UseGuards(MeetingRouteGuard)
  requestReportGeneration(
    @Param("meetingId") meetingId: string,
  ): MeetingReportResponseDto {
    return this.meetingService.requestReportGeneration(meetingId);
  }

  @Post("meetings/:meetingId/report")
  @UseGuards(MeetingRouteGuard)
  createReport(
    @Param("meetingId") meetingId: string,
  ): MeetingReportResponseDto {
    return this.meetingService.createReport(meetingId);
  }

  @Get("meeting-reports/:reportId")
  @UseGuards(MeetingRouteGuard)
  getReport(@Param("reportId") reportId: string): MeetingReportResponseDto {
    return this.meetingService.getReport(reportId);
  }

  @Get("workspaces/:workspaceId/meeting-reports/recent")
  @UseGuards(MeetingRouteGuard)
  listRecentReports(
    @Param("workspaceId") workspaceId: string,
  ): MeetingReportSummaryDto[] {
    return this.meetingService.listRecentReports(workspaceId);
  }

  @Get("workspaces/:workspaceId/meeting-reports/canvas-entity-refs")
  @UseGuards(MeetingRouteGuard)
  listRecentReportCanvasEntityRefs(
    @Param("workspaceId") workspaceId: string,
  ): MeetingReportCanvasEntityRefDto[] {
    return this.meetingService.listRecentReportCanvasEntityRefs(workspaceId);
  }

  @Post("meeting-reports/:reportId/decisions")
  @UseGuards(MeetingRouteGuard)
  createDecision(
    @Param("reportId") reportId: string,
    @Body() requestBody: CreateMeetingDecisionRequestDto,
  ): MeetingDecisionResponseDto {
    return this.meetingService.createDecision(reportId, requestBody);
  }

  @Get("meeting-reports/:reportId/decisions")
  @UseGuards(MeetingRouteGuard)
  listDecisions(
    @Param("reportId") reportId: string,
  ): MeetingDecisionResponseDto[] {
    return this.meetingService.listDecisions(reportId);
  }

  @Post("meeting-reports/:reportId/risks")
  @UseGuards(MeetingRouteGuard)
  createRisk(
    @Param("reportId") reportId: string,
    @Body() requestBody: CreateMeetingReportRiskRequestDto,
  ): MeetingReportRiskResponseDto {
    return this.meetingService.createRisk(reportId, requestBody);
  }

  @Get("meeting-reports/:reportId/risks")
  @UseGuards(MeetingRouteGuard)
  listRisks(
    @Param("reportId") reportId: string,
  ): MeetingReportRiskResponseDto[] {
    return this.meetingService.listRisks(reportId);
  }

  @Post("meeting-reports/:reportId/next-agendas")
  @UseGuards(MeetingRouteGuard)
  createNextAgenda(
    @Param("reportId") reportId: string,
    @Body() requestBody: CreateMeetingReportNextAgendaRequestDto,
  ): MeetingReportNextAgendaResponseDto {
    return this.meetingService.createNextAgenda(reportId, requestBody);
  }

  @Get("meeting-reports/:reportId/next-agendas")
  @UseGuards(MeetingRouteGuard)
  listNextAgendas(
    @Param("reportId") reportId: string,
  ): MeetingReportNextAgendaResponseDto[] {
    return this.meetingService.listNextAgendas(reportId);
  }

  @Post("meeting-reports/:reportId/action-items")
  @UseGuards(MeetingRouteGuard)
  createActionItem(
    @Param("reportId") reportId: string,
    @Body() requestBody: CreateMeetingActionItemRequestDto,
  ): MeetingActionItemResponseDto {
    return this.meetingService.createActionItem(reportId, requestBody);
  }

  @Get("meeting-reports/:reportId/action-items")
  @UseGuards(MeetingRouteGuard)
  listActionItems(
    @Param("reportId") reportId: string,
  ): MeetingActionItemResponseDto[] {
    return this.meetingService.listActionItems(reportId);
  }

  @Patch("meeting-action-items/:actionItemId/approve")
  @UseGuards(MeetingRouteGuard)
  approveActionItem(
    @Param("actionItemId") actionItemId: string,
  ): MeetingActionItemResponseDto {
    return this.meetingService.approveActionItem(actionItemId);
  }

  @Patch("meeting-action-items/:actionItemId/reject")
  @UseGuards(MeetingRouteGuard)
  rejectActionItem(
    @Param("actionItemId") actionItemId: string,
  ): MeetingActionItemResponseDto {
    return this.meetingService.rejectActionItem(actionItemId);
  }

  @Patch("meeting-action-items/:actionItemId/convert")
  @UseGuards(MeetingRouteGuard)
  markActionItemConverted(
    @Param("actionItemId") actionItemId: string,
    @Body() requestBody: ConvertMeetingActionItemRequestDto,
  ): MeetingActionItemResponseDto {
    return this.meetingService.markActionItemConverted(
      actionItemId,
      requestBody,
    );
  }

  @Post("meeting-action-items/:actionItemId/task-draft")
  @UseGuards(MeetingRouteGuard)
  requestActionItemTaskDraft(
    @Param("actionItemId") actionItemId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ): Promise<MeetingActionItemTaskDraftResponseDto> {
    return this.meetingService.requestActionItemTaskDraft(
      actionItemId,
      toCurrentActor(userId, memberId),
    );
  }
}

function toCurrentActor(
  userId?: string | string[],
  memberId?: string | string[],
): WorkspaceActor {
  const resolvedUserId = firstHeader(userId);
  const resolvedMemberId = firstHeader(memberId);

  return {
    ...(resolvedUserId ? { userId: resolvedUserId } : {}),
    ...(resolvedMemberId ? { memberId: resolvedMemberId } : {}),
  };
}

function firstHeader(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
