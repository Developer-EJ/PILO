import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
} from "@nestjs/common";
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
  ) {}

  @Post("workspaces/:workspaceId/agent-runs")
  createRun(
    @Param("workspaceId") workspaceId: string,
    @Body() body: AgentRunCreateRequest | null = {},
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    const input = body ?? {};
    return this.toPublicRun(
      this.agentRuntimeService.createLocalRun({
        workspaceId,
        actorMemberId: this.requiredMemberId(memberId),
        workflowType: input.workflowType,
        workflowVersion: input.workflowVersion,
        input: input.input,
        contextRefs: input.contextRefs,
      } satisfies CreateLocalAgentRunInput),
    );
  }

  @Get("agent-runs/:runId")
  getRun(
    @Param("runId") runId: string,
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    this.requiredMemberId(memberId);
    return this.toPublicRun(this.agentRuntimeService.getRun(runId));
  }

  @Post("agent-actions/:actionId/approve")
  @HttpCode(200)
  approveAction(
    @Param("actionId") actionId: string,
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.toPublicAction(
      this.agentRuntimeService.confirmAction(
        actionId,
        this.requiredMemberId(memberId),
      ),
    );
  }

  @Post("agent-actions/:actionId/reject")
  @HttpCode(200)
  rejectAction(
    @Param("actionId") actionId: string,
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    this.requiredMemberId(memberId);
    return this.toPublicAction(this.agentRuntimeService.rejectAction(actionId));
  }

  @Post("agent-actions/:actionId/execute")
  @HttpCode(200)
  async executeAction(
    @Param("actionId") actionId: string,
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    this.requiredMemberId(memberId);
    return this.toPublicAction(
      await this.agentRuntimeService.executeConfirmedAction(
        actionId,
        this.ownerActionExecutor,
      ),
    );
  }

  private requiredMemberId(value?: string | string[]) {
    const memberId = Array.isArray(value) ? value[0] : value;
    if (!memberId || !memberId.trim()) {
      throw new BadRequestException(
        "x-member-id header is required until the Agent Runtime guard lands",
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
