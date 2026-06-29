import { BadRequestException } from "@nestjs/common";
import type { CreateTaskCommentInput } from "./juhyung.repository";

export interface CreateTaskCommentBody {
  body?: unknown;
}

export function parseCreateTaskCommentInput(
  body: CreateTaskCommentBody,
): CreateTaskCommentInput {
  assertBody(body, "Task comment body is required");

  return {
    body: parseRequiredString(body.body, "body"),
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
