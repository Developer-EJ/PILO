import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { DatabaseService } from "../database/database.service";

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
  status: "todo" | "in_progress" | "in_review" | "done" | "blocked";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate: Date | string | null;
  milestoneId: string | null;
}

@Injectable()
export class JuhyungRepository {
  constructor(private readonly database: DatabaseService) {}

  listTasksForWorkspace(workspaceId: string) {
    return this.database.task.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
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
}
