import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
import {
  GithubIssueState,
  MilestoneRecord,
  MilestoneStatus,
  TaskActivityLogRecord,
  TaskChecklistStatus,
  TaskDraftRecord,
  TaskPriority,
  TaskRecord,
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

export interface CreateGithubIssueInput {
  repositoryId: string;
  number: number;
  title: string;
  state: GithubIssueState;
  url: string;
  syncedAt: Date | string | null;
}

export interface ActiveGithubConnectionRecord {
  id: string;
  workspaceId: string;
  installationId: string;
}

export interface UpsertGithubRepositoryInput {
  workspaceId: string;
  githubConnectionId: string;
  installationId: string;
  owner: string;
  repoName: string;
  url: string;
  defaultBranch: string | null;
  syncedAt: Date | string;
}

export interface UpsertPullRequestInput {
  repositoryId: string;
  number: number;
  title: string;
  authorLogin: string | null;
  state: string;
  branch: string | null;
  baseBranch: string | null;
  url: string;
  changedFilesCount: number;
  additions: number;
  deletions: number;
  openedAt: Date | string | null;
  mergedAt: Date | string | null;
  closedAt: Date | string | null;
  syncedAt: Date | string;
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

type MemoryTaskRecord = TaskRecord & {
  description: string | null;
  createdAt: Date;
  deletedAt: Date | null;
  createdByMemberId: string;
};

type MemoryTaskDraftRecord = TaskDraftRecord & {
  createdByMemberId: string;
  approvedByMemberId: string | null;
  approvedAt: Date | null;
  rejectedByMemberId: string | null;
  rejectedAt: Date | null;
};

type MemoryMilestoneRecord = MilestoneRecord & {
  createdAt: Date;
};

@Injectable()
export class JuhyungRepository {
  private readonly memoryTasks = new Map<string, MemoryTaskRecord>();
  private readonly memoryTaskDrafts = new Map<string, MemoryTaskDraftRecord>();
  private readonly memoryMilestones = new Map<string, MemoryMilestoneRecord>();
  private readonly memoryTaskActivityLogs = new Map<
    string,
    TaskActivityLogRecord[]
  >();

  constructor(private readonly database: DatabaseService) {}

  listTasksForWorkspace(workspaceId: string, options?: ListTasksOptions) {
    if (!this.shouldUseDatabase) {
      return this.listMemoryTasksForWorkspace(workspaceId, options);
    }

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
    if (!this.shouldUseDatabase) {
      return this.getMemoryTaskById(taskId);
    }

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
    if (!this.shouldUseDatabase) {
      return null;
    }

    return this.database.taskDependency.findFirst({
      where: {
        taskId,
        dependsOnTaskId,
      },
    });
  }

  async listTaskDependenciesForWorkspace(workspaceId: string) {
    if (!this.shouldUseDatabase) {
      return [];
    }

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
    if (!this.shouldUseDatabase) {
      return [];
    }

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
    if (!this.shouldUseDatabase) {
      return Array.from(this.memoryMilestones.values())
        .filter((milestone) => milestone.workspaceId === workspaceId)
        .sort((left, right) =>
          compareNullableValues(left.endDate, right.endDate, "asc"),
        );
    }

    return this.database.milestone.findMany({
      where: {
        workspaceId,
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  }

  createMilestone(input: CreateMilestoneInput) {
    if (!this.shouldUseDatabase) {
      const now = new Date();
      const milestone: MemoryMilestoneRecord = {
        id: randomUUID(),
        ...input,
        createdAt: now,
        updatedAt: now,
      };

      this.memoryMilestones.set(milestone.id, milestone);

      return milestone;
    }

    const data = {
      ...input,
    } satisfies Prisma.MilestoneUncheckedCreateInput;

    return this.database.milestone.create({ data });
  }

  getMilestoneById(milestoneId: string) {
    if (!this.shouldUseDatabase) {
      return this.memoryMilestones.get(milestoneId) ?? null;
    }

    return this.database.milestone.findUnique({
      where: {
        id: milestoneId,
      },
    });
  }

  updateMilestone(milestoneId: string, input: UpdateMilestoneInput) {
    if (!this.shouldUseDatabase) {
      const milestone = this.memoryMilestones.get(milestoneId);

      if (!milestone) {
        throw new ForbiddenException("Milestone was not found");
      }

      const updatedMilestone: MemoryMilestoneRecord = {
        ...milestone,
        ...input,
        updatedAt: new Date(),
      };

      this.memoryMilestones.set(milestoneId, updatedMilestone);

      return updatedMilestone;
    }

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
    if (!this.shouldUseDatabase) {
      if (
        input.milestoneId &&
        this.memoryMilestones.get(input.milestoneId)?.workspaceId !==
          input.workspaceId
      ) {
        throw new ForbiddenException(
          "Task milestone must belong to the task workspace",
        );
      }

      return this.createMemoryTask(input, createdByMemberId);
    }

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
    if (!this.shouldUseDatabase) {
      const now = new Date();
      const draft: MemoryTaskDraftRecord = {
        id: randomUUID(),
        ...input,
        status: "draft",
        taskId: null,
        createdByMemberId,
        approvedByMemberId: null,
        approvedAt: null,
        rejectedByMemberId: null,
        rejectedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      this.memoryTaskDrafts.set(draft.id, draft);

      return draft;
    }

    const data = {
      ...input,
      status: "draft",
      taskId: null,
      createdByMemberId,
    } satisfies Prisma.TaskDraftUncheckedCreateInput;

    return this.database.taskDraft.create({ data });
  }

  listTaskDraftsForWorkspace(workspaceId: string) {
    if (!this.shouldUseDatabase) {
      return Array.from(this.memoryTaskDrafts.values())
        .filter((draft) => draft.workspaceId === workspaceId)
        .sort((left, right) => {
          const updatedAt = compareNullableValues(
            left.updatedAt,
            right.updatedAt,
            "desc",
          );

          return updatedAt || compareNullableValues(left.id, right.id, "asc");
        })
        .slice(0, 50);
    }

    return this.database.taskDraft.findMany({
      where: {
        workspaceId,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      take: 50,
    });
  }

  getTaskDraftById(draftId: string) {
    if (!this.shouldUseDatabase) {
      return this.memoryTaskDrafts.get(draftId) ?? null;
    }

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
    if (!this.shouldUseDatabase) {
      const draft = this.memoryTaskDrafts.get(draftId);

      if (!draft || draft.status !== "draft") {
        return null;
      }

      const approvedAt = new Date();
      const task = this.createMemoryTask(input, actorMemberId, approvedAt);
      const approvedDraft: MemoryTaskDraftRecord = {
        ...draft,
        status: "approved",
        approvedByMemberId: actorMemberId,
        approvedAt,
        taskId: task.id,
        updatedAt: approvedAt,
      };

      this.memoryTaskDrafts.set(draftId, approvedDraft);

      return approvedDraft;
    }

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
    if (!this.shouldUseDatabase) {
      const draft = this.memoryTaskDrafts.get(draftId);

      if (!draft || draft.status !== "draft") {
        return null;
      }

      const rejectedAt = new Date();
      const rejectedDraft: MemoryTaskDraftRecord = {
        ...draft,
        status: "rejected",
        rejectedByMemberId: actorMemberId,
        rejectedAt,
        updatedAt: rejectedAt,
      };

      this.memoryTaskDrafts.set(draftId, rejectedDraft);

      return rejectedDraft;
    }

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
    if (!this.shouldUseDatabase) {
      const task = this.getMemoryTaskById(taskId);

      if (!task) {
        throw new ForbiddenException("Task was not found");
      }

      const updatedTask = {
        ...task,
        ...input,
        updatedAt: new Date(),
      } as MemoryTaskRecord;

      this.memoryTasks.set(taskId, updatedTask);

      if (actorMemberId && previousTask) {
        this.appendMemoryTaskActivityLog(taskId, {
          actorMemberId,
          action: "task.updated",
          beforeValue: buildActivitySnapshot(input, previousTask),
          afterValue: buildActivitySnapshot(input, input),
        });
      }

      return updatedTask;
    }

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
    if (!this.shouldUseDatabase) {
      const task = this.getMemoryTaskById(taskId);

      if (!task) {
        throw new ForbiddenException("Task was not found");
      }

      const updatedTask: MemoryTaskRecord = {
        ...task,
        status,
        updatedAt: new Date(),
      };

      this.memoryTasks.set(taskId, updatedTask);
      this.appendMemoryTaskActivityLog(taskId, {
        actorMemberId,
        action: "task.status_changed",
        beforeValue: { status: previousStatus },
        afterValue: { status },
      });

      return updatedTask;
    }

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
    if (!this.shouldUseDatabase) {
      const task = this.getMemoryTaskById(taskId);

      if (!task) {
        throw new ForbiddenException("Task was not found");
      }

      const now = new Date();
      const deletedTask: MemoryTaskRecord = {
        ...task,
        deletedAt: now,
        updatedAt: now,
      };

      this.memoryTasks.set(taskId, deletedTask);

      return deletedTask;
    }

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
    if (!this.shouldUseDatabase) {
      return [];
    }

    return this.database.taskComment.findMany({
      where: {
        taskId,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  listTaskActivityLogs(taskId: string) {
    if (!this.shouldUseDatabase) {
      return [...(this.memoryTaskActivityLogs.get(taskId) ?? [])].sort(
        (left, right) =>
          compareNullableValues(left.createdAt, right.createdAt, "desc"),
      );
    }

    return this.database.taskActivityLog.findMany({
      where: {
        taskId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  listChecklistItemsForTask(taskId: string) {
    if (!this.shouldUseDatabase) {
      return [];
    }

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
    if (!this.shouldUseDatabase) {
      return [];
    }

    return this.database.githubRepository.findMany({
      where: {
        workspaceId,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
  }

  async listActiveGithubConnectionsForWorkspace(
    workspaceId: string,
  ): Promise<ActiveGithubConnectionRecord[]> {
    if (!this.shouldUseDatabase) {
      return [];
    }

    const connections = await this.database.githubConnection.findMany({
      where: {
        workspaceId,
        provider: "github_app",
        installationId: { not: null },
        revokedAt: null,
      },
      select: {
        id: true,
        workspaceId: true,
        installationId: true,
      },
      orderBy: [{ connectedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    });

    return connections.flatMap((connection) =>
      connection.installationId
        ? [
            {
              id: connection.id,
              workspaceId: connection.workspaceId,
              installationId: connection.installationId,
            },
          ]
        : [],
    );
  }

  upsertGithubRepository(input: UpsertGithubRepositoryInput) {
    const data = {
      githubConnectionId: input.githubConnectionId,
      installationId: input.installationId,
      owner: input.owner,
      repoName: input.repoName,
      url: input.url,
      defaultBranch: input.defaultBranch,
      updatedAt: input.syncedAt,
    } satisfies Prisma.GithubRepositoryUncheckedUpdateInput;

    return this.database.githubRepository.upsert({
      where: {
        workspaceId_owner_repoName: {
          workspaceId: input.workspaceId,
          owner: input.owner,
          repoName: input.repoName,
        },
      },
      update: data,
      create: {
        workspaceId: input.workspaceId,
        ...data,
      } satisfies Prisma.GithubRepositoryUncheckedCreateInput,
    });
  }

  getGithubRepositoryById(repositoryId: string) {
    if (!this.shouldUseDatabase) {
      return null;
    }

    return this.database.githubRepository.findUnique({
      where: {
        id: repositoryId,
      },
    });
  }

  getGithubIssueById(issueId: string) {
    if (!this.shouldUseDatabase) {
      return null;
    }

    return this.database.githubIssue.findUnique({
      where: {
        id: issueId,
      },
    });
  }

  getPullRequestById(pullRequestId: string) {
    if (!this.shouldUseDatabase) {
      return null;
    }

    return this.database.pullRequest.findUnique({
      where: {
        id: pullRequestId,
      },
    });
  }

  async getNextGithubIssueNumber(repositoryId: string) {
    if (!this.shouldUseDatabase) {
      return 1;
    }

    const result = await this.database.githubIssue.aggregate({
      where: {
        repositoryId,
      },
      _max: {
        number: true,
      },
    });

    return (result._max.number ?? 0) + 1;
  }

  createGithubIssue(input: CreateGithubIssueInput) {
    return this.database.githubIssue.create({
      data: input,
    });
  }

  linkTaskToGithubIssue(taskId: string, issueId: string) {
    return this.database.taskGithubIssue.upsert({
      where: {
        taskId_issueId: {
          taskId,
          issueId,
        },
      },
      update: {},
      create: {
        taskId,
        issueId,
      },
    });
  }

  linkTaskToPullRequest(taskId: string, pullRequestId: string) {
    return this.database.taskPullRequest.upsert({
      where: {
        taskId_pullRequestId: {
          taskId,
          pullRequestId,
        },
      },
      update: {},
      create: {
        taskId,
        pullRequestId,
      },
    });
  }

  listGithubIssuesForRepository(repositoryId: string) {
    if (!this.shouldUseDatabase) {
      return [];
    }

    return this.database.githubIssue.findMany({
      where: {
        repositoryId,
      },
      orderBy: [{ number: "desc" }, { id: "asc" }],
    });
  }

  listGithubIssueLabelsForIssueIds(issueIds: string[]) {
    if (!this.shouldUseDatabase) {
      return [];
    }

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
    if (!this.shouldUseDatabase) {
      return [];
    }

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

  listTaskGithubIssueLinksForTaskIds(taskIds: string[]) {
    if (!this.shouldUseDatabase) {
      return [];
    }

    if (taskIds.length === 0) {
      return [];
    }

    return this.database.taskGithubIssue.findMany({
      where: {
        taskId: {
          in: taskIds,
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });
  }

  listPullRequestsForRepository(repositoryId: string) {
    if (!this.shouldUseDatabase) {
      return [];
    }

    return this.database.pullRequest.findMany({
      where: {
        repositoryId,
      },
      orderBy: [{ number: "desc" }, { id: "asc" }],
    });
  }

  upsertPullRequest(input: UpsertPullRequestInput) {
    const data = {
      title: input.title,
      authorLogin: input.authorLogin,
      state: input.state,
      branch: input.branch,
      baseBranch: input.baseBranch,
      url: input.url,
      changedFilesCount: input.changedFilesCount,
      additions: input.additions,
      deletions: input.deletions,
      openedAt: input.openedAt,
      mergedAt: input.mergedAt,
      closedAt: input.closedAt,
      syncedAt: input.syncedAt,
      updatedAt: input.syncedAt,
    } satisfies Prisma.PullRequestUncheckedUpdateInput;

    return this.database.pullRequest.upsert({
      where: {
        repositoryId_number: {
          repositoryId: input.repositoryId,
          number: input.number,
        },
      },
      update: data,
      create: {
        repositoryId: input.repositoryId,
        number: input.number,
        ...data,
      } satisfies Prisma.PullRequestUncheckedCreateInput,
    });
  }

  listTaskPullRequestLinksForPullRequestIds(pullRequestIds: string[]) {
    if (!this.shouldUseDatabase) {
      return [];
    }

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

  listTaskPullRequestLinksForTaskIds(taskIds: string[]) {
    if (!this.shouldUseDatabase) {
      return [];
    }

    if (taskIds.length === 0) {
      return [];
    }

    return this.database.taskPullRequest.findMany({
      where: {
        taskId: {
          in: taskIds,
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });
  }

  listProgressSnapshotsForWorkspace(workspaceId: string, limit = 12) {
    if (!this.shouldUseDatabase) {
      return [];
    }

    return this.database.progressSnapshot.findMany({
      where: {
        workspaceId,
      },
      orderBy: [{ capturedAt: "desc" }, { id: "asc" }],
      take: limit,
    });
  }

  private createMemoryTask(
    input: CreateTaskInput,
    createdByMemberId: string,
    now = new Date(),
  ) {
    const task: MemoryTaskRecord = {
      id: randomUUID(),
      ...input,
      createdByMemberId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    this.memoryTasks.set(task.id, task);

    return task;
  }

  private getMemoryTaskById(taskId: string) {
    const task = this.memoryTasks.get(taskId);

    if (!task || task.deletedAt) {
      return null;
    }

    return task;
  }

  private listMemoryTasksForWorkspace(
    workspaceId: string,
    options?: ListTasksOptions,
  ) {
    let tasks = Array.from(this.memoryTasks.values()).filter(
      (task) => task.workspaceId === workspaceId && !task.deletedAt,
    );

    if (options?.status?.length) {
      tasks = tasks.filter((task) =>
        options.status?.includes(task.status as TaskStatus),
      );
    }

    if (options?.assigneeMemberId) {
      tasks = tasks.filter(
        (task) => task.assigneeMemberId === options.assigneeMemberId,
      );
    }

    if (options?.priority?.length) {
      tasks = tasks.filter((task) =>
        options.priority?.includes(task.priority as TaskPriority),
      );
    }

    if (options?.milestoneId) {
      tasks = tasks.filter((task) => task.milestoneId === options.milestoneId);
    }

    if (options?.dueDateFrom || options?.dueDateTo) {
      tasks = tasks.filter((task) => {
        const dueDate = normalizeComparableValue(task.dueDate);
        const dueDateFrom = normalizeComparableValue(options.dueDateFrom);
        const dueDateTo = normalizeComparableValue(options.dueDateTo);

        return (
          (!dueDateFrom || Boolean(dueDate && dueDate >= dueDateFrom)) &&
          (!dueDateTo || Boolean(dueDate && dueDate <= dueDateTo))
        );
      });
    }

    if (options) {
      const direction = options.sortDirection === "asc" ? "asc" : "desc";

      tasks = tasks.sort((left, right) => {
        const sorted = compareNullableValues(
          left[options.sortBy],
          right[options.sortBy],
          direction,
        );

        return sorted || compareNullableValues(left.id, right.id, "asc");
      });

      return tasks.slice(options.offset, options.offset + options.limit);
    }

    return tasks.sort((left, right) => {
      const updatedAt = compareNullableValues(
        left.updatedAt,
        right.updatedAt,
        "desc",
      );

      return (
        updatedAt ||
        compareNullableValues(left.createdAt, right.createdAt, "desc") ||
        compareNullableValues(left.id, right.id, "asc")
      );
    });
  }

  private appendMemoryTaskActivityLog(
    taskId: string,
    input: {
      actorMemberId: string;
      action: string;
      beforeValue: unknown;
      afterValue: unknown;
    },
  ) {
    const activityLogs = this.memoryTaskActivityLogs.get(taskId) ?? [];
    const now = new Date();

    activityLogs.push({
      id: randomUUID(),
      taskId,
      ...input,
      createdAt: now,
    });
    this.memoryTaskActivityLogs.set(taskId, activityLogs);
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

  private get shouldUseDatabase() {
    return process.env.PILO_SKIP_DATABASE_CONNECT !== "true";
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

function normalizeComparableValue(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function compareNullableValues(
  left: unknown,
  right: unknown,
  direction: "asc" | "desc",
) {
  const normalizedLeft = normalizeComparableValue(left);
  const normalizedRight = normalizeComparableValue(right);

  if (normalizedLeft === normalizedRight) {
    return 0;
  }

  if (normalizedLeft === null) {
    return 1;
  }

  if (normalizedRight === null) {
    return -1;
  }

  const result = normalizedLeft > normalizedRight ? 1 : -1;

  return direction === "asc" ? result : -result;
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
