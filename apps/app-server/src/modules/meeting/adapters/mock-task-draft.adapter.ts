import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  TaskCreateDraftPayload,
  TaskDraftClient,
  TaskDraftResponse,
} from "./task-draft.adapter";

@Injectable()
export class MockTaskDraftClient implements TaskDraftClient {
  createTaskDraft(payload: TaskCreateDraftPayload): TaskDraftResponse {
    return {
      taskId: randomUUID(),
      payload,
      mode: "mock",
    };
  }
}
