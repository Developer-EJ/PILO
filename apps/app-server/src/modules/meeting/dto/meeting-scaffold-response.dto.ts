import {
  MeetingActionItemReadModel,
  MeetingAgendaRecord,
  MeetingDecisionReadModel,
  MeetingMemoRecord,
  MeetingRecord,
  MeetingParticipantRecord,
  MeetingReportAiContext,
  MeetingReportCanvasEntityRef,
  MeetingReportDetail,
  MeetingReportNextAgendaReadModel,
  MeetingReportRiskReadModel,
  MeetingReportSummary,
  MeetingRepositoryMode,
  MeetingStatus,
  TranscriptSegmentRecord,
} from "../types/meeting.types";
import { TaskDraftResponse } from "../adapters/task-draft.adapter";

export interface MeetingScaffoldResponseDto {
  module: "meeting";
  repositoryMode: MeetingRepositoryMode;
  meetingStatusValues: readonly MeetingStatus[];
}

export interface CreateMeetingRequestDto {
  title?: unknown;
  purpose?: unknown;
  canvasBoardId?: unknown;
}

export interface UpdateMeetingStatusRequestDto {
  status?: unknown;
}

export interface CreateMeetingParticipantRequestDto {
  memberId?: unknown;
  role?: unknown;
}

export interface CreateMeetingAgendaRequestDto {
  title?: unknown;
  sortOrder?: unknown;
}

export interface UpdateMeetingAgendaStatusRequestDto {
  status?: unknown;
}

export interface ReorderMeetingAgendaRequestDto {
  sortOrder?: unknown;
}

export interface CreateMeetingMemoRequestDto {
  authorMemberId?: unknown;
  body?: unknown;
}

export interface CreateTranscriptSegmentRequestDto {
  speakerMemberId?: unknown;
  source?: unknown;
  body?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
}

export interface CreateMeetingDecisionRequestDto {
  content?: unknown;
  status?: unknown;
  linkedTaskId?: unknown;
}

export interface CreateMeetingReportRiskRequestDto {
  content?: unknown;
  severity?: unknown;
  sortOrder?: unknown;
}

export interface CreateMeetingReportNextAgendaRequestDto {
  title?: unknown;
  sortOrder?: unknown;
}

export interface CreateMeetingActionItemRequestDto {
  title?: unknown;
  description?: unknown;
  assigneeSuggestionMemberId?: unknown;
  dueDateSuggestion?: unknown;
}

export interface ConvertMeetingActionItemRequestDto {
  convertedTaskId?: unknown;
}

export interface MeetingActionItemTaskDraftResponseDto {
  actionItem: MeetingActionItemResponseDto;
  taskDraft: TaskDraftResponse;
}

export type MeetingResponseDto = MeetingRecord;

export type MeetingParticipantResponseDto = MeetingParticipantRecord;

export type MeetingAgendaResponseDto = MeetingAgendaRecord;

export type MeetingMemoResponseDto = MeetingMemoRecord;

export type TranscriptSegmentResponseDto = TranscriptSegmentRecord;

export type MeetingReportResponseDto = MeetingReportDetail;

export type MeetingReportAiContextDto = MeetingReportAiContext;

export type MeetingReportSummaryDto = MeetingReportSummary;

export type MeetingReportCanvasEntityRefDto = MeetingReportCanvasEntityRef;

export type MeetingDecisionResponseDto = MeetingDecisionReadModel;

export type MeetingReportRiskResponseDto = MeetingReportRiskReadModel;

export type MeetingReportNextAgendaResponseDto =
  MeetingReportNextAgendaReadModel;

export type MeetingActionItemResponseDto = MeetingActionItemReadModel;
