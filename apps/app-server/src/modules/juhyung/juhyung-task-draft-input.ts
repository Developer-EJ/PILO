import { BadRequestException } from "@nestjs/common";
import { CreateTaskDraftInput } from "./juhyung.repository";

const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export interface CreateTaskDraftBody {
  workspaceId?: unknown;
  sourceType?: unknown;
  sourceId?: unknown;
  title?: unknown;
  description?: unknown;
  assigneeMemberId?: unknown;
  priority?: unknown;
  dueDate?: unknown;
}

export function parseCreateTaskDraftInput(
  workspaceId: string,
  body: CreateTaskDraftBody,
): CreateTaskDraftInput {
  assertBody(body, "Task draft body is required");

  const bodyWorkspaceId = parseRequiredString(body.workspaceId, "workspaceId");
  if (bodyWorkspaceId !== workspaceId) {
    throw new BadRequestException("workspaceId must match path workspaceId");
  }

  const sourceType = parseNullableString(body.sourceType, "sourceType");
  const sourceId = parseNullableString(body.sourceId, "sourceId");
  if (Boolean(sourceType) !== Boolean(sourceId)) {
    throw new BadRequestException("sourceType and sourceId must be paired");
  }

  return {
    workspaceId,
    sourceType,
    sourceId,
    title: parseRequiredString(body.title, "title"),
    description: parseNullableString(body.description, "description"),
    assigneeMemberId: parseNullableString(
      body.assigneeMemberId,
      "assigneeMemberId",
    ),
    priority: parseEnum(body.priority ?? "medium", TASK_PRIORITIES, "priority"),
    dueDate: parseNullableDate(body.dueDate, "dueDate"),
  };
}

function assertBody(value: unknown, message: string): asserts value is object {
  if (!value || typeof value !== "object") {
    throw new BadRequestException(message);
  }
}

function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

function parseNullableString(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} must be a string`);
  }
  return value.trim();
}

function parseEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new BadRequestException(`${field} is invalid`);
  }
  return value as T[number];
}

function parseNullableDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`${field} must be a valid date`);
  }
  return parsed;
}
