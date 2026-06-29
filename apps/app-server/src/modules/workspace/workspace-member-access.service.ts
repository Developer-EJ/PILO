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

  async listWorkspaceMembersByIds(workspaceId: string, memberIds: string[]) {
    const uniqueMemberIds = [...new Set(memberIds)];
    if (uniqueMemberIds.length === 0) {
      return [];
    }

    return this.database.workspaceMember.findMany({
      where: {
        workspaceId,
        id: {
          in: uniqueMemberIds,
        },
      },
    });
  }
}
