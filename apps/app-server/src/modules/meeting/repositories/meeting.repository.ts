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

export const MEETING_REPOSITORY = Symbol("MEETING_REPOSITORY");

type MaybePromise<T> = T | Promise<T>;

export interface MeetingRepository {
  readonly mode: MeetingRepositoryMode;

  listMeetingStatusValues(): readonly MeetingStatus[];

  createMeeting(input: CreateMeetingInput): MaybePromise<MeetingRecord>;

  listMeetingsByWorkspace(
    workspaceId: string,
  ): MaybePromise<MeetingRecord[]>;

  findMeetingById(meetingId: string): MaybePromise<MeetingRecord | null>;

  updateMeeting(
    meetingId: string,
    input: UpdateMeetingInput,
  ): MaybePromise<MeetingRecord>;

  addParticipant(
    input: CreateMeetingParticipantInput,
  ): MaybePromise<MeetingParticipantRecord>;

  listParticipantsByMeeting(
    meetingId: string,
  ): MaybePromise<MeetingParticipantRecord[]>;

  findParticipantById(
    participantId: string,
  ): MaybePromise<MeetingParticipantRecord | null>;

  leaveParticipant(
    participantId: string,
    leftAt: string,
  ): MaybePromise<MeetingParticipantRecord>;

  createAgenda(
    input: CreateMeetingAgendaInput,
  ): MaybePromise<MeetingAgendaRecord>;

  listAgendasByMeeting(
    meetingId: string,
  ): MaybePromise<MeetingAgendaRecord[]>;

  findAgendaById(
    agendaId: string,
  ): MaybePromise<MeetingAgendaRecord | null>;

  updateAgenda(
    agendaId: string,
    input: UpdateMeetingAgendaInput,
  ): MaybePromise<MeetingAgendaRecord>;

  createMemo(input: CreateMeetingMemoInput): MaybePromise<MeetingMemoRecord>;

  listMemosByMeeting(meetingId: string): MaybePromise<MeetingMemoRecord[]>;

  createTranscriptSegment(
    input: CreateTranscriptSegmentInput,
  ): MaybePromise<TranscriptSegmentRecord>;

  listTranscriptSegmentsByMeeting(
    meetingId: string,
  ): MaybePromise<TranscriptSegmentRecord[]>;

  createReport(
    input: CreateMeetingReportInput,
  ): MaybePromise<MeetingReportRecord>;

  findReportById(reportId: string): MaybePromise<MeetingReportRecord | null>;

  findReportByMeetingId(
    meetingId: string,
  ): MaybePromise<MeetingReportRecord | null>;

  listReports(): MaybePromise<MeetingReportRecord[]>;

  createDecision(
    input: CreateMeetingDecisionInput,
  ): MaybePromise<MeetingDecisionRecord>;

  listDecisionsByReport(
    reportId: string,
  ): MaybePromise<MeetingDecisionRecord[]>;

  createRisk(
    input: CreateMeetingReportRiskInput,
  ): MaybePromise<MeetingReportRiskRecord>;

  listRisksByReport(
    reportId: string,
  ): MaybePromise<MeetingReportRiskRecord[]>;

  createNextAgenda(
    input: CreateMeetingReportNextAgendaInput,
  ): MaybePromise<MeetingReportNextAgendaRecord>;

  listNextAgendasByReport(
    reportId: string,
  ): MaybePromise<MeetingReportNextAgendaRecord[]>;

  createActionItem(
    input: CreateMeetingActionItemInput,
  ): MaybePromise<MeetingActionItemRecord>;

  listActionItemsByReport(
    reportId: string,
  ): MaybePromise<MeetingActionItemRecord[]>;

  findActionItemById(
    actionItemId: string,
  ): MaybePromise<MeetingActionItemRecord | null>;

  updateActionItem(
    actionItemId: string,
    input: UpdateMeetingActionItemInput,
  ): MaybePromise<MeetingActionItemRecord>;
}
