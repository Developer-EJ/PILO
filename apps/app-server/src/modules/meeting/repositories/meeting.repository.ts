import {
  CreateMeetingInput,
  CreateMeetingAgendaInput,
  CreateMeetingParticipantInput,
  MeetingAgendaRecord,
  MeetingRecord,
  MeetingParticipantRecord,
  MeetingRepositoryMode,
  MeetingStatus,
  UpdateMeetingAgendaInput,
  UpdateMeetingInput,
} from "../types/meeting.types";

export const MEETING_REPOSITORY = Symbol("MEETING_REPOSITORY");

export interface MeetingRepository {
  readonly mode: MeetingRepositoryMode;

  listMeetingStatusValues(): readonly MeetingStatus[];

  createMeeting(input: CreateMeetingInput): MeetingRecord;

  listMeetingsByWorkspace(workspaceId: string): MeetingRecord[];

  findMeetingById(meetingId: string): MeetingRecord | null;

  updateMeeting(meetingId: string, input: UpdateMeetingInput): MeetingRecord;

  addParticipant(
    input: CreateMeetingParticipantInput,
  ): MeetingParticipantRecord;

  listParticipantsByMeeting(meetingId: string): MeetingParticipantRecord[];

  findParticipantById(participantId: string): MeetingParticipantRecord | null;

  leaveParticipant(
    participantId: string,
    leftAt: string,
  ): MeetingParticipantRecord;

  createAgenda(input: CreateMeetingAgendaInput): MeetingAgendaRecord;

  listAgendasByMeeting(meetingId: string): MeetingAgendaRecord[];

  findAgendaById(agendaId: string): MeetingAgendaRecord | null;

  updateAgenda(
    agendaId: string,
    input: UpdateMeetingAgendaInput,
  ): MeetingAgendaRecord;
}
