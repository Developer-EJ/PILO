import { Injectable } from "@nestjs/common";
import {
  WorkspaceAccessPublicService,
  WorkspaceActor,
} from "../workspace/public/workspace-access-public.service";
import { JuhyungPublicAdapter } from "./juhyung-public.adapter";
import {
  ProgressSnapshotSummary,
  ProgressSummary,
  TaskRecord,
} from "./juhyung-public.types";
import { JuhyungRepository } from "./juhyung.repository";

@Injectable()
export class JuhyungProgressService {
  constructor(
    private readonly repository: JuhyungRepository,
    private readonly workspaceAccess: WorkspaceAccessPublicService,
    private readonly publicAdapter: JuhyungPublicAdapter = new JuhyungPublicAdapter(),
  ) {}

  async getProgressSummary(
    workspaceId: string,
    actor?: WorkspaceActor,
  ): Promise<ProgressSummary> {
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);
    const tasks = await this.repository.listTasksForWorkspace(workspaceId);

    return this.publicAdapter.toProgressSummary(
      buildProgressSummary(workspaceId, tasks, new Date()),
    );
  }

  async listProgressHistory(
    workspaceId: string,
    actor?: WorkspaceActor,
  ): Promise<ProgressSnapshotSummary[]> {
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);
    const snapshots =
      await this.repository.listProgressSnapshotsForWorkspace(workspaceId);

    return snapshots.map((snapshot) =>
      this.publicAdapter.toProgressSnapshotSummary(snapshot),
    );
  }
}

function buildProgressSummary(
  workspaceId: string,
  tasks: TaskRecord[],
  now: Date,
) {
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((task) => task.status === "done").length;
  const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
  const reviewTasks = tasks.filter(
    (task) => task.status === "in_review",
  ).length;
  const today = now.toISOString().slice(0, 10);
  const delayedTasks = tasks.filter((task) => {
    const dueDate = toDateOnly(task.dueDate ?? null);

    return Boolean(dueDate && task.status !== "done" && dueDate < today);
  }).length;

  return {
    workspaceId,
    milestoneId: null,
    totalTasks,
    doneTasks,
    blockedTasks,
    reviewTasks,
    delayedTasks,
    progressRate: totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0,
    capturedAt: now,
  };
}

function toDateOnly(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return (value instanceof Date ? value : new Date(value))
    .toISOString()
    .slice(0, 10);
}
