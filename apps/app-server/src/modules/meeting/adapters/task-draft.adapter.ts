import type { WorkspaceActor } from "../../workspace/public/workspace-access-public.service";

export const TASK_DRAFT_CLIENT = Symbol("TASK_DRAFT_CLIENT");

export type TaskDraftPriority = "low" | "medium" | "high" | "urgent";

export interface TaskCreateDraftPayload {
  workspaceId: string;
  sourceType: "meeting_action_item";
  sourceId: string;
  title: string;
  description: string | null;
  assigneeMemberId: string | null;
  priority: TaskDraftPriority;
  dueDate: string | null;
}

export interface TaskDraftResponse {
  id: string;
  taskId: string | null;
  payload: TaskCreateDraftPayload;
  mode: "mock" | "owner-api";
}

export interface TaskDraftRequestContext {
  actor?: WorkspaceActor;
}

export interface TaskDraftClient {
  createTaskDraft(
    payload: TaskCreateDraftPayload,
    context?: TaskDraftRequestContext,
  ): TaskDraftResponse | Promise<TaskDraftResponse>;
}
