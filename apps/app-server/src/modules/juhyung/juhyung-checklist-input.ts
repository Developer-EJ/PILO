import { BadRequestException } from "@nestjs/common";
import type { TaskChecklistStatus } from "./juhyung-public.types";
import type {
  CreateChecklistItemInput,
  UpdateChecklistItemInput,
} from "./juhyung.repository";

const CHECKLIST_STATUSES = [
  "todo",
  "done",
] as const satisfies readonly TaskChecklistStatus[];

export interface CreateChecklistItemBody {
  title?: unknown;
  status?: unknown;
  sortOrder?: unknown;
}

export interface UpdateChecklistItemBody {
  title?: unknown;
  status?: unknown;
  sortOrder?: unknown;
}

export function parseCreateChecklistItemInput(
  body: CreateChecklistItemBody,
): CreateChecklistItemInput {
  assertBody(body, "Checklist item body is required");

  return {
    title: parseRequiredString(body.title, "title"),
    status: parseEnum(body.status ?? "todo", CHECKLIST_STATUSES, "status"),
    ...(Object.prototype.hasOwnProperty.call(body, "sortOrder")
      ? { sortOrder: parseSortOrder(body.sortOrder, "sortOrder") }
      : {}),
  };
}

export function parseUpdateChecklistItemInput(
  body: UpdateChecklistItemBody,
): UpdateChecklistItemInput {
  assertBody(body, "Checklist item patch body is required");

  const input: UpdateChecklistItemInput = {};
  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    input.title = parseRequiredString(body.title, "title");
  }
  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    input.status = parseEnum(body.status, CHECKLIST_STATUSES, "status");
  }
  if (Object.prototype.hasOwnProperty.call(body, "sortOrder")) {
    input.sortOrder = parseSortOrder(body.sortOrder, "sortOrder");
  }

  if (Object.keys(input).length === 0) {
    throw new BadRequestException(
      "At least one checklist item field is required",
    );
  }
  return input;
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

function parseSortOrder(value: unknown, field: string): number {
  const normalized = typeof value === "number" ? String(value) : value;
  if (
    typeof normalized !== "string" ||
    !/^\d+$/.test(normalized) ||
    Number(normalized) > Number.MAX_SAFE_INTEGER
  ) {
    throw new BadRequestException(`${field} must be a non-negative integer`);
  }
  return Number(normalized);
}
