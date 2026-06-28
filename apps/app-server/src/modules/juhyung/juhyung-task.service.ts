import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CurrentActor,
  WorkspaceMemberAccessService,
} from "../workspace/workspace-member-access.service";
import { JuhyungPublicAdapter } from "./juhyung-public.adapter";
import {
  TaskRecord,
  TaskSummary,
  WorkspaceMemberRecord,
} from "./juhyung-public.types";
import { CreateTaskInput, JuhyungRepository } from "./juhyung.repository";

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

@Injectable()
export class JuhyungTaskService {
  constructor(
    private readonly repository: JuhyungRepository,
    private readonly workspaceAccess: WorkspaceMemberAccessService,
    private readonly publicAdapter: JuhyungPublicAdapter,
  ) {}

  async listTasks(
    workspaceId: string,
    actor?: CurrentActor,
  ): Promise<TaskSummary[]> {
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);
    const tasks = await this.repository.listTasksForWorkspace(workspaceId);
    return this.toTaskSummaries(workspaceId, tasks);
  }

  async createTask(
    workspaceId: string,
    body: CreateTaskBody,
    actor?: CurrentActor,
  ): Promise<TaskSummary> {
    const input = parseCreateTaskInput(workspaceId, body);
    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      workspaceId,
      actor,
    );
    const assignee = input.assigneeMemberId
      ? await this.workspaceAccess.requireWorkspaceMember(workspaceId, {
          memberId: input.assigneeMemberId,
        })
      : null;
    const task = await this.repository.createTask(input, currentMember.id);

    return this.publicAdapter.toTaskSummary(task, { assignee });
  }

  async getTask(taskId: string, actor?: CurrentActor): Promise<TaskSummary> {
    const task = await this.repository.getTaskById(taskId);
    if (!task) {
      throw new NotFoundException("Task was not found");
    }

    await this.workspaceAccess.requireWorkspaceMember(task.workspaceId, actor);
    const [summary] = await this.toTaskSummaries(task.workspaceId, [task]);
    return summary;
  }

  private async toTaskSummaries(
    workspaceId: string,
    tasks: TaskRecord[],
  ): Promise<TaskSummary[]> {
    const assigneeIds = [
      ...new Set(
        tasks.flatMap((task) =>
          task.assigneeMemberId ? [task.assigneeMemberId] : [],
        ),
      ),
    ];
    const members =
      assigneeIds.length > 0
        ? await this.repository.listWorkspaceMembersByIds(
            workspaceId,
            assigneeIds,
          )
        : [];
    const memberById = new Map(
      members.map((member) => [member.id, member as WorkspaceMemberRecord]),
    );

    return tasks.map((task) =>
      this.publicAdapter.toTaskSummary(task, {
        assignee: task.assigneeMemberId
          ? (memberById.get(task.assigneeMemberId) ?? null)
          : null,
      }),
    );
  }
}

function parseCreateTaskInput(
  workspaceId: string,
  body: CreateTaskBody,
): CreateTaskInput {
  if (!body || typeof body !== "object") {
    throw new BadRequestException("Task body is required");
  }

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
