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
    dependsOnTaskId: parseRequiredString(
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
