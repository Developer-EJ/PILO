import { MeetingReportSummary } from "../../../common/contracts/public-contracts";

export interface MeetingPublicContract {
  listMeetingReportSummaries(
    workspaceId: string,
  ): Promise<MeetingReportSummary[]>;
}
