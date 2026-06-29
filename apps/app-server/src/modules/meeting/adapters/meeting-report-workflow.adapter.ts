export const MEETING_REPORT_WORKFLOW_CLIENT = Symbol(
  "MEETING_REPORT_WORKFLOW_CLIENT",
);

export interface MeetingReportWorkflowInput {
  meetingTitle: string;
  memoBodies: readonly string[];
  transcriptBodies: readonly string[];
}

export interface MeetingReportWorkflowOutput {
  summary: string;
}

export interface MeetingReportWorkflowClient {
  generateReport(
    input: MeetingReportWorkflowInput,
  ): MeetingReportWorkflowOutput;
}
