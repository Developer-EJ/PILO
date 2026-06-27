import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

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

    const member = await this.database.workspaceMember.findFirst({
      where: actor.memberId
        ? {
            id: actor.memberId,
            workspaceId,
          }
        : {
            workspaceId,
            userId: actor.userId,
          },
    });

    if (!member) {
      throw new ForbiddenException("Workspace membership is required");
    }

    return member;
  }
}
