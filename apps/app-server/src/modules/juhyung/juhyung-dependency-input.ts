import { BadRequestException } from "@nestjs/common";

export interface CreateTaskDependencyBody {
  dependsOnTaskId?: unknown;
}

export interface CreateTaskDependencyInput {
  dependsOnTaskId: string;
}

export function parseCreateTaskDependencyInput(
  body: CreateTaskDependencyBody,
): CreateTaskDependencyInput {
  assertBody(body, "Task dependency body is required");

  return {
    dependsOnTaskId: parseRequiredUuid(
      body.dependsOnTaskId,
      "dependsOnTaskId",
    ),
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

function parseRequiredUuid(value: unknown, field: string): string {
  const normalized = parseRequiredString(value, field);

  if (!isUuid(normalized)) {
    throw new BadRequestException(`${field} must be a UUID`);
  }

  return normalized;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
