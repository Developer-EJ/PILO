import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { WorkspaceActor } from "../workspace/public/workspace-access-public.service";
import {
  CreateTaskCommentBody,
  CreateChecklistItemBody,
  CreateGithubIssueForTaskBody,
  CreateTaskDependencyBody,
  CreateTaskDraftBody,
  LinkTaskBody,
  CreateMilestoneBody,
  CreateTaskBody,
  JuhyungTaskService,
  ListTasksQuery,
  UpdateChecklistItemBody,
  UpdateMilestoneBody,
  UpdateTaskBody,
  UpdateTaskStatusBody,
} from "./juhyung-task.service";

@Controller()
export class JuhyungTasksController {
  constructor(private readonly taskService: JuhyungTaskService) {}

  @Get("workspaces/:workspaceId/milestones")
  listMilestones(
    @Param("workspaceId") workspaceId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.listMilestones(
      workspaceId,
      toCurrentActor(userId, memberId),
    );
  }

  @Post("workspaces/:workspaceId/milestones")
  createMilestone(
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateMilestoneBody,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.createMilestone(
      workspaceId,
      body,
      toCurrentActor(userId, memberId),
    );
  }

  @Patch("milestones/:milestoneId")
  updateMilestone(
    @Param("milestoneId") milestoneId: string,
    @Body() body: UpdateMilestoneBody,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.updateMilestone(
      milestoneId,
      body,
      toCurrentActor(userId, memberId),
    );
  }

  @Get("workspaces/:workspaceId/tasks")
  listTasks(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListTasksQuery,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.listTasks(
      workspaceId,
      query,
      toCurrentActor(userId, memberId),
    );
  }

  @Post("workspaces/:workspaceId/tasks")
  createTask(
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateTaskBody,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.createTask(
      workspaceId,
      body,
      toCurrentActor(userId, memberId),
    );
  }

  @Get("workspaces/:workspaceId/task-drafts")
  listTaskDrafts(
    @Param("workspaceId") workspaceId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.listTaskDrafts(
      workspaceId,
      toCurrentActor(userId, memberId),
    );
  }

  @Post("workspaces/:workspaceId/task-drafts")
  createTaskDraft(
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateTaskDraftBody,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.createTaskDraft(
      workspaceId,
      body,
      toCurrentActor(userId, memberId),
    );
  }

  @Post("task-drafts/:draftId/approve")
  approveTaskDraft(
    @Param("draftId") draftId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.approveTaskDraft(
      draftId,
      toCurrentActor(userId, memberId),
    );
  }

  @Post("task-drafts/:draftId/reject")
  rejectTaskDraft(
    @Param("draftId") draftId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.rejectTaskDraft(
      draftId,
      toCurrentActor(userId, memberId),
    );
  }

  @Get("tasks/:taskId")
  getTask(
    @Param("taskId") taskId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.getTask(taskId, toCurrentActor(userId, memberId));
  }

  @Patch("tasks/:taskId")
  updateTask(
    @Param("taskId") taskId: string,
    @Body() body: UpdateTaskBody,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.updateTask(
      taskId,
      body,
      toCurrentActor(userId, memberId),
    );
  }

  @Patch("tasks/:taskId/status")
  updateTaskStatus(
    @Param("taskId") taskId: string,
    @Body() body: UpdateTaskStatusBody,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.updateTaskStatus(
      taskId,
      body,
      toCurrentActor(userId, memberId),
    );
  }

  @Delete("tasks/:taskId")
  @HttpCode(204)
  deleteTask(
    @Param("taskId") taskId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.deleteTask(
      taskId,
      toCurrentActor(userId, memberId),
    );
  }

  @Post("tasks/:taskId/github-issues")
  createGithubIssueFromTask(
    @Param("taskId") taskId: string,
    @Body() body: CreateGithubIssueForTaskBody,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.createGithubIssueFromTask(
      taskId,
      body,
      toCurrentActor(userId, memberId),
    );
  }

  @Post("github/issues/:issueId/link-task")
  linkGithubIssueToTask(
    @Param("issueId") issueId: string,
    @Body() body: LinkTaskBody,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.linkGithubIssueToTask(
      issueId,
      body,
      toCurrentActor(userId, memberId),
    );
  }

  @Post("tasks/:taskId/pull-requests/:pullRequestId")
  linkPullRequestFromTask(
    @Param("taskId") taskId: string,
    @Param("pullRequestId") pullRequestId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.linkPullRequestFromTask(
      taskId,
      pullRequestId,
      toCurrentActor(userId, memberId),
    );
  }

  @Post("github/pull-requests/:pullRequestId/link-task")
  linkPullRequestToTask(
    @Param("pullRequestId") pullRequestId: string,
    @Body() body: LinkTaskBody,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.linkPullRequestToTask(
      pullRequestId,
      body,
      toCurrentActor(userId, memberId),
    );
  }

  @Post("tasks/:taskId/dependencies")
  createTaskDependency(
    @Param("taskId") taskId: string,
    @Body() body: CreateTaskDependencyBody,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.createTaskDependency(
      taskId,
      body,
      toCurrentActor(userId, memberId),
    );
  }

  @Delete("tasks/:taskId/dependencies/:dependsOnTaskId")
  @HttpCode(204)
  deleteTaskDependency(
    @Param("taskId") taskId: string,
    @Param("dependsOnTaskId") dependsOnTaskId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.deleteTaskDependency(
      taskId,
      dependsOnTaskId,
      toCurrentActor(userId, memberId),
    );
  }

  @Post("tasks/:taskId/comments")
  createTaskComment(
    @Param("taskId") taskId: string,
    @Body() body: CreateTaskCommentBody,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.createTaskComment(
      taskId,
      body,
      toCurrentActor(userId, memberId),
    );
  }

  @Get("tasks/:taskId/comments")
  listTaskComments(
    @Param("taskId") taskId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.listTaskComments(
      taskId,
      toCurrentActor(userId, memberId),
    );
  }

  @Get("tasks/:taskId/activity-logs")
  listTaskActivityLogs(
    @Param("taskId") taskId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.listTaskActivityLogs(
      taskId,
      toCurrentActor(userId, memberId),
    );
  }

  @Post("tasks/:taskId/checklist-items")
  createChecklistItem(
    @Param("taskId") taskId: string,
    @Body() body: CreateChecklistItemBody,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.createChecklistItem(
      taskId,
      body,
      toCurrentActor(userId, memberId),
    );
  }

  @Patch("tasks/:taskId/checklist-items/:itemId")
  updateChecklistItem(
    @Param("taskId") taskId: string,
    @Param("itemId") itemId: string,
    @Body() body: UpdateChecklistItemBody,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.updateChecklistItem(
      taskId,
      itemId,
      body,
      toCurrentActor(userId, memberId),
    );
  }

  @Delete("tasks/:taskId/checklist-items/:itemId")
  @HttpCode(204)
  deleteChecklistItem(
    @Param("taskId") taskId: string,
    @Param("itemId") itemId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.deleteChecklistItem(
      taskId,
      itemId,
      toCurrentActor(userId, memberId),
    );
  }
}

function toCurrentActor(
  userId?: string | string[],
  memberId?: string | string[],
): WorkspaceActor {
  const resolvedUserId = firstHeader(userId);
  const resolvedMemberId = firstHeader(memberId);

  return {
    ...(resolvedUserId ? { userId: resolvedUserId } : {}),
    ...(resolvedMemberId ? { memberId: resolvedMemberId } : {}),
  };
}

function firstHeader(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
