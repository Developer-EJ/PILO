export type MeetingReportStatus =
  | "PROCESSING"
  | "QUEUED"
  | "TRANSCRIBING"
  | "SUMMARIZING"
  | "COMPLETED"
  | "FAILED";

export type MeetingReportFailedStep = "RECORDING" | "STT" | "LLM";

export type MeetingReportActionItemExtractionStatus =
  | "PENDING"
  | "PUBLISHING"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export interface MeetingReportActionItemExtractionPayload {
  status: MeetingReportActionItemExtractionStatus;
  errorMessage: string | null;
}

export interface MeetingReportParticipantSummaryPayload {
  totalCount: number;
  participants: Array<{
    userId: string;
    name: string | null;
    avatarUrl: string | null;
  }>;
  hasMore: boolean;
}

export interface MeetingReportSummaryPayload {
  id: string;
  meetingId: string;
  recordingId: string;
  status: MeetingReportStatus;
  failedStep: MeetingReportFailedStep | null;
  errorMessage: string | null;
  title: string | null;
  summary: string | null;
  discussionPoints: string | null;
  decisions: string | null;
  contentVersion: number;
  contentEditedByUserId: string | null;
  contentEditedAt: string | null;
  actionItemCandidates: unknown[];
  actionItemExtraction?: MeetingReportActionItemExtractionPayload;
  retryCount: number;
  participantSummary: MeetingReportParticipantSummaryPayload;
  canDelete?: boolean;
  canEdit?: boolean;
  createdAt: string;
  updatedAt: string;
}
