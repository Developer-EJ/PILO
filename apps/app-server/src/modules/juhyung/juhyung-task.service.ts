import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CurrentActor,
  WorkspaceMemberAccessService,
} from "../workspace/workspace-member-access.service";
import {
  parseCreateChecklistItemInput,
  parseUpdateChecklistItemInput,
  type CreateChecklistItemBody,
  type UpdateChecklistItemBody,
} from "./juhyung-checklist-input";
import {
  parseCreateTaskCommentInput,
  type CreateTaskCommentBody,
} from "./juhyung-comment-input";
import {
  parseCreateTaskDependencyInput,
  type CreateTaskDependencyBody,
} from "./juhyung-dependency-input";
import {
  assertMilestoneDateRange,
  parseCreateMilestoneInput,
  parseUpdateMilestoneInput,
  type CreateMilestoneBody,
  type UpdateMilestoneBody,
} from "./juhyung-milestone-input";
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
  TaskActivityLogRecord,
  TaskActivityLogSummary,
  TaskDetail,
  TaskChecklistItemSummary,
  TaskCommentRecord,
  TaskCommentSummary,
  TaskDependencyRecord,
  TaskDependencySummary,
  MilestoneSummary,
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
export type {
  CreateMilestoneBody,
  UpdateMilestoneBody,
} from "./juhyung-milestone-input";
export type {
  CreateChecklistItemBody,
  UpdateChecklistItemBody,
} from "./juhyung-checklist-input";
export type { CreateTaskCommentBody } from "./juhyung-comment-input";
export type { CreateTaskDependencyBody } from "./juhyung-dependency-input";
export type { ListTasksQuery } from "./juhyung-task-list-query";

@Injectable()
export class JuhyungTaskService {
  constructor(
    private readonly repository: JuhyungRepository,
    private readonly workspaceAccess: WorkspaceMemberAccessService,
    private readonly publicAdapter: JuhyungPublicAdapter,
  ) {}

