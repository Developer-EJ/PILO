import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  WorkspaceMemberGuard,
  type WorkspaceMemberGuardRequest,
} from "../workspace/workspace-member.guard";
import { DailyBriefingService } from "./daily-briefing.service";

@Controller("workspaces/:workspaceId/daily-briefing")
@UseGuards(WorkspaceMemberGuard)
export class DailyBriefingController {
  constructor(private readonly dailyBriefingService: DailyBriefingService) {}

  @Get()
  getDailyBriefing(
    @Param("workspaceId") workspaceId: string,
    @Req() request: WorkspaceMemberGuardRequest,
  ) {
    return this.dailyBriefingService.getDailyBriefing({
      workspaceId,
      currentUser: requireCurrentUser(request),
    });
  }

  @Post("regenerate")
  regenerateDailyBriefing(
    @Param("workspaceId") workspaceId: string,
    @Req() request: WorkspaceMemberGuardRequest,
  ) {
    return this.dailyBriefingService.regenerateDailyBriefing({
      workspaceId,
      currentUser: requireCurrentUser(request),
      regenerate: true,
    });
  }
}

function requireCurrentUser(request: WorkspaceMemberGuardRequest) {
  if (!request.currentUser) {
    throw new UnauthorizedException();
  }

  return request.currentUser;
}
