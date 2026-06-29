import { BadRequestException } from "@nestjs/common";
import type { MilestoneStatus } from "./juhyung-public.types";
import type {
  CreateMilestoneInput,
  UpdateMilestoneInput,
} from "./juhyung.repository";

const MILESTONE_STATUSES = [
  "planned",
  "in_progress",
  "done",
] as const satisfies readonly MilestoneStatus[];

export interface CreateMilestoneBody {
  title?: unknown;
  status?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

export interface UpdateMilestoneBody {
  title?: unknown;
  status?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

export function parseCreateMilestoneInput(
  workspaceId: string,
  body: CreateMilestoneBody,
): CreateMilestoneInput {
  assertBody(body, "Milestone body is required");

  const input = {
    workspaceId,
    title: parseRequiredString(body.title, "title"),
    status: parseEnum(body.status ?? "planned", MILESTONE_STATUSES, "status"),
    startDate: parseNullableDate(body.startDate, "startDate"),
    endDate: parseNullableDate(body.endDate, "endDate"),
  };
  assertMilestoneDateRange(input.startDate, input.endDate);
  return input;
}

export function parseUpdateMilestoneInput(
  body: UpdateMilestoneBody,
): UpdateMilestoneInput {
  assertBody(body, "Milestone patch body is required");

  const input: UpdateMilestoneInput = {};
  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    input.title = parseRequiredString(body.title, "title");
  }
  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    input.status = parseEnum(body.status, MILESTONE_STATUSES, "status");
  }
  if (Object.prototype.hasOwnProperty.call(body, "startDate")) {
    input.startDate = parseNullableDate(body.startDate, "startDate");
  }
  if (Object.prototype.hasOwnProperty.call(body, "endDate")) {
    input.endDate = parseNullableDate(body.endDate, "endDate");
  }

  if (Object.keys(input).length === 0) {
    throw new BadRequestException("At least one milestone field is required");
  }
  return input;
}

export function assertMilestoneDateRange(
  startDate?: Date | string | null,
  endDate?: Date | string | null,
) {
  const start = toDateOnly(startDate);
  const end = toDateOnly(endDate);
  if (start && end && end < start) {
    throw new BadRequestException("endDate must be on or after startDate");
  }
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

function toDateOnly(value?: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return (value instanceof Date ? value : new Date(value))
    .toISOString()
    .slice(0, 10);
}
