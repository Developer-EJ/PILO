import { Injectable } from "@nestjs/common";
import {
  MeetingReportSummary,
  NotImplementedError,
} from "../../common/contracts/public-contracts";
import { ReportPublicContract } from "./public/report-public.contract";

@Injectable()
export class ReportService implements ReportPublicContract {
  listMeetingReportSummaries(
    workspaceId: string,
  ): Promise<MeetingReportSummary[]> {
    void workspaceId;
    throw new NotImplementedError(
      "ReportPublicContract.listMeetingReportSummaries",
    );
  }
}
