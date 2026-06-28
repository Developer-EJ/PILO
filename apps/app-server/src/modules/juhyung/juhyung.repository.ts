import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DatabaseService } from "../database/database.service";
import { TaskPriority, TaskStatus } from "./juhyung-public.types";

export const JUHYUNG_OWNER_TABLES = [
  "milestones",
  "tasks",
  "task_checklist_items",
  "task_comments",
  "task_activity_logs",
  "task_dependencies",
  "github_connections",
  "github_repositories",
  "github_issues",
  "github_issue_labels",
  "task_github_issues",
  "pull_requests",
  "task_pull_requests",
  "progress_snapshots",
] as const;

export type JuhyungOwnerTable = (typeof JUHYUNG_OWNER_TABLES)[number];

export interface CreateTaskInput {
  workspaceId: string;
  title: string;
  description: string | null;
  assigneeMemberId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | string | null;
  milestoneId: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  assigneeMemberId?: string | null;
  dueDate?: Date | string | null;
  milestoneId?: string | null;
}

export type TaskListSortField =
  | "updatedAt"
  | "createdAt"
  | "dueDate"
  | "priority"
  | "status"
  | "title";

export interface ListTasksOptions {
  status?: TaskStatus[];
  assigneeMemberId?: string;
  priority?: TaskPriority[];
  dueDateFrom?: Date | string;
  dueDateTo?: Date | string;
  milestoneId?: string;
  sortBy: TaskListSortField;
  sortDirection: Prisma.SortOrder;
  limit: number;
  offset: number;
}

@Injectable()
export class JuhyungRepository {
  constructor(private readonly database: DatabaseService) {}

  listTasksForWorkspace(workspaceId: string, options?: ListTasksOptions) {
    return this.database.task.findMany({
      where: buildTaskListWhere(workspaceId, options),
      orderBy: options
        ? buildTaskListOrderBy(options)
        : [{ updatedAt: "desc" }, { createdAt: "desc" }],
      ...(options
        ? {
            take: options.limit,
            skip: options.offset,
          }
        : {}),
    });
  }

  getTaskById(taskId: string) {
    return this.database.task.findFirst({
      where: {
        id: taskId,
        deletedAt: null,
      },
    });
  }

  listWorkspaceMembersByIds(workspaceId: string, memberIds: string[]) {
    return this.database.workspaceMember.findMany({
      where: {
        workspaceId,
        id: {
          in: memberIds,
        },
      },
    });
  }

  createTask(input: CreateTaskInput, createdByMemberId: string) {
    const data = {
      ...input,
      createdByMemberId,
    } satisfies Prisma.TaskUncheckedCreateInput;

    return this.database.task.create({ data });
  }

  updateTask(taskId: string, input: UpdateTaskInput) {
    const data = {
      ...input,
    } satisfies Prisma.TaskUncheckedUpdateInput;

    return this.database.task.update({
      where: {
        id: taskId,
      },
      data,
    });
  }

  updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    actorMemberId: string,
    previousStatus: TaskStatus,
  ) {
    return this.database.$transaction(async (transaction) => {
      const task = await transaction.task.update({
        where: {
          id: taskId,
        },
        data: {
          status,
        },
      });

      await transaction.taskActivityLog.create({
        data: {
          taskId,
          actorMemberId,
          action: "task.status_changed",
          beforeValue: {
            status: previousStatus,
          },
          afterValue: {
            status,
          },
        },
      });

      return task;
    });
  }

  softDeleteTask(taskId: string) {
    return this.database.task.update({
      where: {
        id: taskId,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}

function buildTaskListWhere(
  workspaceId: string,
  options?: ListTasksOptions,
): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {
    workspaceId,
    deletedAt: null,
  };
  if (!options) {
    return where;
  }

  if (options.status?.length) {
    where.status = {
      in: options.status,
    };
  }
  if (options.assigneeMemberId) {
    where.assigneeMemberId = options.assigneeMemberId;
  }
  if (options.priority?.length) {
    where.priority = {
      in: options.priority,
    };
  }
  if (options.dueDateFrom || options.dueDateTo) {
    where.dueDate = {
      ...(options.dueDateFrom ? { gte: options.dueDateFrom } : {}),
      ...(options.dueDateTo ? { lte: options.dueDateTo } : {}),
    };
  }
  if (options.milestoneId) {
    where.milestoneId = options.milestoneId;
  }

  return where;
}

function buildTaskListOrderBy(
  options: ListTasksOptions,
): Prisma.TaskOrderByWithRelationInput[] {
  const orderBy = [
    {
      [options.sortBy]: options.sortDirection,
    } as Prisma.TaskOrderByWithRelationInput,
  ];

  if (options.sortBy !== "createdAt") {
    orderBy.push({ createdAt: "desc" });
  }
  orderBy.push({ id: "asc" });

  return orderBy;
}
