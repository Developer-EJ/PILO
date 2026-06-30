import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

const LOCAL_MVP_USER_ID = "11111111-1111-4111-8111-111111111111";
const LOCAL_MVP_MEMBER_ID = "33333333-3333-4333-8333-333333333331";

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

    if (process.env.PILO_SKIP_DATABASE_CONNECT === "true") {
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
