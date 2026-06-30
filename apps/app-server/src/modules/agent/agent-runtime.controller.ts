import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
} from "@nestjs/common";
import {
  WorkspaceAccessPublicService,
  type WorkspaceMemberAccessResult,
} from "../workspace/public/workspace-access-public.service";
import { AGENT_OWNER_ACTION_EXECUTOR } from "./agent-owner-action.executor";
import { AgentRuntimeService } from "./agent-runtime.service";
import {
  type AgentAction,
  type AgentOwnerActionExecutor,
  type AgentRunDetail,
  type CreateLocalAgentRunInput,
} from "./agent-runtime.types";

interface AgentRunCreateRequest {
  workflowType?: unknown;
  workflowVersion?: unknown;
  input?: unknown;
  contextRefs?: unknown;
}

@Controller()
export class AgentRuntimeController {
  constructor(
    private readonly agentRuntimeService: AgentRuntimeService,
    @Inject(AGENT_OWNER_ACTION_EXECUTOR)
    private readonly ownerActionExecutor: AgentOwnerActionExecutor,
    private readonly workspaceAccess: WorkspaceAccessPublicService,
  ) {}

  @Post("workspaces/:workspaceId/agent-runs")
  async createRun(
    @Param("workspaceId") workspaceId: string,
    @Body() body: AgentRunCreateRequest | null = {},
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    const input = body ?? {};
    const currentMember = await this.requireWorkspaceMember(
      workspaceId,
      memberId,
    );
    return this.toPublicRun(
      this.agentRuntimeService.createLocalRun({
        workspaceId,
        actorMemberId: currentMember.id,
        workflowType: input.workflowType,
        workflowVersion: input.workflowVersion,
        input: input.input,
        contextRefs: input.contextRefs,
      } satisfies CreateLocalAgentRunInput),
    );
  }

  @Get("agent-runs/:runId")
  async getRun(
    @Param("runId") runId: string,
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    const requestedMemberId = this.requiredMemberId(memberId);
    const run = this.agentRuntimeService.getRun(runId);
    await this.requireWorkspaceMemberById(run.workspaceId, requestedMemberId);
    return this.toPublicRun(run);
  }

  @Post("agent-actions/:actionId/approve")
  @HttpCode(200)
  async approveAction(
    @Param("actionId") actionId: string,
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    const requestedMemberId = this.requiredMemberId(memberId);
    const context =
      this.agentRuntimeService.getActionAuthorizationContext(actionId);
    const currentMember = await this.requireWorkspaceMember(
      context.workspaceId,
      requestedMemberId,
    );
    return this.toPublicAction(
      this.agentRuntimeService.confirmAction(actionId, currentMember.id),
    );
  }

  @Post("agent-actions/:actionId/reject")
  @HttpCode(200)
  async rejectAction(
    @Param("actionId") actionId: string,
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    const requestedMemberId = this.requiredMemberId(memberId);
    const context =
      this.agentRuntimeService.getActionAuthorizationContext(actionId);
    await this.requireWorkspaceMemberById(
      context.workspaceId,
      requestedMemberId,
    );
    return this.toPublicAction(this.agentRuntimeService.rejectAction(actionId));
  }

  @Post("agent-actions/:actionId/execute")
  @HttpCode(200)
  async executeAction(
    @Param("actionId") actionId: string,
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    const requestedMemberId = this.requiredMemberId(memberId);
    const context =
      this.agentRuntimeService.getActionAuthorizationContext(actionId);
    const currentMember = await this.requireWorkspaceMember(
      context.workspaceId,
      requestedMemberId,
    );
    if (
      context.confirmedByMemberId &&
      context.confirmedByMemberId !== currentMember.id
    ) {
      throw new ForbiddenException(
        "Agent action execute must be requested by the confirming workspace member",
      );
    }
    return this.toPublicAction(
      await this.agentRuntimeService.executeConfirmedAction(
        actionId,
        this.ownerActionExecutor,
      ),
    );
  }

  private async requireWorkspaceMember(
    workspaceId: string,
    value?: string | string[],
  ): Promise<WorkspaceMemberAccessResult> {
    const memberId = this.requiredMemberId(value);
    return this.requireWorkspaceMemberById(workspaceId, memberId);
  }

  private async requireWorkspaceMemberById(
    workspaceId: string,
    memberId: string,
  ): Promise<WorkspaceMemberAccessResult> {
    return this.workspaceAccess.requireWorkspaceMember(workspaceId, {
      memberId,
    });
  }

  private requiredMemberId(value?: string | string[]) {
    const memberId = Array.isArray(value) ? value[0] : value;
    if (!memberId || !memberId.trim()) {
      throw new BadRequestException(
        "x-member-id header is required for the Agent Runtime temporary mock member boundary. Temporary mock member boundary. Not production auth.",
      );
    }
    return memberId.trim();
  }

  private toPublicRun(run: AgentRunDetail): AgentRunDetail {
    return redactSensitiveValues(run) as AgentRunDetail;
  }

  private toPublicAction(action: AgentAction): AgentAction {
    return redactSensitiveValues(action) as AgentAction;
  }
}

function redactSensitiveValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValues(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isSensitiveKey(key) ? "[redacted]" : redactSensitiveValues(entry),
    ]),
  );
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("privatekey") ||
    normalized.includes("private_key") ||
    normalized.includes("password")
  );
}