  async listMilestones(
    workspaceId: string,
    actor?: CurrentActor,
  ): Promise<MilestoneSummary[]> {
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);
    const milestones =
      await this.repository.listMilestonesForWorkspace(workspaceId);
    return milestones.map((milestone) =>
      this.publicAdapter.toMilestoneSummary(milestone),
    );
  }

  async createMilestone(
    workspaceId: string,
    body: CreateMilestoneBody,
    actor?: CurrentActor,
  ): Promise<MilestoneSummary> {
    const input = parseCreateMilestoneInput(workspaceId, body);
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);
    const milestone = await this.repository.createMilestone(input);
    return this.publicAdapter.toMilestoneSummary(milestone);
  }

  async updateMilestone(
    milestoneId: string,
    body: UpdateMilestoneBody,
    actor?: CurrentActor,
  ): Promise<MilestoneSummary> {
    const input = parseUpdateMilestoneInput(body);
    const { milestone } = await this.requireMilestoneAccess(milestoneId, actor);
    assertMilestoneDateRange(
      Object.prototype.hasOwnProperty.call(input, "startDate")
        ? input.startDate
        : milestone.startDate,
      Object.prototype.hasOwnProperty.call(input, "endDate")
        ? input.endDate
        : milestone.endDate,
    );

    const updatedMilestone = await this.repository.updateMilestone(
      milestoneId,
      input,
    );
    return this.publicAdapter.toMilestoneSummary(updatedMilestone);
  }

  async listTasks(
    workspaceId: string,
    query: ListTasksQuery = {},
    actor?: CurrentActor,
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
    await this.requireMilestoneInWorkspace(input.milestoneId, workspaceId);
    const task = await this.repository.createTask(input, currentMember.id);

    return this.publicAdapter.toTaskSummary(task, { assignee });
  }

  async getTask(taskId: string, actor?: CurrentActor): Promise<TaskDetail> {
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
    actor?: CurrentActor,
  ): Promise<TaskSummary> {
    const input = parseUpdateTaskInput(body);
    const { task, currentMember } = await this.requireTaskAccess(taskId, actor);
    const assignee = await this.resolveUpdatedAssignee(task.workspaceId, input);
    await this.resolveUpdatedMilestone(task.workspaceId, input);
    const updatedTask = await this.repository.updateTask(
      taskId,
      input,
      currentMember.id,
      task,
    );

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

  async createTaskDependency(
    taskId: string,
    body: CreateTaskDependencyBody,
    actor?: CurrentActor,
  ): Promise<TaskDependencySummary> {
    const input = parseCreateTaskDependencyInput(body);
    const { task } = await this.requireTaskAccess(taskId, actor);
    if (taskId === input.dependsOnTaskId) {
      throw new BadRequestException("Task cannot depend on itself");
    }

    const dependsOnTask = await this.repository.getTaskById(
      input.dependsOnTaskId,
    );
    if (!dependsOnTask || dependsOnTask.workspaceId !== task.workspaceId) {
      throw new NotFoundException("Dependency target task was not found");
    }

    const existingDependency = await this.repository.getTaskDependency(
      taskId,
      input.dependsOnTaskId,
    );
    if (existingDependency) {
      throw new BadRequestException("Task dependency already exists");
    }

    const workspaceDependencies =
      await this.repository.listTaskDependenciesForWorkspace(task.workspaceId);
    if (
      wouldCreateTaskDependencyCycle(
        taskId,
        input.dependsOnTaskId,
        workspaceDependencies,
      )
    ) {
      throw new BadRequestException("Task dependency cycle is not allowed");
    }

    const dependency = await this.repository.createTaskDependency(
      taskId,
      input.dependsOnTaskId,
    );
    return this.publicAdapter.toTaskDependencySummary(dependency);
  }

  async deleteTaskDependency(
    taskId: string,
    dependsOnTaskId: string,
    actor?: CurrentActor,
  ): Promise<void> {
    await this.requireTaskAccess(taskId, actor);
    const result = await this.repository.deleteTaskDependency(
      taskId,
      dependsOnTaskId,
    );
    if (result.count === 0) {
      throw new NotFoundException("Task dependency was not found");
    }
  }

  async createTaskComment(
    taskId: string,
    body: CreateTaskCommentBody,
    actor?: CurrentActor,
  ): Promise<TaskCommentSummary> {
    const input = parseCreateTaskCommentInput(body);
    const { currentMember } = await this.requireTaskAccess(taskId, actor);
    const comment = await this.repository.createTaskComment(
      taskId,
      input,
      currentMember.id,
    );
    return this.publicAdapter.toTaskCommentSummary(comment, {
      author: currentMember,
    });
  }

  async listTaskComments(
    taskId: string,
    actor?: CurrentActor,
  ): Promise<TaskCommentSummary[]> {
    const { task } = await this.requireTaskAccess(taskId, actor);
    const comments = await this.repository.listTaskComments(taskId);
    return this.toTaskCommentSummaries(task.workspaceId, comments);
  }

  async listTaskActivityLogs(
    taskId: string,
    actor?: CurrentActor,
  ): Promise<TaskActivityLogSummary[]> {
    const { task } = await this.requireTaskAccess(taskId, actor);
    const activityLogs = await this.repository.listTaskActivityLogs(taskId);
    return this.toTaskActivityLogSummaries(task.workspaceId, activityLogs);
  }

  async createChecklistItem(
    taskId: string,
    body: CreateChecklistItemBody,
    actor?: CurrentActor,
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
    actor?: CurrentActor,
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
    actor?: CurrentActor,
  ): Promise<void> {
    await this.requireTaskAccess(taskId, actor);
    const result = await this.repository.deleteChecklistItem(taskId, itemId);
    if (result.count === 0) {
      throw new NotFoundException("Checklist item was not found");
    }
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

  private async requireMilestoneAccess(
    milestoneId: string,
    actor?: CurrentActor,
  ) {
    const milestone = await this.repository.getMilestoneById(milestoneId);
    if (!milestone) {
      throw new NotFoundException("Milestone was not found");
    }

    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      milestone.workspaceId,
      actor,
    );
    return { milestone, currentMember };
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

  private async resolveUpdatedMilestone(
    workspaceId: string,
    input: UpdateTaskInput,
  ): Promise<void> {
    if (!Object.prototype.hasOwnProperty.call(input, "milestoneId")) {
      return;
    }
    await this.requireMilestoneInWorkspace(input.milestoneId, workspaceId);
  }

  private async requireMilestoneInWorkspace(
    milestoneId: string | null | undefined,
    workspaceId: string,
  ): Promise<void> {
    if (!milestoneId) {
      return;
    }
    const milestone = await this.repository.getMilestoneById(milestoneId);
    if (!milestone || milestone.workspaceId !== workspaceId) {
      throw new NotFoundException("Milestone was not found");
    }
  }

  private async toTaskSummaries(
    workspaceId: string,
    tasks: TaskRecord[],
  ): Promise<TaskSummary[]> {
    const memberById = await this.loadWorkspaceMemberMap(
      workspaceId,
      tasks.flatMap((task) =>
        task.assigneeMemberId ? [task.assigneeMemberId] : [],
      ),
    );

    return tasks.map((task) =>
      this.publicAdapter.toTaskSummary(task, {
        assignee: task.assigneeMemberId
          ? (memberById.get(task.assigneeMemberId) ?? null)
          : null,
      }),
    );
  }

  private async toTaskCommentSummaries(
    workspaceId: string,
    comments: TaskCommentRecord[],
  ): Promise<TaskCommentSummary[]> {
    const memberById = await this.loadWorkspaceMemberMap(
      workspaceId,
      comments.flatMap((comment) =>
        comment.authorMemberId ? [comment.authorMemberId] : [],
      ),
    );

    return comments.map((comment) =>
      this.publicAdapter.toTaskCommentSummary(comment, {
        author: comment.authorMemberId
          ? (memberById.get(comment.authorMemberId) ?? null)
          : null,
      }),
    );
  }

  private async toTaskActivityLogSummaries(
    workspaceId: string,
    activityLogs: TaskActivityLogRecord[],
  ): Promise<TaskActivityLogSummary[]> {
    const memberById = await this.loadWorkspaceMemberMap(
      workspaceId,
      activityLogs.flatMap((activityLog) =>
        activityLog.actorMemberId ? [activityLog.actorMemberId] : [],
      ),
    );

    return activityLogs.map((activityLog) =>
      this.publicAdapter.toTaskActivityLogSummary(activityLog, {
        actor: activityLog.actorMemberId
          ? (memberById.get(activityLog.actorMemberId) ?? null)
          : null,
      }),
    );
  }

  private async loadWorkspaceMemberMap(
    workspaceId: string,
    memberIds: string[],
  ): Promise<Map<string, WorkspaceMemberRecord>> {
    const uniqueMemberIds = [...new Set(memberIds)];
    if (uniqueMemberIds.length === 0) {
      return new Map();
    }

    const members = await this.repository.listWorkspaceMembersByIds(
      workspaceId,
      uniqueMemberIds,
    );
    return new Map(
      members.map((member) => [member.id, member as WorkspaceMemberRecord]),
    );
  }
}

function wouldCreateTaskDependencyCycle(
  taskId: string,
  dependsOnTaskId: string,
  dependencies: TaskDependencyRecord[],
): boolean {
  const dependencyByTaskId = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const existing = dependencyByTaskId.get(dependency.taskId) ?? [];
    existing.push(dependency.dependsOnTaskId);
    dependencyByTaskId.set(dependency.taskId, existing);
  }

  const visited = new Set<string>();
  const stack = [dependsOnTaskId];
  while (stack.length > 0) {
    const currentTaskId = stack.pop() as string;
    if (currentTaskId === taskId) {
      return true;
    }
    if (visited.has(currentTaskId)) {
      continue;
    }
    visited.add(currentTaskId);
    stack.push(...(dependencyByTaskId.get(currentTaskId) ?? []));
  }
  return false;
}
