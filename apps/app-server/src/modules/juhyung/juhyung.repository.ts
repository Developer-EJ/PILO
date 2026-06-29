import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DatabaseService } from "../database/database.service";
import {
  TaskChecklistStatus,
  TaskPriority,
  TaskStatus,
} from "./juhyung-public.types";

const SORT_ORDER_SHIFT = 1000000;

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

export interface CreateChecklistItemInput {
  title: string;
  status: TaskChecklistStatus;
  sortOrder?: number;
}

export interface UpdateChecklistItemInput {
  title?: string;
  status?: TaskChecklistStatus;
  sortOrder?: number;
}

export interface CreateTaskCommentInput {
  body: string;
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

  async createTask(input: CreateTaskInput, createdByMemberId: string) {
    if (input.milestoneId) {
      const milestone = await this.database.milestone.findFirst({
        where: {
          id: input.milestoneId,
          workspaceId: input.workspaceId,
        },
      });

      if (!milestone) {
        throw new ForbiddenException(
          "Task milestone must belong to the task workspace",
        );
      }
    }

    const data = {
      ...input,
      createdByMemberId,
    } satisfies Prisma.TaskUncheckedCreateInput;

    return this.database.task.create({ data });
  }

  updateTask(
    taskId: string,
    input: UpdateTaskInput,
    actorMemberId?: string,
    previousTask?: Partial<Record<keyof UpdateTaskInput, unknown>>,
  ) {
    const data = {
      ...input,
    } satisfies Prisma.TaskUncheckedUpdateInput;

    if (actorMemberId && previousTask) {
      return this.database.$transaction(async (transaction) => {
        const task = await transaction.task.update({
          where: {
            id: taskId,
          },
          data,
        });

        await transaction.taskActivityLog.create({
          data: {
            taskId,
            actorMemberId,
            action: "task.updated",
            beforeValue: buildActivitySnapshot(input, previousTask),
            afterValue: buildActivitySnapshot(input, input),
          },
        });

        return task;
      });
    }

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

  createTaskComment(
    taskId: string,
    input: CreateTaskCommentInput,
    authorMemberId: string,
  ) {
    return this.database.$transaction(async (transaction) => {
      const comment = await transaction.taskComment.create({
        data: {
          taskId,
          body: input.body,
          authorMemberId,
        },
      });

      await transaction.taskActivityLog.create({
        data: {
          taskId,
          actorMemberId: authorMemberId,
          action: "task.comment_created",
          beforeValue: Prisma.JsonNull,
          afterValue: {
            commentId: comment.id,
          },
        },
      });

      return comment;
    });
  }

  listTaskComments(taskId: string) {
    return this.database.taskComment.findMany({
      where: {
        taskId,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  listTaskActivityLogs(taskId: string) {
    return this.database.taskActivityLog.findMany({
      where: {
        taskId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  listChecklistItemsForTask(taskId: string) {
    return this.database.taskChecklistItem.findMany({
      where: {
        taskId,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async createChecklistItem(taskId: string, input: CreateChecklistItemInput) {
    const sortOrder =
      input.sortOrder ?? (await this.getNextChecklistSortOrder(taskId));
    const data = {
      taskId,
      title: input.title,
      status: input.status,
      sortOrder,
    } satisfies Prisma.TaskChecklistItemUncheckedCreateInput;

    if (input.sortOrder === undefined) {
      return this.database.taskChecklistItem.create({ data });
    }

    return this.database.$transaction(async (transaction) => {
      await shiftChecklistSortOrdersUp(transaction, taskId, sortOrder);
      return transaction.taskChecklistItem.create({ data });
    });
  }

  updateChecklistItem(
    taskId: string,
    itemId: string,
    input: UpdateChecklistItemInput,
  ) {
    return this.database.$transaction(async (transaction) => {
      const existing = await transaction.taskChecklistItem.findFirst({
        where: {
          id: itemId,
          taskId,
        },
      });
      if (!existing) {
        return null;
      }

      if (
        input.sortOrder !== undefined &&
        input.sortOrder !== existing.sortOrder
      ) {
        await transaction.taskChecklistItem.update({
          where: {
            id: itemId,
          },
          data: {
            sortOrder: -1,
          },
        });

        if (input.sortOrder < existing.sortOrder) {
          await shiftChecklistSortOrdersUp(
            transaction,
            taskId,
            input.sortOrder,
            existing.sortOrder,
          );
        } else {
          await shiftChecklistSortOrdersDown(
            transaction,
            taskId,
            existing.sortOrder + 1,
            input.sortOrder + 1,
          );
        }
      }

      const data = {
        ...input,
      } satisfies Prisma.TaskChecklistItemUncheckedUpdateInput;

      return transaction.taskChecklistItem.update({
        where: {
          id: itemId,
        },
        data,
      });
    });
  }

  deleteChecklistItem(taskId: string, itemId: string) {
    return this.database.taskChecklistItem.deleteMany({
      where: {
        id: itemId,
        taskId,
      },
    });
  }

  private async getNextChecklistSortOrder(taskId: string): Promise<number> {
    const aggregate = await this.database.taskChecklistItem.aggregate({
      where: {
        taskId,
      },
      _max: {
        sortOrder: true,
      },
    });
    return (aggregate._max.sortOrder ?? -1) + 1;
  }
}

function buildActivitySnapshot(
  input: UpdateTaskInput,
  values: Partial<Record<keyof UpdateTaskInput, unknown>>,
): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.keys(input).map((field) => [
      field,
      toActivityValue(values[field as keyof UpdateTaskInput]),
    ]),
  );
}

function toActivityValue(value: unknown): Prisma.InputJsonValue | null {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (value === undefined) {
    return null;
  }
  return value as Prisma.InputJsonValue;
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

async function shiftChecklistSortOrdersUp(
  transaction: Prisma.TransactionClient,
  taskId: string,
  fromSortOrder: number,
  toSortOrder?: number,
) {
  await transaction.taskChecklistItem.updateMany({
    where: {
      taskId,
      sortOrder: {
        gte: fromSortOrder,
        ...(toSortOrder !== undefined ? { lt: toSortOrder } : {}),
      },
    },
    data: {
      sortOrder: {
        increment: SORT_ORDER_SHIFT,
      },
    },
  });

  await transaction.taskChecklistItem.updateMany({
    where: {
      taskId,
      sortOrder: {
        gte: fromSortOrder + SORT_ORDER_SHIFT,
        ...(toSortOrder !== undefined
          ? { lt: toSortOrder + SORT_ORDER_SHIFT }
          : {}),
      },
    },
    data: {
      sortOrder: {
        decrement: SORT_ORDER_SHIFT - 1,
      },
    },
  });
}

async function shiftChecklistSortOrdersDown(
  transaction: Prisma.TransactionClient,
  taskId: string,
  fromSortOrder: number,
  toSortOrder: number,
) {
  await transaction.taskChecklistItem.updateMany({
    where: {
      taskId,
      sortOrder: {
        gte: fromSortOrder,
        lt: toSortOrder,
      },
    },
    data: {
      sortOrder: {
        increment: SORT_ORDER_SHIFT,
      },
    },
  });

  await transaction.taskChecklistItem.updateMany({
    where: {
      taskId,
      sortOrder: {
        gte: fromSortOrder + SORT_ORDER_SHIFT,
        lt: toSortOrder + SORT_ORDER_SHIFT,
      },
    },
    data: {
      sortOrder: {
        decrement: SORT_ORDER_SHIFT + 1,
      },
    },
  });
}
