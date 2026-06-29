import { Injectable } from "@nestjs/common";
import {
  GithubIssueRecord,
  GithubIssueState,
  GithubIssueSummary,
  MemberRef,
  MilestoneRecord,
  MilestoneSummary,
  ProgressRecord,
  ProgressSummary,
  PullRequestRecord,
  PullRequestState,
  PullRequestSummary,
  TaskActivityLogRecord,
  TaskActivityLogSummary,
  TaskChecklistItemRecord,
  TaskChecklistItemSummary,
  TaskCommentRecord,
  TaskCommentSummary,
  TaskDependencyRecord,
  TaskDependencySummary,
  TaskDetail,
  TaskDraftRecord,
  TaskDraftStatus,
  TaskDraftSummary,
  TaskPriority,
  TaskRecord,
  TaskStatus,
  TaskSummary,
  WorkspaceMemberRecord,
} from "./juhyung-public.types";

export interface TaskSummaryContext {
  assignee?: WorkspaceMemberRecord | null;
  checklistItems?: TaskChecklistItemRecord[];
  linkedIssueCount?: number;
  linkedPrCount?: number;
  now?: Date;
}

export interface TaskCommentSummaryContext {
  author?: WorkspaceMemberRecord | null;
}

export interface TaskActivityLogSummaryContext {
  actor?: WorkspaceMemberRecord | null;
}

export interface GithubIssueSummaryContext {
  labels?: string[];
  linkedTaskId?: string | null;
}

export interface PullRequestSummaryContext {
  linkedTaskIds?: string[];
}

@Injectable()
export class JuhyungPublicAdapter {
  toTaskSummary(
    task: TaskRecord,
    context: TaskSummaryContext = {},
  ): TaskSummary {
    const dueDate = toDateOnly(task.dueDate ?? null);

    return {
      id: task.id,
      workspaceId: task.workspaceId,
      milestoneId: task.milestoneId ?? null,
      title: task.title,
      status: task.status as TaskStatus,
      priority: task.priority as TaskPriority,
      assignee: toMemberRef(
        task.assigneeMemberId ?? null,
        context.assignee ?? null,
      ),
      dueDate,
      isDelayed: isDelayed(dueDate, task.status, context.now ?? new Date()),
      linkedIssueCount: context.linkedIssueCount ?? 0,
      linkedPrCount: context.linkedPrCount ?? 0,
      updatedAt: toDateTime(task.updatedAt),
    };
  }

  toTaskDetail(task: TaskRecord, context: TaskSummaryContext = {}): TaskDetail {
    return {
      ...this.toTaskSummary(task, context),
      checklistItems: (context.checklistItems ?? []).map((item) =>
        this.toTaskChecklistItemSummary(item),
      ),
    };
  }

  toTaskDraftSummary(draft: TaskDraftRecord): TaskDraftSummary {
    return {
      id: draft.id,
      workspaceId: draft.workspaceId,
      sourceType: draft.sourceType ?? null,
      sourceId: draft.sourceId ?? null,
      title: draft.title,
      description: draft.description ?? null,
      assigneeMemberId: draft.assigneeMemberId ?? null,
      priority: draft.priority as TaskPriority,
      dueDate: toDateOnly(draft.dueDate ?? null),
      status: draft.status as TaskDraftStatus,
      taskId: draft.taskId ?? null,
      createdAt: toDateTime(draft.createdAt),
      updatedAt: toDateTime(draft.updatedAt),
    };
  }

  toMilestoneSummary(milestone: MilestoneRecord): MilestoneSummary {
    return {
      id: milestone.id,
      workspaceId: milestone.workspaceId,
      title: milestone.title,
      status: milestone.status as MilestoneSummary["status"],
      startDate: toDateOnly(milestone.startDate ?? null),
      endDate: toDateOnly(milestone.endDate ?? null),
      updatedAt: toDateTime(milestone.updatedAt),
    };
  }

  toTaskChecklistItemSummary(
    item: TaskChecklistItemRecord,
  ): TaskChecklistItemSummary {
    return {
      id: item.id,
      taskId: item.taskId,
      title: item.title,
      status: item.status as TaskChecklistItemSummary["status"],
      sortOrder: item.sortOrder,
      updatedAt: toDateTime(item.updatedAt),
    };
  }

