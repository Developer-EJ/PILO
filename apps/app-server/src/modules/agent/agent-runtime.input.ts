import { BadRequestException } from "@nestjs/common";
import {
  AGENT_WORKFLOW_TYPES,
  AgentWorkflowType,
  DEFAULT_AGENT_WORKFLOW_VERSION,
} from "./agent-registry.types";
import {
  AgentContextRef,
  AgentOnboardingDraft,
  AgentOnboardingMessage,
} from "./agent-runtime.types";

export interface AgentRunCreateBody {
  workflowType: AgentWorkflowType;
  workflowVersion: string;
  input: Record<string, unknown>;
  contextRefs: AgentContextRef[];
}

export interface AgentChatMessageBody {
  message: string;
  workflowType: AgentWorkflowType;
  contextRefs: AgentContextRef[];
}

export interface ProjectPlanCreateBody {
  goal: string;
  targetUser: string;
  problem: string;
  duration: string;
  outputGoal: string;
  teamSize: number;
  experienceLevel: string;
  teamMembers: string[];
}

export interface AgentOnboardingTurnBody {
  messages: AgentOnboardingMessage[];
  draft: Partial<AgentOnboardingDraft>;
}

export function parseAgentRunCreateBody(
  body: unknown,
): AgentRunCreateBody {
  const record = asRecord(body);
  const workflowType = parseWorkflowType(record.workflowType);
  const input = isRecord(record.input)
    ? { ...record.input }
    : { message: optionalText(record.message) ?? "" };

  return {
    workflowType,
    workflowVersion:
      nonEmptyText(record.workflowVersion) ?? DEFAULT_AGENT_WORKFLOW_VERSION,
    input,
    contextRefs: parseContextRefs(record.contextRefs),
  };
}

export function parseAgentChatMessageBody(
  body: unknown,
): AgentChatMessageBody {
  const record = asRecord(body);
  const message = nonEmptyText(record.message);
  if (!message) {
    throw new BadRequestException("message is required");
  }

  return {
    message,
    workflowType: parseWorkflowType(
      record.workflowType ?? "task.draft.generate",
    ),
    contextRefs: parseContextRefs(record.contextRefs),
  };
}

export function parseProjectPlanCreateBody(
  body: unknown,
): ProjectPlanCreateBody {
  const record = asRecord(body);
  const goal = nonEmptyText(record.goal);
  if (!goal) {
    throw new BadRequestException("goal is required");
  }

  return {
    goal,
    targetUser:
      nonEmptyText(record.targetUser) ?? "초보 개발팀과 부트캠프 프로젝트 팀",
    problem:
      nonEmptyText(record.problem) ??
      "프로젝트 방향, 역할, 첫 작업이 여러 도구에 흩어져 있습니다.",
    duration: nonEmptyText(record.duration) ?? "4 weeks",
    outputGoal:
      nonEmptyText(record.outputGoal) ?? "시연 가능한 MVP와 발표 자료",
    teamSize: parsePositiveInteger(record.teamSize) ?? 5,
    experienceLevel: nonEmptyText(record.experienceLevel) ?? "beginner",
    teamMembers: parseTeamMembers(record.teamMembers),
  };
}

export function parseAgentOnboardingTurnBody(
  body: unknown,
): AgentOnboardingTurnBody {
  const record = asRecord(body);

  return {
    messages: parseOnboardingMessages(record.messages),
    draft: parseOnboardingDraft(record.draft),
  };
}

export function firstHeader(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseWorkflowType(value: unknown): AgentWorkflowType {
  if (
    typeof value === "string" &&
    (AGENT_WORKFLOW_TYPES as readonly string[]).includes(value)
  ) {
    return value as AgentWorkflowType;
  }

  throw new BadRequestException("workflowType is invalid");
}

function parseContextRefs(value: unknown): AgentContextRef[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new BadRequestException("contextRefs must be an array");
  }

  return value.map((item) => {
    const record = asRecord(item);
    const type = nonEmptyText(record.type);
    const id = nonEmptyText(record.id);
    if (!type || !id) {
      throw new BadRequestException("contextRefs require type and id");
    }
    return { type, id };
  });
}

function parseTeamMembers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => nonEmptyText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 12);
}

function parseOnboardingMessages(value: unknown): AgentOnboardingMessage[] {
  if (!Array.isArray(value)) return [];

  return value.slice(-20).map((item) => {
    const record = asRecord(item);
    const role = record.role === "assistant" ? "assistant" : "user";
    const body = optionalText(record.body) ?? optionalText(record.content) ?? "";
    const fieldKey = parseOnboardingFieldKey(record.fieldKey);

    return {
      role,
      body,
      ...(fieldKey ? { fieldKey } : {}),
    };
  });
}

function parseOnboardingDraft(value: unknown): Partial<AgentOnboardingDraft> {
  if (!isRecord(value)) return {};

  return {
    workspaceTitle: optionalText(value.workspaceTitle),
    goal: optionalText(value.goal),
    problem: optionalText(value.problem),
    targetUser: optionalText(value.targetUser),
    duration: optionalText(value.duration),
    teamSize: parsePositiveInteger(value.teamSize),
    experienceLevel: optionalText(value.experienceLevel),
    outputGoal: optionalText(value.outputGoal),
  };
}

function parseOnboardingFieldKey(value: unknown) {
  if (typeof value !== "string") return null;
  return [
    "workspaceTitle",
    "goal",
    "problem",
    "targetUser",
    "duration",
    "teamSize",
    "experienceLevel",
    "outputGoal",
  ].includes(value)
    ? (value as keyof AgentOnboardingDraft)
    : null;
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return parsed > 0 ? parsed : null;
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BadRequestException("request body must be an object");
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text ? text : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
