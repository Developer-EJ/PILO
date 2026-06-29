import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
  parseCreateTaskCommentInput,
  type CreateTaskCommentBody,
} from "./juhyung-comment-input";
import {
  parseCreateTaskDependencyInput,
  type CreateTaskDependencyBody,
} from "./juhyung-dependency-input";
import {
  parseCreateTaskDraftInput,
  type CreateTaskDraftBody,
} from "./juhyung-task-draft-input";
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
  TaskDraftRecord,
  TaskDraftSummary,
  TaskPriority,
  MilestoneSummary,
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
  CreateMilestoneBody,
  UpdateMilestoneBody,
} from "./juhyung-milestone-input";
export type {
  CreateChecklistItemBody,
  UpdateChecklistItemBody,
} from "./juhyung-checklist-input";
export type { CreateTaskCommentBody } from "./juhyung-comment-input";
export type { CreateTaskDependencyBody } from "./juhyung-dependency-input";
export type { CreateTaskDraftBody } from "./juhyung-task-draft-input";
export type { ListTasksQuery } from "./juhyung-task-list-query";

@Injectable()
export class JuhyungTaskService {
  constructor(
    private readonly repository: JuhyungRepository,
    private readonly workspaceAccess: WorkspaceAccessPublicService,
    private readonly publicAdapter: JuhyungPublicAdapter = new JuhyungPublicAdapter(),
  ) {}

  async listMilestones(
    workspaceId: string,
    actor?: WorkspaceActor,
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
    actor?: WorkspaceActor,
  ): Promise<MilestoneSummary> {
    const input = parseCreateMilestoneInput(workspaceId, body);
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);
    const milestone = await this.repository.createMilestone(input);
    return this.publicAdapter.toMilestoneSummary(milestone);
  }

  async updateMilestone(
    milestoneId: string,
    body: UpdateMilestoneBody,
    actor?: WorkspaceActor,
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
    await this.requireMilestoneInWorkspace(
      input.milestoneId,
      workspaceIdOrInput,
    );
    const task = await this.repository.createTask(input, currentMember.id);

    return this.publicAdapter.toTaskSummary(task, { assignee });
  }

  async createTaskDraft(
    workspaceId: string,
    body: CreateTaskDraftBody,
    actor?: WorkspaceActor,
  ): Promise<TaskDraftSummary> {
    const input = parseCreateTaskDraftInput(workspaceId, body);
    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      workspaceId,
      actor,
    );
    if (input.assigneeMemberId) {
      await this.workspaceAccess.requireWorkspaceMember(workspaceId, {
        memberId: input.assigneeMemberId,
      });
    }

    const draft = await this.repository.createTaskDraft(
      input,
      currentMember.id,
    );
    return this.publicAdapter.toTaskDraftSummary(draft);
  }

  async listTaskDrafts(
    workspaceId: string,
    actor?: WorkspaceActor,
  ): Promise<TaskDraftSummary[]> {
    await this.workspaceAccess.requireWorkspaceMember(workspaceId, actor);
    const drafts = await this.repository.listTaskDraftsForWorkspace(
      workspaceId,
    );

    return drafts.map((draft) => this.publicAdapter.toTaskDraftSummary(draft));
  }

  async approveTaskDraft(
    draftId: string,
    actor?: WorkspaceActor,
  ): Promise<TaskDraftSummary> {
    const { draft, currentMember } = await this.requireTaskDraftAccess(
      draftId,
      actor,
    );
    assertDraftIsOpen(draft);
    if (draft.assigneeMemberId) {
      await this.workspaceAccess.requireWorkspaceMember(draft.workspaceId, {
        memberId: draft.assigneeMemberId,
      });
    }

    const approvedDraft = await this.repository.approveTaskDraft(
      draftId,
      {
        workspaceId: draft.workspaceId,
        title: draft.title,
        description: draft.description ?? null,
        assigneeMemberId: draft.assigneeMemberId ?? null,
        status: "todo",
        priority: draft.priority as TaskPriority,
        dueDate: draft.dueDate ?? null,
        milestoneId: null,
      },
      currentMember.id,
    );
    if (!approvedDraft) {
      throw new BadRequestException("Task draft is already closed");
    }
    return this.publicAdapter.toTaskDraftSummary(approvedDraft);
  }

  async rejectTaskDraft(
    draftId: string,
    actor?: WorkspaceActor,
  ): Promise<TaskDraftSummary> {
    const { draft, currentMember } = await this.requireTaskDraftAccess(
      draftId,
      actor,
    );
    assertDraftIsOpen(draft);

    const rejectedDraft = await this.repository.rejectTaskDraft(
      draftId,
      currentMember.id,
    );
    if (!rejectedDraft) {
      throw new BadRequestException("Task draft is already closed");
    }
    return this.publicAdapter.toTaskDraftSummary(rejectedDraft);
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

  async createTaskDependency(
    taskId: string,
    body: CreateTaskDependencyBody,
    actor?: WorkspaceActor,
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
    actor?: WorkspaceActor,
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
    actor?: WorkspaceActor,
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
    actor?: WorkspaceActor,
  ): Promise<TaskCommentSummary[]> {
    const { task } = await this.requireTaskAccess(taskId, actor);
    const comments = await this.repository.listTaskComments(taskId);
    return this.toTaskCommentSummaries(task.workspaceId, comments);
  }

  async listTaskActivityLogs(
    taskId: string,
    actor?: WorkspaceActor,
  ): Promise<TaskActivityLogSummary[]> {
    const { task } = await this.requireTaskAccess(taskId, actor);
    const activityLogs = await this.repository.listTaskActivityLogs(taskId);
    return this.toTaskActivityLogSummaries(task.workspaceId, activityLogs);
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
    await this.requireMilestoneInWorkspace(
      input.milestoneId,
      input.workspaceId,
    );

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

  private async requireTaskDraftAccess(
    draftId: string,
    actor?: WorkspaceActor,
  ) {
    const draft = await this.repository.getTaskDraftById(draftId);
    if (!draft) {
      throw new NotFoundException("Task draft was not found");
    }

    const currentMember = await this.workspaceAccess.requireWorkspaceMember(
      draft.workspaceId,
      actor,
    );
    return { draft, currentMember };
  }

  private async requireMilestoneAccess(
    milestoneId: string,
    actor?: WorkspaceActor,
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

function assertDraftIsOpen(draft: TaskDraftRecord): void {
  if (draft.status !== "draft") {
    throw new BadRequestException("Task draft is already closed");
  }
}
