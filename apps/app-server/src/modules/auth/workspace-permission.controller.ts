import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import {
  CurrentMember,
  CurrentMemberContext,
} from "../../common/auth/current-member.decorator";
import { WorkspacePermissionResolveRequest } from "../../common/contracts/public-contracts";
import {
  ContractBodySchema,
  ContractResponseSchema,
} from "../../common/validation/contract-validation.decorators";
import { AuthService } from "./auth.service";

@Controller("workspaces/:workspaceId/permissions")
export class WorkspacePermissionController {
  constructor(private readonly authService: AuthService) {}

  @Post("resolve")
  @HttpCode(200)
  @ContractBodySchema("WorkspacePermissionResolveRequest")
  @ContractResponseSchema("WorkspacePermissionDecision")
  resolveWorkspacePermission(
    @Param("workspaceId") workspaceId: string,
    @CurrentMember() currentMember: CurrentMemberContext,
    @Body() request: WorkspacePermissionResolveRequest,
  ) {
    return this.authService.resolveWorkspacePermission(
      workspaceId,
      currentMember.memberId,
      request,
    );
  }
}
