import { Injectable, NotFoundException } from "@nestjs/common";
import {
  WorkspaceAccessPublicService,
  WorkspaceActor,
} from "../workspace/public/workspace-access-public.service";
import {
  parseCreateChecklistItemInput,
  parseUpdateChecklistItemInput,
  type CreateChecklistItemBody,
  type UpdateChecklistItemBody,
} from "./juhyung-checklist-input";
import {
  parseListTasksQuery,
  type ListTasksQuery,
} from "./juhyung-task-list-query";
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
  TaskDetail,
  TaskChecklistItemSummary,
  TaskStatus,
  TaskSummary,
  WorkspaceMemberRecord,
} from "./juhyung-public.types";
import {
  CreateTaskInput,
  JuhyungRepository,
  UpdateTaskInput,
} from "./juhyung.repository";

export type {
  CreateTaskBody,
  UpdateTaskBody,
  UpdateTaskStatusBody,
} from "./juhyung-task-input";
export type {
  CreateChecklistItemBody,
  UpdateChecklistItemBody,
} from "./juhyung-checklist-input";
export type { ListTasksQuery } from "./juhyung-task-list-query";

@Injectable()
export class JuhyungTaskService {
  constructor(
    private readonly repository: JuhyungRepository,
    private readonly workspaceAccess: WorkspaceAccessPublicService,
    private readonly publicAdapter: JuhyungPublicAdapter = new JuhyungPublicAdapter(),
  ) {}

  async listTasks(
    workspaceId: string,
    query: ListTasksQuery = {},
    actor?: WorkspaceActor,
  ): Promise<TaskSummary[]> {
    const options = parseListTasksQuery(query);
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);
    const tasks = await this.repository.listTasksForWorkspace(
      workspaceId,
      options,
    );
    return this.toTaskSummaries(workspaceId, tasks);
  }

  async createTask(
    input: CreateTaskInput,
    actor?: WorkspaceActor,
  ): Promise<TaskRecord>;
  async createTask(
    workspaceId: string,
    body: CreateTaskBody,
    actor?: WorkspaceActor,
  ): Promise<TaskSummary>;
  async createTask(
    workspaceIdOrInput: string | CreateTaskInput,
    bodyOrActor?: CreateTaskBody | WorkspaceActor,
    actor?: WorkspaceActor,
  ): Promise<TaskRecord | TaskSummary> {
    if (typeof workspaceIdOrInput !== "string") {
      return this.createTaskRecord(
        workspaceIdOrInput,
        bodyOrActor as WorkspaceActor | undefined,
      );
    }

    const input = parseCreateTaskInput(
      workspaceIdOrInput,
      bodyOrActor as CreateTaskBody,
    );
    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      workspaceIdOrInput,
      actor,
    );
    const assignee = input.assigneeMemberId
      ? await this.requireWorkspaceMemberById(
          workspaceIdOrInput,
          input.assigneeMemberId,
        )
      : null;
    const task = await this.repository.createTask(input, currentMember.id);

    return this.publicAdapter.toTaskSummary(task, { assignee });
  }

  async getTask(taskId: string, actor?: WorkspaceActor): Promise<TaskDetail> {
    const { task } = await this.requireTaskAccess(taskId, actor);
    const [summary] = await this.toTaskSummaries(task.workspaceId, [task]);
    const checklistItems =
      await this.repository.listChecklistItemsForTask(taskId);
    return {
      ...summary,
      checklistItems: checklistItems.map((item) =>
        this.publicAdapter.toTaskChecklistItemSummary(item),
      ),
    };
  }

  async updateTask(
    taskId: string,
    body: UpdateTaskBody,
    actor?: WorkspaceActor,
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
    actor?: WorkspaceActor,
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

  async deleteTask(taskId: string, actor?: WorkspaceActor): Promise<void> {
    await this.requireTaskAccess(taskId, actor);
    await this.repository.softDeleteTask(taskId);
  }

  async createChecklistItem(
    taskId: string,
    body: CreateChecklistItemBody,
    actor?: WorkspaceActor,
  ): Promise<TaskChecklistItemSummary> {
    const input = parseCreateChecklistItemInput(body);
    await this.requireTaskAccess(taskId, actor);
    const item = await this.repository.createChecklistItem(taskId, input);
    return this.publicAdapter.toTaskChecklistItemSummary(item);
  }

  async updateChecklistItem(
    taskId: string,
    itemId: string,
    body: UpdateChecklistItemBody,
    actor?: WorkspaceActor,
  ): Promise<TaskChecklistItemSummary> {
    const input = parseUpdateChecklistItemInput(body);
    await this.requireTaskAccess(taskId, actor);
    const item = await this.repository.updateChecklistItem(
      taskId,
      itemId,
      input,
    );
    if (!item) {
      throw new NotFoundException("Checklist item was not found");
    }
    return this.publicAdapter.toTaskChecklistItemSummary(item);
  }

  async deleteChecklistItem(
    taskId: string,
    itemId: string,
    actor?: WorkspaceActor,
  ): Promise<void> {
    await this.requireTaskAccess(taskId, actor);
    const result = await this.repository.deleteChecklistItem(taskId, itemId);
    if (result.count === 0) {
      throw new NotFoundException("Checklist item was not found");
    }
  }

  private async createTaskRecord(
    input: CreateTaskInput,
    actor?: WorkspaceActor,
  ): Promise<TaskRecord> {
    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      input.workspaceId,
      actor,
    );
    await this.requireAssignee(input);

    return this.repository.createTask(input, currentMember.id);
  }

  private async requireTaskAccess(taskId: string, actor?: WorkspaceActor) {
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

  private async requireAssignee(input: CreateTaskInput) {
    if (!input.assigneeMemberId) {
      return;
    }

    await this.requireWorkspaceMemberById(
      input.workspaceId,
      input.assigneeMemberId,
    );
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
    return this.requireWorkspaceMemberById(workspaceId, input.assigneeMemberId);
  }

  private async requireWorkspaceMemberById(
    workspaceId: string,
    memberId: string,
  ) {
    if (
      "requireWorkspaceMemberById" in this.workspaceAccess &&
      typeof this.workspaceAccess.requireWorkspaceMemberById === "function"
    ) {
      return this.workspaceAccess.requireWorkspaceMemberById(
        workspaceId,
        memberId,
      );
    }

    return this.workspaceAccess.requireWorkspaceMember(workspaceId, {
      memberId,
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
