import type { MeetingReportSummary } from "../types/public-contracts";

export interface MeetingApiContract {
  listMeetingReportSummaries(
    workspaceId: string,
  ): Promise<MeetingReportSummary[]>;
}
