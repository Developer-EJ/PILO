import { MeetingReportSummary } from "../../../common/contracts/public-contracts";

export interface ReportPublicContract {
  listMeetingReportSummaries(
    workspaceId: string,
  ): Promise<MeetingReportSummary[]>;
}
