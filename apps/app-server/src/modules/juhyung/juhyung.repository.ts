import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DatabaseService } from "../database/database.service";
import {
  MilestoneStatus,
  TaskChecklistStatus,
  TaskPriority,
  TaskStatus,
} from "./juhyung-public.types";

const SORT_ORDER_SHIFT = 1000000;

export const JUHYUNG_OWNER_TABLES = [
  "milestones",
  "tasks",
  "task_drafts",
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

export interface CreateTaskDraftInput {
  workspaceId: string;
  sourceType: string | null;
  sourceId: string | null;
  title: string;
  description: string | null;
  assigneeMemberId: string | null;
  priority: TaskPriority;
  dueDate: Date | string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  assigneeMemberId?: string | null;
  dueDate?: Date | string | null;
  milestoneId?: string | null;
}

export interface CreateMilestoneInput {
  workspaceId: string;
  title: string;
  status: MilestoneStatus;
  startDate: Date | string | null;
  endDate: Date | string | null;
}

export interface UpdateMilestoneInput {
  title?: string;
  status?: MilestoneStatus;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
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

  createTaskDependency(taskId: string, dependsOnTaskId: string) {
    const data = {
      taskId,
      dependsOnTaskId,
    } satisfies Prisma.TaskDependencyUncheckedCreateInput;

    return this.database.taskDependency.create({ data });
  }

  getTaskDependency(taskId: string, dependsOnTaskId: string) {
    return this.database.taskDependency.findFirst({
      where: {
        taskId,
        dependsOnTaskId,
      },
    });
  }

  async listTaskDependenciesForWorkspace(workspaceId: string) {
    const tasks = await this.database.task.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    const taskIds = tasks.map((task) => task.id);
    if (taskIds.length === 0) {
      return [];
    }

    return this.database.taskDependency.findMany({
      where: {
        taskId: {
          in: taskIds,
        },
        dependsOnTaskId: {
          in: taskIds,
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  deleteTaskDependency(taskId: string, dependsOnTaskId: string) {
    return this.database.taskDependency.deleteMany({
      where: {
        taskId,
        dependsOnTaskId,
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

  listMilestonesForWorkspace(workspaceId: string) {
    return this.database.milestone.findMany({
      where: {
        workspaceId,
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  }

  createMilestone(input: CreateMilestoneInput) {
    const data = {
      ...input,
    } satisfies Prisma.MilestoneUncheckedCreateInput;

    return this.database.milestone.create({ data });
  }

  getMilestoneById(milestoneId: string) {
    return this.database.milestone.findUnique({
      where: {
        id: milestoneId,
      },
    });
  }

  updateMilestone(milestoneId: string, input: UpdateMilestoneInput) {
    const data = {
      ...input,
    } satisfies Prisma.MilestoneUncheckedUpdateInput;

    return this.database.milestone.update({
      where: {
        id: milestoneId,
      },
      data,
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

  createTaskDraft(input: CreateTaskDraftInput, createdByMemberId: string) {
    const data = {
      ...input,
      status: "draft",
      taskId: null,
      createdByMemberId,
    } satisfies Prisma.TaskDraftUncheckedCreateInput;

    return this.database.taskDraft.create({ data });
  }

  listTaskDraftsForWorkspace(workspaceId: string) {
    return this.database.taskDraft.findMany({
      where: {
        workspaceId,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      take: 50,
    });
  }

  getTaskDraftById(draftId: string) {
    return this.database.taskDraft.findUnique({
      where: {
        id: draftId,
      },
    });
  }

  approveTaskDraft(
    draftId: string,
    input: CreateTaskInput,
    actorMemberId: string,
  ) {
    return this.database.$transaction(async (transaction) => {
      const approvedAt = new Date();
      const claimed = await transaction.taskDraft.updateMany({
        where: {
          id: draftId,
          status: "draft",
        },
        data: {
          status: "approved",
          approvedByMemberId: actorMemberId,
          approvedAt,
          updatedAt: approvedAt,
        } satisfies Prisma.TaskDraftUncheckedUpdateInput,
      });
      if (claimed.count === 0) {
        return null;
      }

      const task = await transaction.task.create({
        data: {
          ...input,
          createdByMemberId: actorMemberId,
        } satisfies Prisma.TaskUncheckedCreateInput,
      });

      return transaction.taskDraft.update({
        where: {
          id: draftId,
        },
        data: {
          taskId: task.id,
          updatedAt: approvedAt,
        } satisfies Prisma.TaskDraftUncheckedUpdateInput,
      });
    });
  }

  async rejectTaskDraft(draftId: string, actorMemberId: string) {
    const rejectedAt = new Date();
    const rejected = await this.database.taskDraft.updateMany({
      where: {
        id: draftId,
        status: "draft",
      },
      data: {
        status: "rejected",
        rejectedByMemberId: actorMemberId,
        rejectedAt,
        updatedAt: rejectedAt,
      } satisfies Prisma.TaskDraftUncheckedUpdateInput,
    });
    if (rejected.count === 0) {
      return null;
    }

    return this.database.taskDraft.findUnique({
      where: {
        id: draftId,
      },
    });
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

  listGithubRepositoriesForWorkspace(workspaceId: string) {
    return this.database.githubRepository.findMany({
      where: {
        workspaceId,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
  }

  getGithubRepositoryById(repositoryId: string) {
    return this.database.githubRepository.findUnique({
      where: {
        id: repositoryId,
      },
    });
  }

  listGithubIssuesForRepository(repositoryId: string) {
    return this.database.githubIssue.findMany({
      where: {
        repositoryId,
      },
      orderBy: [{ number: "desc" }, { id: "asc" }],
    });
  }

  listGithubIssueLabelsForIssueIds(issueIds: string[]) {
    if (issueIds.length === 0) {
      return [];
    }

    return this.database.githubIssueLabel.findMany({
      where: {
        issueId: {
          in: issueIds,
        },
      },
      orderBy: [{ name: "asc" }],
    });
  }

  listTaskGithubIssueLinksForIssueIds(issueIds: string[]) {
    if (issueIds.length === 0) {
      return [];
    }

    return this.database.taskGithubIssue.findMany({
      where: {
        issueId: {
          in: issueIds,
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });
  }

  listPullRequestsForRepository(repositoryId: string) {
    return this.database.pullRequest.findMany({
      where: {
        repositoryId,
      },
      orderBy: [{ number: "desc" }, { id: "asc" }],
    });
  }

  listTaskPullRequestLinksForPullRequestIds(pullRequestIds: string[]) {
    if (pullRequestIds.length === 0) {
      return [];
    }

    return this.database.taskPullRequest.findMany({
      where: {
        pullRequestId: {
          in: pullRequestIds,
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });
  }

  listProgressSnapshotsForWorkspace(workspaceId: string, limit = 12) {
    return this.database.progressSnapshot.findMany({
      where: {
        workspaceId,
      },
      orderBy: [{ capturedAt: "desc" }, { id: "asc" }],
      take: limit,
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
