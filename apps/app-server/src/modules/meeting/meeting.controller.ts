import { Controller, Get, Param } from "@nestjs/common";
import { ContractResponseSchema } from "../../common/validation/contract-validation.decorators";
import { MeetingService } from "./meeting.service";

@Controller("workspaces/:workspaceId/meetings")
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Get("reports/summary")
  @ContractResponseSchema({
    schemaName: "MeetingReportSummary",
    isArray: true,
  })
  listMeetingReportSummaries(@Param("workspaceId") workspaceId: string) {
    return this.meetingService.listMeetingReportSummaries(workspaceId);
  }
}
