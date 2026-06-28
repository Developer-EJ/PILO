import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  CreateMeetingInput,
  CreateMeetingAgendaInput,
  CreateMeetingParticipantInput,
  MEETING_STATUS_VALUES,
  MeetingAgendaRecord,
  MeetingRecord,
  MeetingParticipantRecord,
  MeetingRepositoryMode,
  MeetingStatus,
  UpdateMeetingAgendaInput,
  UpdateMeetingInput,
} from "../types/meeting.types";
import { MeetingRepository } from "./meeting.repository";

@Injectable()
export class MockMeetingRepository implements MeetingRepository {
  readonly mode: MeetingRepositoryMode = "mock";

  private readonly meetings = new Map<string, MeetingRecord>();
  private readonly participants = new Map<string, MeetingParticipantRecord>();
  private readonly agendas = new Map<string, MeetingAgendaRecord>();

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
}
