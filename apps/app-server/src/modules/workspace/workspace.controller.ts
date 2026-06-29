import { Controller, Get, Param } from "@nestjs/common";
import { ContractResponseSchema } from "../../common/validation/contract-validation.decorators";
import { WorkspaceService } from "./workspace.service";

@Controller("workspaces")
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @ContractResponseSchema({ schemaName: "WorkspaceSummary", isArray: true })
  listWorkspaceSummaries() {
    return this.workspaceService.listWorkspaceSummaries();
  }

  @Get(":workspaceId/members")
  @ContractResponseSchema({
    schemaName: "WorkspaceMemberSummary",
    isArray: true,
  })
  listWorkspaceMembers(@Param("workspaceId") workspaceId: string) {
    return this.workspaceService.listWorkspaceMembers(workspaceId);
  }
}
