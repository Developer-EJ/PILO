import { Injectable, NotFoundException } from "@nestjs/common";
import {
  CurrentActor,
  WorkspaceMemberAccessService,
} from "../workspace/workspace-member-access.service";
import {
  parseCreateTaskInput,
  parseTaskStatus,
  parseUpdateTaskInput,
  type CreateTaskBody,
  type UpdateTaskBody,
  type UpdateTaskStatusBody,
} from "./juhyung-task-input";
import { JuhyungPublicAdapter } from "./juhyung-public.adapter";
import {
  TaskRecord,
  TaskStatus,
  TaskSummary,
  WorkspaceMemberRecord,
} from "./juhyung-public.types";
import { JuhyungRepository, UpdateTaskInput } from "./juhyung.repository";

export type {
  CreateTaskBody,
  UpdateTaskBody,
  UpdateTaskStatusBody,
} from "./juhyung-task-input";

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
    const { task } = await this.requireTaskAccess(taskId, actor);
    const [summary] = await this.toTaskSummaries(task.workspaceId, [task]);
    return summary;
  }

  async updateTask(
    taskId: string,
    body: UpdateTaskBody,
    actor?: CurrentActor,
  ): Promise<TaskSummary> {
    const input = parseUpdateTaskInput(body);
    const { task } = await this.requireTaskAccess(taskId, actor);
    const assignee = await this.resolveUpdatedAssignee(task.workspaceId, input);
    const updatedTask = await this.repository.updateTask(taskId, input);

    if (assignee !== undefined) {
      return this.publicAdapter.toTaskSummary(updatedTask, { assignee });
    }

    const [summary] = await this.toTaskSummaries(updatedTask.workspaceId, [
      updatedTask,
    ]);
    return summary;
  }

  async updateTaskStatus(
    taskId: string,
    body: UpdateTaskStatusBody,
    actor?: CurrentActor,
  ): Promise<TaskSummary> {
    const status = parseTaskStatus(body);
    const { task, currentMember } = await this.requireTaskAccess(taskId, actor);
    const updatedTask = await this.repository.updateTaskStatus(
      taskId,
      status,
      currentMember.id,
      task.status as TaskStatus,
    );

    const [summary] = await this.toTaskSummaries(updatedTask.workspaceId, [
      updatedTask,
    ]);
    return summary;
  }

  async deleteTask(taskId: string, actor?: CurrentActor): Promise<void> {
    await this.requireTaskAccess(taskId, actor);
    await this.repository.softDeleteTask(taskId);
  }

  private async requireTaskAccess(taskId: string, actor?: CurrentActor) {
    const task = await this.repository.getTaskById(taskId);
    if (!task) {
      throw new NotFoundException("Task was not found");
    }

    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      task.workspaceId,
      actor,
    );
    return { task, currentMember };
  }

  private async resolveUpdatedAssignee(
    workspaceId: string,
    input: UpdateTaskInput,
  ): Promise<WorkspaceMemberRecord | null | undefined> {
    if (!Object.prototype.hasOwnProperty.call(input, "assigneeMemberId")) {
      return undefined;
    }
    if (!input.assigneeMemberId) {
      return null;
    }
    return this.workspaceAccess.requireWorkspaceMember(workspaceId, {
      memberId: input.assigneeMemberId,
    });
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
