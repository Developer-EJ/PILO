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
} from "@nestjs/common";
import { CurrentActor } from "../workspace/workspace-member-access.service";
import {
  CreateTaskBody,
  JuhyungTaskService,
  UpdateTaskBody,
  UpdateTaskStatusBody,
} from "./juhyung-task.service";

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
