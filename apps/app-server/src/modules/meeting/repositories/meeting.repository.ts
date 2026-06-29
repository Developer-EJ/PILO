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

  createMemo(input: CreateMeetingMemoInput): MeetingMemoRecord;

  listMemosByMeeting(meetingId: string): MeetingMemoRecord[];

  createTranscriptSegment(
    input: CreateTranscriptSegmentInput,
  ): TranscriptSegmentRecord;

  listTranscriptSegmentsByMeeting(meetingId: string): TranscriptSegmentRecord[];

  createReport(input: CreateMeetingReportInput): MeetingReportRecord;

  findReportById(reportId: string): MeetingReportRecord | null;

  findReportByMeetingId(meetingId: string): MeetingReportRecord | null;

  listReports(): MeetingReportRecord[];

  createDecision(input: CreateMeetingDecisionInput): MeetingDecisionRecord;

  listDecisionsByReport(reportId: string): MeetingDecisionRecord[];

  createRisk(input: CreateMeetingReportRiskInput): MeetingReportRiskRecord;

  listRisksByReport(reportId: string): MeetingReportRiskRecord[];

  createNextAgenda(
    input: CreateMeetingReportNextAgendaInput,
  ): MeetingReportNextAgendaRecord;

  listNextAgendasByReport(reportId: string): MeetingReportNextAgendaRecord[];

  createActionItem(
    input: CreateMeetingActionItemInput,
  ): MeetingActionItemRecord;

  listActionItemsByReport(reportId: string): MeetingActionItemRecord[];

  findActionItemById(actionItemId: string): MeetingActionItemRecord | null;

  updateActionItem(
    actionItemId: string,
    input: UpdateMeetingActionItemInput,
  ): MeetingActionItemRecord;
}
