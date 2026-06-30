import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { WorkspaceActor } from "../workspace/public/workspace-access-public.service";
import {
  CURRENT_MEMBER_ADAPTER,
  CurrentMemberAdapter,
} from "./adapters/current-member.adapter";
import {
  MEETING_REPORT_WORKFLOW_CLIENT,
  MeetingReportWorkflowClient,
  MeetingReportWorkflowOutput,
} from "./adapters/meeting-report-workflow.adapter";
import {
  TASK_DRAFT_CLIENT,
  TaskCreateDraftPayload,
  TaskDraftClient,
  TaskDraftResponse,
} from "./adapters/task-draft.adapter";
import {
  ConvertMeetingActionItemRequestDto,
  CreateMeetingActionItemRequestDto,
  CreateMeetingAgendaRequestDto,
  CreateMeetingDecisionRequestDto,
  CreateMeetingMemoRequestDto,
  CreateMeetingReportNextAgendaRequestDto,
  CreateMeetingReportRiskRequestDto,
  CreateMeetingRequestDto,
  CreateMeetingParticipantRequestDto,
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
import {
  MEETING_REPOSITORY,
  MeetingRepository,
} from "./repositories/meeting.repository";
import {
  MEETING_AGENDA_STATUS_VALUES,
  MEETING_DECISION_STATUS_VALUES,
  MEETING_REPORT_RISK_SEVERITY_VALUES,
  MEETING_STATUS_VALUES,
  TRANSCRIPT_SOURCE_VALUES,
  MeetingActionItemRecord,
  MeetingActionItemStatus,
  MeetingAgendaRecord,
  MeetingAgendaStatus,
  MeetingDecisionRecord,
  MeetingDecisionStatus,
  MeetingRecord,
  MeetingParticipantRecord,
  MeetingReportNextAgendaRecord,
  MeetingReportRecord,
  MeetingReportRiskRecord,
  MeetingReportRiskSeverity,
  MeetingStatus,
  TranscriptSource,
} from "./types/meeting.types";

@Injectable()
export class MeetingService {
  constructor(
    @Inject(MEETING_REPOSITORY)
    private readonly meetingRepository: MeetingRepository,
    @Inject(CURRENT_MEMBER_ADAPTER)
    private readonly currentMemberAdapter: CurrentMemberAdapter,
    @Inject(MEETING_REPORT_WORKFLOW_CLIENT)
    private readonly meetingReportWorkflowClient: MeetingReportWorkflowClient,
    @Inject(TASK_DRAFT_CLIENT)
    private readonly taskDraftClient: TaskDraftClient,
  ) {}

  getScaffoldStatus(): MeetingScaffoldResponseDto {
    return {
      module: "meeting",
      repositoryMode: this.meetingRepository.mode,
      meetingStatusValues: this.meetingRepository.listMeetingStatusValues(),
    };
  }

  async createMeeting(
    workspaceId: string,
    requestBody: CreateMeetingRequestDto,
  ): Promise<MeetingResponseDto> {
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

  async listMeetings(workspaceId: string): Promise<MeetingResponseDto[]> {
    return this.meetingRepository.listMeetingsByWorkspace(
      this.requireNonEmptyString(workspaceId, "workspaceId"),
    );
  }

  async getMeeting(meetingId: string): Promise<MeetingResponseDto> {
    return this.requireMeeting(meetingId);
  }

  async getMeetingForWorkspace(
    workspaceId: string,
    meetingId: string,
  ): Promise<MeetingResponseDto> {
    const meeting = await this.requireMeeting(meetingId);
    const expectedWorkspaceId = this.requireNonEmptyString(
      workspaceId,
      "workspaceId",
    );

    if (meeting.workspaceId !== expectedWorkspaceId) {
      throw new NotFoundException("Meeting not found in workspace");
    }

    return meeting;
  }

  async resolveRouteWorkspaceId(input: {
    workspaceId?: string;
    meetingId?: string;
    reportId?: string;
    actionItemId?: string;
  }): Promise<string> {
    if (input.actionItemId) {
      const actionItem = await this.requireActionItem(input.actionItemId);
      const report = await this.requireReport(actionItem.reportId);
      const meeting = await this.requireMeeting(report.meetingId);

      return this.requireMatchingRouteWorkspace(
        input.workspaceId,
        meeting.workspaceId,
        "Meeting action item not found in workspace",
      );
    }

    if (input.reportId) {
      const report = await this.requireReport(input.reportId);
      const meeting = await this.requireMeeting(report.meetingId);

      return this.requireMatchingRouteWorkspace(
        input.workspaceId,
        meeting.workspaceId,
        "Meeting report not found in workspace",
      );
    }

    if (input.meetingId) {
      const meeting = await this.requireMeeting(input.meetingId);

      return this.requireMatchingRouteWorkspace(
        input.workspaceId,
        meeting.workspaceId,
        "Meeting not found in workspace",
      );
    }

    if (input.workspaceId) {
      return this.requireNonEmptyString(input.workspaceId, "workspaceId");
    }

    throw new BadRequestException(
      "workspaceId, meetingId, reportId, or actionItemId is required",
    );
  }

  async updateMeetingStatus(
    meetingId: string,
    requestBody: UpdateMeetingStatusRequestDto,
  ): Promise<MeetingResponseDto> {
    const meeting = await this.requireMeeting(meetingId);
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

  async addParticipant(
    meetingId: string,
    requestBody: CreateMeetingParticipantRequestDto,
  ): Promise<MeetingParticipantResponseDto> {
    const meeting = await this.requireMeeting(meetingId);
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

    const existingParticipant = (
      await this.meetingRepository.listParticipantsByMeeting(meeting.id)
    )
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

  async listParticipants(
    meetingId: string,
  ): Promise<MeetingParticipantResponseDto[]> {
    const meeting = await this.requireMeeting(meetingId);

    return this.meetingRepository.listParticipantsByMeeting(meeting.id);
  }

  async leaveParticipant(
    meetingId: string,
    participantId: string,
  ): Promise<MeetingParticipantResponseDto> {
    const meeting = await this.requireMeeting(meetingId);
    const participant = await this.requireParticipant(participantId);

    if (participant.meetingId !== meeting.id) {
      throw new NotFoundException("Meeting participant not found");
    }

    return this.meetingRepository.leaveParticipant(
      participant.id,
      new Date().toISOString(),
    );
  }

  async createAgenda(
    meetingId: string,
    requestBody: CreateMeetingAgendaRequestDto,
  ): Promise<MeetingAgendaResponseDto> {
    const meeting = await this.requireMeeting(meetingId);

    return this.meetingRepository.createAgenda({
      meetingId: meeting.id,
      title: this.requireNonEmptyString(requestBody.title, "title"),
      sortOrder: this.optionalNonNegativeInteger(
        requestBody.sortOrder,
        "sortOrder",
      ),
    });
  }

  async listAgendas(meetingId: string): Promise<MeetingAgendaResponseDto[]> {
    const meeting = await this.requireMeeting(meetingId);

    return this.meetingRepository.listAgendasByMeeting(meeting.id);
  }

  async updateAgendaStatus(
    meetingId: string,
    agendaId: string,
    requestBody: UpdateMeetingAgendaStatusRequestDto,
  ): Promise<MeetingAgendaResponseDto> {
    const agenda = await this.requireAgendaInMeeting(meetingId, agendaId);

    return this.meetingRepository.updateAgenda(agenda.id, {
      status: this.parseAgendaStatus(requestBody.status),
      updatedAt: new Date().toISOString(),
    });
  }

  async reorderAgenda(
    meetingId: string,
    agendaId: string,
    requestBody: ReorderMeetingAgendaRequestDto,
  ): Promise<MeetingAgendaResponseDto> {
    const agenda = await this.requireAgendaInMeeting(meetingId, agendaId);

    return this.meetingRepository.updateAgenda(agenda.id, {
      sortOrder: this.requireNonNegativeInteger(
        requestBody.sortOrder,
        "sortOrder",
      ),
      updatedAt: new Date().toISOString(),
    });
  }

  async createMemo(
    meetingId: string,
    requestBody: CreateMeetingMemoRequestDto,
  ): Promise<MeetingMemoResponseDto> {
    const meeting = await this.requireMeeting(meetingId);

    return this.meetingRepository.createMemo({
      meetingId: meeting.id,
      authorMemberId: this.resolveWorkspaceMemberId(
        meeting.workspaceId,
        requestBody.authorMemberId,
      ),
      body: this.requireNonEmptyString(requestBody.body, "body"),
    });
  }

  async listMemos(meetingId: string): Promise<MeetingMemoResponseDto[]> {
    const meeting = await this.requireMeeting(meetingId);

    return this.meetingRepository.listMemosByMeeting(meeting.id);
  }

  async createTranscriptSegment(
    meetingId: string,
    requestBody: CreateTranscriptSegmentRequestDto,
  ): Promise<TranscriptSegmentResponseDto> {
    const meeting = await this.requireMeeting(meetingId);
    const startedAt = this.optionalIsoDateTime(
      requestBody.startedAt,
      "startedAt",
    );
    const endedAt = this.optionalIsoDateTime(requestBody.endedAt, "endedAt");

    this.validateTimeRange(startedAt, endedAt);

    return this.meetingRepository.createTranscriptSegment({
      meetingId: meeting.id,
      speakerMemberId: this.resolveWorkspaceMemberId(
        meeting.workspaceId,
        requestBody.speakerMemberId,
      ),
      source: this.parseTranscriptSource(requestBody.source),
      body: this.requireNonEmptyString(requestBody.body, "body"),
      startedAt,
      endedAt,
    });
  }

  async listTranscriptSegments(
    meetingId: string,
  ): Promise<TranscriptSegmentResponseDto[]> {
    const meeting = await this.requireMeeting(meetingId);

    return this.meetingRepository.listTranscriptSegmentsByMeeting(meeting.id);
  }

  requestReportGeneration(meetingId: string): Promise<MeetingReportResponseDto> {
    return this.createReport(meetingId);
  }

  async createReport(meetingId: string): Promise<MeetingReportResponseDto> {
    const meeting = await this.requireMeeting(meetingId);
    const currentMember = this.currentMemberAdapter.getCurrentMember(
      meeting.workspaceId,
    );
    const existingReport = await this.meetingRepository.findReportByMeetingId(
      meeting.id,
    );

    if (existingReport) {
      return this.toReportDetail(existingReport, meeting);
    }

    const workflowOutput = this.meetingReportWorkflowClient.generateReport({
      meetingTitle: meeting.title,
      memoBodies: (await this.meetingRepository.listMemosByMeeting(meeting.id)).map(
        (memo) => memo.body,
      ),
      transcriptBodies: (
        await this.meetingRepository.listTranscriptSegmentsByMeeting(meeting.id)
      ).map((segment) => segment.body),
    });

    if (workflowOutput.error) {
      throw new BadRequestException(workflowOutput.error.message);
    }

    const report = await this.meetingRepository.createReport({
      meetingId: meeting.id,
      summary: this.requireNonEmptyString(workflowOutput.summary, "summary"),
      createdByMemberId: currentMember.id,
    });

    await this.persistWorkflowOutput(report, meeting, workflowOutput);
    await this.meetingRepository.updateMeeting(meeting.id, {
      status: "report_generated",
      updatedAt: new Date().toISOString(),
    });

    return this.toReportDetail(report, {
      ...meeting,
      status: "report_generated",
    });
  }

  async getReport(reportId: string): Promise<MeetingReportResponseDto> {
    const report = await this.requireReport(reportId);
    const meeting = await this.requireMeeting(report.meetingId);

    return this.toReportDetail(report, meeting);
  }

  async getReportForWorkspace(
    workspaceId: string,
    reportId: string,
  ): Promise<MeetingReportResponseDto> {
    const report = await this.getReport(reportId);
    const expectedWorkspaceId = this.requireNonEmptyString(
      workspaceId,
      "workspaceId",
    );

    if (report.workspaceId !== expectedWorkspaceId) {
      throw new NotFoundException("Meeting report not found in workspace");
    }

    return report;
  }

  async listRecentReports(
    workspaceId: string,
  ): Promise<MeetingReportSummaryDto[]> {
    const expectedWorkspaceId = this.requireNonEmptyString(
      workspaceId,
      "workspaceId",
    );
    const reports = await this.meetingRepository.listReports();
    const reportSummaries = await Promise.all(
      reports.map(async (report) => {
        const meeting = await this.meetingRepository.findMeetingById(
          report.meetingId,
        );

        return meeting ? this.toReportSummary(report, meeting) : null;
      }),
    );

    return reportSummaries
      .filter(
        (report): report is MeetingReportSummaryDto =>
          report !== null && report.workspaceId === expectedWorkspaceId,
      )
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      );
  }

  async listRecentReportCanvasEntityRefs(
    workspaceId: string,
  ): Promise<MeetingReportCanvasEntityRefDto[]> {
    return (await this.listRecentReports(workspaceId)).map((report) =>
      this.toCanvasEntityRef(report),
    );
  }

  async createDecision(
    reportId: string,
    requestBody: CreateMeetingDecisionRequestDto,
  ): Promise<MeetingDecisionResponseDto> {
    const report = await this.requireReport(reportId);

    return this.toDecisionReadModel(
      await this.meetingRepository.createDecision({
        reportId: report.id,
        content: this.requireNonEmptyString(requestBody.content, "content"),
        status: this.parseDecisionStatus(requestBody.status),
        linkedTaskId: this.optionalString(
          requestBody.linkedTaskId,
          "linkedTaskId",
        ),
      }),
    );
  }

  async listDecisions(
    reportId: string,
  ): Promise<MeetingDecisionResponseDto[]> {
    const report = await this.requireReport(reportId);

    return (await this.meetingRepository.listDecisionsByReport(report.id)).map(
      (decision) => this.toDecisionReadModel(decision),
    );
  }

  async createRisk(
    reportId: string,
    requestBody: CreateMeetingReportRiskRequestDto,
  ): Promise<MeetingReportRiskResponseDto> {
    const report = await this.requireReport(reportId);
    const sortOrder = this.optionalNonNegativeInteger(
      requestBody.sortOrder,
      "sortOrder",
    );

    if (sortOrder !== undefined) {
      await this.assertRiskSortOrderAvailable(report.id, sortOrder);
    }

    return this.toRiskReadModel(
      await this.meetingRepository.createRisk({
        reportId: report.id,
        content: this.requireNonEmptyString(requestBody.content, "content"),
        severity: this.parseRiskSeverity(requestBody.severity),
        sortOrder,
      }),
    );
  }

  async listRisks(reportId: string): Promise<MeetingReportRiskResponseDto[]> {
    const report = await this.requireReport(reportId);

    return (await this.meetingRepository.listRisksByReport(report.id)).map(
      (risk) => this.toRiskReadModel(risk),
    );
  }

  async createNextAgenda(
    reportId: string,
    requestBody: CreateMeetingReportNextAgendaRequestDto,
  ): Promise<MeetingReportNextAgendaResponseDto> {
    const report = await this.requireReport(reportId);
    const sortOrder = this.optionalNonNegativeInteger(
      requestBody.sortOrder,
      "sortOrder",
    );

    if (sortOrder !== undefined) {
      await this.assertNextAgendaSortOrderAvailable(report.id, sortOrder);
    }

    return this.toNextAgendaReadModel(
      await this.meetingRepository.createNextAgenda({
        reportId: report.id,
        title: this.requireNonEmptyString(requestBody.title, "title"),
        sortOrder,
      }),
    );
  }

  async listNextAgendas(
    reportId: string,
  ): Promise<MeetingReportNextAgendaResponseDto[]> {
    const report = await this.requireReport(reportId);

    return (
      await this.meetingRepository.listNextAgendasByReport(report.id)
    ).map((nextAgenda) => this.toNextAgendaReadModel(nextAgenda));
  }

  async createActionItem(
    reportId: string,
    requestBody: CreateMeetingActionItemRequestDto,
  ): Promise<MeetingActionItemResponseDto> {
    const report = await this.requireReport(reportId);
    const meeting = await this.requireMeeting(report.meetingId);

    return this.toActionItemReadModel(
      await this.meetingRepository.createActionItem({
        reportId: report.id,
        title: this.requireNonEmptyString(requestBody.title, "title"),
        description: this.optionalString(
          requestBody.description,
          "description",
        ),
        assigneeSuggestionMemberId: this.resolveOptionalWorkspaceMemberId(
          meeting.workspaceId,
          requestBody.assigneeSuggestionMemberId,
          "assigneeSuggestionMemberId",
        ),
        dueDateSuggestion: this.optionalDate(
          requestBody.dueDateSuggestion,
          "dueDateSuggestion",
        ),
      }),
    );
  }

  async listActionItems(
    reportId: string,
  ): Promise<MeetingActionItemResponseDto[]> {
    const report = await this.requireReport(reportId);

    return (
      await this.meetingRepository.listActionItemsByReport(report.id)
    ).map((actionItem) => this.toActionItemReadModel(actionItem));
  }

  async approveActionItem(
    actionItemId: string,
  ): Promise<MeetingActionItemResponseDto> {
    const actionItem = await this.requireActionItem(actionItemId);

    this.assertActionItemStatus(actionItem, "draft", "approve");

    return this.toActionItemReadModel(
      await this.meetingRepository.updateActionItem(actionItem.id, {
        status: "approved",
        convertedTaskId: null,
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  async rejectActionItem(
    actionItemId: string,
  ): Promise<MeetingActionItemResponseDto> {
    const actionItem = await this.requireActionItem(actionItemId);

    this.assertActionItemStatus(actionItem, "draft", "reject");

    return this.toActionItemReadModel(
      await this.meetingRepository.updateActionItem(actionItem.id, {
        status: "rejected",
        convertedTaskId: null,
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  async markActionItemConverted(
    actionItemId: string,
    requestBody: ConvertMeetingActionItemRequestDto,
  ): Promise<MeetingActionItemResponseDto> {
    const actionItem = await this.requireActionItem(actionItemId);

    this.assertActionItemStatus(actionItem, "approved", "convert");

    return this.toActionItemReadModel(
      await this.meetingRepository.updateActionItem(actionItem.id, {
        status: "converted",
        convertedTaskId: this.requireNonEmptyString(
          requestBody.convertedTaskId,
          "convertedTaskId",
        ),
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  async requestActionItemTaskDraft(
    actionItemId: string,
    actor?: WorkspaceActor,
  ): Promise<MeetingActionItemTaskDraftResponseDto> {
    const actionItem = await this.requireActionItem(actionItemId);

    this.assertActionItemStatus(actionItem, "approved", "request task draft");

    const report = await this.requireReport(actionItem.reportId);
    const meeting = await this.requireMeeting(report.meetingId);
    const payload = this.toTaskCreateDraftPayload(
      meeting.workspaceId,
      actionItem,
    );
    const taskDraft = await this.createTaskDraft(payload, actor);

    return {
      actionItem: this.toActionItemReadModel(actionItem),
      taskDraft,
    };
  }

  private async requireMeeting(meetingId: string): Promise<MeetingRecord> {
    const meeting = await this.meetingRepository.findMeetingById(
      this.requireNonEmptyString(meetingId, "meetingId"),
    );

    if (!meeting) {
      throw new NotFoundException("Meeting not found");
    }

    return meeting;
  }

  private async requireParticipant(
    participantId: string,
  ): Promise<MeetingParticipantRecord> {
    const participant = await this.meetingRepository.findParticipantById(
      this.requireNonEmptyString(participantId, "participantId"),
    );

    if (!participant) {
      throw new NotFoundException("Meeting participant not found");
    }

    return participant;
  }

  private async requireAgendaInMeeting(
    meetingId: string,
    agendaId: string,
  ): Promise<MeetingAgendaRecord> {
    const meeting = await this.requireMeeting(meetingId);
    const agenda = await this.meetingRepository.findAgendaById(
      this.requireNonEmptyString(agendaId, "agendaId"),
    );

    if (!agenda || agenda.meetingId !== meeting.id) {
      throw new NotFoundException("Meeting agenda not found");
    }

    return agenda;
  }

  private async requireReport(reportId: string): Promise<MeetingReportRecord> {
    const report = await this.meetingRepository.findReportById(
      this.requireNonEmptyString(reportId, "reportId"),
    );

    if (!report) {
      throw new NotFoundException("Meeting report not found");
    }

    return report;
  }

  private async requireActionItem(
    actionItemId: string,
  ): Promise<MeetingActionItemRecord> {
    const actionItem = await this.meetingRepository.findActionItemById(
      this.requireNonEmptyString(actionItemId, "actionItemId"),
    );

    if (!actionItem) {
      throw new NotFoundException("Meeting action item not found");
    }

    return actionItem;
  }

  private requireMatchingRouteWorkspace(
    routeWorkspaceId: string | undefined,
    actualWorkspaceId: string,
    mismatchMessage: string,
  ): string {
    if (
      routeWorkspaceId &&
      this.requireNonEmptyString(routeWorkspaceId, "workspaceId") !==
        actualWorkspaceId
    ) {
      throw new NotFoundException(mismatchMessage);
    }

    return actualWorkspaceId;
  }

  private async toReportDetail(
    report: MeetingReportRecord,
    meeting: MeetingRecord,
  ): Promise<MeetingReportResponseDto> {
    return {
      ...(await this.toReportSummary(report, meeting)),
      decisions: (await this.meetingRepository.listDecisionsByReport(report.id)).map(
        (decision) => this.toDecisionReadModel(decision),
      ),
      risks: (await this.meetingRepository.listRisksByReport(report.id)).map(
        (risk) => this.toRiskReadModel(risk),
      ),
      nextAgendas: (
        await this.meetingRepository.listNextAgendasByReport(report.id)
      ).map((nextAgenda) => this.toNextAgendaReadModel(nextAgenda)),
    };
  }

  private async persistWorkflowOutput(
    report: MeetingReportRecord,
    meeting: MeetingRecord,
    workflowOutput: MeetingReportWorkflowOutput,
  ): Promise<void> {
    for (const decision of workflowOutput.decisions) {
      await this.meetingRepository.createDecision({
        reportId: report.id,
        content: this.requireNonEmptyString(decision.content, "content"),
        status: this.parseDecisionStatus(decision.status),
        linkedTaskId: this.optionalString(
          decision.linkedTaskId,
          "linkedTaskId",
        ),
      });
    }

    for (const [index, risk] of workflowOutput.risks.entries()) {
      const sortOrder = this.workflowSortOrder(risk.sortOrder, index);

      await this.assertRiskSortOrderAvailable(report.id, sortOrder);
      await this.meetingRepository.createRisk({
        reportId: report.id,
        content: this.requireNonEmptyString(risk.content, "content"),
        severity: this.parseRiskSeverity(risk.severity),
        sortOrder,
      });
    }

    for (const [index, nextAgenda] of workflowOutput.nextAgendas.entries()) {
      const sortOrder = this.workflowSortOrder(nextAgenda.sortOrder, index);

      await this.assertNextAgendaSortOrderAvailable(report.id, sortOrder);
      await this.meetingRepository.createNextAgenda({
        reportId: report.id,
        title: this.requireNonEmptyString(nextAgenda.title, "title"),
        sortOrder,
      });
    }

    for (const actionItem of workflowOutput.actionItems) {
      await this.meetingRepository.createActionItem({
        reportId: report.id,
        title: this.requireNonEmptyString(actionItem.title, "title"),
        description: this.optionalString(actionItem.description, "description"),
        assigneeSuggestionMemberId: this.resolveOptionalWorkspaceMemberId(
          meeting.workspaceId,
          actionItem.assigneeSuggestionMemberId,
          "assigneeSuggestionMemberId",
        ),
        dueDateSuggestion: this.optionalDate(
          actionItem.dueDateSuggestion,
          "dueDateSuggestion",
        ),
      });
    }
  }

  private async toReportSummary(
    report: MeetingReportRecord,
    meeting: MeetingRecord,
  ): Promise<MeetingReportSummaryDto> {
    return {
      id: report.id,
      meetingId: report.meetingId,
      workspaceId: meeting.workspaceId,
      title: meeting.title,
      summary: report.summary,
      decisionCount: (await this.meetingRepository.listDecisionsByReport(report.id))
        .length,
      actionItemCount: (
        await this.meetingRepository.listActionItemsByReport(report.id)
      ).length,
      riskCount: (await this.meetingRepository.listRisksByReport(report.id))
        .length,
      createdAt: report.createdAt,
    };
  }

  private toCanvasEntityRef(
    report: MeetingReportSummaryDto,
  ): MeetingReportCanvasEntityRefDto {
    return {
      entityType: "meeting_report",
      entityId: report.id,
      displayTitle: report.title,
      shapeType: "meeting_report",
    };
  }

  private toDecisionReadModel(
    decision: MeetingDecisionRecord,
  ): MeetingDecisionResponseDto {
    return {
      id: decision.id,
      reportId: decision.reportId,
      title: decision.content,
      content: decision.content,
      status: decision.status,
      linkedTaskId: decision.linkedTaskId,
      createdAt: decision.createdAt,
    };
  }

  private toRiskReadModel(
    risk: MeetingReportRiskRecord,
  ): MeetingReportRiskResponseDto {
    return {
      id: risk.id,
      reportId: risk.reportId,
      content: risk.content,
      severity: risk.severity,
      sortOrder: risk.sortOrder,
      createdAt: risk.createdAt,
    };
  }

  private toNextAgendaReadModel(
    nextAgenda: MeetingReportNextAgendaRecord,
  ): MeetingReportNextAgendaResponseDto {
    return {
      id: nextAgenda.id,
      reportId: nextAgenda.reportId,
      title: nextAgenda.title,
      sortOrder: nextAgenda.sortOrder,
      createdAt: nextAgenda.createdAt,
    };
  }

  private toActionItemReadModel(
    actionItem: MeetingActionItemRecord,
  ): MeetingActionItemResponseDto {
    return {
      id: actionItem.id,
      reportId: actionItem.reportId,
      title: actionItem.title,
      description: actionItem.description,
      assigneeSuggestionMemberId: actionItem.assigneeSuggestionMemberId,
      dueDateSuggestion: actionItem.dueDateSuggestion,
      status: actionItem.status,
      convertedTaskId: actionItem.convertedTaskId,
    };
  }

  private toTaskCreateDraftPayload(
    workspaceId: string,
    actionItem: MeetingActionItemRecord,
  ): TaskCreateDraftPayload {
    return {
      workspaceId,
      sourceType: "meeting_action_item",
      sourceId: actionItem.id,
      title: actionItem.title,
      description: actionItem.description,
      assigneeMemberId: actionItem.assigneeSuggestionMemberId,
      priority: "medium",
      dueDate: actionItem.dueDateSuggestion,
    };
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

  private parseTranscriptSource(value: unknown): TranscriptSource {
    if (value === undefined || value === null) {
      return "text";
    }

    if (
      typeof value === "string" &&
      TRANSCRIPT_SOURCE_VALUES.includes(value as TranscriptSource)
    ) {
      return value as TranscriptSource;
    }

    throw new BadRequestException(
      `source must be one of: ${TRANSCRIPT_SOURCE_VALUES.join(", ")}`,
    );
  }

  private parseDecisionStatus(value: unknown): MeetingDecisionStatus {
    if (value === undefined || value === null) {
      return "decided";
    }

    if (
      typeof value === "string" &&
      MEETING_DECISION_STATUS_VALUES.includes(value as MeetingDecisionStatus)
    ) {
      return value as MeetingDecisionStatus;
    }

    throw new BadRequestException(
      `status must be one of: ${MEETING_DECISION_STATUS_VALUES.join(", ")}`,
    );
  }

  private parseRiskSeverity(value: unknown): MeetingReportRiskSeverity {
    if (value === undefined || value === null) {
      return "medium";
    }

    if (
      typeof value === "string" &&
      MEETING_REPORT_RISK_SEVERITY_VALUES.includes(
        value as MeetingReportRiskSeverity,
      )
    ) {
      return value as MeetingReportRiskSeverity;
    }

    throw new BadRequestException(
      `severity must be one of: ${MEETING_REPORT_RISK_SEVERITY_VALUES.join(", ")}`,
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

  private optionalDate(value: unknown, fieldName: string): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const date = this.requireNonEmptyString(value, fieldName);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException(`${fieldName} must be a date`);
    }

    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      throw new BadRequestException(`${fieldName} must be a valid date`);
    }

    return date;
  }

  private workflowSortOrder(value: unknown, index: number): number {
    if (value === undefined || value === null) {
      return index;
    }

    return this.requireNonNegativeInteger(value, "sortOrder");
  }

  private async assertRiskSortOrderAvailable(
    reportId: string,
    sortOrder: number,
  ): Promise<void> {
    const duplicate = (
      await this.meetingRepository.listRisksByReport(reportId)
    ).some((risk) => risk.sortOrder === sortOrder);

    if (duplicate) {
      throw new BadRequestException(
        "sortOrder must be unique within meeting report risks",
      );
    }
  }

  private async assertNextAgendaSortOrderAvailable(
    reportId: string,
    sortOrder: number,
  ): Promise<void> {
    const duplicate = (
      await this.meetingRepository.listNextAgendasByReport(reportId)
    ).some((nextAgenda) => nextAgenda.sortOrder === sortOrder);

    if (duplicate) {
      throw new BadRequestException(
        "sortOrder must be unique within meeting report next agendas",
      );
    }
  }

  private resolveWorkspaceMemberId(
    workspaceId: string,
    value: unknown,
  ): string {
    const memberId =
      value === undefined || value === null
        ? this.currentMemberAdapter.getCurrentMember(workspaceId).id
        : this.requireNonEmptyString(value, "memberId");
    const workspaceMember = this.currentMemberAdapter.getWorkspaceMember(
      workspaceId,
      memberId,
    );

    if (!workspaceMember) {
      throw new BadRequestException(
        "memberId must belong to meeting workspace",
      );
    }

    return workspaceMember.id;
  }

  private resolveOptionalWorkspaceMemberId(
    workspaceId: string,
    value: unknown,
    fieldName: string,
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const memberId = this.requireNonEmptyString(value, fieldName);
    const workspaceMember = this.currentMemberAdapter.getWorkspaceMember(
      workspaceId,
      memberId,
    );

    if (!workspaceMember) {
      throw new BadRequestException(
        `${fieldName} must belong to meeting workspace`,
      );
    }

    return workspaceMember.id;
  }

  private optionalIsoDateTime(
    value: unknown,
    fieldName: string,
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const dateTime = this.requireNonEmptyString(value, fieldName);

    if (Number.isNaN(Date.parse(dateTime))) {
      throw new BadRequestException(`${fieldName} must be an ISO date-time`);
    }

    return dateTime;
  }

  private validateTimeRange(
    startedAt: string | null,
    endedAt: string | null,
  ): void {
    if (
      startedAt &&
      endedAt &&
      new Date(endedAt).getTime() < new Date(startedAt).getTime()
    ) {
      throw new BadRequestException("endedAt must be after startedAt");
    }
  }

  private async createTaskDraft(
    payload: TaskCreateDraftPayload,
    actor?: WorkspaceActor,
  ): Promise<TaskDraftResponse> {
    let taskDraft: TaskDraftResponse;

    try {
      taskDraft = await this.taskDraftClient.createTaskDraft(payload, {
        actor,
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException("Task draft request failed");
    }

    if (typeof taskDraft.id !== "string" || taskDraft.id.length === 0) {
      throw new InternalServerErrorException(
        "Task draft response must include id",
      );
    }

    if (
      taskDraft.taskId !== null &&
      (typeof taskDraft.taskId !== "string" || taskDraft.taskId.length === 0)
    ) {
      throw new InternalServerErrorException(
        "Task draft response taskId must be null or non-empty",
      );
    }

    return taskDraft;
  }

  private assertActionItemStatus(
    actionItem: MeetingActionItemRecord,
    expectedStatus: MeetingActionItemStatus,
    actionName: string,
  ): void {
    if (actionItem.status !== expectedStatus) {
      throw new BadRequestException(
        `Cannot ${actionName} meeting action item from ${actionItem.status} status`,
      );
    }
  }
}
