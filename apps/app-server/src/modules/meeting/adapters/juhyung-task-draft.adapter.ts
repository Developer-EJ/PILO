import { Injectable } from "@nestjs/common";
import { JuhyungTaskService } from "../../juhyung/juhyung-task.service";
import {
  TaskCreateDraftPayload,
  TaskDraftClient,
  TaskDraftRequestContext,
  TaskDraftResponse,
} from "./task-draft.adapter";

@Injectable()
export class JuhyungTaskDraftClient implements TaskDraftClient {
  constructor(private readonly taskService: JuhyungTaskService) {}

  async createTaskDraft(
    payload: TaskCreateDraftPayload,
    context: TaskDraftRequestContext = {},
  ): Promise<TaskDraftResponse> {
    const draft = await this.taskService.createTaskDraft(
      payload.workspaceId,
      payload,
      context.actor,
    );

    return {
      id: draft.id,
      taskId: draft.taskId,
      payload,
      mode: "owner-api",
    };
  }
}