  toTaskDependencySummary(
    dependency: TaskDependencyRecord,
  ): TaskDependencySummary {
    return {
      id: dependency.id,
      taskId: dependency.taskId,
      dependsOnTaskId: dependency.dependsOnTaskId,
      createdAt: toDateTime(dependency.createdAt),
    };
  }

  toTaskCommentSummary(
    comment: TaskCommentRecord,
    context: TaskCommentSummaryContext = {},
  ): TaskCommentSummary {
    return {
      id: comment.id,
      taskId: comment.taskId,
      body: comment.body,
      author: toMemberRef(
        comment.authorMemberId ?? null,
        context.author ?? null,
      ),
      createdAt: toDateTime(comment.createdAt),
      updatedAt: toDateTime(comment.updatedAt),
    };
  }

  toTaskActivityLogSummary(
    activityLog: TaskActivityLogRecord,
    context: TaskActivityLogSummaryContext = {},
  ): TaskActivityLogSummary {
    return {
      id: activityLog.id,
      taskId: activityLog.taskId,
      action: activityLog.action,
      actor: toMemberRef(
        activityLog.actorMemberId ?? null,
        context.actor ?? null,
      ),
      beforeValue: activityLog.beforeValue ?? null,
      afterValue: activityLog.afterValue ?? null,
      createdAt: toDateTime(activityLog.createdAt),
    };
  }

  toGithubIssueSummary(
    issue: GithubIssueRecord,
    context: GithubIssueSummaryContext = {},
  ): GithubIssueSummary {
    return {
      id: issue.id,
      repositoryId: issue.repositoryId,
      number: issue.number,
      title: issue.title,
      state: issue.state as GithubIssueState,
      url: issue.url,
      labels: context.labels ?? [],
      linkedTaskId: context.linkedTaskId ?? null,
      syncedAt: issue.syncedAt ? toDateTime(issue.syncedAt) : null,
    };
  }

  toPullRequestSummary(
    pullRequest: PullRequestRecord,
    context: PullRequestSummaryContext = {},
  ): PullRequestSummary {
    return {
      id: pullRequest.id,
      repositoryId: pullRequest.repositoryId,
      number: pullRequest.number,
      title: pullRequest.title,
      authorLogin: pullRequest.authorLogin ?? null,
      state: pullRequest.state as PullRequestState,
      branch: pullRequest.branch ?? null,
      baseBranch: pullRequest.baseBranch ?? null,
      url: pullRequest.url,
      changedFilesCount: pullRequest.changedFilesCount ?? 0,
      additions: pullRequest.additions ?? 0,
      deletions: pullRequest.deletions ?? 0,
      linkedTaskIds: context.linkedTaskIds ?? [],
      syncedAt: pullRequest.syncedAt ? toDateTime(pullRequest.syncedAt) : null,
    };
  }

  toProgressSummary(progress: ProgressRecord): ProgressSummary {
    return {
      workspaceId: progress.workspaceId,
      milestoneId: progress.milestoneId ?? null,
      totalTasks: progress.totalTasks,
      doneTasks: progress.doneTasks,
      blockedTasks: progress.blockedTasks,
      reviewTasks: progress.reviewTasks,
      delayedTasks: progress.delayedTasks,
      progressRate: toNumber(progress.progressRate),
      capturedAt: toDateTime(progress.capturedAt),
    };
  }
}

function toMemberRef(
  assigneeMemberId: string | null,
  member: WorkspaceMemberRecord | null,
): MemberRef | null {
  if (!assigneeMemberId) {
    return null;
  }

  return {
    memberId: assigneeMemberId,
    ...(member?.userId ? { userId: member.userId } : {}),
    name: member?.displayName || assigneeMemberId,
  };
}

function isDelayed(dueDate: string | null, status: string, now: Date): boolean {
  return Boolean(
    dueDate && status !== "done" && dueDate < toRequiredDateOnly(now),
  );
}

function toDateOnly(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  return toRequiredDateOnly(value);
}

function toRequiredDateOnly(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return toDate(value).toISOString().slice(0, 10);
}

function toDateTime(value: Date | string): string {
  return toDate(value).toISOString();
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNumber(value: number | string | { toNumber(): number }): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number(value);
  }
  return value.toNumber();
}
