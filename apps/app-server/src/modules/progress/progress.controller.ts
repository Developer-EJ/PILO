import { Controller, Get, Param } from "@nestjs/common";
import { ContractResponseSchema } from "../../common/validation/contract-validation.decorators";
import { ProgressService } from "./progress.service";

@Controller("workspaces/:workspaceId/progress")
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get("summary")
  @ContractResponseSchema("ProgressSummary")
  getProgressSummary(@Param("workspaceId") workspaceId: string) {
    return this.progressService.getProgressSummary(workspaceId);
  }
}
