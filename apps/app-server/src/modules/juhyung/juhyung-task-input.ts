import { BadRequestException } from "@nestjs/common";
import { TaskStatus } from "./juhyung-public.types";
import { CreateTaskInput, UpdateTaskInput } from "./juhyung.repository";

const TASK_STATUSES = [
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
] as const;
const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export interface CreateTaskBody {
  title?: unknown;
  description?: unknown;
  assigneeMemberId?: unknown;
  status?: unknown;
  priority?: unknown;
  dueDate?: unknown;
  milestoneId?: unknown;
}

export interface UpdateTaskBody {
  title?: unknown;
  description?: unknown;
  assigneeMemberId?: unknown;
  dueDate?: unknown;
  milestoneId?: unknown;
}

export interface UpdateTaskStatusBody {
  status?: unknown;
}

export function parseCreateTaskInput(
  workspaceId: string,
  body: CreateTaskBody,
): CreateTaskInput {
  assertBody(body, "Task body is required");

  return {
    workspaceId,
    title: parseRequiredString(body.title, "title"),
    description: parseNullableString(body.description, "description"),
    assigneeMemberId: parseNullableString(
      body.assigneeMemberId,
      "assigneeMemberId",
    ),
    status: parseEnum(body.status ?? "todo", TASK_STATUSES, "status"),
    priority: parseEnum(body.priority ?? "medium", TASK_PRIORITIES, "priority"),
    dueDate: parseNullableDate(body.dueDate, "dueDate"),
    milestoneId: parseNullableString(body.milestoneId, "milestoneId"),
  };
}

export function parseUpdateTaskInput(body: UpdateTaskBody): UpdateTaskInput {
  assertBody(body, "Task patch body is required");

  const input: UpdateTaskInput = {};
  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    input.title = parseRequiredString(body.title, "title");
  }
  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    input.description = parseNullableString(body.description, "description");
  }
  if (Object.prototype.hasOwnProperty.call(body, "assigneeMemberId")) {
    input.assigneeMemberId = parseNullableString(
      body.assigneeMemberId,
      "assigneeMemberId",
    );
  }
  if (Object.prototype.hasOwnProperty.call(body, "dueDate")) {
    input.dueDate = parseNullableDate(body.dueDate, "dueDate");
  }
  if (Object.prototype.hasOwnProperty.call(body, "milestoneId")) {
    input.milestoneId = parseNullableString(body.milestoneId, "milestoneId");
  }

  if (Object.keys(input).length === 0) {
    throw new BadRequestException("At least one task field is required");
  }
  return input;
}

export function parseTaskStatus(body: UpdateTaskStatusBody): TaskStatus {
  assertBody(body, "Task status body is required");
  return parseEnum(body.status, TASK_STATUSES, "status");
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
