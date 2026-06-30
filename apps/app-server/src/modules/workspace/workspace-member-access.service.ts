import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import {
  LOCAL_MVP_MEMBER_ID,
  LOCAL_MVP_USER_ID,
  shouldExposeLocalMvpWorkspace,
} from "./local-mvp-workspace";

export interface CurrentActor {
  userId?: string;
  memberId?: string;
}

@Injectable()
export class WorkspaceMemberAccessService {
  constructor(private readonly database: DatabaseService) {}

  async requireWorkspaceMember(workspaceId: string, actor?: CurrentActor) {
    if (!actor?.userId && !actor?.memberId) {
      throw new UnauthorizedException("Authentication is required");
    }

    if (shouldExposeLocalMvpWorkspace()) {
      return {
        id: actor.memberId ?? LOCAL_MVP_MEMBER_ID,
        workspaceId,
        userId: actor.userId ?? LOCAL_MVP_USER_ID,
        role: "owner",
      };
    }

    const { userId, memberId } = actor;
    const where =
      userId && memberId
        ? {
            id: memberId,
            workspaceId,
            userId,
          }
        : memberId
          ? {
              id: memberId,
              workspaceId,
            }
          : {
              workspaceId,
              userId,
            };

    const member = await this.database.workspaceMember.findFirst({
      where,
    });

    if (!member) {
      throw new ForbiddenException("Workspace membership is required");
    }

    return member;
  }
}
