import { Injectable } from "@nestjs/common";
import { JuhyungTaskService } from "../juhyung-task.service";
import type { TaskDraftSummary } from "../juhyung-public.types";

export const TASK_DRAFT_PUBLIC_WRITE_ADAPTER = Symbol(
  "TASK_DRAFT_PUBLIC_WRITE_ADAPTER",
);

export interface TaskCreateDraftPayload {
  workspaceId?: unknown;
  sourceType?: unknown;
  sourceId?: unknown;
  title?: unknown;
  description?: unknown;
  assigneeMemberId?: unknown;
  priority?: unknown;
  dueDate?: unknown;
}

export interface TaskDraftPublicWriteRequest {
  workspaceId: string;
  actorMemberId: string;
  payload: TaskCreateDraftPayload;
}

export interface TaskDraftPublicWriteAdapter {
  createTaskDraft(
    request: TaskDraftPublicWriteRequest,
  ): Promise<TaskDraftSummary>;
}

@Injectable()
export class JuhyungTaskDraftPublicWriteAdapter
  implements TaskDraftPublicWriteAdapter
{
  constructor(private readonly taskService: JuhyungTaskService) {}

  createTaskDraft(
    request: TaskDraftPublicWriteRequest,
  ): Promise<TaskDraftSummary> {
    return this.taskService.createTaskDraft(
      request.workspaceId,
      request.payload,
      { memberId: request.actorMemberId },
    );
  }
}
