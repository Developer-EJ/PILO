import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  CreateMeetingInput,
  CreateMeetingActionItemInput,
  CreateMeetingAgendaInput,
  CreateMeetingDecisionInput,
  CreateMeetingMemoInput,
  CreateMeetingParticipantInput,
  CreateMeetingReportInput,
  CreateMeetingReportNextAgendaInput,
  CreateMeetingReportRiskInput,
  CreateTranscriptSegmentInput,
  MEETING_STATUS_VALUES,
  MeetingActionItemRecord,
  MeetingAgendaRecord,
  MeetingDecisionRecord,
  MeetingMemoRecord,
  MeetingRecord,
  MeetingParticipantRecord,
  MeetingReportNextAgendaRecord,
  MeetingReportRecord,
  MeetingReportRiskRecord,
  MeetingRepositoryMode,
  MeetingStatus,
  TranscriptSegmentRecord,
  UpdateMeetingActionItemInput,
  UpdateMeetingAgendaInput,
  UpdateMeetingInput,
} from "../types/meeting.types";
import { MeetingRepository } from "./meeting.repository";

@Injectable()
export class MockMeetingRepository implements MeetingRepository {
  get mode(): MeetingRepositoryMode {
    return "mock";
  }

  private readonly meetings = new Map<string, MeetingRecord>();
  private readonly participants = new Map<string, MeetingParticipantRecord>();
  private readonly agendas = new Map<string, MeetingAgendaRecord>();
  private readonly memos = new Map<string, MeetingMemoRecord>();
  private readonly transcriptSegments = new Map<
    string,
    TranscriptSegmentRecord
  >();
  private readonly reports = new Map<string, MeetingReportRecord>();
  private readonly decisions = new Map<string, MeetingDecisionRecord>();
  private readonly risks = new Map<string, MeetingReportRiskRecord>();
  private readonly nextAgendas = new Map<
    string,
    MeetingReportNextAgendaRecord
  >();
  private readonly actionItems = new Map<string, MeetingActionItemRecord>();

  listMeetingStatusValues(): readonly MeetingStatus[] {
    return MEETING_STATUS_VALUES;
  }

  createMeeting(input: CreateMeetingInput): MeetingRecord {
    const now = new Date().toISOString();
    const meeting: MeetingRecord = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      canvasBoardId: input.canvasBoardId ?? null,
      title: input.title,
      purpose: input.purpose ?? null,
      status: "scheduled",
      startedAt: null,
      endedAt: null,
      createdByMemberId: input.createdByMemberId,
      createdAt: now,
      updatedAt: now,
    };

    this.meetings.set(meeting.id, meeting);

