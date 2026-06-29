import { Injectable } from "@nestjs/common";
import {
  MeetingReportSummary,
  NotImplementedError,
} from "../../common/contracts/public-contracts";
import { MeetingPublicContract } from "./public/meeting-public.contract";

@Injectable()
export class MeetingService implements MeetingPublicContract {
  listMeetingReportSummaries(
    workspaceId: string,
  ): Promise<MeetingReportSummary[]> {
    void workspaceId;
    throw new NotImplementedError(
      "MeetingPublicContract.listMeetingReportSummaries",
    );
  }
}
