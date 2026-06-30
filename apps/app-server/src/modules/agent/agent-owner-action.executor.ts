import { BadRequestException, Injectable } from "@nestjs/common";
import {
  TASK_PRIORITIES,
  type AgentAction,
  type AgentOwnerActionExecution,
  type TaskPriority,
} from "./agent-runtime.types";

const TASK_DRAFT_SOURCE_TYPES = [
  "meeting_action_item",
  "planning_feature",
  "agent_recommendation",
  "manual",
] as const;

@Injectable()
export class MockAgentOwnerActionExecutor {
  async execute(action: AgentAction): Promise<AgentOwnerActionExecution> {
    if (action.type !== "task.create.draft") {
      return {
        owner: ownerForActionType(action.type),
        operation: action.type,
        status: "failed",
        targetEntityId: null,
        errorMessage: "Only task.create.draft execution is supported",
        detail: null,
      };
    }

    const payload = parseTaskCreateDraftPayload(action.payload);
    const now = action.confirmedAt ?? new Date().toISOString();
    const taskDraft = {
      id: action.id,
      workspaceId: payload.workspaceId,
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
      title: payload.title,
      description: payload.description,
      assigneeMemberId: payload.assigneeMemberId,
      priority: payload.priority,
      dueDate: payload.dueDate,
      status: "draft",
      taskId: null,
      createdAt: now,
      updatedAt: now,
    };

    return {
      owner: "task",
      operation: "task.create.draft",
      status: "succeeded",
      targetEntityId: taskDraft.id,
      errorMessage: null,
      detail: {
        taskDraft,
      },
    };
  }
}

interface TaskCreateDraftPayload {
  workspaceId: string;
  sourceType: string | null;
  sourceId: string | null;
  title: string;
  description: string | null;
  assigneeMemberId: string | null;
  priority: TaskPriority;
  dueDate: string | null;
}

function parseTaskCreateDraftPayload(
  payload: Record<string, unknown>,
): TaskCreateDraftPayload {
  const workspaceId = readRequiredString(payload.workspaceId, "workspaceId");
  const title = readRequiredString(payload.title, "title");
  const sourceType = readNullableString(payload.sourceType, "sourceType");
  const sourceId = readNullableString(payload.sourceId, "sourceId");
  if ((sourceType && !sourceId) || (!sourceType && sourceId)) {
    throw new BadRequestException("sourceType and sourceId must be paired");
  }
  if (
    sourceType &&
    !(TASK_DRAFT_SOURCE_TYPES as readonly string[]).includes(sourceType)
  ) {
    throw new BadRequestException("sourceType is invalid");
  }

  const priority = readNullableString(payload.priority, "priority") ?? "medium";
  if (!(TASK_PRIORITIES as readonly string[]).includes(priority)) {
    throw new BadRequestException("priority is invalid");
  }

  return {
    workspaceId,
    sourceType,
    sourceId,
    title,
    description: readNullableString(payload.description, "description"),
    assigneeMemberId: readNullableString(
      payload.assigneeMemberId,
      "assigneeMemberId",
    ),
    priority: priority as TaskPriority,
    dueDate: readNullableString(payload.dueDate, "dueDate"),
  };
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  return value;
}

function readNullableString(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new BadRequestException(`${field} must be a string or null`);
  }
  return value;
}

function ownerForActionType(type: AgentAction["type"]) {
  if (type.startsWith("task.") || type.startsWith("github.")) {
    return "task";
  }
  if (type.startsWith("meeting.")) {
    return "meeting";
  }
  if (type.startsWith("review.")) {
    return "review";
  }
  if (type.startsWith("planning.")) {
    return "planning";
  }
  return "agent_runtime";
}
