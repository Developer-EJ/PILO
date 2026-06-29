export const MEETING_REPORT_WORKFLOW_CLIENT = Symbol(
  "MEETING_REPORT_WORKFLOW_CLIENT",
);

export interface MeetingReportWorkflowInput {
  meetingTitle: string;
  memoBodies: readonly string[];
  transcriptBodies: readonly string[];
}

export interface MeetingReportWorkflowDecisionOutput {
  content: string;
  status?: "decided" | "pending" | "reopened";
  linkedTaskId?: string | null;
}

export interface MeetingReportWorkflowRiskOutput {
  content: string;
  severity?: "low" | "medium" | "high" | "critical";
  sortOrder?: number;
}

export interface MeetingReportWorkflowNextAgendaOutput {
  title: string;
  sortOrder?: number;
}

export interface MeetingReportWorkflowActionItemOutput {
  title: string;
  description?: string | null;
  assigneeSuggestionMemberId?: string | null;
  dueDateSuggestion?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
}

export interface MeetingReportWorkflowTrace {
  stepName: string;
  message: string;
  metadata?: Record<string, boolean | number | string | null>;
}

export interface MeetingReportWorkflowError {
  code: string;
  message: string;
}

export interface MeetingReportWorkflowOutput {
  summary: string;
  decisions: MeetingReportWorkflowDecisionOutput[];
  risks: MeetingReportWorkflowRiskOutput[];
  nextAgendas: MeetingReportWorkflowNextAgendaOutput[];
  actionItems: MeetingReportWorkflowActionItemOutput[];
  trace: MeetingReportWorkflowTrace[];
  error: MeetingReportWorkflowError | null;
}

export interface MeetingReportWorkflowClient {
  generateReport(
    input: MeetingReportWorkflowInput,
  ): MeetingReportWorkflowOutput;
}
