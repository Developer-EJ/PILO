import { Injectable } from "@nestjs/common";
import { WorkspaceService } from "./workspace.service";
import type {
  ResolveCurrentMemberInput,
  WorkspaceRoleRequirement,
} from "./workspace.service";

@Injectable()
export class WorkspaceCurrentMemberAdapter {
  constructor(private readonly workspaceService: WorkspaceService) {}

  resolveCurrentMemberContext(input: ResolveCurrentMemberInput) {
    return this.workspaceService.resolveCurrentMemberContext(input);
  }

  requireCurrentMember(
    input: ResolveCurrentMemberInput,
    requirement: WorkspaceRoleRequirement = {},
  ) {
    return this.workspaceService.requireCurrentMemberContext(
      input,
      requirement,
    );
  }
}
