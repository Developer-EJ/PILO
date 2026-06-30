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
      id: randomUUID(),
      taskId: null,
      payload,
      mode: "mock",
    };
  }
}
