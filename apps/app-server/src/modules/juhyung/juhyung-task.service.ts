import { Injectable } from "@nestjs/common";
import {
  WorkspaceAccessPublicService,
  WorkspaceActor,
} from "../workspace/public/workspace-access-public.service";
import { CreateTaskInput, JuhyungRepository } from "./juhyung.repository";

@Injectable()
export class JuhyungTaskService {
  constructor(
    private readonly repository: JuhyungRepository,
    private readonly workspaceAccess: WorkspaceAccessPublicService,
  ) {}

  async createTask(input: CreateTaskInput, actor?: WorkspaceActor) {
    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      input.workspaceId,
      actor,
    );
    await this.requireAssignee(input);

    return this.repository.createTask(input, currentMember.id);
  }

  private async requireAssignee(input: CreateTaskInput) {
    if (!input.assigneeMemberId) {
      return;
    }

    await this.workspaceAccess.requireWorkspaceMemberById(
      input.workspaceId,
      input.assigneeMemberId,
    );
  }
}