    return meeting;
  }

  listMeetingsByWorkspace(workspaceId: string): MeetingRecord[] {
    return [...this.meetings.values()].filter(
      (meeting) => meeting.workspaceId === workspaceId,
    );
  }

  findMeetingById(meetingId: string): MeetingRecord | null {
    return this.meetings.get(meetingId) ?? null;
  }

  updateMeeting(meetingId: string, input: UpdateMeetingInput): MeetingRecord {
    const meeting = this.meetings.get(meetingId);

    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    const updatedMeeting: MeetingRecord = {
      ...meeting,
      status: input.status,
      startedAt:
        input.startedAt === undefined ? meeting.startedAt : input.startedAt,
      endedAt: input.endedAt === undefined ? meeting.endedAt : input.endedAt,
      updatedAt: input.updatedAt,
    };

    this.meetings.set(meetingId, updatedMeeting);

    return updatedMeeting;
  }

  addParticipant(
    input: CreateMeetingParticipantInput,
  ): MeetingParticipantRecord {
    const now = new Date().toISOString();
    const participant: MeetingParticipantRecord = {
      id: randomUUID(),
      meetingId: input.meetingId,
      memberId: input.memberId,
      role: input.role ?? null,
      joinedAt: now,
      leftAt: null,
    };

    this.participants.set(participant.id, participant);

    return participant;
  }

  listParticipantsByMeeting(meetingId: string): MeetingParticipantRecord[] {
    return [...this.participants.values()].filter(
      (participant) => participant.meetingId === meetingId,
    );
  }

  findParticipantById(participantId: string): MeetingParticipantRecord | null {
    return this.participants.get(participantId) ?? null;
  }

  leaveParticipant(
    participantId: string,
    leftAt: string,
  ): MeetingParticipantRecord {
    const participant = this.participants.get(participantId);

    if (!participant) {
      throw new Error(`Meeting participant not found: ${participantId}`);
    }

    const updatedParticipant: MeetingParticipantRecord = {
      ...participant,
      leftAt: participant.leftAt ?? leftAt,
    };

    this.participants.set(participantId, updatedParticipant);

    return updatedParticipant;
  }

  createAgenda(input: CreateMeetingAgendaInput): MeetingAgendaRecord {
    const now = new Date().toISOString();
    const agenda: MeetingAgendaRecord = {
      id: randomUUID(),
      meetingId: input.meetingId,
      title: input.title,
      status: "open",
      sortOrder: input.sortOrder ?? this.nextAgendaSortOrder(input.meetingId),
      createdAt: now,
      updatedAt: now,
    };

    this.agendas.set(agenda.id, agenda);

    return agenda;
  }

  listAgendasByMeeting(meetingId: string): MeetingAgendaRecord[] {
    return [...this.agendas.values()]
      .filter((agenda) => agenda.meetingId === meetingId)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  findAgendaById(agendaId: string): MeetingAgendaRecord | null {
    return this.agendas.get(agendaId) ?? null;
  }

  updateAgenda(
    agendaId: string,
    input: UpdateMeetingAgendaInput,
  ): MeetingAgendaRecord {
    const agenda = this.agendas.get(agendaId);

    if (!agenda) {
      throw new Error(`Meeting agenda not found: ${agendaId}`);
    }

    if (input.sortOrder !== undefined && input.sortOrder !== agenda.sortOrder) {
      this.swapAgendaSortOrder(agenda, input.sortOrder, input.updatedAt);
    }

    const updatedAgenda: MeetingAgendaRecord = {
      ...agenda,
      status: input.status ?? agenda.status,
      sortOrder: input.sortOrder ?? agenda.sortOrder,
      updatedAt: input.updatedAt,
    };

    this.agendas.set(agendaId, updatedAgenda);

    return updatedAgenda;
  }

  private nextAgendaSortOrder(meetingId: string): number {
    const sortOrders = this.listAgendasByMeeting(meetingId).map(
      (agenda) => agenda.sortOrder,
    );

    return sortOrders.length === 0 ? 0 : Math.max(...sortOrders) + 1;
  }

  private swapAgendaSortOrder(
    agenda: MeetingAgendaRecord,
    nextSortOrder: number,
    updatedAt: string,
  ): void {
    const agendaToSwap = this.listAgendasByMeeting(agenda.meetingId).find(
      (candidate) =>
        candidate.id !== agenda.id && candidate.sortOrder === nextSortOrder,
    );

    if (!agendaToSwap) {
      return;
    }

    this.agendas.set(agendaToSwap.id, {
      ...agendaToSwap,
      sortOrder: agenda.sortOrder,
      updatedAt,
    });
  }

  createMemo(input: CreateMeetingMemoInput): MeetingMemoRecord {
    const now = new Date().toISOString();
    const memo: MeetingMemoRecord = {
      id: randomUUID(),
      meetingId: input.meetingId,
      authorMemberId: input.authorMemberId ?? null,
      body: input.body,
      createdAt: now,
      updatedAt: now,
    };

    this.memos.set(memo.id, memo);

    return memo;
  }

  listMemosByMeeting(meetingId: string): MeetingMemoRecord[] {
    return [...this.memos.values()].filter(
      (memo) => memo.meetingId === meetingId,
    );
  }

  createTranscriptSegment(
    input: CreateTranscriptSegmentInput,
  ): TranscriptSegmentRecord {
    const segment: TranscriptSegmentRecord = {
      id: randomUUID(),
      meetingId: input.meetingId,
      speakerMemberId: input.speakerMemberId ?? null,
      source: input.source,
      body: input.body,
      startedAt: input.startedAt ?? null,
      endedAt: input.endedAt ?? null,
      createdAt: new Date().toISOString(),
    };

    this.transcriptSegments.set(segment.id, segment);

    return segment;
  }

  listTranscriptSegmentsByMeeting(
    meetingId: string,
  ): TranscriptSegmentRecord[] {
    return [...this.transcriptSegments.values()].filter(
      (segment) => segment.meetingId === meetingId,
    );
  }

  createReport(input: CreateMeetingReportInput): MeetingReportRecord {
    const existingReport = this.findReportByMeetingId(input.meetingId);

    if (existingReport) {
      return existingReport;
    }

    const now = new Date().toISOString();
    const report: MeetingReportRecord = {
      id: randomUUID(),
      meetingId: input.meetingId,
      summary: input.summary,
      createdByMemberId: input.createdByMemberId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.reports.set(report.id, report);

    return report;
  }

  findReportById(reportId: string): MeetingReportRecord | null {
    return this.reports.get(reportId) ?? null;
  }

  findReportByMeetingId(meetingId: string): MeetingReportRecord | null {
    return (
      [...this.reports.values()].find(
        (report) => report.meetingId === meetingId,
      ) ?? null
    );
  }

  listReports(): MeetingReportRecord[] {
    return [...this.reports.values()];
  }

  createDecision(input: CreateMeetingDecisionInput): MeetingDecisionRecord {
    const now = new Date().toISOString();
    const decision: MeetingDecisionRecord = {
      id: randomUUID(),
      reportId: input.reportId,
      content: input.content,
      status: input.status ?? "decided",
      linkedTaskId: input.linkedTaskId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.decisions.set(decision.id, decision);

    return decision;
  }

  listDecisionsByReport(reportId: string): MeetingDecisionRecord[] {
    return [...this.decisions.values()].filter(
      (decision) => decision.reportId === reportId,
    );
  }

  createRisk(input: CreateMeetingReportRiskInput): MeetingReportRiskRecord {
    const risk: MeetingReportRiskRecord = {
      id: randomUUID(),
      reportId: input.reportId,
      content: input.content,
      severity: input.severity ?? "medium",
      sortOrder: input.sortOrder ?? this.nextRiskSortOrder(input.reportId),
      createdAt: new Date().toISOString(),
    };

    this.ensureRiskSortOrderAvailable(risk.reportId, risk.sortOrder);
    this.risks.set(risk.id, risk);

    return risk;
  }

  listRisksByReport(reportId: string): MeetingReportRiskRecord[] {
    return [...this.risks.values()]
      .filter((risk) => risk.reportId === reportId)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  createNextAgenda(
    input: CreateMeetingReportNextAgendaInput,
  ): MeetingReportNextAgendaRecord {
    const nextAgenda: MeetingReportNextAgendaRecord = {
      id: randomUUID(),
      reportId: input.reportId,
      title: input.title,
      sortOrder:
        input.sortOrder ?? this.nextReportNextAgendaSortOrder(input.reportId),
      createdAt: new Date().toISOString(),
    };

    this.ensureNextAgendaSortOrderAvailable(
      nextAgenda.reportId,
      nextAgenda.sortOrder,
    );
    this.nextAgendas.set(nextAgenda.id, nextAgenda);

    return nextAgenda;
  }

  listNextAgendasByReport(reportId: string): MeetingReportNextAgendaRecord[] {
    return [...this.nextAgendas.values()]
      .filter((nextAgenda) => nextAgenda.reportId === reportId)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  createActionItem(
    input: CreateMeetingActionItemInput,
  ): MeetingActionItemRecord {
    const now = new Date().toISOString();
    const actionItem: MeetingActionItemRecord = {
      id: randomUUID(),
      reportId: input.reportId,
      title: input.title,
      description: input.description ?? null,
      assigneeSuggestionMemberId: input.assigneeSuggestionMemberId ?? null,
      dueDateSuggestion: input.dueDateSuggestion ?? null,
      status: "draft",
      convertedTaskId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.actionItems.set(actionItem.id, actionItem);

    return actionItem;
  }

  listActionItemsByReport(reportId: string): MeetingActionItemRecord[] {
    return [...this.actionItems.values()].filter(
      (actionItem) => actionItem.reportId === reportId,
    );
  }

  findActionItemById(actionItemId: string): MeetingActionItemRecord | null {
    return this.actionItems.get(actionItemId) ?? null;
  }

  updateActionItem(
    actionItemId: string,
    input: UpdateMeetingActionItemInput,
  ): MeetingActionItemRecord {
    const actionItem = this.actionItems.get(actionItemId);

    if (!actionItem) {
      throw new Error(`Meeting action item not found: ${actionItemId}`);
    }

    const updatedActionItem: MeetingActionItemRecord = {
      ...actionItem,
      status: input.status,
      convertedTaskId:
        input.convertedTaskId === undefined
          ? actionItem.convertedTaskId
          : input.convertedTaskId,
      updatedAt: input.updatedAt,
    };

    this.actionItems.set(actionItemId, updatedActionItem);

    return updatedActionItem;
  }

  private nextRiskSortOrder(reportId: string): number {
    const sortOrders = this.listRisksByReport(reportId).map(
      (risk) => risk.sortOrder,
    );

    return sortOrders.length === 0 ? 0 : Math.max(...sortOrders) + 1;
  }

  private ensureRiskSortOrderAvailable(
    reportId: string,
    sortOrder: number,
  ): void {
    const duplicate = this.listRisksByReport(reportId).some(
      (risk) => risk.sortOrder === sortOrder,
    );

    if (duplicate) {
      throw new Error(`Meeting report risk sort order already exists`);
    }
  }

  private nextReportNextAgendaSortOrder(reportId: string): number {
    const sortOrders = this.listNextAgendasByReport(reportId).map(
      (nextAgenda) => nextAgenda.sortOrder,
    );

    return sortOrders.length === 0 ? 0 : Math.max(...sortOrders) + 1;
  }

  private ensureNextAgendaSortOrderAvailable(
    reportId: string,
    sortOrder: number,
  ): void {
    const duplicate = this.listNextAgendasByReport(reportId).some(
      (nextAgenda) => nextAgenda.sortOrder === sortOrder,
    );

    if (duplicate) {
      throw new Error(`Meeting report next agenda sort order already exists`);
    }
  }
}
