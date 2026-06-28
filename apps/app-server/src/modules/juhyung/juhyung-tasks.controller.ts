import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { CurrentActor } from "../workspace/workspace-member-access.service";
import { CreateTaskBody, JuhyungTaskService } from "./juhyung-task.service";

@Controller("api")
export class JuhyungTasksController {
  constructor(private readonly taskService: JuhyungTaskService) {}

  @Get("workspaces/:workspaceId/tasks")
  listTasks(
    @Param("workspaceId") workspaceId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.listTasks(
      workspaceId,
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

  @Get("tasks/:taskId")
  getTask(
    @Param("taskId") taskId: string,
    @Headers("x-user-id") userId?: string | string[],
    @Headers("x-member-id") memberId?: string | string[],
  ) {
    return this.taskService.getTask(taskId, toCurrentActor(userId, memberId));
  }
}

function toCurrentActor(
  userId?: string | string[],
  memberId?: string | string[],
): CurrentActor {
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
