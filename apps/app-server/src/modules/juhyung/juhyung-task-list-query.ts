import { BadRequestException } from "@nestjs/common";
import type { TaskPriority, TaskStatus } from "./juhyung-public.types";
import type { ListTasksOptions, TaskListSortField } from "./juhyung.repository";

const TASK_STATUSES = [
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
] as const satisfies readonly TaskStatus[];
const TASK_PRIORITIES = [
  "low",
  "medium",
  "high",
  "urgent",
] as const satisfies readonly TaskPriority[];
const TASK_LIST_SORT_FIELDS = [
  "updatedAt",
  "createdAt",
  "dueDate",
  "priority",
  "status",
  "title",
] as const satisfies readonly TaskListSortField[];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export interface ListTasksQuery {
  status?: unknown;
  assigneeMemberId?: unknown;
  priority?: unknown;
  dueDateFrom?: unknown;
  dueDateTo?: unknown;
  milestoneId?: unknown;
  sortBy?: unknown;
  sortDirection?: unknown;
  limit?: unknown;
  offset?: unknown;
}

export function parseListTasksQuery(
  query: ListTasksQuery = {},
): ListTasksOptions {
  if (!query || typeof query !== "object") {
    throw new BadRequestException("Task list query is invalid");
  }

  const status = parseEnumList(query.status, TASK_STATUSES, "status");
  const assigneeMemberId = parseOptionalString(
    query.assigneeMemberId,
    "assigneeMemberId",
  );
  const priority = parseEnumList(query.priority, TASK_PRIORITIES, "priority");
  const dueDateFrom = parseOptionalDate(query.dueDateFrom, "dueDateFrom");
  const dueDateTo = parseOptionalDate(query.dueDateTo, "dueDateTo");
  if (dueDateFrom && dueDateTo && dueDateFrom > dueDateTo) {
    throw new BadRequestException("dueDateFrom must be before dueDateTo");
  }
  const milestoneId = parseOptionalString(query.milestoneId, "milestoneId");

  return {
    ...(status ? { status } : {}),
    ...(assigneeMemberId ? { assigneeMemberId } : {}),
    ...(priority ? { priority } : {}),
    ...(dueDateFrom ? { dueDateFrom } : {}),
    ...(dueDateTo ? { dueDateTo } : {}),
    ...(milestoneId ? { milestoneId } : {}),
    sortBy: parseEnum(
      query.sortBy ?? "updatedAt",
      TASK_LIST_SORT_FIELDS,
      "sortBy",
    ),
    sortDirection: parseEnum(
      query.sortDirection ?? "desc",
      ["asc", "desc"] as const,
      "sortDirection",
    ),
    limit: parseInteger(query.limit, "limit", DEFAULT_LIMIT, 1, MAX_LIMIT),
    offset: parseInteger(query.offset, "offset", 0, 0),
  };
}

function parseEnumList<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): T[number][] | undefined {
  const values = parseStringList(value, field);
  if (!values) {
    return undefined;
  }
  values.forEach((item) => {
    if (!allowed.includes(item)) {
      throw new BadRequestException(`${field} is invalid`);
    }
  });
  return values as T[number][];
}

function parseStringList(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const rawValues = Array.isArray(value) ? value : [value];
  const values = rawValues.flatMap((rawValue) => {
    if (typeof rawValue !== "string") {
      throw new BadRequestException(`${field} must be a string`);
    }
    return rawValue.split(",");
  });
  const normalized = values.map((item) => item.trim()).filter(Boolean);

  return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}

function parseOptionalString(
  value: unknown,
  field: string,
): string | undefined {
  const first = firstQueryValue(value, field);
  if (first === undefined || first === "") {
    return undefined;
  }
  const normalized = first.trim();
  if (!normalized) {
    throw new BadRequestException(`${field} must be a string`);
  }
  return normalized;
}

function parseOptionalDate(value: unknown, field: string): Date | undefined {
  const first = firstQueryValue(value, field);
  if (first === undefined || first === "") {
    return undefined;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) {
    throw new BadRequestException(`${field} must be YYYY-MM-DD`);
  }

  const parsed = new Date(`${first}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== first
  ) {
    throw new BadRequestException(`${field} must be a valid date`);
  }
  return parsed;
}

function parseEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string,
): T[number] {
  const first = firstQueryValue(value, field);
  if (!first || !allowed.includes(first)) {
    throw new BadRequestException(`${field} is invalid`);
  }
  return first as T[number];
}

function parseInteger(
  value: unknown,
  field: string,
  defaultValue: number,
  min: number,
  max?: number,
): number {
  const first = firstQueryValue(value, field);
  if (first === undefined || first === "") {
    return defaultValue;
  }
  if (!/^\d+$/.test(first)) {
    throw new BadRequestException(`${field} must be an integer`);
  }

  const parsed = Number(first);
  if (parsed < min || (max !== undefined && parsed > max)) {
    throw new BadRequestException(`${field} is out of range`);
  }
  return parsed;
}

function firstQueryValue(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined || first === null) {
    return undefined;
  }
  if (typeof first !== "string") {
    throw new BadRequestException(`${field} must be a string`);
  }
  return first;
}
