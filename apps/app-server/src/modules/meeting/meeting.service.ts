import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
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
  MeetingReportAiContextDto,
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

const KST_TIME_ZONE = "Asia/Seoul" as const;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type MeetingReportContextEntry = {
  report: MeetingReportRecord;
  meeting: MeetingRecord;
};

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

  createMemo(
    meetingId: string,
    requestBody: CreateMeetingMemoRequestDto,
  ): MeetingMemoResponseDto {
    const meeting = this.requireMeeting(meetingId);

    return this.meetingRepository.createMemo({
      meetingId: meeting.id,
      authorMemberId: this.resolveWorkspaceMemberId(
        meeting.workspaceId,
        requestBody.authorMemberId,
      ),
      body: this.requireNonEmptyString(requestBody.body, "body"),
    });
  }

  listMemos(meetingId: string): MeetingMemoResponseDto[] {
    const meeting = this.requireMeeting(meetingId);

    return this.meetingRepository.listMemosByMeeting(meeting.id);
  }

  createTranscriptSegment(
    meetingId: string,
    requestBody: CreateTranscriptSegmentRequestDto,
  ): TranscriptSegmentResponseDto {
    const meeting = this.requireMeeting(meetingId);
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

  listTranscriptSegments(meetingId: string): TranscriptSegmentResponseDto[] {
    const meeting = this.requireMeeting(meetingId);

    return this.meetingRepository.listTranscriptSegmentsByMeeting(meeting.id);
  }

  requestReportGeneration(meetingId: string): MeetingReportResponseDto {
    return this.createReport(meetingId);
  }

  createReport(meetingId: string): MeetingReportResponseDto {
    const meeting = this.requireMeeting(meetingId);
    const currentMember = this.currentMemberAdapter.getCurrentMember(
      meeting.workspaceId,
    );
    const existingReport = this.meetingRepository.findReportByMeetingId(
      meeting.id,
    );

    if (existingReport) {
      return this.toReportDetail(existingReport, meeting);
    }

    const workflowOutput = this.meetingReportWorkflowClient.generateReport({
      meetingTitle: meeting.title,
      memoBodies: this.meetingRepository
        .listMemosByMeeting(meeting.id)
        .map((memo) => memo.body),
      transcriptBodies: this.meetingRepository
        .listTranscriptSegmentsByMeeting(meeting.id)
        .map((segment) => segment.body),
    });

    if (workflowOutput.error) {
      throw new BadRequestException(workflowOutput.error.message);
    }

    const report = this.meetingRepository.createReport({
      meetingId: meeting.id,
      summary: this.requireNonEmptyString(workflowOutput.summary, "summary"),
      createdByMemberId: currentMember.id,
    });

    this.persistWorkflowOutput(report, meeting, workflowOutput);
    this.meetingRepository.updateMeeting(meeting.id, {
      status: "report_generated",
      updatedAt: new Date().toISOString(),
    });

    return this.toReportDetail(report, {
      ...meeting,
      status: "report_generated",
    });
  }

  getReport(reportId: string): MeetingReportResponseDto {
    const report = this.requireReport(reportId);
    const meeting = this.requireMeeting(report.meetingId);

    return this.toReportDetail(report, meeting);
  }

  getReportForWorkspace(
    workspaceId: string,
    reportId: string,
  ): MeetingReportResponseDto {
    const report = this.getReport(reportId);
    const expectedWorkspaceId = this.requireNonEmptyString(
      workspaceId,
      "workspaceId",
    );

    if (report.workspaceId !== expectedWorkspaceId) {
      throw new NotFoundException("Meeting report not found in workspace");
    }

    return report;
  }

  listRecentReports(workspaceId: string): MeetingReportSummaryDto[] {
    const expectedWorkspaceId = this.requireNonEmptyString(
      workspaceId,
      "workspaceId",
    );

    return this.meetingRepository
      .listReports()
      .map((report) => {
        const meeting = this.meetingRepository.findMeetingById(
          report.meetingId,
        );

        return meeting ? this.toReportSummary(report, meeting) : null;
      })
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

  listRecentReportCanvasEntityRefs(
    workspaceId: string,
  ): MeetingReportCanvasEntityRefDto[] {
    return this.listRecentReports(workspaceId).map((report) =>
      this.toCanvasEntityRef(report),
    );
  }

  createDecision(
    reportId: string,
    requestBody: CreateMeetingDecisionRequestDto,
  ): MeetingDecisionResponseDto {
    const report = this.requireReport(reportId);

    return this.toDecisionReadModel(
      this.meetingRepository.createDecision({
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

  listDecisions(reportId: string): MeetingDecisionResponseDto[] {
    const report = this.requireReport(reportId);

    return this.meetingRepository
      .listDecisionsByReport(report.id)
      .map((decision) => this.toDecisionReadModel(decision));
  }

  createRisk(
    reportId: string,
    requestBody: CreateMeetingReportRiskRequestDto,
  ): MeetingReportRiskResponseDto {
    const report = this.requireReport(reportId);
    const sortOrder = this.optionalNonNegativeInteger(
      requestBody.sortOrder,
      "sortOrder",
    );

    if (sortOrder !== undefined) {
      this.assertRiskSortOrderAvailable(report.id, sortOrder);
    }

    return this.toRiskReadModel(
      this.meetingRepository.createRisk({
        reportId: report.id,
        content: this.requireNonEmptyString(requestBody.content, "content"),
        severity: this.parseRiskSeverity(requestBody.severity),
        sortOrder,
      }),
    );
  }

  listRisks(reportId: string): MeetingReportRiskResponseDto[] {
    const report = this.requireReport(reportId);

    return this.meetingRepository
      .listRisksByReport(report.id)
      .map((risk) => this.toRiskReadModel(risk));
  }

  createNextAgenda(
    reportId: string,
    requestBody: CreateMeetingReportNextAgendaRequestDto,
  ): MeetingReportNextAgendaResponseDto {
    const report = this.requireReport(reportId);
    const sortOrder = this.optionalNonNegativeInteger(
      requestBody.sortOrder,
      "sortOrder",
    );

    if (sortOrder !== undefined) {
      this.assertNextAgendaSortOrderAvailable(report.id, sortOrder);
    }

    return this.toNextAgendaReadModel(
      this.meetingRepository.createNextAgenda({
        reportId: report.id,
        title: this.requireNonEmptyString(requestBody.title, "title"),
        sortOrder,
      }),
    );
  }

  listNextAgendas(reportId: string): MeetingReportNextAgendaResponseDto[] {
    const report = this.requireReport(reportId);

    return this.meetingRepository
      .listNextAgendasByReport(report.id)
      .map((nextAgenda) => this.toNextAgendaReadModel(nextAgenda));
  }

  createActionItem(
    reportId: string,
    requestBody: CreateMeetingActionItemRequestDto,
  ): MeetingActionItemResponseDto {
    const report = this.requireReport(reportId);
    const meeting = this.requireMeeting(report.meetingId);

    return this.toActionItemReadModel(
      this.meetingRepository.createActionItem({
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

  listActionItems(reportId: string): MeetingActionItemResponseDto[] {
    const report = this.requireReport(reportId);

    return this.meetingRepository
      .listActionItemsByReport(report.id)
      .map((actionItem) => this.toActionItemReadModel(actionItem));
  }

  listWorkspaceActionItems(
    workspaceId: string,
  ): MeetingActionItemResponseDto[] {
    return this.listRecentReports(workspaceId).flatMap((report) =>
      this.meetingRepository
        .listActionItemsByReport(report.id)
        .map((actionItem) => this.toActionItemReadModel(actionItem)),
    );
  }

  getMeetingReportAiContext(
    workspaceId: string,
    date?: unknown,
  ): MeetingReportAiContextDto {
    const expectedWorkspaceId = this.requireNonEmptyString(
      workspaceId,
      "workspaceId",
    );
    const contextDate =
      this.optionalDate(date, "date") ?? this.previousKstDate(new Date());
    const currentMember =
      this.currentMemberAdapter.getCurrentMember(expectedWorkspaceId);
    const entries = this.listReportContextEntries(
      expectedWorkspaceId,
      contextDate,
    );

    return {
      workspaceId: expectedWorkspaceId,
      date: contextDate,
      timezone: KST_TIME_ZONE,
      dateBasis: "report.createdAt",
      currentMemberId: currentMember.id,
      generatedAt: new Date().toISOString(),
      reports: entries.map((entry) => this.toAiContextReport(entry)),
      decisions: entries.flatMap((entry) =>
        this.meetingRepository
          .listDecisionsByReport(entry.report.id)
          .map((decision) => this.toAiContextDecision(entry, decision)),
      ),
      actionItems: entries.flatMap((entry) =>
        this.meetingRepository
          .listActionItemsByReport(entry.report.id)
          .map((actionItem) =>
            this.toAiContextActionItem(entry, actionItem, currentMember.id),
          ),
      ),
      risks: entries.flatMap((entry) =>
        this.meetingRepository
          .listRisksByReport(entry.report.id)
          .map((risk) => this.toAiContextRisk(entry, risk)),
      ),
      nextAgendas: entries.flatMap((entry) =>
        this.meetingRepository
          .listNextAgendasByReport(entry.report.id)
          .map((nextAgenda) => this.toAiContextNextAgenda(entry, nextAgenda)),
      ),
    };
  }

  approveActionItem(actionItemId: string): MeetingActionItemResponseDto {
    const actionItem = this.requireActionItem(actionItemId);

    this.assertActionItemStatus(actionItem, "draft", "approve");

    return this.toActionItemReadModel(
      this.meetingRepository.updateActionItem(actionItem.id, {
        status: "approved",
        convertedTaskId: null,
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  rejectActionItem(actionItemId: string): MeetingActionItemResponseDto {
    const actionItem = this.requireActionItem(actionItemId);

    this.assertActionItemStatus(actionItem, "draft", "reject");

    return this.toActionItemReadModel(
      this.meetingRepository.updateActionItem(actionItem.id, {
        status: "rejected",
        convertedTaskId: null,
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  markActionItemConverted(
    actionItemId: string,
    requestBody: ConvertMeetingActionItemRequestDto,
  ): MeetingActionItemResponseDto {
    const actionItem = this.requireActionItem(actionItemId);

    this.assertActionItemStatus(actionItem, "approved", "convert");

    return this.toActionItemReadModel(
      this.meetingRepository.updateActionItem(actionItem.id, {
        status: "converted",
        convertedTaskId: this.requireNonEmptyString(
          requestBody.convertedTaskId,
          "convertedTaskId",
        ),
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  requestActionItemTaskDraft(
    actionItemId: string,
  ): MeetingActionItemTaskDraftResponseDto {
    const actionItem = this.requireActionItem(actionItemId);

    this.assertActionItemStatus(actionItem, "approved", "request task draft");

    const report = this.requireReport(actionItem.reportId);
    const meeting = this.requireMeeting(report.meetingId);
    const payload = this.toTaskCreateDraftPayload(
      meeting.workspaceId,
      actionItem,
    );
    const taskDraft = this.createTaskDraft(payload);
    const convertedActionItem = this.meetingRepository.updateActionItem(
      actionItem.id,
      {
        status: "converted",
        convertedTaskId: taskDraft.taskId,
        updatedAt: new Date().toISOString(),
      },
    );

    return {
      actionItem: this.toActionItemReadModel(convertedActionItem),
      taskDraft,
    };
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

  private requireReport(reportId: string): MeetingReportRecord {
    const report = this.meetingRepository.findReportById(
      this.requireNonEmptyString(reportId, "reportId"),
    );

    if (!report) {
      throw new NotFoundException("Meeting report not found");
    }

    return report;
  }

  private requireActionItem(actionItemId: string): MeetingActionItemRecord {
    const actionItem = this.meetingRepository.findActionItemById(
      this.requireNonEmptyString(actionItemId, "actionItemId"),
    );

    if (!actionItem) {
      throw new NotFoundException("Meeting action item not found");
    }

    return actionItem;
  }

  private toReportDetail(
    report: MeetingReportRecord,
    meeting: MeetingRecord,
  ): MeetingReportResponseDto {
    return {
      ...this.toReportSummary(report, meeting),
      decisions: this.meetingRepository
        .listDecisionsByReport(report.id)
        .map((decision) => this.toDecisionReadModel(decision)),
      risks: this.meetingRepository
        .listRisksByReport(report.id)
        .map((risk) => this.toRiskReadModel(risk)),
      nextAgendas: this.meetingRepository
        .listNextAgendasByReport(report.id)
        .map((nextAgenda) => this.toNextAgendaReadModel(nextAgenda)),
    };
  }

  private persistWorkflowOutput(
    report: MeetingReportRecord,
    meeting: MeetingRecord,
    workflowOutput: MeetingReportWorkflowOutput,
  ): void {
    for (const decision of workflowOutput.decisions) {
      this.meetingRepository.createDecision({
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

      this.assertRiskSortOrderAvailable(report.id, sortOrder);
      this.meetingRepository.createRisk({
        reportId: report.id,
        content: this.requireNonEmptyString(risk.content, "content"),
        severity: this.parseRiskSeverity(risk.severity),
        sortOrder,
      });
    }

    for (const [index, nextAgenda] of workflowOutput.nextAgendas.entries()) {
      const sortOrder = this.workflowSortOrder(nextAgenda.sortOrder, index);

      this.assertNextAgendaSortOrderAvailable(report.id, sortOrder);
      this.meetingRepository.createNextAgenda({
        reportId: report.id,
        title: this.requireNonEmptyString(nextAgenda.title, "title"),
        sortOrder,
      });
    }

    for (const actionItem of workflowOutput.actionItems) {
      this.meetingRepository.createActionItem({
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

  private listReportContextEntries(
    workspaceId: string,
    date: string,
  ): MeetingReportContextEntry[] {
    return this.meetingRepository
      .listReports()
      .map((report): MeetingReportContextEntry | null => {
        const meeting = this.meetingRepository.findMeetingById(
          report.meetingId,
        );

        if (!meeting || meeting.workspaceId !== workspaceId) {
          return null;
        }

        if (this.kstDateKey(report.createdAt) !== date) {
          return null;
        }

        return { report, meeting };
      })
      .filter(
        (entry): entry is MeetingReportContextEntry => entry !== null,
      )
      .sort(
        (left, right) =>
          new Date(right.report.createdAt).getTime() -
          new Date(left.report.createdAt).getTime(),
      );
  }

  private toAiContextReport({ report, meeting }: MeetingReportContextEntry) {
    return {
      reportId: report.id,
      meetingId: meeting.id,
      workspaceId: meeting.workspaceId,
      meetingTitle: meeting.title,
      meetingStatus: meeting.status,
      meetingStartedAt: meeting.startedAt,
      meetingEndedAt: meeting.endedAt,
      summary: report.summary,
      decisionCount: this.meetingRepository.listDecisionsByReport(report.id)
        .length,
      actionItemCount: this.meetingRepository.listActionItemsByReport(report.id)
        .length,
      riskCount: this.meetingRepository.listRisksByReport(report.id).length,
      reportCreatedAt: report.createdAt,
    };
  }

  private toAiContextDecision(
    { report, meeting }: MeetingReportContextEntry,
    decision: MeetingDecisionRecord,
  ) {
    return {
      ...this.toDecisionReadModel(decision),
      workspaceId: meeting.workspaceId,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      reportCreatedAt: report.createdAt,
    };
  }

  private toAiContextRisk(
    { report, meeting }: MeetingReportContextEntry,
    risk: MeetingReportRiskRecord,
  ) {
    return {
      ...this.toRiskReadModel(risk),
      workspaceId: meeting.workspaceId,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      reportCreatedAt: report.createdAt,
    };
  }

  private toAiContextNextAgenda(
    { report, meeting }: MeetingReportContextEntry,
    nextAgenda: MeetingReportNextAgendaRecord,
  ) {
    return {
      ...this.toNextAgendaReadModel(nextAgenda),
      workspaceId: meeting.workspaceId,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      reportCreatedAt: report.createdAt,
    };
  }

  private toAiContextActionItem(
    { report, meeting }: MeetingReportContextEntry,
    actionItem: MeetingActionItemRecord,
    currentMemberId: string,
  ) {
    return {
      ...this.toActionItemReadModel(actionItem),
      workspaceId: meeting.workspaceId,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      reportCreatedAt: report.createdAt,
      createdAt: actionItem.createdAt,
      isCurrentMemberAssigneeSuggestion:
        actionItem.assigneeSuggestionMemberId === currentMemberId,
    };
  }

  private toReportSummary(
    report: MeetingReportRecord,
    meeting: MeetingRecord,
  ): MeetingReportSummaryDto {
    return {
      id: report.id,
      meetingId: report.meetingId,
      workspaceId: meeting.workspaceId,
      title: meeting.title,
      summary: report.summary,
      decisionCount: this.meetingRepository.listDecisionsByReport(report.id)
        .length,
      actionItemCount: this.meetingRepository.listActionItemsByReport(report.id)
        .length,
      riskCount: this.meetingRepository.listRisksByReport(report.id).length,
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

  private previousKstDate(now: Date): string {
    return new Date(
      now.getTime() + KST_OFFSET_MS - 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);
  }

  private kstDateKey(dateTime: string): string | null {
    const parsedDate = new Date(dateTime);

    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    return new Date(parsedDate.getTime() + KST_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
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

  private assertRiskSortOrderAvailable(
    reportId: string,
    sortOrder: number,
  ): void {
    const duplicate = this.meetingRepository
      .listRisksByReport(reportId)
      .some((risk) => risk.sortOrder === sortOrder);

    if (duplicate) {
      throw new BadRequestException(
        "sortOrder must be unique within meeting report risks",
      );
    }
  }

  private assertNextAgendaSortOrderAvailable(
    reportId: string,
    sortOrder: number,
  ): void {
    const duplicate = this.meetingRepository
      .listNextAgendasByReport(reportId)
      .some((nextAgenda) => nextAgenda.sortOrder === sortOrder);

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

  private createTaskDraft(payload: TaskCreateDraftPayload): TaskDraftResponse {
    let taskDraft: TaskDraftResponse;

    try {
      taskDraft = this.taskDraftClient.createTaskDraft(payload);
    } catch {
      throw new InternalServerErrorException("Task draft request failed");
    }

    if (typeof taskDraft.taskId !== "string" || taskDraft.taskId.length === 0) {
      throw new InternalServerErrorException(
        "Task draft response must include taskId",
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
