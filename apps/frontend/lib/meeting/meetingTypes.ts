export type MeetingStatus =
  | "scheduled"
  | "in_progress"
  | "ended"
  | "report_generated";

export type MeetingAgendaStatus = "open" | "done" | "skipped";

export type TranscriptSource = "text" | "stt";

export type MeetingDecisionStatus = "decided" | "pending" | "reopened";

export type MeetingRiskSeverity = "low" | "medium" | "high" | "critical";

export type MeetingActionItemStatus =
  | "draft"
  | "approved"
  | "converted"
  | "rejected";

export type VoiceRoomStatus = "active" | "inactive" | "archived";

export type VoiceSessionRecordingStatus =
  | "not_recording"
  | "recording"
  | "processing"
  | "completed"
  | "failed";

export type MeetingRecord = {
  id: string;
  workspaceId: string;
  canvasBoardId: string | null;
  title: string;
  purpose: string | null;
  status: MeetingStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdByMemberId: string;
  createdAt: string;
  updatedAt: string;
};

export type MeetingParticipant = {
  id: string;
  meetingId: string;
  memberId: string;
  role: string | null;
  joinedAt: string;
  leftAt: string | null;
};

export type MeetingAgenda = {
  id: string;
  meetingId: string;
  title: string;
  status: MeetingAgendaStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MeetingMemo = {
  id: string;
  meetingId: string;
  authorMemberId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type TranscriptSegment = {
  id: string;
  meetingId: string;
  speakerMemberId: string | null;
  source: TranscriptSource;
  body: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

export type MeetingReportSummary = {
  id: string;
  meetingId: string;
  workspaceId: string;
  title: string;
  summary: string;
  decisionCount: number;
  actionItemCount: number;
  riskCount: number;
  createdAt: string;
};

export type MeetingDecision = {
  id: string;
  reportId: string;
  title: string;
  content: string;
  status: MeetingDecisionStatus;
  linkedTaskId: string | null;
  createdAt: string;
};

export type MeetingReportRisk = {
  id: string;
  reportId: string;
  content: string;
  severity: MeetingRiskSeverity;
  sortOrder: number;
  createdAt: string;
};

export type MeetingReportNextAgenda = {
  id: string;
  reportId: string;
  title: string;
  sortOrder: number;
  createdAt: string;
};

export type MeetingReportDetail = MeetingReportSummary & {
  decisions: MeetingDecision[];
  risks: MeetingReportRisk[];
  nextAgendas: MeetingReportNextAgenda[];
};

export type MeetingActionItem = {
  id: string;
  reportId: string;
  title: string;
  description: string | null;
  assigneeSuggestionMemberId: string | null;
  dueDateSuggestion: string | null;
  status: MeetingActionItemStatus;
  convertedTaskId: string | null;
};

export type TaskDraftResponse = {
  taskId?: string;
  payload?: {
    workspaceId: string;
    sourceType: "meeting_action_item";
    sourceId: string;
    title: string;
    description: string | null;
    assigneeMemberId: string | null;
    priority: "low" | "medium" | "high" | "urgent";
    dueDate: string | null;
  };
  mode?: "mock";
};

export type MeetingActionItemTaskDraftResponse = {
  actionItem: MeetingActionItem;
  taskDraft: TaskDraftResponse;
};

export type VoiceRoom = {
  id: string;
  workspaceId: string;
  meetingId: string | null;
  livekitRoomName: string | null;
  status: VoiceRoomStatus;
  createdAt: string;
  updatedAt: string;
};

export type VoiceSession = {
  id: string;
  voiceRoomId: string;
  meetingId: string | null;
  memberId: string | null;
  recordingStatus: VoiceSessionRecordingStatus;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
